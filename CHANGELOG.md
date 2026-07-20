# Change Log

All notable changes to the "commitly" extension are documented here, following
[Keep a Changelog](http://keepachangelog.com/).

## [0.1.0]

### Added
- **AI commit messages** via the Vercel AI SDK + Groq, with a deterministic
  heuristic fallback whenever AI is disabled, unavailable, rate-limited, or
  returns an invalid message.
  - Free/default tier through an owner-hosted proxy (`server/`) that keeps the
    Groq key server-side and rate-limits per machine + IP with a global cap.
  - Bring-your-own-key tier (`Commitly: Set Groq API Key`, stored in
    SecretStorage) that calls Groq directly and unlocks a more capable model.
  - One-time consent before any diff leaves the machine; obvious secrets are
    redacted from diffs first.
  - `commitly.ai.*` settings and `.commitlyrc` support.

### Fixed
- `ignorePatterns` were silently bypassed by `git commit -a`; the commit now
  stages only eligible files (rename/delete aware).
- Removed the branch-switch trigger, which committed onto the wrong branch
  (the Git API has no pre-checkout hook).
- Added a re-entrancy lock and a real debounce so overlapping triggers coalesce
  into a single commit; `saveBurst` now fires per burst, not per save.
- Auto-commit backs off when you have your own staged changes.
- Unsaved-file guard is now scoped to the current repository.
- Status bar is owned by the manager and no longer clobbered across repos.
- Robust activation via `extensionDependencies` on `vscode.git`.

### Changed
- Cleaner heuristic messages (derived scope, no raw trigger tags).
- Project cleanup: removed dead files and duplicate typings; marketplace metadata.

## [0.0.1]

Initial prototype: triggers, guardrails, and basic commit message heuristics.
