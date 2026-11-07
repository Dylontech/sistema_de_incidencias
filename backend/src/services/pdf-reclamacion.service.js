/**
 * Informe preliminar de una reclamación.
 *
 * Documento breve para informar al funcionario y a la persona que reclamó: qué
 * se reclamó, qué decició la administración y en qué quedó la incidencia.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { crearPdfReclamacion } from './pdf/pdf-informes.mjs';
import { datosReclamacionPdf, disenoDesdePlantilla, leerLogo, optimizarImagen } from './pdf/adaptadores.js';

const PAGINA = { ancho: 595.28, alto: 841.89 };
const MM = 72 / 25.4;
const PRIMARIO = '#006657';
const TINTA = '#1e293b';
const SUAVE = '#64748b';

const MOTIVOS = {
  no_resuelta: 'La incidencia no quedó resuelta',
  solucion_incompleta: 'La solución fue incompleta',
  danos_no_reparados: 'Los daños siguen sin repararse',
  otro: 'Otro motivo'
};

const DECISIONES = {
  revertir: 'Reclamación aceptada: la incidencia se reabre',
  mantener: 'Reclamación revisada: la incidencia se mantiene resuelta'
};

function fecha(iso) {
  if (!iso) return '—';
  const valor = new Date(iso);
  return Number.isNaN(valor.getTime())
    ? '—'
    : valor.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

async function bufferLogo(plantilla = {}) {
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(String(plantilla.logoUrl || ''))) return null;
  try {
    return await fs.readFile(path.join(config.paths.uploads, path.basename(plantilla.logoUrl)));
  } catch {
    return null;
  }
}

/** Devuelve el PDF (Buffer) del informe preliminar. */
async function generarPDFReclamacionClasico(reclamacion = {}, incidencia = {}, plantilla = {}) {
  const logo = await bufferLogo(plantilla);
  const margen = {
    top: (Number(plantilla.margenSuperior) || 18) * MM,
    right: (Number(plantilla.margenDerecho) || 15) * MM,
    bottom: (Number(plantilla.margenInferior) || 18) * MM,
    left: (Number(plantilla.margenIzquierdo) || 15) * MM
  };
  const ancho = PAGINA.ancho - margen.left - margen.right;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: margen, bufferPages: true });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const campo = (etiqueta, valor) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(SUAVE).text(etiqueta, margen.left, y, {
        width: 130,
        lineBreak: false
      });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(TINTA)
        .text(String(valor ?? '—'), margen.left + 134, y, { width: ancho - 134 });
      doc.y = Math.max(doc.y, y + 14);
    };
    const titulo = (texto) => {
      doc.moveDown(0.7);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARIO).text(texto);
      doc.moveDown(0.25);
    };

    try {
      doc.rect(0, 0, PAGINA.ancho, 90).fill(PRIMARIO);
      if (logo) {
        try {
          doc.image(logo, margen.left, 16, { fit: [70, 48] });
        } catch {
          // Logo dañado: se omite.
        }
      }
      const x = logo ? margen.left + 84 : margen.left;
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(17)
        .text('Informe preliminar de reclamación', x, 26, { width: ancho - 84 });
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(reclamacion.incidenciaTitulo || 'Incidencia', x, 50, { width: ancho - 84 });
      doc.fillColor(TINTA);
      doc.y = 112;

      titulo('Reclamación');
      campo('Folio de la incidencia', incidencia.folio || reclamacion.incidenciaId);
      campo('Presentada por', reclamacion.nombre || reclamacion.username || 'Cuenta');
      campo('Fecha', fecha(reclamacion.creadoEn));
      campo('Motivo', MOTIVOS[reclamacion.motivo] || reclamacion.motivo);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(9).fillColor(TINTA).text(reclamacion.detalle || '—', {
        width: ancho
      });

      titulo('Decisión');
      campo('Resultado', DECISIONES[reclamacion.decision] || 'Pendiente de decisión');
      campo('Resolvió', reclamacion.resueltoPor || '—');
      campo('Fecha de decisión', fecha(reclamacion.resueltoEn));
      if (reclamacion.delegadoA) campo('Delegada a', reclamacion.delegadoA);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(9).fillColor(TINTA).text(reclamacion.respuesta || '—', {
        width: ancho
      });

      titulo('Estado de la incidencia');
      campo('Título', incidencia.titulo || '—');
      campo('Estado actual', incidencia.estado || '—');
      campo('Municipio', incidencia.municipioNombre || incidencia.municipioId || '—');
      if (incidencia.solucion) {
        campo('Solución registrada', incidencia.solucion);
      }
      if (incidencia.costoReparacion !== null && incidencia.costoReparacion !== undefined) {
        campo(
          'Costo de reparación',
          Number(incidencia.costoReparacion).toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
          })
        );
      }

      doc.moveDown(2);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(SUAVE)
        .text(
          'Este informe es preliminar y forma parte del expediente de la incidencia. ' +
            'La decisión queda registrada en el historial del reporte.',
          { width: ancho }
        );

      const rango = doc.bufferedPageRange();
      const pie = String(plantilla.pieTexto || 'Sistema de Incidencias Municipales');
      for (let i = rango.start; i < rango.start + rango.count; i += 1) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(SUAVE)
          .text(
            `${pie} · página ${i + 1} de ${rango.count}`,
            margen.left,
            PAGINA.alto - margen.bottom / 2 - 4,
            { width: ancho, align: 'center', lineBreak: false }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/** Genera el informe preliminar con la versión de PDF elegida. */
export async function generarPDFReclamacion(reclamacion = {}, incidencia = {}, plantilla = {}, opciones = {}) {
  if (opciones.motor === 'v1') {
    return generarPDFReclamacionClasico(reclamacion, incidencia, plantilla);
  }

  const repositorio = opciones.repositorio || null;
  const [tipo, municipio] = await Promise.all([
    repositorio && incidencia.tipoId ? repositorio.tipoPorId(incidencia.tipoId) : null,
    repositorio && incidencia.municipioId ? repositorio.municipioPorId(incidencia.municipioId) : null
  ]);

  return crearPdfReclamacion(datosReclamacionPdf(reclamacion, incidencia, { tipo, municipio }), {
    diseno: disenoDesdePlantilla(plantilla),
    logo: await leerLogo(plantilla),
    optimizarImagen
  });
}
