#!/usr/bin/env node
'use strict';

/**
 * Dynamic Web Architect (DWA) — Self-Contained Multi-Host Target Builder
 *
 * Emits self-contained host distributions under dist/targets/:
 *   - dist/targets/antigravity   (plugin.json, mcp_config.json, hooks.json, agents/, rules/, skills/, assets/, bin/, src/, scripts/, schemas/, docs/, portable-adapters/)
 *   - dist/targets/opencode      (opencode.json, .opencode/{agents,commands}/, AGENTS.md, .agents/skills/, ...)
 *   - dist/targets/gemini-cli    (gemini-extension.json, GEMINI.md, commands/dwa.toml, ...)
 *   - dist/targets/vscode-codex  (.codex-plugin/plugin.json, .mcp.json, .vscode/mcp.json, .vscode/tasks.json, .github/, .agents/skills/, ...)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const TARGETS_ROOT = path.join(ROOT, 'dist', 'targets');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version || '2.0.0';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${path.relative(ROOT, src)}`);
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, extraIgnore = new Set()) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source directory: ${path.relative(ROOT, src)}`);
  }
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (['.git', 'node_modules', '__pycache__', '.DS_Store', 'Thumbs.db'].includes(entry.name)) {
      continue;
    }
    if (extraIgnore.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, extraIgnore);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function writeInventory(targetDir, targetName) {
  const files = [];
  function walk(curr) {
    for (const entry of fs.readdirSync(curr, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(curr, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name !== 'MANIFEST_INVENTORY.json') {
        const rel = path.relative(targetDir, full).replace(/\\/g, '/');
        const buf = fs.readFileSync(full);
        files.push({
          path: rel,
          bytes: buf.length,
          sha256: crypto.createHash('sha256').update(buf).digest('hex')
        });
      }
    }
  }
  walk(targetDir);
  writeJson(path.join(targetDir, 'MANIFEST_INVENTORY.json'), {
    package_target: targetName,
    name: 'dynamic-web-architect',
    version: VERSION,
    file_count: files.length + 1,
    files
  });
}

function copySharedRuntimePayload(targetDir, options = {}) {
  const {
    includeAgentSkillsAlias = false,
    includeGithubSkillsAlias = false
  } = options;

  copyDir(path.join(ROOT, 'skills'), path.join(targetDir, 'skills'));
  if (includeAgentSkillsAlias) {
    copyDir(path.join(ROOT, 'skills'), path.join(targetDir, '.agents', 'skills'));
  }
  if (includeGithubSkillsAlias) {
    copyDir(path.join(ROOT, 'skills'), path.join(targetDir, '.github', 'skills'));
  }

  copyDir(path.join(ROOT, 'rules'), path.join(targetDir, 'rules'));
  copyDir(path.join(ROOT, 'agents'), path.join(targetDir, 'agents'));
  copyDir(path.join(ROOT, 'assets'), path.join(targetDir, 'assets'));
  copyDir(path.join(ROOT, 'schemas'), path.join(targetDir, 'schemas'));
  copyDir(path.join(ROOT, 'bin'), path.join(targetDir, 'bin'));
  copyDir(path.join(ROOT, 'src'), path.join(targetDir, 'src'));
  copyDir(path.join(ROOT, 'docs'), path.join(targetDir, 'docs'));
  copyDir(path.join(ROOT, 'portable-adapters'), path.join(targetDir, 'portable-adapters'));

  copyFile(
    path.join(ROOT, 'scripts', 'dwa-boundary-guard.cjs'),
    path.join(targetDir, 'scripts', 'dwa-boundary-guard.cjs')
  );
  copyFile(path.join(ROOT, 'package.json'), path.join(targetDir, 'package.json'));
  copyFile(path.join(ROOT, 'README.md'), path.join(targetDir, 'README.md'));
  copyFile(path.join(ROOT, 'ARCHITECTURE.md'), path.join(targetDir, 'ARCHITECTURE.md'));
  copyFile(path.join(ROOT, 'architecture-manifest.json'), path.join(targetDir, 'architecture-manifest.json'));
}

function buildAntigravityTarget() {
  const dir = path.join(TARGETS_ROOT, 'antigravity');
  copySharedRuntimePayload(dir);
  copyFile(path.join(ROOT, 'plugin.json'), path.join(dir, 'plugin.json'));
  copyFile(path.join(ROOT, 'mcp_config.json'), path.join(dir, 'mcp_config.json'));
  copyFile(path.join(ROOT, 'hooks.json'), path.join(dir, 'hooks.json'));
  copyFile(path.join(ROOT, '.codex-plugin', 'plugin.json'), path.join(dir, '.codex-plugin', 'plugin.json'));
  copyFile(path.join(ROOT, 'ANTIGRAVITY_HANDOFF.md'), path.join(dir, 'ANTIGRAVITY_HANDOFF.md'));
  writeInventory(dir, 'antigravity');
  return dir;
}

function buildOpencodeTarget() {
  const dir = path.join(TARGETS_ROOT, 'opencode');
  copySharedRuntimePayload(dir, { includeAgentSkillsAlias: true });
  copyFile(path.join(ROOT, 'rules', 'AGENTS.md'), path.join(dir, 'AGENTS.md'));

  writeJson(path.join(dir, 'opencode.json'), {
    $schema: 'https://opencode.ai/config.json',
    instructions: [
      'AGENTS.md',
      'rules/AGENTS.md'
    ],
    mcp: {
      dwa: {
        type: 'local',
        command: [
          'node',
          'src/mcp/server.cjs'
        ],
        enabled: true
      }
    }
  });

  writeText(
    path.join(dir, '.opencode', 'agents', 'dynamic-web-architect.md'),
    `---
description: Deterministic web architecture advisor, file-placement router, and read-only DAG boundary auditor (DWA v${VERSION}).
mode: subagent
permission:
  edit: deny
  bash: deny
  skill: allow
---

Load \`dynamic-web-architect\` skill and follow \`AGENTS.md\`. Prefer the \`dwa\` MCP tools (\`dwa_classify\`, \`dwa_place_file\`, \`dwa_audit\`, \`dwa_promote_preview\`, \`dwa_migrate_check\`, \`dwa_diagram\`) before manual guesses. Operate read-only by default.
`
  );

  writeText(
    path.join(dir, '.opencode', 'commands', 'dynamic-web-architect.md'),
    `---
description: Run Dynamic Web Architect (classify, place-file, audit, promote preview, migrate check, or diagram) in read-only mode.
agent: dynamic-web-architect
subtask: false
---

Load \`dynamic-web-architect\` skill and evaluate the user's architectural request using \`dwa\` MCP tools (\`dwa_classify\`, \`dwa_place_file\`, \`dwa_audit\`, \`dwa_promote_preview\`, \`dwa_migrate_check\`, \`dwa_diagram\`). Do not modify repository files unless explicitly authorized.

User request: $ARGUMENTS
`
  );

  writeInventory(dir, 'opencode');
  return dir;
}

function buildGeminiCliTarget() {
  const dir = path.join(TARGETS_ROOT, 'gemini-cli');
  copySharedRuntimePayload(dir);

  writeJson(path.join(dir, 'gemini-extension.json'), {
    name: 'dynamic-web-architect',
    version: VERSION,
    description:
      'Deterministic web architecture decision engine, scaffolding generator, dynamic file router, shared-coupling promoter, and DAG structural linter.',
    contextFileName: 'GEMINI.md',
    mcpServers: {
      dwa: {
        command: 'node',
        args: [
          '${extensionPath}/src/mcp/server.cjs'
        ]
      }
    },
    excludeTools: []
  });

  writeText(
    path.join(dir, 'GEMINI.md'),
    `# Dynamic Web Architect (DWA v${VERSION}) — Gemini CLI Extension

Follow [rules/AGENTS.md](./rules/AGENTS.md) and [skills/dynamic-web-architect/SKILL.md](./skills/dynamic-web-architect/SKILL.md).

## Read-Only MCP Tools (\`dwa\`)

- \`dwa_classify\` — 6-axis complexity scoring, 14-framework detection, 6 canonical patterns.
- \`dwa_place_file\` — canonical file path, normalized naming, barrel impact (read-only preview).
- \`dwa_audit\` — unidirectional DAG, cycles, naming, internal barrels, loose-file density, client/server AI leak linter.
- \`dwa_promote_preview\` — shared-coupling promotion preview with exact import rewrites (dry-run).
- \`dwa_migrate_check\` — Transition Cost Guardrail evaluation.
- \`dwa_diagram\` — Mermaid DAG generator.

Only apply disk mutations via \`node bin/dwa.cjs ... --apply\` when explicitly authorized by the user.
`
  );

  writeText(
    path.join(dir, 'commands', 'dwa.toml'),
    `description = "Run Dynamic Web Architect (classify, place-file, audit, promote preview, migrate check, diagram) using the deterministic DWA engine."
prompt = """
Use the Dynamic Web Architect skill (skills/dynamic-web-architect/SKILL.md) and prefer the read-only \`dwa\` MCP tools (\`dwa_classify\`, \`dwa_place_file\`, \`dwa_audit\`, \`dwa_promote_preview\`, \`dwa_migrate_check\`, \`dwa_diagram\`) or \`node bin/dwa.cjs\`.
Never mutate files unless the user explicitly asks to apply changes.

Request: {{args}}
"""
`
  );

  writeInventory(dir, 'gemini-cli');
  return dir;
}

function buildVscodeCodexTarget() {
  const dir = path.join(TARGETS_ROOT, 'vscode-codex');
  copySharedRuntimePayload(dir, {
    includeAgentSkillsAlias: true,
    includeGithubSkillsAlias: true
  });

  copyFile(path.join(ROOT, '.codex-plugin', 'plugin.json'), path.join(dir, '.codex-plugin', 'plugin.json'));
  copyFile(path.join(ROOT, 'rules', 'AGENTS.md'), path.join(dir, 'AGENTS.md'));
  copyFile(
    path.join(ROOT, '.github', 'prompts', 'dynamic-web-architect.prompt.md'),
    path.join(dir, '.github', 'prompts', 'dynamic-web-architect.prompt.md')
  );
  copyFile(
    path.join(ROOT, '.github', 'instructions', 'dynamic-web-architect.instructions.md'),
    path.join(dir, '.github', 'instructions', 'dynamic-web-architect.instructions.md')
  );
  copyFile(
    path.join(ROOT, 'portable-adapters', 'antigravity', 'AGENTS_SNIPPET.md'),
    path.join(dir, '.github', 'copilot-instructions.md')
  );
  copyFile(
    path.join(ROOT, 'portable-adapters', 'vscode', 'tasks.template.json'),
    path.join(dir, '.vscode', 'tasks.json')
  );

  writeJson(path.join(dir, '.mcp.json'), {
    mcpServers: {
      dwa: {
        command: 'node',
        args: [
          './src/mcp/server.cjs'
        ]
      }
    }
  });

  writeJson(path.join(dir, '.vscode', 'mcp.json'), {
    servers: {
      dwa: {
        type: 'stdio',
        command: 'node',
        args: [
          '${workspaceFolder}/src/mcp/server.cjs'
        ]
      }
    }
  });

  writeJson(path.join(dir, '.agents', 'plugins', 'marketplace.json'), {
    name: 'dynamic-web-architect-local',
    plugins: [
      {
        name: 'dynamic-web-architect',
        source: {
          source: 'local',
          path: '../..'
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_USE'
        },
        category: 'Developer Tools'
      }
    ]
  });

  writeInventory(dir, 'vscode-codex');
  return dir;
}

function main() {
  ensureDir(TARGETS_ROOT);
  for (const name of ['antigravity', 'opencode', 'gemini-cli', 'vscode-codex']) {
    fs.rmSync(path.join(TARGETS_ROOT, name), { recursive: true, force: true });
  }

  const built = {
    antigravity: buildAntigravityTarget(),
    opencode: buildOpencodeTarget(),
    'gemini-cli': buildGeminiCliTarget(),
    'vscode-codex': buildVscodeCodexTarget()
  };

  console.log(`[PASS] Built ${Object.keys(built).length} self-contained multi-host targets for DWA v${VERSION}:`);
  for (const [name, targetPath] of Object.entries(built)) {
    console.log(`  - ${name}: ${path.relative(ROOT, targetPath).replace(/\\/g, '/')}`);
  }
}

main();
