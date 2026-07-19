import * as vscode from 'vscode';
import type { API, Repository } from '../types/git';
import { AutoCommitEngine } from '../services/AutoCommitEngine';
import { StatusBar } from '../ui/StatusBar';

export class CommitlyManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly engines = new Map<string, AutoCommitEngine>();
  private readonly statusBar: StatusBar;

  constructor(private readonly git: API) {
    this.statusBar = new StatusBar();
    this.disposables.push(this.statusBar);

    this.syncRepos();
    this.disposables.push(
      this.git.onDidOpenRepository(() => this.syncRepos()),
      this.git.onDidCloseRepository(() => this.syncRepos())
    );
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
    this.statusBar.setEnabled(!current);
  }

  async showStatus() {
    const repo = this.pickRepo();
    if (!repo) return;
    const engine = this.engines.get(repo.rootUri.fsPath);
    if (!engine) return;
    const status = engine.getStatus();
    await vscode.window.showInformationMessage(status);
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

  private syncRepos() {
    const live = new Set(this.git.repositories.map((r) => r.rootUri.fsPath));
    for (const [key, engine] of this.engines) {
      if (!live.has(key)) {
        engine.dispose();
        this.engines.delete(key);
      }
    }
    for (const repo of this.git.repositories) {
      if (this.engines.has(repo.rootUri.fsPath)) continue;
      const engine = new AutoCommitEngine(repo, this.statusBar);
      this.engines.set(repo.rootUri.fsPath, engine);
      this.disposables.push(engine);
    }
  }
}

