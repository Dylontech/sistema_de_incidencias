/**
 * PDF de una incidencia concreta para el personal.
 *
 * Incluye la ficha, la evidencia fotográfica, la solución con su costo y
 * documentos, y el historial. Los comentarios no forman parte del informe.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { crearPdfIncidencia } from './pdf/pdf-informes.mjs';
import { datosIncidenciaPdf, disenoDesdePlantilla, leerLogo, optimizarImagen } from './pdf/adaptadores.js';

const PAGINA = { ancho: 595.28, alto: 841.89 };
const MM = 72 / 25.4;
const PRIMARIO = '#006657';
const TINTA = '#1e293b';
const SUAVE = '#64748b';
const BORDE = '#cbd5e1';

const ETIQUETAS_ESTADO = {
  reportada: 'Reportada',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta'
};

const ETIQUETAS_AMBITO = {
  urbano: 'Zona urbana o municipal',
  carretera_estatal: 'Carretera estatal',
  carretera_federal: 'Carretera federal',
  autopista: 'Autopista',
  camino_rural: 'Camino rural',
  otro: 'Otra vialidad'
};

function fecha(iso) {
  if (!iso) return '—';
  const valor = new Date(iso);
  return Number.isNaN(valor.getTime())
    ? '—'
    : valor.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function dinero(valor) {
  if (valor === null || valor === undefined || valor === '') return 'No registrado';
  return Number(valor).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

async function bufferLogo(plantilla = {}) {
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(String(plantilla.logoUrl || ''))) return null;
  try {
    return await fs.readFile(path.join(config.paths.uploads, path.basename(plantilla.logoUrl)));
  } catch {
    return null;
  }
}

/** Lee una evidencia del directorio de uploads sin aceptar rutas externas. */
async function bufferEvidencia(url) {
  const nombre = path.basename(String(url || ''));
  if (!nombre || !/^[A-Za-z0-9._-]+$/.test(nombre)) return null;
  try {
    return await fs.readFile(path.join(config.paths.uploads, nombre));
  } catch {
    return null;
  }
}

function esImagen(archivo = {}) {
  return String(archivo.tipo || '').startsWith('image/');
}

/**
 * PDFKit solo incrusta PNG y JPEG. Un PNG con el CRC dañado puede lanzar un
 * `Z_DATA_ERROR` asíncrono que tumba el proceso, así que se valida antes.
 */
function imagenIncrustable(buffer, tipo) {
  if (!buffer?.length) return false;
  if (tipo === 'image/png') {
    if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
    let offset = 8;
    const datos = [];
    while (offset + 8 <= buffer.length) {
      const largo = buffer.readUInt32BE(offset);
      const nombre = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      const inicio = offset + 8;
      const fin = inicio + largo;
      if (fin + 4 > buffer.length) return false;
      if (nombre === 'IDAT') datos.push(buffer.subarray(inicio, fin));
      offset = fin + 4;
      if (nombre === 'IEND') break;
    }
    if (!datos.length) return false;
    try {
      zlib.inflateSync(Buffer.concat(datos));
      return true;
    } catch {
      return false;
    }
  }
  if (tipo === 'image/jpeg') {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[buffer.length - 2] === 0xff &&
      buffer[buffer.length - 1] === 0xd9
    );
  }
  return false;
}

function margenes(plantilla = {}) {
  const mm = (valor, porDefecto) => (Number(valor) || porDefecto) * MM;
  return {
    top: mm(plantilla.margenSuperior, 18),
    right: mm(plantilla.margenDerecho, 15),
    bottom: mm(plantilla.margenInferior, 18),
    left: mm(plantilla.margenIzquierdo, 15)
  };
}

/** Devuelve un Buffer con el PDF de la incidencia. */
async function generarPDFIncidenciaClasico(incidencia = {}, plantilla = {}) {
  const logo = await bufferLogo(plantilla);
  const margen = margenes(plantilla);
  const anchoUtil = PAGINA.ancho - margen.left - margen.right;
  const yMax = PAGINA.alto - margen.bottom;

  const conBuffer = async (archivos = []) =>
    Promise.all(
      (archivos || []).map(async (archivo) => {
        const buffer = await bufferEvidencia(archivo.url);
        return {
          ...archivo,
          buffer:
            esImagen(archivo) && imagenIncrustable(buffer, archivo.tipo) ? buffer : null
        };
      })
    );
  const evidenciasReporte = await conBuffer(incidencia.evidencia || []);
  const evidenciasSolucion = await conBuffer(
    incidencia.documentosResolucion || incidencia.evidenciaSolucion || []
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: margen,
      bufferPages: true,
      info: {
        Title: `Incidencia ${incidencia.folio || ''}`,
        Author: 'Sistema de Incidencias Municipales'
      }
    });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const espacio = (alto = 40) => {
      if (doc.y + alto > yMax) doc.addPage();
    };
    const campo = (etiqueta, valor) => {
      espacio(16);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(SUAVE).text(etiqueta, margen.left, y, {
        width: 120,
        lineBreak: false
      });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(TINTA)
        .text(String(valor ?? '—'), margen.left + 124, y, { width: anchoUtil - 124 });
      doc.y = Math.max(doc.y, y + 13);
    };
    const titulo = (texto) => {
      espacio(30);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARIO).text(texto);
      doc.moveDown(0.1);
      const linea = doc.y;
      doc
        .moveTo(margen.left, linea)
        .lineTo(margen.left + anchoUtil, linea)
        .lineWidth(0.6)
        .strokeColor(BORDE)
        .stroke();
      doc.moveDown(0.4);
    };

    /**
     * Galería de evidencias: las imágenes se incrustan en un marco fijo y los
     * documentos que no son imagen se listan con su nombre y tamaño.
     */
    const galeria = (archivos = []) => {
      const pendientes = [];
      for (const archivo of archivos) {
        if (!archivo.buffer) {
          pendientes.push(archivo);
          continue;
        }
        const buffer = archivo.buffer;
        const ancho = Math.min(240, anchoUtil);
        const alto = 160;
        espacio(alto + 24);
        const x = margen.left + (anchoUtil - ancho) / 2;
        const y = doc.y;
        doc.save();
        doc.rect(x, y, ancho, alto).lineWidth(0.7).strokeColor(BORDE).stroke();
        try {
          doc.image(buffer, x + 3, y + 3, {
            fit: [ancho - 6, alto - 6],
            align: 'center',
            valign: 'center'
          });
        } catch {
          pendientes.push(archivo);
          doc.restore();
          continue;
        }
        doc.restore();
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(SUAVE)
          .text(String(archivo.nombre || 'Evidencia'), x, y + alto + 3, {
            width: ancho,
            align: 'center',
            lineBreak: false
          });
        doc.y = y + alto + 18;
      }
      for (const archivo of pendientes) {
        espacio(14);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(TINTA)
          .text(
            `• ${archivo.nombre || 'Documento'}${
              archivo.tamano ? ` (${Math.max(1, Math.round(archivo.tamano / 1024))} KB)` : ''
            }`,
            { width: anchoUtil }
          );
      }
    };

    try {
      // Cabecera
      doc.rect(0, 0, PAGINA.ancho, 92).fill(PRIMARIO);
      if (logo) {
        try {
          doc.image(logo, margen.left, 16, { fit: [70, 50] });
        } catch {
          // Un logo dañado no impide generar el PDF.
        }
      }
      const textoX = logo ? margen.left + 84 : margen.left;
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(17)
        .text('Informe de incidencia', textoX, 24, { width: anchoUtil - 84 });
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(`${incidencia.folio || ''} · ${ETIQUETAS_ESTADO[incidencia.estado] || incidencia.estado}`, textoX, 48, {
          width: anchoUtil - 84
        });
      doc.fillColor(TINTA);
      doc.y = 112;

      doc.font('Helvetica-Bold').fontSize(14).fillColor(TINTA).text(incidencia.titulo || 'Sin título');
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(SUAVE)
        .text(`Generado: ${fecha(new Date().toISOString())}`);
      doc.moveDown(0.8);

      titulo('Datos del reporte');
      campo('Tipo', incidencia.tipo?.nombre || incidencia.tipoId || '—');
      campo('Fecha', fecha(incidencia.fecha));
      campo('Municipio', incidencia.municipioNombre || incidencia.municipioId || '—');
      campo('Comunidad', incidencia.zonaNombre || '—');
      campo('Ámbito', ETIQUETAS_AMBITO[incidencia.ambito] || incidencia.ambito || 'Zona urbana');
      if (incidencia.viaNombre) campo('Vía', incidencia.viaNombre);
      if (incidencia.kilometro !== null && incidencia.kilometro !== undefined) {
        campo('Kilómetro', incidencia.kilometro);
      }
      campo(
        'Ubicación',
        incidencia.lat && incidencia.lng ? `${incidencia.lat}, ${incidencia.lng}` : '—'
      );
      campo('Reportado por', incidencia.esAnonimo ? 'Anónimo' : incidencia.autorNombre || '—');
      if (incidencia.peligrosa) campo('Observación', '⚠️ Reporte marcado como peligroso');
      if (incidencia.oculta) campo('Moderación', `Oculto: ${incidencia.ocultaMotivo || 'sin motivo'}`);

      titulo('Descripción del reporte');
      doc.font('Helvetica').fontSize(9).fillColor(TINTA).text(incidencia.descripcion || '—', {
        width: anchoUtil
      });
      if (incidencia.indicaciones) {
        doc.moveDown(0.4);
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(SUAVE).text(
          `Indicaciones: ${incidencia.indicaciones}`,
          { width: anchoUtil }
        );
      }

      if (incidencia.evidencia?.length) {
        titulo(`Evidencia del reporte (${incidencia.evidencia.length})`);
        galeria(evidenciasReporte);
      }
      if (incidencia.estado === 'resuelta') {
        titulo('Solución aplicada');
        campo('Fecha de resolución', fecha(incidencia.fechaResolucion));
        campo('Costo de reparación', dinero(incidencia.costoReparacion));
        const desglose = Array.isArray(incidencia.desgloseCostos) ? incidencia.desgloseCostos : [];
        if (desglose.length) {
          doc.moveDown(0.4);
          doc.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARIO).text('Desglose por concepto');
          for (const item of desglose) {
            doc
              .font('Helvetica')
              .fontSize(8.5)
              .fillColor(TINTA)
              .text(
                `${item.concepto || 'Concepto'}: ${dinero(item.monto)}${
                  item.nota ? ` · ${item.nota}` : ''
                }`,
                { width: anchoUtil }
              );
          }
        }
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(9).fillColor(TINTA).text(incidencia.solucion || '—', {
          width: anchoUtil
        });
        const documentos = incidencia.documentosResolucion || incidencia.evidenciaSolucion || [];
        if (documentos.length) {
          doc.moveDown(0.4);
          doc.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARIO).text('Documentos de la resolución');
          galeria(evidenciasSolucion);
        }
      }

      const historial = incidencia.historial || [];
      if (historial.length) {
        titulo(`Historial (${historial.length})`);
        for (const paso of historial) {
          espacio(28);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TINTA).text(paso.accion || '—', {
            width: anchoUtil
          });
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(SUAVE)
            .text(`${fecha(paso.fecha)} · ${paso.por || '—'}`, { width: anchoUtil });
          doc.moveDown(0.3);
        }
      }

      // Pie en todas las páginas. Se anula el margen inferior mientras se
      // dibuja para que PDFKit no interprete el pie como un desbordamiento y
      // agregue una página en blanco.
      const rango = doc.bufferedPageRange();
      const pie = String(plantilla.pieTexto || 'Sistema de Incidencias Municipales');
      for (let i = rango.start; i < rango.start + rango.count; i += 1) {
        doc.switchToPage(i);
        const margenInferior = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(SUAVE)
          .text(
            `${pie} · página ${i + 1} de ${rango.count}`,
            margen.left,
            PAGINA.alto - 24,
            { width: anchoUtil, align: 'center', lineBreak: false }
          );
        doc.page.margins.bottom = margenInferior;
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Genera el PDF de una incidencia con la versión elegida.
 *
 * `opciones.repositorio` permite resolver el nombre del tipo y del municipio;
 * sin él, el documento cae a los identificadores (nunca falla por eso).
 */
export async function generarPDFIncidencia(incidencia = {}, plantilla = {}, opciones = {}) {
  if (opciones.motor === 'v1') return generarPDFIncidenciaClasico(incidencia, plantilla);

  const repositorio = opciones.repositorio || null;
  const [tipo, municipio] = await Promise.all([
    repositorio && incidencia.tipoId ? repositorio.tipoPorId(incidencia.tipoId) : null,
    repositorio && incidencia.municipioId ? repositorio.municipioPorId(incidencia.municipioId) : null
  ]);

  return crearPdfIncidencia(datosIncidenciaPdf(incidencia, { tipo, municipio }), {
    diseno: disenoDesdePlantilla(plantilla),
    logo: await leerLogo(plantilla),
    optimizarImagen,
    ...(opciones.generado ? { generado: opciones.generado } : {}),
    ...(opciones.zonaHoraria ? { zonaHoraria: opciones.zonaHoraria } : {})
  });
}
