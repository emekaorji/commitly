import * as vscode from 'vscode';
import type { GitExtension, API } from './types/git';
import { CommitlyManager } from './manager/CommitlyManager';
import { setGroqKey, clearGroqKey } from './services/ai/secrets';

export async function activate(context: vscode.ExtensionContext) {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) return;
  if (!ext.isActive) await ext.activate();

  let manager: CommitlyManager | undefined;

  const start = () => {
    if (manager) return;
    let git: API;
    try {
      git = ext.exports.getAPI(1);
    } catch {
      // Git extension is disabled; wait for it to be re-enabled.
      return;
    }
    manager = new CommitlyManager(context, git);
    context.subscriptions.push(manager);
  };

  if (ext.exports.enabled) start();
  context.subscriptions.push(
    ext.exports.onDidChangeEnablement((enabled) => {
      if (enabled) start();
    })
  );

  const run = (fn: (m: CommitlyManager) => unknown) => () => {
    if (!manager) {
      void vscode.window.showWarningMessage('Commitly: Git is not available yet.');
      return;
    }
    return fn(manager);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('commitly.commitNow', run((m) => m.commitNow())),
    vscode.commands.registerCommand(
      'commitly.toggleAutoCommit',
      run((m) => m.toggleAutoCommit())
    ),
    vscode.commands.registerCommand('commitly.showStatus', run((m) => m.showStatus())),
    // Key management works regardless of Git availability.
    vscode.commands.registerCommand('commitly.setGroqKey', () =>
      promptForGroqKey(context)
    ),
    vscode.commands.registerCommand('commitly.clearGroqKey', async () => {
      await clearGroqKey(context.secrets);
      void vscode.window.showInformationMessage(
        'Commitly: Groq key cleared — using the free tier.'
      );
    })
  );
}

async function promptForGroqKey(context: vscode.ExtensionContext) {
  const value = await vscode.window.showInputBox({
    title: 'Commitly — Groq API key',
    prompt:
      'Paste your Groq API key. Stored securely in VS Code SecretStorage and used to unlock a more capable model.',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'gsk_...',
  });
  if (value === undefined) return; // cancelled
  if (!value.trim()) {
    await clearGroqKey(context.secrets);
    void vscode.window.showInformationMessage(
      'Commitly: Groq key cleared — using the free tier.'
    );
    return;
  }
  await setGroqKey(context.secrets, value);
  void vscode.window.showInformationMessage(
    'Commitly: Groq key saved — capable AI model unlocked.'
  );
}

export function deactivate() {}
