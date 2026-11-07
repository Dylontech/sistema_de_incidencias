/** Consulta pública del estado de un correo antes de registrarse o solicitar acceso. */
import { normalizarCorreo } from '../models/usuario.model.js';
import { AppError } from '../utils/AppError.js';

/**
 * Devuelve una respuesta apta para el formulario.
 *
 * No incluye nombre, rol ni identificadores de la cuenta: solo dice qué debe
 * hacer la persona. La comprobación definitiva se repite al crear la cuenta o
 * la solicitud, porque entre la consulta y el envío pueden pasar cosas.
 */
export async function estadoCorreo(repositorio, { correo, contexto = 'registro' } = {}) {
  const email = normalizarCorreo(correo);
  if (!email) {
    throw AppError.solicitudInvalida('Escribe un correo válido', [
      { campo: 'correo', mensaje: 'El correo no tiene un formato válido' }
    ]);
  }

  const cuenta = await repositorio.usuarioPorCorreo(email);
  const pendiente = await repositorio.solicitudAccesoAbiertaPorCorreo(email);
  const esSolicitud = contexto === 'solicitud_acceso';

  if (pendiente) {
    return {
      correo: email,
      disponible: false,
      accion: 'esperar',
      mensaje: 'Ya hay una solicitud pendiente con este correo. Espera la revisión.'
    };
  }

  if (!cuenta) {
    return {
      correo: email,
      disponible: true,
      accion: 'registrar',
      mensaje: esSolicitud
        ? 'Correo disponible: la administración creará tu cuenta al aprobar la solicitud.'
        : 'Correo disponible.'
    };
  }

  if (!esSolicitud) {
    return {
      correo: email,
      disponible: false,
      accion: 'entrar',
      mensaje: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.'
    };
  }

  if (cuenta.rol === 'ciudadano') {
    if (cuenta.activo === false) {
      return {
        correo: email,
        disponible: false,
        accion: 'reactivar',
        mensaje: 'Ese correo tiene una cuenta inactiva. Pide a la administración que la reactive.'
      };
    }
    return {
      correo: email,
      disponible: true,
      accion: 'vincular',
      mensaje: 'Ese correo ya tiene una cuenta ciudadana. La solicitud se vinculará a ella.'
    };
  }

  return {
    correo: email,
    disponible: false,
    accion: 'entrar',
    mensaje: 'Ese correo ya tiene acceso al sistema. Inicia sesión o recupera tu contraseña.'
  };
}
