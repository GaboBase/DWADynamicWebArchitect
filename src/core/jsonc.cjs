'use strict';

/**
 * Dependency-free JSONC (JSON with Comments and Trailing Commas) parser.
 * Essential for accurately reading tsconfig.json, jsconfig.json, and editor configs
 * without corrupting URLs or comment-like tokens inside string literals.
 */

function stripJsoncComments(input) {
  if (typeof input !== 'string') return '';
  let out = '';
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    // Single-line comment //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < input.length && input[i] !== '\n' && input[i] !== '\r') {
        i += 1;
      }
      continue;
    }

    // Multi-line comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function stripTrailingCommas(input) {
  let out = '';
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < input.length) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) {
        j += 1;
      }
      if (input[j] === '}' || input[j] === ']') {
        i += 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

function parseJsonc(raw) {
  const withoutBom = typeof raw === 'string' && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : String(raw || '');
  const cleaned = stripTrailingCommas(stripJsoncComments(withoutBom));
  return JSON.parse(cleaned);
}

module.exports = {
  stripJsoncComments,
  stripTrailingCommas,
  parseJsonc
};
