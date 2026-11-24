'use strict';

const path = require('node:path');
const { PATTERNS, SOURCE_EXTENSIONS } = require('../../core/constants.cjs');
const { loadManifestIfPresent, walkProjectFiles } = require('../../core/import-parser.cjs');

const PATTERN_COMPLEXITY_RANK = {
  [PATTERNS.CLASSIC_BY_TYPE]: 1,
  [PATTERNS.ATOMIC_DESIGN]: 2,
  [PATTERNS.HEXAGONAL_CLEAN]: 3,
  [PATTERNS.FEATURE_DRIVEN_SCREAMING]: 3,
  [PATTERNS.MODULAR_MONOLITH_FULLSTACK]: 4,
  [PATTERNS.MONOREPO_WORKSPACES]: 5
};

/**
 * Evaluates an evolutionary architecture migration using the Transition Cost Guardrail:
 * Only recommend full architectural migration when Strategic Value > (Implementation Cost + Migration Risk + Operational Fatigue).
 */
function planMigration({ targetDir = process.cwd(), targetPattern, reason = '' } = {}) {
  const resolvedDir = path.resolve(targetDir);
  const manifest = loadManifestIfPresent(resolvedDir);
  const currentPattern = (manifest && manifest.pattern) || PATTERNS.CLASSIC_BY_TYPE;

  if (!targetPattern || !Object.values(PATTERNS).includes(targetPattern)) {
    throw new Error(`Invalid targetPattern "${targetPattern}". Valid values: ${Object.values(PATTERNS).join(', ')}`);
  }

  if (currentPattern === targetPattern) {
    return {
      verdict: 'ALREADY_AT_TARGET',
      currentPattern,
      targetPattern,
      message: `Project already uses "${targetPattern}". Focus on incremental refinements via "dwa audit" and "dwa promote".`,
      phases: []
    };
  }

  const { files, directories } = walkProjectFiles(resolvedDir);
  const sourceFiles = files.filter(f => SOURCE_EXTENSIONS.has(f.ext));
  const looseDirsOverLimit = directories.filter(d => d.sourceFileCount > ((manifest && manifest.maxLooseFilesPerDirectory) || 10)).length;
  const featureCount = (manifest && manifest.activeFeatures && manifest.activeFeatures.length) || 0;

  const rankDelta = Math.abs((PATTERN_COMPLEXITY_RANK[targetPattern] || 3) - (PATTERN_COMPLEXITY_RANK[currentPattern] || 1));

  // Strategic Value (0..100)
  let strategicValue = 25;
  if (sourceFiles.length >= 25) strategicValue += 25;
  else if (sourceFiles.length >= 12) strategicValue += 12;
  if (looseDirsOverLimit > 0) strategicValue += 20;
  if (featureCount >= 3) strategicValue += 15;
  if (/multi-app|admin|mobile|api|team|scale|monorepo|saas|ecommerce|auth/i.test(reason)) strategicValue += 25;
  strategicValue = Math.min(100, strategicValue);

  // Transition Cost (0..100) = Implementation Cost + Migration Risk + Operational Fatigue
  const implementationCost = Math.min(40, Math.round(sourceFiles.length * 0.6 + rankDelta * 10));
  const migrationRisk = Math.min(35, rankDelta * 12 + (sourceFiles.length > 40 ? 12 : 5));
  const operationalFatigue = Math.min(25, targetPattern === PATTERNS.MONOREPO_WORKSPACES ? 22 : rankDelta * 8);
  const totalTransitionCost = Math.min(100, implementationCost + migrationRisk + operationalFatigue);

  const recommendMigration = strategicValue > totalTransitionCost;
  const verdict = recommendMigration ? 'RECOMMEND_MIGRATION' : 'DEFER_REFINE_INCREMENTALLY';

  const phases = [
    {
      phase: 1,
      name: 'Baseline & Isolation',
      actions: [
        'Run "dwa audit" to record baseline health score and existing violations.',
        'Optional (recommended for >20 files): isolate migration in a dedicated Git branch or worktree before moving files.'
      ]
    },
    {
      phase: 2,
      name: 'Path Alias & Manifest Preparation',
      actions: [
        'Configure @/* path aliases in tsconfig.json/jsconfig.json so relative imports do not break during moves.',
        `Generate target contract for "${targetPattern}" and verify boundaries.`
      ]
    },
    {
      phase: 3,
      name: 'Strangler-Fig Incremental Move',
      actions: [
        'Migrate one bounded domain/feature at a time, running tests after each module.',
        'Use "dwa promote" for any component or utility consumed by >=2 modules.'
      ]
    },
    {
      phase: 4,
      name: 'Verification & Sync',
      actions: [
        'Run "dwa audit" until 0 DAG errors remain.',
        'Run "dwa sync" to update architecture-manifest.json checksum and ARCHITECTURE.md.'
      ]
    }
  ];

  return {
    verdict,
    currentPattern,
    targetPattern,
    metrics: {
      sourceFileCount: sourceFiles.length,
      looseDirsOverLimit,
      featureCount,
      strategicValue,
      transitionCost: {
        implementationCost,
        migrationRisk,
        operationalFatigue,
        total: totalTransitionCost
      }
    },
    guardrailExplanation: recommendMigration
      ? `Strategic value (${strategicValue}) exceeds total transition cost (${totalTransitionCost}). Phased migration to "${targetPattern}" is justified.`
      : `Transition cost (${totalTransitionCost}) exceeds current strategic value (${strategicValue}). Avoid premature re-architecture (Over-Engineering); refine incrementally with co-location and "dwa promote" until migration triggers are met.`,
    phases
  };
}

module.exports = {
  planMigration
};
