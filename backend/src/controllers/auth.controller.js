/** Controlador HTTP de autenticación. */
import { asyncHandler } from '../utils/AppError.js';
import * as auth from '../services/auth.service.js';
import { publico } from '../models/municipio.model.js';
import { MUNICIPIO_DEFAULT } from '../config/constantes.js';

export const entrarAnonimo = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarAnonimo(req.repositorio, {
    anonId: req.body?.anonId,
    municipioId: req.body?.municipioId
  });
  res.status(201).json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

/** Alta de una cuenta ciudadana (correo + contraseña, nombre o pseudónimo). */
export const registrarCiudadano = asyncHandler(async (req, res) => {
  const sesion = await auth.registrarCiudadano(req.repositorio, req.body || {});
  res.status(201).json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

/** Entrada de una cuenta ciudadana ya existente. */
export const entrarCiudadano = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarCiudadano(req.repositorio, {
    correo: req.body?.correo,
    password: req.body?.password,
    municipioId: req.body?.municipioId
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

export const entrarFuncionario = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarFuncionario(req.repositorio, {
    username: req.body?.username,
    password: req.body?.password,
    claveMunicipio: req.body?.claveMunicipio
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

export const entrarAdmin = asyncHandler(async (req, res) => {
  const sesion = await auth.entrarAdmin(req.repositorio, {
    username: req.body?.username,
    password: req.body?.password
  });
  res.json({ ...sesion, municipioActivo: publico(sesion.municipioActivo) });
});

/** Devuelve la sesión actual y el municipio sugerido para el mapa. */
export const yo = asyncHandler(async (req, res) => {
  const municipios = await req.repositorio.todosMunicipios();
  const propio = req.usuario.municipioId
    ? municipios.find((m) => m.id === req.usuario.municipioId)
    : null;
  // Si el token apunta a un municipio que ya no existe (catálogo anterior) se
  // cae al municipio por defecto, no al primero del listado.
  const municipioActivo =
    propio || municipios.find((m) => m.id === MUNICIPIO_DEFAULT) || municipios[0] || null;
  res.json({
    usuario: {
      ...req.usuario,
      // Se mantiene la misma forma que devuelve el login, para que la interfaz
      // pueda preguntar «¿es anónimo?» sin ramificar por rol.
      esAnonimo: req.usuario.rol === 'anonimo'
    },
    municipioActivo: publico(municipioActivo)
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
