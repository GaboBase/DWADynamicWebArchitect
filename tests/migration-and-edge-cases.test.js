'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dwa = require('../src/index.cjs');

const ROOT = path.resolve(__dirname, '..');

test('JSONC parser handles comments, trailing commas, and URL strings safely', () => {
  const sample = `{
    // Line comment
    "homepage": "https://example.com//not-a-comment",
    /* Block comment
       spanning lines */
    "compilerOptions": {
      "paths": {
        "@/*": ["./src/*",],
      },
    },
  }`;
  const parsed = dwa.parseJsonc(sample);
  assert.equal(parsed.homepage, 'https://example.com//not-a-comment');
  assert.deepEqual(parsed.compilerOptions.paths['@/*'], ['./src/*']);
});

test('Migration Transition Cost Guardrail defers premature migration and approves justified migration', () => {
  const smallDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-mig-small-'));
  const largeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-mig-large-'));

  try {
    // Small 2-file static site trying to jump straight to monorepo -> DEFER
    dwa.scaffoldProject({
      targetDir: smallDir,
      projectName: 'tiny-site',
      context: 'Landing page simple en HTML',
      apply: true
    });
    const deferRes = dwa.planMigration({
      targetDir: smallDir,
      targetPattern: 'monorepo-workspaces',
      reason: 'maybe someday'
    });
    assert.equal(deferRes.verdict, 'DEFER_REFINE_INCREMENTALLY');

    // Growing 30-file multi-domain classic project with saturated folder -> RECOMMEND_MIGRATION
    dwa.scaffoldProject({
      targetDir: largeDir,
      projectName: 'growing-saas',
      context: 'Landing page simple en Astro',
      apply: true
    });
    for (let i = 1; i <= 30; i += 1) {
      fs.writeFileSync(path.join(largeDir, `src/components/Comp${i}.tsx`), `export const C${i} = ${i};\n`, 'utf8');
    }
    const recRes = dwa.planMigration({
      targetDir: largeDir,
      targetPattern: 'feature-driven-screaming',
      reason: 'Adding SaaS auth, billing, and multi-team ecommerce modules'
    });
    assert.equal(recRes.verdict, 'RECOMMEND_MIGRATION');
    assert.equal(recRes.phases.length, 4);
  } finally {
    fs.rmSync(smallDir, { recursive: true, force: true });
    fs.rmSync(largeDir, { recursive: true, force: true });
  }
});

test('Hexagonal domain purity audit flags ORM/framework imports inside src/domain/', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hex-'));
  try {
    dwa.scaffoldProject({
      targetDir: tmpDir,
      projectName: 'orders-api',
      context: 'Backend API REST en Node.js con arquitectura hexagonal',
      apply: true
    });

    fs.writeFileSync(
      path.join(tmpDir, 'src/domain/entities/order.entity.ts'),
      "import { PrismaClient } from '@prisma/client';\nexport class Order { db = new PrismaClient(); }\n",
      'utf8'
    );

    const res = dwa.auditProject(tmpDir);
    assert.equal(res.status, 'FAIL');
    assert.ok(res.findings.some(f => f.code === 'HEXAGONAL_DOMAIN_IMPURITY'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI runner (skills/dynamic-web-architect/scripts/dwa-runner.cjs) executes classify JSON cleanly', () => {
  const runnerPath = path.join(ROOT, 'skills', 'dynamic-web-architect', 'scripts', 'dwa-runner.cjs');
  const proc = spawnSync(
    process.execPath,
    [runnerPath, 'classify', '--context', 'SaaS ERP con Next.js App Router y Gemini', '--json'],
    { encoding: 'utf8' }
  );
  assert.equal(proc.status, 0, `Runner exited with error: ${proc.stderr}`);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.pattern, 'feature-driven-screaming');
  assert.equal(parsed.stack.aiSdk, '@google/genai');
});
