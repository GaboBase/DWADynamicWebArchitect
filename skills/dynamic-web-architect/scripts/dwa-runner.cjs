#!/usr/bin/env node
'use strict';

/**
 * Portable runner script bundled inside skills/dynamic-web-architect/scripts/.
 * Resolves the sibling plugin's bin/dwa.cjs cleanly whether invoked from the
 * source repository or from an installed plugin directory (~/.gemini/config/plugins/dynamic-web-architect).
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cliPath = path.resolve(__dirname, '..', '..', '..', 'bin', 'dwa.cjs');
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
