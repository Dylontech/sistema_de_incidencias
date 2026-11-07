/**
 * Pruebas del alcance territorial N:M: funcionarios con varios municipios,
 * auditores de solo lectura, enlaces estatales/federales y revocación
 * inmediata de asignaciones.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

const MORELIA = '16053';
const ALAVARO = '09010';
const LEON = '11020';

let app;
let repositorio;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();

  const fecha = new Date().toISOString();
  const base = {
    tipoId: 'bache',
    iconoCustom: '',
    titulo: 'Reporte de prueba territorial',
    descripcion: 'Reporte insertado para comprobar el alcance.',
    indicaciones: '',
    lat: 19.7,
    lng: -101.2,
    fecha,
    actualizado: fecha,
    estado: 'reportada',
    esAnonimo: true,
    autor: 'Anónimo',
    autorNombre: 'Anónimo',
    userKey: 'anon_territorio',
    zonaId: null,
    zonaNombre: null,
    evidencia: [],
    historial: [],
    comentarios: [],
    fechaResolucion: null,
    solucion: null,
    evidenciaSolucion: []
  };

  await repositorio.insertarIncidencias([
    { ...base, id: 'terr-morelia', municipioId: MORELIA, estadoEntidad: 'Michoacán' },
    { ...base, id: 'terr-alvaro', municipioId: ALAVARO, estadoEntidad: 'Ciudad de México' },
    { ...base, id: 'terr-leon', municipioId: LEON, estadoEntidad: 'Guanajuato' }
  ]);
});

after(() => entorno.limpiar());

async function crearPersonal(datos) {
  const admin = await Api.admin(app);
  const r = await admin.post('/api/usuarios', {
    password: 'secreta123',
    nombre: 'Cuenta de prueba',
    generarClave: true,
    claveExpiraEn: '2030-12-31',
    ...datos
  });
  assert.equal(r.status, 201, r.body?.error);
  assert.ok(r.body.clave?.codigo, 'la cuenta debe nacer con clave');
  return { ...r.body.usuario, clave: r.body.clave };
}

describe('Alcance territorial', () => {
  test('un funcionario con dos municipios ve ambos y nada más', async () => {
    const creado = await crearPersonal({
      username: 'func_dos_municipios',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO, MORELIA]
    });

    const login = await Api.entrarFuncionario(app, {
      username: 'func_dos_municipios',
      password: 'secreta123',
      claveAcceso: creado.clave.codigo
    });
    assert.equal(login.status, 200, login.body?.error);
    assert.deepEqual(login.body.usuario.municipios.sort(), [MUNICIPIO_MARAVATIO, MORELIA].sort());
    assert.equal(login.body.usuario.puedeEscribir, true);

    const api = new Api(app, login.body.token);

    const morelia = await api.get(`/api/incidencias?municipio=${MORELIA}`);
    assert.equal(morelia.status, 200);
    assert.ok(morelia.body.incidencias.some((i) => i.id === 'terr-morelia'));

    const fuera = await api.get(`/api/incidencias?municipio=${ALAVARO}`);
    assert.equal(fuera.status, 403);

    const detalleFuera = await api.get('/api/incidencias/terr-alvaro');
    assert.equal(detalleFuera.status, 403);

    // Puede registrar dentro de cualquiera de sus municipios, no fuera.
    const reporteFuera = await api.post('/api/incidencias', {
      tipoId: 'bache',
      titulo: 'Intento fuera de alcance',
      descripcion: 'No debería entrar.',
      municipioId: ALAVARO,
      lat: 19.35,
      lng: -99.16
    });
    assert.equal(reporteFuera.status, 403);
  });

  test('el auditor consulta e informa, pero no escribe', async () => {
    const creado = await crearPersonal({
      username: 'auditor_maravatio',
      rol: 'auditor',
      municipios: [MUNICIPIO_MARAVATIO]
    });

    const login = await Api.entrarFuncionario(app, {
      username: 'auditor_maravatio',
      password: 'secreta123',
      claveAcceso: creado.clave.codigo
    });
    assert.equal(login.status, 200, login.body?.error);
    assert.equal(login.body.usuario.puedeEscribir, false);
    assert.equal(login.body.usuario.soloLectura, true);

    const api = new Api(app, login.body.token);
    assert.equal((await api.get('/api/incidencias')).status, 200);
    assert.equal((await api.get('/api/stats/informes')).status, 200);
    assert.equal((await api.get('/api/usuarios')).status, 200);

    assert.equal(
      (await api.patch('/api/incidencias/terr-morelia/estado', { estado: 'en_proceso' })).status,
      403
    );
    assert.equal(
      (
        await api.post('/api/incidencias', {
          tipoId: 'bache',
          titulo: 'Reporte del auditor',
          descripcion: 'No debería poder crear.',
          municipioId: MUNICIPIO_MARAVATIO,
          lat: 19.89,
          lng: -100.44
        })
      ).status,
      403
    );
    assert.equal((await api.post('/api/tipos', { nombre: 'Tipo auditor' })).status, 403);
  });

  test('el enlace estatal solo ve los municipios de su estado', async () => {
    const creado = await crearPersonal({
      username: 'enlace_michoacan',
      rol: 'enlace_estatal',
      estados: ['Michoacán']
    });

    const login = await Api.entrarFuncionario(app, {
      username: 'enlace_michoacan',
      password: 'secreta123',
      claveAcceso: creado.clave.codigo
    });
    assert.equal(login.status, 200, login.body?.error);
    assert.deepEqual(login.body.usuario.estados, ['Michoacán']);
    assert.equal(login.body.usuario.puedeEscribir, false);

    const api = new Api(app, login.body.token);
    const lista = await api.get('/api/incidencias');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.incidencias.some((i) => i.id === 'terr-morelia'));
    assert.ok(!lista.body.incidencias.some((i) => i.id === 'terr-alvaro'));

    const otroEstado = await api.get('/api/incidencias?estadoEntidad=Guanajuato');
    assert.equal(otroEstado.status, 403);
    assert.equal((await api.get('/api/incidencias/terr-leon')).status, 403);

    const municipios = await api.get('/api/municipios');
    assert.equal(municipios.status, 200);
    assert.ok(municipios.body.municipios.every((m) => m.estado === 'Michoacán'));
  });

  test('un enlace federal ve los estados asignados y ninguno más', async () => {
    const creado = await crearPersonal({
      username: 'enlace_federal',
      rol: 'enlace_federal',
      estados: ['Michoacán', 'Guanajuato']
    });

    const login = await Api.entrarFuncionario(app, {
      username: 'enlace_federal',
      password: 'secreta123',
      claveAcceso: creado.clave.codigo
    });
    assert.equal(login.status, 200, login.body?.error);

    const api = new Api(app, login.body.token);
    const lista = await api.get('/api/incidencias');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.incidencias.some((i) => i.id === 'terr-leon'));
    assert.ok(lista.body.incidencias.some((i) => i.id === 'terr-morelia'));
    assert.ok(!lista.body.incidencias.some((i) => i.id === 'terr-alvaro'));

    const cdmx = await api.get('/api/incidencias?estadoEntidad=Ciudad de México');
    assert.equal(cdmx.status, 403);
  });

  test('quitar un municipio invalida el acceso de inmediato, sin esperar al token', async () => {
    const creado = await crearPersonal({
      username: 'func_revocable',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO, MORELIA]
    });

    const login = await Api.entrarFuncionario(app, {
      username: 'func_revocable',
      password: 'secreta123',
      claveAcceso: creado.clave.codigo
    });
    assert.equal(login.status, 200, login.body?.error);
    const api = new Api(app, login.body.token);
    assert.equal((await api.get(`/api/incidencias?municipio=${MORELIA}`)).status, 200);

    const admin = await Api.admin(app);
    const cambio = await admin.patch(`/api/usuarios/${creado.id}`, {
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(cambio.status, 200, cambio.body?.error);

    // El token viejo sigue siendo válido, pero el alcance se recarga en cada
    // petición: Morelia ya no debe estar accesible.
    assert.equal((await api.get(`/api/incidencias?municipio=${MORELIA}`)).status, 403);
    assert.equal((await api.get(`/api/incidencias?municipio=${MUNICIPIO_MARAVATIO}`)).status, 200);
  });
});
