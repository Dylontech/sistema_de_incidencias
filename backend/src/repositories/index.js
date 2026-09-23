/**
 * Fábrica de repositorios.
 * Selecciona el driver según STORAGE_DRIVER ('json' por defecto, 'mysql' con Knex)
 * y expone una única instancia inicializada para toda la aplicación.
 */
import { config } from '../config/index.js';
import { validarContrato } from './contrato.js';

let instancia = null;
let inicializacion = null;

async function crear() {
  if (config.storageDriver === 'mysql') {
    const { RepositorioMysql } = await import('./mysql/repositorio.js');
    return new RepositorioMysql();
  }
  const { RepositorioJson } = await import('./json/repositorio.js');
  return new RepositorioJson();
}

/** Devuelve el repositorio ya inicializado (datos semilla garantizados). */
export async function obtenerRepositorio() {
  if (!instancia) {
    instancia = await crear();
    validarContrato(instancia);
  }
  if (!inicializacion) {
    inicializacion = instancia.inicializar();
  }
  await inicializacion;
  return instancia;
}

/** Inyecta un repositorio propio (usado por las pruebas). */
export function establecerRepositorio(repositorio) {
  instancia = repositorio;
  inicializacion = null;
}

export async function cerrarRepositorio() {
  if (instancia) await instancia.cerrar();
  instancia = null;
  inicializacion = null;
}
