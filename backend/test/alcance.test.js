/** Pruebas de alcance por rol/municipio, estadísticas, exportación e importación. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, CLAVE_MARAVATIO, MUNICIPIO_MARAVATIO, PUNTO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

/** PNG 1x1 para probar la conversión de base64 de los respaldos viejos. */
const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

let app;
let repositorio;
before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
});
after(() => entorno.limpiar());

/**
 * Inserta directamente una incidencia de OTRO municipio.
 * Ahora el catálogo tiene los 113 municipios del estado, así que se usa
 * Morelia (16053) para comprobar que un funcionario de Maravatío no la ve.
 */
async function insertarDeOtroMunicipio() {
  const fecha = new Date().toISOString();
  const incidencia = {
    id: `ajena-${Math.random().toString(36).slice(2, 8)}`,
    tipoId: 'bache',
    iconoCustom: '',
    titulo: 'Reporte de otro municipio',
    descripcion: 'Debe quedar fuera del alcance del funcionario de Maravatío.',
    indicaciones: '',
    lat: 19.75,
    lng: -101.3,
    fecha,
    actualizado: fecha,
    estado: 'reportada',
    esAnonimo: true,
    autor: 'Anónimo',
    autorNombre: 'Anónimo',
    userKey: 'anon_otro_municipio',
    municipioId: '16053',
    zonaId: 'loc_160530001',
    zonaNombre: 'Morelia',
    evidencia: [],
    historial: [],
    comentarios: [],
    fechaResolucion: null,
    solucion: null,
    evidenciaSolucion: []
  };
  await repositorio.insertarIncidencias([incidencia]);
  return incidencia;
}

describe('Alcance por municipio y rol', () => {
  test('el funcionario solo ve su municipio; el admin sin municipio ve todos', async () => {
    const admin = await Api.admin(app); // sin municipio activo → alcance global
    const funcionario = await Api.funcionario(app); // Maravatío
    const anon = await Api.anonimo(app, 'ciudadanoAlcance');

    const propia = await anon.post('/api/incidencias', incidenciaValida());
    assert.equal(propia.status, 201);
    assert.equal(propia.body.incidencia.municipioId, MUNICIPIO_MARAVATIO);

    const ajena = await insertarDeOtroMunicipio();

    const vistaFuncionario = await funcionario.get('/api/incidencias');
    assert.equal(vistaFuncionario.body.incidencias.length, 1);
    assert.equal(vistaFuncionario.body.incidencias[0].municipioId, MUNICIPIO_MARAVATIO);

    const vistaAdmin = await admin.get('/api/incidencias');
    assert.equal(vistaAdmin.body.incidencias.length, 2);

    // El funcionario de Maravatío no puede ver la incidencia de otro municipio.
    const detalleAjeno = await funcionario.get(`/api/incidencias/${ajena.id}`);
    assert.equal(detalleAjeno.status, 403);

    // El admin sin municipio activo sí la ve.
    const detalleAdmin = await admin.get(`/api/incidencias/${ajena.id}`);
    assert.equal(detalleAdmin.status, 200);
    assert.equal(detalleAdmin.body.incidencia.municipioId, '16053');
  });

  test('el admin puede limitarse a un municipio activo', async () => {
    const admin = await Api.admin(app);
    const conMunicipio = await admin.post('/api/auth/municipio-activo', {
      municipioId: MUNICIPIO_MARAVATIO,
      clave: CLAVE_MARAVATIO
    });
    assert.equal(conMunicipio.status, 200);

    const acotado = new Api(app, conMunicipio.body.token);
    const vista = await acotado.get('/api/incidencias');
    assert.ok(vista.body.incidencias.length >= 1);
    assert.ok(vista.body.incidencias.every((i) => i.municipioId === MUNICIPIO_MARAVATIO));

    const zonas = await acotado.get(`/api/municipios/${MUNICIPIO_MARAVATIO}/zonas`);
    assert.ok(zonas.body.zonas.length > 1);
    assert.equal(zonas.body.zonas[0].municipioId, MUNICIPIO_MARAVATIO);
    // Las comunidades vienen del INEGI y traen su clave geoestadística.
    assert.ok(zonas.body.zonas.every((z) => z.tipo === 'localidad'));
    assert.ok(zonas.body.zonas.every((z) => z.clave && z.clave.startsWith(MUNICIPIO_MARAVATIO)));
  });

  test('los informes y el resumen de zonas son solo para empleados', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoStats');
    const funcionario = await Api.funcionario(app);

    assert.equal((await anon.get('/api/stats/panel')).status, 403);
    assert.equal((await anon.get('/api/exportacion')).status, 403);
    assert.equal(
      (await anon.get(`/api/municipios/${MUNICIPIO_MARAVATIO}/zonas/resumen`)).status,
      403
    );

    const zonas = await funcionario.get(`/api/municipios/${MUNICIPIO_MARAVATIO}/zonas/resumen`);
    assert.equal(zonas.status, 200);
    // Una entrada por comunidad del municipio.
    assert.ok(zonas.body.zonas.length > 1);
    assert.ok(zonas.body.zonas[0].reportes >= 0);
    assert.ok('pendientes' in zonas.body.zonas[0]);
  });
});

describe('Estadísticas y exportación', () => {
  test('el panel y los informes agregan por tipo', async () => {
    const funcionario = await Api.funcionario(app);

    const panel = await funcionario.get('/api/stats/panel');
    assert.equal(panel.status, 200);
    assert.ok(panel.body.total >= 1);
    assert.ok(typeof panel.body.tasaResolucion === 'number');
    assert.ok(panel.body.porTipo.every((f) => f.total > 0));

    const informes = await funcionario.get('/api/stats/informes');
    assert.equal(informes.status, 200);
    assert.ok(informes.body.porTipo.every((f) => typeof f.promedioDias === 'number'));

    const exportacion = await funcionario.get('/api/exportacion');
    assert.equal(exportacion.status, 200);
    assert.ok(Array.isArray(exportacion.body.incidencias));
    assert.ok(Array.isArray(exportacion.body.tipos));
    // Nunca se exportan hashes de contraseña ni claves de municipio.
    assert.equal(exportacion.body.usuarios[0].passwordHash, undefined);
    assert.equal(exportacion.body.municipios[0].clave, undefined);
  });

  test('el catálogo de apoyo trae iconos, ejemplos y límites', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoCat');
    const catalogos = await anon.get('/api/catalogos');
    assert.equal(catalogos.status, 200);
    assert.equal(catalogos.body.iconos.length, 32);
    assert.equal(Object.keys(catalogos.body.ejemplos).length, 16);
    assert.deepEqual(catalogos.body.diasLimites, { amarillo: 15, naranja: 30 });
    assert.equal(catalogos.body.limites.maxVideoSegundos, 300);
  });
});

describe('Administración de datos', () => {
  test('la importación de un respaldo del monolito convierte la evidencia base64', async () => {
    const admin = await Api.admin(app);

    const respaldo = {
      exportado: new Date().toISOString(),
      incidencias: [
        {
          id: 'legacy-1',
          tipoId: 'bache',
          iconoCustom: '',
          titulo: 'Reporte importado del sistema anterior',
          descripcion: 'Viene del respaldo JSON con evidencia en base64.',
          indicaciones: '',
          lat: PUNTO_MARAVATIO.lat,
          lng: PUNTO_MARAVATIO.lng,
          fecha: new Date(Date.now() - 45 * 86400000).toISOString(),
          estado: 'reportada',
          colorAuto: 'rojo', // campo obsoleto: debe descartarse
          esAnonimo: true,
          autor: 'Anónimo',
          autorNombre: 'Anónimo',
          userKey: 'anon_viejo',
          municipioId: MUNICIPIO_MARAVATIO,
          zonaId: 'loc_160500001',
          zonaNombre: 'Maravatío de Ocampo',
          evidencia: [
            { id: 'e1', nombre: 'foto.png', tipo: 'image/png', tamano: 70, data: PNG_BASE64 }
          ]
        }
      ],
      tipos: [{ id: 'custom_viejo', nombre: 'Tipo viejo', icono: '⚠️', custom: true }]
    };

    const r = await admin.post('/api/admin/importar', respaldo);
    assert.equal(r.status, 201);
    assert.equal(r.body.incidencias, 1);
    assert.equal(r.body.archivos, 1);
    assert.equal(r.body.tipos, 1);

    const detalle = await admin.get('/api/incidencias/legacy-1');
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.incidencia.color, 'rojo'); // derivado, no persistido
    assert.match(detalle.body.incidencia.evidencia[0].url, /^\/uploads\//);
    assert.equal(detalle.body.incidencia.evidencia[0].data, undefined);

    const tipos = await admin.get('/api/tipos');
    const personalizado = tipos.body.tipos.find((t) => t.id === 'custom_viejo');
    assert.equal(personalizado.nombre, 'Tipo viejo');
    assert.equal(personalizado.custom, true);
  });

  test('los tipos personalizados se crean y se eliminan; los base están protegidos', async () => {
    const funcionario = await Api.funcionario(app);
    const anon = await Api.anonimo(app, 'ciudadanoTipos');

    assert.equal((await anon.post('/api/tipos', { nombre: 'X', icono: '❗' })).status, 403);

    const creado = await funcionario.post('/api/tipos', {
      nombre: 'Semáforo intermitente',
      icono: '🚦'
    });
    assert.equal(creado.status, 201);
    assert.match(creado.body.tipo.id, /^custom_/);

    const repetido = await funcionario.post('/api/tipos', {
      nombre: 'semáforo intermitente',
      icono: '🚦'
    });
    assert.equal(repetido.status, 409);

    const borrado = await funcionario.delete(`/api/tipos/${creado.body.tipo.id}`);
    assert.equal(borrado.status, 200);

    const base = await funcionario.delete('/api/tipos/bache');
    assert.equal(base.status, 400);
    assert.match(base.body.error, /personalizados/);
  });

  test('restablecer datos borra incidencias y notificaciones, y es solo para admin', async () => {
    const funcionario = await Api.funcionario(app);
    const admin = await Api.admin(app);

    assert.equal((await funcionario.post('/api/admin/limpiar')).status, 403);

    const r = await admin.post('/api/admin/limpiar');
    assert.equal(r.status, 200);
    assert.ok(r.body.incidencias >= 1);

    const listado = await admin.get('/api/incidencias');
    assert.equal(listado.body.incidencias.length, 0);
  });
});
