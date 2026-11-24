# Multi-Host Activation Guide (Antigravity, Codex, ChatGPT, VS Code)

Dynamic Web Architect ships one canonical skill (`skills/dynamic-web-architect/SKILL.md`) plus native manifests and adapters for all four target platforms.

## 1. Google Antigravity (IDE, App & CLI)
- **Plugin Path**: `~/.gemini/config/plugins/dynamic-web-architect/` (global) or `<workspace>/.agents/plugins/dynamic-web-architect/` (project-scoped).
- **Manifest**: Root `plugin.json` + `skills/dynamic-web-architect/SKILL.md` + `rules/AGENTS.md` + `assets/logo.svg`.
- **Activation**:
  - **Slash Command**: Type `/dynamic-web-architect` (e.g., `/dynamic-web-architect init ...`, `/dynamic-web-architect audit`, `/dynamic-web-architect place-file ...`, `/dynamic-web-architect promote ...`, `/dynamic-web-architect sync`).
  - **Automatic**: Activates via progressive disclosure whenever you plan a web project, ask where to put files, or audit folder structure.
  - **Deterministic CLI**: Runs `scripts/dwa-runner.cjs` (Node >= 18, zero external deps).

## 2. OpenAI Codex (CLI & Desktop App)
- **Plugin Manifest**: `.codex-plugin/plugin.json` pointing `"skills": "./skills"`.
- **Skill Discovery**: Place `skills/dynamic-web-architect/` in the repo's `.agents/skills/` or Codex skills directory.
- **Activation**:
  - Mention `$dynamic-web-architect` or `@dynamic-web-architect` or type `/dynamic-web-architect` in prompt instructions.
  - Codex executes `node skills/dynamic-web-architect/scripts/dwa-runner.cjs ...` directly in its shell sandbox.
  - Optional: append `portable-adapters/antigravity/AGENTS_SNIPPET.md` to your repo's `AGENTS.md`.

## 3. ChatGPT (Web / Custom GPT / Projects / Plugins)
- **Hosted Surface Limitation**: ChatGPT web does not execute local filesystem CLIs unless Code Interpreter is active with uploaded files.
- **Setup**:
  - Copy `portable-adapters/chatgpt/GPT_INSTRUCTIONS.md` into your **Custom GPT Instructions** or **ChatGPT Project Instructions**.
  - Optionally upload `schemas/architecture-manifest.schema.json` and `skills/dynamic-web-architect/references/*.md` as Knowledge files.
- **Activation**: Invoke with `/dynamic-web-architect init ...`, `/dynamic-web-architect place-file ...`, `/dynamic-web-architect promote ...`, `/dynamic-web-architect audit`, or natural language.

## 4. Visual Studio Code (GitHub Copilot Chat / Agent Mode / Tasks)
- **Slash Command (`/dynamic-web-architect`)**: Copy `.github/prompts/dynamic-web-architect.prompt.md` into your project's `.github/prompts/` (or user prompts folder). Typing `/dynamic-web-architect` in VS Code Copilot Chat activates the complete workflow immediately.
- **Always-On Workspace Instructions**: Copy `.github/instructions/dynamic-web-architect.instructions.md` into `.github/instructions/` so Copilot enforces DWA boundaries automatically when editing `src/**`.
- **IDE Tasks**: Optionally merge `portable-adapters/vscode/tasks.template.json` into `.vscode/tasks.json` to run `DWA: Audit` and `DWA: Sync` from the VS Code Command Palette (`Ctrl+Shift+P` -> *Tasks: Run Task*).
