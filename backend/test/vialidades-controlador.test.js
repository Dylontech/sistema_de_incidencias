import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let campos = new Map();
let controles = [];
globalThis.document = {
  addEventListener() {},
  getElementById: (id) => campos.get(id) || null,
  querySelectorAll: (selector) => selector.includes('[data-action="vialidades:importar"]') ? controles : []
};
globalThis.window = { confirm: () => true };
globalThis.HTMLElement = class {};
const { registrar, cargar } = await import('../../frontend/js/controllers/vialidades.controller.js');
const { conectarDelegacion } = await import('../../frontend/js/core/eventos.js');
const { store } = await import('../../frontend/js/core/store.js');
const { vialidadesService } = await import('../../frontend/js/services/vialidades.service.js');
const { incidenciasService } = await import('../../frontend/js/services/incidencias.service.js');
const { api } = await import('../../frontend/js/core/api.js');
registrar();
const eventos = new Map();
conectarDelegacion({ addEventListener: (tipo, fn) => eventos.set(tipo, fn) });
const ejecutar = (accion, extras = {}, tipo = 'click') => {
  const atributo = tipo === 'change' ? 'change' : 'action';
  const elemento = { dataset: { [atributo]: accion }, ...extras };
  elemento.closest = () => elemento;
  eventos.get(tipo)({ target: elemento, preventDefault() {} });
};
const turno = () => new Promise(setImmediate);
const diferida = () => {
  let resolver, rechazar;
  const promesa = new Promise((resolve, reject) => { resolver = resolve; rechazar = reject; });
  return { promesa, resolver, rechazar };
};
const listado = (nombre) => ({ vialidades: nombre ? [{ id: nombre, nombre }] : [], tipos: [], fuentes: [] });
let lectores;
beforeEach((t) => {
  campos = new Map();
  for (const id of ['vialidadesMunicipioFiltro', 'vialidadesTexto', 'vialidadesLista',
    'vialidadesArchivo', 'vialidadesArchivoNota', 'vialidadesRecargaAviso', 'vialidadesRecargaMensaje', 'toast']) {
    campos.set(id, { value: '', textContent: '', innerHTML: '', dataset: {}, setAttribute() {} });
  }
  campos.get('vialidadesMunicipioFiltro').value = '16050';
  controles = [{ dataset: { action: 'vialidades:importar' } }, { dataset: { action: 'vialidades:importarOsm' } }];
  store.estado.municipioActivo = { id: '16050' };
  store.estado.municipios = [{ id: '16050', nombre: 'Maravatío', estado: 'Michoacán' }];
  store.estado.zonas = [{}];
  t.mock.method(vialidadesService, 'listar', async () => listado());
  t.mock.method(incidenciasService, 'vialidades', async () => ({ vias: [] }));
  lectores = [];
  globalThis.FileReader = class {
    constructor() { lectores.push(this); }
    readAsText() {}
  };
  ejecutar('vialidades:archivo', { files: [] }, 'change');
});
afterEach(() => clearTimeout(campos.get('toast')._temporizador));
const archivo = (nombre) => ejecutar('vialidades:archivo', { files: [{ name: nombre, size: 1024 }] }, 'change');

test('archivar utiliza el método DELETE disponible en el cliente HTTP', async (t) => {
  const borrar = t.mock.method(api, 'del', async () => ({ activo: false }));
  assert.deepEqual(await vialidadesService.eliminar('via/1'), { activo: false });
  assert.equal(borrar.mock.calls[0].arguments[0], '/admin/vialidades/via%2F1');
});

test('solo la última consulta puede cambiar la lista o mostrar un error', async (t) => {
  const vieja = diferida();
  const nueva = diferida();
  let numero = 0;
  t.mock.method(vialidadesService, 'listar', () => ++numero === 1 ? vieja.promesa : nueva.promesa);
  campos.get('vialidadesTexto').value = 'anterior';
  const primera = cargar();
  campos.get('vialidadesTexto').value = 'actual';
  const segunda = cargar();
  nueva.resolver(listado('actual'));
  await segunda;
  vieja.resolver(listado('anterior'));
  assert.equal(await primera, null);
  assert.match(campos.get('vialidadesLista').innerHTML, /actual/);
  assert.doesNotMatch(campos.get('vialidadesLista').innerHTML, /anterior/);
});

test('una lectura antigua no sustituye al último archivo y el doble clic envía una sola importación', async (t) => {
  const peticion = diferida();
  const importar = t.mock.method(vialidadesService, 'importar', () => peticion.promesa);
  archivo('primero.geojson');
  archivo('segundo.geojson');
  assert.equal(controles[0].disabled, true);
  ejecutar('vialidades:importar');
  await turno();
  assert.equal(importar.mock.callCount(), 0);
  lectores[1].result = 'segundo';
  lectores[1].onload();
  lectores[0].result = 'primero';
  lectores[0].onload();
  assert.match(campos.get('vialidadesArchivoNota').textContent, /segundo/);
  ejecutar('vialidades:importar');
  ejecutar('vialidades:importar');
  await turno();
  assert.equal(importar.mock.callCount(), 1);
  assert.equal(importar.mock.calls[0].arguments[0].contenido, 'segundo');
  assert.equal(controles[1].disabled, true);
  peticion.resolver({ total: 1, creadas: 1, actualizadas: 0 });
  await turno();
  assert.equal(controles[0].disabled, false);
  assert.equal(campos.get('vialidadesArchivoNota').textContent, 'Sin archivo seleccionado.');
});

test('un fallo de lectura descarta el contenido previo y permite seleccionar otro archivo', async (t) => {
  const importar = t.mock.method(vialidadesService, 'importar', async () => ({}));
  archivo('anterior.geojson');
  lectores[0].result = 'contenido anterior';
  lectores[0].onload();
  archivo('fallido.geojson');
  lectores[1].onerror();
  ejecutar('vialidades:importar');
  await turno();
  assert.equal(importar.mock.callCount(), 0);
  assert.equal(controles[0].disabled, false);
  archivo('nuevo.geojson');
  lectores[2].result = 'nuevo';
  lectores[2].onload();
  assert.match(campos.get('vialidadesArchivoNota').textContent, /nuevo/);
});

test('archivar recarga ambas vistas; un fallo posterior permite reintentar sin repetir la escritura', async (t) => {
  const eliminar = t.mock.method(vialidadesService, 'eliminar', async () => ({}));
  const capa = t.mock.method(incidenciasService, 'vialidades', async () => { throw new Error('Sin red'); });
  ejecutar('vialidades:eliminar', { dataset: { action: 'vialidades:eliminar', id: 'via-1' } });
  await turno();
  assert.equal(eliminar.mock.callCount(), 1);
  assert.equal(capa.mock.callCount(), 1);
  assert.equal(vialidadesService.listar.mock.callCount(), 1);
  assert.equal(campos.get('vialidadesRecargaAviso').hidden, false);
  assert.match(campos.get('vialidadesRecargaMensaje').textContent, /Los cambios se guardaron/);
  t.mock.method(incidenciasService, 'vialidades', async () => ({ vias: [] }));
  ejecutar('vialidades:recargar');
  await turno();
  assert.equal(campos.get('vialidadesRecargaAviso').hidden, true);
  assert.equal(eliminar.mock.callCount(), 1);
});
