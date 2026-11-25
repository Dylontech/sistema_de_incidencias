import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const codigo = fs.readFileSync(new URL('../../frontend/js/core/offline.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');

/** Doble de IndexedDB con confirmación separada del éxito de la solicitud. */
function entornoOffline() {
  const registros = new Map();
  const estado = { identidad: 'autor', ahora: 1000000, abortar: false, cerradas: 0 };
  const servicio = {
    crear: async () => ({}),
    subirEvidencia: async () => [{ url: '/uploads/nueva.jpg' }]
  };
  const indexedDB = {
    open() {
      const apertura = {};
      setImmediate(() => {
        apertura.result = {
          close() { estado.cerradas++; },
          transaction() {
            const transaccion = {
              objectStore() {
                function solicitud(accion) {
                  const req = {};
                  const copia = new Map(structuredClone([...registros]));
                  setImmediate(() => {
                    req.result = accion(copia);
                    req.onsuccess?.();
                    setImmediate(() => {
                      if (estado.abortar) {
                        estado.abortar = false;
                        transaccion.error = new Error('Transacción abortada');
                        transaccion.onabort?.();
                      } else {
                        registros.clear();
                        copia.forEach((v, k) => registros.set(k, v));
                        transaccion.oncomplete?.();
                      }
                    });
                  });
                  return req;
                }
                return {
                  put: (registro) => solicitud((copia) => { copia.set(registro.id, structuredClone(registro)); return registro.id; }),
                  getAll: () => solicitud((copia) => [...copia.values()]),
                  delete: (id) => solicitud((copia) => { copia.delete(id); })
                };
              }
            };
            return transaccion;
          }
        };
        apertura.onsuccess();
      });
      return apertura;
    }
  };
  class Reloj extends Date { static now() { return estado.ahora; } }
  const contexto = vm.createContext({
    indexedDB, crypto: webcrypto, Date: Reloj,
    navigator: { onLine: true }, document: { getElementById: () => null },
    token: { leer: () => estado.identidad, propietario: (valor = estado.identidad) => valor || null },
    incidenciasService: servicio, toast() {}
  });
  vm.runInContext(codigo, contexto);
  return { registros, estado, servicio, api: contexto };
}

test('la cola conserva reportes después de varios 500, 429 y 401', async () => {
  for (const codigoError of [500, 429, 401]) {
    const e = entornoOffline();
    const guardado = await e.api.encolarReporte({ titulo: 'Pendiente' });
    e.servicio.crear = async () => { throw Object.assign(new Error('Fallo recuperable'), { estado: codigoError }); };
    for (let n = 0; n < 4; n++) {
      await e.api.sincronizar();
      e.estado.ahora += 3600001;
    }
    assert.ok(e.registros.has(guardado.id));
    assert.equal(e.registros.get(guardado.id).intentos, 4);
  }
});

test('otra cuenta no envía los pendientes y los registros antiguos sin autor se conservan', async () => {
  const e = entornoOffline();
  await e.api.encolarReporte({ titulo: 'De A' });
  e.registros.set('antiguo', { id: 'antiguo', datos: { titulo: 'Sin propietario' } });
  e.estado.identidad = 'otra-cuenta';
  let envios = 0;
  e.servicio.crear = async () => { envios++; };
  await e.api.sincronizar();
  assert.equal(envios, 0);
  assert.equal(e.registros.size, 2);
  e.estado.identidad = 'autor';
  await e.api.sincronizar();
  assert.equal(envios, 1);
  assert.ok(e.registros.has('antiguo'));
});

test('un cambio de cuenta durante la subida conserva el pendiente para su propietario', async () => {
  const e = entornoOffline();
  await e.api.encolarReporte({ titulo: 'De A' }, ['foto']);
  e.servicio.subirEvidencia = async (_fotos, opciones) => {
    assert.equal(opciones.tokenSesion, 'autor');
    e.estado.identidad = 'otra-cuenta';
    return [{ url: '/uploads/foto.jpg' }];
  };
  e.servicio.crear = async () => assert.fail('No debe enviarse tras cambiar la sesión');
  await e.api.sincronizar();
  assert.equal(e.registros.size, 1);
  assert.equal([...e.registros.values()][0].propietario, 'autor');
});

test('los reintentos conservan la evidencia anterior, reutilizan fotos subidas y la misma clave', async () => {
  const e = entornoOffline();
  const guardado = await e.api.encolarReporte({
    titulo: 'Fotos', claveIdempotencia: 'envio-original', evidencia: [{ url: '/uploads/anterior.jpg' }]
  }, ['foto']);
  let subidas = 0;
  let envios = 0;
  e.servicio.subirEvidencia = async () => { subidas++; return [{ url: '/uploads/nueva.jpg' }]; };
  e.servicio.crear = async (datos, opciones) => {
    assert.equal(opciones.tokenSesion, 'autor');
    assert.equal(datos.claveIdempotencia, 'envio-original');
    assert.deepEqual(Array.from(datos.evidencia, (f) => f.url), ['/uploads/anterior.jpg', '/uploads/nueva.jpg']);
    if (++envios === 1) throw Object.assign(new Error('Temporal'), { estado: 500 });
  };
  await e.api.sincronizar();
  assert.ok(e.registros.has(guardado.id));
  e.estado.ahora += 3600001;
  await e.api.sincronizar();
  assert.equal(subidas, 1);
  assert.equal(envios, 2);
  assert.equal(e.registros.size, 0);
});

test('un aborto de IndexedDB rechaza el guardado aunque la solicitud haya tenido éxito', async () => {
  const e = entornoOffline();
  e.estado.abortar = true;
  await assert.rejects(e.api.encolarReporte({ titulo: 'No confirmado' }), /abortada/);
  assert.equal(e.registros.size, 0);
  assert.equal(e.estado.cerradas, 1);
});
