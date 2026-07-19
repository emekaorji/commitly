import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type PushStrategy = 'after-each' | 'batch' | 'manual';

export type CommitlyConfig = {
  autoCommit: boolean;
  idleThresholdSec: number;
  groupChangesWithinSec: number;
  pushAfterCommit: boolean;
  pushStrategy: PushStrategy;
  aiCommitMessage: boolean;
  ignorePatterns: string[];
  lineChangeThreshold: number;
  fileChangeThreshold: number;
  blockOnDiagnostics: boolean;
  branchRelevance: boolean;
  testTaskNameIncludes: string[];
  triggers: {
    idle: boolean;
    branchSwitch: boolean;
    saveBurst: boolean;
    testPass: boolean;
    closeAllEditors: boolean;
    thresholds: boolean;
  };
};

const defaultConfig: CommitlyConfig = {
  autoCommit: true,
  idleThresholdSec: 60,
  groupChangesWithinSec: 180,
  pushAfterCommit: false,
  pushStrategy: 'manual',
  aiCommitMessage: false,
  ignorePatterns: ['*.env', 'README.md'],
  lineChangeThreshold: 200,
  fileChangeThreshold: 20,
  blockOnDiagnostics: true,
  branchRelevance: true,
  testTaskNameIncludes: ['test', 'vitest', 'jest', 'pnpm test', 'npm test'],
  triggers: {
    idle: true,
    branchSwitch: true,
    saveBurst: true,
    testPass: true,
    closeAllEditors: true,
    thresholds: true,
  },
};

export function loadCommitlyConfig(repoRootUri: vscode.Uri): CommitlyConfig {
  const vscodeCfg = vscode.workspace.getConfiguration('commitly', repoRootUri);

  const fromSettings: Partial<CommitlyConfig> = {
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
    aiCommitMessage: vscodeCfg.get(
      'aiCommitMessage',
      defaultConfig.aiCommitMessage
    ),
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
  };

  const fromRc = readCommitlyRc(repoRootUri.fsPath);

  return mergeConfig(defaultConfig, fromRc, fromSettings);
}

function mergeConfig(
  base: CommitlyConfig,
  ...overrides: Array<Partial<CommitlyConfig> | undefined>
): CommitlyConfig {
  const out: CommitlyConfig = structuredClone(base);
  for (const o of overrides) {
    if (!o) continue;
    Object.assign(out, o);
    if (o.triggers) out.triggers = { ...out.triggers, ...o.triggers };
  }
  // Clamp a few values
  out.idleThresholdSec = Math.max(5, out.idleThresholdSec);
  out.groupChangesWithinSec = Math.max(5, out.groupChangesWithinSec);
  out.lineChangeThreshold = Math.max(1, out.lineChangeThreshold);
  out.fileChangeThreshold = Math.max(1, out.fileChangeThreshold);
  return out;
}

function readCommitlyRc(repoRootFsPath: string): Partial<CommitlyConfig> | undefined {
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

function normalizeRc(json: any): Partial<CommitlyConfig> {
  const triggersArray = Array.isArray(json?.triggers) ? json.triggers : undefined;
  const triggersFromArray: CommitlyConfig['triggers'] | undefined = triggersArray
    ? {
        idle: triggersArray.includes('idle'),
        branchSwitch: triggersArray.includes('branchSwitch'),
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
    aiCommitMessage: json?.aiCommitMessage,
    ignorePatterns: json?.ignorePatterns,
    lineChangeThreshold: json?.lineChangesOver ?? json?.lineChangeThreshold,
    fileChangeThreshold: json?.fileChangesOver ?? json?.fileChangeThreshold,
    triggers: triggersFromArray,
  };
}
