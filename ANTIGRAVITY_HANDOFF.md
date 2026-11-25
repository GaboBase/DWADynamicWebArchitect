# Dynamic Web Architect (DWA v2.0) — Antigravity & Multi-Host Handoff

## 1. Plugin Architecture & Runtime Components

- **Plugin Manifest**: [`plugin.json`](./plugin.json) (Antigravity native manifest with `assets/logo.svg`, `suggestedPrompts`, zero non-standard top-level keys).
- **Codex Manifest**: [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json).
- **Canonical Skill**: [`skills/dynamic-web-architect/SKILL.md`](./skills/dynamic-web-architect/SKILL.md) (with references, examples, and [`dwa-runner.cjs`](./skills/dynamic-web-architect/scripts/dwa-runner.cjs)).
- **Governing Master Agent**: [`agents/dwa-master.md`](./agents/dwa-master.md) (`subagent: true`, `model: inherit`).
- **Workspace Rules**: [`rules/AGENTS.md`](./rules/AGENTS.md) (plain Markdown, no YAML frontmatter, `<= 24,000` bytes).
- **Deterministic CLI**: [`bin/dwa.cjs`](./bin/dwa.cjs) (`classify`, `init`, `place-file`, `promote`, `audit`, `sync`, `migrate`, `diagram`).
- **Zero-Dependency Stdio MCP Server (`dwa`)**: [`src/mcp/server.cjs`](./src/mcp/server.cjs) configured in [`mcp_config.json`](./mcp_config.json) using `${PLUGIN_ROOT}/src/mcp/server.cjs` (no relative `cwd`, no arbitrary OS `${VAR}` placeholders).
- **Safe `PostToolUse` Boundary Guard**: [`hooks.json`](./hooks.json) -> [`scripts/dwa-boundary-guard.cjs`](./scripts/dwa-boundary-guard.cjs) (strictly read-only, exits `0`, inert on non-DWA workspaces lacking `architecture-manifest.json`, opt-out via `DWA_HOOK_DISABLED=1` or `DWA_BOUNDARY_GUARD=0`, opt-in override via `DWA_BOUNDARY_GUARD=1`).

## 2. MCP Tools (`serverKey`: `dwa`)

All exposed MCP tools are `snake_case`, read-only/preview by default, and satisfy `^[a-zA-Z0-9_-]{1,64}$` under `mcp_dynamic-web-architect_dwa_<toolName>`:

| Tool | Qualified Name (Antigravity) | Behavior |
| :--- | :--- | :--- |
| `dwa_classify` | `mcp_dynamic-web-architect_dwa_dwa_classify` | 6-axis complexity scoring, framework & pattern selection |
| `dwa_place_file` | `mcp_dynamic-web-architect_dwa_dwa_place_file` | Canonical path, naming normalization, barrel impact (`apply: false`) |
| `dwa_audit` | `mcp_dynamic-web-architect_dwa_dwa_audit` | DAG, cycle, naming, barrel, density & AI/server leak linter |
| `dwa_promote_preview` | `mcp_dynamic-web-architect_dwa_dwa_promote_preview` | Shared-coupling promotion preview with import rewrites (`apply: false`) |
| `dwa_migrate_check` | `mcp_dynamic-web-architect_dwa_dwa_migrate_check` | Transition Cost Guardrail evaluation (`Strategic Value` vs `Transition Cost`) |
| `dwa_diagram` | `mcp_dynamic-web-architect_dwa_dwa_diagram` | Mermaid DAG topology from manifest or classified preview |

Resource exposed: `dwa://schema/architecture-manifest.json` (`schemas/architecture-manifest.schema.json`).

## 3. Build, Validation & Installation

```powershell
npm.cmd test
; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run build:targets
; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run validate:packages
; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
agy plugin validate --strict dist\targets\antigravity
; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

Self-contained multi-host targets are generated in `dist/targets/`:
- `dist/targets/antigravity` (`plugin.json`, `mcp_config.json`, `hooks.json`, `agents/`, `rules/`, `skills/`)
- `dist/targets/opencode` (`opencode.json`, `.opencode/`, `AGENTS.md`, `.agents/skills/`)
- `dist/targets/gemini-cli` (`gemini-extension.json`, `GEMINI.md`, `commands/dwa.toml`)
- `dist/targets/vscode-codex` (`.codex-plugin/plugin.json`, `.mcp.json`, `.vscode/mcp.json`, `.vscode/tasks.json`, `.github/`, `.agents/skills/`)
