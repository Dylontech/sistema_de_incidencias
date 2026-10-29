/** Controlador de firmas y recolecciones. */
import { asyncHandler } from '../utils/AppError.js';
import * as firmas from '../services/firmas.service.js';

export const resumenIncidencia = asyncHandler(async (req, res) => {
  res.json({
    firmas: await firmas.resumenDeIncidencia(req.repositorio, req.usuario, req.params.id)
  });
});

export const fijarMeta = asyncHandler(async (req, res) => {
  res.json({
    firmas: await firmas.fijarMetaIncidencia(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body?.meta
    )
  });
});

export const firmar = asyncHandler(async (req, res) => {
  res.status(201).json({
    firmas: await firmas.firmarIncidencia(req.repositorio, req.usuario, req.params.id, {
      ipHash: req.ipHash || null
    })
  });
});

export const retirar = asyncHandler(async (req, res) => {
  res.json({
    firmas: await firmas.retirarFirmaIncidencia(req.repositorio, req.usuario, req.params.id)
  });
});

export const listarMunicipio = asyncHandler(async (req, res) => {
  res.json({
    recolecciones: await firmas.listarRecolecciones(req.repositorio, req.usuario, {
      estado: req.query.estado || null,
      limite: Number(req.query.limite) || 300
    })
  });
});

export const exportar = asyncHandler(async (req, res) => {
  const datos = await firmas.datosExportacion(
    req.repositorio,
    req.usuario,
    req.params.recoleccionId || req.params.id
  );
  if (String(req.query.formato || 'csv') === 'pdf') {
    const buffer = await firmas.generarPDF(datos);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="firmas-${datos.id.slice(0, 8)}.pdf"`
    );
    res.send(buffer);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="firmas-${datos.id.slice(0, 8)}.csv"`);
  res.send(firmas.generarCSV(datos));
});

export const solicitarAdmin = asyncHandler(async (req, res) => {
  res.status(201).json({
    envio: await firmas.solicitarAdmin(
      req.repositorio,
      req.usuario,
      req.params.id,
      req.body?.nota || ''
    )
  });
});

export const listarAdmin = asyncHandler(async (req, res) => {
  res.json({
    recolecciones: await firmas.listarRecolecciones(req.repositorio, req.usuario, {
      estado: req.query.estado || null,
      limite: Number(req.query.limite) || 300
    })
  });
});

export const detalleAdmin = asyncHandler(async (req, res) => {
  res.json({
    recoleccion: await firmas.detalleRecoleccion(req.repositorio, req.usuario, req.params.id)
  });
});

export const enviar = asyncHandler(async (req, res) => {
  res.status(201).json({
    envio: await firmas.enviarAFuncionario(req.repositorio, req.usuario, req.params.id, {
      destino: req.body?.destino,
      nota: req.body?.nota || ''
    })
  });
});

export const crearMunicipal = asyncHandler(async (req, res) => {
  res.status(201).json({
    recoleccion: await firmas.crearRecoleccionMunicipal(req.repositorio, req.usuario, req.body || {})
  });
});

export const firmarMunicipal = asyncHandler(async (req, res) => {
  res.status(201).json({
    recoleccion: await firmas.firmarRecoleccionMunicipal(
      req.repositorio,
      req.usuario,
      req.params.id,
      { ipHash: req.ipHash || null }
    )
  });
});
