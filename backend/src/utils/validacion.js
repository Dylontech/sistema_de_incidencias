import { AppError } from './AppError.js';

/**
 * Recolector de errores de validación.
 * Permite validar varios campos y devolver todos los fallos en una sola respuesta.
 *
 *   const v = recolector();
 *   const titulo = v.texto(datos.titulo, 'titulo', { max: 80 });
 *   v.terminar();           // lanza AppError(400) si hubo errores
 */
export function recolector() {
  const errores = [];

  const api = {
    errores,

    texto(valor, campo, { requerido = false, max = 500, min = 1 } = {}) {
      const limpio = valor === null || valor === undefined ? '' : String(valor).trim();
      if (!limpio) {
        if (requerido) errores.push({ campo, mensaje: 'Es obligatorio' });
        return limpio;
      }
      if (limpio.length < min) errores.push({ campo, mensaje: `Debe tener al menos ${min} caracteres` });
      if (limpio.length > max) errores.push({ campo, mensaje: `No puede exceder ${max} caracteres` });
      return limpio;
    },

    numero(valor, campo, { min = -Infinity, max = Infinity, requerido = false } = {}) {
      if (valor === null || valor === undefined || valor === '') {
        if (requerido) errores.push({ campo, mensaje: 'Es obligatorio' });
        return null;
      }
      const n = Number(valor);
      if (!Number.isFinite(n)) {
        errores.push({ campo, mensaje: 'Debe ser un número' });
        return null;
      }
      if (n < min || n > max) {
        errores.push({ campo, mensaje: `Debe estar entre ${min} y ${max}` });
        return null;
      }
      return n;
    },

    enumeracion(valor, campo, permitidos, { requerido = false } = {}) {
      const v = valor === null || valor === undefined ? '' : String(valor);
      if (!v) {
        if (requerido) errores.push({ campo, mensaje: 'Es obligatorio' });
        return null;
      }
      if (!permitidos.includes(v)) {
        errores.push({ campo, mensaje: `Valor no permitido. Opciones: ${permitidos.join(', ')}` });
        return null;
      }
      return v;
    },

    arreglo(valor, campo, { requerido = false, max = 100 } = {}) {
      if (!Array.isArray(valor)) {
        if (requerido) errores.push({ campo, mensaje: 'Debe ser una lista' });
        return null;
      }
      if (valor.length > max) errores.push({ campo, mensaje: `Máximo ${max} elementos` });
      return valor;
    },

    agregar(campo, mensaje) {
      errores.push({ campo, mensaje });
    },

    terminar() {
      if (errores.length) {
        throw AppError.solicitudInvalida('Datos inválidos', errores);
      }
    }
  };

  return api;
}

/** Normaliza un texto para búsquedas (minúsculas y sin acentos). */
export function normalizarBusqueda(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
