/**
 * Pruebas del sistema de moderación: denuncias, ocultamiento, advertencias y
 * suspensiones.
 *
 * Como la base es compartida dentro del archivo, las comprobaciones se hacen
 * siempre sobre el contenido que crea cada prueba (no sobre totales globales).
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, PUNTO_MARAVATIO, PUNTO_SIN_ZONA, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
let repo;

before(async () => {
  app = crearApp();
  repo = await obtenerRepositorio();
});
after(() => entorno.limpiar());

let contador = 0;
/** Reporta con la sesión indicada, en un punto distinto cada vez (anti-duplicado). */
async function reportar(api, extra = {}) {
  contador++;
  // Se alterna entre dos puntos para que el mismo usuario pueda reportar varias
  // veces el mismo tipo sin chocar con la regla de duplicados.
  const punto = contador % 2 === 0 ? PUNTO_MARAVATIO : PUNTO_SIN_ZONA;
  const r = await api.post('/api/incidencias', incidenciaValida({ ...punto, ...extra }));
  assert.equal(r.status, 201, `no se pudo reportar: ${JSON.stringify(r.body)}`);
  return r.body.incidencia;
}

describe('Moderación: denuncias', () => {
  test('un ciudadano denuncia un reporte ajeno y queda pendiente', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const denunciante = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte denunciable' });

    const r = await denunciante.api.post(`/api/incidencias/${incidencia.id}/denuncias`, {
      motivo: 'contenido_ofensivo',
      detalle: 'Insulta a los vecinos en la descripción'
    });

    assert.equal(r.status, 201);
    assert.equal(r.body.denuncia.estado, 'pendiente');
    assert.equal(r.body.denuncia.motivo, 'contenido_ofensivo');
    assert.equal(r.body.denuncia.objetivo, 'incidencia');
    // Copia del contenido denunciado: sobrevive a que se oculte o se borre.
    assert.equal(r.body.denuncia.objetivoTitulo, 'Reporte denunciable');
    assert.equal(r.body.denuncia.autorNombre, denunciante.usuario.nombre);

    // Denunciar no cambia nada por sí solo.
    const detalle = await autor.api.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(detalle.body.incidencia.oculta, false);
    assert.equal(detalle.body.incidencia.permisos.puedeDenunciar, false);

    // El contador de denuncias pendientes lo ve el personal, no el autor.
    const funcionario = await Api.funcionario(app);
    const comoStaff = await funcionario.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(comoStaff.body.incidencia.permisos.denunciasPendientes, 1);
    assert.equal(comoStaff.body.incidencia.permisos.puedeModerar, true);
  });

  test('la sesión anónima también puede denunciar', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte con denuncia anónima' });
    const anon = await Api.anonimo(app, 'denunciante0001');

    const r = await anon.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'spam' });

    assert.equal(r.status, 201);
    assert.equal(r.body.denuncia.autorNombre, 'Sesión anónima');
    // Sin cuenta no hay buzón: no se le crea acuse de recibo.
    assert.deepEqual((await anon.get('/api/denuncias/mias')).body.denuncias, []);
  });

  test('no se puede denunciar el contenido propio ni con un motivo inventado', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte propio' });

    const propio = await autor.api.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'spam' });
    assert.equal(propio.status, 400);
    assert.match(propio.body.error, /tu propio/i);

    const otro = await Api.ciudadanoConCuenta(app);
    const inventado = await otro.api.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'me_cae_mal' });
    assert.equal(inventado.status, 400);
    assert.equal(inventado.body.detalles[0].campo, 'motivo');

    const largo = await otro.api.post(`/api/incidencias/${incidencia.id}/denuncias`, {
      motivo: 'otro',
      detalle: 'x'.repeat(500)
    });
    assert.equal(largo.status, 400);
    assert.equal(largo.body.detalles[0].campo, 'detalle');
  });

  test('se pueden denunciar comentarios ajenos y no los propios', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const comentarista = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte con comentarios' });

    const comentario = await comentarista.api.post(`/api/incidencias/${incidencia.id}/comentarios`, {
      texto: 'Comentario que se va a denunciar'
    });
    const idComentario = comentario.body.incidencia.comentarios[0].id;

    const otro = await autor.api.post(`/api/incidencias/${incidencia.id}/denuncias`, {
      motivo: 'contenido_ofensivo',
      comentarioId: idComentario
    });
    assert.equal(otro.status, 201);
    assert.equal(otro.body.denuncia.objetivo, 'comentario');
    assert.equal(otro.body.denuncia.comentarioId, idComentario);
    assert.equal(otro.body.denuncia.objetivoResumen, 'Comentario que se va a denunciar');

    const propio = await comentarista.api.post(`/api/incidencias/${incidencia.id}/denuncias`, {
      motivo: 'spam',
      comentarioId: idComentario
    });
    assert.equal(propio.status, 400);
    assert.match(propio.body.error, /tu propio comentario/i);

    const inexistente = await autor.api.post(`/api/incidencias/${incidencia.id}/denuncias`, {
      motivo: 'spam',
      comentarioId: 'no-existe'
    });
    assert.equal(inexistente.status, 404);
  });

  test('la cola de moderación es del personal y agrupa las denuncias repetidas', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte muy denunciado' });

    const uno = await Api.ciudadanoConCuenta(app);
    const dos = await Api.anonimo(app, 'denunciantes0002');
    await uno.api.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'spam' });
    await uno.api.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'duplicado' });
    await dos.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'informacion_falsa' });

    // Un ciudadano no entra a la cola.
    const prohibido = await uno.api.get('/api/moderacion/denuncias');
    assert.equal(prohibido.status, 403);

    const funcionario = await Api.funcionario(app);
    const cola = await funcionario.get('/api/moderacion/denuncias');
    assert.equal(cola.status, 200);

    const grupo = cola.body.grupos.find((g) => g.incidenciaId === incidencia.id);
    assert.ok(grupo, 'el grupo del reporte denunciado debe estar en la cola');
    assert.equal(grupo.total, 3);
    assert.equal(grupo.objetivo, 'incidencia');
    assert.deepEqual([...grupo.motivos].sort(), ['duplicado', 'informacion_falsa', 'spam']);
    assert.equal(grupo.objetivo_estado.oculto, false);
    assert.equal(grupo.objetivo_estado.existe, true);
    // El moderador sí ve quién denunció.
    assert.ok(grupo.denuncias.some((d) => d.autorNombre === 'Sesión anónima'));
  });

  test('el resumen del panel cuenta denuncias pendientes y ocultas', async () => {
    const funcionario = await Api.funcionario(app);
    const r = await funcionario.get('/api/moderacion/resumen');

    assert.equal(r.status, 200);
    assert.ok(r.body.resumen.pendientes > 0);
    assert.equal(typeof r.body.resumen.ocultas, 'number');
    assert.equal(typeof r.body.resumen.suspendidas, 'number');
  });
});

describe('Moderación: ocultar contenido', () => {
  test('ocultar retira el reporte del público pero el autor y el personal lo siguen viendo', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte que se ocultará' });
    const funcionario = await Api.funcionario(app);
    const tercero = await Api.ciudadanoConCuenta(app);

    const r = await funcionario.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, {
      motivo: 'Lenguaje ofensivo'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.incidencia.oculta, true);
    assert.equal(r.body.incidencia.ocultaMotivo, 'Lenguaje ofensivo');
    assert.equal(r.body.incidencia.historial.at(-1).accion, 'Ocultada por moderación: Lenguaje ofensivo');

    // El vecindario no la ve.
    const publico = await tercero.api.get(`/api/incidencias?municipio=${MUNICIPIO_MARAVATIO}`);
    assert.equal(publico.body.incidencias.find((i) => i.id === incidencia.id), undefined);

    // Su autor sí, con la marca puesta.
    const suyas = await autor.api.get(`/api/incidencias?municipio=${MUNICIPIO_MARAVATIO}`);
    const propia = suyas.body.incidencias.find((i) => i.id === incidencia.id);
    assert.ok(propia);
    assert.equal(propia.oculta, true);

    // Y el personal también.
    const comoStaff = await funcionario.get(`/api/incidencias?municipio=${MUNICIPIO_MARAVATIO}`);
    assert.ok(comoStaff.body.incidencias.find((i) => i.id === incidencia.id));

    // El autor recibe el aviso con el motivo.
    const avisos = await autor.api.get('/api/notificaciones');
    assert.ok(avisos.body.notificaciones.some((n) => /ocultada/i.test(n.titulo) && /Lenguaje ofensivo/.test(n.mensaje)));

    // Un tercero no puede abrir el detalle: se le responde 404, no 403.
    const detalle = await tercero.api.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(detalle.status, 404);
    // El autor sí.
    assert.equal((await autor.api.get(`/api/incidencias/${incidencia.id}`)).status, 200);
  });

  test('ocultar dos veces da 409 y un ciudadano no puede ocultar', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte para el 409' });
    const funcionario = await Api.funcionario(app);

    const ciudadano = await autor.api.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, {});
    assert.equal(ciudadano.status, 403);

    assert.equal((await funcionario.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, { motivo: 'x' })).status, 200);
    const repetido = await funcionario.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, { motivo: 'x' });
    assert.equal(repetido.status, 409);
    assert.match(repetido.body.error, /ya está oculta/i);

    // Volver a mostrarla es la operación contraria.
    const restaurar = await funcionario.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, { oculta: false });
    assert.equal(restaurar.status, 200);
    assert.equal(restaurar.body.incidencia.oculta, false);
    assert.equal(restaurar.body.incidencia.ocultaMotivo, '');
  });

  test('la marca de oculta no se levanta editando el reporte', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte congelado' });
    const funcionario = await Api.funcionario(app);
    await funcionario.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, { motivo: 'Abuso' });

    // El autor no puede tocar lo que ya está oculto.
    const intentoAutor = await autor.api.put(`/api/incidencias/${incidencia.id}`, { titulo: 'Otro título' });
    assert.equal(intentoAutor.status, 403);

    // El personal sí, pero la marca se conserva.
    const intentoStaff = await funcionario.put(`/api/incidencias/${incidencia.id}`, { titulo: 'Título corregido' });
    assert.equal(intentoStaff.status, 200);
    assert.equal(intentoStaff.body.incidencia.oculta, true);
    assert.equal(intentoStaff.body.incidencia.titulo, 'Título corregido');
  });

  test('ocultar desde la cola cierra el expediente y avisa al denunciante', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const denunciante = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte denunciado y ocultado' });
    const funcionario = await Api.funcionario(app);

    const denuncia = await denunciante.api.post(`/api/incidencias/${incidencia.id}/denuncias`, {
      motivo: 'violencia_o_amenazas'
    });
    const idDenuncia = denuncia.body.denuncia.id;

    const r = await funcionario.patch(`/api/moderacion/denuncias/${idDenuncia}`, {
      accion: 'ocultar',
      motivo: 'Amenazas a un vecino'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.denuncia.estado, 'atendida');
    assert.equal(r.body.denuncia.accion, 'ocultar');
    assert.equal(r.body.denuncia.moderadoPor, 'Juan López');
    assert.ok(r.body.cerradas >= 1);

    const detalle = await funcionario.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(detalle.body.incidencia.oculta, true);

    const avisos = await denunciante.api.get('/api/notificaciones');
    assert.ok(avisos.body.notificaciones.some((n) => /atendida/i.test(n.titulo)));

    // La misma denuncia no se puede cerrar dos veces.
    const repetido = await funcionario.patch(`/api/moderacion/denuncias/${idDenuncia}`, { accion: 'descartar' });
    assert.equal(repetido.status, 409);
  });

  test('descartar una denuncia no toca el contenido', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const denunciante = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte con denuncia infundada' });
    const funcionario = await Api.funcionario(app);

    const denuncia = await denunciante.api.post(`/api/incidencias/${incidencia.id}/denuncias`, { motivo: 'fuera_de_tema' });
    const r = await funcionario.patch(`/api/moderacion/denuncias/${denuncia.body.denuncia.id}`, {
      accion: 'descartar',
      resolucion: 'No incumple las normas'
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.denuncia.estado, 'descartada');
    assert.equal(r.body.denuncia.accion, 'descartar');

    const detalle = await funcionario.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(detalle.body.incidencia.oculta, false);
    const avisos = await denunciante.api.get('/api/notificaciones');
    assert.ok(avisos.body.notificaciones.some((n) => /revisada/i.test(n.titulo)));
  });

  test('el comentario oculto no viaja a terceros pero sí al personal', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const grosero = await Api.ciudadanoConCuenta(app);
    const tercero = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte con comentario moderado' });
    const funcionario = await Api.funcionario(app);

    const comentario = await grosero.api.post(`/api/incidencias/${incidencia.id}/comentarios`, {
      texto: 'Texto insultante que no debe verse'
    });
    const idComentario = comentario.body.incidencia.comentarios[0].id;

    const r = await funcionario.patch(
      `/api/moderacion/incidencias/${incidencia.id}/comentarios/${idComentario}/ocultar`,
      { motivo: 'Insultos' }
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.incidencia.comentarios[0].oculto, true);

    const comoTercero = await tercero.api.get(`/api/incidencias/${incidencia.id}`);
    const oculto = comoTercero.body.incidencia.comentarios.find((c) => c.id === idComentario);
    assert.equal(oculto.visible, false);
    assert.equal(oculto.texto, '');

    // El autor del comentario y el personal ven el texto (con la marca).
    const comoAutor = await grosero.api.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(comoAutor.body.incidencia.comentarios.find((c) => c.id === idComentario).texto, 'Texto insultante que no debe verse');
    const comoStaff = await funcionario.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(comoStaff.body.incidencia.comentarios.find((c) => c.id === idComentario).texto, 'Texto insultante que no debe verse');

    const avisos = await grosero.api.get('/api/notificaciones');
    assert.ok(avisos.body.notificaciones.some((n) => /comentario/i.test(n.titulo) && /ocultado/i.test(n.titulo)));
  });

  test('las publicaciones ocultas no cuentan en las estadísticas pero sí en el respaldo', async () => {
    const autor = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(autor.api, { titulo: 'Reporte fuera de estadísticas' });
    const funcionario = await Api.funcionario(app);

    const antes = await funcionario.get('/api/stats/panel');
    const totalAntes = antes.body.total;
    const ocultasAntes = antes.body.ocultas;

    await funcionario.patch(`/api/moderacion/incidencias/${incidencia.id}/ocultar`, { motivo: 'Ruido' });

    const despues = await funcionario.get('/api/stats/panel');
    assert.equal(despues.body.total, totalAntes - 1);
    assert.equal(despues.body.ocultas, ocultasAntes + 1);

    // El respaldo conserva el reporte y su marca de moderación.
    const respaldo = await funcionario.get('/api/exportacion');
    const exportada = respaldo.body.incidencias.find((i) => i.id === incidencia.id);
    assert.ok(exportada);
    assert.equal(exportada.oculta, true);
  });
});

describe('Moderación: advertencias y suspensiones', () => {
  test('advertir suma avisos y a la tercera la cuenta queda suspendida', async () => {
    const vecino = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(vecino.api, { titulo: 'Reporte con tres advertencias' });
    const funcionario = await Api.funcionario(app);

    const primera = await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, {
      motivo: 'Falta de respeto'
    });
    assert.equal(primera.status, 200);
    assert.equal(primera.body.advertencias, 1);
    assert.equal(primera.body.suspendida, false);

    await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, { motivo: 'Reincidencia' });
    const tercera = await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, {
      motivo: 'Reincidencia grave'
    });
    assert.equal(tercera.body.advertencias, 3);
    assert.equal(tercera.body.suspendida, true);

    // Sus publicaciones sin resolver se retiran y el acceso queda cortado.
    const detalle = await funcionario.get(`/api/incidencias/${incidencia.id}`);
    assert.equal(detalle.body.incidencia.oculta, true);

    const entrada = await Api.entrarCiudadano(app, { correo: vecino.correo, password: vecino.password });
    assert.equal(entrada.status, 403);
    assert.match(entrada.body.error, /suspendida/i);

    // Y la sesión que ya tenía abierta deja de servir.
    const conTokenVivo = await vecino.api.get(`/api/incidencias?municipio=${MUNICIPIO_MARAVATIO}`);
    assert.equal(conTokenVivo.status, 403);

    // El historial del reporte deja constancia.
    assert.ok(
      detalle.body.incidencia.historial.some((h) => /suspendido tras 3 advertencias/.test(h.accion))
    );
  });

  test('el aviso de la cuenta anónima no se puede dar: no hay a quién sancionar', async () => {
    const anon = await Api.anonimo(app, 'autoranonimo001');
    const incidencia = await reportar(anon, { titulo: 'Reporte de sesión anónima' });
    const funcionario = await Api.funcionario(app);

    const r = await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, { motivo: 'x' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /cuenta registrada/i);
  });

  test('un funcionario solo sanciona ciudadanos; el admin también a funcionarios', async () => {
    const funcionario = await Api.funcionario(app);
    const companero = await Api.funcionario(app, { username: 'funcionario2' });
    const admin = await Api.admin(app);

    const incidencia = await reportar(companero, { titulo: 'Reporte del funcionario 2', tipoId: 'otro' });

    const delFuncionario = await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, {
      motivo: 'x'
    });
    assert.equal(delFuncionario.status, 403);
    assert.match(delFuncionario.body.error, /rol funcionario/i);

    const delAdmin = await admin.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, {
      motivo: 'Uso indebido del sistema'
    });
    assert.equal(delAdmin.status, 200);
    assert.equal(delAdmin.body.advertencias, 1);

    // Nadie se sanciona a sí mismo.
    const aSiMismo = await admin.post('/api/moderacion/cuentas/admin/suspension', { motivo: 'x' });
    assert.equal(aSiMismo.status, 403);
    assert.match(aSiMismo.body.error, /tu propia cuenta/i);
  });

  test('suspender con fecha, reactivar y reinicio del contador', async () => {
    const vecino = await Api.ciudadanoConCuenta(app);
    const incidencia = await reportar(vecino.api, { titulo: 'Reporte para suspensión con fecha' });
    const funcionario = await Api.funcionario(app);

    await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, { motivo: 'Primera' });

    // Una fecha pasada no vale.
    const malFecha = await funcionario.post(`/api/moderacion/cuentas/${vecino.usuario.username}/suspension`, {
      motivo: 'x',
      hasta: new Date(Date.now() - 86400000).toISOString()
    });
    assert.equal(malFecha.status, 400);
    assert.match(malFecha.body.error, /posterior a hoy/i);

    const manana = new Date(Date.now() + 86400000).toISOString();
    const suspender = await funcionario.post(`/api/moderacion/cuentas/${vecino.usuario.username}/suspension`, {
      motivo: 'Comportamiento reiterado',
      hasta: manana
    });
    assert.equal(suspender.status, 200);
    assert.equal(suspender.body.cuenta.suspendido, true);
    assert.ok(suspender.body.cuenta.suspendidoHasta);

    // Suspender dos veces seguidas no tiene sentido.
    const repetido = await funcionario.post(`/api/moderacion/cuentas/${vecino.usuario.username}/suspension`, {
      motivo: 'x'
    });
    assert.equal(repetido.status, 409);

    // La consulta de la cuenta informa del estado.
    const ficha = await funcionario.get(`/api/moderacion/cuentas/${vecino.usuario.username}`);
    assert.equal(ficha.status, 200);
    assert.equal(ficha.body.cuenta.advertencias, 1);
    assert.equal(ficha.body.puedeSancionar, true);

    // Reactivar deja el contador a 0 y permite volver a entrar.
    const reactivar = await funcionario.delete(`/api/moderacion/cuentas/${vecino.usuario.username}/suspension`);
    assert.equal(reactivar.status, 200);
    assert.equal(reactivar.body.cuenta.suspendido, false);
    assert.equal(reactivar.body.cuenta.advertencias, 0);

    const entrada = await Api.entrarCiudadano(app, { correo: vecino.correo, password: vecino.password });
    assert.equal(entrada.status, 200);

    const sinSancion = await funcionario.delete(`/api/moderacion/cuentas/${vecino.usuario.username}/suspension`);
    assert.equal(sinSancion.status, 409);
  });

  test('el listado de sanciones solo muestra cuentas que el moderador puede gestionar', async () => {
    const vecino = await Api.ciudadanoConCuenta(app);
    const funcionario = await Api.funcionario(app);
    const incidencia = await reportar(vecino.api, { titulo: 'Reporte para listado de sanciones' });
    await funcionario.post(`/api/moderacion/incidencias/${incidencia.id}/advertir`, { motivo: 'Prueba listado' });

    const r = await funcionario.get('/api/moderacion/cuentas');
    assert.equal(r.status, 200);
    const ficha = r.body.cuentas.find((c) => c.username === vecino.usuario.username);
    assert.ok(ficha);
    assert.equal(ficha.advertencias, 1);
    // Un funcionario no ve funcionarios ni administradores en su lista.
    assert.equal(r.body.cuentas.some((c) => c.rol === 'admin'), false);
    assert.equal(r.body.cuentas.some((c) => c.rol === 'funcionario'), false);
  });
});
