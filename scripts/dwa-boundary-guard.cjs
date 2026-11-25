#!/usr/bin/env node
'use strict';

/**
 * Dynamic Web Architect (DWA) — Safe, Fast, Non-Destructive PostToolUse Boundary Guard.
 *
 * Behavior:
 * - Strictly non-destructive: NEVER modifies files, NEVER deletes files, ALWAYS exits 0.
 * - Inert on non-DWA workspaces: if no `architecture-manifest.json` is found in the target
 *   workspace hierarchy (unless `DWA_BOUNDARY_GUARD=1` is explicitly set), exits 0 silently.
 * - Opt-out supported: `DWA_HOOK_DISABLED=1` or `DWA_BOUNDARY_GUARD=0` exits 0 silently.
 * - Informative on DWA violations: checks the edited source file/workspace via `auditProject`
 *   and emits a concise PostToolUse advisory payload on stdout when violations are detected.
 */

const fs = require('node:fs');
const path = require('node:path');
const { auditProject } = require('../src/index.cjs');
const { SOURCE_EXTENSIONS } = require('../src/core/constants.cjs');
const { toPosix } = require('../src/core/import-parser.cjs');

const MAX_FINDINGS_IN_ADVISORY = 5;
const STDIN_READ_TIMEOUT_MS = 200;

function readStdinSafe() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
      try {
        process.stdin.pause();
      } catch {
        // Ignore pause errors
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const onData = chunk => chunks.push(chunk);
    const onEnd = () => done();
    const onError = () => done();
    const timer = setTimeout(done, STDIN_READ_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });
}

function parsePayload(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function extractEditedFile(payload) {
  const input = payload.tool_input || payload.arguments || payload;
  const candidates = [
    process.env.DWA_TARGET_FILE,
    input && input.file_path,
    input && input.path,
    input && input.TargetFile,
    input && input.target_file,
    input && input.Path,
    payload.file_path,
    payload.path
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim();
    }
  }
  return null;
}

function extractBaseCwd(payload) {
  const candidates = [
    process.env.DWA_WORKSPACE_DIR,
    payload.cwd,
    Array.isArray(payload.workspace_roots) ? payload.workspace_roots[0] : null,
    process.env.CLAUDE_PROJECT_DIR,
    process.cwd()
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && fs.existsSync(c.trim())) {
      return path.resolve(c.trim());
    }
  }
  return process.cwd();
}

function findManifestRoot(startDir) {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, 'architecture-manifest.json'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr || fs.existsSync(path.join(curr, '.git'))) {
      // Check one last time if .git is at root without manifest
      return fs.existsSync(path.join(curr, 'architecture-manifest.json')) ? curr : null;
    }
    curr = parent;
  }
}

function isRelevantTargetFile(relPath) {
  const norm = toPosix(relPath);
  if (norm === 'architecture-manifest.json') return true;
  const ext = path.extname(norm).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) return false;
  return /^(src|internal|apps|packages)\//.test(norm);
}

function evaluateGuard({ payload = {}, env = process.env } = {}) {
  if (env.DWA_HOOK_DISABLED === '1' || env.DWA_BOUNDARY_GUARD === '0') {
    return { active: false, reason: 'disabled', advisory: null };
  }

  const baseCwd = extractBaseCwd(payload);
  const rawFile = extractEditedFile(payload);
  const resolvedFile = rawFile
    ? (path.isAbsolute(rawFile) ? path.resolve(rawFile) : path.resolve(baseCwd, rawFile))
    : null;

  const probeDir = resolvedFile
    ? (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isDirectory() ? resolvedFile : path.dirname(resolvedFile))
    : baseCwd;

  let workspaceRoot = fs.existsSync(probeDir) ? findManifestRoot(probeDir) : null;
  if (!workspaceRoot) {
    workspaceRoot = findManifestRoot(baseCwd);
  }

  const optInWithoutManifest = env.DWA_BOUNDARY_GUARD === '1';
  if (!workspaceRoot && !optInWithoutManifest) {
    return { active: false, reason: 'non-dwa-workspace', advisory: null };
  }

  const targetWorkspace = workspaceRoot || baseCwd;
  const editedRel = resolvedFile ? toPosix(path.relative(targetWorkspace, resolvedFile)) : null;

  if (editedRel && !editedRel.startsWith('..') && !isRelevantTargetFile(editedRel)) {
    return { active: false, reason: 'non-source-file', advisory: null };
  }

  const audit = auditProject(targetWorkspace);
  let relevant = audit.findings;
  if (editedRel && !editedRel.startsWith('..')) {
    const editedDir = path.posix.dirname(editedRel);
    const matching = audit.findings.filter(
      f => f.path === editedRel || f.target === editedRel || f.path === editedDir
    );
    if (matching.length > 0) {
      relevant = matching;
    } else {
      // No violations on the edited file/directory -> remain quiet & fast
      return { active: true, reason: 'clean-file', advisory: null, audit };
    }
  }

  if (relevant.length === 0) {
    return { active: true, reason: 'clean', advisory: null, audit };
  }

  const topFindings = relevant.slice(0, MAX_FINDINGS_IN_ADVISORY);
  const lines = topFindings.map(f => `[${f.severity}] ${f.code} (${f.path}${f.line ? `:${f.line}` : ''}): ${f.message}`);
  const contextText = [
    `DWA Boundary Guard (${audit.pattern}, health ${audit.healthScore}/100, status ${audit.status}):`,
    ...lines,
    audit.promotionCandidates.length > 0
      ? `Promotion candidate(s): ${audit.promotionCandidates.map(c => c.file).join(', ')} (preview via dwa_promote_preview).`
      : null
  ].filter(Boolean).join('\n');

  return {
    active: true,
    reason: 'violations-detected',
    audit,
    advisory: {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: contextText
      },
      dwaGuard: {
        workspace: targetWorkspace,
        status: audit.status,
        healthScore: audit.healthScore,
        findings: topFindings
      }
    }
  };
}

async function main() {
  try {
    const raw = await readStdinSafe();
    const payload = parsePayload(raw);
    const result = evaluateGuard({ payload, env: process.env });
    if (result.advisory) {
      process.stdout.write(`${JSON.stringify(result.advisory)}\n`);
    }
  } catch (err) {
    // Non-destructive guard never fails host tool execution
    if (process.env.DWA_GUARD_DEBUG === '1') {
      process.stderr.write(`[dwa-boundary-guard] ${err.message}\n`);
    }
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateGuard,
  findManifestRoot,
  isRelevantTargetFile
};
