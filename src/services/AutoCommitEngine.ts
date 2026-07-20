import * as vscode from 'vscode';
import * as path from 'path';
import type { Change, Repository } from '../types/git';
import { loadCommitlyConfig, type CommitlyConfig } from './config';
import { CommitService } from './CommitService';
import type { AutoCommitReason } from './types';
import { shouldSkipDueToDiagnostics } from './diagnostics';
import { isEligibleRel } from './glob';
import { estimateChangedLines } from './changeEstimate';
import { CommitMessageService } from './ai/CommitMessageService';

export interface EngineStatusState {
  enabled: boolean;
  text: string;
}

export interface EngineDeps {
  context: vscode.ExtensionContext;
  log: vscode.OutputChannel;
  reportStatus: (state: EngineStatusState) => void;
  requestAiConsent: () => void;
}

type WindowCounters = {
  windowStartMs: number;
  changedFilePaths: Set<string>;
  approxChangedLines: number;
};

// Strongest-wins priority when several triggers fire within the debounce window.
const REASON_PRIORITY: AutoCommitReason[] = [
  'manual',
  'testPass',
  'threshold',
  'closeAllEditors',
  'idle',
  'saveBurst',
];

const DEBOUNCE_MS = 1500;

export class AutoCommitEngine implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private config: CommitlyConfig;
  private readonly commitService: CommitService;
  private readonly commitMessageService: CommitMessageService;

  private idleTimer: NodeJS.Timeout | undefined;
  private commitTimer: NodeJS.Timeout | undefined;
  private readonly pendingReasons = new Set<AutoCommitReason>();

  private isCommitting = false;
  private rerunRequested = false;

  private statusText = 'Commitly: watching';
  private counters: WindowCounters = {
    windowStartMs: Date.now(),
    changedFilePaths: new Set<string>(),
    approxChangedLines: 0,
  };
  private lastAutoCommitAtMs: number | undefined;

  constructor(
    private readonly repo: Repository,
    private readonly deps: EngineDeps
  ) {
    this.commitService = new CommitService(repo);
    this.config = loadCommitlyConfig(repo.rootUri);
    this.commitMessageService = new CommitMessageService({
      repo,
      secrets: deps.context.secrets,
      globalState: deps.context.globalState,
      machineId: vscode.env.machineId,
      version: String(deps.context.extension.packageJSON.version ?? '0.0.0'),
      getConfig: () => this.config,
      log: (m) => this.log(m),
      onNeedConsent: () => this.deps.requestAiConsent(),
    });
    this.setStatus('Commitly: watching');

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('commitly')) return;
        this.config = loadCommitlyConfig(this.repo.rootUri);
        this.setStatus(this.statusText);
        this.resetIdleTimer();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.isInRepo(e.document.uri.fsPath)) return;
        this.onWorkEvent('edit', e.document.uri.fsPath, e.contentChanges);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!this.isInRepo(doc.uri.fsPath)) return;
        this.onWorkEvent('save', doc.uri.fsPath);
      }),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        if (!this.config.autoCommit) return;
        if (!this.config.triggers.closeAllEditors) return;
        if (editors.length !== 0) return;
        this.scheduleCommit('closeAllEditors');
      }),
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (!this.config.autoCommit) return;
        if (!this.config.triggers.testPass) return;
        if (e.exitCode !== 0) return;
        const name = e.execution.task.name.toLowerCase();
        if (!this.config.testTaskNameIncludes.some((s) => name.includes(s)))
          return;
        this.scheduleCommit('testPass');
      }),
      this.repo.onDidCommit(() => {
        // Keep status fresh even if the commit wasn't made by us.
        this.setStatus('Commitly: watching');
      })
    );

    this.resetIdleTimer();
  }

  dispose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.commitTimer) clearTimeout(this.commitTimer);
    for (const d of this.disposables) d.dispose();
  }

  getStatus(): string {
    const head = this.repo.state.HEAD?.name ?? '(detached)';
    const enabled = this.config.autoCommit ? 'enabled' : 'disabled';
    const last =
      this.lastAutoCommitAtMs !== undefined
        ? `${Math.round((Date.now() - this.lastAutoCommitAtMs) / 1000)}s ago`
        : 'never';
    const files = this.counters.changedFilePaths.size;
    const lines = this.counters.approxChangedLines;
    return `Commitly: ${enabled} • branch ${head} • pending ${files} files / ~${lines} lines • last auto-commit ${last}`;
  }

  async commitNow(reason: AutoCommitReason) {
    await this.maybeCommit(reason, { force: true });
  }

  private setStatus(text: string) {
    this.statusText = text;
    this.deps.reportStatus({ enabled: this.config.autoCommit, text });
  }

  private isInRepo(fsPath: string): boolean {
    return fsPath.startsWith(this.repo.rootUri.fsPath + path.sep);
  }

  private onWorkEvent(
    kind: 'edit' | 'save',
    fsPath: string,
    contentChanges?: readonly vscode.TextDocumentContentChangeEvent[]
  ) {
    if (!this.config.autoCommit) return;

    this.resetIdleTimer();
    this.rollWindowIfNeeded();

    this.counters.changedFilePaths.add(fsPath);
    if (kind === 'edit' && contentChanges) {
      this.counters.approxChangedLines += estimateChangedLines(contentChanges);
    }

    if (kind === 'save' && this.config.triggers.saveBurst) {
      // Debounced: a burst of saves collapses into a single scheduled commit.
      this.scheduleCommit('saveBurst');
    }

    if (
      this.config.triggers.thresholds &&
      (this.counters.changedFilePaths.size >= this.config.fileChangeThreshold ||
        this.counters.approxChangedLines >= this.config.lineChangeThreshold)
    ) {
      this.scheduleCommit('threshold');
    }
  }

  private rollWindowIfNeeded() {
    const now = Date.now();
    const ageSec = (now - this.counters.windowStartMs) / 1000;
    if (ageSec < this.config.groupChangesWithinSec) return;
    this.resetCounters();
  }

  private resetCounters() {
    this.counters = {
      windowStartMs: Date.now(),
      changedFilePaths: new Set<string>(),
      approxChangedLines: 0,
    };
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!this.config.autoCommit) return;
    if (!this.config.triggers.idle) return;
    this.idleTimer = setTimeout(() => {
      this.scheduleCommit('idle');
    }, this.config.idleThresholdSec * 1000);
  }

  /**
   * Coalesce overlapping triggers into a single commit. Repeated calls within
   * the debounce window keep the strongest reason and re-arm the timer.
   */
  private scheduleCommit(reason: AutoCommitReason) {
    if (!this.config.autoCommit) return;
    this.pendingReasons.add(reason);
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      this.commitTimer = undefined;
      const strongest = this.takeStrongestReason();
      if (strongest) void this.maybeCommit(strongest);
    }, DEBOUNCE_MS);
  }

  private takeStrongestReason(): AutoCommitReason | undefined {
    for (const r of REASON_PRIORITY) {
      if (this.pendingReasons.has(r)) {
        this.pendingReasons.clear();
        return r;
      }
    }
    const first = this.pendingReasons.values().next().value;
    this.pendingReasons.clear();
    return first;
  }

  private async maybeCommit(
    reason: AutoCommitReason,
    opts?: { force?: boolean }
  ) {
    if (!this.config.autoCommit && !opts?.force) return;

    // Serialize: never let two commit passes overlap.
    if (this.isCommitting) {
      this.rerunRequested = true;
      return;
    }
    this.isCommitting = true;
    try {
      await this.runCommit(reason, opts);
    } catch (err) {
      this.log(`commit pass failed: ${errText(err)}`);
    } finally {
      this.isCommitting = false;
      this.resetIdleTimer();
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.scheduleCommit(reason);
      }
    }
  }

  private async runCommit(
    reason: AutoCommitReason,
    opts?: { force?: boolean }
  ) {
    const force = opts?.force === true;

    // Repo-scoped unsaved guard: unsaved files in *other* repos are irrelevant.
    const dirty = vscode.workspace.textDocuments
      .filter((d) => this.isInRepo(d.uri.fsPath))
      .some((d) => d.isDirty);
    if (dirty) {
      this.setStatus('Commitly: waiting (unsaved files)');
      return;
    }

    // On the automatic path, back off when the user has staged changes of
    // their own so we never clobber a hand-crafted partial commit.
    if (!force && this.repo.state.indexChanges.length > 0) {
      this.setStatus('Commitly: waiting (staged changes present)');
      return;
    }

    if (this.repo.state.mergeChanges.length > 0) {
      this.setStatus('Commitly: waiting (merge conflicts)');
      return;
    }

    const changes = this.getEligibleChanges(force);
    if (changes.length === 0) {
      this.setStatus('Commitly: clean');
      return;
    }

    const hasErrors = shouldSkipDueToDiagnostics(
      changes.map((c) => c.uri),
      this.config.blockOnDiagnostics
    );
    if (hasErrors) {
      this.setStatus('Commitly: waiting (problems found)');
      return;
    }

    let message = await this.commitMessageService.generate({ reason, changes });

    if (!force && this.config.branchRelevance) {
      const ok = await this.commitService.branchRelevanceOk(message, true);
      if (!ok) {
        // The message type conflicts with the branch intent; fall back to the
        // branch-derived heuristic (which passes by construction) rather than
        // skipping the commit entirely.
        message = await this.commitService.generateMessage(reason, changes);
      }
    }

    this.setStatus(`Commitly: committing (${reason})…`);
    try {
      await this.commitService.commit(message, changes, {
        pushAfterCommit: this.config.pushAfterCommit,
        pushStrategy: this.config.pushStrategy,
      });
      this.lastAutoCommitAtMs = Date.now();
      this.setStatus('Commitly: auto-committed');
      this.resetCounters();
    } catch (err) {
      this.setStatus('Commitly: failed');
      this.log(`auto-commit failed: ${errText(err)}`);
      void vscode.window.showWarningMessage(
        `Commitly: auto-commit failed: ${errText(err)}`
      );
    }
  }

  private getEligibleChanges(includeIndex: boolean): Change[] {
    const ignores = this.config.ignorePatterns;
    const wt = this.repo.state.workingTreeChanges.filter((c) =>
      this.isEligiblePath(c.uri.fsPath, ignores)
    );
    const uniq = new Map<string, Change>();
    if (includeIndex) {
      for (const c of this.repo.state.indexChanges) {
        if (this.isEligiblePath(c.uri.fsPath, ignores)) uniq.set(c.uri.fsPath, c);
      }
    }
    for (const c of wt) uniq.set(c.uri.fsPath, c);
    return [...uniq.values()];
  }

  private isEligiblePath(fsPath: string, ignorePatterns: string[]): boolean {
    if (!this.isInRepo(fsPath)) return false;
    const rel = path.relative(this.repo.rootUri.fsPath, fsPath);
    return isEligibleRel(rel, ignorePatterns);
  }

  private log(message: string) {
    this.deps.log.appendLine(
      `[${path.basename(this.repo.rootUri.fsPath)}] ${message}`
    );
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
