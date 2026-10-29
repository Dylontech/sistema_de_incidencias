/** Controlador del generador de publicaciones para redes. */
import { AppError, asyncHandler } from '../utils/AppError.js';
import * as publicidad from '../services/publicidad.service.js';
import * as qrPublicidad from '../services/qr-publicidad.service.js';
import * as qrGenerador from '../services/qr-generador.service.js';
import { metadatosDeArchivo } from '../services/uploads.service.js';

export const catalogo = asyncHandler(async (req, res) => {
  res.json(publicidad.catalogo());
});

export const listar = asyncHandler(async (req, res) => {
  res.json(
    await publicidad.listar(req.repositorio, {
      red: req.query.red || null,
      municipioId: req.query.municipioId || null,
      estado: req.query.estado || null,
      texto: req.query.texto || '',
      pagina: req.query.pagina,
      limite: req.query.limite
    })
  );
});

export const simular = asyncHandler(async (req, res) => {
  res.json(await publicidad.simular(req.repositorio, req.usuario, req.body || {}));
});

export const generar = asyncHandler(async (req, res) => {
  res.status(201).json(await publicidad.generar(req.repositorio, req.usuario, req.body || {}));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json({ publicacion: await publicidad.detalle(req.repositorio, req.params.id) });
});

export const descargar = asyncHandler(async (req, res) => {
  const publicacion = await publicidad.detalle(req.repositorio, req.params.id);
  const svg = await publicidad.svgDe(publicacion);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${publicidad.nombreArchivo(publicacion)}"`
  );
  res.send(svg);
});

export const actualizar = asyncHandler(async (req, res) => {
  res.json({ publicacion: await publicidad.actualizar(req.repositorio, req.params.id, req.body || {}) });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await publicidad.eliminar(req.repositorio, req.params.id));
});

export const infoQr = asyncHandler(async (req, res) => {
  res.json(await qrPublicidad.infoCodigo(req.repositorio, req.params.codigo));
});

export const escanearQr = asyncHandler(async (req, res) => {
  res.json(
    await qrPublicidad.registrarEscaneo(req.repositorio, req.params.codigo, {
      usuario: req.usuario,
      lat: req.body?.lat,
      lng: req.body?.lng,
      precision: req.body?.precision,
      ip: req.ip,
      userAgent: req.get('user-agent') || ''
    })
  );
});

export const estadisticasQr = asyncHandler(async (req, res) => {
  res.json(
    await qrPublicidad.estadisticas(req.repositorio, {
      publicacionId: req.query.publicacionId || req.params.id || null,
      desde: req.query.desde || null,
      hasta: req.query.hasta || null
    })
  );
});

export const generarQr = asyncHandler(async (req, res) => {
  res.json(await qrGenerador.generarQr(req.body || {}));
});

export const guardarCodigoQr = asyncHandler(async (req, res) => {
  res.status(201).json(await qrPublicidad.guardarCodigo(req.repositorio, req.usuario, req.body || {}));
});

export const subirAsset = asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.solicitudInvalida('No se recibió la imagen');
  res.status(201).json({ asset: metadatosDeArchivo(req.file) });
});

export const descargarQrPdf = asyncHandler(async (req, res) => {
  const pdf = await qrGenerador.generarQrPdf(req.body || {});
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="codigo-qr.pdf"');
  res.send(pdf);
});
