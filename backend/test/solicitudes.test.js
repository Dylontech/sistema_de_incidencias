/**
 * Solicitudes públicas de informe: doble opt-in, generación, envío simulado,
 * consulta por folio y bloqueos reversibles.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, PUNTO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const solicitudes = await import('../src/services/solicitudes.service.js');

let app;
let repositorio;
let solicitante;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
  const anon = await Api.anonimo(app, 'ciudadanoInformes');
  const r = await anon.post('/api/incidencias', incidenciaValida({ ...PUNTO_MARAVATIO }));
  assert.equal(r.status, 201, r.body?.error);
  solicitante = await Api.ciudadano(app, { correo: 'solicitante@ejemplo.mx' });
});

after(() => entorno.limpiar());

function cuerpoSolicitud(extra = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const haceUnAno = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return {
    nombre: 'Vecina Solicitante',
    correo: 'solicitante@ejemplo.mx',
    municipioId: MUNICIPIO_MARAVATIO,
    formato: 'pdf',
    tiposTodos: true,
    desde: haceUnAno,
    hasta: hoy,
    aceptaTerminos: true,
    ...extra
  };
}

describe('Solicitudes públicas de informe', () => {
  test('crea la solicitud con cuenta y exige confirmar el correo', async () => {
    const creada = await solicitante.post('/api/publico/solicitudes-informe', cuerpoSolicitud());
    assert.equal(creada.status, 201, creada.body?.error);
    assert.match(creada.body.folio, /^INF-\d{8}-[A-F0-9]{6}$/);
    assert.equal(creada.body.estado, 'pendiente_verificacion');

    const guardada = await repositorio.solicitudInformePorFolio(creada.body.folio);
    assert.ok(guardada.tokenVerificacion);
    assert.equal(guardada.aceptaTerminos, true);

    // La campana del admin debe apuntar al resumen de ESTA solicitud, no solo
    // a la pestaña general.
    const admin = await Api.admin(app);
    const { notificaciones } = (await admin.get('/api/notificaciones')).body;
    const aviso = notificaciones.find(
      (n) => n.entidadTipo === 'solicitud_informe' && n.entidadId === guardada.id
    );
    assert.ok(aviso, 'debe crearse el aviso de la solicitud');
    assert.match(aviso.url, /admin=solicitudes-informe/);
    assert.match(aviso.url, new RegExp(`solicitud=${guardada.id}`));

    const verificada = await new Api(app).get(
      `/api/publico/solicitudes-informe/verificar/${guardada.tokenVerificacion}`
    );
    assert.equal(verificada.status, 200, verificada.body?.error);
    assert.equal(verificada.body.estado, 'pendiente');

    // El mismo enlace ya no sirve.
    const repetida = await new Api(app).get(
      `/api/publico/solicitudes-informe/verificar/${guardada.tokenVerificacion}`
    );
    assert.equal(repetida.status, 404);
  });

  test('genera y envía el informe (correo simulado)', async () => {
    const folio = (await repositorio.solicitudesInforme({ correo: 'solicitante@ejemplo.mx' }))[0]
      .folio;

    // La verificación dispara el procesamiento en segundo plano; se espera a
    // que el trabajador (o el disparo) termine sin bloquear la petición.
    let guardada = await repositorio.solicitudInformePorFolio(folio);
    for (let intento = 0; intento < 30 && guardada.estado !== 'enviada'; intento += 1) {
      await new Promise((resolver) => setTimeout(resolver, 100));
      guardada = await repositorio.solicitudInformePorFolio(folio);
    }
    assert.equal(guardada.estado, 'enviada');

    const envios = await repositorio.enviosCorreo({ limite: 20 });
    assert.ok(envios.some((e) => e.tipo === 'informe' && e.estado === 'simulado'));
  });

  test('el admin puede abrir el archivo generado y este queda en disco', async () => {
    const lista = await repositorio.solicitudesInforme({ correo: 'solicitante@ejemplo.mx' });
    const solicitud = lista[0];
    assert.ok(solicitud.archivo, 'la solicitud debe tener un archivo generado');

    const admin = await Api.admin(app);
    const archivo = await admin.get(`/api/admin/solicitudes-informe/${solicitud.id}/archivo`);
    assert.equal(archivo.status, 200, JSON.stringify(archivo.body));
    assert.match(archivo.headers['content-type'], /application\/pdf|text\/csv/);
    assert.match(archivo.headers['content-disposition'], /inline/);
    assert.match(archivo.headers['x-solicitud-folio'], new RegExp(solicitud.folio));
  });

  test('se puede consultar el estado con folio y correo', async () => {
    const lista = await repositorio.solicitudesInforme({ correo: 'solicitante@ejemplo.mx' });
    const folio = lista[0].folio;
    const consulta = await new Api(app).get(
      `/api/publico/solicitudes-informe/${folio}?correo=solicitante@ejemplo.mx`
    );
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body.folio, folio);

    const incorrecta = await new Api(app).get(
      `/api/publico/solicitudes-informe/${folio}?correo=otro@ejemplo.mx`
    );
    assert.equal(incorrecta.status, 404);
  });

  test('no admite dos solicitudes abiertas del mismo correo', async () => {
    const correo = 'duplicada@ejemplo.mx';
    const primera = await solicitante.post(
      '/api/publico/solicitudes-informe',
      cuerpoSolicitud({ correo })
    );
    assert.equal(primera.status, 201, primera.body?.error);

    const segunda = await solicitante.post(
      '/api/publico/solicitudes-informe',
      cuerpoSolicitud({ correo })
    );
    assert.equal(segunda.status, 409);
  });

  test('una sesión anónima no puede solicitar informes', async () => {
    const anon = await Api.anonimo(app, 'anonimoInformes');
    const rechazada = await anon.post(
      '/api/publico/solicitudes-informe',
      cuerpoSolicitud({ correo: 'anonimo@ejemplo.mx' })
    );
    assert.equal(rechazada.status, 403);
  });

  test('guarda varios estados y municipios en la misma solicitud', async () => {
    const correo = 'multiestado@ejemplo.mx';
    const creada = await solicitante.post(
      '/api/publico/solicitudes-informe',
      cuerpoSolicitud({
        correo,
        municipioId: undefined,
        municipios: ['16050', '16053'],
        estados: ['Michoacán', 'Guanajuato']
      })
    );
    assert.equal(creada.status, 201, creada.body?.error);
    const guardada = await repositorio.solicitudInformePorFolio(creada.body.folio);
    assert.deepEqual(guardada.municipios, ['16050', '16053']);
    assert.deepEqual(guardada.estados, ['Michoacán', 'Guanajuato']);
    assert.equal(guardada.municipioId, null);
    assert.equal(guardada.estadoEntidad, null);
  });

  test('el bloqueo impide nuevas solicitudes y se puede revertir', async () => {
    const admin = await Api.admin(app);
    const correo = 'bloqueado@ejemplo.mx';

    const bloqueo = await admin.post('/api/admin/bloqueos', {
      correo,
      motivo: 'Solicitudes repetidas de prueba'
    });
    assert.equal(bloqueo.status, 201, bloqueo.body?.error);

    const rechazada = await solicitante.post(
      '/api/publico/solicitudes-informe',
      cuerpoSolicitud({ correo })
    );
    assert.equal(rechazada.status, 403);
    assert.match(rechazada.body.error, /No podemos atender solicitudes/i);

    const desbloqueo = await admin.delete(`/api/admin/bloqueos/${bloqueo.body.bloqueo.id}`);
    assert.equal(desbloqueo.status, 200);

    const aceptada = await solicitante.post(
      '/api/publico/solicitudes-informe',
      cuerpoSolicitud({ correo })
    );
    assert.equal(aceptada.status, 201, aceptada.body?.error);
  });

  test('las bandejas de solicitudes y bloqueos son solo del administrador', async () => {
    const funcionario = await Api.funcionario(app);
    assert.equal((await funcionario.get('/api/admin/solicitudes-informe')).status, 403);
    assert.equal((await funcionario.get('/api/admin/bloqueos')).status, 403);

    const admin = await Api.admin(app);
    const lista = await admin.get('/api/admin/solicitudes-informe');
    assert.equal(lista.status, 200);
    assert.ok(Array.isArray(lista.body.solicitudes));
  });
});
