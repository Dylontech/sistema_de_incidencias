/** Controlador de la cuenta del usuario: recuperación, congelación y baja. */
import { asyncHandler, AppError } from '../utils/AppError.js';
import * as cuentas from '../services/cuenta.service.js';
import * as claves from '../services/claves.service.js';
import { publico } from '../models/usuario.model.js';
import { registrarAccion } from '../utils/auditoria.js';

function meta(req) {
  return { ip: req.ip, userAgent: String(req.headers?.['user-agent'] || '') };
}

export const solicitarRecuperacion = asyncHandler(async (req, res) => {
  res.status(202).json(
    await cuentas.solicitarRecuperacion(
      req.repositorio,
      { correo: req.body?.correo },
      meta(req)
    )
  );
});

export const reenviarVerificacion = asyncHandler(async (req, res) => {
  res.status(202).json(
    await cuentas.reenviarVerificacion(
      req.repositorio,
      { correo: req.body?.correo },
      meta(req)
    )
  );
});

export const validarToken = asyncHandler(async (req, res) => {
  res.json(await cuentas.validarToken(req.repositorio, req.body?.token));
});

export const verificarCorreo = asyncHandler(async (req, res) => {
  res.json(await cuentas.verificarCorreo(req.repositorio, req.body?.token));
});

export const restablecerPassword = asyncHandler(async (req, res) => {
  res.json(
    await cuentas.restablecerPassword(req.repositorio, {
      token: req.body?.token,
      password: req.body?.password
    })
  );
});

/** Estado de la cuenta autenticada. */
export const estado = asyncHandler(async (req, res) => {
  const cuenta = await req.repositorio.usuarioPorId(req.usuario.id);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    cuenta: {
      ...publico(cuenta),
      correoVerificado: cuenta.correoVerificado !== false,
      claveObligatoria: cuenta.claveObligatoria === true,
      suspendido: cuenta.suspendido === true,
      suspendidoHasta: cuenta.suspendidoHasta || null,
      suspendidoOrigen: cuenta.suspendidoOrigen || null
    }
  });
});

export const cambiarCorreo = asyncHandler(async (req, res) => {
  const resultado = await cuentas.cambiarCorreo(req.repositorio, req.usuario, {
    correo: req.body?.correo,
    password: req.body?.password,
    ...meta(req)
  });
  await registrarAccion(req, {
    accion: 'correo_cambiado',
    entidad: 'usuarios',
    entidadId: req.usuario.id,
    detalle: {
      correoAnterior: resultado.correoAnterior,
      correoNuevo: resultado.correo
    }
  });
  res.json(resultado);
});

export const cambiarPassword = asyncHandler(async (req, res) => {
  const resultado = await cuentas.cambiarPassword(req.repositorio, req.usuario, {
    passwordActual: req.body?.passwordActual,
    passwordNueva: req.body?.passwordNueva
  });
  await registrarAccion(req, {
    accion: 'password_cambiada',
    entidad: 'usuarios',
    entidadId: req.usuario.id,
    detalle: { sesionesCerradas: resultado.sesionesCerradas }
  });
  res.json(resultado);
});

export const congelar = asyncHandler(async (req, res) => {
  const resultado = await cuentas.congelarCuenta(req.repositorio, req.usuario, {
    dias: req.body?.dias,
    password: req.body?.password
  });
  res.json(resultado);
});

export const eliminar = asyncHandler(async (req, res) => {
  const resultado = await cuentas.eliminarCuenta(req.repositorio, req.usuario, {
    password: req.body?.password,
    confirmacion: req.body?.confirmacion
  });
  res.json(resultado);
});

/** Clave de activación de la cuenta autenticada (solo personal). */
export const clave = asyncHandler(async (req, res) => {
  const cuenta = await req.repositorio.usuarioPorId(req.usuario.id);
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  const clave = cuenta.claveId
    ? await req.repositorio.claveAccesoPorId(cuenta.claveId)
    : null;
  const solicitudes = cuenta.claveId
    ? await req.repositorio.solicitudesRenovacionClave({
        estado: 'pendiente',
        usuarioId: cuenta.id,
        limite: 10
      })
    : [];
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    cuenta: {
      id: cuenta.id,
      claveId: cuenta.claveId || null,
      claveActivadaEn: cuenta.claveActivadaEn || null,
      claveVigenteHasta: cuenta.claveVigenteHasta || null,
      claveObligatoria: cuenta.claveObligatoria === true
    },
    clave: clave
      ? {
          id: clave.id,
          nombre: clave.nombre,
          modo: clave.modo,
          activa: clave.activa !== false,
          usos: clave.usos,
          usosMaximos: clave.usosMaximos,
          expiraEn: clave.expiraEn || null,
          municipios: clave.municipios || [],
          estados: clave.estados || []
        }
      : null,
    renovacionPendiente: solicitudes.length > 0
  });
});

export const solicitarRenovacionClave = asyncHandler(async (req, res) => {
  const solicitud = await claves.solicitarRenovacion(req.repositorio, req.usuario, {
    motivo: req.body?.motivo
  });
  res.status(201).json({ solicitud });
});
