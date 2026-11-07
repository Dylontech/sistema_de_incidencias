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
import {
  aplicarClaveAUsuario,
  claveVigente,
  exigirCobertura
} from '../services/claves.service.js';
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

    if (cuenta.correoVerificado === false) {
      req.usuario = null;
      return next(
        new AppError(403, 'Confirma tu correo para activar la cuenta', [
          {
            codigo: 'correo_no_verificado',
            correo: cuenta.correo || null,
            puedeReenviar: true
          }
        ])
      );
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
    let municipios = asignaciones.municipios.length
      ? asignaciones.municipios
      : cuenta.municipioId
        ? [cuenta.municipioId]
        : [];
    let estados = asignaciones.estados;
    let permisos = permisosDe(cuenta);

    // Una cuenta de personal operativo nueva sin clave no tiene acceso. Las
    // cuentas administrativas entran por `/api/auth/admin` sin clave.
    if (cuenta.claveObligatoria === true && !cuenta.claveId && !ROLES_ADMIN.includes(cuenta.rol)) {
      req.usuario = null;
      return next(
        new AppError(403, 'Tu cuenta aún no tiene una clave de acceso vinculada', [
          { codigo: 'clave_no_asignada' }
        ])
      );
    }

    // Una sesión abierta con clave se vuelve a recortar en cada petición: si
    // la clave cambió de territorio/permisos, fue revocada o ya no cubre la
    // adscripción, el token deja de servir inmediatamente.
    if (delToken.claveId) {
      if (String(cuenta.claveId || '') !== String(delToken.claveId)) {
        req.usuario = null;
        return next(
          new AppError(401, 'Tu clave de acceso cambió. Vuelve a iniciar sesión.', [
            { codigo: 'clave_cambiada' }
          ])
        );
      }
      const clave = await repositorio.claveAccesoPorId(delToken.claveId);
      if (!clave || clave.activa === false) {
        req.usuario = null;
        return next(
          new AppError(401, 'Tu clave de acceso fue revocada', [
            { codigo: 'clave_revocada' }
          ])
        );
      }
      if (!claveVigente(clave)) {
        req.usuario = null;
        return next(
          new AppError(401, 'Tu clave de acceso venció. Ingresa la nueva clave.', [
            { codigo: 'clave_vencida', venceEn: clave.expiraEn || null }
          ])
        );
      }
      await exigirCobertura(repositorio, clave, { municipios, estados });
      const restringido = aplicarClaveAUsuario(
        {
          ...cuenta,
          municipios,
          estados,
          permisos
        },
        clave
      );
      municipios = restringido.municipios;
      estados = restringido.estados;
      permisos = restringido.permisos;
    } else if (cuenta.claveId && !ROLES_ADMIN.includes(cuenta.rol)) {
      // Las cuentas administrativas no usan clave de activación: su acceso se
      // valida por la puerta de administración. Solo el personal operativo
      // necesita el segundo factor.
      req.usuario = null;
      return next(
        new AppError(401, 'Vuelve a iniciar sesión con tu clave de acceso', [
          { codigo: 'clave_requerida' }
        ])
      );
    }

    // El municipio activo del token se conserva solo si sigue siendo válido.
    const activo = delToken.municipioId;
    let municipioActivo =
      activo && (cuenta.rol === 'admin' || municipios.includes(activo) || !municipios.length)
        ? activo
        : cuenta.municipioId || null;

    if (delToken.claveId) {
      if (municipios.length) {
        municipioActivo = municipios.includes(activo)
          ? activo
          : municipios[0] || null;
      } else if (estados.length) {
        const propio = activo ? await repositorio.municipioPorId(activo) : null;
        municipioActivo =
          propio && estados.includes(propio.estado) ? propio.id : null;
        if (!municipioActivo) {
          const catalogo = await repositorio.municipiosLigeros();
          municipioActivo =
            catalogo.find((m) => estados.includes(m.estado))?.id || null;
        }
      } else {
        municipioActivo = null;
      }
    }

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
      permisos,
      municipios,
      estados,
      claveActivadaEn: cuenta.claveActivadaEn || null,
      claveVigenteHasta: cuenta.claveVigenteHasta || null,
      claveObligatoria: cuenta.claveObligatoria === true,
      correoVerificado: cuenta.correoVerificado !== false,
      suspendidoHasta: cuenta.suspendidoHasta || null,
      suspendidoOrigen: cuenta.suspendidoOrigen || null,
      creadoEn: cuenta.creadoEn || null
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

/** Variante para rutas que sirven a más de una pestaña (p. ej. ver claves o avisos). */
export function requiereAlgunPermiso(permisos = []) {
  const lista = Array.isArray(permisos) ? permisos : [permisos];
  return (req, res, next) => {
    if (!req.usuario) return next(AppError.noAutenticado());
    if (!lista.some((permiso) => tienePermiso(req.usuario, permiso))) {
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
