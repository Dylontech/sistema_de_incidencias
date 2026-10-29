/** Generación local de códigos QR para el estudio de publicidad. */
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { AppError } from '../utils/AppError.js';

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

function normalizar(datos = {}) {
  const contenido = String(datos.contenido || '').trim();
  if (!contenido) throw AppError.solicitudInvalida('Escribe el contenido del QR');
  if (contenido.length > 1500) throw AppError.solicitudInvalida('El contenido del QR es demasiado largo');
  const tamano = Math.max(128, Math.min(Number(datos.tamano) || 512, 2048));
  const margen = Math.max(0, Math.min(Number(datos.margen) || 1, 8));
  const color = COLOR_HEX.test(String(datos.color || '')) ? String(datos.color).toLowerCase() : '#0b1020';
  const nivel = ['L', 'M', 'Q', 'H'].includes(datos.nivel) ? datos.nivel : 'M';
  return { contenido, tamano, margen, color, nivel };
}

export async function generarQr(datos = {}) {
  const { contenido, tamano, margen, color, nivel } = normalizar(datos);
  const svg = await QRCode.toString(contenido, {
    type: 'svg',
    width: tamano,
    margin: margen,
    errorCorrectionLevel: nivel,
    color: { dark: color, light: '#ffffffff' }
  });
  const png = await QRCode.toDataURL(contenido, {
    width: tamano,
    margin: margen,
    errorCorrectionLevel: nivel,
    color: { dark: color, light: '#ffffffff' }
  });
  return {
    contenido,
    tamano,
    margen,
    color,
    nivel,
    svg,
    png,
    svgUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  };
}

export async function generarQrPdf(datos = {}) {
  const qr = await generarQr(datos);
  const lado = 360;
  const doc = new PDFDocument({ size: [lado + 80, lado + 80], margin: 40 });
  const partes = [];
  doc.on('data', (parte) => partes.push(parte));
  const listo = new Promise((resolver) => doc.on('end', () => resolver(Buffer.concat(partes))));
  doc.image(Buffer.from(qr.png.split(',')[1], 'base64'), 40, 40, { width: lado, height: lado });
  doc.end();
  return listo;
}
