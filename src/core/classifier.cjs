'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PATTERNS, FRAMEWORKS, EVOLUTION_PATH } = require('./constants.cjs');
const { toKebabCase } = require('./naming.cjs');

const DOMAIN_DICTIONARY = [
  { canonical: 'auth', terms: ['auth', 'authentication', 'login', 'signup', 'oauth', 'rbac', 'session', 'autenticacion', 'sesion'] },
  { canonical: 'users', terms: ['user', 'users', 'profile', 'account', 'usuarios', 'perfil', 'cuentas'] },
  { canonical: 'billing', terms: ['billing', 'invoice', 'invoices', 'subscription', 'subscriptions', 'facturacion', 'facturas', 'suscripcion', 'suscripciones'] },
  { canonical: 'payments', terms: ['payment', 'payments', 'stripe', 'checkout', 'pagos', 'pasarela'] },
  { canonical: 'catalog', terms: ['catalog', 'product', 'products', 'sku', 'catalogo', 'productos'] },
  { canonical: 'cart', terms: ['cart', 'basket', 'carrito'] },
  { canonical: 'orders', terms: ['order', 'orders', 'fulfillment', 'shipping', 'pedidos', 'envios', 'ordenes'] },
  { canonical: 'inventory', terms: ['inventory', 'stock', 'warehouse', 'inventario'] },
  { canonical: 'patients', terms: ['patient', 'patients', 'ehr', 'clinical', 'pacientes', 'clinica', 'historia clinica'] },
  { canonical: 'appointments', terms: ['appointment', 'appointments', 'scheduling', 'booking', 'bookings', 'reservation', 'reservations', 'citas', 'reservas', 'agenda'] },
  { canonical: 'dashboard', terms: ['dashboard', 'overview', 'panel', 'tablero'] },
  { canonical: 'analytics', terms: ['analytics', 'metrics', 'reporting', 'reports', 'kpi', 'analitica', 'reportes', 'metricas'] },
  { canonical: 'crm', terms: ['crm', 'leads', 'contacts', 'deals', 'pipeline', 'clientes', 'contactos'] },
  { canonical: 'courses', terms: ['course', 'courses', 'lms', 'lesson', 'lessons', 'students', 'cursos', 'clases', 'estudiantes'] },
  { canonical: 'notifications', terms: ['notification', 'notifications', 'alerts', 'email', 'notificaciones', 'alertas'] },
  { canonical: 'messaging', terms: ['chat', 'messaging', 'messages', 'inbox', 'mensajeria', 'mensajes'] },
  { canonical: 'tenants', terms: ['tenant', 'tenants', 'multi-tenant', 'multitenant', 'workspace', 'organizations', 'multiempresa'] },
  { canonical: 'ledger', terms: ['ledger', 'accounting', 'transactions', 'wallet', 'contabilidad', 'transacciones'] },
  { canonical: 'content', terms: ['blog', 'articles', 'cms', 'posts', 'docs', 'articulos', 'contenido'] },
  { canonical: 'ai-assistant', terms: ['ai assistant', 'chatbot', 'rag', 'gemini', 'llm', 'copilot', 'asistente ia'] }
];

const VERTICAL_PROFILES = {
  healthcare: {
    terms: ['clinic', 'clinica', 'medical', 'medico', 'healthcare', 'salud', 'patient', 'paciente', 'hipaa', 'ehr'],
    securityLevel: 'regulated',
    extraCoreDirs: ['security', 'audit']
  },
  fintech: {
    terms: ['fintech', 'bank', 'banking', 'ledger', 'pci', 'financial', 'financiero', 'wallet', 'payments', 'pagos'],
    securityLevel: 'regulated',
    extraCoreDirs: ['security', 'audit']
  },
  ecommerce: {
    terms: ['ecommerce', 'e-commerce', 'tienda', 'store', 'shop', 'marketplace', 'checkout', 'cart', 'carrito'],
    securityLevel: 'high',
    extraCoreDirs: ['security']
  },
  saas: {
    terms: ['saas', 'multi-tenant', 'multitenant', 'subscription', 'suscripcion', 'b2b', 'erp', 'crm', 'plataforma'],
    securityLevel: 'high',
    extraCoreDirs: ['security']
  }
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesAny(text, list) {
  return list.some(term => {
    const normalized = normalizeText(term);
    if (normalized.includes(' ') || normalized.includes('-') || normalized.includes('/')) {
      return text.includes(normalized);
    }
    const regex = new RegExp(`(^|[^a-z0-9])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    return regex.test(text);
  });
}

function detectFramework(text, options = {}, existingPkg = null) {
  if (options.framework && FRAMEWORKS[options.framework]) {
    return { key: options.framework, confidence: 1.0, source: 'explicit' };
  }

  const deps = existingPkg ? { ...(existingPkg.dependencies || {}), ...(existingPkg.devDependencies || {}) } : {};

  if (deps.turbo || deps.nx || includesAny(text, ['monorepo', 'turborepo', 'nx', 'pnpm workspace', 'multi-app', 'multiapp', 'ecosistema multi-app', 'apps y packages', 'apps and packages'])) {
    return { key: 'turborepo-pnpm', confidence: 0.95, source: deps.turbo || deps.nx ? 'package.json' : 'context' };
  }
  if (deps.next || includesAny(text, ['next.js', 'nextjs', 'app router'])) {
    if (includesAny(text, ['pages router'])) {
      return { key: 'nextjs-pages-router', confidence: 0.9, source: 'context' };
    }
    return { key: 'nextjs-app-router', confidence: 0.95, source: deps.next ? 'package.json' : 'context' };
  }
  if (deps.astro || includesAny(text, ['astro'])) {
    return { key: 'astro', confidence: 0.92, source: deps.astro ? 'package.json' : 'context' };
  }
  if (deps.nuxt || includesAny(text, ['nuxt'])) {
    return { key: 'nuxt', confidence: 0.92, source: deps.nuxt ? 'package.json' : 'context' };
  }
  if (deps['@sveltejs/kit'] || includesAny(text, ['sveltekit', 'svelte'])) {
    return { key: 'sveltekit', confidence: 0.9, source: deps['@sveltejs/kit'] ? 'package.json' : 'context' };
  }
  if (deps['@angular/core'] || includesAny(text, ['angular'])) {
    return { key: 'angular', confidence: 0.92, source: deps['@angular/core'] ? 'package.json' : 'context' };
  }
  if (includesAny(text, ['fastapi', 'django', 'flask', 'python api', 'python backend'])) {
    return { key: 'python-fastapi', confidence: 0.9, source: 'context' };
  }
  if (includesAny(text, ['golang', 'go api', 'go microservice', 'gin', 'chi', 'fiber'])) {
    return { key: 'go-api', confidence: 0.9, source: 'context' };
  }
  if (deps['@storybook/react'] || deps.storybook || includesAny(text, ['design system', 'sistema de diseno', 'ui library', 'libreria ui', 'component library', 'storybook', 'web components', 'atomic design'])) {
    return { key: 'storybook-ui', confidence: 0.9, source: deps.storybook ? 'package.json' : 'context' };
  }
  if (deps.express || deps.fastify || deps['@nestjs/core'] || deps.hono || includesAny(text, ['api rest', 'rest api', 'graphql api', 'microservicio', 'microservice', 'backend', 'express', 'fastify', 'nestjs', 'hexagonal', 'clean architecture'])) {
    return { key: 'node-backend', confidence: 0.9, source: (deps.express || deps.fastify || deps['@nestjs/core']) ? 'package.json' : 'context' };
  }
  if (deps.vue || includesAny(text, ['vue', 'vuejs'])) {
    return { key: 'vite-vue', confidence: 0.88, source: deps.vue ? 'package.json' : 'context' };
  }
  if (deps.react || includesAny(text, ['react', 'vite'])) {
    return { key: 'vite-react', confidence: 0.88, source: deps.react ? 'package.json' : 'context' };
  }
  if (includesAny(text, ['html', 'css', 'vanilla', 'estatico', 'static', 'landing', 'micrositio', 'portfolio', 'portafolio', 'informativo'])) {
    return { key: 'vanilla-web', confidence: 0.85, source: 'context' };
  }

  return { key: 'nextjs-app-router', confidence: 0.6, source: 'inferred' };
}

function detectAiSdk(text, existingPkg = null) {
  const deps = existingPkg ? { ...(existingPkg.dependencies || {}), ...(existingPkg.devDependencies || {}) } : {};
  if (deps['@google/genai'] || includesAny(text, ['gemini', 'google genai', '@google/genai', 'gemini api', 'vertex'])) {
    return '@google/genai';
  }
  if (deps.openai || includesAny(text, ['openai', 'chatgpt api'])) {
    return 'openai';
  }
  if (deps.ai || includesAny(text, ['vercel ai', 'ai sdk'])) {
    return 'ai';
  }
  return null;
}

function extractDomains(text, explicitFeatures = []) {
  const found = new Set(
    (explicitFeatures || [])
      .map(f => toKebabCase(f))
      .filter(Boolean)
  );

  for (const entry of DOMAIN_DICTIONARY) {
    if (includesAny(text, entry.terms)) {
      found.add(entry.canonical);
    }
  }

  return Array.from(found);
}

function detectVerticals(text) {
  const hints = [];
  let securityLevel = 'standard';
  const extraCoreDirs = new Set();

  for (const [vertical, cfg] of Object.entries(VERTICAL_PROFILES)) {
    if (includesAny(text, cfg.terms)) {
      hints.push(vertical);
      if (cfg.securityLevel === 'regulated') {
        securityLevel = 'regulated';
      } else if (cfg.securityLevel === 'high' && securityLevel !== 'regulated') {
        securityLevel = 'high';
      }
      for (const dir of cfg.extraCoreDirs) extraCoreDirs.add(dir);
    }
  }

  return {
    verticalHints: hints,
    securityLevel,
    extraCoreDirs: Array.from(extraCoreDirs)
  };
}

function readExistingPackageJson(targetDir) {
  if (!targetDir) return null;
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function classifyProject({ context = '', projectName = '', framework = null, pattern = null, features = [], targetDir = null } = {}) {
  const existingPkg = readExistingPackageJson(targetDir);
  const rawText = `${projectName} ${context}`;
  const text = normalizeText(rawText);

  const fwDetection = detectFramework(text, { framework }, existingPkg);
  const fwSpec = FRAMEWORKS[fwDetection.key] || FRAMEWORKS['nextjs-app-router'];
  const aiSdk = detectAiSdk(text, existingPkg);
  const domains = extractDomains(text, features);
  const verticals = detectVerticals(text);

  // 6-Axis Complexity Scoring (0..5)
  const isSimpleSite = includesAny(text, ['landing', 'landing page', 'sitio informativo', 'micrositio', 'microsite', 'brochure', 'portfolio', 'portafolio', 'prototipo', 'prototype', 'sitio estatico', 'static site', 'blog personal']);
  const isDesignSystem = includesAny(text, ['design system', 'sistema de diseno', 'libreria ui', 'ui library', 'component library', 'storybook', 'atomic design', 'design tokens', 'web components']);
  const isBackendOnly = includesAny(text, ['api rest', 'rest api', 'graphql', 'microservicio', 'microservice', 'backend', 'hexagonal', 'clean architecture', 'worker', 'webhook service']) && !includesAny(text, ['frontend', 'ui', 'dashboard', 'landing', 'next.js', 'nextjs', 'react', 'vue', 'angular', 'fullstack']);
  const isFullstackMonolith = includesAny(text, ['modular monolith', 'monolito modular', 'fullstack monolith', 'bff']);
  const isMonorepo = fwDetection.key === 'turborepo-pnpm' || includesAny(text, ['monorepo', 'turborepo', 'nx', 'pnpm workspace', 'multi-app', 'multiapp', 'ecosistema multi-app', 'web + admin + api', 'web, admin, api', 'plataforma completa']);
  const hasAppShellSignals = includesAny(text, ['dashboard', 'admin panel', 'erp', 'crm', 'web app', 'aplicacion web', 'plataforma', 'gestion', 'portal', 'lms', 'marketplace', 'ecommerce', 'e-commerce']);
  const isComplexWebApp = hasAppShellSignals || domains.length >= 2 || (includesAny(text, ['saas']) && !isSimpleSite);

  const scores = {
    presentation: isDesignSystem ? 5 : isBackendOnly ? 0 : isSimpleSite ? 3 : 4,
    domainComplexity: isMonorepo ? 5 : isComplexWebApp || isBackendOnly ? Math.min(5, Math.max(3, domains.length)) : isDesignSystem ? 2 : 1,
    dataAndState: isSimpleSite ? 1 : isDesignSystem ? 1 : isMonorepo ? 5 : 4,
    securityAndCompliance: verticals.securityLevel === 'regulated' ? 5 : verticals.securityLevel === 'high' ? 4 : isSimpleSite ? 1 : 2,
    multiAppScale: isMonorepo ? 5 : isComplexWebApp ? 3 : 1,
    backendAutonomy: isBackendOnly ? 5 : isMonorepo ? 4 : isFullstackMonolith ? 4 : isComplexWebApp ? 3 : 0
  };

  let selectedPattern = pattern;
  let complexityLevel = 'medium';
  const rationale = [];

  if (selectedPattern && Object.values(PATTERNS).includes(selectedPattern)) {
    rationale.push(`Pattern "${selectedPattern}" explicitly specified by user.`);
  } else if (isMonorepo) {
    selectedPattern = PATTERNS.MONOREPO_WORKSPACES;
    complexityLevel = 'very-high';
    rationale.push('Detected multi-application ecosystem or workspace orchestrator (Turborepo/Nx/pnpm); modular workspace isolation prevents cross-app coupling.');
  } else if (isBackendOnly) {
    selectedPattern = PATTERNS.HEXAGONAL_CLEAN;
    complexityLevel = scores.domainComplexity >= 4 ? 'high' : 'medium-high';
    rationale.push('Detected backend/API/microservice intent; Hexagonal/Clean Architecture isolates pure domain rules from HTTP, DB, and external SDK adapters.');
  } else if (isDesignSystem) {
    selectedPattern = PATTERNS.ATOMIC_DESIGN;
    complexityLevel = 'medium';
    rationale.push('Detected reusable UI library / Design System intent; Atomic Design + Design Tokens maximizes visual composability and catalog clarity.');
  } else if (isFullstackMonolith) {
    selectedPattern = PATTERNS.MODULAR_MONOLITH_FULLSTACK;
    complexityLevel = 'high';
    rationale.push('Detected fullstack modular monolith / BFF intent; vertical bounded modules align UI and server handlers without microservice overhead.');
  } else if (isSimpleSite && !isComplexWebApp) {
    selectedPattern = PATTERNS.CLASSIC_BY_TYPE;
    complexityLevel = 'low';
    rationale.push('Detected lightweight marketing/informational site; Classic-by-Type prevents over-engineering while documenting clear future migration triggers.');
  } else {
    selectedPattern = PATTERNS.FEATURE_DRIVEN_SCREAMING;
    complexityLevel = 'high';
    rationale.push('Detected interactive domain-rich web application; Feature-Driven + Screaming Architecture scales business modules cleanly under a strict unidirectional DAG.');
  }

  // Ensure sensible complexity level even when pattern was forced
  if (selectedPattern === PATTERNS.CLASSIC_BY_TYPE) complexityLevel = 'low';
  if (selectedPattern === PATTERNS.ATOMIC_DESIGN) complexityLevel = 'medium';
  if (selectedPattern === PATTERNS.HEXAGONAL_CLEAN) complexityLevel = scores.domainComplexity >= 4 ? 'high' : 'medium-high';
  if (selectedPattern === PATTERNS.FEATURE_DRIVEN_SCREAMING || selectedPattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK) complexityLevel = 'high';
  if (selectedPattern === PATTERNS.MONOREPO_WORKSPACES) complexityLevel = 'very-high';

  // Ensure non-empty default features for feature-oriented patterns
  let resolvedFeatures = domains;
  const inferredDomains = domains.length === 0;
  if (resolvedFeatures.length === 0) {
    if (selectedPattern === PATTERNS.FEATURE_DRIVEN_SCREAMING || selectedPattern === PATTERNS.MODULAR_MONOLITH_FULLSTACK) {
      resolvedFeatures = ['auth', 'dashboard'];
    } else if (selectedPattern === PATTERNS.HEXAGONAL_CLEAN) {
      resolvedFeatures = ['health', 'core-domain'];
    }
  }

  const routingShellEnabled = Boolean(
    fwSpec.routingShell &&
    [PATTERNS.FEATURE_DRIVEN_SCREAMING, PATTERNS.MODULAR_MONOLITH_FULLSTACK, PATTERNS.MONOREPO_WORKSPACES].includes(selectedPattern)
  );

  if (routingShellEnabled) {
    rationale.push(`Routing Shell Pattern applied: "${fwSpec.routingShell}" stays a thin routing/layout shell delegating business logic to domain features.`);
  }
  if (aiSdk) {
    rationale.push(`AI SDK "${aiSdk}" detected: isolated strictly inside server-only core/infrastructure AI boundary to prevent API key leakage to client bundles.`);
  }
  if (verticals.verticalHints.length > 0) {
    rationale.push(`Vertical compliance hints detected (${verticals.verticalHints.join(', ')}): security profile elevated to "${verticals.securityLevel}".`);
  }

  const safeProjectName = toKebabCase(projectName || (existingPkg && existingPkg.name) || 'web-project') || 'web-project';

  return {
    project: safeProjectName,
    pattern: selectedPattern,
    complexityLevel,
    complexityScores: scores,
    stack: {
      framework: fwDetection.key,
      frameworkLabel: fwSpec.label,
      frameworkSource: fwDetection.source,
      language: fwSpec.language,
      supportsServerComponents: fwSpec.supportsServerComponents,
      aiSdk
    },
    routingShell: {
      enabled: routingShellEnabled,
      directory: routingShellEnabled ? fwSpec.routingShell : null,
      rule: routingShellEnabled
        ? `Keep ${fwSpec.routingShell} strictly as thin routing/layout composition; delegate state, components, and services to domain features.`
        : 'Not required for this framework/pattern.'
    },
    activeFeatures: resolvedFeatures,
    epistemicFlags: {
      framework: fwDetection.source === 'inferred' ? '[INFERRED]' : '[VERIFIED]',
      domains: inferredDomains ? '[INFERRED]' : '[VERIFIED]',
      pattern: pattern ? '[VERIFIED]' : '[CONCLUDED]'
    },
    securityProfile: {
      level: verticals.securityLevel,
      verticalHints: verticals.verticalHints,
      extraCoreDirs: verticals.extraCoreDirs
    },
    evolution: EVOLUTION_PATH[selectedPattern] || { next: null, triggers: [] },
    rationale
  };
}

module.exports = {
  classifyProject,
  extractDomains,
  detectFramework,
  detectAiSdk,
  detectVerticals
};
