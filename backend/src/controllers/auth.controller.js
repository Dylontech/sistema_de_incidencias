/** Controlador HTTP de autenticación. */
import { asyncHandler } from '../utils/AppError.js';
import * as auth from '../services/auth.service.js';
import { publico } from '../models/municipio.model.js';
import { MUNICIPIO_DEFAULT, ROLES_PERSONAL } from '../config/constantes.js';

export const entrarAnonimo = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarAnonimo(req.repositorio, {
    anonId: req.body?.anonId,
    municipioId: req.body?.municipioId
  });
  res.status(201).json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

/** Alta de una cuenta ciudadana (correo + contraseña, nombre o pseudónimo). */
export const registrarCiudadano = asyncHandler(async (req, res) => {
  const resultado = await auth.registrarCiudadano(req.repositorio, {
    ...(req.body || {}),
    ip: req.ip,
    userAgent: String(req.headers?.['user-agent'] || '')
  });
  res.status(201).json({
    ...resultado,
    ...(resultado?.municipioActivo
      ? { municipioActivo: publico(resultado.municipioActivo) }
      : {})
  });
});

/** Entrada de una cuenta ciudadana ya existente (nombre o pseudónimo + contraseña). */
export const entrarCiudadano = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarCiudadano(req.repositorio, {
    // `identificador` es el nombre nuevo del campo; `nombre` y `correo` se
    // conservan para las integraciones anteriores.
    nombre: req.body?.identificador || req.body?.nombre,
    correo: req.body?.correo,
    password: req.body?.password,
    municipioId: req.body?.municipioId
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

export const entrarFuncionario = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarFuncionario(req.repositorio, {
    username: req.body?.identificador || req.body?.username,
    password: req.body?.password,
    claveMunicipio: req.body?.claveMunicipio,
    claveAcceso: req.body?.claveAcceso,
    ip: req.ip
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

export const entrarAdmin = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarAdmin(req.repositorio, {
    username: req.body?.identificador || req.body?.username,
    password: req.body?.password
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

/** Devuelve la sesión actual y el municipio sugerido para el mapa. */
export const yo = asyncHandler(async (req, res) => {
  const municipios = await req.repositorio.todosMunicipios();
  const propios = Array.isArray(req.usuario.municipios) ? req.usuario.municipios : [];
  const estados = Array.isArray(req.usuario.estados) ? req.usuario.estados : [];
  const ciudadano = req.usuario.rol === 'ciudadano' || req.usuario.rol === 'anonimo';
  // El personal territorial solo puede mirar los municipios de su ámbito; el
  // admin maestro y los ciudadanos ven el catálogo completo. Al recargar no
  // debe caer en el municipio por defecto si está fuera de su territorio.
  const visibles =
    ciudadano || req.usuario.rol === 'admin'
      ? municipios
      : municipios.filter((m) => propios.includes(m.id) || estados.includes(m.estado));
  const propio = req.usuario.municipioId
    ? municipios.find((m) => m.id === req.usuario.municipioId)
    : null;
  const activo =
    propio && visibles.some((m) => m.id === propio.id)
      ? propio
      : visibles.find((m) => m.id === MUNICIPIO_DEFAULT) || visibles[0] || null;
  const esPersonal = ROLES_PERSONAL.includes(req.usuario.rol);
  const permisos = Array.isArray(req.usuario.permisos) ? req.usuario.permisos : [];
  res.json({
    usuario: {
      ...req.usuario,
      // Se mantiene la misma forma que devuelve el login, para que la interfaz
      // pueda preguntar «¿es anónimo?» sin ramificar por rol.
      esAnonimo: req.usuario.rol === 'anonimo',
      esPersonal,
      soloLectura: esPersonal && req.usuario.puedeEscribir !== true,
      puedeAtenderTickets:
        esPersonal && (req.usuario.rol === 'admin' || permisos.includes('atender_tickets'))
    },
    municipioActivo: publico(activo)
  });
});

/** Cambio de municipio activo con clave (paridad con `Admin.cambiarMunicipio`). */
export const cambiarMunicipio = asyncHandler(async (req, res) => {
  const sesion = await auth.cambiarMunicipioActivo(req.repositorio, req.usuario, {
    municipioId: req.body?.municipioId,
    clave: req.body?.clave
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

/** Cierra la sesión actual (para que deje de aparecer en el monitoreo). */
export const salir = asyncHandler(async (req, res) => {
  if (req.usuario?.jti) {
    await req.repositorio.cerrarSesion(req.usuario.jti, 'logout');
  }
  res.json({ mensaje: 'Sesión cerrada' });
});
