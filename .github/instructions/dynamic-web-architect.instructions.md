---
applyTo: "src/**,apps/**,packages/**,internal/**,architecture-manifest.json,ARCHITECTURE.md"
---

# Dynamic Web Architect (DWA) — Automatic Structural Governance

1. Before creating, renaming, or moving files, inspect `architecture-manifest.json` and `ARCHITECTURE.md` at the workspace root.
2. Enforce unidirectional DAG imports (`app/pages/routes -> features -> shared/core`; or `interfaces -> application -> domain` in Hexagonal). Never import internal files across sibling features.
3. Enforce naming: `kebab-case` directories, `PascalCase` UI components, `useCamelCase` hooks, and semantic suffixes (`*.service.ts`, `*.use-case.ts`, `*.schema.ts`, `*.types.ts`, `*.util.ts`). Never create `helpers/`, `misc/`, or `common/` folders.
4. Keep `index.ts` barrels strictly at feature/package public boundaries (`src/features/<domain>/index.ts`); avoid internal barrels inside `src/shared/ui/` or `src/features/*/components/`.
5. Isolate AI SDKs (`@google/genai`, `openai`) and DB/payment clients in server-only `src/core/ai/` or `src/infrastructure/` modules — never import them in `"use client"` files.
6. When `>= 2` features require a feature-local file, promote it to `src/shared/` (or `src/core/`) and rewrite imports to `@/*` aliases.
