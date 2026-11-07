/** Subida y descarga autorizada de adjuntos de chat y comentarios. */
import { asyncHandler } from '../utils/AppError.js';
import * as adjuntos from '../services/adjuntos.service.js';

export const subirChat = asyncHandler(async (req, res) => {
  const adjunto = await adjuntos.guardarAdjunto(req.repositorio, req.usuario, req.file, {
    proposito: 'chat'
  });
  res.status(201).json({ adjunto: adjuntos.publico(adjunto) });
});

export const subirComentario = asyncHandler(async (req, res) => {
  const adjunto = await adjuntos.guardarAdjunto(req.repositorio, req.usuario, req.file, {
    proposito: 'comentario'
  });
  res.status(201).json({ adjunto: adjuntos.publico(adjunto) });
});

export const descargar = asyncHandler(async (req, res) => {
  const adjunto = await req.repositorio.adjuntoPorId(req.params.id);
  if (!adjunto || !(await adjuntos.autorizarDescarga(req.repositorio, req.usuario, adjunto))) {
    return res.status(404).json({ error: 'Adjunto no encontrado' });
  }
  const ruta = await adjuntos.rutaFisica(adjunto);
  if (!ruta) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  // Imágenes y PDF se abren en el visor del navegador; Office se descarga.
  const inline = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf'
  ].includes(adjunto.tipo);
  const nombre = String(adjunto.nombreOriginal || 'adjunto').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', adjunto.tipo);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${nombre}"`);
  return res.sendFile(ruta);
});
