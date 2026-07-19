import * as vscode from 'vscode';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private enabled = true;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = 'commitly.showStatus';
    this.item.text = 'Commitly';
    this.item.tooltip = 'Commitly';
    this.item.show();
  }

  dispose() {
    this.item.dispose();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.item.color = enabled ? undefined : new vscode.ThemeColor('disabledForeground');
  }

  setText(text: string) {
    this.item.text = text;
  }
}

