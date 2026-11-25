#!/usr/bin/env node
'use strict';

/**
 * Dynamic Web Architect (DWA) — Zero-Dependency Stdio MCP Server
 *
 * Implements newline-delimited JSON-RPC 2.0 over stdio (MCP 2024-11-05 / 2025-03-26 / 2025-06-18).
 * Zero external npm dependencies; uses only Node.js built-ins and DWA's local modules.
 *
 * Server key: `dwa`
 * Qualified tool names: `mcp_dynamic-web-architect_dwa_<toolName>` (<= 64 chars, snake_case)
 * Default policy: read-only / dry-run previews (never mutates target repository files).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version || '2.0.0';

const dwa = require(path.join(ROOT, 'src', 'index.cjs'));
const { loadManifestIfPresent } = require(path.join(ROOT, 'src', 'core', 'import-parser.cjs'));

const SCHEMA_RESOURCE_URI = 'dwa://schema/architecture-manifest.json';
const SCHEMA_FILE_PATH = path.join(ROOT, 'schemas', 'architecture-manifest.schema.json');
const SUPPORTED_PROTOCOLS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const TOOL_DEFINITIONS = [
  {
    name: 'dwa_classify',
    description:
      'Classify a web project across 6 complexity axes, 14 frameworks, 6 canonical architectural patterns, vertical compliance hints, and AI SDK boundaries (read-only).',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Project description, stack, domains, and scale signals.'
        },
        project_name: {
          type: 'string',
          description: 'Optional project name.'
        },
        framework: {
          type: 'string',
          description: 'Optional explicit framework key (e.g., nextjs-app-router, vite-react, node-backend, turborepo-pnpm).'
        },
        pattern: {
          type: 'string',
          description: 'Optional explicit canonical pattern override.'
        },
        features: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional explicit list of business feature/domain names.'
        },
        target_dir: {
          type: 'string',
          description: 'Optional workspace directory to inspect package.json signals (read-only).'
        }
      },
      required: ['context'],
      additionalProperties: false
    }
  },
  {
    name: 'dwa_place_file',
    description:
      'Determine the canonical destination path, normalized filename, barrel impact, and @/* import example for a new file using DWA co-location, shared, core, routing-shell, and AI server-only rules (read-only preview).',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Proposed filename (e.g., InvoiceTable.tsx, formatCurrency.ts, geminiClient.ts).'
        },
        context: {
          type: 'string',
          description: 'Optional usage or domain context.'
        },
        feature: {
          type: 'string',
          description: 'Optional owning feature/domain name (kebab-case).'
        },
        scope: {
          type: 'string',
          enum: ['feature', 'shared', 'core', 'route'],
          description: 'Optional explicit architectural scope.'
        },
        role: {
          type: 'string',
          description: 'Optional explicit file role (component, hook, service, use-case, schema, types, util, store, controller, repository, entity, dto).'
        },
        atomic_level: {
          type: 'string',
          enum: ['atoms', 'molecules', 'organisms', 'templates'],
          description: 'Optional Atomic Design level when pattern is atomic-design.'
        },
        target_dir: {
          type: 'string',
          description: 'Workspace root to read architecture-manifest.json and tsconfig/jsconfig aliases (defaults to cwd).'
        }
      },
      required: ['filename'],
      additionalProperties: false
    }
  },
  {
    name: 'dwa_audit',
    description:
      'Run the deterministic DWA structural linter on a workspace directory: checks unidirectional DAG boundaries, cross-feature imports, DFS cycles, naming conventions, internal barrel misuse, loose-file density, deep relative imports, and client-side AI/server leaks (read-only).',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description: 'Directory to audit (defaults to server cwd).'
        },
        max_loose_files: {
          type: 'integer',
          minimum: 1,
          description: 'Optional override for loose source files threshold per directory.'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'dwa_promote_preview',
    description:
      'Preview promoting a shared module from a feature directory to src/shared/ or src/core/, listing all consuming features and exact import rewrites without modifying disk (dry-run only).',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        source_path: {
          type: 'string',
          description: 'Path to the source file inside the workspace (relative to target_dir or absolute).'
        },
        target_scope: {
          type: 'string',
          enum: ['shared', 'core'],
          default: 'shared',
          description: 'Target architectural boundary: shared or core.'
        },
        destination_path: {
          type: 'string',
          description: 'Optional explicit destination path relative to target_dir.'
        },
        target_dir: {
          type: 'string',
          description: 'Workspace root directory (defaults to server cwd).'
        }
      },
      required: ['source_path'],
      additionalProperties: false
    }
  },
  {
    name: 'dwa_migrate_check',
    description:
      'Evaluate an evolutionary pattern upgrade using the Transition Cost Guardrail (Strategic Value vs Implementation Cost + Migration Risk + Operational Fatigue) without modifying files.',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        target_pattern: {
          type: 'string',
          enum: Object.values(dwa.constants.PATTERNS),
          description: 'Target canonical architecture pattern.'
        },
        target_dir: {
          type: 'string',
          description: 'Workspace root directory (defaults to server cwd).'
        },
        reason: {
          type: 'string',
          description: 'Business or technical rationale for considering the migration.'
        }
      },
      required: ['target_pattern'],
      additionalProperties: false
    }
  },
  {
    name: 'dwa_diagram',
    description:
      'Generate a Mermaid DAG architectural diagram from an existing architecture-manifest.json or from a classified project description (read-only).',
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description: 'Workspace directory containing architecture-manifest.json (defaults to server cwd).'
        },
        context: {
          type: 'string',
          description: 'Optional project description used if no architecture-manifest.json exists in target_dir.'
        },
        project_name: {
          type: 'string',
          description: 'Optional project name for preview manifest.'
        },
        framework: {
          type: 'string',
          description: 'Optional framework key for preview manifest.'
        },
        pattern: {
          type: 'string',
          description: 'Optional canonical pattern for preview manifest.'
        },
        features: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional features for preview manifest.'
        }
      },
      additionalProperties: false
    }
  }
];

function sendMessage(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendResult(id, result) {
  if (id === undefined || id === null) return;
  sendMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  sendMessage({ jsonrpc: '2.0', id: id ?? null, error });
}

function resolveExistingDirectory(rawDir) {
  const resolved = path.resolve(String(rawDir || process.cwd()));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Target path is not a directory: ${resolved}`);
  }
  return resolved;
}

function resolveOptionalTargetDir(rawDir) {
  if (!rawDir) return null;
  return resolveExistingDirectory(rawDir);
}

function handleClassify(args = {}) {
  const context = typeof args.context === 'string' ? args.context.trim() : '';
  if (!context) {
    throw new Error('Argument "context" must be a non-empty string.');
  }
  const features = Array.isArray(args.features)
    ? args.features.map(f => String(f).trim()).filter(Boolean)
    : [];
  const targetDir = resolveOptionalTargetDir(args.target_dir);
  return dwa.classifyProject({
    context,
    projectName: typeof args.project_name === 'string' ? args.project_name : '',
    framework: typeof args.framework === 'string' && args.framework.trim() ? args.framework.trim() : null,
    pattern: typeof args.pattern === 'string' && args.pattern.trim() ? args.pattern.trim() : null,
    features,
    targetDir
  });
}

function handlePlaceFile(args = {}) {
  const filename = typeof args.filename === 'string' ? args.filename.trim() : '';
  if (!filename) {
    throw new Error('Argument "filename" must be a non-empty string.');
  }
  const targetDir = resolveExistingDirectory(args.target_dir || process.cwd());
  return dwa.placeFile({
    filename,
    context: typeof args.context === 'string' ? args.context : '',
    feature: typeof args.feature === 'string' && args.feature.trim() ? args.feature.trim() : null,
    scope: typeof args.scope === 'string' && args.scope.trim() ? args.scope.trim() : null,
    role: typeof args.role === 'string' && args.role.trim() ? args.role.trim() : null,
    atomicLevel: typeof args.atomic_level === 'string' && args.atomic_level.trim() ? args.atomic_level.trim() : null,
    targetDir,
    apply: false
  });
}

function handleAudit(args = {}) {
  const targetDir = resolveExistingDirectory(args.target_dir || process.cwd());
  const options = {};
  if (typeof args.max_loose_files === 'number' && Number.isFinite(args.max_loose_files) && args.max_loose_files > 0) {
    options.maxLooseFiles = Math.floor(args.max_loose_files);
  }
  return dwa.auditProject(targetDir, options);
}

function handlePromotePreview(args = {}) {
  const sourcePath = typeof args.source_path === 'string' ? args.source_path.trim() : '';
  if (!sourcePath) {
    throw new Error('Argument "source_path" must be a non-empty string.');
  }
  const targetDir = resolveExistingDirectory(args.target_dir || process.cwd());
  return dwa.promoteFile({
    sourcePath,
    targetScope: args.target_scope === 'core' ? 'core' : 'shared',
    destinationPath: typeof args.destination_path === 'string' && args.destination_path.trim() ? args.destination_path.trim() : null,
    targetDir,
    apply: false
  });
}

function handleMigrateCheck(args = {}) {
  const targetPattern = typeof args.target_pattern === 'string' ? args.target_pattern.trim() : '';
  if (!targetPattern) {
    throw new Error('Argument "target_pattern" must be a non-empty string.');
  }
  const targetDir = resolveExistingDirectory(args.target_dir || process.cwd());
  return dwa.planMigration({
    targetDir,
    targetPattern,
    reason: typeof args.reason === 'string' ? args.reason : ''
  });
}

function handleDiagram(args = {}) {
  const targetDir = resolveExistingDirectory(args.target_dir || process.cwd());
  const existingManifest = loadManifestIfPresent(targetDir);
  if (existingManifest) {
    return {
      source: 'architecture-manifest.json',
      targetDir,
      pattern: existingManifest.pattern,
      mermaid: dwa.buildMermaidDag(existingManifest)
    };
  }
  const context = typeof args.context === 'string' ? args.context.trim() : '';
  if (!context) {
    throw new Error(`No architecture-manifest.json found in ${targetDir}. Provide "context" to generate a preview diagram.`);
  }
  const features = Array.isArray(args.features)
    ? args.features.map(f => String(f).trim()).filter(Boolean)
    : [];
  const classification = dwa.classifyProject({
    context,
    projectName: typeof args.project_name === 'string' ? args.project_name : path.basename(targetDir),
    framework: typeof args.framework === 'string' && args.framework.trim() ? args.framework.trim() : null,
    pattern: typeof args.pattern === 'string' && args.pattern.trim() ? args.pattern.trim() : null,
    features,
    targetDir
  });
  const previewManifest = dwa.buildManifest(classification);
  return {
    source: 'classified-preview',
    targetDir,
    pattern: previewManifest.pattern,
    mermaid: dwa.buildMermaidDag(previewManifest)
  };
}

async function handleRequest(msg) {
  if (!msg || typeof msg !== 'object') {
    sendError(null, -32600, 'Invalid JSON-RPC request.');
    return;
  }

  const { id, method, params } = msg;

  // Notifications have no id and require no response
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return;
  }

  if (typeof method !== 'string') {
    sendError(id, -32600, 'Missing JSON-RPC method.');
    return;
  }

  try {
    switch (method) {
      case 'initialize': {
        const reqVersion = typeof params?.protocolVersion === 'string' ? params.protocolVersion : '';
        const protocolVersion = SUPPORTED_PROTOCOLS.has(reqVersion) ? reqVersion : '2025-03-26';
        sendResult(id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: {
            name: 'dwa',
            version: VERSION
          }
        });
        return;
      }

      case 'ping': {
        sendResult(id, {});
        return;
      }

      case 'tools/list': {
        sendResult(id, { tools: TOOL_DEFINITIONS });
        return;
      }

      case 'tools/call': {
        const name = params?.name;
        const args = params?.arguments || {};
        try {
          let data;
          switch (name) {
            case 'dwa_classify':
              data = handleClassify(args);
              break;
            case 'dwa_place_file':
              data = handlePlaceFile(args);
              break;
            case 'dwa_audit':
              data = handleAudit(args);
              break;
            case 'dwa_promote_preview':
              data = handlePromotePreview(args);
              break;
            case 'dwa_migrate_check':
              data = handleMigrateCheck(args);
              break;
            case 'dwa_diagram':
              data = handleDiagram(args);
              break;
            default:
              sendError(id, -32602, `Unknown tool: ${String(name)}`);
              return;
          }
          sendResult(id, {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            isError: false
          });
        } catch (toolErr) {
          sendResult(id, {
            content: [{ type: 'text', text: JSON.stringify({ error: toolErr.message }, null, 2) }],
            isError: true
          });
        }
        return;
      }

      case 'resources/list': {
        sendResult(id, {
          resources: [
            {
              uri: SCHEMA_RESOURCE_URI,
              name: 'DWA Architecture Manifest JSON Schema',
              description: 'Canonical JSON Schema Draft 2020-12 for architecture-manifest.json.',
              mimeType: 'application/schema+json'
            }
          ]
        });
        return;
      }

      case 'resources/templates/list': {
        sendResult(id, { resourceTemplates: [] });
        return;
      }

      case 'resources/read': {
        const uri = params?.uri;
        if (uri !== SCHEMA_RESOURCE_URI) {
          sendError(id, -32602, `Unknown resource URI: ${String(uri)}`);
          return;
        }
        const text = fs.readFileSync(SCHEMA_FILE_PATH, 'utf8');
        sendResult(id, {
          contents: [
            {
              uri: SCHEMA_RESOURCE_URI,
              mimeType: 'application/schema+json',
              text
            }
          ]
        });
        return;
      }

      case 'prompts/list': {
        sendResult(id, { prompts: [] });
        return;
      }

      default: {
        sendError(id, -32601, `Method not found: ${method}`);
        return;
      }
    }
  } catch (err) {
    sendError(id, -32603, err?.message || 'Internal MCP server error');
  }
}

function startServer() {
  let buffer = Buffer.alloc(0);
  let queue = Promise.resolve();
  let closing = false;

  const enqueueLine = rawLine => {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line) return;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (parseErr) {
      sendError(null, -32700, `Parse error: ${parseErr.message}`);
      return;
    }
    queue = queue.then(() => handleRequest(parsed)).catch(err => {
      process.stderr.write(`[dwa-mcp] Unhandled request error: ${err?.stack || err}\n`);
    });
  };

  process.stdin.on('data', chunk => {
    if (buffer.length + chunk.length > MAX_BUFFER_BYTES) {
      process.stderr.write('[dwa-mcp] Input buffer exceeded limit; clearing.\n');
      buffer = Buffer.alloc(0);
      return;
    }
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const nlIndex = buffer.indexOf(0x0a);
      if (nlIndex === -1) break;
      const line = buffer.subarray(0, nlIndex).toString('utf8');
      buffer = buffer.subarray(nlIndex + 1);
      enqueueLine(line);
    }
  });

  const drainAndExit = () => {
    if (closing) return;
    closing = true;
    if (buffer.length > 0) {
      const tail = buffer.toString('utf8');
      buffer = Buffer.alloc(0);
      enqueueLine(tail);
    }
    queue
      .catch(() => {})
      .then(() => {
        if (process.stdout.writableNeedDrain) {
          process.stdout.once('drain', () => process.exit(0));
        } else {
          process.exit(0);
        }
      });
  };

  process.stdin.on('end', drainAndExit);
  process.stdin.on('close', drainAndExit);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

if (require.main === module) {
  startServer();
}

module.exports = {
  TOOL_DEFINITIONS,
  SCHEMA_RESOURCE_URI,
  handleClassify,
  handlePlaceFile,
  handleAudit,
  handlePromotePreview,
  handleMigrateCheck,
  handleDiagram,
  handleRequest
};
