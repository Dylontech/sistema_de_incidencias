/** Permisos de avisos por clave: alcance territorial y revocación independiente. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const { emitir } = await import('../src/services/notificaciones.service.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Avisos por clave', () => {
  test('el alcance configurado filtra los avisos y se revoca sin invalidar la clave', async () => {
    const admin = await Api.admin(app);
    const creada = await admin.post('/api/admin/claves').send({
      nombre: 'Avisos de prueba',
      municipios: ['16050', '11001'],
      rolSugerido: 'funcionario'
    });
    assert.equal(creada.status, 201);
    const clave = creada.body.clave;

    const configurada = await admin
      .put(`/api/admin/claves/${clave.id}/notificaciones`)
      .send({ activo: true, municipios: ['16050'] });
    assert.equal(configurada.status, 200);
    assert.deepEqual(configurada.body.notificaciones.municipios, ['16050']);

    const entrada = await Api.entrarFuncionario(app, {
      username: 'funcionario',
      password: 'func123',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200);
    const funcionario = new Api(app, entrada.body.token);
    assert.equal((await funcionario.get('/api/auth/me')).status, 200);

    const repositorio = await obtenerRepositorio();
    const ligeros = await repositorio.municipiosLigeros();
    assert.ok(ligeros.length > 0);
    const maravatio = ligeros.find((m) => m.id === '16050');
    assert.ok(maravatio);
    assert.equal(typeof maravatio.nombre, 'string');
    assert.equal(typeof maravatio.estado, 'string');
    assert.equal('poligono' in maravatio, false);
    const sufijo = Date.now().toString(36);
    const dentro = await emitir(repositorio, {
      evento: 'prueba_notificacion',
      titulo: `Aviso dentro ${sufijo}`,
      mensaje: 'Maravatío está dentro del alcance.',
      paraUsuarios: ['funcionario'],
      municipioId: '16050',
      claveDedupe: `aviso-dentro-${sufijo}`
    });
    assert.equal(dentro, 1);

    const fuera = await emitir(repositorio, {
      evento: 'prueba_notificacion',
      titulo: `Aviso fuera ${sufijo}`,
      mensaje: 'Abasolo está fuera del alcance.',
      paraUsuarios: ['funcionario'],
      municipioId: '11001',
      claveDedupe: `aviso-fuera-${sufijo}`
    });
    assert.equal(fuera, 0);

    const { notificaciones } = (await funcionario.get('/api/notificaciones')).body;
    assert.ok(notificaciones.some((n) => n.titulo === `Aviso dentro ${sufijo}`));
    assert.ok(!notificaciones.some((n) => n.titulo === `Aviso fuera ${sufijo}`));

    const revocada = await admin.post(`/api/admin/claves/${clave.id}/notificaciones/revocar`, {});
    assert.equal(revocada.status, 200);
    assert.equal(revocada.body.notificaciones.activo, false);

    const revocado = await emitir(repositorio, {
      evento: 'prueba_notificacion',
      titulo: `Aviso revocado ${sufijo}`,
      mensaje: 'La clave sigue activa, pero sus avisos están revocados.',
      paraUsuarios: ['funcionario'],
      municipioId: '16050',
      claveDedupe: `aviso-revocado-${sufijo}`
    });
    assert.equal(revocado, 0);
    assert.equal((await funcionario.get('/api/auth/me')).status, 200);

    const reactivada = await admin.post(
      `/api/admin/claves/${clave.id}/notificaciones/reactivar`,
      {}
    );
    assert.equal(reactivada.status, 200);
    assert.equal(reactivada.body.notificaciones.activo, true);
  });
});
