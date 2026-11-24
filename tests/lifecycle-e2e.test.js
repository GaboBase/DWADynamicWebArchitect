'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dwa = require('../src/index.cjs');

function makeTempWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dwa-${prefix}-`));
}

test('Full E2E Lifecycle: init -> place-file -> audit (catch all violations) -> promote -> audit (PASS 100) -> sync', () => {
  const tmpDir = makeTempWorkspace('lifecycle');
  try {
    // 1. Dry-run init does NOT write files
    const dryRun = dwa.scaffoldProject({
      targetDir: tmpDir,
      projectName: 'shop-saas',
      context: 'SaaS e-commerce con billing, orders, catalog y Gemini AI en Next.js App Router',
      apply: false
    });
    assert.equal(dryRun.mode, 'dry-run');
    assert.equal(fs.existsSync(path.join(tmpDir, 'architecture-manifest.json')), false);

    // 2. Apply init writes manifest, ARCHITECTURE.md, dirs, barrels
    const applied = dwa.scaffoldProject({
      targetDir: tmpDir,
      projectName: 'shop-saas',
      context: 'SaaS e-commerce con billing, orders, catalog y Gemini AI en Next.js App Router',
      apply: true
    });
    assert.equal(applied.mode, 'applied');
    assert.ok(fs.existsSync(path.join(tmpDir, 'architecture-manifest.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'ARCHITECTURE.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'src/features/billing/index.ts')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'src/core/ai')));

    // Add a JSONC tsconfig.json with comments and trailing commas
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      `{
        // Project aliases
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*"], // trailing comma
          },
        },
      }\n`,
      'utf8'
    );

    // 3. place-file tests across co-location, shared, AI server-only, routing shell
    const p1 = dwa.placeFile({
      filename: 'invoice_table.tsx',
      feature: 'billing',
      targetDir: tmpDir,
      apply: true
    });
    assert.equal(p1.verdictPath, 'src/features/billing/components/InvoiceTable.tsx');
    assert.equal(p1.ruleApplied, 'CO_LOCATION');
    assert.ok(fs.existsSync(path.join(tmpDir, p1.verdictPath)));

    const p2 = dwa.placeFile({
      filename: 'formatCurrency.ts',
      context: 'shared reusable utility',
      targetDir: tmpDir,
      apply: true
    });
    assert.equal(p2.verdictPath, 'src/shared/utils/format-currency.util.ts');
    assert.equal(p2.ruleApplied, 'SHARED_PRIMITIVE');

    const p3 = dwa.placeFile({
      filename: 'geminiClient.ts',
      context: 'Gemini AI provider client',
      targetDir: tmpDir,
      apply: true
    });
    assert.equal(p3.verdictPath, 'src/core/ai/gemini-client.service.ts');
    assert.equal(p3.ruleApplied, 'AI_SERVER_BOUNDARY');

    // 4. Create realistic cross-feature coupling + multiple violations
    const priceBadgePath = path.join(tmpDir, 'src/features/billing/components/PriceBadge.tsx');
    fs.writeFileSync(priceBadgePath, 'export function PriceBadge() { return null; }\n', 'utf8');

    const billingConsumer = path.join(tmpDir, 'src/features/billing/components/InvoiceTable.tsx');
    fs.writeFileSync(
      billingConsumer,
      "import { PriceBadge } from './PriceBadge';\nexport function InvoiceTable() { return PriceBadge(); }\n",
      'utf8'
    );

    // Illegal sibling feature import (relative AND alias)
    const orderView = path.join(tmpDir, 'src/features/orders/components/OrderSummary.tsx');
    fs.writeFileSync(
      orderView,
      "import { PriceBadge } from '@/features/billing/components/PriceBadge';\nexport function OrderSummary() { return PriceBadge(); }\n",
      'utf8'
    );

    // Illegal DAG violation: shared importing feature
    const badShared = path.join(tmpDir, 'src/shared/utils/bad-helper.util.ts');
    fs.writeFileSync(
      badShared,
      "import { InvoiceTable } from '@/features/billing/components/InvoiceTable';\nexport const x = InvoiceTable;\n",
      'utf8'
    );

    // Forbidden internal barrel inside src/shared/ui/
    fs.writeFileSync(path.join(tmpDir, 'src/shared/ui/index.ts'), "export {};\n", 'utf8');

    // Forbidden generic folder + loose-file density (>10)
    const helpersDir = path.join(tmpDir, 'src/helpers');
    fs.mkdirSync(helpersDir, { recursive: true });
    for (let i = 1; i <= 11; i += 1) {
      fs.writeFileSync(path.join(helpersDir, `item-${i}.util.ts`), `export const n${i} = ${i};\n`, 'utf8');
    }

    // Client-bundle AI leakage + deprecated SDK + routing shell logic leak + circular dependency
    fs.writeFileSync(
      path.join(tmpDir, 'src/features/catalog/components/AiWidget.tsx'),
      "'use client';\nimport { GoogleGenAI } from '@google/genai';\nimport { GoogleGenerativeAI } from '@google/generative-ai';\nexport const w = [GoogleGenAI, GoogleGenerativeAI];\n",
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src/app/checkout.service.ts'),
      'export const runCheckout = () => true;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src/features/catalog/utils/cycle-a.util.ts'),
      "import { b } from './cycle-b.util';\nexport const a = () => b;\n",
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src/features/catalog/utils/cycle-b.util.ts'),
      "import { a } from './cycle-a.util';\nexport const b = () => a;\n",
      'utf8'
    );

    // 5. Run audit — verify every single rule triggers accurately!
    const dirtyAudit = dwa.auditProject(tmpDir);
    assert.equal(dirtyAudit.status, 'FAIL');
    const codes = new Set(dirtyAudit.findings.map(f => f.code));
    assert.ok(codes.has('CROSS_FEATURE_INTERNAL_IMPORT'), 'Detects cross-feature internal import');
    assert.ok(codes.has('DAG_BOUNDARY_VIOLATION'), 'Detects shared -> features DAG violation');
    assert.ok(codes.has('CIRCULAR_DEPENDENCY'), 'Detects DFS cycle');
    assert.ok(codes.has('FORBIDDEN_INTERNAL_BARREL'), 'Detects src/shared/ui/index.ts barrel');
    assert.ok(codes.has('FORBIDDEN_GENERIC_DIR'), 'Detects helpers/ dumping ground');
    assert.ok(codes.has('LOOSE_FILE_DENSITY_EXCEEDED'), 'Detects >10 loose files');
    assert.ok(codes.has('CLIENT_SERVER_LEAK'), 'Detects "use client" importing @google/genai');
    assert.ok(codes.has('DEPRECATED_AI_SDK'), 'Detects @google/generative-ai');
    assert.ok(codes.has('ROUTING_SHELL_LOGIC_LEAK'), 'Detects service inside src/app/');
    assert.ok(dirtyAudit.promotionCandidates.some(c => c.file === 'src/features/billing/components/PriceBadge.tsx'));

    // 6. Promote PriceBadge.tsx safely to src/shared/ui/PriceBadge.tsx and verify import rewrites!
    const promoDry = dwa.promoteFile({
      sourcePath: 'src/features/billing/components/PriceBadge.tsx',
      targetDir: tmpDir,
      apply: false
    });
    assert.equal(promoDry.mode, 'dry-run');
    assert.equal(promoDry.destination, 'src/shared/ui/PriceBadge.tsx');
    assert.equal(promoDry.affectedFilesCount, 2);

    const promoApply = dwa.promoteFile({
      sourcePath: 'src/features/billing/components/PriceBadge.tsx',
      targetDir: tmpDir,
      apply: true
    });
    assert.equal(promoApply.mode, 'applied');
    assert.equal(fs.existsSync(priceBadgePath), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'src/shared/ui/PriceBadge.tsx')), true);
    assert.match(fs.readFileSync(billingConsumer, 'utf8'), /@\/shared\/ui\/PriceBadge/);
    assert.match(fs.readFileSync(orderView, 'utf8'), /@\/shared\/ui\/PriceBadge/);

    // 7. Remove the remaining deliberately injected faults and verify clean PASS 100/100
    fs.unlinkSync(badShared);
    fs.unlinkSync(path.join(tmpDir, 'src/shared/ui/index.ts'));
    fs.rmSync(helpersDir, { recursive: true, force: true });
    fs.unlinkSync(path.join(tmpDir, 'src/features/catalog/components/AiWidget.tsx'));
    fs.unlinkSync(path.join(tmpDir, 'src/app/checkout.service.ts'));
    fs.unlinkSync(path.join(tmpDir, 'src/features/catalog/utils/cycle-a.util.ts'));
    fs.unlinkSync(path.join(tmpDir, 'src/features/catalog/utils/cycle-b.util.ts'));

    const cleanAudit = dwa.auditProject(tmpDir);
    assert.equal(cleanAudit.status, 'PASS');
    assert.equal(cleanAudit.healthScore, 100);
    assert.equal(cleanAudit.summary.errors, 0);
    assert.equal(cleanAudit.summary.warnings, 0);

    // 8. Add new feature + custom ADR note in ARCHITECTURE.md, then run sync
    fs.mkdirSync(path.join(tmpDir, 'src/features/notifications/components'), { recursive: true });
    const docPath = path.join(tmpDir, 'ARCHITECTURE.md');
    const customNote = '- ADR-001: Keep billing webhooks idempotent via SHA-256 ledger.';
    fs.appendFileSync(docPath, `${customNote}\n`, 'utf8');

    const synced = dwa.syncArchitecture(tmpDir);
    assert.ok(synced.activeFeatures.includes('notifications'));
    assert.ok(synced.addedFeatures.includes('notifications'));
    assert.equal(synced.healthScore, 100);
    assert.ok(fs.readFileSync(docPath, 'utf8').includes(customNote), 'sync preserves custom ADR notes');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
