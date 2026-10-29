/** Controlador de administración de solicitudes públicas, bloqueos y correos. */
import { asyncHandler } from '../utils/AppError.js';
import * as solicitudes from '../services/solicitudes.service.js';

export const listarSolicitudes = asyncHandler(async (req, res) => {
  const lista = await solicitudes.listarSolicitudes(req.repositorio, {
    estado: req.query.estado || null,
    correo: req.query.correo || null,
    limite: Number(req.query.limite) || 200
  });
  res.json({ solicitudes: lista });
});

export const detalleSolicitud = asyncHandler(async (req, res) => {
  res.json({ solicitud: await solicitudes.detalleSolicitud(req.repositorio, req.params.id) });
});

export const archivoSolicitud = asyncHandler(async (req, res) => {
  const { solicitud, adjunto } = await solicitudes.archivoSolicitud(
    req.repositorio,
    req.params.id
  );
  res.setHeader('Content-Type', adjunto.tipo);
  res.setHeader('Content-Disposition', `inline; filename="${adjunto.nombre}"`);
  res.setHeader('X-Solicitud-Folio', solicitud.folio);
  res.send(adjunto.contenido);
});

export const vistaPreviaSolicitud = asyncHandler(async (req, res) => {
  const { solicitud, adjunto } = await solicitudes.vistaPreviaSolicitud(
    req.repositorio,
    req.params.id,
    req.query.formato
  );
  res.setHeader('Content-Type', adjunto.tipo);
  res.setHeader('Content-Disposition', `inline; filename="${adjunto.nombre}"`);
  res.setHeader('X-Solicitud-Folio', solicitud.folio);
  res.send(adjunto.contenido);
});

export const generarSolicitud = asyncHandler(async (req, res) => {
  res.json(await solicitudes.generarSolicitud(req.repositorio, req.usuario, req.params.id));
});

export const enviarSolicitud = asyncHandler(async (req, res) => {
  res.json({ solicitud: await solicitudes.enviarSolicitud(req.repositorio, req.usuario, req.params.id) });
});

export const reintentarSolicitud = asyncHandler(async (req, res) => {
  const solicitud = await solicitudes.reintentarSolicitud(req.repositorio, req.params.id);
  res.json({ solicitud });
});

export const rechazarSolicitud = asyncHandler(async (req, res) => {
  const solicitud = await solicitudes.rechazarSolicitud(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.motivo || ''
  );
  res.json({ solicitud });
});

export const listarBloqueos = asyncHandler(async (req, res) => {
  const lista = await solicitudes.listarBloqueos(req.repositorio, {
    soloActivos: req.query.activos === '1'
  });
  res.json({ bloqueos: lista });
});

export const crearBloqueo = asyncHandler(async (req, res) => {
  const bloqueo = await solicitudes.bloquear(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ bloqueo });
});

export const eliminarBloqueo = asyncHandler(async (req, res) => {
  res.json(await solicitudes.desbloquear(req.repositorio, req.usuario, req.params.id));
});

export const listarEnvios = asyncHandler(async (req, res) => {
  const envios = await req.repositorio.enviosCorreo({ limite: Number(req.query.limite) || 200 });
  res.json({ envios });
});
