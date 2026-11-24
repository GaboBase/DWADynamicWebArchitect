# Dynamic Web Architect (DWA v2.0) — OpenAI Codex Setup & Usage

## Installation Options

### Option A: Native Codex Plugin (`.codex-plugin/plugin.json`)
This repository includes `.codex-plugin/plugin.json` declaring `"skills": "./skills"`. Register or symlink this repository directory into your Codex plugins folder.

### Option B: Workspace Skill Drop-In
Copy `skills/dynamic-web-architect/` (and optionally `bin/` + `src/` for local CLI execution) into `<your-project>/.agents/skills/dynamic-web-architect/`.

## Activation in Codex
- **Direct Skill Mention**: `$dynamic-web-architect init SaaS e-commerce con Next.js App Router y TypeScript`
- **Slash Command Prompt**: `/dynamic-web-architect audit .`
- **Automatic**: Codex reads `skills/dynamic-web-architect/SKILL.md` frontmatter and activates automatically on web architecture, scaffolding, file placement, or import-boundary refactoring prompts.

## Deterministic Local Execution inside Codex Sandbox
```bash
node bin/dwa.cjs classify --context "E-commerce SaaS with Next.js App Router and Gemini AI"
node bin/dwa.cjs init ./my-app --context "E-commerce SaaS with Next.js App Router" --apply
node bin/dwa.cjs place-file InvoiceTable.tsx --feature billing --dir ./my-app
node bin/dwa.cjs promote src/features/billing/components/PriceBadge.tsx --dir ./my-app --apply
node bin/dwa.cjs audit ./my-app
node bin/dwa.cjs sync ./my-app
```
