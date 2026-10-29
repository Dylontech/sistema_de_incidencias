/** Pruebas del simulador: roles, escritura etiquetada, catálogo y reversión. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntorno, prepararBaseDeDatos } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
let admin;

before(() => {
  app = crearApp();
});

after(async () => {
  await entorno.limpiar();
});

describe('Simulador de acciones', () => {
  test('el catálogo filtra acciones por rol y el admin abre una sesión con reporte inicial', async () => {
    admin = await Api.admin(app);

    const comoAnonimo = await admin.get('/api/admin/simulador/acciones?rol=anonimo');
    assert.equal(comoAnonimo.status, 200);
    const idsAnonimo = comoAnonimo.body.acciones.map((a) => a.id);
    assert.ok(idsAnonimo.includes('reportar'));
    assert.ok(!idsAnonimo.includes('firmar'));
    assert.ok(!idsAnonimo.includes('contacto'));

    const sesion = await admin.post('/api/admin/simulador/sesiones', {
      rolSimulado: 'ciudadano',
      municipioId: MUNICIPIO_MARAVATIO
    });
    assert.equal(sesion.status, 201, JSON.stringify(sesion.body));
    assert.equal(sesion.body.sesion.rolSimulado, 'ciudadano');
    assert.ok(sesion.body.sesion.incidenciaSimuladaId);
    assert.ok(sesion.body.sesion.usuarioSimulado.startsWith('sim_ciudadano_'));
    assert.equal(sesion.body.sesion.estado, 'abierta');
  });

  test('ejecuta comentario, firma y reporte con datos marcados como simulados', async () => {
    const sesion = (await admin.get('/api/admin/simulador/sesiones')).body.sesiones.find(
      (s) => s.estado === 'abierta'
    );
    assert.ok(sesion);

    const comentario = await admin.post(
      `/api/admin/simulador/sesiones/${sesion.id}/acciones/comentar`,
      { texto: 'Comentario simulado de prueba' }
    );
    assert.equal(comentario.status, 201, JSON.stringify(comentario.body));
    assert.equal(comentario.body.resultado.tipo, 'comentario');

    const firma = await admin.post(
      `/api/admin/simulador/sesiones/${sesion.id}/acciones/firmar`,
      {}
    );
    assert.equal(firma.status, 201, JSON.stringify(firma.body));
    assert.equal(firma.body.resultado.total, 1);

    const reporte = await admin.post(
      `/api/admin/simulador/sesiones/${sesion.id}/acciones/reportar`,
      { titulo: '[SIMULACIÓN] Segundo reporte', descripcion: 'Prueba de creación.' }
    );
    assert.equal(reporte.status, 201, JSON.stringify(reporte.body));
    assert.ok(reporte.body.resultado.folio);

    const repositorio = await obtenerRepositorio();
    const simuladas = await repositorio.buscarIncidencias({
      municipioId: MUNICIPIO_MARAVATIO,
      incluirSimulados: true,
      limite: 100
    });
    const deLaSesion = simuladas.filter((i) => i.simulacionId === sesion.id);
    assert.ok(deLaSesion.length >= 2);
    assert.ok(deLaSesion.every((i) => i.simulado === true));

    const publicas = await repositorio.buscarIncidencias({ municipioId: MUNICIPIO_MARAVATIO });
    assert.ok(!publicas.some((i) => i.simulacionId === sesion.id));
  });

  test('un rol sin permiso no puede ejecutar una acción de administración', async () => {
    const sesion = (await admin.get('/api/admin/simulador/sesiones')).body.sesiones.find(
      (s) => s.estado === 'abierta'
    );
    const respuesta = await admin.post(
      `/api/admin/simulador/sesiones/${sesion.id}/acciones/publicacion`,
      { titulo: 'No permitida' }
    );
    assert.equal(respuesta.status, 403);
  });

  test('la reversión borra los datos y usuarios de la sesión', async () => {
    const sesion = (await admin.get('/api/admin/simulador/sesiones')).body.sesiones.find(
      (s) => s.estado === 'abierta'
    );
    const revertida = await admin.post(`/api/admin/simulador/sesiones/${sesion.id}/revertir`, {});
    assert.equal(revertida.status, 200, JSON.stringify(revertida.body));
    assert.equal(revertida.body.sesion.estado, 'revertida');

    const repositorio = await obtenerRepositorio();
    const restantes = await repositorio.buscarIncidencias({
      municipioId: MUNICIPIO_MARAVATIO,
      incluirSimulados: true,
      limite: 200
    });
    assert.ok(!restantes.some((i) => i.simulacionId === sesion.id));
    assert.equal(await repositorio.usuarioPorUsername(sesion.usuarioSimulado), null);
    if (sesion.usuarioIncidencia !== sesion.usuarioSimulado) {
      assert.equal(await repositorio.usuarioPorUsername(sesion.usuarioIncidencia), null);
    }
  });

  test('el funcionario simulado puede cambiar el estado de su reporte', async () => {
    const sesion = await admin.post('/api/admin/simulador/sesiones', {
      rolSimulado: 'funcionario',
      municipioId: MUNICIPIO_MARAVATIO
    });
    assert.equal(sesion.status, 201, JSON.stringify(sesion.body));
    const id = sesion.body.sesion.id;

    const cambio = await admin.post(
      `/api/admin/simulador/sesiones/${id}/acciones/cambiar-estado`,
      { estado: 'en_proceso', solucion: 'Cuadrilla simulada asignada.' }
    );
    assert.equal(cambio.status, 201, JSON.stringify(cambio.body));
    assert.equal(cambio.body.resultado.estado, 'en_proceso');

    const cierre = await admin.post(`/api/admin/simulador/sesiones/${id}/cerrar`, {});
    assert.equal(cierre.status, 200);
    assert.equal(cierre.body.sesion.estado, 'cerrada');

    const reversion = await admin.post(`/api/admin/simulador/sesiones/${id}/revertir`, {});
    assert.equal(reversion.status, 200);
    assert.equal(reversion.body.sesion.estado, 'revertida');
  });
});
