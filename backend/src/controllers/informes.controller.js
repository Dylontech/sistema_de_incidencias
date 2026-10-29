/** Controlador de exportación de informes en PDF/CSV para el personal. */
import { AppError, asyncHandler } from '../utils/AppError.js';
import { datosInforme, generarCSV, nombreArchivo } from '../services/informes.service.js';
import { generarPDF } from '../services/pdf.service.js';
import { plantillaInforme } from '../services/configuracion.service.js';
import { descartar, validarArchivos } from '../services/uploads.service.js';

/** Escapa un valor para usarlo dentro de una cadena CSS. */
function textoCss(valor) {
  return String(valor || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}

function filtrosDe(req) {
  return {
    municipioId: req.query.municipio || null,
    estadoEntidad: req.query.estadoEntidad || null,
    ambito: req.query.ambito || 'todos',
    tipos: req.query.tipos || [],
    desde: req.query.desde || null,
    hasta: req.query.hasta || null
  };
}

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

  const pdf = await generarPDF(datos);
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
  const contenido = `@page {
  size: A4;
  margin: ${plantilla.margenSuperior}mm ${plantilla.margenDerecho}mm ${plantilla.margenInferior}mm ${plantilla.margenIzquierdo}mm;
}
@page {
  @bottom-center {
    content: "${pie} · página " counter(page) " de " counter(pages);
    font-family: 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 8pt;
    color: #64748b;
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
