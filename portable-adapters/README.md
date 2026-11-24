# Dynamic Web Architect — Portable Multi-Host Adapters

One canonical skill (`skills/dynamic-web-architect/SKILL.md`) + one zero-dependency deterministic Node.js engine (`bin/dwa.cjs`), packaged natively for **Antigravity**, **Codex**, **ChatGPT**, and **VS Code**.

| Platform | Native Mechanism | Slash / Trigger Command | Local CLI Execution |
| :--- | :--- | :--- | :--- |
| **Antigravity (IDE / App / CLI)** | `plugin.json` + `skills/dynamic-web-architect/SKILL.md` + `rules/AGENTS.md` | `/dynamic-web-architect` + automatic | Yes (`scripts/dwa-runner.cjs`) |
| **OpenAI Codex (CLI / Desktop)** | `.codex-plugin/plugin.json` + `skills/dynamic-web-architect/SKILL.md` | `$dynamic-web-architect`, `@dynamic-web-architect`, `/dynamic-web-architect` | Yes (`scripts/dwa-runner.cjs`) |
| **ChatGPT (Custom GPT / Projects / Plugins)** | `.codex-plugin/plugin.json` + `chatgpt/GPT_INSTRUCTIONS.md` | `/dynamic-web-architect` + natural language | Prompt-native (no local disk CLI) |
| **VS Code (Copilot Chat / Agent Mode)** | `.github/prompts/dynamic-web-architect.prompt.md` + `.github/instructions/dynamic-web-architect.instructions.md` | `/dynamic-web-architect` + automatic on `src/**` | Yes (Agent terminal + `vscode/tasks.template.json`) |

## Quick Install per Platform

1. **Antigravity**: Run `npm run sync:global` (or copy repo bundle to `~/.gemini/config/plugins/dynamic-web-architect/`).
2. **Codex**: Point Codex plugin/skills discovery to this repository (or copy `skills/dynamic-web-architect/` into `<repo>/.agents/skills/dynamic-web-architect/`). See [codex/CODEX_GUIDE.md](./codex/CODEX_GUIDE.md).
3. **ChatGPT**: Paste [chatgpt/GPT_INSTRUCTIONS.md](./chatgpt/GPT_INSTRUCTIONS.md) into Custom GPT or ChatGPT Project instructions and optionally attach `schemas/architecture-manifest.schema.json`.
4. **VS Code**: Copy `.github/prompts/dynamic-web-architect.prompt.md` and `.github/instructions/dynamic-web-architect.instructions.md` into your target repository's `.github/` folder (or VS Code User Prompts folder) and optionally merge [vscode/tasks.template.json](./vscode/tasks.template.json) into `.vscode/tasks.json`.
