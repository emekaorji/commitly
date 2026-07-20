import type * as vscode from 'vscode';
import * as path from 'path';
import type { Change, Repository } from '../../types/git';
import type { AutoCommitReason } from '../types';
import type { AiTier, CommitlyConfig } from '../config';
import { heuristicMessage } from '../../heuristics/HeuristicMessage';
import { buildContext, type CommitContext } from './DiffContextBuilder';
import { sanitizeToConventional } from './validate';
import { callByo, callProxy, RateLimitError } from './GroqProvider';
import { DEFAULT_BYO_MODEL } from './prompt';
import { DiffHashCache, RateGate, hashKey } from './cache';
import { getGroqKey } from './secrets';

const MAX_FILES = 50;
export const AI_CONSENT_KEY = 'commitly.ai.consent';

export interface CommitMessageDeps {
  repo: Repository;
  secrets: vscode.SecretStorage;
  globalState: vscode.Memento;
  machineId: string;
  version: string;
  getConfig: () => CommitlyConfig;
  log: (msg: string) => void;
  /** Fire-and-forget: ask the user (once) to allow the free hosted tier. */
  onNeedConsent: () => void;
}

type ResolvedTier = 'proxy' | 'byo';

/**
 * Produces the commit message. Never throws: on any failure (disabled, no key,
 * network, rate-limit, invalid output) it silently falls back to the
 * deterministic heuristic, so a background auto-commit is never blocked.
 */
export class CommitMessageService {
  private readonly cache = new DiffHashCache(20);
  private readonly gate: RateGate;
  private inflight: { key: string; promise: Promise<string> } | undefined;

  constructor(private readonly deps: CommitMessageDeps) {
    this.gate = new RateGate(
      deps.globalState,
      `commitly.rate.${deps.repo.rootUri.fsPath}`
    );
  }

  async generate(input: {
    reason: AutoCommitReason;
    changes: Change[];
  }): Promise<string> {
    const cfg = this.deps.getConfig();
    const branch = this.deps.repo.state.HEAD?.name ?? '';
    const rels = input.changes.map((c) =>
      path.relative(this.deps.repo.rootUri.fsPath, c.uri.fsPath)
    );
    const fallback = () => heuristicMessage(rels, branch);

    if (!cfg.ai.enabled) return fallback();

    const apiKey = await getGroqKey(this.deps.secrets);
    const tier = resolveTier(cfg.ai.tier, !!apiKey);
    if (tier === 'byo' && !apiKey) return fallback();

    // The free tier sends the (redacted) diff to the hosted proxy. Gate that on
    // one-time consent; BYO is an explicit opt-in and needs no prompt.
    if (tier === 'proxy') {
      const consent = this.deps.globalState.get<string>(AI_CONSENT_KEY);
      if (consent !== 'granted') {
        if (consent !== 'denied') this.deps.onNeedConsent();
        return fallback();
      }
    }

    try {
      const ctx = await buildContext(this.deps.repo, input.changes, {
        reason: input.reason,
        maxDiffBytes: cfg.ai.maxDiffBytes,
        maxFiles: MAX_FILES,
      });

      const modelId =
        tier === 'byo' ? cfg.ai.model || DEFAULT_BYO_MODEL : 'proxy';
      const key = hashKey(
        ctx.diffText,
        modelId,
        String(cfg.ai.includeBody),
        branch
      );

      const cached = this.cache.get(key);
      if (cached) return cached;

      const gateStatus = this.gate.status(cfg.ai.minIntervalMs);
      if (gateStatus !== 'ok') {
        this.deps.log(`AI skipped (${gateStatus}); using heuristic`);
        return fallback();
      }

      if (this.inflight && this.inflight.key === key) {
        return await this.inflight.promise;
      }

      this.gate.markCall();
      const promise = this.callModel(tier, apiKey, cfg, ctx).then((raw) => {
        const res = sanitizeToConventional(raw, {
          includeBody: cfg.ai.includeBody,
        });
        if (!res.ok || !res.message) {
          this.deps.log('AI message invalid; using heuristic');
          return fallback();
        }
        this.cache.set(key, res.message);
        return res.message;
      });
      this.inflight = { key, promise };

      const out = await promise;
      await this.gate.clearBackoff();
      return out;
    } catch (err) {
      if (err instanceof RateLimitError) {
        await this.gate.markRateLimited(err.retryAfterSec);
        this.deps.log(`AI rate-limited; backing off ${err.retryAfterSec}s`);
      } else {
        this.deps.log(`AI generation failed: ${errText(err)}`);
      }
      return fallback();
    } finally {
      this.inflight = undefined;
    }
  }

  private callModel(
    tier: ResolvedTier,
    apiKey: string | undefined,
    cfg: CommitlyConfig,
    ctx: CommitContext
  ): Promise<string> {
    if (tier === 'byo') {
      return callByo({
        apiKey: apiKey as string,
        modelId: cfg.ai.model || DEFAULT_BYO_MODEL,
        ctx,
        includeBody: cfg.ai.includeBody,
        timeoutMs: cfg.ai.timeoutMs,
      });
    }
    return callProxy({
      proxyUrl: cfg.ai.proxyUrl,
      ctx,
      timeoutMs: cfg.ai.timeoutMs,
      machineId: this.deps.machineId,
      version: this.deps.version,
    });
  }
}

function resolveTier(tier: AiTier, hasKey: boolean): ResolvedTier {
  if (tier === 'proxy') return 'proxy';
  if (tier === 'byo') return 'byo';
  return hasKey ? 'byo' : 'proxy';
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
