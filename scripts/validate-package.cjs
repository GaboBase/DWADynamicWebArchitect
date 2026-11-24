#!/usr/bin/env node
'use strict';

/**
 * Package & Cross-Platform Contract Validator for Dynamic Web Architect (DWA).
 * Verifies:
 * 1. Antigravity plugin.json (strict official top-level fields only)
 * 2. OpenAI Codex/ChatGPT .codex-plugin/plugin.json
 * 3. Canonical skills/dynamic-web-architect/SKILL.md frontmatter & linked references
 * 4. rules/AGENTS.md (plain markdown without YAML frontmatter per Antigravity plugin spec)
 * 5. JSON Schema and example manifests
 * 6. VS Code, ChatGPT, Codex, and Antigravity portable adapters
 * 7. SVG logo presence and integrity
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ALLOWED_ANTIGRAVITY_PLUGIN_KEYS = new Set([
  'name',
  'displayName',
  'version',
  'description',
  'logo',
  'author',
  'homepage',
  'repository',
  'suggestedPrompts',
  'disabled'
]);

const errors = [];
const checks = [];

function assertCheck(condition, message) {
  if (condition) {
    checks.push(`PASS: ${message}`);
  } else {
    errors.push(`FAIL: ${message}`);
  }
}

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    errors.push(`FAIL: Missing file ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    errors.push(`FAIL: Invalid JSON in ${relPath}: ${err.message}`);
    return null;
  }
}

// 1. Validate Antigravity plugin.json
const agPlugin = readJson('plugin.json');
if (agPlugin) {
  assertCheck(agPlugin.name === 'dynamic-web-architect', 'plugin.json name is "dynamic-web-architect"');
  assertCheck(typeof agPlugin.description === 'string' && agPlugin.description.length > 20, 'plugin.json has non-empty description');
  assertCheck(Array.isArray(agPlugin.suggestedPrompts) && agPlugin.suggestedPrompts.length === 3, 'plugin.json has exactly 3 suggestedPrompts');
  const unknownKeys = Object.keys(agPlugin).filter(k => !ALLOWED_ANTIGRAVITY_PLUGIN_KEYS.has(k));
  assertCheck(unknownKeys.length === 0, `plugin.json contains only official Antigravity top-level fields (unknown: ${unknownKeys.join(', ') || 'none'})`);
  if (agPlugin.logo) {
    assertCheck(fs.existsSync(path.join(ROOT, agPlugin.logo)), `plugin.json logo exists at ${agPlugin.logo}`);
  }
}

// 2. Validate Codex/ChatGPT .codex-plugin/plugin.json
const codexPlugin = readJson('.codex-plugin/plugin.json');
if (codexPlugin) {
  assertCheck(codexPlugin.name === 'dynamic-web-architect', '.codex-plugin/plugin.json name matches');
  assertCheck(codexPlugin.skills === './skills', '.codex-plugin/plugin.json points skills to "./skills"');
  assertCheck(Boolean(codexPlugin.interface && codexPlugin.interface.displayName), '.codex-plugin/plugin.json defines interface metadata');
}

// 3. Validate SKILL.md frontmatter and links
const skillPath = path.join(ROOT, 'skills', 'dynamic-web-architect', 'SKILL.md');
assertCheck(fs.existsSync(skillPath), 'skills/dynamic-web-architect/SKILL.md exists');
if (fs.existsSync(skillPath)) {
  const raw = fs.readFileSync(skillPath, 'utf8');
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assertCheck(Boolean(fmMatch), 'SKILL.md starts with valid YAML frontmatter');
  if (fmMatch) {
    assertCheck(/name:\s*dynamic-web-architect\b/.test(fmMatch[1]), 'SKILL.md frontmatter declares name: dynamic-web-architect');
    assertCheck(/description:/.test(fmMatch[1]), 'SKILL.md frontmatter declares description');
  }
  const requiredLinked = [
    'skills/dynamic-web-architect/scripts/dwa-runner.cjs',
    'skills/dynamic-web-architect/references/decision-matrix.md',
    'skills/dynamic-web-architect/references/naming-and-dag-rules.md',
    'skills/dynamic-web-architect/references/dynamic-operations.md',
    'skills/dynamic-web-architect/references/ecosystem-synergies.md',
    'skills/dynamic-web-architect/references/multi-host-activation.md',
    'skills/dynamic-web-architect/examples/scenarios-walkthrough.md'
  ];
  for (const rel of requiredLinked) {
    assertCheck(fs.existsSync(path.join(ROOT, rel)), `Linked skill asset exists: ${rel}`);
  }
}

// 4. Validate rules/AGENTS.md (must NOT have YAML frontmatter per Antigravity plugin spec)
const rulesPath = path.join(ROOT, 'rules', 'AGENTS.md');
assertCheck(fs.existsSync(rulesPath), 'rules/AGENTS.md exists');
if (fs.existsSync(rulesPath)) {
  const rulesText = fs.readFileSync(rulesPath, 'utf8');
  assertCheck(!rulesText.trimStart().startsWith('---'), 'rules/AGENTS.md is plain markdown with no YAML frontmatter');
}

// 5. Validate JSON Schema & example manifests
const schema = readJson('schemas/architecture-manifest.schema.json');
if (schema) {
  assertCheck(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'Manifest schema uses Draft 2020-12');
  for (const ex of ['skills/dynamic-web-architect/examples/saas-nextjs-manifest.json', 'skills/dynamic-web-architect/examples/hexagonal-api-manifest.json']) {
    const sample = readJson(ex);
    if (sample) {
      const missingReq = (schema.required || []).filter(k => !(k in sample));
      assertCheck(missingReq.length === 0, `Example ${ex} satisfies all required schema properties`);
    }
  }
}

// 6. Validate multi-host adapters
const adapterFiles = [
  '.github/prompts/dynamic-web-architect.prompt.md',
  '.github/instructions/dynamic-web-architect.instructions.md',
  'portable-adapters/README.md',
  'portable-adapters/chatgpt/GPT_INSTRUCTIONS.md',
  'portable-adapters/codex/CODEX_GUIDE.md',
  'portable-adapters/antigravity/AGENTS_SNIPPET.md',
  'portable-adapters/vscode/tasks.template.json',
  'docs/TOOL_SPECIFICATION.md',
  'bin/dwa.cjs'
];
for (const af of adapterFiles) {
  assertCheck(fs.existsSync(path.join(ROOT, af)), `Cross-platform deliverable exists: ${af}`);
}

console.log(`Validated Dynamic Web Architect package (${checks.length} passed, ${errors.length} failed).`);
if (errors.length > 0) {
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}
process.exit(0);
