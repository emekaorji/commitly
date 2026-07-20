import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Commitly activation', () => {
  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension('coderabbi.commitly');
    assert.ok(ext, 'extension not found');
    await ext!.activate();
    assert.ok(ext!.isActive);
  });

  test('registers its commands', async () => {
    const ext = vscode.extensions.getExtension('coderabbi.commitly');
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'commitly.commitNow',
      'commitly.toggleAutoCommit',
      'commitly.showStatus',
      'commitly.setGroqKey',
      'commitly.clearGroqKey',
    ]) {
      assert.ok(commands.includes(id), `missing command: ${id}`);
    }
  });
});
