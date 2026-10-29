/** Controlador de contacto directo a funcionarios. */
import { asyncHandler } from '../utils/AppError.js';
import * as contactos from '../services/contactos-funcionarios.service.js';

export const funcionarios = asyncHandler(async (req, res) => {
  res.json({
    funcionarios: await contactos.funcionariosDisponibles(
      req.repositorio,
      req.usuario,
      req.query.municipioId
    )
  });
});

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({
    contacto: await contactos.crearContacto(req.repositorio, req.usuario, req.body || {})
  });
});

export const solicitarAdmin = asyncHandler(async (req, res) => {
  res.status(201).json({
    solicitud: await contactos.solicitarAdmin(req.repositorio, req.usuario, req.body || {})
  });
});

export const mios = asyncHandler(async (req, res) => {
  res.json({ contactos: await contactos.listarMios(req.repositorio, req.usuario) });
});

export const bandeja = asyncHandler(async (req, res) => {
  res.json({
    contactos: await contactos.listarBandeja(req.repositorio, req.usuario, {
      estado: req.query.estado || null,
      texto: req.query.texto || '',
      limite: Number(req.query.limite) || 200
    })
  });
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ contacto: await contactos.detalle(req.repositorio, req.usuario, req.params.id) });
});

export const responder = asyncHandler(async (req, res) => {
  res.status(201).json({
    contacto: await contactos.responder(req.repositorio, req.usuario, req.params.id, req.body || {})
  });
});

export const mediaciones = asyncHandler(async (req, res) => {
  res.json({ solicitudes: await contactos.listarSolicitudes(req.repositorio, req.usuario) });
});

export const atenderMediacion = asyncHandler(async (req, res) => {
  res.json({
    solicitud: await contactos.atenderSolicitud(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body || {}
    )
  });
});
