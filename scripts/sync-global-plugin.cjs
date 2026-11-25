#!/usr/bin/env node
'use strict';

/**
 * Syncs a clean, self-contained copy of the Dynamic Web Architect plugin bundle
 * to the local Antigravity global plugins directory (~/.gemini/config/plugins/dynamic-web-architect).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const TARGET_ROOT = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'dynamic-web-architect');

const INCLUDE_PATHS = [
  'plugin.json',
  'mcp_config.json',
  'hooks.json',
  '.codex-plugin',
  'package.json',
  'README.md',
  'ANTIGRAVITY_HANDOFF.md',
  'agents',
  'assets',
  'rules',
  'schemas',
  'skills',
  'bin',
  'src',
  'scripts/dwa-boundary-guard.cjs',
  'docs',
  'portable-adapters',
  '.github'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  fs.mkdirSync(TARGET_ROOT, { recursive: true });
  let copied = 0;

  for (const rel of INCLUDE_PATHS) {
    const src = path.join(SOURCE_ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(TARGET_ROOT, rel);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    copyRecursive(src, dest);
    copied += 1;
  }

  console.log(`Synced ${copied} entries to global Antigravity plugin: ${TARGET_ROOT}`);
}

main();
