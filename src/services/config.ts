import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type PushStrategy = 'after-each' | 'batch' | 'manual';
export type AiTier = 'auto' | 'proxy' | 'byo';

export type CommitlyAiConfig = {
  enabled: boolean;
  tier: AiTier;
  model: string;
  proxyUrl: string;
  includeBody: boolean;
  maxDiffBytes: number;
  timeoutMs: number;
  minIntervalMs: number;
};

export type CommitlyConfig = {
  autoCommit: boolean;
  idleThresholdSec: number;
  groupChangesWithinSec: number;
  pushAfterCommit: boolean;
  pushStrategy: PushStrategy;
  ignorePatterns: string[];
  lineChangeThreshold: number;
  fileChangeThreshold: number;
  blockOnDiagnostics: boolean;
  branchRelevance: boolean;
  testTaskNameIncludes: string[];
  ai: CommitlyAiConfig;
  triggers: {
    idle: boolean;
    saveBurst: boolean;
    testPass: boolean;
    closeAllEditors: boolean;
    thresholds: boolean;
  };
};

// Default free-tier proxy. Override via `commitly.ai.proxyUrl` or `.commitlyrc`.
export const DEFAULT_PROXY_URL =
  'https://commitly-proxy.vercel.app/api/commit-message';

export const defaultConfig: CommitlyConfig = {
  autoCommit: true,
  idleThresholdSec: 60,
  groupChangesWithinSec: 180,
  pushAfterCommit: false,
  pushStrategy: 'manual',
  ignorePatterns: ['*.env', 'README.md'],
  lineChangeThreshold: 200,
  fileChangeThreshold: 20,
  blockOnDiagnostics: true,
  branchRelevance: true,
  testTaskNameIncludes: ['test', 'vitest', 'jest', 'pnpm test', 'npm test'],
  ai: {
    enabled: true,
    tier: 'auto',
    model: '',
    proxyUrl: DEFAULT_PROXY_URL,
    includeBody: false,
    maxDiffBytes: 48000,
    timeoutMs: 6000,
    minIntervalMs: 3000,
  },
  triggers: {
    idle: true,
    saveBurst: true,
    testPass: true,
    closeAllEditors: true,
    thresholds: true,
  },
};

/**
 * A shallow config override where the nested `ai`/`triggers` objects may be
 * partial (merged key-by-key rather than replaced wholesale).
 */
export type ConfigOverride = Partial<
  Omit<CommitlyConfig, 'ai' | 'triggers'>
> & {
  ai?: Partial<CommitlyAiConfig>;
  triggers?: Partial<CommitlyConfig['triggers']>;
};

export function loadCommitlyConfig(repoRootUri: vscode.Uri): CommitlyConfig {
  const vscodeCfg = vscode.workspace.getConfiguration('commitly', repoRootUri);

  const fromSettings: ConfigOverride = {
    autoCommit: vscodeCfg.get('autoCommit', defaultConfig.autoCommit),
    idleThresholdSec: vscodeCfg.get(
      'idleThreshold',
      defaultConfig.idleThresholdSec
    ),
    groupChangesWithinSec: vscodeCfg.get(
      'groupChangesWithin',
      defaultConfig.groupChangesWithinSec
    ),
    pushAfterCommit: vscodeCfg.get(
      'pushAfterCommit',
      defaultConfig.pushAfterCommit
    ),
    pushStrategy: vscodeCfg.get('pushStrategy', defaultConfig.pushStrategy),
    ignorePatterns: vscodeCfg.get(
      'ignorePatterns',
      defaultConfig.ignorePatterns
    ),
    lineChangeThreshold: vscodeCfg.get(
      'lineChangeThreshold',
      defaultConfig.lineChangeThreshold
    ),
    fileChangeThreshold: vscodeCfg.get(
      'fileChangeThreshold',
      defaultConfig.fileChangeThreshold
    ),
    blockOnDiagnostics: vscodeCfg.get(
      'blockOnDiagnostics',
      defaultConfig.blockOnDiagnostics
    ),
    branchRelevance: vscodeCfg.get(
      'branchRelevance',
      defaultConfig.branchRelevance
    ),
    testTaskNameIncludes: vscodeCfg.get(
      'testTaskNameIncludes',
      defaultConfig.testTaskNameIncludes
    ),
    ai: {
      enabled: vscodeCfg.get('ai.enabled', defaultConfig.ai.enabled),
      tier: vscodeCfg.get('ai.tier', defaultConfig.ai.tier),
      model: vscodeCfg.get('ai.model', defaultConfig.ai.model),
      proxyUrl: vscodeCfg.get('ai.proxyUrl', defaultConfig.ai.proxyUrl),
      includeBody: vscodeCfg.get('ai.includeBody', defaultConfig.ai.includeBody),
      maxDiffBytes: vscodeCfg.get('ai.maxDiffBytes', defaultConfig.ai.maxDiffBytes),
      timeoutMs: vscodeCfg.get('ai.timeoutMs', defaultConfig.ai.timeoutMs),
      minIntervalMs: vscodeCfg.get(
        'ai.minIntervalMs',
        defaultConfig.ai.minIntervalMs
      ),
    },
  };

  const fromRc = readCommitlyRc(repoRootUri.fsPath);

  return mergeConfig(defaultConfig, fromRc, fromSettings);
}

export function mergeConfig(
  base: CommitlyConfig,
  ...overrides: Array<ConfigOverride | undefined>
): CommitlyConfig {
  const out: CommitlyConfig = structuredClone(base);
  for (const o of overrides) {
    if (!o) continue;
    const { ai, triggers, ...rest } = o;
    Object.assign(out, rest);
    if (triggers) out.triggers = { ...out.triggers, ...triggers };
    if (ai) out.ai = { ...out.ai, ...ai };
  }
  // Clamp / validate.
  out.idleThresholdSec = Math.max(5, out.idleThresholdSec);
  out.groupChangesWithinSec = Math.max(5, out.groupChangesWithinSec);
  out.lineChangeThreshold = Math.max(1, out.lineChangeThreshold);
  out.fileChangeThreshold = Math.max(1, out.fileChangeThreshold);
  out.ai.maxDiffBytes = Math.max(2000, out.ai.maxDiffBytes);
  out.ai.timeoutMs = Math.max(1000, out.ai.timeoutMs);
  out.ai.minIntervalMs = Math.max(0, out.ai.minIntervalMs);
  if (!['after-each', 'batch', 'manual'].includes(out.pushStrategy)) {
    out.pushStrategy = 'manual';
  }
  if (!['auto', 'proxy', 'byo'].includes(out.ai.tier)) {
    out.ai.tier = 'auto';
  }
  return out;
}

function readCommitlyRc(repoRootFsPath: string): ConfigOverride | undefined {
  const rcPath = path.join(repoRootFsPath, '.commitlyrc');
  try {
    if (!fs.existsSync(rcPath)) return undefined;
    const raw = fs.readFileSync(rcPath, 'utf8');
    const json = JSON.parse(raw) as any;
    return normalizeRc(json);
  } catch {
    return undefined;
  }
}

export function normalizeRc(json: any): ConfigOverride {
  const triggersArray = Array.isArray(json?.triggers) ? json.triggers : undefined;
  const triggersFromArray: CommitlyConfig['triggers'] | undefined = triggersArray
    ? {
        idle: triggersArray.includes('idle'),
        saveBurst: triggersArray.includes('saveBurst'),
        testPass: triggersArray.includes('testPass'),
        closeAllEditors: triggersArray.includes('closeAllEditors'),
        thresholds: triggersArray.includes('thresholds'),
      }
    : undefined;

  return {
    autoCommit: json?.autoCommit,
    idleThresholdSec: json?.idleThreshold,
    groupChangesWithinSec: json?.groupChangesWithin,
    pushAfterCommit: json?.pushAfterCommit,
    pushStrategy: json?.pushStrategy,
    ignorePatterns: json?.ignorePatterns,
    lineChangeThreshold: json?.lineChangesOver ?? json?.lineChangeThreshold,
    fileChangeThreshold: json?.fileChangesOver ?? json?.fileChangeThreshold,
    ai: normalizeAiRc(json),
    triggers: triggersFromArray,
  };
}

function normalizeAiRc(json: any): Partial<CommitlyAiConfig> | undefined {
  const ai = json?.ai && typeof json.ai === 'object' ? json.ai : {};
  // Back-compat: the legacy flat `aiCommitMessage` flag maps to `ai.enabled`.
  const enabled = json?.aiCommitMessage ?? ai.enabled;
  const out: Partial<CommitlyAiConfig> = {};
  if (enabled !== undefined) out.enabled = enabled;
  if (ai.tier !== undefined) out.tier = ai.tier;
  if (ai.model !== undefined) out.model = ai.model;
  if (ai.proxyUrl !== undefined) out.proxyUrl = ai.proxyUrl;
  if (ai.includeBody !== undefined) out.includeBody = ai.includeBody;
  if (ai.maxDiffBytes !== undefined) out.maxDiffBytes = ai.maxDiffBytes;
  if (ai.timeoutMs !== undefined) out.timeoutMs = ai.timeoutMs;
  if (ai.minIntervalMs !== undefined) out.minIntervalMs = ai.minIntervalMs;
  return Object.keys(out).length > 0 ? out : undefined;
}
