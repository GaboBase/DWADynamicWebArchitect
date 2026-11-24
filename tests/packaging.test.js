'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dwa = require('../src/index.cjs');

const ROOT = path.resolve(__dirname, '..');

test('Cross-platform package validator (Antigravity, Codex, ChatGPT, VS Code) passes cleanly', () => {
  const proc = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-package.cjs')], {
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, `Package validation failed:\n${proc.stdout}\n${proc.stderr}`);
});

test('Dogfooding self-audit: Dynamic Web Architect codebase passes its own DAG & naming linter at 100/100', () => {
  const res = dwa.auditProject(ROOT);
  assert.equal(res.manifestFound, true);
  assert.equal(res.summary.errors, 0, `Unexpected self-audit errors: ${JSON.stringify(res.findings, null, 2)}`);
  assert.equal(res.summary.warnings, 0, `Unexpected self-audit warnings: ${JSON.stringify(res.findings, null, 2)}`);
  assert.equal(res.healthScore, 100);
  assert.equal(res.status, 'PASS');
});

test('CLI diagram command outputs valid Mermaid flowchart for current repository', () => {
  const proc = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'dwa.cjs'), 'diagram', ROOT], {
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /```mermaid/);
  assert.match(proc.stdout, /flowchart TD/);
});
