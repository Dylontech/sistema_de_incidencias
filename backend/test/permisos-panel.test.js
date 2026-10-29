/** Contrato de permisos de las pestañas del panel de administración. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERMISOS } from '../src/config/constantes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(raiz, 'frontend/index.html'), 'utf8');
const controlador = fs.readFileSync(
  path.join(raiz, 'frontend/js/controllers/admin.controller.js'),
  'utf8'
);

function pestañas() {
  return [...html.matchAll(/<button[^>]*data-action="admin:tab"[^>]*>/g)].map((m) => m[0]);
}

describe('Permisos por pestaña del panel', () => {
  test('cada pestaña declara un permiso existente en el catálogo', () => {
    const lista = pestañas();
    assert.ok(lista.length >= 20);
    for (const boton of lista) {
      const permiso = boton.match(/data-permiso="([^"]+)"/)?.[1];
      assert.ok(permiso, `La pestaña no declara data-permiso: ${boton}`);
      assert.ok(PERMISOS.includes(permiso), `Permiso desconocido: ${permiso}`);
    }
  });

  test('el controlador tiene el mismo permiso para cada pestaña', () => {
    for (const boton of pestañas()) {
      const tab = boton.match(/data-valor="([^"]+)"/)?.[1];
      const permiso = boton.match(/data-permiso="([^"]+)"/)?.[1];
      assert.ok(tab);
      const clave = tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        controlador,
        new RegExp(`(?:['"]${clave}['"]|\\b${clave}\\b)\\s*:\\s*['"]${permiso}['"]`)
      );
    }
  });

  test('las rutas de administración vuelven a comprobar permisos en el servidor', () => {
    const rutas = [
      'backend/src/routes/reportes.routes.js',
      'backend/src/routes/catalogos.routes.js',
      'backend/src/routes/moderacion.routes.js',
      'backend/src/routes/notificaciones.routes.js',
      'backend/src/routes/publicidad.routes.js',
      'backend/src/routes/legal.routes.js',
      'backend/src/routes/respaldos.routes.js',
      'backend/src/routes/simulador.routes.js',
      'backend/src/routes/correos-institucionales.routes.js',
      'backend/src/routes/configuracion.routes.js',
      'backend/src/routes/firmas.routes.js',
      'backend/src/routes/sesiones.routes.js',
      'backend/src/routes/claves.routes.js',
      'backend/src/routes/auditoria.routes.js'
    ];
    for (const ruta of rutas) {
      const contenido = fs.readFileSync(path.join(raiz, ruta), 'utf8');
      assert.match(contenido, /requierePermiso|requiereAdmin/, ruta);
    }
    const tickets = fs.readFileSync(
      path.join(raiz, 'backend/src/services/tickets.service.js'),
      'utf8'
    );
    assert.match(tickets, /puedeAtender|atender_tickets/);
    assert.match(tickets, /Solo un administrador gestiona las reglas/);
  });
});
