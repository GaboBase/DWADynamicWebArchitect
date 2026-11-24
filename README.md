# Dynamic Web Architect (DWA v2.0)

> **Motor determinista de arquitectura web, scaffolding inicial, enrutamiento dinámico de archivos (`place-file`), promoción por acoplamiento compartido (`promote`), linter estructural DAG (`audit`) y gobierno evolutivo (`sync` / `migrate`).**
> Compatible con **Antigravity**, **OpenAI Codex**, **ChatGPT** y **Visual Studio Code** mediante `/dynamic-web-architect` y activación automática.

---

## Capacidades Principales

1. **Matriz de Decisión Multi-Eje (6 Patrones Canónicos + 14 Frameworks)**:
   - `classic-by-type` · `atomic-design` · `feature-driven-screaming` · `hexagonal-clean` · `modular-monolith-fullstack` · `monorepo-workspaces`.
   - Armonización automática con frameworks de rutas por archivos (**Routing Shell Pattern** para Next.js App/Pages Router, Astro, Nuxt, SvelteKit).
   - Detección automática de verticales reguladas (`healthcare`, `fintech`, `ecommerce`, `saas`) y fronteras seguras para SDKs de IA (`@google/genai`, `openai`).
2. **Gobernanza de Nomenclatura, Barriles y Aliases JSONC**:
   - Directorios `kebab-case`, componentes `PascalCase`, hooks `useCamelCase`, sufijos semánticos explícitos (`*.service.ts`, `*.use-case.ts`, `*.schema.ts`, `*.types.ts`, `*.util.ts`), rechazo de carpetas genéricas (`helpers/`, `misc/`, `common/`).
   - Barriles `index.ts` restringidos a fronteras públicas de feature/paquete para proteger *tree-shaking* y Server Components de Next.js.
   - Lectura nativa de `tsconfig.json`/`jsconfig.json` como **JSONC** para resolver aliases `@/*`.
3. **Gestión Dinámica del Ciclo de Vida**:
   - `place-file`: Asigna ruta canónica normalizada con justificación e impacto en barriles.
   - `promote`: Detecta acoplamiento entre `>=2` features, mueve el recurso a `src/shared/` o `src/core/` y reescribe todas las importaciones de forma segura (`dry-run` por defecto, `--apply` para ejecutar).
   - `audit`: Linter estático real con **Health Score (0–100)** que detecta violaciones DAG, imports cruzados entre features, ciclos DFS, carpetas con `>10` archivos sueltos, barriles internos ilegales, imports `../../../`, fugas de SDKs server-only en `"use client"` y SDKs Gemini deprecados (`@google/generative-ai`).
   - `sync`: Reconcilia `architecture-manifest.json` (con checksum SHA-256) y `ARCHITECTURE.md` preservando notas ADR humanas.
   - `migrate`: Evalúa migraciones de patrón bajo el **Guardarraíl de Costo de Transición** evitando sobre-reingeniería prematura.

---

## Instalación Rápida por Plataforma

| Plataforma | Cómo Instalar | Cómo Invocar |
| :--- | :--- | :--- |
| **Antigravity** | Ejecutar `npm run sync:global` (instala el plugin en `~/.gemini/config/plugins/dynamic-web-architect/`) | `/dynamic-web-architect` o lenguaje natural |
| **OpenAI Codex** | Usar el paquete con `.codex-plugin/plugin.json` o copiar `skills/dynamic-web-architect/` a `.agents/skills/` | `$dynamic-web-architect` o `/dynamic-web-architect` |
| **ChatGPT** | Copiar `portable-adapters/chatgpt/GPT_INSTRUCTIONS.md` en tu Custom GPT o Project Instructions | `/dynamic-web-architect` o lenguaje natural |
| **VS Code** | Copiar `.github/prompts/dynamic-web-architect.prompt.md` y `.github/instructions/dynamic-web-architect.instructions.md` a tu repo | `/dynamic-web-architect` en Copilot Chat + Tasks |

---

## Uso del CLI Determinista (Node >= 18, 0 Dependencias)

```bash
# 1. Clasificar un proyecto
node bin/dwa.cjs classify --context "SaaS clinico con pacientes, citas, facturacion y Gemini AI en Next.js App Router"

# 2. Previsualizar (dry-run) o materializar (--apply) scaffolding completo
node bin/dwa.cjs init ./mi-proyecto --context "SaaS clinico en Next.js App Router" --apply

# 3. Enrutar un archivo nuevo
node bin/dwa.cjs place-file InvoiceTable.tsx --feature billing --dir ./mi-proyecto

# 4. Auditar fronteras DAG, ciclos, nomenclatura y seguridad
node bin/dwa.cjs audit ./mi-proyecto

# 5. Promover un recurso compartido y reescribir imports
node bin/dwa.cjs promote src/features/billing/components/PriceBadge.tsx --dir ./mi-proyecto --apply

# 6. Sincronizar manifiesto y ARCHITECTURE.md
node bin/dwa.cjs sync ./mi-proyecto

# 7. Evaluar migracion evolutiva con Guardarraíl de Costo de Transición
node bin/dwa.cjs migrate monorepo-workspaces --dir ./mi-proyecto --reason "Adding admin portal and shared UI package"
```

---

## Verificación y Pruebas

```bash
npm test          # Suite completa node:test (clasificador, E2E lifecycle, migración, empaquetado)
npm run validate  # Validador de manifiestos Antigravity/Codex, SKILL.md, schema y adaptadores
npm run self:audit # Dogfooding: DWA audita su propia arquitectura
```

Para la especificación técnica exhaustiva, consulta [docs/TOOL_SPECIFICATION.md](./docs/TOOL_SPECIFICATION.md) y [portable-adapters/README.md](./portable-adapters/README.md).
