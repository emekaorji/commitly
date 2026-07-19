import * as vscode from 'vscode';
import { GitExtension, API } from './types/git';
import { CommitlyManager } from './manager/CommitlyManager';

export function activate(context: vscode.ExtensionContext) {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
  if (!gitExtension) return;

  const git = gitExtension.getAPI(1);
  const manager = new CommitlyManager(git);
  context.subscriptions.push(manager);

  context.subscriptions.push(
    vscode.commands.registerCommand('commitly.commitNow', async () => {
      await manager.commitNow();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('commitly.toggleAutoCommit', async () => {
      await manager.toggleAutoCommit();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('commitly.showStatus', async () => {
      await manager.showStatus();
    })
  );
}

export function deactivate() {}
