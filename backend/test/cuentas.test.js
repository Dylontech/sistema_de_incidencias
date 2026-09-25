/**
 * Pruebas del sistema de cuentas: alta y entrada de ciudadanos, elección de
 * firma en cada reporte y gestión de cuentas del personal por el administrador.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, CLAVE_MARAVATIO, MUNICIPIO_MARAVATIO, PUNTO_SIN_ZONA, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const correo = (base) => `${base}@ejemplo.mx`;
/** Los correos no se repiten entre ejecuciones sobre la misma base. */
const correoUnico = (base) => correo(`${base}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`);

describe('Cuentas: registro ciudadano', () => {
  test('se registra con correo y contraseña, y la sesión ya no es anónima', async () => {
    const r = await Api.ciudadano(app, { correo: correoUnico('alta'), nombre: 'Ana Ruiz' });

    const yo = await r.get('/api/auth/me');
    assert.equal(yo.status, 200);
    assert.equal(yo.body.usuario.rol, 'ciudadano');
    assert.equal(yo.body.usuario.nombre, 'Ana Ruiz');
    assert.equal(yo.body.usuario.esAnonimo, false);
    // El correo identifica la cuenta, pero el userKey de sus reportes es opaco
    // (viaja en el listado público, así que no puede ser el correo).
    assert.match(yo.body.usuario.userKey, /^cdad_[0-9a-f]+$/);
    assert.ok(yo.body.usuario.correo.includes('@'));
  });

  test('el nombre generado (pseudónimo) se sortea en el servidor', async () => {
    const r = await Api.ciudadano(app, { correo: correoUnico('pseudo'), pseudonimo: true });

    const yo = await r.get('/api/auth/me');
    assert.equal(yo.body.usuario.rol, 'ciudadano');
    assert.ok(yo.body.usuario.nombre.length > 3);
    // Un pseudónimo es «Sustantivo Adjetivo» (con número opcional), no el
    // nombre de nadie en concreto.
    assert.match(yo.body.usuario.nombre, /^[\p{L}]+ [\p{L}]+( \d{2})?$/u);
    assert.notEqual(yo.body.usuario.nombre, 'Vecina Prueba');
  });

  test('no se admiten dos cuentas con el mismo correo ni correos inválidos', async () => {
    const email = correoUnico('repetido');
    await Api.ciudadano(app, { correo: email });

    const repetido = await Api.registrar(app, { correo: email, password: 'segura1234', nombre: 'Otra' });
    assert.equal(repetido.status, 409);

    const invalido = await Api.registrar(app, {
      correo: 'sin-arroba',
      password: 'segura1234',
      nombre: 'Alguien'
    });
    assert.equal(invalido.status, 400);

    const corta = await Api.registrar(app, {
      correo: correoUnico('corta'),
      password: 'corta',
      nombre: 'Alguien'
    });
    assert.equal(corta.status, 400);
  });

  test('sin nombre real hay que pedir el nombre generado', async () => {
    const sinNombre = await Api.registrar(app, {
      correo: correoUnico('sinnombre'),
      password: 'segura1234'
    });
    assert.equal(sinNombre.status, 400);
  });

  test('la cuenta ciudadana entra con correo y contraseña', async () => {
    const email = correoUnico('entrada');
    await Api.ciudadano(app, { correo: email, nombre: 'Luis Prado' });

    const r = await Api.entrarCiudadano(app, { correo: email, password: 'segura1234' });
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.nombre, 'Luis Prado');

    const mala = await Api.entrarCiudadano(app, { correo: email, password: 'equivocada' });
    assert.equal(mala.status, 401);

    const desconocida = await Api.entrarCiudadano(app, {
      correo: correoUnico('nadie'),
      password: 'segura1234'
    });
    assert.equal(desconocida.status, 401);
  });

  test('un funcionario no entra por la puerta de los ciudadanos', async () => {
    const r = await Api.entrarCiudadano(app, {
      correo: correo('funcionario'),
      password: 'func123'
    });
    assert.equal(r.status, 401);
  });
});

describe('Cuentas: firma de cada reporte', () => {
  test('la cuenta ciudadana decide reporte a reporte si firma o queda anónima', async () => {
    const ciudadano = await Api.ciudadano(app, { correo: correoUnico('firma'), nombre: 'Marta Gil' });

    const firmado = await ciudadano.post('/api/incidencias', incidenciaValida({ titulo: 'Con nombre' }));
    assert.equal(firmado.body.incidencia.esAnonimo, false);
    assert.equal(firmado.body.incidencia.autorNombre, 'Marta Gil');
    assert.equal(firmado.body.incidencia.historial[0].por, 'Marta Gil');

    // Otra ubicación: el sistema rechaza el mismo tipo repetido en el mismo punto.
    const anonimo = await ciudadano.post(
      '/api/incidencias',
      incidenciaValida({ titulo: 'Sin nombre', anonima: true, ...PUNTO_SIN_ZONA })
    );
    assert.equal(anonimo.body.incidencia.esAnonimo, true);
    assert.equal(anonimo.body.incidencia.autorNombre, 'Anónimo');
    // El historial es público: tampoco puede delatar al autor anónimo.
    assert.equal(anonimo.body.incidencia.historial[0].por, 'Anónimo');
    // Aun así el reporte sigue siendo suyo (lo puede editar) y recibe avisos.
    const editado = await ciudadano.put(`/api/incidencias/${anonimo.body.incidencia.id}`, {
      titulo: 'Sin nombre (corregido)'
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.incidencia.esAnonimo, true);

    const notificaciones = await ciudadano.get('/api/notificaciones');
    const suyas = notificaciones.body.notificaciones.filter(
      (n) => n.incidenciaId === anonimo.body.incidencia.id
    );
    assert.ok(suyas.some((n) => n.tipo === 'reporte'));
  });

  test('una sesión anónima siempre reporta sin nombre, aunque pida lo contrario', async () => {
    const anon = await Api.anonimo(app, 'firmaAnonima01');
    const r = await anon.post('/api/incidencias', incidenciaValida({ anonima: false }));

    assert.equal(r.status, 201);
    assert.equal(r.body.incidencia.esAnonimo, true);
    assert.equal(r.body.incidencia.autorNombre, 'Anónimo');
  });

  test('la firma no se puede cambiar al editar un reporte', async () => {
    const ciudadano = await Api.ciudadano(app, { correo: correoUnico('firmafija'), nombre: 'Paz Núñez' });
    const creada = await ciudadano.post('/api/incidencias', incidenciaValida({ titulo: 'Firma fija' }));
    const id = creada.body.incidencia.id;

    const intento = await ciudadano.put(`/api/incidencias/${id}`, { anonima: true, titulo: 'Otra vez' });
    assert.equal(intento.status, 200);
    assert.equal(intento.body.incidencia.esAnonimo, false);
    assert.equal(intento.body.incidencia.autorNombre, 'Paz Núñez');
  });
});

describe('Cuentas: gestión del personal', () => {
  const nuevoFuncionario = () => {
    const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    return {
      username: `func_${sufijo}`,
      nombre: 'Funcionario de Prueba',
      rol: 'funcionario',
      municipioId: MUNICIPIO_MARAVATIO,
      password: 'clave12345'
    };
  };

  test('solo el administrador crea cuentas del personal', async () => {
    const funcionario = await Api.funcionario(app);
    const datos = nuevoFuncionario();

    const intento = await funcionario.post('/api/usuarios', datos);
    assert.equal(intento.status, 403);

    const admin = await Api.admin(app);
    const creada = await admin.post('/api/usuarios', datos);
    assert.equal(creada.status, 201);
    assert.equal(creada.body.usuario.username, datos.username);
    assert.equal(creada.body.usuario.passwordHash, undefined);

    // Y la cuenta nueva puede entrar de verdad.
    const entrada = await Api.entrarFuncionario(app, {
      username: datos.username,
      password: datos.password,
      claveMunicipio: CLAVE_MARAVATIO
    });
    assert.equal(entrada.status, 200);
  });

  test('el listado solo muestra cuentas del personal, nunca ciudadanos', async () => {
    const admin = await Api.admin(app);
    await Api.ciudadano(app, { correo: correoUnico('oculto'), nombre: 'Ciudadana OcultA' });

    const lista = await admin.get('/api/usuarios');
    assert.equal(lista.status, 200);
    assert.ok(lista.body.usuarios.every((u) => u.rol === 'funcionario' || u.rol === 'admin'));
    assert.ok(!lista.body.usuarios.some((u) => u.nombre === 'Ciudadana OcultA'));
    assert.ok(lista.body.usuarios.every((u) => u.passwordHash === undefined));
  });

  test('no se repiten usuarios de acceso ni se admiten contraseñas cortas', async () => {
    const admin = await Api.admin(app);
    const datos = nuevoFuncionario();
    await admin.post('/api/usuarios', datos);

    assert.equal((await admin.post('/api/usuarios', datos)).status, 409);

    const corta = await admin.post('/api/usuarios', { ...nuevoFuncionario(), password: 'corta' });
    assert.equal(corta.status, 400);
  });

  test('un funcionario necesita municipio; el administrador puede no tenerlo', async () => {
    const admin = await Api.admin(app);

    const sinMunicipio = await admin.post('/api/usuarios', {
      ...nuevoFuncionario(),
      municipioId: null
    });
    assert.equal(sinMunicipio.status, 400);

    const otroAdmin = await admin.post('/api/usuarios', {
      username: `adm_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
      nombre: 'Administrador de Prueba',
      rol: 'admin',
      password: 'clave12345'
    });
    assert.equal(otroAdmin.status, 201);
    assert.equal(otroAdmin.body.usuario.municipioId, null);
  });

  test('el administrador edita nombre, rol, estado y contraseña de una cuenta', async () => {
    const admin = await Api.admin(app);
    const datos = nuevoFuncionario();
    const creada = await admin.post('/api/usuarios', datos);
    const id = creada.body.usuario.id;

    const editada = await admin.patch(`/api/usuarios/${id}`, {
      nombre: 'Funcionario Renombrado',
      activo: false,
      password: 'nuevaClave123'
    });
    assert.equal(editada.status, 200);
    assert.equal(editada.body.usuario.nombre, 'Funcionario Renombrado');
    assert.equal(editada.body.usuario.activo, false);
    // El username no se puede cambiar: es la llave de acceso y de autoría.
    assert.equal(editada.body.usuario.username, datos.username);

    const desactivada = await Api.entrarFuncionario(app, {
      username: datos.username,
      password: 'nuevaClave123',
      claveMunicipio: CLAVE_MARAVATIO
    });
    assert.equal(desactivada.status, 401);

    const reactivada = await admin.patch(`/api/usuarios/${id}`, { activo: true });
    assert.equal(reactivada.body.usuario.activo, true);
    const entrada = await Api.entrarFuncionario(app, {
      username: datos.username,
      password: 'nuevaClave123',
      claveMunicipio: CLAVE_MARAVATIO
    });
    assert.equal(entrada.status, 200);
  });

  test('un funcionario no puede editar cuentas y las cuentas ciudadanas quedan fuera', async () => {
    const admin = await Api.admin(app);
    const datos = nuevoFuncionario();
    const creada = await admin.post('/api/usuarios', datos);
    const funcionario = await Api.funcionario(app);

    const intento = await funcionario.patch(`/api/usuarios/${creada.body.usuario.id}`, {
      nombre: 'Secuestro'
    });
    assert.equal(intento.status, 403);

    // Una cuenta ciudadana no es del personal: no se edita desde el panel.
    const ciudadano = await Api.ciudadano(app, { correo: correoUnico('ajeno'), nombre: 'Ciudadano Ajeno' });
    const yo = await ciudadano.get('/api/auth/me');
    const usuarios = await admin.get('/api/usuarios');
    assert.ok(!usuarios.body.usuarios.some((u) => u.id === yo.body.usuario.id));
  });

  test('el panel nunca se queda sin administradores activos', async () => {
    const admin = await Api.admin(app);
    const admins = await admin.get('/api/usuarios');
    const propios = admins.body.usuarios.filter((u) => u.rol === 'admin');

    // La propia cuenta no se puede desactivar (el actor es el usuario admin del
    // token, así que el intento se rechaza).
    const propio = propios.find((u) => u.username === 'admin');
    if (propio) {
      const intento = await admin.patch(`/api/usuarios/${propio.id}`, { activo: false });
      assert.equal(intento.status, 409);
    }
  });
});
