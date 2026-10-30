/** Pruebas de las mejoras V2.3: fichas, roles, permisos, estadísticas y publicidad. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntorno, prepararBaseDeDatos } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
let admin;
let funcionario;

before(async () => {
  app = crearApp();
  admin = await Api.admin(app);
  funcionario = await Api.funcionario(app);
});

after(async () => {
  await entorno.limpiar();
});

describe('Mejoras V2.3', () => {
  test('la geolocalización detecta el municipio que contiene el punto', async () => {
    const detalle = await admin.get(`/api/municipios/${MUNICIPIO_MARAVATIO}`);
    assert.equal(detalle.status, 200);
    const [lat, lng] = detalle.body.municipio.center;
    const ubicacion = await admin.get(`/api/municipios/ubicacion?lat=${lat}&lng=${lng}`);
    assert.equal(ubicacion.status, 200, JSON.stringify(ubicacion.body));
    assert.equal(ubicacion.body.municipio.id, MUNICIPIO_MARAVATIO);
  });

  test('el funcionario propone la ficha de su municipio y el admin la aprueba', async () => {
    const guardada = await funcionario.put(`/api/municipios/${MUNICIPIO_MARAVATIO}/ficha`, {
      telefono: '447 123 4567',
      correo: 'contacto@maravatio.gob.mx',
      sitioWeb: 'https://maravatio.gob.mx',
      notas: 'Ventanilla de obras públicas'
    });
    assert.equal(guardada.status, 200, JSON.stringify(guardada.body));
    assert.equal(guardada.body.ficha.estado, 'pendiente');

    const pendiente = await funcionario.get(`/api/municipios/${MUNICIPIO_MARAVATIO}/ficha`);
    assert.equal(pendiente.body.ficha.estado, 'pendiente');
    assert.equal(pendiente.body.puedeAprobar, false);

    const aprobada = await admin.post(`/api/municipios/${MUNICIPIO_MARAVATIO}/ficha/aprobar`, {});
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));
    assert.equal(aprobada.body.ficha.estado, 'aprobado');

    const resumen = await admin.get('/api/admin/municipios/resumen');
    const maravatio = resumen.body.municipios.find((m) => m.id === MUNICIPIO_MARAVATIO);
    assert.equal(maravatio.fichaEstado, 'aprobado');
  });

  test('crea roles especiales y los asigna a una cuenta compatible', async () => {
    const rol = await admin.post('/api/roles-especiales', {
      nombre: 'Gestor de usuarios municipal',
      descripcion: 'Puede dar de alta personal de su municipio',
      rolBase: 'funcionario',
      permisos: ['gestionar_usuarios']
    });
    assert.equal(rol.status, 201, JSON.stringify(rol.body));
    assert.ok(rol.body.rol.id);

    const alta = await admin.post('/api/usuarios', {
      username: `especial_${Date.now().toString(36)}`,
      nombre: 'Cuenta con rol especial',
      password: 'segura1234',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      rolPersonalizadoId: rol.body.rol.id
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));
    assert.equal(alta.body.usuario.rolPersonalizadoId, rol.body.rol.id);
    assert.ok(alta.body.usuario.permisosEfectivos.includes('gestionar_usuarios'));

    const listado = await admin.get('/api/roles-especiales');
    const encontrado = listado.body.roles.find((r) => r.id === rol.body.rol.id);
    assert.equal(encontrado.cuentas, 1);
  });

  test('una solicitud de permisos se aprueba y surte efecto sin esperar al token', async () => {
    const solicitud = await funcionario.post('/api/permisos/solicitudes', {
      permisos: ['gestionar_claves', 'gestionar_usuarios'],
      motivo: 'Necesito generar claves y dar de alta al personal de mi municipio'
    });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));
    assert.equal(solicitud.body.solicitud.estado, 'pendiente');

    const pendientes = await admin.get('/api/permisos/solicitudes?estado=pendiente');
    const encontrada = pendientes.body.solicitudes.find(
      (s) => s.id === solicitud.body.solicitud.id
    );
    assert.ok(encontrada);

    const aprobada = await admin.post(
      `/api/permisos/solicitudes/${solicitud.body.solicitud.id}/aprobar`,
      { respuesta: 'Aprobado para gestionar claves' }
    );
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));

    // El middleware recarga la cuenta y sus permisos en cada petición.
    const claves = await funcionario.get('/api/admin/claves');
    assert.equal(claves.status, 200, JSON.stringify(claves.body));

    const alta = await funcionario.post('/api/usuarios', {
      username: `gestor_${Date.now().toString(36)}`,
      nombre: 'Cuenta creada por gestor municipal',
      password: 'segura1234',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO]
    });
    // V2.11.3: el alta directa es de la administración; el permiso sirve para
    // solicitar la creación de la cuenta.
    assert.equal(alta.status, 403, JSON.stringify(alta.body));

    const solicitudAlta = await funcionario.post('/api/alta/solicitudes', {
      nombre: 'Cuenta solicitada por gestor municipal',
      username: `gestor_${Date.now().toString(36)}`
    });
    assert.equal(solicitudAlta.status, 201, JSON.stringify(solicitudAlta.body));

    const intentoAdmin = await funcionario.post('/api/usuarios', {
      username: `gestor_admin_${Date.now().toString(36)}`,
      nombre: 'Intento de administrador',
      password: 'segura1234',
      rol: 'admin'
    });
    assert.equal(intentoAdmin.status, 403, JSON.stringify(intentoAdmin.body));
  });

  test('las estadísticas aceptan varios municipios y devuelven tiempos y comparación', async () => {
    const respuesta = await admin.get(
      `/api/stats/panel?municipios=${MUNICIPIO_MARAVATIO}&estados=Michoac%C3%A1n`
    );
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    assert.ok(Array.isArray(respuesta.body.comparativo));
    assert.ok(Array.isArray(respuesta.body.comparativoEstados));
    assert.ok(respuesta.body.tiempos);
    assert.equal(typeof respuesta.body.tiempos.promedio, 'number');
  });

  test('publicidad guarda colores, estructura y permite editar', async () => {
    const generada = await admin.post('/api/admin/publicidad/generar', {
      red: 'facebook',
      plantilla: 'reportar',
      estructura: 'paso_a_paso',
      municipioId: MUNICIPIO_MARAVATIO,
      titulo: 'Reporta en tu municipio',
      texto: 'Abre el sistema y elige el tipo de problema.',
      cta: 'Reporta aquí',
      colorPrimario: '#123456',
      colorSecundario: '#654321',
      enlace: 'http://localhost:3001/'
    });
    assert.equal(generada.status, 201, JSON.stringify(generada.body));
    assert.equal(generada.body.publicacion.colorPrimario, '#123456');
    assert.equal(generada.body.publicacion.estructura, 'paso_a_paso');
    assert.ok(generada.body.publicacion.cuerpo.includes('Abre el sistema'));

    const editada = await admin.patch(
      `/api/admin/publicidad/${generada.body.publicacion.id}`,
      { titulo: 'Título editado', colorPrimario: '#abcdef' }
    );
    assert.equal(editada.status, 200, JSON.stringify(editada.body));
    assert.equal(editada.body.publicacion.titulo, 'Título editado');
    assert.equal(editada.body.publicacion.colorPrimario, '#abcdef');
  });

  test('un correo verificado se asigna a la clave de su municipio', async () => {
    const correo = await admin.post('/api/admin/correos-institucionales', {
      correo: 'enlace@maravatio.gob.mx',
      estado: 'Michoacán',
      municipioId: MUNICIPIO_MARAVATIO,
      dependencia: 'Ayuntamiento',
      verificado: true
    });
    assert.equal(correo.status, 201, JSON.stringify(correo.body));

    const asignada = await admin.post(
      `/api/admin/correos-institucionales/${correo.body.correo.id}/asignar-clave`,
      {}
    );
    assert.equal(asignada.status, 200, JSON.stringify(asignada.body));
    assert.equal(asignada.body.clave.correoContacto, 'enlace@maravatio.gob.mx');

    const claves = await admin.get('/api/admin/claves');
    assert.ok(
      claves.body.claves.some((c) => c.correoContacto === 'enlace@maravatio.gob.mx')
    );
  });
});
