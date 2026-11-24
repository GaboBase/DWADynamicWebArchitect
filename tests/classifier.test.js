'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dwa = require('../src/index.cjs');

test('Scenario 1: Simple Marketing Landing Page -> classic-by-type (anti-overengineering)', () => {
  const res = dwa.classifyProject({
    projectName: 'Cafe Aurora',
    context: 'Landing page informativa y estatica en Astro para una cafeteria artesanal con galeria y formulario de contacto'
  });

  assert.equal(res.project, 'cafe-aurora');
  assert.equal(res.pattern, 'classic-by-type');
  assert.equal(res.complexityLevel, 'low');
  assert.equal(res.stack.framework, 'astro');
  assert.equal(res.routingShell.enabled, false);
  assert.equal(res.evolution.next, 'feature-driven-screaming');
});

test('Scenario 2: Multi-Brand Design System -> atomic-design', () => {
  const res = dwa.classifyProject({
    projectName: 'Prism UI Kit',
    context: 'Sistema de diseno y libreria UI reutilizable con Storybook, design tokens y componentes en React'
  });

  assert.equal(res.pattern, 'atomic-design');
  assert.equal(res.complexityLevel, 'medium');
  assert.equal(res.stack.framework, 'storybook-ui');
});

test('Scenario 3: Clinical SaaS + Next.js App Router + Gemini AI -> feature-driven-screaming + regulated + AI boundary', () => {
  const res = dwa.classifyProject({
    projectName: 'MediFlow Clinic',
    context: 'Aplicacion SaaS para clinica medica con pacientes, citas, facturacion, autenticacion y asistente Gemini API en Next.js App Router'
  });

  assert.equal(res.pattern, 'feature-driven-screaming');
  assert.equal(res.complexityLevel, 'high');
  assert.equal(res.stack.framework, 'nextjs-app-router');
  assert.equal(res.stack.aiSdk, '@google/genai');
  assert.equal(res.routingShell.enabled, true);
  assert.equal(res.routingShell.directory, 'src/app');
  assert.equal(res.securityProfile.level, 'regulated');
  assert.ok(res.securityProfile.verticalHints.includes('healthcare'));
  assert.ok(res.activeFeatures.includes('patients'));
  assert.ok(res.activeFeatures.includes('appointments'));
  assert.ok(res.activeFeatures.includes('billing'));
  assert.ok(res.activeFeatures.includes('auth'));

  const { manifest, blueprint } = dwa.buildManifest(res);
  assert.ok(blueprint.directories.includes('src/core/ai'));
  assert.ok(blueprint.directories.includes('src/core/security'));
  assert.ok(blueprint.directories.includes('src/core/audit'));
  assert.deepEqual(manifest.importRules['src/shared'], ['none']);
  assert.ok(manifest.securityProfile.serverOnlyModules.includes('src/core/ai'));
});

test('Scenario 4: Payments Backend Microservice -> hexagonal-clean', () => {
  const res = dwa.classifyProject({
    projectName: 'Ledger Pay API',
    context: 'API REST y microservicio backend de pagos y contabilidad en Node.js con arquitectura hexagonal'
  });

  assert.equal(res.pattern, 'hexagonal-clean');
  assert.equal(res.stack.framework, 'node-backend');
  assert.equal(res.securityProfile.level, 'regulated');
  assert.ok(res.securityProfile.verticalHints.includes('fintech'));

  const { blueprint } = dwa.buildManifest(res);
  assert.ok(blueprint.directories.includes('src/domain/entities'));
  assert.ok(blueprint.directories.includes('src/application/use-cases'));
  assert.ok(blueprint.directories.includes('src/infrastructure/db'));
  assert.ok(blueprint.directories.includes('src/interfaces/controllers'));
});

test('Scenario 5: Enterprise Multi-App Ecosystem -> monorepo-workspaces', () => {
  const res = dwa.classifyProject({
    projectName: 'Commerce Platform',
    context: 'Ecosistema multi-app en Turborepo con pnpm workspaces: web, admin, api y paquetes compartidos de UI y dominio'
  });

  assert.equal(res.pattern, 'monorepo-workspaces');
  assert.equal(res.complexityLevel, 'very-high');
  assert.equal(res.stack.framework, 'turborepo-pnpm');

  const { manifest, blueprint } = dwa.buildManifest(res);
  assert.deepEqual(manifest.workspaceTopology.apps, ['web', 'admin', 'api']);
  assert.ok(blueprint.directories.includes('packages/ui/src'));
  assert.ok(blueprint.directories.includes('apps/web/src/features'));
});

test('Scenario 6: Fullstack Modular Monolith & Go Microservice detection', () => {
  const mono = dwa.classifyProject({
    projectName: 'Unified BFF',
    context: 'Monolito modular fullstack con Next.js App Router para pedidos y catalogo'
  });
  assert.equal(mono.pattern, 'modular-monolith-fullstack');

  const goSvc = dwa.classifyProject({
    projectName: 'Auth Worker',
    context: 'Go microservice backend API with Gin for auth tokens'
  });
  assert.equal(goSvc.pattern, 'hexagonal-clean');
  assert.equal(goSvc.stack.language, 'go');
  const { blueprint } = dwa.buildManifest(goSvc);
  assert.ok(blueprint.directories.includes('internal/domain/entities'));
});
