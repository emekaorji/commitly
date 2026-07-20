import * as path from 'path';
import type { Change, Repository } from '../types/git';
import type { AutoCommitReason } from './types';
import type { PushStrategy } from './config';
import { buildStagePaths } from './stagePaths';
import {
  heuristicMessage,
  branchRelevanceOk as heuristicBranchRelevanceOk,
} from '../heuristics/HeuristicMessage';

export class CommitService {
  constructor(private readonly repo: Repository) {}

  /**
   * Deterministic fallback message. AI-generated messages come from
   * CommitMessageService; this stays as the always-clean fallback.
   */
  async generateMessage(
    _reason: AutoCommitReason,
    changes: Change[]
  ): Promise<string> {
    const branch = this.repo.state.HEAD?.name ?? '';
    return heuristicMessage(this.relPaths(changes), branch);
  }

  async branchRelevanceOk(message: string, enabled: boolean): Promise<boolean> {
    const branch = this.repo.state.HEAD?.name ?? '';
    return heuristicBranchRelevanceOk(message, branch, enabled);
  }

  async commit(
    message: string,
    changes: Change[],
    opts: { pushAfterCommit: boolean; pushStrategy: PushStrategy }
  ) {
    // Stage exactly the eligible files, then commit the index. We must NOT use
    // { all: 'tracked' } (git commit -a) — that stages every tracked-modified
    // file and silently defeats ignorePatterns.
    const files = buildStagePaths(changes, this.repo.rootUri.fsPath);
    if (files.length > 0) {
      await this.repo.add(files);
    }
    try {
      await this.repo.commit(message);
    } catch (err) {
      // TOCTOU: the eligible set emptied between filtering and staging.
      if (isNothingToCommit(err)) return;
      throw err;
    }

    if (!opts.pushAfterCommit) return;
    if (opts.pushStrategy === 'manual') return;
    // 'after-each' and 'batch' both push after commit today; a real batch
    // scheduler is a deferred follow-up (see README Known Issues).
    await this.repo.push();
  }

  private relPaths(changes: Change[]): string[] {
    return changes
      .map((c) => path.relative(this.repo.rootUri.fsPath, c.uri.fsPath))
      .filter((p) => p && !p.startsWith('..'));
  }
}

function isNothingToCommit(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('nothing to commit') ||
    msg.includes('no changes added') ||
    msg.includes('working tree clean')
  );
}
