# Commitly — Autonomous Git for Humans

> “Code. Think. Ship. — and let your commits take care of themselves.”

Commitly is a next-generation **VS Code Git extension** designed to **automate, streamline, and intelligently manage Git commits** so developers can stay focused on what matters — **writing code**.

Unlike traditional Git helpers, Commitly is **proactive**. It doesn’t just help you write better commit messages — it **commits for you intelligently**, at the right time, with the right message.

---

## 🚀 Why Commitly Exists

Software engineers spend mental energy on:

- remembering to commit at the right time,
- writing consistent commit messages,
- switching context to stage and push code,
- ensuring changelog-friendly commit history.

This is friction.

Commitly removes that friction by:

- **Watching intelligently** for meaningful change events.
- **Auto-committing** when it makes sense.
- **Writing semantic messages** for you.
- **Keeping your repo in sync**, without micromanaging Git.

---

## 🧭 Core Features

### 1. 🧠 Intelligent Auto-Commit Engine

Commitly watches your workspace activity and commits when it detects a **natural break point** in your work.
No commands. No prompts. No manual staging.

#### Trigger Types

| Trigger               | Description                           | Example                          |
| --------------------- | ------------------------------------- | -------------------------------- |
| **Idle**              | User stops coding for X seconds       | Auto-commit after 60s idle       |
| **Branch Switch**     | Before switching branches             | Auto-commit pending changes      |
| **Save Burst**        | Multiple saves in short period        | Commit once after burst          |
| **Test Pass**         | Integration with test runner          | Commit after green tests         |
| **Semantic Boundary** | Detects meaningful structural changes | Function added, file moved, etc. |

#### Behind the Scenes

- Stages tracked files.
- Generates AI or convention-based message.
- Commits silently with contextual tags:
  ```bash
  feat(auto): refactor login handler for clarity
  ```

* Optionally pushes to remote.

---

### 2. ✍️ Commit Message Intelligence

Commitly integrates smart commit generation so your Git history stays **clean**, **consistent**, and **machine-parseable**.

- Supports **Conventional Commits** out of the box.
- AI-powered diff summarization using OpenAI API or ai-sdk.
- Auto-suggests message type (`feat`, `fix`, `chore`, `docs`, etc.).
- Optional `[auto]` prefix for system commits.

Example:

```
feat(auto): implement user onboarding form validation
```

---

### 3. 🪝 Auto-Staging & Guardrails

Commitly keeps your history clean, not noisy.

- Auto-stages **only tracked** files.
- Supports **ignore patterns**:

  - `.env`, `README.md`, lockfiles, etc.

- Detects **merge conflicts** and backs off intelligently.
- Configurable **WIP markers** and **cleanup strategies** (e.g., auto-squash).

---

### 4. 🧰 Configurable Auto-Commit Profiles

Every developer works differently.
Commitly respects that.

#### `.commitlyrc` example

```json
{
  "autoCommit": true,
  "triggers": ["idle", "branchSwitch", "testPass"],
  "idleThreshold": 60,
  "groupChangesWithin": 180,
  "pushAfterCommit": true,
  "pushStrategy": "batch",
  "aiCommitMessage": true,
  "ignorePatterns": ["*.env", "README.md"]
}
```

- `autoCommit`: enable/disable auto-commit globally.
- `triggers`: choose which smart triggers to use.
- `idleThreshold`: time in seconds before committing after inactivity.
- `groupChangesWithin`: how long to accumulate edits into a single commit.
- `pushAfterCommit`: whether to auto-push.
- `pushStrategy`: `after-each`, `batch`, or `manual`.
- `aiCommitMessage`: toggle AI commit generation.
- `ignorePatterns`: files to exclude from auto commits.

---

### 5. 🌐 Auto-Push Strategy

Keep your work synced — without thinking about it.

| Strategy     | Behavior                                               |
| ------------ | ------------------------------------------------------ |
| `after-each` | Push after every commit                                |
| `batch`      | Accumulate multiple commits, push on idle or test pass |
| `manual`     | Never push automatically                               |

Works seamlessly with:

- GitHub
- GitLab
- Bitbucket
- or any standard Git remote.

---

### 6. 🪄 Developer UX in VS Code

Transparency builds trust.
Commitly gives real-time feedback:

- ✅ Status bar indicator:

  ```
  Auto-committed 2 changes 1m ago
  ```

- 🔙 “Undo last auto commit” command palette action.
- 🪧 “Show pending auto commit” preview.
- 🧭 Inline diff view before committing (optional).

All without breaking your coding flow.

---

### 7. 📜 Structured Commit History

Because commits are:

- **timely** (trigger-based),
- **semantic** (AI or convention-driven),
- **clean** (guardrails + grouping),

Commitly naturally produces:

- Better Git logs.
- Easier diffs.
- Changelog generation out of the box.
- Perfect foundation for semantic release workflows.

---

## 🏗️ Technical Architecture Overview

Commitly is built as a TypeScript-based VS Code extension.
It leverages:

- `vscode.workspace` and `vscode.window` events
- VS Code Git API or `child_process` Git CLI
- Config-driven trigger manager
- Optional AI backend

```
commitly/
├─ src/
│  ├─ extension.ts           # Entry point
│  ├─ triggers/
│  │  ├─ idle.ts
│  │  ├─ branchSwitch.ts
│  │  ├─ saveBurst.ts
│  │  ├─ testPass.ts
│  │  └─ semanticBoundary.ts
│  ├─ services/
│  │  ├─ CommitService.ts    # add, commit, push logic
│  │  ├─ AIService.ts        # commit message generation
│  │  └─ ConfigService.ts
│  ├─ ui/
│  │  ├─ StatusBar.ts
│  │  └─ Notifications.ts
│  ├─ utils/
│  │  └─ debounce.ts
│  └─ types.ts
├─ package.json
├─ README.md
└─ WHITEPAPER.md
```

### Minimal Commit Worker Example

```ts
import * as vscode from 'vscode';
import { exec } from 'child_process';

const AUTO_COMMIT_IDLE_MS = 60000;
let idleTimer: NodeJS.Timeout | null = null;

export function activate(context: vscode.ExtensionContext) {
  vscode.workspace.onDidSaveTextDocument(() => resetIdleTimer());
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => autoCommit(), AUTO_COMMIT_IDLE_MS);
}

async function autoCommit() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return;

  const repoPath = workspaceFolders[0].uri.fsPath;
  exec(`git add -A`, { cwd: repoPath });
  exec(`git commit -m "chore(auto): save work in progress"`, { cwd: repoPath });
  exec(`git push`, { cwd: repoPath });
}
```

---

## 🛡️ Guardrails & Fail-Safes

- Auto-commit is **never forced**; can be toggled at any time.
- No commits are made when:

  - Merge conflicts exist.
  - Only ignored files changed.
  - AI message generation fails (falls back to default template).

- Undo is always available.
- Squash and cleanup options for WIP commits.

---

## 🧑‍💻 Target Audience

- Solo developers who want clean Git history without the ceremony.
- Teams enforcing conventional commit standards.
- Continuous delivery pipelines needing semantic commits.
- Open source maintainers aiming for polished commit logs.

---

## 🌱 Roadmap

- [ ] Inline diff-based AI commit messages
- [ ] Auto-changelog generation
- [ ] CI-aware push throttling
- [ ] Commit templates per project
- [ ] Local history timeline viewer
- [ ] VS Code Insiders performance optimizations

---

## 🧠 Positioning

> **Commitly — Git that commits when you should, not when you remember to.**

- 🪄 **Seamless**: It works in the background, no extra commands.
- 🧠 **Intelligent**: Knows when to commit, how to describe it, and when to push.
- 🧰 **Configurable**: Tailor it to match your personal or team workflow.
- 🧼 **Clean History**: Semantic commits, structured timelines, better releases.

---

## 🏁 Conclusion

Commitly isn’t just another commit message helper.
It’s the first **intelligent auto-commit companion** for VS Code — blending **timing**, **AI**, **convention**, and **developer experience** into one cohesive tool.

> _“You focus on building. Commitly keeps your work in sync.”_
