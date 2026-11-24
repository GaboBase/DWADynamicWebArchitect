'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PATTERNS } = require('../../core/constants.cjs');
const { normalizeFileName, toKebabCase, toCamelCase, toPascalCase } = require('../../core/naming.cjs');
const { loadManifestIfPresent, buildAliasSpecifier } = require('../../core/import-parser.cjs');

const SHARED_PRIMITIVE_SIGNALS = [
  'button', 'modal', 'dialog', 'input', 'badge', 'card', 'spinner', 'tooltip',
  'dropdown', 'select', 'avatar', 'toast', 'alert', 'tabs', 'table', 'accordion',
  'format-date', 'format-currency', 'debounce', 'throttle', 'cn', 'classnames',
  'shared', 'global', 'reusable', 'compartido', 'primitiva', 'agnóstico', 'agnostico'
];

const CORE_INFRA_SIGNALS = [
  'http-client', 'api-client', 'axios', 'fetch-client', 'db', 'database', 'prisma',
  'drizzle', 'redis', 'cache', 'logger', 'telemetry', 'env', 'config', 'auth-client',
  'store', 'stripe-client', 'infra', 'infraestructura', 'singleton'
];

const AI_SERVER_SIGNALS = [
  'gemini', 'genai', 'llm', 'openai', 'embedding', 'rag', 'ai-client', 'prompt-runner', 'agent-client'
];

function includesKeyword(text, keywords) {
  const lower = String(text || '').toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function placeFile({
  filename,
  context = '',
  feature = null,
  scope = null, // 'feature' | 'shared' | 'core' | 'route'
  role = null,
  atomicLevel = null, // 'atoms' | 'molecules' | 'organisms' | 'templates'
  targetDir = process.cwd(),
  apply = false
} = {}) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('placeFile requires a non-empty filename.');
  }

  const resolvedTargetDir = path.resolve(targetDir);
  const manifest = loadManifestIfPresent(resolvedTargetDir);
  const pattern = (manifest && manifest.pattern) || PATTERNS.FEATURE_DRIVEN_SCREAMING;
  const language = (manifest && manifest.stack && manifest.stack.language) || 'typescript';
  const defaultExt = language === 'javascript' ? '.js' : language === 'python' ? '.py' : '.ts';

  const inferredRole = role || (/\b(service|servicio|client|cliente|api)\b/i.test(context) && !/\.(tsx|jsx|vue|svelte|astro)$/i.test(filename) ? 'service' : null);
  const { normalized, role: detectedRole, changed: renamed } = normalizeFileName(filename, inferredRole, defaultExt);
  const combinedText = `${filename} ${context}`.toLowerCase();

  let canonicalDir = 'src/shared/utils';
  let ruleApplied = 'CO_LOCATION';
  let rationale = '';
  let barrelImpact = 'Import directly via path alias; do not create an internal sub-barrel.';

  const isAiServer = includesKeyword(combinedText, AI_SERVER_SIGNALS);
  const isCoreInfra = scope === 'core' || includesKeyword(combinedText, CORE_INFRA_SIGNALS);
  const isShared = scope === 'shared' || (!feature && includesKeyword(combinedText, SHARED_PRIMITIVE_SIGNALS));

  if (pattern === PATTERNS.CLASSIC_BY_TYPE) {
    ruleApplied = 'CLASSIC_TYPE';
    if (detectedRole === 'component') canonicalDir = 'src/components';
    else if (detectedRole === 'style') canonicalDir = 'src/styles';
    else if (detectedRole === 'route') canonicalDir = 'src/pages';
    else canonicalDir = 'src/scripts';
    rationale = 'Classic-by-Type pattern organizes assets by technical file role without feature boilerplate.';
  } else if (pattern === PATTERNS.ATOMIC_DESIGN) {
    ruleApplied = 'ATOMIC_LEVEL';
    if (detectedRole === 'component') {
      const level = atomicLevel || (includesKeyword(combinedText, ['template', 'layout', 'shell']) ? 'templates' : includesKeyword(combinedText, ['header', 'navbar', 'sidebar', 'form', 'table', 'modal', 'organism']) ? 'organisms' : includesKeyword(combinedText, ['group', 'field', 'search-bar', 'card', 'molecule']) ? 'molecules' : 'atoms');
      canonicalDir = `src/components/${level}`;
      rationale = `Atomic Design classifies "${normalized}" at the "${level}" visual hierarchy level.`;
      barrelImpact = 'Export stable public primitives explicitly from src/index.ts; avoid sub-folder barrels.';
    } else if (detectedRole === 'hook') {
      canonicalDir = 'src/hooks';
      rationale = 'Reusable UI hooks belong in src/hooks/.';
    } else if (detectedRole === 'types') {
      canonicalDir = 'src/types';
      rationale = 'Shared component contracts belong in src/types/.';
    } else {
      canonicalDir = 'src/utils';
      rationale = 'Pure helper functions belong in src/utils/.';
    }
  } else if (pattern === PATTERNS.HEXAGONAL_CLEAN) {
    ruleApplied = 'HEXAGONAL_LAYER';
    const root = language === 'go' ? 'internal' : 'src';
    if (isAiServer) {
      canonicalDir = `${root}/infrastructure/ai`;
      ruleApplied = 'AI_SERVER_BOUNDARY';
      rationale = 'AI SDK integrations are external adapters and belong strictly inside infrastructure/ai/.';
    } else if (detectedRole === 'entity') {
      canonicalDir = `${root}/domain/entities`;
      rationale = 'Core business entities stay pure inside domain/entities/.';
    } else if (detectedRole === 'repository') {
      canonicalDir = includesKeyword(combinedText, ['postgres', 'prisma', 'sql', 'mongo', 'http', 'adapter', 'impl']) ? `${root}/infrastructure/db` : `${root}/domain/repositories`;
      rationale = canonicalDir.includes('infrastructure') ? 'Concrete persistence adapter belongs in infrastructure/db/.' : 'Repository port interface belongs in domain/repositories/.';
    } else if (detectedRole === 'use-case') {
      canonicalDir = `${root}/application/use-cases`;
      rationale = 'Application orchestration belongs in application/use-cases/.';
    } else if (detectedRole === 'dto' || detectedRole === 'schema') {
      canonicalDir = `${root}/application/dtos`;
      rationale = 'Data transfer contracts and validation schemas belong in application/dtos/.';
    } else if (detectedRole === 'controller') {
      canonicalDir = `${root}/interfaces/controllers`;
      rationale = 'Inbound transport handlers belong in interfaces/controllers/.';
    } else if (detectedRole === 'service') {
      canonicalDir = `${root}/infrastructure/adapters`;
      rationale = 'External service client belongs in infrastructure/adapters/.';
    } else {
      canonicalDir = `${root}/shared/utils`;
      rationale = 'Pure framework-agnostic utilities belong in shared/utils/.';
    }
  } else {
    // Feature-Driven + Screaming Architecture / Modular Monolith / Monorepo web app
    const appPrefix = pattern === PATTERNS.MONOREPO_WORKSPACES ? 'apps/web/' : '';
    const featuresRoot = pattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK ? `${appPrefix}src/modules` : `${appPrefix}src/features`;

    if (scope === 'route' || detectedRole === 'route') {
      ruleApplied = 'ROUTING_SHELL';
      const shellDir = (manifest && manifest.routingShell && manifest.routingShell.directory) || `${appPrefix}src/app`;
      canonicalDir = feature ? `${shellDir}/${toKebabCase(feature)}` : shellDir;
      rationale = 'Routing Shell Pattern keeps route entrypoints thin inside the framework router directory.';
    } else if (isAiServer) {
      ruleApplied = 'AI_SERVER_BOUNDARY';
      canonicalDir = pattern === PATTERNS.MONOREPO_WORKSPACES ? 'packages/ai-sdk/src' : `${appPrefix}src/core/ai`;
      rationale = 'Server-only AI client/provider code is isolated in core/ai to prevent API key leakage into client bundles.';
    } else if (isCoreInfra) {
      ruleApplied = 'CORE_INFRASTRUCTURE';
      const sub = detectedRole === 'store' ? 'store' : detectedRole === 'service' ? 'api' : 'config';
      canonicalDir = `${appPrefix}src/core/${sub}`;
      rationale = 'Singleton technical infrastructure belongs in src/core/ and may only depend on src/shared/.';
    } else if (isShared) {
      ruleApplied = 'SHARED_PRIMITIVE';
      const sub = detectedRole === 'component' ? 'ui' : detectedRole === 'hook' ? 'hooks' : detectedRole === 'types' ? 'types' : 'utils';
      canonicalDir = pattern === PATTERNS.MONOREPO_WORKSPACES ? `packages/${sub === 'ui' ? 'ui' : 'utils'}/src` : `${appPrefix}src/shared/${sub}`;
      rationale = 'Business-agnostic reusable primitive belongs in shared/ so multiple features can consume it without cross-feature coupling.';
      barrelImpact = 'Import directly via alias (e.g. @/shared/ui/Button) to preserve tree-shaking and Next.js RSC boundaries.';
    } else {
      // Co-location inside owning feature
      ruleApplied = 'CO_LOCATION';
      let ownerFeature = feature ? toKebabCase(feature) : null;
      if (!ownerFeature && manifest && Array.isArray(manifest.activeFeatures)) {
        ownerFeature = manifest.activeFeatures.find(f => combinedText.includes(f)) || null;
      }
      if (!ownerFeature) {
        // Infer feature from filename stem if reasonable, else fallback to first active feature or 'general-domain'
        ownerFeature = (manifest && manifest.activeFeatures && manifest.activeFeatures[0]) || 'core-feature';
      }
      const subMap = {
        component: pattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK ? 'ui' : 'components',
        hook: 'hooks',
        service: pattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK ? 'api' : 'services',
        'use-case': pattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK ? 'application' : 'services',
        schema: 'types',
        types: 'types',
        store: 'hooks',
        util: 'utils',
        test: 'components'
      };
      const sub = subMap[detectedRole] || 'utils';
      canonicalDir = `${featuresRoot}/${ownerFeature}/${sub}`;
      rationale = `Co-location rule: "${normalized}" serves domain "${ownerFeature}" and stays encapsulated inside ${featuresRoot}/${ownerFeature}/.`;
      barrelImpact = `Keep private to "${ownerFeature}" by default. Export from "${featuresRoot}/${ownerFeature}/index.ts" ONLY if "${manifest && manifest.routingShell && manifest.routingShell.directory || 'src/app'}" needs it.`;
    }
  }

  const canonicalPath = `${canonicalDir}/${normalized}`.replace(/\/+/g, '/');
  const aliases = (manifest && manifest.pathAliases) || { '@/*': './src/*' };
  const aliasSpecifier = buildAliasSpecifier(canonicalPath, aliases);
  const cleanStem = path.basename(normalized, path.extname(normalized)).replace(/\.(service|api|use-case|schema|types|util|store|controller|repository|entity|dto)$/i, '');
  const symbolName = detectedRole === 'component' ? toPascalCase(cleanStem) : toCamelCase(cleanStem);

  const created = [];
  if (apply) {
    const absPath = path.join(resolvedTargetDir, canonicalPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    if (!fs.existsSync(absPath)) {
      const stub = `// Created by Dynamic Web Architect (rule: ${ruleApplied})\nexport {};\n`;
      fs.writeFileSync(absPath, stub, 'utf8');
      created.push(canonicalPath);
    }
  }

  return {
    verdictPath: canonicalPath,
    originalFilename: filename,
    normalizedFilename: normalized,
    renamed,
    role: detectedRole,
    pattern,
    ruleApplied,
    rationale,
    barrelImpact,
    importExample: aliasSpecifier ? `import { ${symbolName || 'Module'} } from '${aliasSpecifier}';` : `import './${canonicalPath}';`,
    commands: {
      powershell: `New-Item -ItemType Directory -Force -Path "${canonicalDir}" | Out-Null; New-Item -ItemType File -Force -Path "${canonicalPath}" | Out-Null`,
      bash: `mkdir -p "${canonicalDir}" && touch "${canonicalPath}"`
    },
    applied: apply,
    created
  };
}

module.exports = {
  placeFile
};
