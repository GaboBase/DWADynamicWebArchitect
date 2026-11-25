'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dwa = require('../src/index.cjs');

const ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(ROOT, 'src', 'mcp', 'server.cjs');

function runMcpSession(messages, cwd = os.tmpdir(), trailingNewline = true) {
  const input = messages.map(m => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n') + (trailingNewline ? '\n' : '');
  const proc = spawnSync(process.execPath, [SERVER_PATH], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 10_000
  });
  assert.equal(proc.status, 0, `MCP server exited with ${proc.status}: ${proc.stderr}`);
  const parsed = proc.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
  return { proc, parsed };
}

test('MCP server exposes valid snake_case read-only tools satisfying ^[a-zA-Z0-9_-]{1,64}$', () => {
  const { parsed } = runMcpSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'ping', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 4, method: 'resources/list', params: {} },
    { jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'dwa://schema/architecture-manifest.json' } }
  ]);

  const byId = new Map(parsed.map(m => [m.id, m]));
  assert.equal(byId.get(1).result.serverInfo.name, 'dwa');
  assert.deepEqual(byId.get(2).result, {});

  const tools = byId.get(3).result.tools;
  assert.equal(tools.length, 6);
  for (const tool of tools) {
    assert.match(tool.name, /^[a-z0-9_]+$/);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    const qualified = `mcp_dynamic-web-architect_dwa_${tool.name}`;
    assert.match(qualified, /^[a-zA-Z0-9_-]{1,64}$/, `Invalid qualified tool name: ${qualified}`);
  }

  assert.equal(byId.get(4).result.resources[0].uri, 'dwa://schema/architecture-manifest.json');
  assert.match(byId.get(5).result.contents[0].text, /json-schema\.org\/draft\/2020-12\/schema/);
});

test('MCP server executes classify, place_file, audit, promote_preview, migrate_check, and diagram read-only from isolated cwd', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-mcp-e2e-'));
  const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-mcp-cwd-'));
  try {
    dwa.scaffoldProject({
      targetDir: tmpDir,
      projectName: 'clinic-saas',
      context: 'SaaS clinico con pacientes, citas y facturacion en Next.js App Router',
      apply: true
    });
    const sharedCandidate = path.join(tmpDir, 'src/features/patients/components/TagBadge.tsx');
    fs.writeFileSync(sharedCandidate, 'export function TagBadge() { return null; }\n', 'utf8');
    fs.writeFileSync(
      path.join(tmpDir, 'src/features/appointments/components/CalendarCard.tsx'),
      "import { TagBadge } from '../../patients/components/TagBadge';\nexport const C = TagBadge;\n",
      'utf8'
    );

    const { parsed } = runMcpSession([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dwa_classify', arguments: { context: 'Payments microservice API in Node.js with Hexagonal Clean Architecture' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dwa_place_file', arguments: { filename: 'patientCard.tsx', feature: 'patients', target_dir: tmpDir } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'dwa_audit', arguments: { target_dir: tmpDir } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'dwa_promote_preview', arguments: { source_path: 'src/features/patients/components/TagBadge.tsx', target_dir: tmpDir } } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'dwa_migrate_check', arguments: { target_pattern: 'monorepo-workspaces', target_dir: tmpDir, reason: 'Evaluate split' } } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'dwa_diagram', arguments: { target_dir: tmpDir } } },
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'dwa_audit', arguments: { target_dir: path.join(tmpDir, 'does-not-exist') } } }
    ], isolatedCwd);

    const byId = new Map(parsed.map(m => [m.id, m]));
    const classifyRes = JSON.parse(byId.get(2).result.content[0].text);
    assert.equal(classifyRes.pattern, 'hexagonal-clean');

    const placeRes = JSON.parse(byId.get(3).result.content[0].text);
    assert.equal(placeRes.verdictPath, 'src/features/patients/components/PatientCard.tsx');
    assert.equal(placeRes.applied, false);
    assert.equal(fs.existsSync(path.join(tmpDir, placeRes.verdictPath)), false);

    const auditRes = JSON.parse(byId.get(4).result.content[0].text);
    assert.equal(auditRes.status, 'FAIL');
    assert.ok(auditRes.findings.some(f => f.code === 'CROSS_FEATURE_INTERNAL_IMPORT'));

    const promoteRes = JSON.parse(byId.get(5).result.content[0].text);
    assert.equal(promoteRes.mode, 'dry-run');
    assert.equal(promoteRes.destination, 'src/shared/ui/TagBadge.tsx');
    assert.equal(promoteRes.affectedFilesCount, 1);
    // Dry-run must preserve original file on disk
    assert.equal(fs.existsSync(sharedCandidate), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'src/shared/ui/TagBadge.tsx')), false);

    const migrateRes = JSON.parse(byId.get(6).result.content[0].text);
    assert.equal(migrateRes.verdict, 'DEFER_REFINE_INCREMENTALLY');

    const diagRes = JSON.parse(byId.get(7).result.content[0].text);
    assert.match(diagRes.mermaid, /flowchart TD/);

    const badAudit = byId.get(8).result;
    assert.equal(badAudit.isError, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test('MCP server drains buffered line without trailing newline on stdin EOF and recovers from parse errors', () => {
  const { parsed } = runMcpSession(
    [
      '{invalid json',
      { jsonrpc: '2.0', id: 99, method: 'ping', params: {} }
    ],
    os.tmpdir(),
    false // no trailing newline before EOF
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].error.code, -32700);
  assert.equal(parsed[1].id, 99);
  assert.deepEqual(parsed[1].result, {});
});
