/**
 * Generación de PDF con pdfkit (open source, sin servicios externos).
 *
 * El documento incluye portada con filtros, indicadores, desglose por tipo y
 * por municipio, y el detalle de las incidencias. No incluye datos personales
 * de quienes reportaron.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';

const PAGINA = { ancho: 595.28, alto: 841.89 };
const MM = 72 / 25.4;

const COLOR_PRIMARIO = '#006657';
const COLOR_TINTA = '#1e293b';
const COLOR_SUAVE = '#64748b';
const COLOR_BORDE = '#cbd5e1';

function milimetros(valor, porDefecto) {
  const numero = Number(valor);
  return (Number.isFinite(numero) ? numero : porDefecto) * MM;
}

/** Márgenes y medidas efectivas del informe. */
function layoutDe(datos) {
  const plantilla = datos.plantilla || {};
  const margenes = {
    superior: milimetros(plantilla.margenSuperior, 18),
    derecho: milimetros(plantilla.margenDerecho, 15),
    inferior: milimetros(plantilla.margenInferior, 18),
    izquierdo: milimetros(plantilla.margenIzquierdo, 15)
  };
  return {
    margenes,
    anchoUtil: PAGINA.ancho - margenes.izquierdo - margenes.derecho,
    yMax: PAGINA.alto - margenes.inferior
  };
}

/** Lee el logo desde /uploads; cualquier valor raro se ignora. */
async function bufferLogo(plantilla = {}) {
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(String(plantilla.logoUrl || ''))) return null;
  try {
    return await fs.readFile(
      path.join(config.paths.uploads, path.basename(plantilla.logoUrl))
    );
  } catch {
    return null;
  }
}

function fechaCorta(iso) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function encabezado(doc, datos, layout, logo) {
  const plantilla = datos.plantilla || {};
  const posicion = plantilla.logoPosicion || 'izquierda';
  const alto = posicion === 'centro' && logo ? 136 : 96;
  const anchoLogo = logo
    ? Math.min(Number(plantilla.logoAncho) || 90, layout.anchoUtil * 0.35)
    : 0;
  doc.rect(0, 0, PAGINA.ancho, alto).fill(COLOR_PRIMARIO);

  if (logo) {
    const ajusteX = (Number(plantilla.logoDesplazamientoX) || 0) * (72 / 96);
    const ajusteY = (Number(plantilla.logoDesplazamientoY) || 0) * (72 / 96);
    const baseX =
      posicion === 'derecha'
        ? PAGINA.ancho - layout.margenes.derecho - anchoLogo
        : posicion === 'centro'
          ? (PAGINA.ancho - anchoLogo) / 2
          : layout.margenes.izquierdo;
    const baseY = posicion === 'centro' ? 12 : 18;
    try {
      doc.image(logo, baseX + ajusteX, baseY + ajusteY, { fit: [anchoLogo, 56] });
    } catch {
      // Un logo antiguo o dañado no debe impedir generar el informe.
    }
  }

  const textoX = posicion === 'izquierda' && logo
    ? layout.margenes.izquierdo + anchoLogo + 12
    : layout.margenes.izquierdo;
  const textoAncho =
    layout.anchoUtil - (logo && posicion !== 'centro' ? anchoLogo + 12 : 0);
  const primerTexto = posicion === 'centro' && logo ? 74 : 30;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(
    'Sistema de Incidencias Municipales',
    textoX,
    primerTexto,
    { width: textoAncho }
  );
  doc.font('Helvetica').fontSize(11).text('Informe de incidencias', textoX, primerTexto + 26, {
    width: textoAncho
  });
  doc
    .fontSize(9)
    .text(`Generado: ${new Date(datos.generadoEn).toLocaleString('es-MX')}`, textoX, primerTexto + 42, {
      width: textoAncho,
      align: 'right'
    });
  doc.fillColor(COLOR_TINTA);
  doc.y = Math.max(alto + 20, layout.margenes.superior);
}

function bloqueFiltros(doc, datos) {
  const filtros = [];
  if (datos.filtros.municipios?.length) filtros.push(`Municipios: ${datos.filtros.municipios.join(', ')}`);
  if (datos.filtros.estados?.length) filtros.push(`Estados: ${datos.filtros.estados.join(', ')}`);
  if (datos.filtros.desde) filtros.push(`Desde: ${datos.filtros.desde}`);
  if (datos.filtros.hasta) filtros.push(`Hasta: ${datos.filtros.hasta}`);
  if (datos.filtros.ambitos?.length) filtros.push(`Ámbitos: ${datos.filtros.ambitos.join(', ')}`);
  else if (datos.filtros.ambito !== 'todos') filtros.push(`Ámbito: ${datos.filtros.ambito}`);
  if (datos.filtros.tipos.length) filtros.push(`Tipos: ${datos.filtros.tipos.length}`);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_PRIMARIO).text('Filtros del informe');
  doc.moveDown(0.25);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLOR_SUAVE)
    .text(filtros.length ? filtros.join('   ·   ') : 'Sin filtros (todas las incidencias)');
  doc.moveDown(0.8);
}

function tarjetas(doc, resumen, layout) {
  const datos = [
    ['Total', resumen.total],
    ['Reportadas', resumen.reportadas],
    ['En proceso', resumen.enProceso],
    ['Resueltas', resumen.resueltas],
    ['Críticas (+30 d)', resumen.criticas],
    ['Viales', resumen.viales]
  ];
  const ancho = layout.anchoUtil / datos.length;
  const y = doc.y;
  datos.forEach(([etiqueta, valor], indice) => {
    const x = layout.margenes.izquierdo + indice * ancho;
    doc.rect(x, y, ancho - 4, 44).fillAndStroke('#f8fafc', COLOR_BORDE);
    doc
      .fillColor(COLOR_TINTA)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(String(valor), x + 8, y + 8, { width: ancho - 20 });
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLOR_SUAVE)
      .text(etiqueta.toUpperCase(), x + 8, y + 27, { width: ancho - 20 });
  });
  doc.y = y + 58;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLOR_SUAVE)
    .text(`Tasa de resolución: ${resumen.tasaResolucion}%`);
  doc.moveDown(0.7);
}

function asegurarEspacio(doc, layout, alto = 40) {
  if (doc.y + alto > layout.yMax) doc.addPage();
}

function tabla(doc, titulo, cabeceras, pesos, filas, layout) {
  asegurarEspacio(doc, layout, 60);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_PRIMARIO).text(titulo);
  doc.moveDown(0.3);
  const yCabecera = doc.y;
  const suma = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((peso) => (peso / suma) * layout.anchoUtil);
  let x = layout.margenes.izquierdo;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_SUAVE);
  cabeceras.forEach((cabecera, i) => {
    doc.text(cabecera, x, yCabecera, { width: anchos[i], align: i === 0 ? 'left' : 'right' });
    x += anchos[i];
  });
  doc
    .moveTo(layout.margenes.izquierdo, yCabecera + 12)
    .lineTo(layout.margenes.izquierdo + layout.anchoUtil, yCabecera + 12)
    .strokeColor(COLOR_BORDE)
    .stroke();
  doc.y = yCabecera + 16;

  doc.font('Helvetica').fontSize(8).fillColor(COLOR_TINTA);
  for (const fila of filas) {
    asegurarEspacio(doc, layout, 18);
    const y = doc.y;
    let xFila = layout.margenes.izquierdo;
    fila.forEach((valor, i) => {
      doc.text(String(valor ?? '—'), xFila, y, {
        width: anchos[i] - 4,
        align: i === 0 ? 'left' : 'right',
        ellipsis: true,
        lineBreak: false
      });
      xFila += anchos[i];
    });
    doc.y = y + 13;
  }
  doc.moveDown(0.7);
}

function detalle(doc, datos, layout) {
  asegurarEspacio(doc, layout, 70);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_PRIMARIO).text('Detalle de incidencias');
  doc.moveDown(0.3);
  const cabeceras = ['Fecha', 'Tipo', 'Título', 'Municipio', 'Estado'];
  const anchos = [55, 92, 190, 105, 69].map((peso) => (peso / 511) * layout.anchoUtil);
  let x = layout.margenes.izquierdo;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_SUAVE);
  const yCabecera = doc.y;
  cabeceras.forEach((cabecera, i) => {
    doc.text(cabecera, x, yCabecera, { width: anchos[i] });
    x += anchos[i];
  });
  doc
    .moveTo(layout.margenes.izquierdo, yCabecera + 12)
    .lineTo(layout.margenes.izquierdo + layout.anchoUtil, yCabecera + 12)
    .strokeColor(COLOR_BORDE)
    .stroke();
  doc.y = yCabecera + 16;

  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_TINTA);
  for (const inc of datos.detalle) {
    asegurarEspacio(doc, layout, 16);
    const y = doc.y;
    const valores = [fechaCorta(inc.fecha), inc.tipo, inc.titulo, inc.municipio, inc.estado];
    let xFila = layout.margenes.izquierdo;
    valores.forEach((valor, i) => {
      doc.text(String(valor ?? '—'), xFila, y, {
        width: anchos[i] - 4,
        ellipsis: true,
        lineBreak: false
      });
      xFila += anchos[i];
    });
    doc.y = y + 12;
  }
  if (datos.detalle.length === 1500) {
    doc
      .moveDown(0.5)
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(COLOR_SUAVE)
      .text('El detalle se limita a 1 500 incidencias. Usa los filtros para acotar el informe.');
  }
}

function pieDePagina(doc, layout, plantilla) {
  const rango = doc.bufferedPageRange?.() || { start: 0, count: 1 };
  const pie = String(plantilla?.pieTexto || 'Sistema de Incidencias Municipales');
  for (let i = rango.start; i < rango.start + rango.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLOR_SUAVE)
      .text(
        `${pie} · página ${i + 1} de ${rango.count}`,
        layout.margenes.izquierdo,
        PAGINA.alto - layout.margenes.inferior / 2 - 4,
        { width: layout.anchoUtil, align: 'center', lineBreak: false, ellipsis: true }
      );
  }
}

/** Devuelve un Buffer con el PDF completo. */
export async function generarPDF(datos) {
  const layout = layoutDe(datos);
  const logo = await bufferLogo(datos.plantilla);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: layout.margenes.superior,
        right: layout.margenes.derecho,
        bottom: layout.margenes.inferior,
        left: layout.margenes.izquierdo
      },
      bufferPages: true,
      info: {
        Title: 'Informe de incidencias',
        Author: 'Sistema de Incidencias Municipales',
        Subject: 'Informe público de incidencias'
      }
    });

    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    try {
      encabezado(doc, datos, layout, logo);
      bloqueFiltros(doc, datos);
      tarjetas(doc, datos.resumen, layout);

      tabla(
        doc,
        'Desglose por tipo',
        ['Tipo', 'Total', 'Resueltas', 'Pendientes', '%'],
        [230, 70, 80, 80, 60],
        datos.porTipo.map((f) => [f.nombre, f.total, f.resueltas, f.pendientes, `${f.porcentaje}%`]),
        layout
      );

      tabla(
        doc,
        'Desglose por municipio',
        ['Municipio', 'Entidad', 'Total', 'Resueltas'],
        [170, 160, 70, 80],
        datos.porMunicipio.map((f) => [f.municipio, f.estado, f.total, f.resueltas]),
        layout
      );

      detalle(doc, datos, layout);
      pieDePagina(doc, layout, datos.plantilla);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
