'use strict';

function buildCreationScripts(directories = [], starterFiles = []) {
  const uniqueDirs = Array.from(new Set(directories)).sort();

  const psLines = [
    '# PowerShell reproducible directory scaffolding script (Dynamic Web Architect)',
    '$dirs = @(',
    ...uniqueDirs.map(d => `  "${d.replace(/\\/g, '/')}"`),
    ')',
    'foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }',
    'Write-Host "Scaffolded $($dirs.length) directories successfully."'
  ];

  const bashLines = [
    '#!/usr/bin/env bash',
    '# Bash reproducible directory scaffolding script (Dynamic Web Architect)',
    'set -euo pipefail',
    ...uniqueDirs.map(d => `mkdir -p "${d.replace(/\\/g, '/')}"`),
    `echo "Scaffolded ${uniqueDirs.length} directories successfully."`
  ];

  return {
    powershell: psLines.join('\n'),
    bash: bashLines.join('\n'),
    starterFileCount: starterFiles.length
  };
}

function renderTreeAscii(directories = [], starterFiles = []) {
  const root = {};
  const addPath = (p, isFile = false) => {
    const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
    let cursor = root;
    parts.forEach((part, idx) => {
      const leaf = isFile && idx === parts.length - 1;
      if (!cursor[part]) {
        cursor[part] = leaf ? null : {};
      }
      if (!leaf && cursor[part] !== null) {
        cursor = cursor[part];
      }
    });
  };

  for (const d of directories) addPath(d, false);
  for (const f of starterFiles) addPath(f.path, true);
  addPath('architecture-manifest.json', true);
  addPath('ARCHITECTURE.md', true);

  const lines = [];
  const walk = (node, prefix = '') => {
    const entries = Object.keys(node).sort((a, b) => {
      const aIsDir = node[a] !== null;
      const bIsDir = node[b] !== null;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });
    entries.forEach((key, index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const isDir = node[key] !== null;
      lines.push(`${prefix}${connector}${key}${isDir ? '/' : ''}`);
      if (isDir) {
        walk(node[key], prefix + (isLast ? '    ' : '│   '));
      }
    });
  };
  walk(root);
  return lines.join('\n');
}

module.exports = {
  buildCreationScripts,
  renderTreeAscii
};
