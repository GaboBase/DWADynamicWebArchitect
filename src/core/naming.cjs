'use strict';

const path = require('node:path');

const NEXTJS_SPECIAL_FILES = new Set([
  'page', 'layout', 'loading', 'error', 'not-found', 'template',
  'default', 'route', 'global-error', 'middleware', 'instrumentation',
  'robots', 'sitemap', 'manifest', 'icon', 'opengraph-image', 'twitter-image'
]);

const SVELTEKIT_SPECIAL_PREFIXES = ['+page', '+layout', '+server', '+error'];

const SPECIAL_ENTRY_BASENAMES = new Set([
  'index', 'main', 'app', 'server', 'client', 'env', 'config', 'setup', 'entry'
]);

function splitWords(input) {
  return String(input || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s.]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .filter(Boolean);
}

function toKebabCase(input) {
  return splitWords(input).map(w => w.toLowerCase()).join('-');
}

function toPascalCase(input) {
  return splitWords(input)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(input) {
  const words = splitWords(input);
  if (words.length === 0) return '';
  return words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function isKebabCase(name) {
  // Allow dynamic route segments like [id], [...slug], (marketing), @modal
  if (/^(\[\.{0,3}[a-z0-9-]+\]|\([a-z0-9-]+\)|@[a-z0-9-]+|_[a-z0-9-]+)$/i.test(name)) {
    return true;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isPascalCase(name) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

function isHookName(stem) {
  return /^use[A-Z][a-zA-Z0-9]*$/.test(stem);
}

function detectFileRole(filename, explicitRole = null) {
  if (explicitRole) return explicitRole;
  const base = path.basename(filename);
  const lower = base.toLowerCase();
  const ext = path.extname(base).toLowerCase();
  const stem = base.slice(0, base.length - ext.length);

  if (/\.(test|spec)\.[a-z]+$/i.test(base)) return 'test';
  if (/\.service\.[a-z]+$/i.test(base) || /\.api\.[a-z]+$/i.test(base) || /service$/i.test(stem)) return 'service';
  if (/\.use-?case\.[a-z]+$/i.test(base) || /usecase$/i.test(stem)) return 'use-case';
  if (/\.schema\.[a-z]+$/i.test(base) || /schema$/i.test(stem)) return 'schema';
  if (/\.types?\.[a-z]+$/i.test(base) || /types?$/i.test(stem)) return 'types';
  if (/\.util(s)?\.[a-z]+$/i.test(base) || /^(format|parse|calc|calculate|validate|sanitize|normalize|build|map|convert)/i.test(stem)) return 'util';
  if (/\.store\.[a-z]+$/i.test(base) || /store$/i.test(stem)) return 'store';
  if (/\.controller\.[a-z]+$/i.test(base) || /controller$/i.test(stem)) return 'controller';
  if (/\.repository\.[a-z]+$/i.test(base) || /repo(sitory)?$/i.test(stem)) return 'repository';
  if (/\.entity\.[a-z]+$/i.test(base) || /entity$/i.test(stem)) return 'entity';
  if (/\.dto\.[a-z]+$/i.test(base) || /dto$/i.test(stem)) return 'dto';
  if (/^use[A-Z_-]/.test(stem) || /^use-[a-z]/.test(lower)) return 'hook';
  if (ext === '.tsx' || ext === '.jsx' || ext === '.vue' || ext === '.svelte' || ext === '.astro') return 'component';
  if (ext === '.css' || ext === '.scss' || ext === '.less') return 'style';
  return 'util';
}

function stripKnownSuffix(stem) {
  return stem
    .replace(/\.(service|api|use-case|usecase|schema|types?|util|utils|store|controller|repository|entity|dto|test|spec|hook)$/i, '')
    .replace(/(Service|UseCase|Schema|Types?|Util|Utils|Store|Controller|Repository|Entity|Dto)$/i, '');
}

function normalizeFileName(filename, role = null, defaultExt = '.ts') {
  const base = path.basename(String(filename || '').trim());
  const rawExt = path.extname(base);
  const ext = rawExt || defaultExt;
  const stem = rawExt ? base.slice(0, base.length - rawExt.length) : base;
  const resolvedRole = detectFileRole(base, role);

  if (NEXTJS_SPECIAL_FILES.has(stem) || SVELTEKIT_SPECIAL_PREFIXES.some(p => stem.startsWith(p))) {
    return { normalized: base, role: 'route', changed: false };
  }

  let normalized = base;

  switch (resolvedRole) {
    case 'component': {
      const cleanStem = stem.replace(/\.component$/i, '');
      const compExt = rawExt || (defaultExt === '.js' ? '.jsx' : '.tsx');
      normalized = `${toPascalCase(cleanStem)}${compExt}`;
      break;
    }
    case 'hook': {
      const withoutUse = stem.replace(/^use[-_]?/i, '');
      const hookBody = toPascalCase(withoutUse || 'State');
      normalized = `use${hookBody}${ext}`;
      break;
    }
    case 'service': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.service${ext}`;
      break;
    }
    case 'use-case': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.use-case${ext}`;
      break;
    }
    case 'schema': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.schema${ext}`;
      break;
    }
    case 'types': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.types${ext}`;
      break;
    }
    case 'util': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.util${ext}`;
      break;
    }
    case 'store': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.store${ext}`;
      break;
    }
    case 'controller': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.controller${ext}`;
      break;
    }
    case 'repository': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.repository${ext}`;
      break;
    }
    case 'entity': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.entity${ext}`;
      break;
    }
    case 'dto': {
      const core = toKebabCase(stripKnownSuffix(stem) || stem);
      normalized = `${core}.dto${ext}`;
      break;
    }
    case 'test': {
      const withoutTest = stem.replace(/\.(test|spec)$/i, '');
      const isComp = isPascalCase(withoutTest);
      const clean = isComp ? withoutTest : toKebabCase(withoutTest);
      normalized = `${clean}.test${ext}`;
      break;
    }
    case 'style': {
      normalized = `${toKebabCase(stem)}${ext}`;
      break;
    }
    default: {
      normalized = `${toKebabCase(stem)}${ext}`;
    }
  }

  return {
    normalized,
    role: resolvedRole,
    changed: normalized !== base
  };
}

function validateFileNameInDirectory(relPath) {
  const normalizedRel = relPath.replace(/\\/g, '/');
  const parts = normalizedRel.split('/').filter(Boolean);
  const issues = [];

  // Check directory segments (skip root dot-folders like .github, .vscode)
  const dirs = parts.slice(0, -1);
  for (const dir of dirs) {
    if (dir.startsWith('.')) continue;
    if (!isKebabCase(dir)) {
      issues.push({
        code: 'NAMING_DIR_NOT_KEBAB',
        severity: 'WARN',
        path: normalizedRel,
        message: `Directory "${dir}" should use kebab-case (suggested: "${toKebabCase(dir)}").`
      });
    }
  }

  const filename = parts[parts.length - 1];
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  const parentDir = dirs[dirs.length - 1] || '';

  if (
    filename.startsWith('.') ||
    SPECIAL_ENTRY_BASENAMES.has(stem.toLowerCase()) ||
    NEXTJS_SPECIAL_FILES.has(stem) ||
    SVELTEKIT_SPECIAL_PREFIXES.some(p => stem.startsWith(p)) ||
    /\.(test|spec|d)\.[a-z]+$/i.test(filename) ||
    /\.config\.[a-z]+$/i.test(filename)
  ) {
    return issues;
  }

  // Components directory -> PascalCase
  if (
    (parentDir === 'components' || parentDir === 'ui' || parentDir === 'atoms' || parentDir === 'molecules' || parentDir === 'organisms' || parentDir === 'templates') &&
    (ext === '.tsx' || ext === '.jsx' || ext === '.vue' || ext === '.svelte')
  ) {
    if (!isPascalCase(stem)) {
      issues.push({
        code: 'NAMING_COMPONENT_NOT_PASCAL',
        severity: 'WARN',
        path: normalizedRel,
        message: `UI component "${filename}" should use PascalCase (suggested: "${toPascalCase(stem)}${ext}").`
      });
    }
  }

  // Hooks directory -> useCamelCase
  if (parentDir === 'hooks' && ['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    if (!isHookName(stem)) {
      issues.push({
        code: 'NAMING_HOOK_INVALID',
        severity: 'WARN',
        path: normalizedRel,
        message: `Hook "${filename}" must use camelCase with "use" prefix (suggested: "${normalizeFileName(filename, 'hook', ext).normalized}").`
      });
    }
  }

  // Services directory -> *.service.ts or *.api.ts
  if (parentDir === 'services' && ['.ts', '.js', '.cjs', '.mjs'].includes(ext)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(service|api)\.(ts|js|cjs|mjs)$/.test(filename)) {
      issues.push({
        code: 'NAMING_SERVICE_SUFFIX',
        severity: 'WARN',
        path: normalizedRel,
        message: `Service "${filename}" should use kebab-case with .service${ext} or .api${ext} suffix (suggested: "${normalizeFileName(filename, 'service', ext).normalized}").`
      });
    }
  }

  // Utils directory -> *.util.ts
  if (parentDir === 'utils' && ['.ts', '.js', '.cjs', '.mjs'].includes(ext)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.util\.(ts|js|cjs|mjs)$/.test(filename)) {
      issues.push({
        code: 'NAMING_UTIL_SUFFIX',
        severity: 'WARN',
        path: normalizedRel,
        message: `Utility "${filename}" should use kebab-case with .util${ext} suffix (suggested: "${normalizeFileName(filename, 'util', ext).normalized}").`
      });
    }
  }

  return issues;
}

module.exports = {
  toKebabCase,
  toPascalCase,
  toCamelCase,
  isKebabCase,
  isPascalCase,
  isHookName,
  detectFileRole,
  normalizeFileName,
  validateFileNameInDirectory
};
