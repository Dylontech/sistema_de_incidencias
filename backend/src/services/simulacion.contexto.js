/** Contexto por petición para escribir datos de simulación sin efectos externos. */
import { AsyncLocalStorage } from 'node:async_hooks';

const almacen = new AsyncLocalStorage();

export function contextoSimulacion() {
  return almacen.getStore() || null;
}

export function ejecutarEnSimulacion(datos, funcion) {
  return almacen.run(datos, funcion);
}
