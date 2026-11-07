/** Controlador de exportación de informes en PDF/CSV para el personal. */
import { AppError, asyncHandler } from '../utils/AppError.js';
import { datosInforme, generarCSV, nombreArchivo } from '../services/informes.service.js';
import { generarPDF } from '../services/pdf.service.js';
import { paletaAcento } from '../services/pdf/pdf-informes.mjs';
import { motorPdf as resolverMotorPdf, plantillaInforme, valor } from '../services/configuracion.service.js';
import { descartar, validarArchivos } from '../services/uploads.service.js';

/** Escapa un valor para usarlo dentro de una cadena CSS. */
function textoCss(valor) {
  return String(valor || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}

function filtrosDe(req) {
  return {
    municipioId: req.query.municipio || null,
    municipios: req.query.municipios || null,
    estadoEntidad: req.query.estadoEntidad || null,
    estados: req.query.estados || null,
    ambito: req.query.ambito || 'todos',
    ambitos: req.query.ambitos || null,
    tipos: req.query.tipos || [],
    tiposTodos: req.query.tiposTodos === 'true' || req.query.tiposTodos === true,
    compararPor: req.query.compararPor || 'municipio',
    incluirDetalle: req.query.incluirDetalle !== 'false' && req.query.incluirDetalle !== false,
    desde: req.query.desde || null,
    hasta: req.query.hasta || null
  };
}

/** GET /api/informes/motor-pdf: versión configurada (v1, v2 o preguntar). */
export const motorPdf = asyncHandler(async (req, res) => {
  res.json({ motor: await valor(req.repositorio, 'informes.motor_pdf') });
});

/** GET /api/informes/datos: JSON para la vista previa del constructor. */
export const datos = asyncHandler(async (req, res) => {
  res.json(await datosInforme(req.repositorio, filtrosDe(req), { usuario: req.usuario }));
});

/** GET /api/informes/exportar?formato=pdf|csv */
export const exportar = asyncHandler(async (req, res) => {
  const formato = req.query.formato === 'csv' ? 'csv' : 'pdf';
  const datos = await datosInforme(req.repositorio, filtrosDe(req), {
    usuario: req.usuario
  });

  const archivo = nombreArchivo(datos, formato);
  res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);

  if (formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send(generarCSV(datos));
  }

  const motor = await resolverMotorPdf(req.repositorio, req.query.pdf);
  const graficos = {
    barras: req.query.barras !== 'false',
    pastel: req.query.pastel !== 'false',
    serie: req.query.serie !== 'false',
    comparacion: req.query.comparacion !== 'false',
    detalle: req.query.detalle !== 'false'
  };
  const pdf = await generarPDF(datos, {
    motor,
    graficos,
    generadoPor: req.usuario?.nombre || req.usuario?.username || ''
  });
  res.setHeader('Content-Type', 'application/pdf');
  return res.send(pdf);
});

/** GET /api/informes/estilo.css: márgenes, logo y pie efectivos. */
export const estilo = asyncHandler(async (req, res) => {
  const plantilla = await plantillaInforme(req.repositorio);
  const pie = textoCss(plantilla.pieTexto);
  const x = Number(plantilla.logoDesplazamientoX) || 0;
  const y = Number(plantilla.logoDesplazamientoY) || 0;
  const ancho = Number(plantilla.logoAncho) || 90;
  const acento = paletaAcento(plantilla.colorAcento);
  const contenido = `:root {
  --inf-acento: ${acento.acento};
  --inf-acento-suave: ${acento.suave};
  --inf-acento-medio: ${acento.medio};
  --inf-serie-1: ${acento.acento};
}
@page {
  size: A4;
  margin: ${plantilla.margenSuperior}mm ${plantilla.margenDerecho}mm ${plantilla.margenInferior}mm ${plantilla.margenIzquierdo}mm;
}
@page {
  @bottom-center {
    content: "${pie} · página " counter(page) " de " counter(pages);
    font-family: 'Source Sans 3', 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 8pt;
    color: #566474;
  }
}
.informe-logo {
  width: ${ancho}px;
  max-width: 42%;
  height: auto;
}
.informe-logo-izquierda {
  float: left;
  margin: ${y}px 14px 10px ${x}px;
}
.informe-logo-derecha {
  float: right;
  margin: ${y}px ${x}px 10px 14px;
}
.informe-logo-centro {
  display: block;
  margin: ${y}px auto 12px;
}
`;
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(contenido);
});

/** POST /api/admin/informes/logo: guarda el logo y devuelve su URL. */
export const subirLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.solicitudInvalida('Selecciona una imagen para el logo');
  if (!['image/png', 'image/jpeg'].includes(String(req.file.mimetype || ''))) {
    await descartar(req.file);
    throw AppError.solicitudInvalida('El logo debe ser una imagen PNG o JPG');
  }
  const [logo] = await validarArchivos([req.file]);
  res.status(201).json({ logo });
});
