#!/usr/bin/env node
'use strict';

const path = require('node:path');
const dwa = require('../src/index.cjs');
const { loadManifestIfPresent } = require('../src/core/import-parser.cjs');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp() {
  console.log(`Dynamic Web Architect (DWA v${dwa.constants.SCHEMA_VERSION})

Usage:
  dwa classify --context "<description>" [--name <project>] [--framework <fw>] [--json]
  dwa init [dir] --context "<description>" [--name <project>] [--framework <fw>] [--pattern <pattern>] [--features a,b] [--apply] [--json]
  dwa place-file <filename> [--context "<usage>"] [--feature <name>] [--scope feature|shared|core|route] [--dir <dir>] [--apply] [--json]
  dwa promote <sourcePath> [--target shared|core] [--dest <path>] [--dir <dir>] [--apply] [--json]
  dwa audit [dir] [--json] [--strict]
  dwa sync [dir] [--dry-run] [--json]
  dwa migrate <targetPattern> [--dir <dir>] [--reason "<why>"] [--json]
  dwa diagram [dir]

Patterns:
  ${Object.values(dwa.constants.PATTERNS).join(', ')}
`);
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === 'help' || flags.help) {
    printHelp();
    process.exit(0);
  }

  const asJson = Boolean(flags.json);

  try {
    switch (command) {
      case 'classify': {
        const context = flags.context || positional.slice(1).join(' ');
        const features = flags.features ? String(flags.features).split(',').map(s => s.trim()).filter(Boolean) : [];
        const result = dwa.classifyProject({
          context,
          projectName: flags.name || '',
          framework: flags.framework || null,
          pattern: flags.pattern || null,
          features,
          targetDir: flags.dir || null
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Project:     ${result.project}`);
          console.log(`Pattern:     ${result.pattern} (${result.complexityLevel}) ${result.epistemicFlags.pattern}`);
          console.log(`Framework:   ${result.stack.framework} [${result.stack.language}] ${result.epistemicFlags.framework}`);
          console.log(`Features:    ${result.activeFeatures.join(', ') || '(none)'} ${result.epistemicFlags.domains}`);
          console.log(`Routing:     ${result.routingShell.enabled ? result.routingShell.directory : 'N/A'}`);
          console.log(`Security:    ${result.securityProfile.level} ${result.securityProfile.verticalHints.length ? `(${result.securityProfile.verticalHints.join(', ')})` : ''}`);
          if (result.stack.aiSdk) console.log(`AI SDK:      ${result.stack.aiSdk} (server-only boundary)`);
          console.log('\nRationale:');
          result.rationale.forEach(r => console.log(`  - ${r}`));
        }
        break;
      }

      case 'init':
      case 'scaffold': {
        const targetDir = positional[1] ? path.resolve(positional[1]) : path.resolve(flags.dir || process.cwd());
        const features = flags.features ? String(flags.features).split(',').map(s => s.trim()).filter(Boolean) : [];
        const result = dwa.scaffoldProject({
          targetDir,
          context: flags.context || '',
          projectName: flags.name || path.basename(targetDir),
          framework: flags.framework || null,
          pattern: flags.pattern || null,
          features,
          apply: Boolean(flags.apply)
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`[${result.mode.toUpperCase()}] Pattern: ${result.manifest.pattern} | Framework: ${result.manifest.stack.framework}`);
          console.log(`Target: ${result.targetDir}`);
          console.log('\nDirectory Tree:\n' + result.treeAscii);
          if (result.mode === 'applied') {
            console.log(`\nWritten (${result.written.length} items): ${result.written.slice(0, 12).join(', ')}${result.written.length > 12 ? '...' : ''}`);
          } else {
            console.log('\nPreview only (dry-run). Re-run with --apply to write directories, architecture-manifest.json, and ARCHITECTURE.md.');
          }
        }
        break;
      }

      case 'place-file':
      case 'place': {
        const filename = positional[1] || flags.file;
        if (!filename) throw new Error('Missing <filename> argument for place-file.');
        const result = dwa.placeFile({
          filename,
          context: flags.context || positional.slice(2).join(' '),
          feature: flags.feature || null,
          scope: flags.scope || null,
          role: flags.role || null,
          atomicLevel: flags.atomic || null,
          targetDir: flags.dir || process.cwd(),
          apply: Boolean(flags.apply)
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Verdict Path:    ${result.verdictPath}`);
          console.log(`Rule Applied:    ${result.ruleApplied}`);
          if (result.renamed) console.log(`Normalized Name: ${result.originalFilename} -> ${result.normalizedFilename}`);
          console.log(`Rationale:       ${result.rationale}`);
          console.log(`Barrel Impact:   ${result.barrelImpact}`);
          console.log(`Import Example:  ${result.importExample}`);
          console.log(`PowerShell:      ${result.commands.powershell}`);
        }
        break;
      }

      case 'promote': {
        const sourcePath = positional[1] || flags.source;
        if (!sourcePath) throw new Error('Missing <sourcePath> argument for promote.');
        const result = dwa.promoteFile({
          sourcePath,
          targetScope: flags.target || 'shared',
          destinationPath: flags.dest || null,
          targetDir: flags.dir || process.cwd(),
          apply: Boolean(flags.apply)
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`[${result.mode.toUpperCase()}] Promote: ${result.source} -> ${result.destination}`);
          console.log(`New Specifier:   ${result.newSpecifier}`);
          console.log(`Affected Files:  ${result.affectedFilesCount} (${result.consumerFeatures.join(', ') || 'none'})`);
          result.rewrites.forEach(r => {
            r.replacements.forEach(rep => console.log(`  - ${r.file}:${rep.line}  "${rep.from}" -> "${rep.to}"`));
          });
        }
        break;
      }

      case 'audit': {
        const targetDir = positional[1] ? path.resolve(positional[1]) : path.resolve(flags.dir || process.cwd());
        const result = dwa.auditProject(targetDir);
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`DWA Structural Audit — ${result.targetDir}`);
          console.log(`Pattern: ${result.pattern} | Status: ${result.status} | Health Score: ${result.healthScore}/100`);
          console.log(`Scanned: ${result.filesScanned} files, ${result.directoriesScanned} dirs | Errors: ${result.summary.errors}, Warnings: ${result.summary.warnings}, Cycles: ${result.summary.cycles}`);
          if (result.findings.length > 0) {
            console.log('\nFindings:');
            result.findings.forEach(f => {
              const loc = f.line ? `${f.path}:${f.line}` : f.path;
              console.log(`  [${f.severity}] ${f.code} (${loc}) — ${f.message}`);
            });
          } else {
            console.log('\nNo structural violations found.');
          }
          if (result.promotionCandidates.length > 0) {
            console.log('\nPromotion Candidates (>=2 consuming features):');
            result.promotionCandidates.forEach(c => {
              console.log(`  - ${c.file} (used by: ${c.consumingFeatures.join(', ')})`);
            });
          }
        }
        if (result.summary.errors > 0 || (flags.strict && result.summary.warnings > 0)) {
          process.exitCode = 1;
        }
        break;
      }

      case 'sync': {
        const targetDir = positional[1] ? path.resolve(positional[1]) : path.resolve(flags.dir || process.cwd());
        const result = dwa.syncArchitecture(targetDir, { apply: !flags['dry-run'] });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`[${result.mode.toUpperCase()}] Synced ${result.targetDir}`);
          console.log(`Active Features: ${result.activeFeatures.join(', ') || '(none)'}`);
          console.log(`Health Score:    ${result.healthScore}/100 (${result.auditStatus})`);
          console.log(`Checksum:        ${result.manifestChecksum}`);
        }
        break;
      }

      case 'migrate': {
        const targetPattern = positional[1] || flags.to;
        if (!targetPattern) throw new Error('Missing <targetPattern> argument for migrate.');
        const result = dwa.planMigration({
          targetDir: flags.dir || process.cwd(),
          targetPattern,
          reason: flags.reason || ''
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Migration Verdict: ${result.verdict}`);
          console.log(`Transition:        ${result.currentPattern} -> ${result.targetPattern}`);
          if (result.metrics) {
            console.log(`Strategic Value:   ${result.metrics.strategicValue}/100 vs Transition Cost: ${result.metrics.transitionCost.total}/100`);
          }
          console.log(`Guardrail:         ${result.guardrailExplanation || result.message}`);
        }
        break;
      }

      case 'diagram': {
        const targetDir = positional[1] ? path.resolve(positional[1]) : path.resolve(flags.dir || process.cwd());
        const manifest = loadManifestIfPresent(targetDir);
        if (!manifest) throw new Error(`No architecture-manifest.json found in ${targetDir}`);
        console.log(dwa.buildMermaidDag(manifest));
        break;
      }

      default:
        throw new Error(`Unknown command "${command}". Run "dwa --help" for usage.`);
    }
  } catch (err) {
    if (asJson) {
      console.error(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
