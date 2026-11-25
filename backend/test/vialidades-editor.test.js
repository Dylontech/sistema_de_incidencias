import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prepararModal, leerFormulario } from '../../frontend/js/views/vialidades.view.js';
import { bufferizarEje } from '../src/services/geometria.service.js';

// Los campos numéricos del DOM devuelven cadenas, también al asignar números.
let campos;
const documentoOriginal = globalThis.document;
beforeEach(() => {
  campos = new Map();
  globalThis.document = { getElementById(id) {
    if (!campos.has(id)) {
      let valor = '';
      campos.set(id, { get value() { return valor; }, set value(v) { valor = String(v); } });
    }
    return campos.get(id);
  } };
});
afterEach(() => { globalThis.document = documentoOriginal; });
const campo = (id) => document.getElementById(id);
const eje = { type: 'LineString', coordinates: [[-100.442, 19.891], [-100.4415, 19.8918], [-100.441, 19.892]] };
const via = { id: 'curva', municipioId: '16050', nombre: 'Curva', eje,
  geometria: bufferizarEje(eje, 8).geometria, anchoM: 8 };

test('abrir y guardar textos conserva exactamente el eje curvo y su calzada', () => {
  prepararModal(via);
  campo('vialidadNombre').value = 'Nuevo nombre';
  campo('vialidadNotas').value = 'Revisada';
  const salida = leerFormulario();
  assert.deepEqual(salida.geometria, via.geometria);
  assert.deepEqual(salida.eje, eje);
  assert.equal(salida.nombre, 'Nuevo nombre');
});

test('mover extremos conserva los vértices intermedios y envía un eje para regenerar', () => {
  prepararModal(via);
  campo('vialidadLngInicio').value = -100.443;
  campo('vialidadLatFin').value = 19.893;
  const salida = leerFormulario();
  assert.deepEqual(salida.eje.coordinates, [[-100.443, 19.891], eje.coordinates[1], [-100.441, 19.893]]);
  assert.deepEqual(salida.geometria, salida.eje);
});

test('polígonos sin eje y geometrías múltiples son de consulta y conservan todas sus partes', () => {
  for (const original of [
    { ...via, eje: null },
    { ...via, geometria: { type: 'MultiPolygon', coordinates: [via.geometria.coordinates, via.geometria.coordinates] } },
    { ...via, eje: { type: 'MultiLineString', coordinates: [eje.coordinates, eje.coordinates] } }
  ]) {
    prepararModal(original);
    assert.equal(campo('vialidadLatInicio').readOnly, true);
    assert.equal(campo('vialidadLatInicio').required, false);
    const salida = leerFormulario();
    assert.deepEqual(salida.geometria, original.geometria);
    assert.deepEqual(salida.eje, original.eje);
  }
  prepararModal(null, { municipioActivo: '16050' });
  assert.equal(campo('vialidadLatInicio').readOnly, false);
  assert.equal(campo('vialidadLatInicio').required, true);
  assert.equal(campo('vialidadMunicipio').value, '16050');
});

test('coordenadas vacías o fuera de rango y anchos inválidos impiden guardar', () => {
  prepararModal(via);
  campo('vialidadLatInicio').value = '';
  assert.throws(leerFormulario, /cuatro coordenadas/);
  campo('vialidadLatInicio').value = 91;
  assert.throws(leerFormulario, /fuera de rango/);
  prepararModal(via);
  campo('vialidadAncho').value = 0;
  assert.throws(leerFormulario, /entre 2 y 60/);
  campo('vialidadAncho').value = '';
  assert.equal(leerFormulario().anchoM, null);
  prepararModal(null);
  for (const id of ['vialidadLatInicio', 'vialidadLatFin']) campo(id).value = 20;
  for (const id of ['vialidadLngInicio', 'vialidadLngFin']) campo(id).value = -100;
  assert.throws(leerFormulario, /longitud mayor que cero/);
});
