# Commitly

Autonomous Git for Humans: automatically commits tracked changes at natural breakpoints (idle, tests passing, closing editors, large change thresholds) with guardrails.

## Features

- Auto-commit triggers:
  - Idle for N seconds
  - Task-based “tests passed”
  - Close all visible editors
  - Thresholds: changed files / approx changed lines
  - Branch switch (checkout)
- Guardrails:
  - Skips when there are unsaved files
  - Skips on VS Code diagnostics errors (optional)
  - Skips if branch implies `feat`/`fix` but message type doesn’t match (optional)

## Requirements

- VS Code with the built-in Git extension enabled.

## Extension Settings

This extension contributes the following settings:

- `commitly.autoCommit`: Enable/disable auto-commit.
- `commitly.idleThreshold`: Seconds idle before committing.
- `commitly.groupChangesWithin`: Grouping window for changes.
- `commitly.pushAfterCommit`: Push after committing.
- `commitly.pushStrategy`: `after-each` | `batch` | `manual`.
- `commitly.ignorePatterns`: Simple ignore patterns (e.g. `*.env`).
- `commitly.lineChangeThreshold`: Approx line threshold trigger.
- `commitly.fileChangeThreshold`: File count threshold trigger.
- `commitly.blockOnDiagnostics`: Block when diagnostics contain errors.
- `commitly.branchRelevance`: Block on branch/message mismatch.
- `commitly.testTaskNameIncludes`: Substrings treated as “test tasks”.

Commands:

- `Commitly: Commit Now`
- `Commitly: Toggle Auto-Commit`
- `Commitly: Show Status`

## Known Issues

- “Tests passed” trigger relies on VS Code tasks; it doesn’t yet integrate with the native Testing API.
- “Batch” push currently behaves like “after-each” (push scheduling not implemented yet).

## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial prototype: triggers, guardrails, and basic commit message heuristics.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

- VS Code Extension API docs: https://code.visualstudio.com/api
