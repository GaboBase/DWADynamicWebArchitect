# Worked Scenarios — Dynamic Web Architect (DWA v2.0)

## Scenario 1: Marketing Landing Page (Anti-Overengineering)
- **Prompt**: `/dynamic-web-architect init Landing page estatica para una cafeteria artesanal en Astro`
- **Verdict**: `classic-by-type` (`low` complexity), `src/{assets,styles,scripts,pages,components}`.
- **Why**: Avoids unnecessary `features/` and `core/` abstraction layers while recording exact migration triggers in `ARCHITECTURE.md`.

## Scenario 2: Clinical SaaS Portal with Next.js App Router + Gemini AI
- **Prompt**: `/dynamic-web-architect init SaaS clinico con pacientes, citas, facturacion y asistente Gemini en Next.js App Router`
- **Verdict**: `feature-driven-screaming` (`high` complexity, `regulated` healthcare profile).
- **Highlights**:
  - `src/app/` acts as thin Routing Shell only.
  - `src/features/{patients,appointments,billing,ai-assistant}/` each with controlled `index.ts` barrel.
  - `src/core/ai/`, `src/core/security/`, and `src/core/audit/` provisioned automatically.
  - `"use client"` components strictly forbidden from importing `@google/genai`.

## Scenario 3: Live File Placement (`place-file`)
- **Prompt**: `/dynamic-web-architect place-file InvoiceTable.tsx para el modulo de facturacion`
- **Verdict**: `src/features/billing/components/InvoiceTable.tsx` (`CO_LOCATION`).
- **Prompt**: `/dynamic-web-architect place-file formatCurrency.ts usado en toda la app`
- **Verdict**: `src/shared/utils/format-currency.util.ts` (`SHARED_PRIMITIVE`, auto-normalized to `kebab-case` + `.util.ts`).

## Scenario 4: Dynamic Promotion (`promote`)
- **Situation**: `src/features/orders/components/OrderView.tsx` illegally imports `src/features/billing/components/PriceBadge.tsx`.
- **Audit**: `dwa audit` flags `CROSS_FEATURE_INTERNAL_IMPORT` and lists `PriceBadge.tsx` as a Promotion Candidate (`billing`, `orders`).
- **Resolution**: `dwa promote src/features/billing/components/PriceBadge.tsx --apply` moves it to `src/shared/ui/PriceBadge.tsx` and rewrites all imports to `@/shared/ui/PriceBadge`.
- **Re-Audit**: `dwa audit` returns `PASS` (`100/100`).
