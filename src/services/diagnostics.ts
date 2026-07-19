import * as vscode from 'vscode';

export function shouldSkipDueToDiagnostics(
  uris: vscode.Uri[],
  enabled: boolean
): boolean {
  if (!enabled) return false;
  for (const uri of uris) {
    const diags = vscode.languages.getDiagnostics(uri);
    if (diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error)) {
      return true;
    }
  }
  return false;
}

