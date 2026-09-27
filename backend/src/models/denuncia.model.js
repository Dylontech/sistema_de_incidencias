/**
 * MODELO: Denuncia.
 *
 * Una denuncia es el aviso de un ciudadano (o de una sesión anónima) sobre un
 * contenido que considera inapropiado. No cambia nada por sí sola: abre un
 * expediente que el personal del municipio revisa en la cola de moderación.
 *
 * Guarda una **copia** del título y del autor del contenido denunciado
 * (`objetivoTitulo`, `objetivoAutor`, `objetivoUserKey`). Así la auditoría sigue
 * teniendo sentido aunque después se oculte o se borre la publicación, que es
 * justo el desenlace habitual de una denuncia.
 */
import {
  ACCIONES_MODERACION,
  ESTADOS_DENUNCIA,
  LIMITES_TEXTO,
  MOTIVOS_DENUNCIA
} from '../config/constantes.js';
import { recolector } from '../utils/validacion.js';
import { ahoraIso } from '../utils/fechas.js';
import { nuevoId } from '../utils/ids.js';

/** Tipos de contenido denunciable. */
export const OBJETIVOS_DENUNCIA = ['incidencia', 'comentario'];

/**
 * Valida lo que envía el cliente al denunciar.
 * `motivo` es cerrado (para poder agrupar y contar) y `detalle` es opcional.
 */
export function validarDenuncia(datos = {}) {
  const v = recolector();

  const motivo = v.enumeracion(datos.motivo, 'motivo', MOTIVOS_DENUNCIA, { requerido: true });
  const detalle = v.texto(datos.detalle, 'detalle', { max: LIMITES_TEXTO.detalleDenuncia });
  const objetivo = v.enumeracion(datos.objetivo, 'objetivo', OBJETIVOS_DENUNCIA) || 'incidencia';
  const comentarioId = v.texto(datos.comentarioId, 'comentarioId', { max: 64 });

  if (objetivo === 'comentario' && !comentarioId) {
    v.agregar('comentarioId', 'Indica el comentario que denuncias');
  }

  v.terminar();
  return { motivo, detalle, objetivo, comentarioId: comentarioId || null };
}

/**
 * Documento completo de una denuncia nueva.
 *
 * `incidencia` es el reporte al que pertenece el contenido (el propio reporte o
 * el que contiene el comentario) y `comentario` el comentario denunciado, si lo
 * hay. El denunciante puede ser una sesión anónima: su `userKey` empieza por
 * `anon_` y no tiene buzón.
 */
export function construirDenuncia({
  entrada,
  incidencia,
  comentario = null,
  usuario,
  ahora = ahoraIso()
}) {
  const esComentario = entrada.objetivo === 'comentario' && comentario;
  return {
    id: nuevoId(),
    fecha: ahora,
    objetivo: esComentario ? 'comentario' : 'incidencia',
    incidenciaId: incidencia.id,
    comentarioId: esComentario ? comentario.id : null,
    municipioId: incidencia.municipioId || null,
    // Copia del contenido denunciado: sobrevive al ocultamiento y al borrado.
    objetivoTitulo: incidencia.titulo || '(sin título)',
    objetivoResumen: esComentario ? String(comentario.texto || '').slice(0, 200) : '',
    objetivoAutor: esComentario ? comentario.autor || 'Anónimo' : incidencia.autorNombre || 'Anónimo',
    objetivoUserKey: esComentario ? comentario.userKey || null : incidencia.userKey || null,
    // Quién denuncia: visible para el personal moderador, nunca en público.
    autorUserKey: usuario.userKey || null,
    autorNombre: usuario.rol === 'anonimo' ? 'Sesión anónima' : usuario.nombre,
    motivo: entrada.motivo,
    detalle: entrada.detalle || '',
    estado: 'pendiente',
    accion: null,
    resolucion: '',
    moderadoPor: null,
    moderadoFecha: null
  };
}

/** ¿El usuario es el autor del contenido que se quiere denunciar? */
export function esContenidoPropio({ userKey }, usuario) {
  return Boolean(userKey) && userKey === usuario?.userKey;
}

/** ¿Esta denuncia sigue abierta? */
export function estaPendiente(denuncia) {
  return denuncia.estado === 'pendiente';
}

/**
 * Cierra el expediente de una denuncia con la decisión del moderador.
 * `accion` es `descartar` cuando la denuncia no procede; el resto de acciones
 * (ocultar, eliminar, advertir, suspender) se aplican por separado y aquí solo
 * queda registrado qué se hizo.
 */
export function resolverDenuncia(denuncia, { accion, resolucion = '', moderador, ahora = ahoraIso() }) {
  const limpio = recolector();
  const nota = limpio.texto(resolucion, 'resolucion', { max: LIMITES_TEXTO.resolucionDenuncia });
  limpio.terminar();

  const elegida = accion || 'descartar';
  if (!ACCIONES_MODERACION.includes(elegida)) {
    throw new Error(`Acción de moderación desconocida: ${elegida}`);
  }

  return {
    ...denuncia,
    estado: elegida === 'descartar' ? 'descartada' : 'atendida',
    accion: elegida,
    resolucion: nota,
    moderadoPor: moderador?.nombre || '—',
    moderadoFecha: ahora
  };
}

/**
 * Etiqueta del objetivo para la cola: distingue un reporte de un comentario.
 */
export function descripcionObjetivo(denuncia) {
  return denuncia.objetivo === 'comentario'
    ? `Comentario en "${denuncia.objetivoTitulo}"`
    : `Reporte "${denuncia.objetivoTitulo}"`;
}

/** Estados válidos (reexportados para los servicios y las pruebas). */
export { ESTADOS_DENUNCIA, MOTIVOS_DENUNCIA, ACCIONES_MODERACION };
