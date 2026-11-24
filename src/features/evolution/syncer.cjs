'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PATTERNS } = require('../../core/constants.cjs');
const { loadManifestIfPresent } = require('../../core/import-parser.cjs');

function listImmediateSubdirs(absDir) {
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();
}

function computeChecksum(manifest) {
  const clone = { ...manifest };
  delete clone.metadata;
  return crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
}

function syncArchitecture(targetDirInput = process.cwd(), options = {}) {
  const targetDir = path.resolve(targetDirInput);
  const manifestPath = path.join(targetDir, 'architecture-manifest.json');
  const manifest = loadManifestIfPresent(targetDir);

  if (!manifest) {
    throw new Error(`No architecture-manifest.json found in ${targetDir}. Run "dwa init" first.`);
  }

  const prevFeatures = Array.isArray(manifest.activeFeatures) ? [...manifest.activeFeatures] : [];
  let discoveredFeatures = prevFeatures;

  if (manifest.pattern === PATTERNS.FEATURE_DRIVEN_SCREAMING) {
    const featDir = path.join(targetDir, 'src', 'features');
    if (fs.existsSync(featDir)) {
      discoveredFeatures = listImmediateSubdirs(featDir);
    }
  } else if (manifest.pattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK) {
    const modDir = path.join(targetDir, 'src', 'modules');
    if (fs.existsSync(modDir)) {
      discoveredFeatures = listImmediateSubdirs(modDir);
    }
  }

  let workspaceTopology = manifest.workspaceTopology;
  if (manifest.pattern === PATTERNS.MONOREPO_WORKSPACES) {
    workspaceTopology = {
      apps: listImmediateSubdirs(path.join(targetDir, 'apps')),
      packages: listImmediateSubdirs(path.join(targetDir, 'packages'))
    };
  }

  const updatedManifest = {
    ...manifest,
    activeFeatures: discoveredFeatures,
    ...(workspaceTopology ? { workspaceTopology } : {})
  };

  const nextChecksum = computeChecksum(updatedManifest);
  updatedManifest.metadata = {
    ...(manifest.metadata || {}),
    updatedAt: new Date().toISOString(),
    manifestChecksum: nextChecksum,
    lastHealthScore: options.healthScore ?? (manifest.metadata ? manifest.metadata.lastHealthScore : null)
  };

  const addedFeatures = discoveredFeatures.filter(f => !prevFeatures.includes(f));
  const removedFeatures = prevFeatures.filter(f => !discoveredFeatures.includes(f));

  const apply = options.apply !== false;
  if (apply) {
    fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2) + '\n', 'utf8');
    if (typeof options.renderDoc === 'function') {
      const docPath = path.join(targetDir, 'ARCHITECTURE.md');
      const existingDoc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : null;
      fs.writeFileSync(docPath, options.renderDoc(updatedManifest, existingDoc), 'utf8');
    }
  }

  return {
    mode: apply ? 'applied' : 'dry-run',
    targetDir,
    manifestPath,
    previousFeatures: prevFeatures,
    activeFeatures: discoveredFeatures,
    addedFeatures,
    removedFeatures,
    manifestChecksum: nextChecksum,
    manifest: updatedManifest
  };
}

module.exports = {
  syncArchitecture
};
