/**
 * MODELO: Notificación.
 * `paraUsuario` es el `userKey` del destinatario; si es null la notificación
 * es global (la ven todos), igual que en el monolito.
 */
import { TIPOS_NOTIFICACION } from '../config/constantes.js';
import { nuevoId } from '../utils/ids.js';
import { ahoraIso } from '../utils/fechas.js';

export function construirNotificacion({
  tipo,
  titulo,
  mensaje,
  incidenciaId = null,
  paraUsuario = null,
  ahora = ahoraIso()
}) {
  return {
    id: nuevoId(),
    fecha: ahora,
    leida: false,
    tipo: TIPOS_NOTIFICACION.includes(tipo) ? tipo : 'estado',
    titulo: String(titulo || ''),
    mensaje: String(mensaje || ''),
    incidenciaId,
    paraUsuario
  };
}

export function publica(notificacion) {
  return notificacion;
}

/** ¿Esta notificación corresponde a este usuario? */
export function dirigidaA(notificacion, userKey) {
  return !notificacion.paraUsuario || notificacion.paraUsuario === userKey;
}

/**
 * Destinatario natural de un evento sobre una incidencia.
 *
 * El participante anónimo no tiene buzón: su sesión vive en el navegador y no
 * hay forma de localizarlo, así que no se le avisa de nada. Quien quiera
 * seguimiento tiene que abrir una cuenta ciudadana (decisión del sistema de
 * cuentas); entonces su `userKey` ya es un username y sí recibe los avisos.
 */
export function destinatarioDeIncidencia(incidencia) {
  const clave = incidencia?.userKey;
  if (!clave || String(clave).startsWith('anon_')) return null;
  return clave;
}
