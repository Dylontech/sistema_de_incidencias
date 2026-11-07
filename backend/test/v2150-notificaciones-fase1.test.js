/**
 * V2.15.0 — Fase 1: canal correo, avisos de cuenta y permisos de configuración.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';
import { EVENTOS_NOTIFICACION } from '../src/services/notificaciones.catalogo.js';
import { PERMISOS_POR_ROL } from '../src/config/constantes.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

async function notificacionesDe(api) {
  const respuesta = await api.get('/api/notificaciones');
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  return respuesta.body.notificaciones;
}

describe('V2.15.0 Fase 1: eventos y canal de notificación', () => {
  test('el catálogo declara los eventos de cuenta y reparación', () => {
    for (const evento of [
      'cuenta_verificada',
      'cuenta_correo_cambiado',
      'cuenta_password_cambiada',
      'cuenta_congelada',
      'cuenta_eliminada',
      'seguridad_alerta',
      'reparacion_asignada',
      'reparacion_iniciada',
      'reparacion_terminada',
      'reparacion_documentos',
      'reparacion_validada'
    ]) {
      assert.ok(EVENTOS_NOTIFICACION[evento], `Falta el evento ${evento}`);
    }
  });

  test('configurar_notificaciones queda solo en el administrador maestro', () => {
    for (const [rol, permisos] of Object.entries(PERMISOS_POR_ROL)) {
      if (rol === 'admin') continue;
      assert.ok(
        !permisos.includes('configurar_notificaciones'),
        `${rol} no debe tener configuración global de avisos`
      );
    }
    assert.ok(PERMISOS_POR_ROL.admin.includes('configurar_notificaciones'));
  });

  test('el canal correo no crea una notificación en la campana', async () => {
    // La preferencia de canal se prueba con una cuenta de soporte que sí
    // tiene correo; el admin de la semilla no tiene uno y el sistema usa la
    // campana como respaldo para no perder el aviso.
    const admin = await Api.admin(app);
    const username = `soporte-canal-${Date.now().toString(36)}`;
    const alta = await admin.post('/api/usuarios').send({
      username,
      nombre: 'Sofía Canal',
      correo: `${username}@ejemplo.mx`,
      rol: 'soporte',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234',
      generarClave: true,
      claveExpiraEn: '2030-12-31'
    });
    assert.equal(alta.status, 201, JSON.stringify(alta.body));
    const entrada = await Api.entrarFuncionario(app, {
      username,
      password: 'segura1234',
      claveAcceso: alta.body.clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    const soporte = new Api(app, entrada.body.token);

    const preferencias = await soporte.put('/api/notificaciones/preferencias').send({
      modo: 'asignados',
      eventos: { ticket_asignado: 'correo' }
    });
    assert.equal(preferencias.status, 200, JSON.stringify(preferencias.body));

    const ciudadano = await Api.ciudadanoConCuenta(app);
    const ticket = await ciudadano.api.post('/api/tickets').send({
      asunto: 'Prueba de canal correo',
      cuerpo: 'Quiero comprobar que el aviso de asignación sale solo por correo.',
      prioridad: 'media'
    });
    assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
    const asignado = await admin
      .patch(`/api/tickets/${ticket.body.ticket.id}/asignacion`)
      .send({ asignadoA: username, nota: 'Prueba de canal' });
    assert.equal(asignado.status, 200, JSON.stringify(asignado.body));

    assert.ok(
      !(await notificacionesDe(soporte)).some((n) => n.evento === 'ticket_asignado'),
      'El canal correo no debe crear fila in-app'
    );
  });

  test('cambiar la contraseña avisa al titular y genera alerta de seguridad', async () => {
    const admin = await Api.admin(app);
    const ciudadano = await Api.ciudadanoConCuenta(app, { password: 'segura1234' });

    const cambio = await ciudadano.api.post('/api/cuenta/password').send({
      passwordActual: 'segura1234',
      passwordNueva: 'nuevaSegura123'
    });
    assert.equal(cambio.status, 200, JSON.stringify(cambio.body));

    const reingreso = await Api.entrarCiudadano(app, {
      nombre: ciudadano.usuario.nombre,
      password: 'nuevaSegura123'
    });
    assert.equal(reingreso.status, 200, JSON.stringify(reingreso.body));
    const titular = new Api(app, reingreso.body.token);
    assert.ok(
      (await notificacionesDe(titular)).some((n) => n.evento === 'cuenta_password_cambiada'),
      'El titular debe recibir el aviso de contraseña'
    );

    assert.ok(
      (await notificacionesDe(admin)).some((n) => n.evento === 'seguridad_alerta'),
      'La administración debe recibir la alerta de seguridad'
    );
  });
});
