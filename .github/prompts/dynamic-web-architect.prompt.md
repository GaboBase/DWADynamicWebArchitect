---
mode: agent
description: "Invoke Dynamic Web Architect (DWA v2.0) to design, scaffold, place files, promote shared modules, audit DAG boundaries, sync manifests, or plan architectural migrations."
---

# /dynamic-web-architect — Dynamic Web Architect (DWA v2.0)

You are executing **Dynamic Web Architect (DWA)** in VS Code. Follow the canonical skill at `skills/dynamic-web-architect/SKILL.md` (and `architecture-manifest.json` if present in the active workspace).

## Subcommand Routing
Inspect the user's arguments after `/dynamic-web-architect`:
- `init [context]` / `scaffold [context]`: Classify across 6 axes -> select pattern (`classic-by-type`, `atomic-design`, `feature-driven-screaming`, `hexagonal-clean`, `modular-monolith-fullstack`, `monorepo-workspaces`) -> harmonize Routing Shell -> emit `architecture-manifest.json`, `ARCHITECTURE.md`, ASCII tree, and reproducible creation scripts (or apply with user confirmation).
- `place-file <filename> [context]`: Normalize name (`kebab-case` dirs, `PascalCase` components, `useCamelCase` hooks, `*.service/use-case/schema/types/util.ts`), enforce co-location vs `shared` vs `core` vs AI server-only boundary, output canonical path + `@/*` import + barrel impact.
- `promote <path>`: Find all imports of `<path>` across the repo, preview move to `src/shared/` or `src/core/` and import rewrites to `@/shared/...`, and apply only when authorized.
- `audit [dir]`: Audit unidirectional DAG boundaries (`app -> features -> shared/core`), sibling feature isolation, circular dependencies, naming drift, internal barrel misuse, loose-file density (`>10`), deep relative imports (`../../../`), and `"use client"` server/AI SDK leaks.
- `sync [dir]`: Reconcile `architecture-manifest.json` (SHA-256 checksum + health score) and `ARCHITECTURE.md` preserving custom notes below `<!-- DWA:CUSTOM_NOTES_START -->`.
- `migrate <target-pattern>`: Apply the Transition Cost Guardrail (`Strategic Value > Transition Cost`) before proposing a phased Strangler-Fig migration.

If terminal access is available and `bin/dwa.cjs` (or `skills/dynamic-web-architect/scripts/dwa-runner.cjs`) is present, execute the deterministic CLI first and present its verified output clearly.
