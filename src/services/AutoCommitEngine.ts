import * as vscode from 'vscode';
import * as path from 'path';
import type { Change, Repository } from '../types/git';
import { loadCommitlyConfig, type CommitlyConfig } from './config';
import { CommitService } from './CommitService';
import type { AutoCommitReason } from './types';
import { shouldSkipDueToDiagnostics } from './diagnostics';
import { StatusBar } from '../ui/StatusBar';

type WindowCounters = {
  windowStartMs: number;
  changedFilePaths: Set<string>;
  approxChangedLines: number;
};

export class AutoCommitEngine implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private config: CommitlyConfig;
  private readonly commitService: CommitService;

  private idleTimer: NodeJS.Timeout | undefined;
  private pendingReason: AutoCommitReason | undefined;
  private counters: WindowCounters = {
    windowStartMs: Date.now(),
    changedFilePaths: new Set<string>(),
    approxChangedLines: 0,
  };
  private lastAutoCommitAtMs: number | undefined;

  constructor(
    private readonly repo: Repository,
    private readonly statusBar: StatusBar
  ) {
    this.commitService = new CommitService(repo);
    this.config = loadCommitlyConfig(repo.rootUri);

    this.statusBar.setEnabled(this.config.autoCommit);
    this.statusBar.setText('Commitly: watching');

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('commitly')) return;
        this.config = loadCommitlyConfig(this.repo.rootUri);
        this.statusBar.setEnabled(this.config.autoCommit);
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
        void this.maybeCommit('closeAllEditors');
      }),
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (!this.config.autoCommit) return;
        if (!this.config.triggers.testPass) return;
        if (e.exitCode !== 0) return;
        const name = e.execution.task.name.toLowerCase();
        if (!this.config.testTaskNameIncludes.some((s) => name.includes(s)))
          return;
        void this.maybeCommit('testPass');
      }),
      this.repo.state.onDidChange(() => {
        if (!this.config.autoCommit) return;
        if (!this.config.triggers.branchSwitch) return;
        // VS Code Git API fires state changes around checkout; repo.onDidCheckout is not always present.
      }),
      this.repo.onDidCheckout(() => {
        if (!this.config.autoCommit) return;
        if (!this.config.triggers.branchSwitch) return;
        void this.maybeCommit('branchSwitch');
      }),
      this.repo.onDidCommit(() => {
        // Keep status bar fresh even if commit wasn't made by us.
        this.statusBar.setText('Commitly: watching');
      })
    );

    this.resetIdleTimer();
  }

  dispose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
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

    if (this.config.triggers.saveBurst) {
      // Save burst is implemented as: reset idle timer and check thresholds on save.
      if (kind === 'save') void this.maybeCommit('saveBurst');
    }

    if (
      this.config.triggers.thresholds &&
      (this.counters.changedFilePaths.size >= this.config.fileChangeThreshold ||
        this.counters.approxChangedLines >= this.config.lineChangeThreshold)
    ) {
      void this.maybeCommit('threshold');
    }
  }

  private rollWindowIfNeeded() {
    const now = Date.now();
    const ageSec = (now - this.counters.windowStartMs) / 1000;
    if (ageSec < this.config.groupChangesWithinSec) return;
    this.counters = {
      windowStartMs: now,
      changedFilePaths: new Set<string>(),
      approxChangedLines: 0,
    };
  }

  private resetIdleTimer() {
    if (!this.config.autoCommit) return;
    if (!this.config.triggers.idle) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.maybeCommit('idle');
    }, this.config.idleThresholdSec * 1000);
  }

  private async maybeCommit(
    reason: AutoCommitReason,
    opts?: { force?: boolean }
  ) {
    if (!this.config.autoCommit && !opts?.force) return;

    // Debounce overlapping triggers: keep strongest "reason" around and commit once.
    this.pendingReason = this.pendingReason ?? reason;
    const effectiveReason = this.pendingReason;
    this.pendingReason = undefined;

    if (vscode.workspace.textDocuments.some((d) => d.isDirty)) {
      this.statusBar.setText('Commitly: waiting (unsaved files)');
      return;
    }

    const changes = this.getEligibleChanges();
    if (changes.length === 0) {
      this.statusBar.setText('Commitly: clean');
      return;
    }

    if (this.repo.state.mergeChanges.length > 0) {
      this.statusBar.setText('Commitly: waiting (merge conflicts)');
      return;
    }

    const hasErrors = shouldSkipDueToDiagnostics(
      changes.map((c) => c.uri),
      this.config.blockOnDiagnostics
    );
    if (hasErrors) {
      this.statusBar.setText('Commitly: waiting (problems found)');
      return;
    }

    const message = await this.commitService.generateMessage(
      effectiveReason,
      changes
    );

    if (!opts?.force) {
      const ok = await this.commitService.branchRelevanceOk(
        message,
        this.config.branchRelevance
      );
      if (!ok) {
        this.statusBar.setText('Commitly: waiting (branch mismatch)');
        return;
      }
    }

    this.statusBar.setText(`Commitly: committing (${effectiveReason})…`);
    try {
      await this.commitService.commit(message, changes, {
        pushAfterCommit: this.config.pushAfterCommit,
        pushStrategy: this.config.pushStrategy,
      });
      this.lastAutoCommitAtMs = Date.now();
      this.statusBar.setText('Commitly: auto-committed');
      this.counters = {
        windowStartMs: Date.now(),
        changedFilePaths: new Set<string>(),
        approxChangedLines: 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.statusBar.setText('Commitly: failed');
      void vscode.window.showWarningMessage(`Commitly: auto-commit failed: ${msg}`);
    } finally {
      this.resetIdleTimer();
    }
  }

  private getEligibleChanges(): Change[] {
    const ignores = this.config.ignorePatterns;
    const inWorkingTree = this.repo.state.workingTreeChanges.filter((c) =>
      this.isEligiblePath(c.uri.fsPath, ignores)
    );
    const inIndex = this.repo.state.indexChanges.filter((c) =>
      this.isEligiblePath(c.uri.fsPath, ignores)
    );
    // Keep already-staged changes (indexChanges) + stage working tree tracked changes.
    const all = [...inIndex, ...inWorkingTree];
    // Deduplicate by final uri path.
    const uniq = new Map<string, Change>();
    for (const c of all) uniq.set(c.uri.fsPath, c);
    return [...uniq.values()];
  }

  private isEligiblePath(fsPath: string, ignorePatterns: string[]): boolean {
    if (!this.isInRepo(fsPath)) return false;
    const rel = path.relative(this.repo.rootUri.fsPath, fsPath);
    if (!rel || rel.startsWith('..')) return false;
    if (rel === '.commitlyrc') return true;
    return !ignorePatterns.some((p) => matchesSimpleGlob(rel, p));
  }
}

function estimateChangedLines(
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): number {
  let lines = 0;
  for (const c of changes) {
    const touched = Math.max(1, c.range.end.line - c.range.start.line + 1);
    const inserted = c.text ? c.text.split('\n').length : 0;
    lines += Math.max(touched, inserted);
  }
  return lines;
}

function matchesSimpleGlob(relPath: string, pattern: string): boolean {
  // Very small glob: supports "*" (no path separator), and "*.ext".
  if (pattern === relPath) return true;
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    return relPath.endsWith(pattern.slice(1));
  }
  if (pattern.includes('*')) {
    const [a, b] = pattern.split('*');
    return relPath.startsWith(a) && relPath.endsWith(b ?? '');
  }
  return false;
}

