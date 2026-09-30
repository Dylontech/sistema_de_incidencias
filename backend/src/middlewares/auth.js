/** Middlewares de autenticación y autorización por rol. */
import { ROLES_EMPLEADO } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { verificarToken } from '../utils/jwt.js';
import { usuarioDesdeToken } from '../services/auth.service.js';
import {
  estaSuspendido,
  limpiarSancion,
  mensajeSuspension,
  suspensionVencida,
  versionDeSesion
} from '../models/usuario.model.js';
import { obtenerRepositorio } from '../repositories/index.js';

/**
 * Lee el token Bearer y deja el contexto del usuario en `req.usuario`.
 *
 * Además del token se comprueba el estado de la cuenta: una suspensión por
 * moderación tiene que cortar también las sesiones ya emitidas (el JWT seguiría
 * siendo válido hasta su caducidad). Solo se consulta la base para cuentas
 * reales: las sesiones anónimas (`anon_*`) no existen en `usuarios`.
 */
export async function autenticar(req, res, next) {
  try {
    const cabecera = String(req.headers.authorization || '');
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : '';
    req.usuario = token ? usuarioDesdeToken(verificarToken(token)) : null;

    if (!req.usuario || req.usuario.rol === 'anonimo') return next();

    const repositorio = await obtenerRepositorio();
    const cuenta = await repositorio.usuarioPorUsername(req.usuario.username);

    if (!cuenta || cuenta.activo === false) {
      req.usuario = null;
      return next(AppError.noAutenticado('Tu cuenta ya no está activa'));
    }

    // Cambiar la contraseña sube la versión de la cuenta. Los tokens emitidos
    // antes llevan la versión vieja, así que esta comprobación es lo que cierra
    // las demás sesiones sin tener que guardar la lista de tokens vivos.
    if (Number(req.usuario.version || 1) !== versionDeSesion(cuenta)) {
      req.usuario = null;
      return next(AppError.noAutenticado('Tu sesión ha caducado. Vuelve a entrar.'));
    }

    if (estaSuspendido(cuenta)) {
      // 403 (y no 401) para que el cliente no borre el token: al recargar debe
      // volver a ver el aviso de suspensión en lugar de entrar como anónimo.
      return next(AppError.prohibido(mensajeSuspension(cuenta)));
    }

    // Una suspensión con fecha ya cumplida se levanta sola.
    if (suspensionVencida(cuenta)) {
      await repositorio.actualizarUsuario(cuenta.id, limpiarSancion());
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requiereSesion(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  next();
}

export function requiereEmpleado(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  if (!ROLES_EMPLEADO.includes(req.usuario.rol)) {
    return next(AppError.prohibido('Solo funcionarios y administradores pueden acceder'));
  }
  next();
}

export function requiereAdmin(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  if (req.usuario.rol !== 'admin') {
    return next(AppError.prohibido('Solo un administrador puede realizar esta acción'));
  }
  next();
}
