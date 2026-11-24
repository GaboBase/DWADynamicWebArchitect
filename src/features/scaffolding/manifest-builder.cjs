'use strict';

const crypto = require('node:crypto');
const {
  SCHEMA_VERSION,
  DEFAULT_MAX_LOOSE_FILES,
  DEFAULT_PROMOTION_THRESHOLD,
  PATTERNS,
  NAMING_CONVENTIONS,
  SERVER_ONLY_PACKAGES
} = require('../../core/constants.cjs');

function computeManifestChecksum(manifestWithoutMeta) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(manifestWithoutMeta))
    .digest('hex');
}

function buildPatternBlueprint(classification) {
  const { pattern, stack, routingShell, activeFeatures, securityProfile } = classification;
  const aiEnabled = Boolean(stack.aiSdk);
  const extraCore = securityProfile.extraCoreDirs || [];

  switch (pattern) {
    case PATTERNS.CLASSIC_BY_TYPE: {
      const isAstro = stack.framework === 'astro';
      const dirs = isAstro
        ? ['src/assets', 'src/styles', 'src/scripts', 'src/pages', 'src/components', 'public']
        : ['src/assets', 'src/styles', 'src/scripts', 'src/pages', 'src/components', 'public'];
      return {
        pathAliases: { '@/*': './src/*' },
        boundaries: {
          pages: 'src/pages',
          components: 'src/components',
          styles: 'src/styles',
          scripts: 'src/scripts',
          assets: 'src/assets'
        },
        importRules: {
          'src/scripts': ['none'],
          'src/components': ['src/scripts', 'src/styles'],
          'src/pages': ['src/components', 'src/scripts', 'src/styles']
        },
        barrelPolicy: {
          mode: 'minimal',
          allowedPaths: [],
          forbiddenPaths: ['src/components/index.*']
        },
        directories: dirs,
        starterFiles: [
          { path: 'src/pages/index.html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Web Project</title>\n</head>\n<body>\n  <main><h1>Ready</h1></main>\n</body>\n</html>\n', onlyIfVanilla: true }
        ]
      };
    }

    case PATTERNS.ATOMIC_DESIGN: {
      const dirs = [
        'src/tokens',
        'src/components/atoms',
        'src/components/molecules',
        'src/components/organisms',
        'src/components/templates',
        'src/hooks',
        'src/utils',
        'src/types'
      ];
      return {
        pathAliases: { '@/*': './src/*' },
        boundaries: {
          tokens: 'src/tokens',
          atoms: 'src/components/atoms',
          molecules: 'src/components/molecules',
          organisms: 'src/components/organisms',
          templates: 'src/components/templates',
          hooks: 'src/hooks',
          utils: 'src/utils'
        },
        importRules: {
          'src/tokens': ['none'],
          'src/utils': ['none'],
          'src/hooks': ['src/utils'],
          'src/components/atoms': ['src/tokens', 'src/utils', 'src/hooks'],
          'src/components/molecules': ['src/components/atoms', 'src/tokens', 'src/utils', 'src/hooks'],
          'src/components/organisms': ['src/components/molecules', 'src/components/atoms', 'src/tokens', 'src/hooks', 'src/utils'],
          'src/components/templates': ['src/components/organisms', 'src/components/molecules', 'src/components/atoms', 'src/tokens']
        },
        barrelPolicy: {
          mode: 'package-entrypoints-only',
          allowedPaths: ['src/index.ts'],
          forbiddenPaths: ['src/components/atoms/index.*', 'src/components/molecules/index.*']
        },
        directories: dirs,
        starterFiles: [
          { path: 'src/index.ts', content: '// Public Design System entry point — export stable primitives explicitly.\nexport {};\n' }
        ]
      };
    }

    case PATTERNS.HEXAGONAL_CLEAN: {
      const isPy = stack.language === 'python';
      const isGo = stack.language === 'go';
      const root = isGo ? 'internal' : 'src';
      const dirs = [
        `${root}/domain/entities`,
        `${root}/domain/repositories`,
        `${root}/domain/errors`,
        `${root}/application/use-cases`,
        `${root}/application/dtos`,
        `${root}/infrastructure/db`,
        `${root}/infrastructure/http`,
        `${root}/infrastructure/adapters`,
        `${root}/interfaces/controllers`,
        `${root}/interfaces/routes`,
        `${root}/shared/utils`
      ];
      if (aiEnabled) dirs.push(`${root}/infrastructure/ai`);
      for (const ec of extraCore) dirs.push(`${root}/infrastructure/${ec}`);
      return {
        pathAliases: isPy || isGo ? {} : { '@/*': `./${root}/*` },
        boundaries: {
          domain: `${root}/domain`,
          application: `${root}/application`,
          infrastructure: `${root}/infrastructure`,
          interfaces: `${root}/interfaces`,
          shared: `${root}/shared`
        },
        importRules: {
          [`${root}/shared`]: ['none'],
          [`${root}/domain`]: [`${root}/shared`],
          [`${root}/application`]: [`${root}/domain`, `${root}/shared`],
          [`${root}/infrastructure`]: [`${root}/domain`, `${root}/application`, `${root}/shared`],
          [`${root}/interfaces`]: [`${root}/application`, `${root}/domain`, `${root}/shared`]
        },
        barrelPolicy: {
          mode: 'minimal',
          allowedPaths: [],
          forbiddenPaths: [`${root}/infrastructure/index.*`]
        },
        directories: dirs,
        starterFiles: []
      };
    }

    case PATTERNS.MONOREPO_WORKSPACES: {
      const apps = ['web', 'admin', 'api'];
      const packages = ['ui', 'domain', 'config', 'utils'];
      if (aiEnabled) packages.push('ai-sdk');
      const dirs = [];
      for (const app of apps) {
        if (app === 'api') {
          dirs.push(`apps/${app}/src/domain`, `apps/${app}/src/application`, `apps/${app}/src/infrastructure`, `apps/${app}/src/interfaces`);
        } else {
          dirs.push(`apps/${app}/src/app`, `apps/${app}/src/features`, `apps/${app}/src/shared`, `apps/${app}/src/core`);
        }
      }
      for (const pkg of packages) {
        dirs.push(`packages/${pkg}/src`);
      }
      return {
        pathAliases: { '@/*': './src/*' },
        boundaries: {
          apps: 'apps',
          packages: 'packages',
          sharedUi: 'packages/ui/src',
          sharedDomain: 'packages/domain/src',
          sharedUtils: 'packages/utils/src'
        },
        importRules: {
          'packages/utils': ['none'],
          'packages/config': ['none'],
          'packages/domain': ['packages/utils'],
          'packages/ui': ['packages/utils', 'packages/config'],
          'apps/*': ['packages/*']
        },
        barrelPolicy: {
          mode: 'package-entrypoints-only',
          allowedPaths: ['packages/*/src/index.ts'],
          forbiddenPaths: ['packages/ui/src/components/index.*']
        },
        workspaceTopology: { apps, packages },
        directories: dirs,
        starterFiles: packages.map(pkg => ({
          path: `packages/${pkg}/src/index.ts`,
          content: `// Public package API for @workspace/${pkg}\nexport {};\n`
        }))
      };
    }

    case PATTERNS.MODULAR_MONOLITH_FULLSTACK: {
      const shellDir = routingShell.directory || 'src/app';
      const dirs = [
        shellDir,
        'src/shared/ui',
        'src/shared/hooks',
        'src/shared/utils',
        'src/shared/types',
        'src/core/config',
        'src/core/db',
        'src/core/http'
      ];
      if (aiEnabled) dirs.push('src/core/ai');
      for (const ec of extraCore) dirs.push(`src/core/${ec}`);

      const starterFiles = [];
      for (const feat of activeFeatures) {
        dirs.push(
          `src/modules/${feat}/domain`,
          `src/modules/${feat}/application`,
          `src/modules/${feat}/ui`,
          `src/modules/${feat}/api`
        );
        starterFiles.push({
          path: `src/modules/${feat}/index.ts`,
          content: `// Public API contract for module "${feat}"\nexport {};\n`
        });
      }
      return {
        pathAliases: { '@/*': './src/*' },
        boundaries: {
          routingShell: shellDir,
          domainModules: 'src/modules',
          sharedPrimitives: 'src/shared',
          coreInfrastructure: 'src/core'
        },
        importRules: {
          'src/shared': ['none'],
          'src/core': ['src/shared'],
          'src/modules/*': ['src/shared', 'src/core'],
          [shellDir]: ['src/modules/*', 'src/shared', 'src/core']
        },
        barrelPolicy: {
          mode: 'feature-public-api-only',
          allowedPaths: ['src/modules/*/index.ts'],
          forbiddenPaths: ['src/shared/ui/index.*', 'src/modules/*/ui/index.*']
        },
        directories: dirs,
        starterFiles
      };
    }

    case PATTERNS.FEATURE_DRIVEN_SCREAMING:
    default: {
      const shellDir = routingShell.directory || 'src/app';
      const dirs = [
        shellDir,
        'src/shared/ui',
        'src/shared/hooks',
        'src/shared/utils',
        'src/shared/types',
        'src/core/config',
        'src/core/api',
        'src/core/store'
      ];
      if (aiEnabled) dirs.push('src/core/ai');
      for (const ec of extraCore) dirs.push(`src/core/${ec}`);

      const starterFiles = [];
      for (const feat of activeFeatures) {
        dirs.push(
          `src/features/${feat}/components`,
          `src/features/${feat}/hooks`,
          `src/features/${feat}/services`,
          `src/features/${feat}/types`,
          `src/features/${feat}/utils`
        );
        starterFiles.push({
          path: `src/features/${feat}/index.ts`,
          content: `// Public API boundary for feature "${feat}".\n// Only export contracts intended for external consumers (e.g., ${shellDir}).\nexport {};\n`
        });
      }
      return {
        pathAliases: { '@/*': './src/*' },
        boundaries: {
          routingShell: shellDir,
          domainModules: 'src/features',
          sharedPrimitives: 'src/shared',
          coreInfrastructure: 'src/core'
        },
        importRules: {
          'src/shared': ['none'],
          'src/core': ['src/shared'],
          'src/features/*': ['src/shared', 'src/core'],
          [shellDir]: ['src/features/*', 'src/shared', 'src/core']
        },
        barrelPolicy: {
          mode: 'feature-public-api-only',
          allowedPaths: ['src/features/*/index.ts'],
          forbiddenPaths: ['src/shared/ui/index.*', 'src/features/*/components/index.*']
        },
        directories: dirs,
        starterFiles
      };
    }
  }
}

function buildManifest(classification, options = {}) {
  const blueprint = buildPatternBlueprint(classification);
  const now = new Date().toISOString();

  const serverOnlyModules = [];
  if (classification.stack.aiSdk) {
    serverOnlyModules.push(
      classification.pattern === PATTERNS.HEXAGONAL_CLEAN ? 'src/infrastructure/ai' : 'src/core/ai'
    );
  }
  if (classification.pattern === PATTERNS.HEXAGONAL_CLEAN) {
    serverOnlyModules.push('src/infrastructure/db');
  } else if (classification.pattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK) {
    serverOnlyModules.push('src/core/db');
  }

  const baseManifest = {
    $schema: 'https://dynamic-web-architect.dev/schemas/architecture-manifest.schema.json',
    schemaVersion: SCHEMA_VERSION,
    project: classification.project,
    description: options.description || `${classification.project} — governed by Dynamic Web Architect (${classification.pattern})`,
    pattern: classification.pattern,
    complexityLevel: classification.complexityLevel,
    complexityScores: classification.complexityScores,
    stack: {
      framework: classification.stack.framework,
      language: classification.stack.language,
      runtime: classification.stack.language === 'python' ? 'python>=3.11' : classification.stack.language === 'go' ? 'go>=1.22' : 'node>=18',
      packageManager: classification.pattern === PATTERNS.MONOREPO_WORKSPACES ? 'pnpm' : 'npm',
      aiSdk: classification.stack.aiSdk || null
    },
    routingShell: classification.routingShell,
    pathAliases: blueprint.pathAliases,
    boundaries: blueprint.boundaries,
    importRules: blueprint.importRules,
    namingConventions: NAMING_CONVENTIONS,
    barrelPolicy: blueprint.barrelPolicy,
    securityProfile: {
      level: classification.securityProfile.level,
      verticalHints: classification.securityProfile.verticalHints,
      serverOnlyModules,
      forbiddenClientImports: SERVER_ONLY_PACKAGES.slice(0, 18)
    },
    maxLooseFilesPerDirectory: options.maxLooseFilesPerDirectory || DEFAULT_MAX_LOOSE_FILES,
    promotionThreshold: options.promotionThreshold || DEFAULT_PROMOTION_THRESHOLD,
    activeFeatures: classification.activeFeatures,
    evolution: {
      nextRecommendedPattern: classification.evolution.next || null,
      migrationTriggers: classification.evolution.triggers || []
    }
  };

  if (blueprint.workspaceTopology) {
    baseManifest.workspaceTopology = blueprint.workspaceTopology;
  }

  const checksum = computeManifestChecksum(baseManifest);
  const manifest = {
    ...baseManifest,
    metadata: {
      generatedBy: `dynamic-web-architect@${SCHEMA_VERSION}`,
      createdAt: options.createdAt || now,
      updatedAt: now,
      manifestChecksum: checksum,
      lastHealthScore: options.lastHealthScore ?? null
    }
  };

  return {
    manifest,
    blueprint
  };
}

module.exports = {
  buildManifest,
  buildPatternBlueprint,
  computeManifestChecksum
};
