'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_EXTENSIONS, IGNORED_DIRS } = require('./constants.cjs');
const { parseJsonc } = require('./jsonc.cjs');

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function loadManifestIfPresent(targetDir) {
  const manifestPath = path.join(targetDir, 'architecture-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadPathAliases(targetDir, manifest = null) {
  const aliases = {};
  if (manifest && manifest.pathAliases) {
    Object.assign(aliases, manifest.pathAliases);
  }

  for (const cfgFile of ['tsconfig.json', 'jsconfig.json']) {
    const abs = path.join(targetDir, cfgFile);
    if (!fs.existsSync(abs)) continue;
    try {
      const parsed = parseJsonc(fs.readFileSync(abs, 'utf8'));
      const paths = parsed && parsed.compilerOptions && parsed.compilerOptions.paths;
      if (paths && typeof paths === 'object') {
        for (const [aliasKey, targets] of Object.entries(paths)) {
          if (Array.isArray(targets) && targets.length > 0 && typeof targets[0] === 'string') {
            aliases[aliasKey] = targets[0];
          }
        }
      }
    } catch {
      // Malformed config skipped safely
    }
  }

  return aliases;
}

function walkProjectFiles(targetDir) {
  const files = [];
  const directories = [];

  function walk(currentAbs) {
    let entries;
    try {
      entries = fs.readdirSync(currentAbs, { withFileTypes: true });
    } catch {
      return;
    }

    const relDir = toPosix(path.relative(targetDir, currentAbs));
    const looseFilesInDir = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(path.join(currentAbs, entry.name));
      } else if (entry.isFile()) {
        const absFile = path.join(currentAbs, entry.name);
        const relFile = toPosix(path.relative(targetDir, absFile));
        const ext = path.extname(entry.name).toLowerCase();
        files.push({ abs: absFile, rel: relFile, ext, name: entry.name, dir: relDir });
        if (SOURCE_EXTENSIONS.has(ext)) {
          looseFilesInDir.push(relFile);
        }
      }
    }

    if (relDir) {
      directories.push({
        rel: relDir,
        name: path.basename(currentAbs),
        sourceFileCount: looseFilesInDir.length,
        sourceFiles: looseFilesInDir
      });
    }
  }

  walk(targetDir);
  return { files, directories };
}

function extractImportsFromSource(sourceCode) {
  const imports = [];
  const lines = String(sourceCode || '').split(/\r?\n/);

  const isClientComponent = lines
    .slice(0, 8)
    .some(line => /^\s*['"]use client['"]\s*;?\s*$/.test(line));

  const patterns = [
    /^\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /^\s*export\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  const seen = new Set();
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    for (const regex of patterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const specifier = match[1];
        const key = `${idx + 1}:${specifier}`;
        if (!seen.has(key)) {
          seen.add(key);
          imports.push({ specifier, line: idx + 1 });
        }
      }
    }
  });

  const multilineRegex = /(?:^|\r?\n)\s*(?:import|export)\s+(?:type\s+)?\{[\s\S]*?\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = multilineRegex.exec(sourceCode)) !== null) {
    const specifier = m[1];
    const lineNum = sourceCode.slice(0, m.index).split(/\r?\n/).length;
    const alreadyExists = imports.some(i => i.specifier === specifier && Math.abs(i.line - lineNum) <= 15);
    if (!alreadyExists) {
      imports.push({ specifier, line: lineNum });
    }
  }

  return { imports, isClientComponent };
}

function resolveSpecifierToFile(targetDir, fromRelFile, specifier, aliases = {}) {
  const fromAbsDir = path.dirname(path.join(targetDir, fromRelFile));
  let candidateBase = null;
  let isRelative = false;
  let isAlias = false;

  if (specifier.startsWith('.')) {
    isRelative = true;
    candidateBase = path.resolve(fromAbsDir, specifier);
  } else {
    for (const [aliasPattern, targetPattern] of Object.entries(aliases)) {
      if (aliasPattern.endsWith('/*')) {
        const prefix = aliasPattern.slice(0, -1);
        if (specifier.startsWith(prefix)) {
          const rest = specifier.slice(prefix.length);
          const targetPrefix = targetPattern.replace(/\/\*$/, '').replace(/^\.\//, '');
          candidateBase = path.resolve(targetDir, targetPrefix, rest);
          isAlias = true;
          break;
        }
      } else if (specifier === aliasPattern) {
        candidateBase = path.resolve(targetDir, targetPattern.replace(/^\.\//, ''));
        isAlias = true;
        break;
      }
    }
  }

  if (!candidateBase) {
    return { kind: 'external', packageName: specifier, resolvedRel: null };
  }

  const probePaths = [
    candidateBase,
    ...Array.from(SOURCE_EXTENSIONS).map(ext => `${candidateBase}${ext}`),
    ...Array.from(SOURCE_EXTENSIONS).map(ext => path.join(candidateBase, `index${ext}`))
  ];

  if (candidateBase.endsWith('.js')) {
    const noExt = candidateBase.slice(0, -3);
    probePaths.push(`${noExt}.ts`, `${noExt}.tsx`);
  }

  for (const probe of probePaths) {
    if (fs.existsSync(probe) && fs.statSync(probe).isFile()) {
      return {
        kind: 'internal',
        isRelative,
        isAlias,
        resolvedRel: toPosix(path.relative(targetDir, probe)),
        isBarrelTarget: /^index\.[a-z]+$/i.test(path.basename(probe))
      };
    }
  }

  return {
    kind: 'internal-unresolved',
    isRelative,
    isAlias,
    resolvedRel: toPosix(path.relative(targetDir, candidateBase)),
    isBarrelTarget: false
  };
}

function buildAliasSpecifier(targetRel, aliases = {}) {
  const norm = toPosix(targetRel).replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, '');
  for (const [aliasKey, aliasTarget] of Object.entries(aliases)) {
    if (aliasKey.endsWith('/*')) {
      const aliasPrefix = aliasKey.slice(0, -1); // "@/"
      const targetPrefix = aliasTarget.replace(/\/\*$/, '').replace(/^\.\//, ''); // "src"
      if (norm.startsWith(`${targetPrefix}/`)) {
        return `${aliasPrefix}${norm.slice(targetPrefix.length + 1)}`;
      }
    }
  }
  return null;
}

module.exports = {
  toPosix,
  loadManifestIfPresent,
  loadPathAliases,
  walkProjectFiles,
  extractImportsFromSource,
  resolveSpecifierToFile,
  buildAliasSpecifier
};
