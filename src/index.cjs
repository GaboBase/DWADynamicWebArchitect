'use strict';

const constants = require('./core/constants.cjs');
const { parseJsonc } = require('./core/jsonc.cjs');
const naming = require('./core/naming.cjs');
const { classifyProject } = require('./core/classifier.cjs');
const scaffolding = require('./features/scaffolding/index.cjs');
const routing = require('./features/routing/index.cjs');
const auditing = require('./features/auditing/index.cjs');
const evolution = require('./features/evolution/index.cjs');

function syncWithAudit(targetDir = process.cwd(), options = {}) {
  const audit = auditing.auditProject(targetDir);
  const synced = evolution.syncArchitecture(targetDir, {
    apply: options.apply !== false,
    healthScore: audit.healthScore,
    renderDoc: scaffolding.buildArchitectureMarkdown
  });
  return { ...synced, healthScore: audit.healthScore, auditStatus: audit.status };
}

module.exports = {
  constants,
  parseJsonc,
  naming,
  classifyProject,
  scaffoldProject: scaffolding.scaffoldProject,
  buildManifest: scaffolding.buildManifest,
  buildMermaidDag: scaffolding.buildMermaidDag,
  buildArchitectureMarkdown: scaffolding.buildArchitectureMarkdown,
  placeFile: routing.placeFile,
  promoteFile: routing.promoteFile,
  auditProject: auditing.auditProject,
  syncArchitecture: syncWithAudit,
  planMigration: evolution.planMigration
};
