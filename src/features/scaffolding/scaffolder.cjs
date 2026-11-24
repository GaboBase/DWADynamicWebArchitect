'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { classifyProject } = require('../../core/classifier.cjs');
const { buildManifest } = require('./manifest-builder.cjs');
const { buildArchitectureMarkdown } = require('./doc-builder.cjs');
const { buildCreationScripts, renderTreeAscii } = require('./script-builder.cjs');

function scaffoldProject(options = {}) {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const apply = Boolean(options.apply);
  const classification = classifyProject({
    context: options.context || '',
    projectName: options.projectName || path.basename(targetDir),
    framework: options.framework || null,
    pattern: options.pattern || null,
    features: options.features || [],
    targetDir: fs.existsSync(targetDir) ? targetDir : null
  });

  const { manifest, blueprint } = buildManifest(classification, {
    description: options.description,
    maxLooseFilesPerDirectory: options.maxLooseFilesPerDirectory,
    promotionThreshold: options.promotionThreshold
  });

  const starterFiles = (blueprint.starterFiles || []).filter(sf => {
    if (sf.onlyIfVanilla) return classification.stack.framework === 'vanilla-web';
    return true;
  });

  const architectureMd = buildArchitectureMarkdown(manifest);
  const scripts = buildCreationScripts(blueprint.directories, starterFiles);
  const treeAscii = renderTreeAscii(blueprint.directories, starterFiles);

  const written = [];
  const skipped = [];

  if (apply) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const relDir of blueprint.directories) {
      const absDir = path.join(targetDir, relDir);
      if (!fs.existsSync(absDir)) {
        fs.mkdirSync(absDir, { recursive: true });
        written.push(`${relDir}/`);
      } else {
        skipped.push(`${relDir}/ (already exists)`);
      }
    }

    for (const fileSpec of starterFiles) {
      const absFile = path.join(targetDir, fileSpec.path);
      if (!fs.existsSync(absFile)) {
        fs.mkdirSync(path.dirname(absFile), { recursive: true });
        fs.writeFileSync(absFile, fileSpec.content, 'utf8');
        written.push(fileSpec.path);
      } else {
        skipped.push(`${fileSpec.path} (preserved)`);
      }
    }

    const manifestPath = path.join(targetDir, 'architecture-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    written.push('architecture-manifest.json');

    const docPath = path.join(targetDir, 'ARCHITECTURE.md');
    const existingDoc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : null;
    fs.writeFileSync(docPath, buildArchitectureMarkdown(manifest, existingDoc), 'utf8');
    written.push('ARCHITECTURE.md');
  }

  return {
    mode: apply ? 'applied' : 'dry-run',
    targetDir,
    classification,
    manifest,
    directories: blueprint.directories,
    starterFiles: starterFiles.map(f => f.path),
    treeAscii,
    scripts,
    architectureMd,
    written,
    skipped
  };
}

module.exports = {
  scaffoldProject
};
