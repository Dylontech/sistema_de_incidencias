/**
 * V2.11: roles propios, alcance real en estadísticas y contraseñas consultables.
 *
 * Cubre los casos que motivaron la versión:
 * - editar la matriz de un rol integrado afecta a la sesión siguiente;
 * - un rol propio hereda la plantilla y su propia matriz;
 * - un funcionario no puede cambiar permisos, contraseñas ni generar claves;
 * - las estadísticas rechazan territorio ajeno (403, no ceros);
 * - la administración consulta la contraseña cifrada y la consulta queda en
 *   auditoría; el personal la solicita desde «Mi cuenta».
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

const MORELIA = '16053';
const ALVARO_OBREGON = '09010';
let app;

before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function crearCuenta(admin, datos = {}) {
  const respuesta = await admin.post('/api/usuarios').send({
    username: `v211_${sufijo()}`,
    nombre: 'Cuenta de prueba V2.11',
    rol: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: '2030-12-31',
    ...datos
  });
  assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
  return { ...respuesta.body.usuario, clave: respuesta.body.clave };
}

async function sesionFuncionario(cuenta, { password = 'segura1234' } = {}) {
  const entrada = await Api.entrarFuncionario(app, {
    username: cuenta.username,
    password,
    claveAcceso: cuenta.clave?.codigo
  });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  return new Api(app, entrada.body.token);
}

describe('V2.11: matriz de los roles integrados', () => {
  test('editar un rol cambia la sesión siguiente y se restablece a fábrica', async () => {
    const admin = await Api.admin(app);

    const recorte = await admin.patch('/api/roles/funcionario').send({
      permisos: ['reportar', 'ver_usuarios']
    });
    assert.equal(recorte.status, 200, JSON.stringify(recorte.body));

    // La cuenta semilla es anterior a las claves obligatorias: permite ver el
    // efecto de la matriz del rol sin que una clave congele los permisos.
    const sinMetricas = await Api.funcionario(app);
    const bloqueado = await sinMetricas.get('/api/stats/panel');
    assert.equal(bloqueado.status, 403, JSON.stringify(bloqueado.body));

    const restablecido = await admin.post('/api/roles/funcionario/restablecer').send({});
    assert.equal(restablecido.status, 200, JSON.stringify(restablecido.body));

    const conMetricas = await Api.funcionario(app);
    const permitido = await conMetricas.get('/api/stats/panel');
    assert.equal(permitido.status, 200, JSON.stringify(permitido.body));
  });

  test('un rol propio hereda la plantilla y aplica su matriz', async () => {
    const admin = await Api.admin(app);
    const creado = await admin.post('/api/roles').send({
      etiqueta: `Supervisor de campo ${sufijo()}`,
      rolPlantilla: 'funcionario',
      territorio: 'municipios',
      permisos: ['reportar', 'ver_usuarios']
    });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));
    assert.equal(creado.body.rol.tipo, 'propio');

    const cuenta = await crearCuenta(admin, { rolPropioId: creado.body.rol.id });
    assert.equal(cuenta.rol, 'funcionario');
    assert.equal(cuenta.rolPropio?.id, creado.body.rol.id);

    const sesion = await sesionFuncionario(cuenta);
    const usuarios = await sesion.get('/api/usuarios');
    assert.equal(usuarios.status, 200, JSON.stringify(usuarios.body));
    const metricas = await sesion.get('/api/stats/panel');
    assert.equal(metricas.status, 403, JSON.stringify(metricas.body));
  });
});

describe('V2.11: límites del funcionario', () => {
  test('no cambia permisos ni contraseñas, no genera claves y solo crea funcionarios', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: {
        ver_usuarios: true,
        crear_usuarios: true,
        editar_usuarios: true
      }
    });
    const otro = await crearCuenta(admin);
    const sesion = await sesionFuncionario(gestor);

    const permisos = await sesion
      .patch(`/api/usuarios/${otro.id}`)
      .send({ permisos: { ver_auditoria: true } });
    assert.equal(permisos.status, 403, JSON.stringify(permisos.body));

    const password = await sesion
      .patch(`/api/usuarios/${otro.id}`)
      .send({ password: 'otra12345' });
    assert.equal(password.status, 403, JSON.stringify(password.body));

    const soporte = await sesion.post('/api/usuarios').send({
      username: `soporte_${sufijo()}`,
      nombre: 'Soporte no permitido',
      rol: 'soporte',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234'
    });
    assert.equal(soporte.status, 403, JSON.stringify(soporte.body));

    const conClave = await sesion.post('/api/usuarios').send({
      username: `clave_${sufijo()}`,
      nombre: 'Funcionario con clave',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234',
      generarClave: true
    });
    assert.equal(conClave.status, 403, JSON.stringify(conClave.body));

    const revelar = await sesion.get(`/api/usuarios/${otro.id}/password`);
    assert.equal(revelar.status, 403, JSON.stringify(revelar.body));

    const crearClave = await sesion.post('/api/admin/claves').send({
      nombre: 'Clave no permitida',
      municipios: [MUNICIPIO_MARAVATIO]
    });
    assert.equal(crearClave.status, 403, JSON.stringify(crearClave.body));
  });
});

describe('V2.11.1: el funcionario solo cambia el nombre y solicita la baja', () => {
  test('al crear una cuenta, el servidor impone funcionario y el territorio del actor', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, crear_usuarios: true, editar_usuarios: true }
    });
    const sesion = await sesionFuncionario(gestor);

    // La creación directa ya no está permitida: el funcionario solo solicita.
    const directa = await sesion.post('/api/usuarios').send({
      username: `nuevo_${sufijo()}`,
      nombre: 'Funcionario nuevo',
      password: 'segura1234',
      municipios: [MORELIA],
      rol: 'funcionario'
    });
    assert.equal(directa.status, 403, JSON.stringify(directa.body));

    const otroRol = await sesion.post('/api/usuarios').send({
      username: `auditor_${sufijo()}`,
      nombre: 'Auditor no permitido',
      rol: 'auditor',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234'
    });
    assert.equal(otroRol.status, 403, JSON.stringify(otroRol.body));
  });

  test('solo puede cambiar el nombre: rol, territorio y estado responden 403', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, editar_usuarios: true }
    });
    const otro = await crearCuenta(admin);
    const sesion = await sesionFuncionario(gestor);

    const nombre = await sesion.patch(`/api/usuarios/${otro.id}`).send({
      nombre: 'Nombre corregido'
    });
    assert.equal(nombre.status, 200, JSON.stringify(nombre.body));
    assert.equal(nombre.body.usuario.nombre, 'Nombre corregido');

    for (const cambio of [
      { rol: 'auditor' },
      { municipios: [MORELIA] },
      { activo: false },
      { correo: `otro-${sufijo()}@ejemplo.mx` }
    ]) {
      const respuesta = await sesion.patch(`/api/usuarios/${otro.id}`).send(cambio);
      assert.equal(respuesta.status, 403, JSON.stringify(respuesta.body));
    }

    const bajaDirecta = await sesion.delete(`/api/usuarios/${otro.id}`);
    assert.equal(bajaDirecta.status, 403, JSON.stringify(bajaDirecta.body));
  });

  test('la solicitud de baja la resuelve la administración', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, editar_usuarios: true }
    });
    const objetivo = await crearCuenta(admin);
    const sesion = await sesionFuncionario(gestor);

    const solicitud = await sesion.post('/api/baja/solicitudes').send({
      usuarioId: objetivo.id,
      motivo: 'La persona ya no trabaja en el municipio'
    });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));

    const bandeja = await admin.get('/api/baja/solicitudes?estado=pendiente');
    assert.equal(bandeja.status, 200, JSON.stringify(bandeja.body));
    assert.ok(
      (bandeja.body.solicitudes || []).some((s) => s.id === solicitud.body.solicitud.id)
    );

    const resuelta = await admin
      .post(`/api/baja/solicitudes/${solicitud.body.solicitud.id}/aprobar`)
      .send({ respuesta: 'Aplicada en el panel' });
    assert.equal(resuelta.status, 200, JSON.stringify(resuelta.body));

    const listado = await admin.get('/api/usuarios');
    const cuenta = (listado.body.usuarios || []).find((u) => u.id === objetivo.id);
    assert.equal(cuenta.activo, false);

    const entrada = await Api.entrarFuncionario(app, {
      username: objetivo.username,
      password: 'segura1234',
      claveMunicipio: MUNICIPIO_MARAVATIO
    });
    assert.notEqual(entrada.status, 200);
  });
});

describe('V2.11: alcance territorial de las estadísticas', () => {
  test('rechaza estados y municipios ajenos y recorta el catálogo', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuenta(admin);
    const sesion = await sesionFuncionario(cuenta);

    const estadoAjeno = await sesion.get('/api/stats/panel?estados=Jalisco');
    assert.equal(estadoAjeno.status, 403, JSON.stringify(estadoAjeno.body));

    const municipioAjeno = await sesion.get(
      `/api/stats/panel?municipios=${ALVARO_OBREGON}`
    );
    assert.equal(municipioAjeno.status, 403, JSON.stringify(municipioAjeno.body));

    const propio = await sesion.get('/api/stats/panel?municipios=16050');
    assert.equal(propio.status, 200, JSON.stringify(propio.body));

    const catalogo = await sesion.get('/api/municipios');
    assert.equal(catalogo.status, 200, JSON.stringify(catalogo.body));
    assert.deepEqual(catalogo.body.alcance.estados, ['Michoacán']);
    assert.ok(catalogo.body.alcance.municipios.includes(MUNICIPIO_MARAVATIO));
    assert.equal(catalogo.body.estados.length, 32);

    const colindantes = await sesion.get(`/api/municipios/${ALVARO_OBREGON}/colindantes`);
    assert.equal(colindantes.status, 403, JSON.stringify(colindantes.body));
  });
});

describe('V2.11: contraseñas consultables', () => {
  test('la administración consulta la contraseña y la consulta queda auditada', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuenta(admin, { password: 'clave12345' });

    const consulta = await admin.get(`/api/usuarios/${cuenta.id}/password?motivo=prueba`);
    assert.equal(consulta.status, 200, JSON.stringify(consulta.body));
    assert.equal(consulta.body.password, 'clave12345');

    const auditoria = await admin.get('/api/admin/auditoria?limite=200');
    assert.equal(auditoria.status, 200, JSON.stringify(auditoria.body));
    const registro = (auditoria.body.registros || []).find(
      (r) => r.accion === 'consulta_password' && String(r.entidadId) === String(cuenta.id)
    );
    assert.ok(registro, 'la consulta debe quedar en la bitácora');
    assert.match(String(registro.detalle || ''), /prueba/);
    assert.doesNotMatch(String(registro.detalle || ''), /clave12345/);
  });

  test('restablecer genera una contraseña nueva que sirve para entrar', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuenta(admin);

    const cambio = await admin.post(`/api/usuarios/${cuenta.id}/password/restablecer`).send({});
    assert.equal(cambio.status, 200, JSON.stringify(cambio.body));
    assert.equal(cambio.body.generada, true);
    assert.ok(String(cambio.body.password).length >= 8);

    const sesion = await sesionFuncionario(cuenta, { password: cambio.body.password });
    const listado = await sesion.get('/api/stats/panel');
    assert.equal(listado.status, 200, JSON.stringify(listado.body));
  });

  test('un admin territorial no consulta cuentas de otro territorio', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuenta(admin);
    const municipal = await crearCuenta(admin, {
      username: `adminmuni_${sufijo()}`,
      rol: 'admin_municipal',
      municipios: [MORELIA],
      password: 'segura1234'
    });

    const entrada = await admin.post('/api/auth/admin').send({
      username: municipal.username,
      password: 'segura1234'
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    const sesion = new Api(app, entrada.body.token);

    const consulta = await sesion.get(`/api/usuarios/${cuenta.id}/password`);
    assert.equal(consulta.status, 403, JSON.stringify(consulta.body));
  });

  test('el personal solicita el cambio y el administrador lo resuelve', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuenta(admin);
    const sesion = await sesionFuncionario(cuenta);

    const solicitud = await sesion.post('/api/password/solicitudes').send({
      motivo: 'Olvidé mi contraseña al cambiar de equipo'
    });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));

    const bandeja = await admin.get('/api/password/solicitudes?estado=pendiente');
    assert.equal(bandeja.status, 200, JSON.stringify(bandeja.body));
    assert.ok(
      (bandeja.body.solicitudes || []).some((s) => s.id === solicitud.body.solicitud.id)
    );

    const resuelta = await admin
      .post(`/api/password/solicitudes/${solicitud.body.solicitud.id}/aprobar`)
      .send({ respuesta: 'Entregada en mano' });
    assert.equal(resuelta.status, 200, JSON.stringify(resuelta.body));
    assert.ok(String(resuelta.body.password).length >= 8);

    const conNueva = await sesionFuncionario(cuenta, { password: resuelta.body.password });
    const listado = await conNueva.get('/api/stats/panel');
    assert.equal(listado.status, 200, JSON.stringify(listado.body));
  });
});

describe('V2.11.2: avisos de baja y contraseña con entrega', () => {
  test('la baja lleva a la cuenta, avisa al solicitante y queda en auditoría', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, editar_usuarios: true }
    });
    const objetivo = await crearCuenta(admin);
    const sesion = await sesionFuncionario(gestor);

    const solicitud = await sesion.post('/api/baja/solicitudes').send({
      usuarioId: objetivo.id,
      motivo: 'La persona dejó de laborar en el municipio'
    });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));
    const idSolicitud = solicitud.body.solicitud.id;

    // El aviso de la administración abre la pestaña Usuarios con la cuenta y
    // la solicitud concretas: es lo que permite aplicar la baja.
    const avisosAdmin = await admin.get('/api/notificaciones');
    const avisoAdmin = (avisosAdmin.body.notificaciones || []).find(
      (n) => n.entidadTipo === 'baja' && String(n.entidadId) === String(idSolicitud)
    );
    assert.ok(avisoAdmin, 'la administración recibe el aviso de baja');
    assert.match(String(avisoAdmin.url), /panel=usuarios/);
    assert.match(String(avisoAdmin.url), new RegExp(`baja=${idSolicitud}`));
    assert.match(String(avisoAdmin.url), new RegExp(`usuario=${objetivo.id}`));

    const resuelta = await admin
      .post(`/api/baja/solicitudes/${idSolicitud}/aprobar`)
      .send({ respuesta: 'Aplicada desde el panel' });
    assert.equal(resuelta.status, 200, JSON.stringify(resuelta.body));

    // Quien la pidió recibe el aviso de que la acción se cumplió.
    const avisosGestor = await sesion.get('/api/notificaciones');
    const avisoGestor = (avisosGestor.body.notificaciones || []).find(
      (n) => n.evento === 'baja_resuelta'
    );
    assert.ok(avisoGestor, 'el solicitante recibe la resolución');
    assert.match(avisoGestor.mensaje, /se cumplió/);

    // La aprobación queda en la bitácora con la cuenta afectada.
    const auditoria = await admin.get('/api/admin/auditoria?limite=300');
    const registro = (auditoria.body.registros || []).find(
      (r) => r.accion === 'baja_aprobada' && String(r.entidadId) === String(objetivo.id)
    );
    assert.ok(registro, 'la baja aprobada queda en auditoría');
    assert.match(String(registro.detalle || ''), new RegExp(idSolicitud));
  });

  test('el funcionario pide la contraseña de otra cuenta y la nueva llega al solicitante', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, editar_usuarios: true }
    });
    const titular = await crearCuenta(admin, { password: 'vieja12345' });
    const sesion = await sesionFuncionario(gestor);

    const solicitud = await sesion
      .post('/api/password/solicitudes')
      .send({ usuarioId: titular.id, motivo: 'Olvidó su contraseña y no puede entrar' });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));
    assert.equal(solicitud.body.solicitud.solicitadoPor, gestor.username);
    const idSolicitud = solicitud.body.solicitud.id;

    // El solicitante ve en «Mis solicitudes» la que pidió para otra cuenta.
    const mias = await sesion.get('/api/password/solicitudes/mias');
    assert.ok(
      (mias.body.solicitudes || []).some(
        (s) => s.id === idSolicitud && s.solicitadoPor === gestor.username
      )
    );

    const resuelta = await admin
      .post(`/api/password/solicitudes/${idSolicitud}/aprobar`)
      .send({ respuesta: 'Entregada desde el panel' });
    assert.equal(resuelta.status, 200, JSON.stringify(resuelta.body));
    const nueva = String(resuelta.body.password);
    assert.ok(nueva.length >= 8);

    // La contraseña nueva se entrega al solicitante por la campana.
    const avisos = await sesion.get('/api/notificaciones');
    const aviso = (avisos.body.notificaciones || []).find(
      (n) => n.evento === 'solicitud_password_resuelta'
    );
    assert.ok(aviso, 'el solicitante recibe la contraseña nueva');
    assert.ok(aviso.mensaje.includes(nueva), 'el aviso incluye la contraseña temporal');

    // El titular ya puede entrar con ella.
    const entra = await Api.entrarFuncionario(app, {
      username: titular.username,
      password: nueva,
      claveAcceso: titular.clave.codigo
    });
    assert.equal(entra.status, 200, JSON.stringify(entra.body));

    // La bitácora registra la aprobación sin guardar la contraseña.
    const auditoria = await admin.get('/api/admin/auditoria?limite=300');
    const registro = (auditoria.body.registros || []).find(
      (r) => r.accion === 'solicitud_password_aprobada' && String(r.entidadId) === String(titular.id)
    );
    assert.ok(registro, 'la resolución queda en auditoría');
    assert.doesNotMatch(String(registro.detalle || ''), new RegExp(nueva));
  });

  test('no se puede pedir la contraseña de una cuenta de otro ámbito', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, editar_usuarios: true }
    });
    const ajeno = await crearCuenta(admin, { municipios: [MORELIA] });
    const sesion = await sesionFuncionario(gestor);

    const respuesta = await sesion
      .post('/api/password/solicitudes')
      .send({ usuarioId: ajeno.id, motivo: 'Intento fuera del ámbito permitido' });
    assert.equal(respuesta.status, 403, JSON.stringify(respuesta.body));
  });
});

describe('V2.11.3: solicitud de alta y reactivación de cuentas', () => {
  test('el funcionario solicita el alta y la administración la aprueba con contraseña', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, crear_usuarios: true }
    });
    const sesion = await sesionFuncionario(gestor);
    const username = `nuevo_${sufijo()}`;
    const correo = `${username}@ejemplo.mx`;

    const solicitud = await sesion.post('/api/alta/solicitudes').send({
      nombre: 'Nueva Funcionaria',
      username,
      correo,
      telefono: '555-123-4567',
      notas: 'Se incorpora al área de obras públicas'
    });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));
    assert.deepEqual(solicitud.body.solicitud.municipios, [MUNICIPIO_MARAVATIO]);

    const bandeja = await admin.get('/api/alta/solicitudes?estado=pendiente');
    assert.equal(bandeja.status, 200, JSON.stringify(bandeja.body));
    assert.ok(
      (bandeja.body.solicitudes || []).some((s) => s.id === solicitud.body.solicitud.id)
    );

    const aprobada = await admin
      .post(`/api/alta/solicitudes/${solicitud.body.solicitud.id}/aprobar`)
      .send({
        respuesta: 'Alta aprobada',
        generarClave: true,
        claveExpiraEn: '2030-12-31'
      });
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));
    assert.equal(aprobada.body.usuario.rol, 'funcionario');
    assert.equal(aprobada.body.usuario.username, username);
    assert.equal(aprobada.body.usuario.correo, correo);
    assert.equal(aprobada.body.usuario.telefono, '555-123-4567');
    assert.deepEqual(aprobada.body.usuario.municipios, [MUNICIPIO_MARAVATIO]);
    const password = String(aprobada.body.password);
    assert.ok(password.length >= 8);

    // La contraseña temporal se entrega al solicitante por la campana.
    const avisos = await sesion.get('/api/notificaciones');
    const aviso = (avisos.body.notificaciones || []).find((n) => n.evento === 'alta_resuelta');
    assert.ok(aviso, 'el solicitante recibe el resultado del alta');
    assert.ok(aviso.mensaje.includes(password), 'el aviso incluye la contraseña temporal');
    assert.ok(aviso.mensaje.includes(username));

    // La cuenta nueva puede entrar.
    const entrada = await Api.entrarFuncionario(app, {
      username,
      password,
      claveAcceso: aprobada.body.clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));

    // Las dos acciones quedan en auditoría.
    const auditoria = await admin.get('/api/admin/auditoria?limite=300');
    const acciones = (auditoria.body.registros || []).map((r) => r.accion);
    assert.ok(acciones.includes('alta_solicitada'));
    assert.ok(acciones.includes('alta_aprobada'));
  });

  test('sin permiso de creación no se pueden pedir altas', async () => {
    const admin = await Api.admin(app);
    const gestor = await crearCuenta(admin, { permisos: { ver_usuarios: true } });
    const sesion = await sesionFuncionario(gestor);
    const respuesta = await sesion.post('/api/alta/solicitudes').send({
      nombre: 'Sin Permiso',
      username: `sinpermiso_${sufijo()}`
    });
    assert.equal(respuesta.status, 403, JSON.stringify(respuesta.body));
  });

  test('la administración reactiva una cuenta dada de baja', async () => {
    const admin = await Api.admin(app);
    const cuenta = await crearCuenta(admin);

    const baja = await admin.delete(`/api/usuarios/${cuenta.id}`);
    assert.equal(baja.status, 200, JSON.stringify(baja.body));

    // Un funcionario con edición no reactiva: la baja y el alta son de la
    // administración.
    const gestor = await crearCuenta(admin, {
      permisos: { ver_usuarios: true, editar_usuarios: true }
    });
    const sesion = await sesionFuncionario(gestor);
    const intento = await sesion.post(`/api/usuarios/${cuenta.id}/reactivar`).send({});
    assert.equal(intento.status, 403, JSON.stringify(intento.body));

    const reactivada = await admin.post(`/api/usuarios/${cuenta.id}/reactivar`).send({});
    assert.equal(reactivada.status, 200, JSON.stringify(reactivada.body));
    assert.equal(reactivada.body.usuario.activo, true);

    const entrada = await Api.entrarFuncionario(app, {
      username: cuenta.username,
      password: 'segura1234',
      claveAcceso: cuenta.clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));

    const auditoria = await admin.get('/api/admin/auditoria?limite=300');
    assert.ok(
      (auditoria.body.registros || []).some(
        (r) => r.accion === 'usuario_reactivado' && String(r.entidadId) === String(cuenta.id)
      )
    );
  });
});
