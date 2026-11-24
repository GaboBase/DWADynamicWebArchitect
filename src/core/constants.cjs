'use strict';

const SCHEMA_VERSION = '2.0.0';
const DEFAULT_MAX_LOOSE_FILES = 10;
const DEFAULT_PROMOTION_THRESHOLD = 2;

const PATTERNS = {
  CLASSIC_BY_TYPE: 'classic-by-type',
  ATOMIC_DESIGN: 'atomic-design',
  FEATURE_DRIVEN_SCREAMING: 'feature-driven-screaming',
  HEXAGONAL_CLEAN: 'hexagonal-clean',
  MODULAR_MONOLITH_FULLSTACK: 'modular-monolith-fullstack',
  MONOREPO_WORKSPACES: 'monorepo-workspaces'
};

const FRAMEWORKS = {
  'nextjs-app-router': {
    label: 'Next.js (App Router)',
    language: 'typescript',
    routingShell: 'src/app',
    sourceRoot: 'src',
    supportsServerComponents: true,
    configFiles: ['next.config.ts', 'tsconfig.json']
  },
  'nextjs-pages-router': {
    label: 'Next.js (Pages Router)',
    language: 'typescript',
    routingShell: 'src/pages',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['next.config.ts', 'tsconfig.json']
  },
  'astro': {
    label: 'Astro',
    language: 'typescript',
    routingShell: 'src/pages',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['astro.config.mjs', 'tsconfig.json']
  },
  'nuxt': {
    label: 'Nuxt',
    language: 'typescript',
    routingShell: 'src/pages',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['nuxt.config.ts', 'tsconfig.json']
  },
  'sveltekit': {
    label: 'SvelteKit',
    language: 'typescript',
    routingShell: 'src/routes',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['svelte.config.js', 'tsconfig.json']
  },
  'vite-react': {
    label: 'Vite + React',
    language: 'typescript',
    routingShell: 'src/app',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['vite.config.ts', 'tsconfig.json']
  },
  'vite-vue': {
    label: 'Vite + Vue',
    language: 'typescript',
    routingShell: 'src/app',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['vite.config.ts', 'tsconfig.json']
  },
  'angular': {
    label: 'Angular',
    language: 'typescript',
    routingShell: 'src/app',
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['angular.json', 'tsconfig.json']
  },
  'storybook-ui': {
    label: 'Design System / Component Library',
    language: 'typescript',
    routingShell: null,
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['tsconfig.json', 'vite.config.ts']
  },
  'node-backend': {
    label: 'Node.js / TypeScript API',
    language: 'typescript',
    routingShell: null,
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['tsconfig.json', 'package.json']
  },
  'python-fastapi': {
    label: 'Python FastAPI',
    language: 'python',
    routingShell: null,
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['pyproject.toml']
  },
  'go-api': {
    label: 'Go Microservice',
    language: 'go',
    routingShell: null,
    sourceRoot: 'internal',
    supportsServerComponents: false,
    configFiles: ['go.mod']
  },
  'turborepo-pnpm': {
    label: 'Turborepo + pnpm Workspaces',
    language: 'typescript',
    routingShell: 'apps/web/src/app',
    sourceRoot: 'apps',
    supportsServerComponents: true,
    configFiles: ['turbo.json', 'pnpm-workspace.yaml', 'tsconfig.base.json']
  },
  'vanilla-web': {
    label: 'Vanilla HTML/CSS/JS',
    language: 'html-css-js',
    routingShell: null,
    sourceRoot: 'src',
    supportsServerComponents: false,
    configFiles: ['package.json']
  }
};

const FORBIDDEN_GENERIC_DIRS = new Set([
  'helpers',
  'misc',
  'common',
  'stuff',
  'temp',
  'tmp-files',
  'other',
  'general',
  'various'
]);

const SERVER_ONLY_PACKAGES = [
  '@google/genai',
  'google-genai',
  'openai',
  '@anthropic-ai/sdk',
  'pg',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'prisma',
  '@prisma/client',
  'drizzle-orm',
  'mongoose',
  'ioredis',
  'redis',
  'stripe',
  'jsonwebtoken',
  'bcryptjs',
  'argon2',
  'nodemailer',
  'fs',
  'node:fs',
  'node:crypto',
  'node:child_process',
  'child_process'
];

const DEPRECATED_AI_PACKAGES = [
  '@google/generative-ai',
  'google-generativeai'
];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.astro'
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.cache',
  '__pycache__',
  '.venv',
  'venv'
]);

const NAMING_CONVENTIONS = {
  directories: 'kebab-case (e.g., user-profile/, billing-history/)',
  components: 'PascalCase (e.g., UserCard.tsx, PaymentModal.vue)',
  hooks: 'camelCase with mandatory use prefix (e.g., useAuthSession.ts)',
  services: 'kebab-case with .service.<ext> or .api.<ext> suffix (e.g., checkout.service.ts)',
  useCases: 'kebab-case with .use-case.<ext> suffix (e.g., process-payment.use-case.ts)',
  schemas: 'kebab-case with .schema.<ext> suffix (e.g., order.schema.ts)',
  types: 'kebab-case with .types.<ext> suffix (e.g., customer.types.ts)',
  utils: 'kebab-case with .util.<ext> suffix (e.g., format-currency.util.ts)',
  tests: 'co-located *.test.<ext> or *.spec.<ext> next to subject under test'
};

const EVOLUTION_PATH = {
  [PATTERNS.CLASSIC_BY_TYPE]: {
    next: PATTERNS.FEATURE_DRIVEN_SCREAMING,
    triggers: [
      'More than 3 distinct business domains emerge with shared state or API calls',
      'More than 25 source files accumulate across flat /components or /js folders',
      'Authentication, role-based access, or persistent backend mutations are introduced'
    ]
  },
  [PATTERNS.ATOMIC_DESIGN]: {
    next: PATTERNS.MONOREPO_WORKSPACES,
    triggers: [
      'Multiple consuming applications require versioned UI packages alongside product apps',
      'Design tokens and component primitives must be published independently across teams'
    ]
  },
  [PATTERNS.FEATURE_DRIVEN_SCREAMING]: {
    next: PATTERNS.MONOREPO_WORKSPACES,
    triggers: [
      'A second deployable app (e.g., admin portal, mobile client, dedicated API) shares domain contracts or UI',
      'Build/test times or team ownership boundaries require isolated workspace packages'
    ]
  },
  [PATTERNS.HEXAGONAL_CLEAN]: {
    next: PATTERNS.MONOREPO_WORKSPACES,
    triggers: [
      'Multiple microservices or BFF + frontend apps need shared domain DTOs, schemas, and SDK packages'
    ]
  },
  [PATTERNS.MODULAR_MONOLITH_FULLSTACK]: {
    next: PATTERNS.MONOREPO_WORKSPACES,
    triggers: [
      'Independent scaling or deployment cadence is required between web UI and backend API modules'
    ]
  },
  [PATTERNS.MONOREPO_WORKSPACES]: {
    next: null,
    triggers: [
      'Already at top-tier multi-app workspace architecture; optimize via strict package boundaries and remote caching'
    ]
  }
};

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_MAX_LOOSE_FILES,
  DEFAULT_PROMOTION_THRESHOLD,
  PATTERNS,
  FRAMEWORKS,
  FORBIDDEN_GENERIC_DIRS,
  SERVER_ONLY_PACKAGES,
  DEPRECATED_AI_PACKAGES,
  SOURCE_EXTENSIONS,
  IGNORED_DIRS,
  NAMING_CONVENTIONS,
  EVOLUTION_PATH
};
