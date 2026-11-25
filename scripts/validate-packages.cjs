#!/usr/bin/env node
'use strict';

/**
 * Dynamic Web Architect (DWA) — Multi-Host Target & Package Validator
 *
 * Enforces:
 * 1. Root canonical package validation (scripts/validate-package.cjs).
 * 2. Budget gate: SKILL.md body, rules/AGENTS.md, and agents/dwa-master.md <= 24,000 bytes.
 * 3. Plain Markdown gate on rules/AGENTS.md (no YAML frontmatter) & subagent: true on agents/dwa-master.md.
 * 4. SVG logo existence and square >= 128x128 dimensions.
 * 5. 0 broken relative Markdown links across root and every built target.
 * 6. 0 private local path leaks across root and every built target.
 * 7. Built targets under dist/targets/{antigravity,opencode,gemini-cli,vscode-codex}:
 *    - Host-native MCP configs (`mcp_config.json`, `opencode.json`, `gemini-extension.json`, `.mcp.json` + `.vscode/mcp.json`)
 *    - Antigravity `mcp_config.json` uses `${PLUGIN_ROOT}`, NO relative `cwd`, NO disallowed `${VAR}` placeholders
 *    - Qualified MCP tool names `mcp_dynamic-web-architect_dwa_<toolName>` satisfy `^[a-zA-Z0-9_-]{1,64}$`
 *    - Live stdio MCP smoke test from an isolated temp `cwd` (`initialize`, `tools/list`, `resources/list`, `resources/read`, `dwa_classify`, `dwa_place_file`, `dwa_audit`, `dwa_promote_preview`, `dwa_migrate_check`, `dwa_diagram`)
 *    - Standalone CLI smoke test (`--help`, `classify --json`, `audit`)
 *    - Non-destructive PostToolUse `hooks.json` & guard script presence
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version || '2.0.0';
const TARGETS_ROOT = path.join(ROOT, 'dist', 'targets');
const MAX_BODY_BYTES = 24_000;
const QUALIFIED_TOOL_RX = /^[a-zA-Z0-9_-]{1,64}$/;
const EXPECTED_TOOLS = [
  'dwa_classify',
  'dwa_place_file',
  'dwa_audit',
  'dwa_promote_preview',
  'dwa_migrate_check',
  'dwa_diagram'
];

const errors = [];

function walkRootFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', '.cache'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRootFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function walkTargetFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTargetFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing JSON file: ${label}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    errors.push(`Invalid JSON in ${label}: ${err.message}`);
    return null;
  }
}

function assertRelativeAsset(baseDir, relPath, label) {
  if (!relPath || typeof relPath !== 'string') {
    errors.push(`Missing relative path in ${label}`);
    return;
  }
  if (/^(https?:|file:|\/|\\|[A-Za-z]:)/.test(relPath)) {
    errors.push(`Asset path must be relative in ${label}, got "${relPath}"`);
    return;
  }
  const resolved = path.resolve(baseDir, relPath);
  if (!fs.existsSync(resolved)) {
    errors.push(`Missing referenced asset "${relPath}" in ${label}`);
  }
}

function checkLogoSvg(baseDir, targetName) {
  const logoPath = path.join(baseDir, 'assets', 'logo.svg');
  if (!fs.existsSync(logoPath)) {
    errors.push(`[${targetName}] Missing assets/logo.svg`);
    return;
  }
  const svg = fs.readFileSync(logoPath, 'utf8');
  const wMatch = svg.match(/\bwidth="(\d+)"/);
  const hMatch = svg.match(/\bheight="(\d+)"/);
  const w = wMatch ? Number(wMatch[1]) : 0;
  const h = hMatch ? Number(hMatch[1]) : 0;
  if (w < 128 || h < 128 || w !== h) {
    errors.push(`[${targetName}] assets/logo.svg must be square >= 128x128 (got ${w}x${h})`);
  }
}

function checkMarkdownLinks(baseDir, targetName, fileList) {
  const mdFiles = fileList.filter(f => f.endsWith('.md'));
  const linkRegex = /\[[^\]]+\]\(([^)#\s]+)(?:#[^)\s]+)?\)/g;
  for (const file of mdFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);
    let m;
    while ((m = linkRegex.exec(text)) !== null) {
      const target = m[1].trim();
      if (/^(https?:|mailto:|file:|<)/.test(target)) continue;
      const resolved = path.resolve(dir, target);
      if (!fs.existsSync(resolved)) {
        errors.push(`[${targetName}] Broken relative link "${target}" in ${path.relative(baseDir, file)}`);
      }
    }
  }
}

function checkPrivatePathLeaks(baseDir, targetName, fileList) {
  const forbidden = /(?:^|[^A-Za-z0-9_])[A-Za-z]:(?![/\\]{2})[/\\]+(?:Users[/\\]+[A-Za-z0-9._-]+|CODESPACES[/\\]+)/i;
  for (const file of fileList) {
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.jpg', '.ico', '.zip', '.tar', '.gz'].includes(ext)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (forbidden.test(content)) {
      errors.push(`[${targetName}] Private local path leak in ${path.relative(baseDir, file)}`);
    }
  }
}

function checkSkillsRulesAndAgent(baseDir, targetName) {
  const rulesPath = path.join(baseDir, 'rules', 'AGENTS.md');
  if (!fs.existsSync(rulesPath)) {
    errors.push(`[${targetName}] Missing rules/AGENTS.md`);
  } else {
    const rulesText = fs.readFileSync(rulesPath, 'utf8');
    if (/^---\s*\r?\n/.test(rulesText)) {
      errors.push(`[${targetName}] rules/AGENTS.md must be plain markdown without YAML frontmatter`);
    }
    const rulesBytes = Buffer.byteLength(rulesText, 'utf8');
    if (rulesBytes > MAX_BODY_BYTES) {
      errors.push(`[${targetName}] rules/AGENTS.md exceeds ${MAX_BODY_BYTES} bytes (${rulesBytes})`);
    }
  }

  const skillPath = path.join(baseDir, 'skills', 'dynamic-web-architect', 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    errors.push(`[${targetName}] Missing skills/dynamic-web-architect/SKILL.md`);
  } else {
    const text = fs.readFileSync(skillPath, 'utf8');
    const fmMatch = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!fmMatch) {
      errors.push(`[${targetName}] Missing YAML frontmatter in skills/dynamic-web-architect/SKILL.md`);
    } else {
      const fm = fmMatch[1];
      if (!/^name:\s*dynamic-web-architect\s*$/m.test(fm)) {
        errors.push(`[${targetName}] Frontmatter name mismatch in SKILL.md`);
      }
      const body = text.slice(fmMatch[0].length);
      const bodyBytes = Buffer.byteLength(body, 'utf8');
      if (bodyBytes > MAX_BODY_BYTES) {
        errors.push(`[${targetName}] SKILL.md body exceeds ${MAX_BODY_BYTES} bytes (${bodyBytes})`);
      }
    }
  }

  const agentPath = path.join(baseDir, 'agents', 'dwa-master.md');
  if (!fs.existsSync(agentPath)) {
    errors.push(`[${targetName}] Missing agents/dwa-master.md`);
  } else {
    const agentText = fs.readFileSync(agentPath, 'utf8');
    const totalBytes = Buffer.byteLength(agentText, 'utf8');
    if (totalBytes > MAX_BODY_BYTES) {
      errors.push(`[${targetName}] agents/dwa-master.md exceeds ${MAX_BODY_BYTES} bytes (${totalBytes})`);
    }
    const fmMatch = agentText.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!fmMatch) {
      errors.push(`[${targetName}] Missing YAML frontmatter in agents/dwa-master.md`);
    } else {
      const fm = fmMatch[1];
      if (!/^name:\s*dwa-master\s*$/m.test(fm)) {
        errors.push(`[${targetName}] agents/dwa-master.md frontmatter name must be dwa-master`);
      }
      if (!/^subagent:\s*true\s*$/m.test(fm)) {
        errors.push(`[${targetName}] agents/dwa-master.md must set subagent: true`);
      }
    }
  }
}

function checkAntigravityMcpConfig(baseDir, targetName) {
  const mcpConfigPath = path.join(baseDir, 'mcp_config.json');
  const mcpCfg = readJson(mcpConfigPath, `${targetName}/mcp_config.json`);
  if (!mcpCfg) return;

  const servers = Object.entries(mcpCfg.mcpServers || {});
  if (servers.length === 0) {
    errors.push(`[${targetName}] mcp_config.json must declare at least one MCP server`);
    return;
  }
  if (!mcpCfg.mcpServers.dwa) {
    errors.push(`[${targetName}] mcp_config.json must declare serverKey "dwa"`);
  }
  if (mcpCfg.mcpServers['dynamic-web-architect']) {
    errors.push(`[${targetName}] mcp_config.json serverKey must NOT repeat plugin name`);
  }

  const allowedPlaceholders = new Set(['PLUGIN_ROOT', 'PLUGIN_DATA']);
  for (const [serverKey, cfg] of servers) {
    if (!/^[a-zA-Z0-9_-]{1,16}$/.test(serverKey)) {
      errors.push(`[${targetName}] mcp_config.json serverKey "${serverKey}" violates ^[a-zA-Z0-9_-]{1,16}$`);
    }
    if (cfg.cwd !== undefined) {
      errors.push(`[${targetName}] mcp_config.json server "${serverKey}" must NOT specify cwd ("${cfg.cwd}")`);
    }
    const args = Array.isArray(cfg.args) ? cfg.args : [];
    if (!args.some(a => typeof a === 'string' && a.includes('${PLUGIN_ROOT}'))) {
      errors.push(`[${targetName}] mcp_config.json server "${serverKey}" args must reference \${PLUGIN_ROOT}`);
    }
    for (const val of [...args, ...Object.values(cfg.env || {})]) {
      if (typeof val !== 'string') continue;
      for (const [, ph] of val.matchAll(/\$\{([^}]+)\}/g)) {
        if (!allowedPlaceholders.has(ph)) {
          errors.push(`[${targetName}] mcp_config.json server "${serverKey}" uses disallowed placeholder \${${ph}}`);
        }
      }
    }
  }
}

function checkHooksConfig(baseDir, targetName) {
  const hooksPath = path.join(baseDir, 'hooks.json');
  const hooksCfg = readJson(hooksPath, `${targetName}/hooks.json`);
  if (!hooksCfg) return;
  const guard = hooksCfg['dwa-boundary-guard'];
  if (!guard || !Array.isArray(guard.PostToolUse) || guard.PostToolUse.length === 0) {
    errors.push(`[${targetName}] hooks.json must define dwa-boundary-guard.PostToolUse`);
    return;
  }
  const entry = guard.PostToolUse[0];
  if (!entry.matcher || !Array.isArray(entry.hooks) || entry.hooks.length === 0) {
    errors.push(`[${targetName}] hooks.json PostToolUse entry must define matcher and hooks`);
    return;
  }
  const hookScript = path.join(baseDir, 'scripts', 'dwa-boundary-guard.cjs');
  if (!fs.existsSync(hookScript)) {
    errors.push(`[${targetName}] Missing scripts/dwa-boundary-guard.cjs referenced by hooks.json`);
    return;
  }
  const nonDwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-hook-smoke-'));
  try {
    const res = spawnSync(process.execPath, [hookScript], {
      cwd: baseDir,
      input: JSON.stringify({ cwd: nonDwaDir, tool_name: 'write_file', tool_input: { Path: path.join(nonDwaDir, 'src', 'a.ts') } }),
      encoding: 'utf8',
      timeout: 5000
    });
    if (res.status !== 0 || res.stdout.trim() !== '') {
      errors.push(`[${targetName}] PostToolUse boundary guard failed non-DWA inertness check (status=${res.status}, stdout=${res.stdout})`);
    }
  } finally {
    fs.rmSync(nonDwaDir, { recursive: true, force: true });
  }
}

function runMcpSmoke(baseDir, targetName) {
  const serverEntry = path.join(baseDir, 'src', 'mcp', 'server.cjs');
  if (!fs.existsSync(serverEntry)) {
    errors.push(`[${targetName}] Missing src/mcp/server.cjs`);
    return;
  }

  const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dwa-mcp-smoke-'));
  try {
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dwa-validator', version: '1.0.0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dwa_classify', arguments: { context: 'SaaS clinical scheduling with Next.js App Router and Gemini AI' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'dwa_place_file', arguments: { filename: 'InvoiceTable.tsx', feature: 'billing', target_dir: baseDir } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'dwa_audit', arguments: { target_dir: baseDir } } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'dwa_audit', arguments: { target_dir: isolatedCwd } } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'dwa_migrate_check', arguments: { target_pattern: 'monorepo-workspaces', target_dir: baseDir, reason: 'Evaluate upgrade' } } },
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'dwa_diagram', arguments: { target_dir: baseDir } } },
      { jsonrpc: '2.0', id: 9, method: 'resources/list', params: {} },
      { jsonrpc: '2.0', id: 10, method: 'resources/read', params: { uri: 'dwa://schema/architecture-manifest.json' } }
    ].map(r => JSON.stringify(r)).join('\n') + '\n';

    const smoke = spawnSync(process.execPath, [serverEntry], {
      cwd: isolatedCwd,
      input: requests,
      encoding: 'utf8',
      timeout: 10_000
    });

    if (smoke.status !== 0) {
      errors.push(`[${targetName}] MCP server exited with code ${smoke.status}: ${smoke.stderr || smoke.stdout}`);
      return;
    }

    const lines = smoke.stdout.split(/\r?\n/).filter(Boolean);
    const responses = new Map();
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) responses.set(msg.id, msg);
      } catch {
        errors.push(`[${targetName}] MCP server emitted non-JSON line on stdout: ${line.slice(0, 120)}`);
      }
    }

    const initResp = responses.get(1)?.result;
    if (!initResp || initResp.serverInfo?.name !== 'dwa') {
      errors.push(`[${targetName}] MCP initialize failed or returned wrong serverInfo.name`);
    }

    const tools = responses.get(2)?.result?.tools || [];
    const toolNames = new Set(tools.map(t => t.name));
    for (const expected of EXPECTED_TOOLS) {
      if (!toolNames.has(expected)) {
        errors.push(`[${targetName}] MCP tools/list missing expected tool "${expected}"`);
      }
    }
    for (const tool of tools) {
      if (!/^[a-z0-9_]+$/.test(tool.name) || tool.name.includes('.')) {
        errors.push(`[${targetName}] MCP tool name must be snake_case without dots: ${tool.name}`);
      }
      const qualified = `mcp_dynamic-web-architect_dwa_${tool.name}`;
      if (!QUALIFIED_TOOL_RX.test(qualified)) {
        errors.push(`[${targetName}] Qualified MCP tool name violates ^[a-zA-Z0-9_-]{1,64}$: ${qualified} (len=${qualified.length})`);
      }
    }

    const classifyData = JSON.parse(responses.get(3)?.result?.content?.[0]?.text || '{}');
    if (classifyData.pattern !== 'feature-driven-screaming') {
      errors.push(`[${targetName}] MCP dwa_classify returned unexpected pattern: ${classifyData.pattern}`);
    }

    const placeData = JSON.parse(responses.get(4)?.result?.content?.[0]?.text || '{}');
    if (placeData.verdictPath !== 'src/features/billing/components/InvoiceTable.tsx' || placeData.applied !== false) {
      errors.push(`[${targetName}] MCP dwa_place_file did not return expected dry-run placement`);
    }

    const auditTarget = JSON.parse(responses.get(5)?.result?.content?.[0]?.text || '{}');
    if (auditTarget.status !== 'PASS' || auditTarget.healthScore !== 100) {
      errors.push(`[${targetName}] MCP dwa_audit on ${targetName} expected PASS 100/100, got ${auditTarget.status} ${auditTarget.healthScore}`);
    }

    const auditEmpty = JSON.parse(responses.get(6)?.result?.content?.[0]?.text || '{}');
    if (auditEmpty.manifestFound !== false || auditEmpty.status !== 'PASS') {
      errors.push(`[${targetName}] MCP dwa_audit from isolated empty cwd failed gracefully check`);
    }

    const migrateData = JSON.parse(responses.get(7)?.result?.content?.[0]?.text || '{}');
    if (!migrateData.verdict) {
      errors.push(`[${targetName}] MCP dwa_migrate_check missing verdict`);
    }

    const diagramData = JSON.parse(responses.get(8)?.result?.content?.[0]?.text || '{}');
    if (!diagramData.mermaid || !diagramData.mermaid.includes('flowchart TD')) {
      errors.push(`[${targetName}] MCP dwa_diagram did not return Mermaid flowchart`);
    }

    const resources = responses.get(9)?.result?.resources || [];
    if (!resources.some(r => r.uri === 'dwa://schema/architecture-manifest.json')) {
      errors.push(`[${targetName}] MCP resources/list missing schema resource`);
    }

    const schemaText = responses.get(10)?.result?.contents?.[0]?.text || '';
    if (!schemaText.includes('json-schema.org/draft/2020-12/schema')) {
      errors.push(`[${targetName}] MCP resources/read returned invalid schema content`);
    }
  } finally {
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
  }
}

function runCliSmoke(baseDir, targetName) {
  const cli = path.join(baseDir, 'bin', 'dwa.cjs');
  if (!fs.existsSync(cli)) {
    errors.push(`[${targetName}] Missing bin/dwa.cjs`);
    return;
  }
  const helpRes = spawnSync(process.execPath, [cli, '--help'], { cwd: baseDir, encoding: 'utf8' });
  if (helpRes.status !== 0 || !helpRes.stdout.includes('Dynamic Web Architect')) {
    errors.push(`[${targetName}] CLI --help failed: ${helpRes.stderr || helpRes.stdout}`);
  }
  const classifyRes = spawnSync(process.execPath, [cli, 'classify', '--context', 'Landing page estatica en Astro', '--json'], {
    cwd: baseDir,
    encoding: 'utf8'
  });
  if (classifyRes.status !== 0) {
    errors.push(`[${targetName}] CLI classify failed: ${classifyRes.stderr || classifyRes.stdout}`);
  } else {
    const parsed = JSON.parse(classifyRes.stdout);
    if (parsed.pattern !== 'classic-by-type') {
      errors.push(`[${targetName}] CLI classify returned unexpected pattern: ${parsed.pattern}`);
    }
  }
}

// 1. Run canonical root package validator
const rootPkgRes = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-package.cjs')], {
  cwd: ROOT,
  encoding: 'utf8'
});
if (rootPkgRes.status !== 0) {
  errors.push(`Root validate-package.cjs failed:\n${rootPkgRes.stdout}\n${rootPkgRes.stderr}`);
}

// 2. Validate root additions
checkSkillsRulesAndAgent(ROOT, 'root');
checkLogoSvg(ROOT, 'root');
checkAntigravityMcpConfig(ROOT, 'root');
checkHooksConfig(ROOT, 'root');
checkMarkdownLinks(ROOT, 'root', walkRootFiles(ROOT));
checkPrivatePathLeaks(ROOT, 'root', walkRootFiles(ROOT));
if (!fs.existsSync(path.join(ROOT, 'ANTIGRAVITY_HANDOFF.md'))) {
  errors.push('[root] Missing ANTIGRAVITY_HANDOFF.md');
}
runMcpSmoke(ROOT, 'root');

// 3. Validate all 4 self-contained host targets
const requiredTargets = ['antigravity', 'opencode', 'gemini-cli', 'vscode-codex'];
for (const target of requiredTargets) {
  const dir = path.join(TARGETS_ROOT, target);
  if (!fs.existsSync(dir)) {
    errors.push(`Missing built target directory: dist/targets/${target} (run npm run build:targets)`);
  }
}

// antigravity
{
  const dir = path.join(TARGETS_ROOT, 'antigravity');
  if (fs.existsSync(dir)) {
    const files = walkTargetFiles(dir);
    checkSkillsRulesAndAgent(dir, 'antigravity');
    checkLogoSvg(dir, 'antigravity');
    const manifest = readJson(path.join(dir, 'plugin.json'), 'dist/targets/antigravity/plugin.json');
    if (manifest) {
      if (manifest.name !== 'dynamic-web-architect') errors.push('[antigravity] plugin.json name mismatch');
      if (manifest.version !== VERSION) errors.push('[antigravity] plugin.json version mismatch');
      assertRelativeAsset(dir, manifest.logo, 'dist/targets/antigravity/plugin.json logo');
    }
    if (!fs.existsSync(path.join(dir, 'hooks.json'))) errors.push('[antigravity] Missing hooks.json');
    if (!fs.existsSync(path.join(dir, 'ANTIGRAVITY_HANDOFF.md'))) errors.push('[antigravity] Missing ANTIGRAVITY_HANDOFF.md');
    checkHooksConfig(dir, 'antigravity');
    checkAntigravityMcpConfig(dir, 'antigravity');
    runMcpSmoke(dir, 'antigravity');
    runCliSmoke(dir, 'antigravity');
    checkMarkdownLinks(dir, 'antigravity', files);
    checkPrivatePathLeaks(dir, 'antigravity', files);
  }
}

// opencode
{
  const dir = path.join(TARGETS_ROOT, 'opencode');
  if (fs.existsSync(dir)) {
    const files = walkTargetFiles(dir);
    checkSkillsRulesAndAgent(dir, 'opencode');
    checkLogoSvg(dir, 'opencode');
    const oc = readJson(path.join(dir, 'opencode.json'), 'dist/targets/opencode/opencode.json');
    if (oc) {
      if (!oc.mcp?.dwa || oc.mcp.dwa.type !== 'local') {
        errors.push('[opencode] opencode.json must configure mcp.dwa as local MCP server');
      }
      if (!Array.isArray(oc.instructions) || !oc.instructions.includes('AGENTS.md')) {
        errors.push('[opencode] opencode.json instructions must include AGENTS.md');
      }
    }
    for (const reqFile of [
      'AGENTS.md',
      '.opencode/agents/dynamic-web-architect.md',
      '.opencode/commands/dynamic-web-architect.md',
      '.agents/skills/dynamic-web-architect/SKILL.md'
    ]) {
      if (!fs.existsSync(path.join(dir, reqFile))) errors.push(`[opencode] Missing ${reqFile}`);
    }
    runMcpSmoke(dir, 'opencode');
    runCliSmoke(dir, 'opencode');
    checkMarkdownLinks(dir, 'opencode', files);
    checkPrivatePathLeaks(dir, 'opencode', files);
  }
}

// gemini-cli
{
  const dir = path.join(TARGETS_ROOT, 'gemini-cli');
  if (fs.existsSync(dir)) {
    const files = walkTargetFiles(dir);
    checkSkillsRulesAndAgent(dir, 'gemini-cli');
    checkLogoSvg(dir, 'gemini-cli');
    const ext = readJson(path.join(dir, 'gemini-extension.json'), 'dist/targets/gemini-cli/gemini-extension.json');
    if (ext) {
      if (ext.name !== 'dynamic-web-architect') errors.push('[gemini-cli] gemini-extension.json name mismatch');
      if (ext.version !== VERSION) errors.push('[gemini-cli] gemini-extension.json version mismatch');
      if (ext.contextFileName !== 'GEMINI.md') errors.push('[gemini-cli] gemini-extension.json contextFileName must be GEMINI.md');
      const args = ext.mcpServers?.dwa?.args || [];
      if (!args.some(a => typeof a === 'string' && a.includes('${extensionPath}'))) {
        errors.push('[gemini-cli] gemini-extension.json mcpServers.dwa.args must use ${extensionPath}');
      }
    }
    for (const reqFile of ['GEMINI.md', 'commands/dwa.toml']) {
      if (!fs.existsSync(path.join(dir, reqFile))) errors.push(`[gemini-cli] Missing ${reqFile}`);
    }
    runMcpSmoke(dir, 'gemini-cli');
    runCliSmoke(dir, 'gemini-cli');
    checkMarkdownLinks(dir, 'gemini-cli', files);
    checkPrivatePathLeaks(dir, 'gemini-cli', files);
  }
}

// vscode-codex
{
  const dir = path.join(TARGETS_ROOT, 'vscode-codex');
  if (fs.existsSync(dir)) {
    const files = walkTargetFiles(dir);
    checkSkillsRulesAndAgent(dir, 'vscode-codex');
    checkLogoSvg(dir, 'vscode-codex');
    const codex = readJson(path.join(dir, '.codex-plugin', 'plugin.json'), 'dist/targets/vscode-codex/.codex-plugin/plugin.json');
    if (codex) {
      if (codex.name !== 'dynamic-web-architect') errors.push('[vscode-codex] .codex-plugin/plugin.json name mismatch');
      if (codex.version !== VERSION) errors.push('[vscode-codex] .codex-plugin/plugin.json version mismatch');
      assertRelativeAsset(dir, codex.skills, 'dist/targets/vscode-codex/.codex-plugin/plugin.json skills');
      assertRelativeAsset(dir, codex.interface?.logo, 'dist/targets/vscode-codex/.codex-plugin/plugin.json interface.logo');
    }
    const dotMcp = readJson(path.join(dir, '.mcp.json'), 'dist/targets/vscode-codex/.mcp.json');
    if (dotMcp && !dotMcp.mcpServers?.dwa) {
      errors.push('[vscode-codex] .mcp.json missing mcpServers.dwa');
    }
    const vsMcp = readJson(path.join(dir, '.vscode', 'mcp.json'), 'dist/targets/vscode-codex/.vscode/mcp.json');
    if (vsMcp && !vsMcp.servers?.dwa) {
      errors.push('[vscode-codex] .vscode/mcp.json missing servers.dwa');
    }
    for (const reqFile of [
      'AGENTS.md',
      '.vscode/tasks.json',
      '.github/prompts/dynamic-web-architect.prompt.md',
      '.github/instructions/dynamic-web-architect.instructions.md',
      '.github/copilot-instructions.md',
      '.agents/skills/dynamic-web-architect/SKILL.md',
      '.github/skills/dynamic-web-architect/SKILL.md',
      '.agents/plugins/marketplace.json'
    ]) {
      if (!fs.existsSync(path.join(dir, reqFile))) errors.push(`[vscode-codex] Missing ${reqFile}`);
    }
    runMcpSmoke(dir, 'vscode-codex');
    runCliSmoke(dir, 'vscode-codex');
    checkMarkdownLinks(dir, 'vscode-codex', files);
    checkPrivatePathLeaks(dir, 'vscode-codex', files);
  }
}

if (errors.length > 0) {
  console.error(`[FAIL] DWA v${VERSION} multi-host validation FAILED (${errors.length} error(s)):`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`[PASS] DWA v${VERSION} multi-host validation SUCCEEDED across root + ${requiredTargets.length} self-contained targets (antigravity, opencode, gemini-cli, vscode-codex).`);
