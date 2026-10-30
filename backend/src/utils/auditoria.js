/**
 * Registro explícito de una acción de negocio en la bitácora.
 *
 * El middleware de auditoría ya anota cada escritura HTTP, pero hay acciones
 * cuyo valor está en el resultado y no en la petición: aprobar una baja,
 * entregar una contraseña restablecida, etc. Este helper añade esa fila con
 * quién la hizo, sobre qué cuenta y con qué resultado. Nunca guarda secretos.
 */
import { nuevoId } from './ids.js';
import { hashIp } from './privacidad.js';

/**
 * @param {import('express').Request} req petición ya autenticada.
 * @param {Object} datos
 * @param {string} datos.accion nombre estable de la acción (`baja_aprobada`…).
 * @param {string} [datos.entidad] tabla o recurso afectado.
 * @param {string|number} [datos.entidadId] identificador del recurso.
 * @param {Object} [datos.detalle] datos útiles; se serializan y nunca deben
 *   incluir contraseñas ni tokens.
 */
export async function registrarAccion(req, { accion, entidad = null, entidadId = null, detalle = {} } = {}) {
  const repositorio = req?.repositorio;
  if (!repositorio?.registrarAuditoria || !accion) return;
  const actor = req.usuario || {};
  let texto = '{}';
  try {
    texto = JSON.stringify(detalle || {});
  } catch {
    texto = '{}';
  }
  await repositorio.registrarAuditoria({
    id: nuevoId(),
    usuarioId: actor.id || null,
    username: actor.username || null,
    userKey: actor.userKey || null,
    rol: actor.rol || null,
    claveId: actor.claveId || null,
    metodo: req.method,
    ruta: String(req.originalUrl || '').split('?')[0].slice(0, 240),
    estadoHttp: 200,
    accion: String(accion).slice(0, 160),
    entidad: entidad ? String(entidad).slice(0, 80) : null,
    entidadId: entidadId === null || entidadId === undefined
      ? null
      : String(entidadId).slice(0, 120),
    detalle: texto.length > 8000 ? `${texto.slice(0, 8000)}…` : texto,
    ipHash: hashIp(req.ip),
    userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
    creadoEn: new Date().toISOString()
  });
}
