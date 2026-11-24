# Architectural Decision Matrix & Framework Harmonization

## 1. Six-Axis Complexity Scoring Model

Evaluate every project from `0` (none) to `5` (critical/extensive) before choosing a pattern:

1. **Presentation & Design System Surface (`presentation`)**: Visual catalog complexity, theming, multi-brand tokens.
2. **Business Domain Complexity (`domainComplexity`)**: Number of distinct business nouns (Screaming Check) and domain invariants.
3. **Data & State Choreography (`dataAndState`)**: Client/server caches, optimistic UI, persistent entities, transactions.
4. **Security & Regulatory Compliance (`securityAndCompliance`)**: Auth/RBAC, multi-tenancy, PII/PHI (`healthcare`, `fintech`).
5. **Multi-App Scale (`multiAppScale`)**: Single deployable app vs web + admin + mobile + API ecosystem.
6. **Backend Autonomy (`backendAutonomy`)**: Pure static/frontend vs fullstack BFF vs standalone microservice.

---

## 2. Six Canonical Architectural Patterns

### Pattern 1: `classic-by-type` (Complexity: Low)
- **Use When**: Marketing landing pages, portfolios, static documentation microsites, quick prototypes (HTML/CSS/JS, Astro static).
- **Anti-Overengineering Rule**: Never wrap a 5-file static site in Feature-Driven or Hexagonal boilerplate.
- **Structure**: `src/{assets,styles,scripts,pages,components}`, `public/`.
- **Migration Trigger**: `> 3` distinct business domains, `> 25` source files, or introduction of authenticated mutations.

### Pattern 2: `atomic-design` (Complexity: Medium)
- **Use When**: Design systems, shared component libraries, Storybook catalogs, Web Components kits.
- **Structure**: `src/{tokens,components/{atoms,molecules,organisms,templates},hooks,utils,types}`, `src/index.ts`.
- **DAG**: `templates -> organisms -> molecules -> atoms -> tokens / utils / hooks`.

### Pattern 3: `feature-driven-screaming` (Complexity: High)
- **Use When**: Interactive SaaS, E-Commerce, dashboards, CRM, LMS, clinical portals (Next.js, Vite+React, Vue, Angular, Nuxt, SvelteKit).
- **Screaming Check**: Top-level folders under `src/features/` must scream the business domain (`patients/`, `appointments/`, `billing/`, `catalog/`, `orders/`) rather than generic technical buckets.
- **Structure**:
  ```text
  src/
  ├── app/                     # Thin Routing Shell (Next.js App Router / framework router)
  ├── features/<domain>/       # Self-contained vertical business slices
  │   ├── components/
  │   ├── hooks/
  │   ├── services/
  │   ├── types/
  │   ├── utils/
  │   └── index.ts             # Public API boundary (ONLY allowed barrel)
  ├── shared/                  # Business-agnostic primitives (ui, hooks, utils, types)
  └── core/                    # Singleton infrastructure (config, api, store, ai, security, audit)
  ```

### Pattern 4: `hexagonal-clean` (Complexity: Medium–High)
- **Use When**: Standalone REST/GraphQL APIs, backend services, webhooks, background workers (Node.js/TS, Python FastAPI, Go).
- **Structure**: `src/` (or `internal/` in Go) with `{domain/{entities,repositories,errors}, application/{use-cases,dtos}, infrastructure/{db,http,adapters,ai}, interfaces/{controllers,routes}, shared/utils}`.
- **Invariant**: `domain/` is 100% framework-free (zero Express, Fastify, Prisma, Mongoose, React, or HTTP imports).

### Pattern 5: `modular-monolith-fullstack` (Complexity: High)
- **Use When**: Single-repo fullstack platforms / BFFs where each business module owns both its server application/domain logic and its UI slice without microservice network overhead.
- **Structure**: `src/{app,modules/<domain>/{domain,application,ui,api,index.ts},shared,core}`.

### Pattern 6: `monorepo-workspaces` (Complexity: Very High)
- **Use When**: Multi-app ecosystems (e.g., customer web + admin portal + API + shared UI/domain packages) orchestrated by Turborepo, Nx, or pnpm workspaces.
- **Structure**: `apps/{web,admin,api}`, `packages/{ui,domain,config,utils,ai-sdk}`.
- **Workspace Mereology**: Explicitly separate Workspace Root (`pnpm-workspace.yaml` / `turbo.json`), Repository Root (`.git`), and individual Package Roots (`package.json`).

---

## 3. Framework Routing Shell Harmonization Table

| Framework | Routing Shell Dir | Business Logic Dir | RSC / `"use client"` Guard |
| :--- | :--- | :--- | :--- |
| Next.js App Router | `src/app/` | `src/features/<domain>/` | Strict (forbid internal UI barrels & client server-SDK leaks) |
| Next.js Pages Router | `src/pages/` | `src/features/<domain>/` | Standard |
| Astro | `src/pages/` | `src/components/` or `src/features/` | Island boundary awareness |
| Nuxt | `src/pages/` | `src/features/<domain>/` | Server routes in `server/` |
| SvelteKit | `src/routes/` | `src/features/<domain>/` | `+page.server.ts` vs client |
| Vite + React / Vue | `src/app/` | `src/features/<domain>/` | Client-only bundle (never embed secret SDKs) |
| Angular | `src/app/` | `src/features/<domain>/` | Standalone components |
| Node / FastAPI / Go | N/A | `src/domain/` (`internal/domain/`) | Server-only runtime |
