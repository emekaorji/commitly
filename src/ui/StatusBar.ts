import * as vscode from 'vscode';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = 'commitly.showStatus';
    this.item.text = 'Commitly';
    this.item.tooltip = 'Commitly — click for status';
    this.item.show();
  }

  dispose() {
    this.item.dispose();
  }

  render(text: string, enabled: boolean) {
    this.item.text = text;
    this.item.color = enabled
      ? undefined
      : new vscode.ThemeColor('disabledForeground');
  }
}
