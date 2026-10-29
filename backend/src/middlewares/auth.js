/** Middlewares de autenticación y autorización por rol/alcance. */
import { ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { verificarToken } from '../utils/jwt.js';
import { usuarioDesdeToken } from '../services/auth.service.js';
import {
  estaSuspendido,
  limpiarSancion,
  mensajeSuspension,
  puedeEscribirDe,
  suspensionVencida
} from '../models/usuario.model.js';
import { obtenerRepositorio } from '../repositories/index.js';
import { permisosDe, tienePermiso } from '../services/permisos.service.js';
import { hashIp } from '../utils/privacidad.js';

/** Última vez que se tocó cada sesión, para no escribir en cada petición. */
const sesionesVistas = new Map();
const TOCAR_CADA_MS = 60000;

async function registrarActividad(repositorio, delToken, req, usuarioId = null) {
  if (!delToken?.jti) return;
  const ahora = Date.now();
  const visto = sesionesVistas.get(delToken.jti);
  if (visto && ahora - visto < TOCAR_CADA_MS) return;
  sesionesVistas.set(delToken.jti, ahora);

  await repositorio.registrarSesion({
    id: delToken.jti,
    usuarioId,
    userKey: delToken.userKey || delToken.username,
    rol: delToken.rol,
    municipioId: delToken.municipioId || null,
    claveId: delToken.claveId || null,
    ipHash: hashIp(req.ip),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200)
  });
}

/**
 * Lee el token Bearer y deja el contexto del usuario en `req.usuario`.
 *
 * Además del token se comprueba el estado de la cuenta y se **recargan rol y
 * asignaciones territoriales**: un cambio de alcance hecho por un
 * administrador debe surtir efecto de inmediato, no cuando caduque el JWT.
 * Solo se consulta la base para cuentas reales; las sesiones anónimas
 * (`anon_*`) no existen en `usuarios`.
 */
export async function autenticar(req, res, next) {
  try {
    const cabecera = String(req.headers.authorization || '');
    // Las etiquetas <img> no pueden enviar Authorization: solo el endpoint
    // privado de adjuntos acepta el token en la query para poder mostrarlas.
    const tokenQuery =
      String(req.originalUrl || '').startsWith('/api/adjuntos/') && req.query?.token
        ? String(req.query.token)
        : '';
    const token = cabecera.startsWith('Bearer ')
      ? cabecera.slice(7).trim()
      : tokenQuery;
    const delToken = token ? usuarioDesdeToken(verificarToken(token)) : null;

    if (!delToken || delToken.rol === 'anonimo') {
      req.usuario = delToken;
      if (delToken?.jti) {
        await registrarActividad(await obtenerRepositorio(), delToken, req);
      }
      return next();
    }

    const repositorio = await obtenerRepositorio();
    const cuenta = await repositorio.usuarioPorUsername(delToken.username);

    if (!cuenta || cuenta.activo === false) {
      req.usuario = null;
      return next(AppError.noAutenticado('Tu cuenta ya no está activa'));
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

    // Sesión revocada desde el panel de monitoreo: el token deja de valer
    // aunque no haya caducado.
    if (delToken.jti) {
      const guardada = await repositorio.sesionPorId(delToken.jti);
      if (guardada?.cerradaEn) {
        req.usuario = null;
        return next(AppError.noAutenticado('Tu sesión fue cerrada por un administrador'));
      }
      await registrarActividad(repositorio, delToken, req, cuenta.id);
    }

    const asignaciones = await repositorio.alcanceDeUsuario(cuenta.id);
    // Compatibilidad: las cuentas anteriores a las asignaciones N:M tienen un
    // único `municipio_id`; se trata como una asignación más.
    const municipios = asignaciones.municipios.length
      ? asignaciones.municipios
      : cuenta.municipioId
        ? [cuenta.municipioId]
        : [];

    // El municipio activo del token se conserva solo si sigue siendo válido.
    const activo = delToken.municipioId;
    const municipioActivo =
      activo && (cuenta.rol === 'admin' || municipios.includes(activo) || !municipios.length)
        ? activo
        : cuenta.municipioId || null;

    req.usuario = {
      ...delToken,
      id: cuenta.id,
      username: cuenta.username,
      userKey: cuenta.username,
      nombre: cuenta.nombre,
      rol: cuenta.rol,
      correo: cuenta.correo || null,
      municipioId: municipioActivo,
      puedeEscribir: puedeEscribirDe(cuenta),
      permisos: permisosDe(cuenta),
      municipios,
      estados: asignaciones.estados
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requiereSesion(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  next();
}

/** Cuenta registrada: excluye la sesión anónima del ciudadano. */
export function requiereCuenta(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado('Inicia sesión con una cuenta para continuar'));
  if (req.usuario.rol === 'anonimo') {
    return next(AppError.prohibido('Crea una cuenta para usar esta función'));
  }
  next();
}

/** Personal del sistema: funcionarios, auditores, enlaces y admin. */
export function requierePersonal(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  if (!ROLES_PERSONAL.includes(req.usuario.rol)) {
    return next(AppError.prohibido('Solo el personal del sistema puede acceder'));
  }
  next();
}

/** Compatibilidad con el nombre anterior. */
export const requiereEmpleado = requierePersonal;

/** Personal con permiso de escritura (admin o funcionario habilitado). */
export function requiereEscritura(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  if (!puedeEscribirDe(req.usuario)) {
    return next(AppError.prohibido('Tu cuenta es de solo lectura'));
  }
  next();
}

/** Personal con acceso de consulta (incluye auditores y enlaces). */
export const requiereLectura = requierePersonal;

/** Guarda genérica: exige un permiso efectivo (el admin siempre lo tiene). */
export function requierePermiso(permiso) {
  return (req, res, next) => {
    if (!req.usuario) return next(AppError.noAutenticado());
    if (!tienePermiso(req.usuario, permiso)) {
      return next(AppError.prohibido('Tu cuenta no tiene este permiso'));
    }
    next();
  };
}

export function requiereAdmin(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  if (req.usuario.rol !== 'admin') {
    return next(AppError.prohibido('Solo un administrador puede realizar esta acción'));
  }
  next();
}

/** Cualquier nivel de administración (maestro o territorial). */
export function requiereAlgunaAdmin(req, res, next) {
  if (!req.usuario) return next(AppError.noAutenticado());
  if (!ROLES_ADMIN.includes(req.usuario.rol)) {
    return next(AppError.prohibido('Solo un administrador puede realizar esta acción'));
  }
  next();
}
