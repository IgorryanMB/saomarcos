#!/usr/bin/env node
// Gera dist/app.bundle.js com todos os módulos no mesmo escopo léxico.
// Uso: node tools/build.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const modules = [
  'core', 'auth-data', 'inventory', 'sales-ui', 'finance',
  'exports', 'mutations', 'price-tools', 'events'
];
const parts = modules.map(name => {
  const relativePath = 'scripts/' + name + '.js';
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  return '/* --- MÓDULO: ' + relativePath + ' --- */\n' + content;
});

const content = [
  '/* SAO MARCOS - bundle da versão modular. Não editar manualmente.',
  ' * Fonte: scripts/*.js, organizados em ordem de dependência.',
  ' * Observação: as seções são fragmentos de um único escopo; o bundle é a entrega para o navegador.',
  ' */',
  '(async () => {',
  "'use strict';",
  parts.join('\n\n'),
  '})();',
  ''
].join('\n');
const output = path.join(root, 'dist/app.bundle.js');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (current !== content) {
    console.error('O bundle está desatualizado! Execute node tools/build.mjs');
    process.exitCode = 1;
  } else {
    console.log('Bundle consistente com os módulos.');
  }
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content, 'utf8');
  console.log('Bundle gerado:', output, '(' + content.length + ' caracteres)');
}
