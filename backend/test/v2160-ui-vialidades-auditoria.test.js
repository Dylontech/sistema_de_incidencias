/** V2.16.0 — Contratos de interfaz de vialidades, simulación y auditoría. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

describe('V2.16.0: catálogo administrativo de vialidades', () => {
  test('la pestaña, el panel y el modal existen con sus filtros', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /data-valor="vialidades"[^>]*data-permiso="gestionar_vialidades"/);
    assert.match(html, /id="panel-vialidades"/);
    for (const id of [
      'vialidadesMunicipioFiltro',
      'vialidadesTipoFiltro',
      'vialidadesFuenteFiltro',
      'vialidadesEstadoFiltro',
      'vialidadesTexto',
      'vialidadesResumen',
      'vialidadesLista',
      'vialidadesArchivo',
      'vialidadesReemplazar',
      'modalVialidad',
      'vialidadGeometria',
      'vialidadEje',
      'vialidadAncho'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /data-action="vialidades:importar"/);
    assert.match(html, /data-action="vialidades:importarOsm"/);
    assert.match(html, /data-submit="vialidades:guardar"/);
  });

  test('el controlador y el servicio están conectados al panel y al arranque', async () => {
    const admin = leer('frontend/js/controllers/admin.controller.js');
    assert.match(admin, /vialidades:\s*'gestionar_vialidades'/);
    assert.match(admin, /case 'vialidades'/);
    const controlador = leer('frontend/js/controllers/vialidades.controller.js');
    for (const accion of [
      'vialidades:filtrar',
      'vialidades:guardar',
      'vialidades:verificar',
      'vialidades:eliminar',
      'vialidades:importar',
      'vialidades:importarOsm'
    ]) {
      assert.ok(controlador.includes(`'${accion}'`), `Falta ${accion}`);
    }
    assert.match(leer('frontend/js/main.js'), /registrarVialidades\(\)/);
    assert.match(leer('frontend/sw.js'), /\/js\/controllers\/vialidades\.controller\.js/);

    const { geometriaDeFormulario } = await import(
      '../../frontend/js/views/vialidades.view.js'
    );
    const original = [
      [-100.442, 19.891],
      [-100.4415, 19.8915],
      [-100.441, 19.892]
    ];
    assert.deepEqual(
      geometriaDeFormulario(original, -100.442, 19.891, -100.441, 19.892),
      original,
      'editar texto no debe borrar los puntos intermedios'
    );
    assert.deepEqual(
      geometriaDeFormulario(original, -100.44, 19.89, -100.43, 19.89),
      [
        [-100.44, 19.89],
        [-100.43, 19.89]
      ],
      'mover los extremos reconstruye el tramo'
    );
  });
});

describe('V2.16.0: simulación y auditoría', () => {
  test('el simulador ofrece porcentajes de vialidades', () => {
    const html = leer('frontend/index.html');
    for (const id of [
      'simViaBueno',
      'simViaLeve',
      'simViaRegular',
      'simViaMalo',
      'simViaCritico',
      'simViaTotal',
      'simuladorVialidadesResultado'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /data-action="simulador:vialidades"/);
    assert.match(html, /data-action="simulador:vialidadesLimpiar"/);
    const controlador = leer('frontend/js/controllers/simulador.controller.js');
    assert.match(controlador, /simuladorService\.simularVialidades/);
    assert.match(controlador, /vialidadesMapa\.dibujar/);
  });

  test('auditoría explica sus campos, filtra por método y descarga informes', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="auditoriaEnciclopedia"/);
    assert.match(html, /id="auditoriaMetodo"/);
    assert.match(html, /data-action="auditoria:pdf"/);
    assert.match(html, /data-action="auditoria:csv"/);
    assert.match(html, /Huella IP/);
    const controlador = leer('frontend/js/controllers/admin.controller.js');
    assert.match(controlador, /auditoriaService\.informe/);
    assert.match(controlador, /filtrosAuditoria/);
    const guias = leer('frontend/js/data/tutoriales.js');
    assert.match(guias, /id: 'panel-auditoria'/);
    assert.match(guias, /id: 'panel-vialidades'/);
  });
});
