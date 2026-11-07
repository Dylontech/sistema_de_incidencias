/**
 * Contrato documental de SISTEMA_COMPLETO.md.
 *
 * El documento es la referencia de arquitectura, vistas, acciones y reglas.
 * Estas pruebas fallan cuando el código crece y el documento no lo refleja.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PERMISOS, ROLES } from '../src/config/constantes.js';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const documento = fs.readFileSync(path.join(raiz, 'SISTEMA_COMPLETO.md'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'frontend/index.html'), 'utf8');

function entreComillas(valor) {
  return documento.includes(`\`${valor}\``);
}

function pestañas() {
  return [...html.matchAll(/<button[^>]*data-action="admin:tab"[^>]*>/g)].map((m) => ({
    valor: m[0].match(/data-valor="([^"]+)"/)?.[1],
    permiso: m[0].match(/data-permiso="([^"]+)"/)?.[1]
  }));
}

function modales() {
  return html
    .split('<div class="modal-overlay"')
    .slice(1)
    .map((bloque) => bloque.match(/id="([^"]+)"/)?.[1])
    .filter(Boolean);
}

function dominiosDeAccion() {
  const coincidencias = html.matchAll(
    /data-(?:action|change|input|submit)="([a-zA-Z]+):[a-zA-Z0-9]+"/g
  );
  return new Set([...coincidencias].map((m) => m[1]));
}

describe('Documento SISTEMA_COMPLETO.md', () => {
  test('contiene las secciones obligatorias', () => {
    for (const seccion of [
      'Mapa general del sistema',
      'Actores, roles y alcance',
      'Permisos',
      'Vistas e interfaz',
      'Catálogo de acciones',
      'API y flujos',
      'Modelo de datos',
      'Reglas para las migraciones',
      'Reglas para crear un módulo nuevo',
      'Reglas para permisos, roles y vistas nuevas',
      'Reglas de CRUD',
      '¿Es realmente necesario?',
      'Ideas descartadas',
      'Ideas de implementación futura'
    ]) {
      assert.match(documento, new RegExp(seccion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), seccion);
    }
  });

  test('documenta los 53 permisos del catálogo', () => {
    for (const permiso of PERMISOS) {
      assert.ok(entreComillas(permiso), `Falta el permiso ${permiso} en el documento`);
    }
  });

  test('documenta todos los roles del sistema', () => {
    for (const rol of ROLES) {
      assert.ok(entreComillas(rol), `Falta el rol ${rol} en el documento`);
    }
  });

  test('documenta todas las pestañas del panel con su permiso', () => {
    const lista = pestañas();
    assert.ok(lista.length >= 20, 'No se detectaron las pestañas del panel');
    for (const { valor, permiso } of lista) {
      assert.ok(valor, 'Pestaña sin data-valor');
      assert.ok(permiso, `La pestaña ${valor} no declara data-permiso`);
      assert.ok(entreComillas(valor), `Falta la pestaña ${valor} en el documento`);
      assert.ok(entreComillas(permiso), `Falta el permiso ${permiso} en el documento`);
    }
  });

  test('documenta todos los modales de la SPA', () => {
    const lista = [...new Set(modales())];
    assert.ok(lista.length >= 50, 'No se detectaron los modales de la SPA');
    for (const modal of lista) {
      assert.ok(entreComillas(modal), `Falta el modal ${modal} en el documento`);
    }
  });

  test('documenta todos los dominios de acción declarados en el HTML', () => {
    const dominios = dominiosDeAccion();
    assert.ok(dominios.size >= 40, 'No se detectaron los dominios de acción');
    for (const dominio of dominios) {
      assert.ok(entreComillas(dominio), `Falta el dominio ${dominio} en el documento`);
    }
  });

  test('fija las reglas mínimas de migración', () => {
    for (const regla of [
      'YYYYMMDD_slug.js',
      'colacionDeUsuarios',
      'TABLAS',
      'COLUMNAS',
      'migrate:rollback',
      'npm run seed'
    ]) {
      assert.ok(documento.includes(regla), `Falta la regla ${regla} en el documento`);
    }
    assert.match(documento, /respaldo/i);
    assert.match(documento, /destructiv/i);
  });

  test('el README y las instrucciones enlazan el documento', () => {
    const readme = fs.readFileSync(path.join(raiz, 'README.md'), 'utf8');
    const instrucciones = fs.readFileSync(
      path.join(raiz, '.github', 'copilot-instructions.md'),
      'utf8'
    );
    assert.match(readme, /SISTEMA_COMPLETO\.md/);
    assert.match(instrucciones, /SISTEMA_COMPLETO\.md/);
  });

  test('no quedan marcadores de trabajo pendientes', () => {
    assert.doesNotMatch(documento, /<!--\s*PARTE-/);
    assert.doesNotMatch(documento, /TODO:|PENDIENTE:/);
  });
});
