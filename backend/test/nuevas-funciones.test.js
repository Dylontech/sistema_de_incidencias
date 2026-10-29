/**
 * Pruebas de las funciones V2.2: configuración, legal, firmas, comentarios,
 * contacto directo, informes multiterritorio, historial de notificaciones,
 * folios y respaldos.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntorno, prepararBaseDeDatos } from './helpers/entorno.js';
import { Api, incidenciaValida, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
let admin;
let ciudadano;
let incidenciaId;
let autorApi;

before(() => {
  app = crearApp();
});

after(async () => {
  await entorno.limpiar();
});

describe('Configuración central', () => {
  test('la configuración pública expone límites y el admin puede cambiarlos', async () => {
    const publica = await new Api(app).get('/api/configuracion/publica');
    assert.equal(publica.status, 200);
    assert.equal(publica.body.configuracion.firmas.maxPorUsuario, 10);

    admin = await Api.admin(app);
    const guardada = await admin.put('/api/admin/configuracion', {
      'firmas.max_por_usuario': 5,
      'comentarios.espera_segundos': 0
    });
    assert.equal(guardada.status, 200);
    const fila = guardada.body.configuracion.find((c) => c.clave === 'firmas.max_por_usuario');
    assert.equal(fila.valor, 5);
  });

  test('un ciudadano no puede leer ni cambiar la configuración global', async () => {
    ciudadano = await Api.ciudadano(app, { correo: `config-${Date.now()}@ejemplo.mx` });
    const lectura = await ciudadano.get('/api/admin/configuracion');
    assert.equal(lectura.status, 403);
    const cambio = await ciudadano.put('/api/admin/configuracion', {
      'firmas.max_por_usuario': 1
    });
    assert.equal(cambio.status, 403);
  });
});

describe('Legal editable', () => {
  test('el borrador no se publica y el HTML peligroso se elimina', async () => {
    const borrador = await admin.put('/api/admin/legal/terminos/borrador', {
      titulo: 'Términos de prueba',
      html: '<h2>Términos</h2><p>Texto seguro</p><script>alert(1)</script><p style="color:red">Sin estilo</p>'
    });
    assert.equal(borrador.status, 200);
    assert.doesNotMatch(borrador.body.documento.htmlBorrador, /script/i);
    assert.doesNotMatch(borrador.body.documento.htmlBorrador, /style=/i);
    assert.match(borrador.body.documento.htmlBorrador, /Texto seguro/);

    const publicoAntes = await new Api(app).get('/api/legal/terminos');
    assert.equal(publicoAntes.status, 200);
    assert.doesNotMatch(publicoAntes.body.documento.html, /Términos de prueba/);

    const publicado = await admin.post('/api/admin/legal/terminos/publicar', {});
    assert.equal(publicado.status, 200);
    assert.equal(publicado.body.documento.versionPublicada, 1);
    const publicoDespues = await new Api(app).get('/api/legal/terminos');
    assert.match(publicoDespues.body.documento.html, /Texto seguro/);
  });

  test('el historial conserva la versión publicada', async () => {
    const historial = await admin.get('/api/admin/legal/terminos/historial');
    assert.equal(historial.status, 200);
    assert.equal(historial.body.historial.length, 1);
    assert.equal(historial.body.historial[0].version, 1);
  });
});

describe('Firmas de incidencias', () => {
  test('el autor fija la meta y otra cuenta firma una sola vez', async () => {
    const autor = await Api.ciudadano(app, { correo: `autor-${Date.now()}@ejemplo.mx` });
    autorApi = autor;
    const creada = await autor.post('/api/incidencias', incidenciaValida({ titulo: 'Bache con firmas' }));
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    incidenciaId = creada.body.incidencia.id;

    const meta = await autor.patch(`/api/incidencias/${incidenciaId}/meta-firmas`, { meta: 2 });
    assert.equal(meta.status, 200);
    assert.equal(meta.body.firmas.meta, 2);

    const firmante = await Api.ciudadano(app, { correo: `firma-${Date.now()}@ejemplo.mx` });
    const firma = await firmante.post(`/api/incidencias/${incidenciaId}/firmas`, {});
    assert.equal(firma.status, 201);
    assert.equal(firma.body.firmas.total, 1);
    assert.equal(firma.body.firmas.firmada, true);

    const repetida = await firmante.post(`/api/incidencias/${incidenciaId}/firmas`, {});
    assert.equal(repetida.status, 409);
  });

  test('un anónimo no puede firmar', async () => {
    const anonimo = await Api.anonimo(app, `anon-firma-${Date.now()}`);
    const respuesta = await anonimo.post(`/api/incidencias/${incidenciaId}/firmas`, {});
    assert.equal(respuesta.status, 403);
  });

  test('la meta alcanzada genera una notificación al autor', async () => {
    const segundo = await Api.ciudadano(app, { correo: `firma2-${Date.now()}@ejemplo.mx` });
    const firma = await segundo.post(`/api/incidencias/${incidenciaId}/firmas`, {});
    assert.equal(firma.status, 201);
    assert.equal(firma.body.firmas.total, 2);

    const avisos = await autorApi.get('/api/notificaciones');
    assert.equal(avisos.status, 200);
    assert.ok(avisos.body.notificaciones.some((n) => n.evento === 'meta_firmas_alcanzada'));
  });
});

describe('Comentarios con reglas y restricciones', () => {
  test('se puede comentar, listar y borrar el comentario propio', async () => {
    const comentarista = await Api.ciudadano(app, { correo: `coment-${Date.now()}@ejemplo.mx` });
    const creado = await comentarista.post(`/api/incidencias/${incidenciaId}/comentarios`, {
      texto: 'Comentario de prueba'
    });
    assert.equal(creado.status, 201);
    const lista = await comentarista.get(`/api/incidencias/${incidenciaId}/comentarios`);
    assert.equal(lista.status, 200);
    assert.ok(lista.body.comentarios.some((c) => c.id === creado.body.comentario.id));

    const borrado = await comentarista.delete(
      `/api/incidencias/${incidenciaId}/comentarios/${creado.body.comentario.id}`
    );
    assert.equal(borrado.status, 200);
  });

  test('moderación puede restringir y levantar la restricción de comentarios', async () => {
    const cuenta = await Api.ciudadanoConCuenta(app, { correo: `restringido-${Date.now()}@ejemplo.mx` });
    const restriccion = await admin.patch(
      `/api/moderacion/cuentas/${cuenta.usuario.username}/restriccion-comentarios`,
      { motivo: 'Spam de prueba' }
    );
    assert.equal(restriccion.status, 201);

    const bloqueado = await cuenta.api.post(`/api/incidencias/${incidenciaId}/comentarios`, {
      texto: 'No debería publicarse'
    });
    assert.equal(bloqueado.status, 403);

    const levantada = await admin.delete(
      `/api/moderacion/cuentas/${cuenta.usuario.username}/restriccion-comentarios`
    );
    assert.equal(levantada.status, 200);
  });
});

describe('Contacto directo a funcionarios', () => {
  test('el ciudadano elige funcionarios del municipio y el funcionario responde', async () => {
    const ciudadanoContacto = await Api.ciudadano(app, {
      correo: `contacto-${Date.now()}@ejemplo.mx`
    });
    const disponibles = await ciudadanoContacto.get(
      `/api/contacto/funcionarios?municipioId=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(disponibles.status, 200);
    assert.ok(disponibles.body.funcionarios.length >= 1);

    const creado = await ciudadanoContacto.post('/api/contacto/funcionarios', {
      municipioId: MUNICIPIO_MARAVATIO,
      funcionarioIds: [disponibles.body.funcionarios[0].id],
      asunto: 'Prueba de contacto',
      mensaje: 'Mensaje de prueba'
    });
    assert.equal(creado.status, 201);

    const funcionario = await Api.funcionario(app);
    const bandeja = await funcionario.get('/api/contacto/directo');
    assert.equal(bandeja.status, 200);
    const hilo = bandeja.body.contactos.find((c) => c.id === creado.body.contacto.id);
    assert.ok(hilo);

    const respuesta = await funcionario.post(`/api/contacto/directo/${hilo.id}/mensajes`, {
      cuerpo: 'Respuesta del funcionario'
    });
    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.body.contacto.estado, 'respondido');
  });

  test('si no hay funcionarios se crea una solicitud de mediación', async () => {
    const ciudadanoMediacion = await Api.ciudadano(app, {
      correo: `mediacion-${Date.now()}@ejemplo.mx`
    });
    const respuesta = await ciudadanoMediacion.post('/api/contacto/funcionarios/solicitar-admin', {
      municipioId: '16053',
      mensaje: 'Morelia no tiene funcionarios en la prueba'
    });
    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.body.solicitud.estado, 'pendiente');

    const mediaciones = await admin.get('/api/admin/contacto/mediaciones');
    assert.equal(mediaciones.status, 200);
    assert.ok(mediaciones.body.solicitudes.some((s) => s.folio === respuesta.body.solicitud.folio));
  });
});

describe('Solicitudes de informe multiterritorio', () => {
  test('rechaza fechas futuras y acepta varios municipios y todos los tipos', async () => {
    const correo = `informe-${Date.now()}@ejemplo.mx`;
    const solicitante = await Api.ciudadano(app, { correo });
    const futuro = await solicitante.post('/api/publico/solicitudes-informe', {
      nombre: 'Prueba',
      correo,
      municipios: [MUNICIPIO_MARAVATIO, '16053'],
      tiposTodos: true,
      desde: '2026-01-01',
      hasta: '2030-12-31',
      aceptaTerminos: true
    });
    assert.equal(futuro.status, 400);

    const valido = await solicitante.post('/api/publico/solicitudes-informe', {
      nombre: 'Prueba',
      correo,
      municipios: [MUNICIPIO_MARAVATIO, '16053'],
      tiposTodos: true,
      ambitos: ['urbano'],
      desde: '2026-01-01',
      hasta: '2026-10-25',
      aceptaTerminos: true,
      formato: 'csv'
    });
    assert.equal(valido.status, 201);
    assert.match(valido.body.folio, /^INF-/);
  });

  test('el admin previsualiza, genera y envía la solicitud', async () => {
    const lista = await admin.get('/api/admin/solicitudes-informe');
    assert.equal(lista.status, 200);
    const solicitud = lista.body.solicitudes.find((s) => s.municipios?.length > 1);
    assert.ok(solicitud);

    const vista = await admin.get(
      `/api/admin/solicitudes-informe/${solicitud.id}/vista-previa?formato=csv`
    );
    assert.equal(vista.status, 200);
    assert.match(vista.headers['content-type'], /text\/csv/);

    const generado = await admin.post(`/api/admin/solicitudes-informe/${solicitud.id}/generar`, {});
    assert.equal(generado.status, 200);
    assert.ok(generado.body.archivo);

    const enviado = await admin.post(`/api/admin/solicitudes-informe/${solicitud.id}/enviar`, {});
    assert.equal(enviado.status, 200);
    assert.equal(enviado.body.solicitud.estado, 'enviada');
  });
});

describe('Historial de notificaciones y folios', () => {
  test('una notificación se archiva y se restaura desde el historial', async () => {
    const cuenta = await Api.ciudadanoConCuenta(app, {
      correo: `historial-${Date.now()}@ejemplo.mx`
    });
    const creada = await cuenta.api.post('/api/incidencias', incidenciaValida({ titulo: 'Para historial' }));
    assert.equal(creada.status, 201);

    await admin.post(`/api/incidencias/${creada.body.incidencia.id}/comentarios`, {
      texto: 'Comentario del personal'
    });

    const buzón = await cuenta.api.get('/api/notificaciones');
    const aviso = buzón.body.notificaciones.find((n) => n.evento === 'incidencia_comentario');
    assert.ok(aviso, JSON.stringify(buzón.body));

    const archivado = await cuenta.api.delete(`/api/notificaciones/${aviso.id}`);
    assert.equal(archivado.status, 200);
    const campana = await cuenta.api.get('/api/notificaciones');
    assert.ok(!campana.body.notificaciones.some((n) => n.id === aviso.id));

    const historial = await cuenta.api.get('/api/notificaciones/historial?texto=Comentario');
    assert.equal(historial.status, 200);
    assert.ok(historial.body.notificaciones.some((n) => n.id === aviso.id));

    const restaurado = await cuenta.api.patch(`/api/notificaciones/${aviso.id}/restaurar`, {});
    assert.equal(restaurado.status, 200);
  });

  test('el ciudadano consulta sus folios y el admin puede buscar todos', async () => {
    const cuenta = await Api.ciudadanoConCuenta(app, {
      correo: `folios-${Date.now()}@ejemplo.mx`
    });
    const creada = await cuenta.api.post('/api/incidencias', incidenciaValida({ titulo: 'Folio propio' }));
    assert.equal(creada.status, 201);

    const mios = await cuenta.api.get('/api/folios/mios?texto=Folio');
    assert.equal(mios.status, 200);
    assert.ok(mios.body.folios.length >= 1);
    assert.match(mios.body.folios[0].folio, /^INC-/);

    const detalle = await cuenta.api.get(`/api/folios/${mios.body.folios[0].folio}`);
    assert.equal(detalle.status, 200);

    const todos = await admin.get('/api/admin/folios?texto=Folio');
    assert.equal(todos.status, 200);
    assert.ok(todos.body.folios.length >= 1);
  });
});

describe('Respaldos', () => {
  test('crea, busca, descarga y restaura un respaldo', async () => {
    const repo = await obtenerRepositorio();
    const marca = `RESPALDO-${Date.now()}`;
    await repo.crearSugerencia({
      id: `sug-${Date.now()}`,
      folio: `SUG-${Date.now()}`,
      tipo: 'mejora',
      nombre: 'Prueba',
      correo: 'respaldo@ejemplo.mx',
      mensaje: marca,
      estado: 'nueva',
      creadoEn: new Date().toISOString()
    });

    const creado = await admin.post('/api/admin/respaldos', { nombre: `Respaldo ${marca}` });
    assert.equal(creado.status, 201);
    assert.equal(creado.body.respaldo.estado, 'listo');
    const id = creado.body.respaldo.id;

    const busqueda = await admin.get(`/api/admin/respaldos?texto=${encodeURIComponent(marca)}`);
    assert.equal(busqueda.status, 200);
    assert.equal(busqueda.body.total, 1);

    const descarga = await admin.get(`/api/admin/respaldos/${id}/descargar`);
    assert.equal(descarga.status, 200);

    if (repo.driver === 'mysql') {
      await repo.knex('sugerencias').where({ mensaje: marca }).del();
    } else {
      await repo.almacen.transaccion('sugerencias', [], (lista) => ({
        datos: lista.filter((s) => s.mensaje !== marca),
        resultado: true
      }));
    }

    const sinConfirmacion = await admin.post(`/api/admin/respaldos/${id}/restaurar`, {
      confirmacion: 'NO'
    });
    assert.equal(sinConfirmacion.status, 400);

    const restaurado = await admin.post(`/api/admin/respaldos/${id}/restaurar`, {
      confirmacion: 'RESTAURAR'
    });
    assert.equal(restaurado.status, 200);
    if (repo.driver === 'mysql') {
      const fila = await repo.knex('sugerencias').where({ mensaje: marca }).first();
      assert.ok(fila);
    } else {
      const sugerencias = await repo.almacen.leer('sugerencias', []);
      assert.ok(sugerencias.some((s) => s.mensaje === marca));
    }
  });
});
