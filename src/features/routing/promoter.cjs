'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_EXTENSIONS } = require('../../core/constants.cjs');
const { detectFileRole } = require('../../core/naming.cjs');
const {
  toPosix,
  loadManifestIfPresent,
  loadPathAliases,
  walkProjectFiles,
  extractImportsFromSource,
  resolveSpecifierToFile,
  buildAliasSpecifier
} = require('../../core/import-parser.cjs');

function determinePromotionDestination(sourceRel, targetScope = 'shared', manifest = null) {
  const filename = path.basename(sourceRel);
  const role = detectFileRole(filename);

  if (targetScope === 'core') {
    const coreRoot = (manifest && manifest.boundaries && manifest.boundaries.coreInfrastructure) || 'src/core';
    const sub = role === 'service' ? 'api' : role === 'types' || role === 'entity' ? 'domain' : 'config';
    return toPosix(path.join(coreRoot, sub, filename));
  }

  const sharedRoot = (manifest && manifest.boundaries && manifest.boundaries.sharedPrimitives) || 'src/shared';
  const subMap = {
    component: 'ui',
    hook: 'hooks',
    types: 'types',
    schema: 'types',
    util: 'utils',
    service: 'utils'
  };
  const sub = subMap[role] || 'utils';
  return toPosix(path.join(sharedRoot, sub, filename));
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeRelativeSpecifier(fromRelFile, toRelFile) {
  const fromDir = path.posix.dirname(fromRelFile);
  let rel = path.posix.relative(fromDir, toRelFile).replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, '');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function promoteFile({
  sourcePath,
  targetScope = 'shared', // 'shared' | 'core'
  destinationPath = null,
  targetDir = process.cwd(),
  apply = false
} = {}) {
  if (!sourcePath) throw new Error('promoteFile requires sourcePath.');

  const resolvedTargetDir = path.resolve(targetDir);
  const manifest = loadManifestIfPresent(resolvedTargetDir);
  const aliases = loadPathAliases(resolvedTargetDir, manifest);

  const absSource = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(resolvedTargetDir, sourcePath);

  if (!fs.existsSync(absSource)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  if (!fs.statSync(absSource).isFile()) {
    throw new Error(`Source path is not a file: ${sourcePath}`);
  }

  const sourceRel = toPosix(path.relative(resolvedTargetDir, absSource));
  const destRel = destinationPath
    ? toPosix(destinationPath)
    : determinePromotionDestination(sourceRel, targetScope, manifest);
  const absDest = path.resolve(resolvedTargetDir, destRel);

  const newAliasSpecifier = buildAliasSpecifier(destRel, aliases);
  const { files } = walkProjectFiles(resolvedTargetDir);
  const sourceFiles = files.filter(f => SOURCE_EXTENSIONS.has(f.ext));

  const rewrites = [];
  const consumerFeatures = new Set();
  const sourceFeatureMatch = sourceRel.match(/^src\/(?:features|modules)\/([^/]+)\//);
  if (sourceFeatureMatch) consumerFeatures.add(sourceFeatureMatch[1]);

  for (const file of sourceFiles) {
    if (file.rel === sourceRel) continue;
    const raw = fs.readFileSync(file.abs, 'utf8');
    const { imports } = extractImportsFromSource(raw);
    const fileReplacements = [];

    for (const imp of imports) {
      const resolved = resolveSpecifierToFile(resolvedTargetDir, file.rel, imp.specifier, aliases);
      if (resolved.kind === 'internal' && resolved.resolvedRel === sourceRel) {
        const replacement = newAliasSpecifier || computeRelativeSpecifier(file.rel, destRel);
        fileReplacements.push({
          line: imp.line,
          from: imp.specifier,
          to: replacement
        });
        const featMatch = file.rel.match(/^src\/(?:features|modules)\/([^/]+)\//);
        if (featMatch) consumerFeatures.add(featMatch[1]);
      }
    }

    if (fileReplacements.length > 0) {
      rewrites.push({
        file: file.rel,
        abs: file.abs,
        replacements: fileReplacements
      });
    }
  }

  // Also check if the moved file itself has relative imports that need adjustment
  const movedContent = fs.readFileSync(absSource, 'utf8');
  const movedImports = extractImportsFromSource(movedContent).imports;
  const internalRewrites = [];
  for (const imp of movedImports) {
    if (!imp.specifier.startsWith('.')) continue;
    const resolved = resolveSpecifierToFile(resolvedTargetDir, sourceRel, imp.specifier, aliases);
    if (resolved.kind === 'internal' && resolved.resolvedRel) {
      const updatedSpec = buildAliasSpecifier(resolved.resolvedRel, aliases) || computeRelativeSpecifier(destRel, resolved.resolvedRel);
      internalRewrites.push({ line: imp.line, from: imp.specifier, to: updatedSpec });
    }
  }

  if (apply) {
    if (fs.existsSync(absDest)) {
      throw new Error(`Destination already exists: ${destRel}`);
    }
    fs.mkdirSync(path.dirname(absDest), { recursive: true });

    let nextMovedContent = movedContent;
    for (const rep of internalRewrites) {
      const pattern = new RegExp(`(['"])${escapeRegExp(rep.from)}\\1`, 'g');
      nextMovedContent = nextMovedContent.replace(pattern, `$1${rep.to}$1`);
    }
    fs.writeFileSync(absDest, nextMovedContent, 'utf8');
    fs.unlinkSync(absSource);

    for (const rw of rewrites) {
      let updated = fs.readFileSync(rw.abs, 'utf8');
      for (const rep of rw.replacements) {
        const pattern = new RegExp(`(['"])${escapeRegExp(rep.from)}\\1`, 'g');
        updated = updated.replace(pattern, `$1${rep.to}$1`);
      }
      fs.writeFileSync(rw.abs, updated, 'utf8');
    }
  }

  return {
    mode: apply ? 'applied' : 'dry-run',
    source: sourceRel,
    destination: destRel,
    targetScope,
    newSpecifier: newAliasSpecifier || destRel,
    consumerFeatureCount: consumerFeatures.size,
    consumerFeatures: Array.from(consumerFeatures),
    affectedFilesCount: rewrites.length,
    rewrites: rewrites.map(r => ({ file: r.file, replacements: r.replacements })),
    internalRewrites
  };
}

module.exports = {
  promoteFile,
  determinePromotionDestination
};
