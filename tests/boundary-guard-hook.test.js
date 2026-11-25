'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dwa = require('../src/index.cjs');

const ROOT = path.resolve(__dirname, '..');
const HOOK_SCRIPT = path.join(ROOT, 'scripts', 'dwa-boundary-guard.cjs');

function runHook(payload, cwd, envOverrides = {}) {
  return spawnSync(process.execPath, [HOOK_SCRIPT], {
    cwd,
    input: payload ? JSON.stringify(payload) : '',
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
    timeout: 5000
  });
}

test('PostToolUse boundary guard is strictly inert and silent on non-DWA workspaces', () => {
  const nonDwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hook-nondwa-'));
  try {
    const srcDir = path.join(nonDwaDir, 'src', 'helpers');
    fs.mkdirSync(srcDir, { recursive: true });
    const badFile = path.join(srcDir, 'BadFile.tsx');
    fs.writeFileSync(badFile, "'use client';\nimport { GoogleGenAI } from '@google/genai';\nexport const x = GoogleGenAI;\n", 'utf8');

    const res = runHook({
      cwd: nonDwaDir,
      tool_name: 'write_to_file',
      tool_input: { file_path: badFile }
    }, nonDwaDir);

    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '');
    assert.equal(res.stderr.trim(), '');
  } finally {
    fs.rmSync(nonDwaDir, { recursive: true, force: true });
  }
});

test('PostToolUse boundary guard respects opt-out env flags even on DWA workspaces with violations', () => {
  const dwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hook-optout-'));
  try {
    dwa.scaffoldProject({
      targetDir: dwaDir,
      projectName: 'optout-app',
      context: 'SaaS web app with Next.js App Router and billing',
      apply: true
    });
    const leakFile = path.join(dwaDir, 'src/features/billing/components/Leak.tsx');
    fs.writeFileSync(leakFile, "'use client';\nimport OpenAI from 'openai';\nexport const c = OpenAI;\n", 'utf8');

    const resDisabled = runHook({ cwd: dwaDir, tool_input: { file_path: leakFile } }, dwaDir, { DWA_HOOK_DISABLED: '1' });
    assert.equal(resDisabled.status, 0);
    assert.equal(resDisabled.stdout.trim(), '');

    const resZero = runHook({ cwd: dwaDir, tool_input: { file_path: leakFile } }, dwaDir, { DWA_BOUNDARY_GUARD: '0' });
    assert.equal(resZero.status, 0);
    assert.equal(resZero.stdout.trim(), '');
  } finally {
    fs.rmSync(dwaDir, { recursive: true, force: true });
  }
});

test('PostToolUse boundary guard stays silent on clean edits and informs non-destructively on DWA violations', () => {
  const dwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hook-dwa-'));
  try {
    dwa.scaffoldProject({
      targetDir: dwaDir,
      projectName: 'guarded-app',
      context: 'SaaS e-commerce with billing and orders in Next.js App Router',
      apply: true
    });

    const cleanFile = path.join(dwaDir, 'src/features/billing/components/InvoiceRow.tsx');
    fs.writeFileSync(cleanFile, 'export function InvoiceRow() { return null; }\n', 'utf8');

    const cleanRes = runHook({
      cwd: dwaDir,
      tool_name: 'write_to_file',
      tool_input: { file_path: cleanFile }
    }, dwaDir);
    assert.equal(cleanRes.status, 0);
    assert.equal(cleanRes.stdout.trim(), '');

    // Inject a client/AI SDK leak and verify non-blocking informative advisory
    const leakFile = path.join(dwaDir, 'src/features/orders/components/AiLeak.tsx');
    fs.writeFileSync(leakFile, "'use client';\nimport { GoogleGenAI } from '@google/genai';\nexport const ai = GoogleGenAI;\n", 'utf8');

    const leakRes = runHook({
      cwd: dwaDir,
      tool_name: 'write_to_file',
      tool_input: { file_path: leakFile }
    }, dwaDir);

    assert.equal(leakRes.status, 0);
    const parsed = JSON.parse(leakRes.stdout.trim());
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(parsed.hookSpecificOutput.additionalContext, /CLIENT_SERVER_LEAK/);
    assert.equal(parsed.dwaGuard.status, 'FAIL');
  } finally {
    fs.rmSync(dwaDir, { recursive: true, force: true });
  }
});

test('PostToolUse boundary guard detects cycles on non-first cycle node, manifest edits, and stays inert for external non-DWA files', () => {
  const dwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hook-edge-'));
  const nonDwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hook-ext-'));
  try {
    dwa.scaffoldProject({
      targetDir: dwaDir,
      projectName: 'edge-app',
      context: 'Next.js App Router SaaS billing',
      apply: true
    });

    const cycleA = path.join(dwaDir, 'src/features/billing/utils/cycle-a.util.ts');
    const cycleB = path.join(dwaDir, 'src/features/billing/utils/cycle-b.util.ts');
    fs.writeFileSync(cycleA, "import { b } from './cycle-b.util';\nexport const a = () => b;\n", 'utf8');
    fs.writeFileSync(cycleB, "import { a } from './cycle-a.util';\nexport const b = () => a;\n", 'utf8');

    // Editing the second file in a cycle must still report CIRCULAR_DEPENDENCY
    const cycleRes = runHook({ cwd: dwaDir, tool_name: 'edit_file', tool_input: { Path: cycleB } }, dwaDir);
    assert.equal(cycleRes.status, 0);
    const cycleParsed = JSON.parse(cycleRes.stdout.trim());
    assert.match(cycleParsed.hookSpecificOutput.additionalContext, /CIRCULAR_DEPENDENCY/);

    // Editing architecture-manifest.json surfaces workspace violations
    const manRes = runHook({
      cwd: dwaDir,
      tool_name: 'write_file',
      tool_input: { Path: path.join(dwaDir, 'architecture-manifest.json') }
    }, dwaDir);
    assert.equal(manRes.status, 0);
    const manParsed = JSON.parse(manRes.stdout.trim());
    assert.match(manParsed.hookSpecificOutput.additionalContext, /CIRCULAR_DEPENDENCY/);

    // Editing a file inside an unrelated non-DWA workspace must remain silent even if cwd is a dirty DWA workspace
    fs.mkdirSync(path.join(nonDwaDir, 'src'), { recursive: true });
    const extFile = path.join(nonDwaDir, 'src', 'index.ts');
    fs.writeFileSync(extFile, 'export const ok = true;\n', 'utf8');
    const extRes = runHook({ cwd: dwaDir, tool_name: 'write_file', tool_input: { Path: extFile } }, dwaDir);
    assert.equal(extRes.status, 0);
    assert.equal(extRes.stdout.trim(), '');
  } finally {
    fs.rmSync(dwaDir, { recursive: true, force: true });
    fs.rmSync(nonDwaDir, { recursive: true, force: true });
  }
});
