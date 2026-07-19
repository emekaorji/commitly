import * as path from 'path';
import type { Change, Repository } from '../types/git';
import type { AutoCommitReason } from './types';
import type { PushStrategy } from './config';

export class CommitService {
  constructor(private readonly repo: Repository) {}

  async generateMessage(reason: AutoCommitReason, changes: Change[]) {
    const branch = this.repo.state.HEAD?.name ?? '';
    const type = guessTypeFromBranch(branch);
    const scope = 'auto';
    const summary = summarizeChanges(changes);
    const reasonTag =
      reason === 'manual' ? '' : reason === 'idle' ? ' idle' : ` ${reason}`;
    return `${type}(${scope}): ${summary}${reasonTag}`.trim();
  }

  async branchRelevanceOk(message: string, enabled: boolean): Promise<boolean> {
    if (!enabled) return true;
    const branch = (this.repo.state.HEAD?.name ?? '').toLowerCase();
    if (!branch) return true;
    const msgType = message.split(':')[0]?.toLowerCase() ?? '';

    const branchWants =
      branch.includes('fix') || branch.startsWith('bugfix/')
        ? 'fix'
        : branch.includes('feat') || branch.startsWith('feature/')
          ? 'feat'
          : undefined;
    if (!branchWants) return true;
    return msgType.startsWith(branchWants);
  }

  async commit(
    message: string,
    changes: Change[],
    opts: { pushAfterCommit: boolean; pushStrategy: PushStrategy }
  ) {
    const files = changes
      .map((c) => path.relative(this.repo.rootUri.fsPath, c.uri.fsPath))
      .filter((p) => p && !p.startsWith('..'));

    if (files.length > 0) {
      await this.repo.add(files);
    }
    await this.repo.commit(message, { all: 'tracked' });

    if (!opts.pushAfterCommit) return;
    if (opts.pushStrategy === 'manual') return;
    // For now, batch/after-each both push after commit. Batch semantics would need a scheduler.
    await this.repo.push();
  }
}

function summarizeChanges(changes: Change[]): string {
  const rels = changes
    .map((c) => c.uri.fsPath)
    .sort((a, b) => a.localeCompare(b));
  const files = rels.length;
  if (files === 1) return `update ${path.basename(rels[0])}`;
  if (files <= 3) return `update ${rels.map((p) => path.basename(p)).join(', ')}`;
  return `update ${files} files`;
}

function guessTypeFromBranch(branchName: string): string {
  const b = branchName.toLowerCase();
  if (b.includes('fix') || b.startsWith('bugfix/')) return 'fix';
  if (b.includes('feat') || b.startsWith('feature/')) return 'feat';
  if (b.includes('docs')) return 'docs';
  if (b.includes('test')) return 'test';
  return 'chore';
}

