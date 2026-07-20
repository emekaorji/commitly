# Commitly

Autonomous Git for Humans: automatically commits tracked changes at natural breakpoints (idle, tests passing, closing editors, large change thresholds) with guardrails.

## Features

- Auto-commit triggers:
  - Idle for N seconds
  - Task-based “tests passed”
  - Close all visible editors
  - Thresholds: changed files / approx changed lines
- Guardrails:
  - Skips when there are unsaved files (in this repo)
  - Backs off when you have staged changes of your own
  - Skips on merge conflicts
  - Skips on VS Code diagnostics errors (optional)
  - Skips if branch implies `feat`/`fix` but message type doesn’t match (optional)
- Commit messages:
  - **AI-generated** Conventional Commit messages (via [Groq](https://groq.com))
  - Deterministic heuristic fallback whenever AI is off, unavailable, or rate-limited

## AI commit messages

Commitly writes your commit messages for you. Two tiers:

- **Free tier (default).** Messages are generated through the hosted Commitly
  proxy — no setup, no key. The first time it runs you’re asked to opt in, since
  your changed diff (with obvious secrets redacted) is sent to the proxy. Nothing
  is stored.
- **Bring your own key.** Run **`Commitly: Set Groq API Key`** to paste a
  [Groq](https://console.groq.com/keys) key (stored in VS Code SecretStorage).
  This unlocks a more capable model and calls Groq directly from your machine.
  Clear it any time with **`Commitly: Clear Groq API Key`**.

If AI generation fails, times out, is rate-limited, or returns something invalid,
Commitly silently falls back to a built-in heuristic so a commit is never blocked.

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
- `commitly.branchRelevance`: Fall back to a branch-appropriate message on mismatch.
- `commitly.testTaskNameIncludes`: Substrings treated as “test tasks”.
- `commitly.ai.enabled`: Generate messages with AI (fallback to heuristic).
- `commitly.ai.tier`: `auto` | `proxy` | `byo`.
- `commitly.ai.model`: Groq model id for your own key (empty = default).
- `commitly.ai.proxyUrl`: Free-tier endpoint (override to self-host).
- `commitly.ai.includeBody`: Allow a short commit body.
- `commitly.ai.maxDiffBytes` / `commitly.ai.timeoutMs` / `commitly.ai.minIntervalMs`.

Commands:

- `Commitly: Commit Now`
- `Commitly: Toggle Auto-Commit`
- `Commitly: Show Status`
- `Commitly: Set Groq API Key`
- `Commitly: Clear Groq API Key`

## Configuration file

Settings can also live in a `.commitlyrc` (JSON) at the repo root; see
[`.commitlyrc.example`](.commitlyrc.example). VS Code settings win over
`.commitlyrc`, which wins over defaults.

## Known Issues

- “Tests passed” trigger relies on VS Code tasks; it doesn’t yet integrate with the native Testing API.
- “Batch” push currently behaves like “after-each” (a real push scheduler is a deferred follow-up).

## Release Notes

### 0.0.1

Initial prototype: triggers, guardrails, and basic commit message heuristics.

## For more information

- VS Code Extension API docs: https://code.visualstudio.com/api
