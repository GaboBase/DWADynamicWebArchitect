'use strict';

const CUSTOM_NOTES_MARKER = '<!-- DWA:CUSTOM_NOTES_START -->';

function buildMermaidDag(manifest) {
  const lines = ['```mermaid', 'flowchart TD'];
  const entries = Object.entries(manifest.importRules || {});
  const nodeIds = new Map();
  const declared = new Set();
  let idx = 0;

  const ensureNode = (label) => {
    if (!nodeIds.has(label)) {
      idx += 1;
      nodeIds.set(label, `L${idx}`);
    }
    const id = nodeIds.get(label);
    if (!declared.has(id)) {
      declared.add(id);
      lines.push(`  ${id}["${label}"]`);
    }
    return id;
  };

  for (const [layer, targets] of entries) {
    const fromId = ensureNode(layer);
    for (const target of targets) {
      if (target === 'none') continue;
      const toId = ensureNode(target);
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }
  lines.push('```');
  return lines.join('\n');
}

function buildArchitectureMarkdown(manifest, existingContent = null) {
  let preservedNotes = '';
  if (existingContent && existingContent.includes(CUSTOM_NOTES_MARKER)) {
    const idx = existingContent.indexOf(CUSTOM_NOTES_MARKER);
    preservedNotes = '\n' + existingContent.slice(idx).trim() + '\n';
  } else {
    preservedNotes = `\n${CUSTOM_NOTES_MARKER}\n## Project-Specific Architecture Decision Notes (ADRs)\n\n- Record custom exceptions or approved ADRs below this marker; \`dwa sync\` preserves this section verbatim.\n`;
  }

  const boundariesRows = Object.entries(manifest.boundaries || {})
    .map(([role, dir]) => `| \`${role}\` | \`${dir}\` |`)
    .join('\n');

  const importRuleRows = Object.entries(manifest.importRules || {})
    .map(([layer, allowed]) => `| \`${layer}\` | ${allowed.map(a => `\`${a}\``).join(', ')} |`)
    .join('\n');

  const featuresList = (manifest.activeFeatures || []).length > 0
    ? manifest.activeFeatures.map(f => `- \`${f}\``).join('\n')
    : '- *(None declared yet — add features as business domains emerge)*';

  const migrationList = (manifest.evolution && manifest.evolution.migrationTriggers || [])
    .map(t => `- ${t}`)
    .join('\n');

  return `# ARCHITECTURE — ${manifest.project}

> Governed by **Dynamic Web Architect (DWA v${manifest.schemaVersion})**.
> Source of truth: [\`architecture-manifest.json\`](./architecture-manifest.json) · Checksum: \`${(manifest.metadata && manifest.metadata.manifestChecksum || '').slice(0, 12)}\`

## 1. Architectural Profile

| Dimension | Value |
| :--- | :--- |
| **Pattern** | \`${manifest.pattern}\` |
| **Complexity Level** | \`${manifest.complexityLevel}\` |
| **Framework / Stack** | \`${manifest.stack.framework}\` (\`${manifest.stack.language}\`) |
| **Routing Shell** | ${manifest.routingShell && manifest.routingShell.enabled ? `\`${manifest.routingShell.directory}\` (thin routing/layout layer only)` : 'Disabled / Not applicable'} |
| **Security Profile** | \`${manifest.securityProfile ? manifest.securityProfile.level : 'standard'}\` ${(manifest.securityProfile && manifest.securityProfile.verticalHints && manifest.securityProfile.verticalHints.length) ? `(${manifest.securityProfile.verticalHints.join(', ')})` : ''} |
| **AI SDK Boundary** | ${manifest.stack.aiSdk ? `\`${manifest.stack.aiSdk}\` — strictly server-only (\`${(manifest.securityProfile.serverOnlyModules || []).join(', ')}\`)` : 'None declared'} |
| **Max Loose Files / Dir** | \`${manifest.maxLooseFilesPerDirectory}\` |
| **Promotion Threshold** | \`>= ${manifest.promotionThreshold || 2}\` consumer modules |

## 2. Unidirectional Dependency Graph (DAG)

${buildMermaidDag(manifest)}

| Layer | Allowed Outbound Imports |
| :--- | :--- |
${importRuleRows}

## 3. Structural Boundaries

| Boundary Role | Canonical Path |
| :--- | :--- |
${boundariesRows}

## 4. Active Domain Features

${featuresList}

## 5. Naming & Barrel File Governance

- **Directories**: ${manifest.namingConventions.directories}
- **Components**: ${manifest.namingConventions.components}
- **Hooks**: ${manifest.namingConventions.hooks}
- **Services**: ${manifest.namingConventions.services}
- **Use Cases**: ${manifest.namingConventions.useCases}
- **Schemas**: ${manifest.namingConventions.schemas}
- **Types**: ${manifest.namingConventions.types}
- **Utilities**: ${manifest.namingConventions.utils}
- **Tests**: ${manifest.namingConventions.tests}
- **Barrel Policy (\`${manifest.barrelPolicy.mode}\`)**:
  - Allowed: ${manifest.barrelPolicy.allowedPaths.length ? manifest.barrelPolicy.allowedPaths.map(p => `\`${p}\``).join(', ') : 'None'}
  - Forbidden: ${manifest.barrelPolicy.forbiddenPaths.length ? manifest.barrelPolicy.forbiddenPaths.map(p => `\`${p}\``).join(', ') : 'None'}
- **Path Aliases**: ${Object.entries(manifest.pathAliases || {}).map(([k, v]) => `\`${k}\` -> \`${v}\``).join(', ') || 'Language native'}

## 6. Dynamic File Placement Rules

1. **Co-location First**: Place files belonging to one business domain inside its feature/module folder.
2. **Shared Coupling Promotion**: Never import internal files across sibling features. When \`>= ${manifest.promotionThreshold || 2}\` modules need a resource, promote it via \`/dynamic-web-architect promote <path>\` (or \`dwa promote <path>\`) to \`shared\` or \`core\`.
3. **No Dumping Grounds**: Never create \`helpers/\`, \`misc/\`, \`common/\`, or \`temp/\`.
4. **Density Guardrail**: Subdivide any directory exceeding \`${manifest.maxLooseFilesPerDirectory}\` loose files into cohesive subdirectories.

## 7. Evolutionary Migration Triggers

- **Next Pattern Candidate**: ${manifest.evolution && manifest.evolution.nextRecommendedPattern ? `\`${manifest.evolution.nextRecommendedPattern}\`` : 'Top-tier workspace architecture'}
${migrationList}
${preservedNotes}`;
}

module.exports = {
  CUSTOM_NOTES_MARKER,
  buildMermaidDag,
  buildArchitectureMarkdown
};
