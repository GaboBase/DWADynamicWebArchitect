## Architectural Governance (Dynamic Web Architect — DWA v2.0)
1. Before creating or moving files, inspect `architecture-manifest.json` and `ARCHITECTURE.md` at the repository root.
2. Enforce unidirectional DAG imports: `app/pages/routes -> features/* -> shared/core` (or `interfaces -> application -> domain` in Hexagonal). Forbidden: direct imports between internal files of sibling features.
3. Enforce naming: `kebab-case` directories, `PascalCase` UI components, `useCamelCase` hooks, and semantic suffixes (`*.service.ts`, `*.use-case.ts`, `*.schema.ts`, `*.types.ts`, `*.util.ts`). Avoid `helpers/`, `misc/`, and `common/`.
4. Controlled barrels: only place `index.ts` at feature/package boundaries (`src/features/<domain>/index.ts`). Avoid internal barrels inside `src/shared/ui/` or `src/features/*/components/`.
5. Dynamic promotion: when a file inside `src/features/A` is required by `src/features/B`, promote it to `src/shared/` (or `src/core/`) and update imports to `@/*` path aliases.
6. AI & server boundary: keep `@google/genai`, DB drivers, and secret clients strictly inside server-only `src/core/ai/` or `src/infrastructure/` — never inside `"use client"` components.
7. Invoke `/dynamic-web-architect` (subcommands: `init`, `place-file`, `promote`, `audit`, `sync`, `migrate`) whenever planning, routing, or auditing structure.
