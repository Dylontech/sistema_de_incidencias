/** Controlador HTTP de la cuenta ciudadana (contraseñas, correo y datos). */
import { asyncHandler } from '../utils/AppError.js';
import * as cuenta from '../services/cuenta.service.js';

/** Confirma el correo con el enlace que llegó por correo. */
export const verificar = asyncHandler(async (req, res) => {
  const resultado = await cuenta.verificarCorreo(req.repositorio, { token: req.body?.token });
  res.json({ ...resultado, mensaje: 'Correo confirmado. Ya puedes entrar con tu contraseña.' });
});

/**
 * Pide el enlace de recuperación.
 * Se responde 200 siempre (también si la dirección no tiene cuenta): la pantalla
 * no debe servir para averiguar qué correos están registrados.
 */
export const olvide = asyncHandler(async (req, res) => {
  const resultado = await cuenta.solicitarRestablecimiento(req.repositorio, {
    correo: req.body?.correo
  });
  res.json(resultado);
});

/** Elige la contraseña nueva desde el enlace del correo. */
export const restablecer = asyncHandler(async (req, res) => {
  const sesion = await cuenta.restablecerPassword(req.repositorio, {
    token: req.body?.token,
    password: req.body?.password
  });
  res.json({ token: sesion.token, usuario: sesion.usuario, mensaje: 'Contraseña cambiada.' });
});

/** Cambio de contraseña desde dentro de la sesión (pide la actual). */
export const cambiarPassword = asyncHandler(async (req, res) => {
  const sesion = await cuenta.cambiarPassword(req.repositorio, req.usuario, {
    actual: req.body?.actual,
    nueva: req.body?.nueva
  });
  // Se devuelve el token nuevo: el anterior queda invalidado al subir la versión
  // de sesión, así que la interfaz tiene que reemplazarlo.
  res.json({
    token: sesion.token,
    usuario: sesion.usuario,
    mensaje: 'Contraseña actualizada. Las demás sesiones abiertas se han cerrado.'
  });
});

/** Reenvía el enlace de confirmación del correo. */
export const reenviarCorreo = asyncHandler(async (req, res) => {
  const resultado = await cuenta.reenviarVerificacion(req.repositorio, req.usuario);
  res.json(
    resultado.yaVerificado
      ? { ...resultado, mensaje: 'Tu correo ya estaba confirmado.' }
      : { ...resultado, mensaje: `Te hemos enviado un enlace nuevo a ${resultado.correo}.` }
  );
});

/**
 * Reenvío desde la pantalla de acceso (sin sesión).
 * Responde igual exista o no la cuenta, como la recuperación de contraseña.
 */
export const reenviar = asyncHandler(async (req, res) => {
  const resultado = await cuenta.reenviarVerificacionPorCorreo(req.repositorio, {
    correo: req.body?.correo
  });
  res.json(resultado);
});

/** Descarga todo lo que el sistema guarda de la cuenta. */
export const descargarDatos = asyncHandler(async (req, res) => {
  const datos = await cuenta.exportarDatos(req.repositorio, req.usuario);
  res.json(datos);
});

/** Baja de la cuenta: anonimiza sus reportes y borra sus avisos. */
export const eliminar = asyncHandler(async (req, res) => {
  const totales = await cuenta.eliminarCuenta(req.repositorio, req.usuario, {
    password: req.body?.password
  });
  res.json({ ...totales, mensaje: 'Tu cuenta se ha eliminado. Tus reportes siguen publicados sin tu nombre.' });
});
