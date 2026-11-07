/**
 * V2.12.0: avisos de vencimiento y renovación de claves.
 *
 * Comprueba los umbrales 30/20/10/5/0, que no se repitan los avisos del mismo
 * ciclo, que la renovación abra un ciclo nuevo y que el funcionario pueda pedir
 * la renovación desde su cuenta.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
process.env.AVISOS_CLAVES_ACTIVO = 'true';
process.env.AVISOS_CLAVES_DIAS = '30,20,10,5,0';
await prepararBaseDeDatos(entorno);

const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');
const { avisarVencimientos, diasHastaVencimiento } = await import(
  '../src/services/avisos-clave.service.js'
);

const DIA = 24 * 60 * 60 * 1000;
let app;
let repositorio;
let admin;
let clave;
let cuenta;

before(async () => {
  app = crearApp();
  repositorio = await obtenerRepositorio();
  admin = await Api.admin(app);

  const expira = new Date(Date.now() + 40 * DIA).toISOString().slice(0, 10);
  const alta = await admin.post('/api/usuarios').send({
    username: `aviso_${Date.now().toString(36)}`,
    nombre: 'Funcionario con aviso',
    rol: 'funcionario',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: expira
  });
  assert.equal(alta.status, 201, JSON.stringify(alta.body));
  clave = alta.body.clave;
  cuenta = alta.body.usuario;
});
after(() => entorno.limpiar());

async function avisosDe() {
  const lista = await repositorio.notificacionesDe(cuenta.username);
  return (lista || []).filter(
    (notificacion) =>
      notificacion.evento === 'clave_por_vencer' &&
      String(notificacion.entidadId) === String(clave.id)
  );
}

function fechaLocal(valor) {
  const fecha = new Date(valor);
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

function ahoraPara(diasAntes, expiraEn) {
  const base = new Date(expiraEn);
  base.setHours(12, 0, 0, 0);
  return new Date(base.getTime() - diasAntes * DIA);
}

describe('V2.12.0: avisos de vencimiento de claves', () => {
  test('avisa en 30, 20, 10, 5 y 0 días sin repetir el mismo umbral', async () => {
    for (const dias of [30, 20, 10, 5, 0]) {
      const ahora = ahoraPara(dias, clave.expiraEn);
      const primera = await avisarVencimientos(repositorio, { ahora });
      assert.ok(primera.avisos >= 1, `debe avisar a ${dias} días`);
      const repetida = await avisarVencimientos(repositorio, { ahora });
      assert.equal(repetida.avisos, 0, `no debe repetir el aviso de ${dias} días`);
    }

    const lista = await avisosDe();
    assert.equal(lista.length, 5);
    assert.ok(lista.some((n) => n.mensaje.includes('vence hoy')));
  });
});

describe('V2.12.0: cupo de las claves', () => {
  test('una clave con cupo 1 no permite vincular una segunda cuenta', async () => {
    const expira = new Date(Date.now() + 120 * DIA).toISOString().slice(0, 10);
    const creada = await admin.post('/api/admin/claves').send({
      nombre: 'Cupo de una persona',
      municipios: [MUNICIPIO_MARAVATIO],
      rolSugerido: 'funcionario',
      usosMaximos: 1,
      expiraEn: expira
    });
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    const limitada = creada.body.clave;

    const primera = await admin.post('/api/usuarios').send({
      username: `cupo_uno_${Date.now().toString(36)}`,
      nombre: 'Primera cuenta del cupo',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234',
      claveId: limitada.id
    });
    assert.equal(primera.status, 201, JSON.stringify(primera.body));

    const segunda = await admin.post('/api/usuarios').send({
      username: `cupo_dos_${Date.now().toString(36)}`,
      nombre: 'Segunda cuenta del cupo',
      rol: 'funcionario',
      municipios: [MUNICIPIO_MARAVATIO],
      password: 'segura1234',
      claveId: limitada.id
    });
    assert.equal(segunda.status, 409, JSON.stringify(segunda.body));
    assert.match(String(segunda.body.error), /cupo/i);
  });
});

describe('V2.12.0: renovación de claves', () => {
  test('renovar extiende la vigencia y abre un ciclo nuevo de avisos', async () => {
    const nuevaFecha = new Date(Date.now() + 70 * DIA).toISOString().slice(0, 10);
    const renovada = await admin.post(`/api/admin/claves/${clave.id}/renovar`).send({
      expiraEn: nuevaFecha,
      usosMaximos: 5
    });
    assert.equal(renovada.status, 200, JSON.stringify(renovada.body));
    assert.equal(fechaLocal(renovada.body.clave.expiraEn), nuevaFecha);
    assert.ok(renovada.body.cuentas >= 1);

    const recargada = await repositorio.claveAccesoPorId(clave.id);
    assert.equal(fechaLocal(recargada.expiraEn), nuevaFecha);

    // El ciclo anterior queda cerrado: el nuevo umbral vuelve a avisar.
    const nuevaFechaCompleta = recargada.expiraEn;
    const ahoraNuevo = ahoraPara(30, nuevaFechaCompleta);
    assert.equal(diasHastaVencimiento(nuevaFechaCompleta, ahoraNuevo), 30);
    const conNuevoCiclo = await avisarVencimientos(repositorio, {
      ahora: ahoraNuevo
    });
    assert.ok(conNuevoCiclo.avisos >= 1);
    const guardados = await avisosDe();
    assert.equal(guardados.length, 6);
  });

  test('el funcionario solicita la renovación y la administración la aprueba', async () => {
    const entrada = await Api.entrarFuncionario(app, {
      username: cuenta.username,
      password: 'segura1234',
      claveAcceso: clave.codigo
    });
    assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
    const sesion = new Api(app, entrada.body.token);

    const solicitada = await sesion
      .post('/api/cuenta/clave/solicitar-renovacion')
      .send({ motivo: 'La clave vence pronto' });
    assert.equal(solicitada.status, 201, JSON.stringify(solicitada.body));

    const duplicada = await sesion
      .post('/api/cuenta/clave/solicitar-renovacion')
      .send({ motivo: 'Otra vez' });
    assert.equal(duplicada.status, 409);

    const pendientes = await admin.get('/api/admin/claves/renovaciones?estado=pendiente');
    assert.equal(pendientes.status, 200, JSON.stringify(pendientes.body));
    const solicitud = pendientes.body.solicitudes.find(
      (s) => s.solicitadoPor === cuenta.username
    );
    assert.ok(solicitud);

    const nuevaFecha = new Date(Date.now() + 90 * DIA).toISOString().slice(0, 10);
    const aprobada = await admin
      .post(`/api/admin/claves/renovaciones/${solicitud.id}/aprobar`)
      .send({ expiraEn: nuevaFecha });
    assert.equal(aprobada.status, 200, JSON.stringify(aprobada.body));
    assert.equal(aprobada.body.solicitud.estado, 'aprobada');

    const guardada = await repositorio.usuarioPorId(cuenta.id);
    assert.equal(fechaLocal(guardada.claveVigenteHasta), nuevaFecha);

    const avisos = await repositorio.notificacionesDe(cuenta.username);
    assert.ok(avisos.some((n) => n.evento === 'clave_renovada'));
  });
});
