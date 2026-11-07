/**
 * Informes de la bitácora de auditoría.
 *
 * El PDF es una tabla apaisada pensada para revisión y archivo; el CSV
 * conserva todos los campos y puede abrirse en una hoja de cálculo. Ambos usan
 * exactamente los filtros de la consulta (fecha, método y autor).
 */
import PDFDocument from 'pdfkit';
import { AppError } from '../utils/AppError.js';

const ETIQUETAS = {
  POST: 'Alta',
  PUT: 'Reemplazo',
  PATCH: 'Cambio',
  DELETE: 'Baja'
};

function fechaDe(valor) {
  const fecha = new Date(valor || Date.now());
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-MX');
}

function limpiarTexto(valor, max = 300) {
  return String(valor ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function detalleLegible(valor) {
  if (!valor) return '';
  try {
    const datos = typeof valor === 'string' ? JSON.parse(valor) : valor;
    return limpiarTexto(JSON.stringify(datos), 240);
  } catch {
    return limpiarTexto(valor, 240);
  }
}

function filtrosLegibles(filtros = {}) {
  const partes = [];
  if (filtros.desde) partes.push(`Desde ${filtros.desde}`);
  if (filtros.hasta) partes.push(`Hasta ${filtros.hasta}`);
  if (filtros.metodo) partes.push(`Tipo ${filtros.metodo}`);
  if (filtros.username) partes.push(`Autor ${filtros.username}`);
  if (filtros.accion) partes.push(`Acción ${filtros.accion}`);
  return partes.length ? partes.join(' · ') : 'Sin filtros';
}

const COLUMNAS = [
  { clave: 'fecha', etiqueta: 'Fecha', ancho: 92 },
  { clave: 'autor', etiqueta: 'Autor', ancho: 95 },
  { clave: 'rol', etiqueta: 'Rol', ancho: 78 },
  { clave: 'metodo', etiqueta: 'Tipo', ancho: 48 },
  { clave: 'accion', etiqueta: 'Acción / ruta', ancho: 235 },
  { clave: 'entidad', etiqueta: 'Entidad', ancho: 100 },
  { clave: 'estado', etiqueta: 'HTTP', ancho: 40 },
  { clave: 'clave', etiqueta: 'Clave', ancho: 90 }
];

function filaCSV(valor) {
  let texto = String(valor ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export function generarCSV(registros = [], filtros = {}) {
  const lineas = [
    ['Fecha', 'Autor', 'Rol', 'Tipo', 'Acción / ruta', 'Entidad', 'ID entidad', 'HTTP', 'Clave', 'Huella IP', 'Detalle'].map(filaCSV).join(','),
    ...registros.map((registro) =>
      [
        fechaDe(registro.creadoEn),
        registro.username || registro.userKey || '',
        registro.rol || '',
        ETIQUETAS[registro.metodo] || registro.metodo || '',
        registro.accion || registro.ruta || '',
        registro.entidad || '',
        registro.entidadId || '',
        registro.estadoHttp ?? '',
        registro.claveCodigo || registro.claveId || '',
        registro.ipHash || '',
        detalleLegible(registro.detalle)
      ]
        .map(filaCSV)
        .join(',')
    )
  ];
  const cabecera = `Informe de auditoría;${filtrosLegibles(filtros)};${registros.length} registro(s)`;
  return `\uFEFF${filaCSV(cabecera)}\r\n${lineas.join('\r\n')}\r\n`;
}

export function generarPDF(registros = [], filtros = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 30, right: 28, bottom: 30, left: 28 },
      bufferPages: true,
      info: {
        Title: 'Informe de auditoría',
        Author: 'Sistema de Incidencias Municipales',
        Subject: 'Bitácora de acciones administrativas'
      }
    });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    try {
      const anchoUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const xInicial = doc.page.margins.left;
      let y = doc.page.margins.top;

      doc.font('Helvetica-Bold').fontSize(17).fillColor('#0f172a');
      doc.text('Informe de auditoría', xInicial, y, { width: anchoUtil });
      y += 25;
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(`Generado: ${fechaDe(new Date().toISOString())} · ${filtrosLegibles(filtros)}`, xInicial, y, {
        width: anchoUtil
      });
      y += 15;
      doc.text(`Registros incluidos: ${registros.length}`, xInicial, y, { width: anchoUtil });
      y += 20;

      const dibujarCabecera = () => {
        let x = xInicial;
        doc.rect(xInicial, y, anchoUtil, 18).fill('#e2e8f0');
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
        for (const columna of COLUMNAS) {
          doc.text(columna.etiqueta, x + 3, y + 5, {
            width: columna.ancho - 6,
            height: 9,
            ellipsis: true,
            lineBreak: false
          });
          x += columna.ancho;
        }
        y += 18;
      };

      const nuevaPagina = () => {
        doc.addPage({ size: 'A4', layout: 'landscape' });
        y = doc.page.margins.top;
        dibujarCabecera();
      };

      dibujarCabecera();
      for (let indice = 0; indice < registros.length; indice += 1) {
        const registro = registros[indice];
        if (y > doc.page.height - doc.page.margins.bottom - 20) nuevaPagina();
        const valores = {
          fecha: fechaDe(registro.creadoEn),
          autor: registro.username || registro.userKey || '—',
          rol: registro.rol || '—',
          metodo: ETIQUETAS[registro.metodo] || registro.metodo || '—',
          accion: registro.accion || registro.ruta || '—',
          entidad: `${registro.entidad || '—'}${registro.entidadId ? ` · ${registro.entidadId}` : ''}`,
          estado: registro.estadoHttp ?? '—',
          clave: registro.claveCodigo || registro.claveId || '—'
        };
        let x = xInicial;
        const fondo = indice % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(xInicial, y, anchoUtil, 15).fill(fondo);
        doc.fillColor('#1e293b').font('Helvetica').fontSize(7);
        for (const columna of COLUMNAS) {
          doc.text(String(valores[columna.clave] ?? ''), x + 3, y + 4, {
            width: columna.ancho - 6,
            height: 8,
            ellipsis: true,
            lineBreak: false
          });
          x += columna.ancho;
        }
        y += 15;
      }

      const rango = doc.bufferedPageRange();
      for (let i = rango.start; i < rango.start + rango.count; i += 1) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#64748b')
          .text(
            `Sistema de Incidencias Municipales · auditoría · página ${i + 1} de ${rango.count}`,
            doc.page.margins.left,
            doc.page.height - 18,
            { width: anchoUtil, align: 'center', lineBreak: false }
          );
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function generarInforme(registros, filtros, formato = 'pdf') {
  const normalizado = String(formato || 'pdf').toLowerCase();
  if (normalizado === 'csv') {
    return { contenido: generarCSV(registros, filtros), mime: 'text/csv; charset=utf-8', extension: 'csv' };
  }
  if (normalizado !== 'pdf') {
    throw AppError.solicitudInvalida('El formato del informe debe ser pdf o csv');
  }
  return {
    contenido: await generarPDF(registros, filtros),
    mime: 'application/pdf',
    extension: 'pdf'
  };
}
