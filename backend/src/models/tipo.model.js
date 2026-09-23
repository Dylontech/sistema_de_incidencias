/**
 * MODELO: Tipo de incidencia.
 * Los 16 tipos base son datos semilla y no se pueden eliminar;
 * los creados desde el panel (`custom: true`) sí.
 */
import { LIMITES_TEXTO } from '../config/constantes.js';
import { recolector, normalizarBusqueda } from '../utils/validacion.js';
import { nuevoIdConPrefijo } from '../utils/ids.js';

export function validarEntrada(datos = {}) {
  const v = recolector();
  const nombre = v.texto(datos.nombre, 'nombre', { requerido: true, max: LIMITES_TEXTO.nombreTipo });
  const icono = v.texto(datos.icono, 'icono', { requerido: true, max: 24 });
  v.terminar();
  return { nombre, icono };
}

export function construirTipo({ nombre, icono }) {
  return {
    id: nuevoIdConPrefijo('custom'),
    nombre,
    icono,
    custom: true
  };
}

export function esPersonalizado(tipo) {
  return tipo.custom === true;
}

/** ¿Ya existe un tipo con ese nombre? (sin distinguir mayúsculas ni acentos) */
export function nombreRepetido(tipos, nombre, idExcluir = null) {
  const objetivo = normalizarBusqueda(nombre);
  return tipos.some((t) => t.id !== idExcluir && normalizarBusqueda(t.nombre) === objetivo);
}

export function buscar(tipos, id) {
  return tipos.find((t) => t.id === id) || null;
}
