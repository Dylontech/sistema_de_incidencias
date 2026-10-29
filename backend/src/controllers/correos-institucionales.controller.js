/** Controlador del directorio de correos institucionales. */
import { asyncHandler } from '../utils/AppError.js';
import * as correos from '../services/correos-institucionales.service.js';
import * as claves from '../services/claves.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(
    await correos.listar(req.repositorio, {
      estado: req.query.estado || null,
      municipioId: req.query.municipioId || null,
      verificado: req.query.verificado ?? null,
      texto: req.query.texto || '',
      pagina: req.query.pagina,
      limite: req.query.limite
    })
  );
});

export const crear = asyncHandler(async (req, res) => {
  res.status(201).json({
    correo: await correos.crear(req.repositorio, req.usuario, req.body || {})
  });
});

export const actualizar = asyncHandler(async (req, res) => {
  res.json({
    correo: await correos.actualizar(req.repositorio, req.params.id, req.body || {})
  });
});

export const eliminar = asyncHandler(async (req, res) => {
  res.json(await correos.eliminar(req.repositorio, req.params.id));
});

export const importar = asyncHandler(async (req, res) => {
  res.status(201).json(await correos.importar(req.repositorio, req.usuario, req.body || {}));
});

export const exportar = asyncHandler(async (req, res) => {
  const { contenido, nombre } = await correos.exportar(req.repositorio, {
    estado: req.query.estado || null,
    municipioId: req.query.municipioId || null,
    verificado: req.query.verificado ?? null,
    texto: req.query.texto || ''
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(`\uFEFF${contenido}`);
});

export const busquedas = asyncHandler(async (req, res) => {
  res.json(await correos.busquedasAsistidas(req.repositorio, req.query.municipioId || null));
});

export const asignarClave = asyncHandler(async (req, res) => {
  res.json(
    await claves.asignarCorreoInstitucional(req.repositorio, req.usuario, req.params.id)
  );
});

export const invitar = asyncHandler(async (req, res) => {
  res.json(await correos.invitar(req.repositorio, req.usuario, req.body || {}));
});
