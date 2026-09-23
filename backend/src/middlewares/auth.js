/** Middlewares de autenticación y autorización por rol. */
import { ROLES_EMPLEADO } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { verificarToken } from '../utils/jwt.js';
import { usuarioDesdeToken } from '../services/auth.service.js';

/** Lee el token Bearer y deja el contexto del usuario en `req.usuario`. */
export function autenticar(req, res, next) {
  const cabecera = String(req.headers.authorization || '');
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : '';
  req.usuario = token ? usuarioDesdeToken(verificarToken(token)) : null;
  next();
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
