'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  FORBIDDEN_GENERIC_DIRS,
  SERVER_ONLY_PACKAGES,
  DEPRECATED_AI_PACKAGES,
  SOURCE_EXTENSIONS,
  DEFAULT_MAX_LOOSE_FILES,
  PATTERNS
} = require('../../core/constants.cjs');
const { validateFileNameInDirectory } = require('../../core/naming.cjs');
const {
  loadManifestIfPresent,
  loadPathAliases,
  walkProjectFiles,
  extractImportsFromSource,
  resolveSpecifierToFile
} = require('../../core/import-parser.cjs');

function classifyLayer(relPath, manifest) {
  const norm = relPath.replace(/\\/g, '/');

  // Monorepo apps/packages
  const appMatch = norm.match(/^apps\/([^/]+)\//);
  if (appMatch) return { layer: 'apps/*', scopeId: `app:${appMatch[1]}`, raw: `apps/${appMatch[1]}` };
  const pkgMatch = norm.match(/^packages\/([^/]+)\//);
  if (pkgMatch) return { layer: `packages/${pkgMatch[1]}`, scopeId: `pkg:${pkgMatch[1]}`, raw: `packages/${pkgMatch[1]}` };

  // Feature-driven / Modular Monolith
  const featMatch = norm.match(/^src\/(features|modules)\/([^/]+)\/(.*)$/);
  if (featMatch) {
    const rootKind = featMatch[1];
    const featName = featMatch[2];
    const subPath = featMatch[3];
    return {
      layer: `src/${rootKind}/*`,
      featureName: featName,
      scopeId: `${rootKind}:${featName}`,
      isFeatureRootBarrel: /^index\.[a-z]+$/i.test(subPath)
    };
  }

  // Hexagonal layers
  for (const hexLayer of ['domain', 'application', 'infrastructure', 'interfaces']) {
    if (norm.startsWith(`src/${hexLayer}/`) || norm.startsWith(`internal/${hexLayer}/`)) {
      const prefix = norm.startsWith('internal/') ? 'internal' : 'src';
      return { layer: `${prefix}/${hexLayer}`, scopeId: hexLayer };
    }
  }

  // Atomic layers
  for (const atomicLayer of ['tokens', 'components/atoms', 'components/molecules', 'components/organisms', 'components/templates']) {
    if (norm.startsWith(`src/${atomicLayer}/`)) {
      return { layer: `src/${atomicLayer}`, scopeId: atomicLayer };
    }
  }

  if (norm.startsWith('src/shared/')) return { layer: 'src/shared', scopeId: 'shared' };
  if (norm.startsWith('src/core/')) return { layer: 'src/core', scopeId: 'core' };

  const shellDir = manifest && manifest.routingShell && manifest.routingShell.directory;
  if (shellDir && norm.startsWith(`${shellDir.replace(/\/$/, '')}/`)) {
    return { layer: shellDir, scopeId: 'routing-shell' };
  }
  if (norm.startsWith('src/app/')) return { layer: 'src/app', scopeId: 'routing-shell' };
  if (norm.startsWith('src/pages/')) return { layer: 'src/pages', scopeId: 'routing-shell' };
  if (norm.startsWith('src/routes/')) return { layer: 'src/routes', scopeId: 'routing-shell' };

  return { layer: 'other', scopeId: 'other' };
}

function isAllowedByImportRules(fromInfo, toInfo, importRules) {
  if (!importRules || fromInfo.layer === 'other' || toInfo.layer === 'other') return true;
  if (fromInfo.scopeId === toInfo.scopeId) return true; // Same module/layer

  const allowed = importRules[fromInfo.layer];
  if (!allowed) return true;
  if (allowed.includes('none')) return false;

  return allowed.some(rule => {
    if (rule === toInfo.layer) return true;
    if (rule.endsWith('/*')) {
      const prefix = rule.slice(0, -2);
      return toInfo.layer.startsWith(prefix);
    }
    return false;
  });
}

function detectCycles(adjacency) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];
  const seenSignatures = new Set();

  function dfs(node, trail) {
    visited.add(node);
    stack.add(node);
    const neighbors = adjacency.get(node) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        dfs(next, [...trail, next]);
      } else if (stack.has(next)) {
        const startIdx = trail.indexOf(next);
        const cycle = trail.slice(startIdx).concat(next);
        const sig = [...cycle.slice(0, -1)].sort().join('->');
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          cycles.push(cycle);
        }
      }
    }
    stack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }

  return cycles;
}

function matchSimpleGlob(relPath, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`).test(relPath);
}

function auditProject(targetDirInput = process.cwd(), options = {}) {
  const targetDir = path.resolve(targetDirInput);
  const manifest = options.manifest || loadManifestIfPresent(targetDir);
  const aliases = loadPathAliases(targetDir, manifest);
  const maxLooseFiles = (manifest && manifest.maxLooseFilesPerDirectory) || options.maxLooseFiles || DEFAULT_MAX_LOOSE_FILES;
  const { files, directories } = walkProjectFiles(targetDir);
  const sourceFiles = files.filter(f => SOURCE_EXTENSIONS.has(f.ext));

  const findings = [];
  const adjacency = new Map();
  const reverseConsumers = new Map(); // targetRel -> Set<fromRel>

  // 1. Directory checks: forbidden dumping grounds & loose file density
  for (const dir of directories) {
    const lowerName = dir.name.toLowerCase();
    if (FORBIDDEN_GENERIC_DIRS.has(lowerName)) {
      findings.push({
        code: 'FORBIDDEN_GENERIC_DIR',
        severity: 'WARN',
        path: dir.rel,
        message: `Generic dumping-ground directory "${dir.rel}" detected. Move pure utilities to "src/shared/utils/*.util.ts" or co-locate inside the owning feature.`
      });
    }

    if (dir.sourceFileCount > maxLooseFiles) {
      findings.push({
        code: 'LOOSE_FILE_DENSITY_EXCEEDED',
        severity: 'WARN',
        path: dir.rel,
        message: `Directory "${dir.rel}" contains ${dir.sourceFileCount} loose source files (threshold: ${maxLooseFiles}). Subdivide into cohesive semantic subdirectories.`
      });
    }
  }

  // 2. Per-file checks: naming, barrels, routing shell purity, imports, security leaks
  const forbiddenBarrels = (manifest && manifest.barrelPolicy && manifest.barrelPolicy.forbiddenPaths) || [
    'src/shared/ui/index.*',
    'src/features/*/components/index.*',
    'src/components/atoms/index.*'
  ];
  const shellDir = manifest && manifest.routingShell && manifest.routingShell.enabled
    ? manifest.routingShell.directory.replace(/\/$/, '')
    : null;

  for (const file of sourceFiles) {
    // Naming validation (only inside src/ or internal/ or apps/ or packages/)
    if (/^(src|internal|apps|packages)\//.test(file.rel)) {
      const namingIssues = validateFileNameInDirectory(file.rel);
      findings.push(...namingIssues);
    }

    // Forbidden barrel files
    if (/^index\.[a-z]+$/i.test(file.name)) {
      const isForbidden = forbiddenBarrels.some(glob => matchSimpleGlob(file.rel, glob));
      if (isForbidden) {
        findings.push({
          code: 'FORBIDDEN_INTERNAL_BARREL',
          severity: 'WARN',
          path: file.rel,
          message: `Internal barrel file "${file.rel}" degrades bundler tree-shaking and risks Next.js "use client" contamination. Import directly via path alias instead.`
        });
      }
    }

    // Routing shell purity
    if (shellDir && file.rel.startsWith(`${shellDir}/`)) {
      if (/\.(service|repository|use-case|store)\.[a-z]+$/i.test(file.name)) {
        findings.push({
          code: 'ROUTING_SHELL_LOGIC_LEAK',
          severity: 'ERROR',
          path: file.rel,
          message: `Business logic file "${file.rel}" placed inside routing shell "${shellDir}". Move it into "src/features/<domain>/" or "src/core/".`
        });
      }
    }

    // Parse imports
    let content = '';
    try {
      content = fs.readFileSync(file.abs, 'utf8');
    } catch {
      continue;
    }

    const { imports, isClientComponent } = extractImportsFromSource(content);
    const fromInfo = classifyLayer(file.rel, manifest);
    if (!adjacency.has(file.rel)) adjacency.set(file.rel, []);

    for (const imp of imports) {
      // Deep relative import check (../../../)
      if (Object.keys(aliases).length > 0 && /^(\.\.\/){3,}/.test(imp.specifier)) {
        findings.push({
          code: 'DEEP_RELATIVE_IMPORT',
          severity: 'WARN',
          path: file.rel,
          line: imp.line,
          message: `Deep relative import "${imp.specifier}" at line ${imp.line}. Use configured path alias (e.g., "@/...") instead.`
        });
      }

      const resolved = resolveSpecifierToFile(targetDir, file.rel, imp.specifier, aliases);

      if (resolved.kind === 'external') {
        const pkgBase = imp.specifier.startsWith('@')
          ? imp.specifier.split('/').slice(0, 2).join('/')
          : imp.specifier.split('/')[0];

        // Deprecated AI SDK check
        if (DEPRECATED_AI_PACKAGES.includes(pkgBase)) {
          findings.push({
            code: 'DEPRECATED_AI_SDK',
            severity: 'ERROR',
            path: file.rel,
            line: imp.line,
            message: `Deprecated Gemini SDK "${pkgBase}" imported at line ${imp.line}. Migrate to "@google/genai" (>= 3.2.0) isolated inside server-only "src/core/ai/".`
          });
        }

        // Client-bundle leakage of server-only/AI/DB packages
        if (isClientComponent && SERVER_ONLY_PACKAGES.includes(pkgBase)) {
          findings.push({
            code: 'CLIENT_SERVER_LEAK',
            severity: 'ERROR',
            path: file.rel,
            line: imp.line,
            message: `Server-only package "${pkgBase}" imported inside a "use client" file at line ${imp.line}. Isolate in server-only core/infrastructure boundary.`
          });
        }

        // Hexagonal domain purity check
        if (
          manifest &&
          manifest.pattern === PATTERNS.HEXAGONAL_CLEAN &&
          fromInfo.scopeId === 'domain' &&
          ['express', 'fastify', 'next', 'react', 'vue', 'prisma', '@prisma/client', 'mongoose', 'axios', 'pg', 'mysql2', '@google/genai'].includes(pkgBase)
        ) {
          findings.push({
            code: 'HEXAGONAL_DOMAIN_IMPURITY',
            severity: 'ERROR',
            path: file.rel,
            line: imp.line,
            message: `Domain layer file "${file.rel}" imports framework/infrastructure package "${pkgBase}" at line ${imp.line}. Depend on a domain port/repository interface instead.`
          });
        }

        continue;
      }

      if (resolved.resolvedRel) {
        adjacency.get(file.rel).push(resolved.resolvedRel);
        if (!reverseConsumers.has(resolved.resolvedRel)) {
          reverseConsumers.set(resolved.resolvedRel, new Set());
        }
        reverseConsumers.get(resolved.resolvedRel).add(file.rel);

        const toInfo = classifyLayer(resolved.resolvedRel, manifest);

        // Cross-feature coupling detection
        if (
          fromInfo.featureName &&
          toInfo.featureName &&
          fromInfo.featureName !== toInfo.featureName
        ) {
          if (!toInfo.isFeatureRootBarrel) {
            findings.push({
              code: 'CROSS_FEATURE_INTERNAL_IMPORT',
              severity: 'ERROR',
              path: file.rel,
              line: imp.line,
              target: resolved.resolvedRel,
              message: `Feature "${fromInfo.featureName}" directly imports internal file "${resolved.resolvedRel}" from feature "${toInfo.featureName}" (line ${imp.line}). Promote "${resolved.resolvedRel}" to "src/shared/" via "dwa promote" or expose via "src/features/${toInfo.featureName}/index.ts".`
            });
          } else {
            findings.push({
              code: 'CROSS_FEATURE_BARREL_COUPLING',
              severity: 'INFO',
              path: file.rel,
              line: imp.line,
              target: resolved.resolvedRel,
              message: `Feature "${fromInfo.featureName}" imports public barrel of feature "${toInfo.featureName}". Verify if the shared asset belongs in "src/shared/" or "src/core/".`
            });
          }
          continue;
        }

        // DAG Layer Boundary Enforcement
        if (manifest && manifest.importRules) {
          const allowed = isAllowedByImportRules(fromInfo, toInfo, manifest.importRules);
          if (!allowed) {
            findings.push({
              code: 'DAG_BOUNDARY_VIOLATION',
              severity: 'ERROR',
              path: file.rel,
              line: imp.line,
              target: resolved.resolvedRel,
              message: `Illegal DAG dependency at line ${imp.line}: layer "${fromInfo.layer}" cannot import from "${toInfo.layer}" ("${resolved.resolvedRel}").`
            });
          }
        }
      }
    }
  }

  // 3. Circular dependency detection
  const cycles = detectCycles(adjacency);
  for (const cycle of cycles) {
    findings.push({
      code: 'CIRCULAR_DEPENDENCY',
      severity: 'ERROR',
      path: cycle[0],
      cycle,
      message: `Circular dependency detected: ${cycle.join(' -> ')}`
    });
  }

  // 4. Promotion candidates (files inside a feature imported by >= threshold distinct features)
  const threshold = (manifest && manifest.promotionThreshold) || 2;
  const promotionCandidates = [];
  for (const [targetRel, consumerSet] of reverseConsumers.entries()) {
    const targetInfo = classifyLayer(targetRel, manifest);
    if (!targetInfo.featureName) continue;
    const consumerFeatures = new Set([targetInfo.featureName]);
    for (const c of consumerSet) {
      const cInfo = classifyLayer(c, manifest);
      if (cInfo.featureName) consumerFeatures.add(cInfo.featureName);
    }
    if (consumerFeatures.size >= threshold) {
      promotionCandidates.push({
        file: targetRel,
        ownerFeature: targetInfo.featureName,
        consumingFeatures: Array.from(consumerFeatures),
        consumerFiles: Array.from(consumerSet)
      });
    }
  }

  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARN');
  const infos = findings.filter(f => f.severity === 'INFO');
  const healthScore = Math.max(0, Math.min(100, 100 - errors.length * 12 - warnings.length * 4));

  return {
    targetDir,
    manifestFound: Boolean(manifest),
    pattern: manifest ? manifest.pattern : '[NO DETERMINABLE]',
    filesScanned: sourceFiles.length,
    directoriesScanned: directories.length,
    healthScore,
    status: errors.length === 0 ? (warnings.length === 0 ? 'PASS' : 'PASS_WITH_WARNINGS') : 'FAIL',
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
      cycles: cycles.length,
      promotionCandidates: promotionCandidates.length
    },
    findings,
    promotionCandidates
  };
}

module.exports = {
  auditProject,
  classifyLayer,
  detectCycles
};
