# Dynamic Lifecycle Operations Runbook

## 1. Intelligent File Placement (`place-file`)

Decision order applied deterministically:
1. **Route / Framework Entrypoint?** (`page.tsx`, `layout.tsx`, `+page.svelte`, `--scope route`) -> `routingShell` directory (`src/app/...`).
2. **AI / LLM Client or Secret Backend SDK?** (`gemini`, `genai`, `llm`, `rag`, `embedding`) -> `src/core/ai/` (or `src/infrastructure/ai/` in Hexagonal, `packages/ai-sdk/src/` in Monorepo).
3. **Singleton Technical Infrastructure?** (`http-client`, `db`, `logger`, `telemetry`, `env`, `store`, `--scope core`) -> `src/core/{config,api,store}/`.
4. **Business-Agnostic Reusable Primitive?** (`Button`, `Modal`, `format-date`, `--scope shared`) -> `src/shared/{ui,hooks,utils,types}/`.
5. **Default Co-Location (`CO_LOCATION`)**: Place inside the single owning domain feature (`src/features/<domain>/{components,hooks,services,types,utils}/`).

---

## 2. Shared Coupling Promotion (`promote`)

Triggered when a file inside `src/features/<A>/` is needed by `src/features/<B>/` (`>= promotionThreshold`, default `2` consuming features):
1. Run dry-run first to inspect every affected import:
   ```bash
   node <skill-dir>/scripts/dwa-runner.cjs promote src/features/billing/components/PriceBadge.tsx --dir .
   ```
2. Verify destination (`src/shared/ui/PriceBadge.tsx` for agnostic UI/utils, or `--target core` -> `src/core/domain/` for shared domain contracts).
3. Apply safely with `--apply`:
   - Moves the file to its promoted destination.
   - Rewrites relative imports inside the moved file so its own dependencies stay valid.
   - Rewrites every consumer's import statement across the repository to the canonical `@/shared/...` alias (or clean relative path if no alias exists).
4. Run `dwa audit` to confirm 0 broken boundaries and 0 cycles.

---

## 3. Structural Debt Audit (`audit`)

Checks executed in one deterministic pass:
- `DAG_BOUNDARY_VIOLATION` (`ERROR`, -12 pts): Layer imports forbidden upward/lateral layer.
- `CROSS_FEATURE_INTERNAL_IMPORT` (`ERROR`, -12 pts): Feature A reaches into Feature B internals.
- `CIRCULAR_DEPENDENCY` (`ERROR`, -12 pts): DFS cycle across internal module graph.
- `ROUTING_SHELL_LOGIC_LEAK` (`ERROR`, -12 pts): Service/repository/use-case placed directly in `src/app/`.
- `CLIENT_SERVER_LEAK` (`ERROR`, -12 pts): `"use client"` component imports server-only/AI/DB package.
- `DEPRECATED_AI_SDK` (`ERROR`, -12 pts): Legacy `@google/generative-ai` detected.
- `HEXAGONAL_DOMAIN_IMPURITY` (`ERROR`, -12 pts): Pure `domain/` imports framework/ORM/HTTP client.
- `LOOSE_FILE_DENSITY_EXCEEDED` (`WARN`, -4 pts): Directory holds `> maxLooseFilesPerDirectory` (default `10`) source files.
- `FORBIDDEN_INTERNAL_BARREL` (`WARN`, -4 pts): Barrel inside `shared/ui/` or `features/*/components/`.
- `FORBIDDEN_GENERIC_DIR` (`WARN`, -4 pts): Generic `helpers/`, `misc/`, `common/`, `temp/`.
- `DEEP_RELATIVE_IMPORT` (`WARN`, -4 pts): `../../../` relative path when `@/*` alias exists.
- `NAMING_*` (`WARN`, -4 pts): Directory or file naming drift.

---

## 4. Documentation & Manifest Sync (`sync`)

- Discovers current `src/features/*`, `src/modules/*`, or `apps/*` + `packages/*` on disk.
- Runs `audit` to record `metadata.lastHealthScore`.
- Recomputes deterministic SHA-256 `metadata.manifestChecksum`.
- Regenerates `ARCHITECTURE.md` with up-to-date Mermaid DAG while preserving all custom human ADR notes below `<!-- DWA:CUSTOM_NOTES_START -->`.

---

## 5. Evolutionary Migration (`migrate`) & Transition Cost Guardrail

Before migrating a live repository from Pattern X to Pattern Y:
- Evaluates **Strategic Value** (source file count, saturated directories, active feature count, multi-app drivers) vs **Transition Cost** (`Implementation Cost + Migration Risk + Operational Fatigue`).
- If `Transition Cost >= Strategic Value`: returns `DEFER_REFINE_INCREMENTALLY` to block premature re-architecture.
- If `Strategic Value > Transition Cost`: returns `RECOMMEND_MIGRATION` with a 4-phase Strangler-Fig migration plan (optional Git worktree isolation for `> 20` files -> alias setup -> domain-by-domain move -> `audit` + `sync`).
