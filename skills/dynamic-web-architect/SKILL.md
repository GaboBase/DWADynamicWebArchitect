---
name: dynamic-web-architect
description: >-
  Deterministic web architecture decision engine, scaffolding generator, dynamic file router,
  shared-coupling promoter, DAG structural linter, and evolutionary migration governor.
  Activates automatically when planning, initializing, or structuring a web project, deciding
  where to place new files, promoting shared code across modules, auditing architectural debt
  or import boundaries, or when explicitly invoked via /dynamic-web-architect (and aliases
  /architect, /scaffold, /place-file, /promote, /audit-arch). Compatible with Antigravity,
  Codex, ChatGPT, and VS Code.
---

# Dynamic Web Architect (DWA v2.0)

Deterministic architectural decision engine, naming governor, scaffolding generator, and live filesystem router for web projects across their full lifecycle. Replaces ad-hoc folder creation with a unidirectional dependency graph (**DAG**), explicit domain boundaries, and zero-overengineering discipline.

## 1. Activation & Command Interface

Activate automatically whenever the user designs a web project, asks where a file belongs, moves/refactors modules, or audits project structure — or deterministically via `/dynamic-web-architect`:

| Command (Canonical & Aliases) | Lifecycle Phase | Deterministic Action |
| :--- | :--- | :--- |
| `/dynamic-web-architect init [context]` (`/architect init`, `/scaffold`) | Initial Scaffolding | Evaluates stack, business domains, and projected scale; selects optimal pattern; generates `architecture-manifest.json`, `ARCHITECTURE.md`, directory tree, and PowerShell/Bash scripts. |
| `/dynamic-web-architect place-file <file> [context]` (`/place-file`) | Dynamic File Routing | Normalizes naming, checks co-location vs `shared` vs `core` vs `routing-shell` vs AI/server boundary, returns canonical path, barrel impact, and creation command. |
| `/dynamic-web-architect promote <path>` (`/promote`) | Shared Coupling Refactor | Detects cross-module coupling (`>= 2` consumers), migrates the asset to `shared/` or `core/`, and rewrites all relative and `@/*` imports safely. |
| `/dynamic-web-architect audit [dir]` (`/audit-arch`) | Structural DAG Linter | Scans imports, cycles, DAG boundaries, naming, internal barrel misuse, loose-file density (`> 10`), deep relative imports (`../../../`), and `"use client"` server/AI SDK leaks. |
| `/dynamic-web-architect sync [dir]` (`/architect sync`) | Documentation Governance | Reconciles `architecture-manifest.json` (with SHA-256 checksum & health score) and `ARCHITECTURE.md` (preserving custom ADRs) with actual disk state. |
| `/dynamic-web-architect migrate <target-pattern>` | Evolutionary Migration | Evaluates pattern upgrade using the Transition Cost Guardrail before recommending a phased Strangler-Fig migration. |

> **Executable CLI & MCP Tools (Antigravity, OpenCode, Gemini CLI, Codex, VS Code)**:
> Prefer the zero-dependency `dwa` stdio MCP server (`dwa_classify`, `dwa_place_file`, `dwa_audit`, `dwa_promote_preview`, `dwa_migrate_check`, `dwa_diagram` — strictly read-only/preview) or run deterministic CLI operations directly using [scripts/dwa-runner.cjs](./scripts/dwa-runner.cjs):
> ```bash
> node <skill-dir>/scripts/dwa-runner.cjs classify --context "<project description>"
> node <skill-dir>/scripts/dwa-runner.cjs init <target-dir> --context "<description>" [--apply]
> node <skill-dir>/scripts/dwa-runner.cjs place-file <filename> --feature <domain> --dir <target-dir>
> node <skill-dir>/scripts/dwa-runner.cjs promote <src/features/...> --dir <target-dir> [--apply]
> node <skill-dir>/scripts/dwa-runner.cjs audit <target-dir>
> node <skill-dir>/scripts/dwa-runner.cjs sync <target-dir>
> node <skill-dir>/scripts/dwa-runner.cjs migrate <target-pattern> --dir <target-dir> --reason "<why>"
> ```
> In prompt-only hosts (e.g., ChatGPT web), execute the exact same decision rules, manifest schema, and output templates natively without inventing shell output.

---

## 2. Core Operating Protocol (Turn 1 Zero-Gate)

Never stall Turn 1 with a long questionnaire. Infer reasonable defaults labeled `[INFERRED]` (and mark true unknowns `[NO DETERMINABLE]`), deliver the full architectural verdict immediately, and ask at most one critical question only if an unknown would completely invert the pattern choice.

### Phase A — Multi-Axis Classification & Pattern Selection
Before proposing or creating folders, score the project across 6 axes (Presentation, Domain Complexity, Data/State, Security/Compliance, Multi-App Scale, Backend Autonomy) and select the **minimum sufficient pattern** (full matrix in [references/decision-matrix.md](./references/decision-matrix.md)):

| Project Context & Final Scale | Complexity | Canonical Pattern | Base Structure |
| :--- | :--- | :--- | :--- |
| Landing page, brochure, portfolio, static Astro/HTML site | Low | `classic-by-type` | `src/{assets,styles,scripts,pages,components}` |
| Design system, UI library, Storybook, Web Components | Medium | `atomic-design` | `src/{tokens,components/{atoms,molecules,organisms,templates},hooks,utils,types}` |
| Web App, SaaS, E-Commerce, CRM, ERP, Dashboard | High | `feature-driven-screaming` | `src/{app\|pages\|routes,features/{domain},shared/{ui,hooks,utils,types},core/{config,api,store}}` |
| REST/GraphQL API, Backend, Microservice (Node/Py/Go) | Med–High | `hexagonal-clean` | `src/{domain,application,infrastructure,interfaces,shared}` (`internal/` in Go) |
| Fullstack Modular Monolith / BFF (unified UI + server) | High | `modular-monolith-fullstack` | `src/{app,modules/{domain}/{domain,application,ui,api},shared,core}` |
| Multi-app ecosystem (Web + Admin + API, Turborepo/Nx/pnpm) | Very High | `monorepo-workspaces` | `apps/{web,admin,api}`, `packages/{ui,domain,config,utils}` |

**Framework Routing Shell Harmonization**: When a framework enforces file-based routing (`src/app` in Next.js App Router, `src/pages` in Astro/Nuxt/Pages Router, `src/routes` in SvelteKit), keep that directory strictly as a **thin Routing Shell** (routes, layouts, loading/error states). Place all domain components, hooks, state, and services inside `src/features/<domain>/`.

### Phase B — Naming, Barrels, Aliases & DAG Invariants
Enforce strictly on every generated or audited path (details in [references/naming-and-dag-rules.md](./references/naming-and-dag-rules.md)):
1. **Naming**:
   - Directories: `kebab-case` (framework route segments like `[id]`, `(group)`, `@modal` permitted).
   - UI Components: `PascalCase` (`OrderSummaryCard.tsx`, `PaymentModal.vue`).
   - Hooks: `camelCase` with mandatory `use` prefix (`useAuthSession.ts`).
   - Logic & Contracts: `kebab-case` with explicit semantic suffix: `*.service.ts`, `*.api.ts`, `*.use-case.ts`, `*.schema.ts`, `*.types.ts`, `*.util.ts`, `*.store.ts`, `*.test.ts`.
   - No generic dumping-ground directories (`helpers/`, `misc/`, `common/`, `temp/`).
2. **Unidirectional DAG Law**:
   - Feature-Driven: `app (Routing Shell) -> features/* -> shared / core`.
   - `shared` NEVER imports `core`, `features`, or `app`. `core` NEVER imports `features` or `app`.
   - Sibling features NEVER import each other's internal files (`src/features/a/*` -X-> `src/features/b/components/*`).
   - Hexagonal: `interfaces -> application -> domain`; `infrastructure -> domain/application`; `domain` NEVER imports web frameworks, ORMs, HTTP clients, or UI libraries.
3. **Controlled Barrel Files**:
   - Allow `index.ts` ONLY at each feature's public boundary (`src/features/<domain>/index.ts`) or package entrypoint (`packages/<pkg>/src/index.ts`).
   - FORBID internal sub-barrels (`src/shared/ui/index.ts`, `src/features/*/components/index.ts`) to protect bundler tree-shaking and prevent Next.js `"use client"` contamination of Server Components.
4. **JSONC Path Aliases (`@/*`)**: Configure `@/* -> ./src/*` in `tsconfig.json` / `jsconfig.json` (parsed as JSONC) and forbid deep relative paths (`../../../`).
5. **AI & Server-Only Security Boundary**: Isolate AI SDKs (e.g., `@google/genai` >= 3.2.0, `openai`) and DB/payment clients strictly in server-only `src/core/ai/` or `src/infrastructure/ai/`. Never import them inside `"use client"` components, and flag legacy deprecated SDKs (`@google/generative-ai`).

### Phase C — Dynamic Lifecycle Management
Follow [references/dynamic-operations.md](./references/dynamic-operations.md) during active development:
- **Co-location Default (`place-file`)**: Scope to a single feature unless truly business-agnostic (`shared`) or singleton infrastructure (`core`).
- **Shared Coupling Promotion (`promote`)**: When a resource in `src/features/A` is required by `>= 2` features, promote it to `src/shared/` (or `src/core/domain/` for cross-domain entities) and rewrite all imports to `@/shared/...`. Always preview (`dry-run`) before mutating disk unless `--apply` or explicit authorization is given.
- **Density Guardrail (`audit`)**: Subdivide any directory accumulating `> 10` loose source files (`maxLooseFilesPerDirectory`).
- **Transition Cost Guardrail (`migrate`)**: Recommend a full architectural pattern change ONLY when `Strategic Value > (Implementation Cost + Migration Risk + Operational Fatigue)`. Otherwise favor incremental refinement.

---

## 3. Standard Output Format for Routing & Audit Decisions

When operating in interactive placement or audit mode, structure your response with:
1. **Verdict / Canonical Path**: Exact normalized path (e.g., `src/features/orders/components/OrderSummaryCard.tsx`).
2. **Architectural Justification**: Pattern + rule applied (`CO_LOCATION`, `SHARED_PRIMITIVE`, `CORE_INFRASTRUCTURE`, `AI_SERVER_BOUNDARY`, `ROUTING_SHELL`, `DAG_BOUNDARY`).
3. **Import & Barrel Impact**: Exact `@/*` import statement and whether `index.ts` should change.
4. **Reproducible Action / Command**: Exact command (`dwa ...`, PowerShell, or Bash) — mutating disk only when authorized.

---

## 4. Verification & References

- Validate manifests against `schemas/architecture-manifest.schema.json`.
- Verify live repositories with `node <skill-dir>/scripts/dwa-runner.cjs audit <dir>` until `status: PASS` (0 DAG errors, 0 cycles).
- Detailed guides (load progressively when needed):
  - [Decision Matrix & Frameworks](./references/decision-matrix.md)
  - [Naming, Barrels & DAG Laws](./references/naming-and-dag-rules.md)
  - [Dynamic Lifecycle Runbooks](./references/dynamic-operations.md)
  - [Ecosystem Synergies (KDE, IntentOrbit, Omni V5, Gemini API)](./references/ecosystem-synergies.md)
  - [Multi-Host Activation (Antigravity, Codex, ChatGPT, VS Code)](./references/multi-host-activation.md)
  - [Worked Scenarios](./examples/scenarios-walkthrough.md)
