'use strict';

const { buildManifest, buildPatternBlueprint, computeManifestChecksum } = require('./manifest-builder.cjs');
const { buildMermaidDag, buildArchitectureMarkdown, CUSTOM_NOTES_MARKER } = require('./doc-builder.cjs');
const { buildCreationScripts, renderTreeAscii } = require('./script-builder.cjs');
const { scaffoldProject } = require('./scaffolder.cjs');

module.exports = {
  buildManifest,
  buildPatternBlueprint,
  computeManifestChecksum,
  buildMermaidDag,
  buildArchitectureMarkdown,
  CUSTOM_NOTES_MARKER,
  buildCreationScripts,
  renderTreeAscii,
  scaffoldProject
};
