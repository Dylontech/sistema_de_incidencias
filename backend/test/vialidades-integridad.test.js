import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, PUNTO_MARAVATIO, incidenciaValida } from './helpers/api.js';
import { bufferizarEje, posicionEnLinea } from '../src/services/geometria.service.js';
import { viasDesdeContenido } from '../src/services/vialidades-import.service.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const app = crearApp();
let admin;
before(async () => { admin = await Api.admin(app); });
after(() => entorno.limpiar());

const eje = {
  type: 'LineString',
  coordinates: [[-100.442, 19.891], [-100.4415, 19.8918], [-100.441, 19.892]]
};
const entrada = (cambios = {}) => ({
  municipioId: MUNICIPIO_MARAVATIO, nombre: 'Calle curva', tipo: 'calle',
  fuente: 'manual', anchoM: 8, geometria: eje, ...cambios
});

test('editar texto conserva eje, polígono y procedencia; cambiar ancho regenera la calzada', async () => {
  const creada = await admin.post('/api/admin/vialidades', entrada());
  assert.equal(creada.status, 201, JSON.stringify(creada.body));
  const original = creada.body.vialidad;
  const ruta = `/api/admin/vialidades/${original.id}`;
  const texto = await admin.patch(ruta, { nombre: 'Calle renombrada', notas: 'Revisión' });
  assert.equal(texto.status, 200, JSON.stringify(texto.body));
  assert.deepEqual(texto.body.vialidad.geometria, original.geometria);
  assert.deepEqual(texto.body.vialidad.eje, eje);
  assert.equal(texto.body.vialidad.geometriaTipo, 'poligono_generado');

  const ancho = await admin.patch(ruta, { anchoM: 16 });
  assert.equal(ancho.status, 200, JSON.stringify(ancho.body));
  assert.deepEqual(ancho.body.vialidad.eje, eje);
  assert.deepEqual(ancho.body.vialidad.geometria,
    bufferizarEje(eje, 16, { segmentos: false, soloVertices: true }).geometria);
  assert.notDeepEqual(ancho.body.vialidad.bbox, original.bbox);
  const defecto = await admin.patch(ruta, { anchoM: null, tipo: 'avenida' });
  assert.equal(defecto.status, 200, JSON.stringify(defecto.body));
  assert.equal(defecto.body.vialidad.anchoM, 14);
});

test('un polígono importado conserva su forma aunque cambie el ancho declarado', async () => {
  const poligono = bufferizarEje(eje, 12).geometria;
  const creada = await admin.post('/api/admin/vialidades', entrada({ geometria: poligono, eje }));
  assert.equal(creada.status, 201, JSON.stringify(creada.body));
  const cambio = await admin.patch(`/api/admin/vialidades/${creada.body.vialidad.id}`, { anchoM: 20 });
  assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
  assert.deepEqual(cambio.body.vialidad.geometria, poligono);
  assert.equal(cambio.body.vialidad.geometriaTipo, 'poligono');
});

test('la API rechaza anchos inválidos y coordenadas incompletas sin guardar cambios', async () => {
  const creada = await admin.post('/api/admin/vialidades', entrada());
  const ruta = `/api/admin/vialidades/${creada.body.vialidad.id}`;
  for (const anchoM of [-1, 0, 1.9, 60.1, 'abc', true, []]) {
    const respuesta = await admin.patch(ruta, { anchoM });
    assert.equal(respuesta.status, 400, `ancho ${JSON.stringify(anchoM)}: ${JSON.stringify(respuesta.body)}`);
  }
  for (const coordinates of [
    [[-100, 20]], [[-100, 20], [-100, 20]],
    [[-100, 20], [null, 20], [-99, 21]],
    [[-100, 20], ['', 20], [-99, 21]],
    [[-100, 20], [-99, 91]], [[-181, 20], [-99, 21]]
  ]) {
    const respuesta = await admin.post('/api/admin/vialidades', entrada({ geometria: { type: 'LineString', coordinates } }));
    assert.equal(respuesta.status, 400, JSON.stringify(respuesta.body));
  }
  const repo = await obtenerRepositorio();
  const actual = await repo.vialidadPorId(creada.body.vialidad.id);
  assert.equal(actual.anchoM, 8);
  assert.deepEqual(actual.geometria, creada.body.vialidad.geometria);
});

test('una importación excedida no recorta ni reemplaza la red existente', async () => {
  const feature = { type: 'Feature', properties: { name: 'Tramo' }, geometry: eje };
  assert.throws(() => viasDesdeContenido({ type: 'FeatureCollection', features: [feature, feature] },
    { municipioId: MUNICIPIO_MARAVATIO, limite: 1 }), /límite de 1/);
  const repo = await obtenerRepositorio();
  const antes = await repo.listarVialidades({ municipioId: MUNICIPIO_MARAVATIO });
  const respuesta = await admin.post('/api/admin/vialidades/importar', {
    municipioId: MUNICIPIO_MARAVATIO, reemplazar: true,
    contenido: { type: 'FeatureCollection', features: Array(5001).fill(feature) }
  });
  assert.equal(respuesta.status, 400, JSON.stringify(respuesta.body));
  assert.match(respuesta.body.error, /límite de 5000/);
  assert.deepEqual(await repo.listarVialidades({ municipioId: MUNICIPIO_MARAVATIO }), antes);
});

test('las geometrías múltiples conservan todas sus partes al generar y ensanchar', async () => {
  const multiple = { type: 'MultiLineString', coordinates: [eje.coordinates,
    [[-100.44, 19.89], [-100.439, 19.891]]] };
  const creada = await admin.post('/api/admin/vialidades', entrada({ geometria: multiple }));
  assert.equal(creada.status, 201, JSON.stringify(creada.body));
  assert.equal(creada.body.vialidad.geometria.type, 'MultiPolygon');
  assert.equal(creada.body.vialidad.geometria.coordinates.length, 2);
  const cambio = await admin.patch(`/api/admin/vialidades/${creada.body.vialidad.id}`, { anchoM: 10 });
  assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
  assert.deepEqual(cambio.body.vialidad.eje, multiple);
  assert.equal(cambio.body.vialidad.geometria.coordinates.length, 2);
  const ubicacion = posicionEnLinea({ lng: -100.439, lat: 19.891 }, multiple);
  const buffer = bufferizarEje(multiple, 10);
  assert.ok(Math.abs(ubicacion.avance - buffer.longitud) < 1);
  assert.ok(ubicacion.distancia < 1);
});

test('un reporte al final de la calle colorea su ubicación y deja el inicio sin reportes', async () => {
  const repo = await obtenerRepositorio();
  await repo.reemplazarVialidades(MUNICIPIO_MARAVATIO, []);
  const { lng, lat } = PUNTO_MARAVATIO;
  const larga = { type: 'LineString', coordinates: [[lng - 0.012, lat], [lng, lat]] };
  const creada = await admin.post('/api/admin/vialidades', entrada({ geometria: larga }));
  assert.equal(creada.status, 201, JSON.stringify(creada.body));
  const reporte = await admin.post('/api/incidencias', incidenciaValida({ lat, lng: lng - 0.0001 }));
  assert.equal(reporte.status, 201, JSON.stringify(reporte.body));
  const respuesta = await admin.get(`/api/incidencias/vialidades?municipio=${MUNICIPIO_MARAVATIO}`);
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  const via = respuesta.body.vias.find((item) => item.id === creada.body.vialidad.id);
  assert.equal(via.segmentos[0].sinReportes, true);
  assert.equal(via.segmentos.at(-1).sinReportes, false);
  assert.equal(via.segmentos.at(-1).total, 1);
});
