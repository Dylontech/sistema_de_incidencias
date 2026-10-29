/** Pruebas del directorio de correos institucionales. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntorno, prepararBaseDeDatos } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
let admin;

before(() => {
  app = crearApp();
});

after(async () => {
  await entorno.limpiar();
});

describe('Correos institucionales', () => {
  test('el admin registra, busca y evita duplicados', async () => {
    admin = await Api.admin(app);
    const creado = await admin.post('/api/admin/correos-institucionales', {
      estado: 'Michoacán',
      municipioId: MUNICIPIO_MARAVATIO,
      dependencia: 'Ayuntamiento de Maravatío',
      cargo: 'Atención ciudadana',
      correo: 'contacto@maravatio.gob.mx',
      verificado: true
    });
    assert.equal(creado.status, 201, JSON.stringify(creado.body));

    const duplicado = await admin.post('/api/admin/correos-institucionales', {
      estado: 'Michoacán',
      municipioId: MUNICIPIO_MARAVATIO,
      correo: 'contacto@maravatio.gob.mx'
    });
    assert.equal(duplicado.status, 409);

    const busqueda = await admin.get(
      '/api/admin/correos-institucionales?texto=maravatio&verificado=si'
    );
    assert.equal(busqueda.status, 200);
    assert.equal(busqueda.body.total, 1);
    assert.equal(busqueda.body.correos[0].verificado, true);
  });

  test('importa CSV, exporta y llena búsquedas asistidas', async () => {
    const importado = await admin.post('/api/admin/correos-institucionales/importar', {
      csv: [
        'estado,municipio_id,dependencia,cargo,correo,telefono,fuente_url,notas',
        'Michoacán,16053,Obras Públicas,Director,obras@zj.gob.mx,5551234567,https://ejemplo.mx,Importado',
        'Michoacán,16050,Ayuntamiento,Secretaría,contacto@maravatio.gob.mx,,,Duplicado'
      ].join('\n')
    });
    assert.equal(importado.status, 201, JSON.stringify(importado.body));
    assert.equal(importado.body.creados, 1);
    assert.equal(importado.body.errores.length, 1);

    const exportado = await admin.get('/api/admin/correos-institucionales/exportar');
    assert.equal(exportado.status, 200);
    assert.match(exportado.headers['content-type'], /text\/csv/);
    const csv = exportado.text || Buffer.from(exportado.body || '').toString('utf8');
    assert.match(csv, /obras@zj\.gob\.mx/);

    const busquedas = await admin.get(
      `/api/admin/correos-institucionales/busquedas?municipioId=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(busquedas.status, 200);
    assert.ok(busquedas.body.consultas.length >= 3);
    assert.match(busquedas.body.consultas[0].google, /google\.com\/search/);
  });

  test('invita a los correos registrados y registra la fecha de invitación', async () => {
    const invitacion = await admin.post('/api/admin/correos-institucionales/invitar', {
      municipioId: MUNICIPIO_MARAVATIO,
      asunto: 'Invitación de prueba',
      mensaje: 'Conoce el sistema municipal.'
    });
    assert.equal(invitacion.status, 200, JSON.stringify(invitacion.body));
    assert.ok(invitacion.body.enviados >= 1);

    const lista = await admin.get(`/api/admin/correos-institucionales?municipioId=${MUNICIPIO_MARAVATIO}`);
    const invitado = lista.body.correos.find((c) => c.correo === 'contacto@maravatio.gob.mx');
    assert.ok(invitado.invitadoEn);
    assert.ok(invitado.ultimaInvitacionEn);
  });

  test('un funcionario no accede al directorio', async () => {
    const funcionario = await Api.funcionario(app);
    const respuesta = await funcionario.get('/api/admin/correos-institucionales');
    assert.equal(respuesta.status, 403);
  });
});
