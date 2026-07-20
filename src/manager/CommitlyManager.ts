import * as vscode from 'vscode';
import * as path from 'path';
import type { API, Repository } from '../types/git';
import {
  AutoCommitEngine,
  type EngineStatusState,
} from '../services/AutoCommitEngine';
import { AI_CONSENT_KEY } from '../services/ai/CommitMessageService';
import { StatusBar } from '../ui/StatusBar';

export class CommitlyManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly engines = new Map<string, AutoCommitEngine>();
  private readonly statuses = new Map<string, EngineStatusState>();
  private readonly statusBar: StatusBar;
  private readonly log: vscode.OutputChannel;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly git: API
  ) {
    this.statusBar = new StatusBar();
    this.log = vscode.window.createOutputChannel('Commitly');
    this.disposables.push(this.statusBar, this.log);

    this.syncRepos();
    this.disposables.push(
      this.git.onDidOpenRepository(() => this.syncRepos()),
      this.git.onDidCloseRepository(() => this.syncRepos()),
      vscode.window.onDidChangeActiveTextEditor(() => this.renderStatus())
    );
    this.renderStatus();
  }

  dispose() {
    for (const engine of this.engines.values()) engine.dispose();
    this.engines.clear();
    for (const d of this.disposables) d.dispose();
  }

  async commitNow() {
    const repo = this.pickRepo();
    if (!repo) return;
    await this.engines.get(repo.rootUri.fsPath)?.commitNow('manual');
  }

  async toggleAutoCommit() {
    const config = vscode.workspace.getConfiguration('commitly');
    const current = config.get<boolean>('autoCommit', true);
    await config.update(
      'autoCommit',
      !current,
      vscode.ConfigurationTarget.Workspace
    );
    // Engines react to the configuration change and report status upward.
  }

  async showStatus() {
    const repo = this.pickRepo();
    if (!repo) return;
    const engine = this.engines.get(repo.rootUri.fsPath);
    if (!engine) return;
    await vscode.window.showInformationMessage(engine.getStatus());
  }

  private pickRepo(): Repository | undefined {
    const repos = this.git.repositories;
    if (repos.length === 1) return repos[0];
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const match = repos.find((r) =>
        activeEditor.document.uri.fsPath.startsWith(r.rootUri.fsPath)
      );
      if (match) return match;
    }
    return repos[0];
  }

  private aiConsentInFlight = false;

  private async requestAiConsent() {
    if (this.aiConsentInFlight) return;
    const current = this.context.globalState.get<string>(AI_CONSENT_KEY);
    if (current === 'granted' || current === 'denied') return;
    this.aiConsentInFlight = true;
    try {
      const choice = await vscode.window.showInformationMessage(
        'Commitly can write your commit messages with AI. On the free tier your changed diff is sent to the Commitly proxy (obvious secrets are redacted first, nothing is stored). Enable it? You can always add your own Groq key for a better model.',
        'Enable free AI',
        'Heuristic only'
      );
      if (choice === 'Enable free AI') {
        await this.context.globalState.update(AI_CONSENT_KEY, 'granted');
      } else if (choice === 'Heuristic only') {
        await this.context.globalState.update(AI_CONSENT_KEY, 'denied');
      }
      // Dismissed → leave unset so we can ask again next session.
    } finally {
      this.aiConsentInFlight = false;
    }
  }

  private onEngineStatus(repoRoot: string, state: EngineStatusState) {
    this.statuses.set(repoRoot, state);
    this.renderStatus();
  }

  private renderStatus() {
    const repos = this.git.repositories;
    if (repos.length === 0) {
      this.statusBar.render('Commitly', false);
      return;
    }
    const active = this.pickRepo();
    const state = active ? this.statuses.get(active.rootUri.fsPath) : undefined;

    if (repos.length > 1) {
      if (state && active) {
        const name = path.basename(active.rootUri.fsPath);
        this.statusBar.render(`${state.text} · ${name}`, state.enabled);
      } else {
        this.statusBar.render(`Commitly: ${repos.length} repos`, true);
      }
      return;
    }

    if (state) this.statusBar.render(state.text, state.enabled);
    else this.statusBar.render('Commitly', true);
  }

  private syncRepos() {
    const live = new Set(this.git.repositories.map((r) => r.rootUri.fsPath));
    for (const [key, engine] of this.engines) {
      if (!live.has(key)) {
        engine.dispose();
        this.engines.delete(key);
        this.statuses.delete(key);
      }
    }
    for (const repo of this.git.repositories) {
      const key = repo.rootUri.fsPath;
      if (this.engines.has(key)) continue;
      const engine = new AutoCommitEngine(repo, {
        context: this.context,
        log: this.log,
        reportStatus: (s) => this.onEngineStatus(key, s),
        requestAiConsent: () => void this.requestAiConsent(),
      });
      this.engines.set(key, engine);
    }
    this.renderStatus();
  }
}
