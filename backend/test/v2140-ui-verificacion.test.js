/** V2.14.0: contrato de la pestaña de acceso y verificación de cuentas. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

describe('V2.14.0: vista de acceso y verificación', () => {
  test('la pestaña declara el permiso nuevo y su panel existe', () => {
    const html = leer('frontend/index.html');
    assert.match(
      html,
      /data-action="admin:tab"[^>]*data-valor="verificacion"[^>]*data-permiso="gestionar_verificacion_cuentas"/
    );
    assert.match(html, /id="panel-verificacion"/);
    assert.match(html, /data-action="verificacion:guardar"/);
  });

  test('el controlador registra la pestaña y su acción', () => {
    const admin = leer('frontend/js/controllers/admin.controller.js');
    assert.match(admin, /verificacion:\s*'gestionar_verificacion_cuentas'/);
    assert.match(admin, /case 'verificacion':/);
    assert.match(admin, /cargarVerificacion\(\)/);

    const controlador = leer('frontend/js/controllers/verificacion.controller.js');
    assert.match(controlador, /'verificacion:guardar'/);
    assert.match(controlador, /guardarVerificacion/);
  });

  test('la vista edita las cinco claves y no usa estilos inline', () => {
    const vista = leer('frontend/js/views/verificacion.view.js');
    for (const clave of [
      'cuentas.activacion_ciudadano',
      'cuentas.token_verificacion_horas',
      'cuentas.token_recuperacion_minutos',
      'cuentas.congelar_inactivas',
      'cuentas.dias_inactividad'
    ]) {
      assert.ok(vista.includes(clave), `La vista no edita ${clave}`);
    }
    assert.doesNotMatch(vista, /\bstyle\s*=/i);
    assert.doesNotMatch(vista, /\bon(?:click|change|input|submit)\s*=/i);
    assert.match(vista, /autocomplete="off"/);
  });

  test('el permiso está en el espejo del frontend y en la matriz', () => {
    const permisos = leer('frontend/js/data/permisos.js');
    assert.match(permisos, /'gestionar_verificacion_cuentas'/);
    assert.match(permisos, /Gestionar verificación de cuentas/);
    assert.match(leer('frontend/js/data/permisos-ayuda.js'), /gestionar_verificacion_cuentas/);
    assert.match(leer('frontend/js/main.js'), /registrarVerificacion\(\)/);
  });

  test('el servicio usa los endpoints protegidos', () => {
    const servicio = leer('frontend/js/services/configuracion.service.js');
    assert.match(servicio, /\/admin\/verificacion-cuentas/);
    assert.match(servicio, /guardarVerificacion/);
  });
});
