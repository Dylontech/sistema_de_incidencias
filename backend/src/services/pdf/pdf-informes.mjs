/**
 * pdf-informes.mjs — Generador de PDF del Sistema de Incidencias Municipales.
 *
 * Reemplaza el maquetado "a mano" de PDFKit por un sistema de diseño único:
 *   · crearPdfIncidencia(datos, opciones)  → Informe de una incidencia (A4).
 *   · crearPdfInforme(datos, opciones)     → Informe general con gráficas y tablas.
 *
 * Ambas devuelven una Promesa<Buffer>. Se pueden enviar con `res.send(buffer)`.
 *
 * Qué resuelve respecto al PDF anterior:
 *   · Una sola cuadrícula alineada (antes cada bloque arrancaba en una X distinta).
 *   · Logo sobre fondo blanco (antes: logo verde oscuro sobre banda verde, invisible).
 *   · Evidencia en cuadrícula de 1–3 columnas con caja uniforme y pie "Evidencia N".
 *   · Orden de lectura: datos → descripción → solución → historial → anexo de evidencia.
 *   · Tipografía incrustada (Source Sans 3) en lugar de Helvetica sin incrustar.
 *   · Estados legibles ("En proceso" y no "en_proceso"), municipio con nombre y clave.
 *   · Pie con folio y "Página X de Y"; cabecera corrida desde la página 2.
 *   · Gráficas vectoriales (barras, dona y tendencia) en el informe general.
 *
 * Requisitos: Node 18+, `pdfkit` (cualquier versión ≥ 0.13). Sin otras dependencias.
 * Las fuentes se buscan en ./fonts (SourceSans3-*.ttf). Si faltan, se usa Helvetica.
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MM = 72 / 25.4; // puntos por milímetro
const PX = 0.75; // puntos por píxel CSS (96 dpi)

/* ═══════════════════════════ catálogos ═══════════════════════════ */

/** Estados de incidencia → etiqueta y colores (texto sobre fondo ≥ 4.5:1). */
export const ESTADOS = {
  reportada: { etiqueta: 'Reportada', fondo: '#fde8e6', texto: '#8c2b22', punto: '#c8463a' },
  pendiente: { etiqueta: 'Pendiente', fondo: '#fde8e6', texto: '#8c2b22', punto: '#c8463a' },
  en_revision: { etiqueta: 'En revisión', fondo: '#fff1cc', texto: '#7a5200', punto: '#d4900c' },
  en_proceso: { etiqueta: 'En proceso', fondo: '#fff1cc', texto: '#7a5200', punto: '#d4900c' },
  resuelta: { etiqueta: 'Resuelta', fondo: '#dcf2e3', texto: '#14532d', punto: '#2e8b57' },
  rechazada: { etiqueta: 'Rechazada', fondo: '#e9ecef', texto: '#41505e', punto: '#7b8794' },
  cancelada: { etiqueta: 'Cancelada', fondo: '#e9ecef', texto: '#41505e', punto: '#7b8794' }
};

const AMBITOS = {
  urbano: 'Zona urbana o municipal',
  carretera_estatal: 'Carretera estatal',
  carretera_federal: 'Carretera federal',
  autopista: 'Autopista',
  camino_rural: 'Camino rural',
  otro: 'Otra vialidad'
};

const PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const MOTIVOS_RECLAMACION = {
  no_resuelta: 'La incidencia no quedó resuelta',
  solucion_incompleta: 'La solución fue incompleta',
  danos_no_reparados: 'Los daños siguen sin repararse',
  otro: 'Otro motivo'
};

const DECISIONES_RECLAMACION = {
  revertir: 'Reclamación aceptada: la incidencia se reabre',
  mantener: 'Reclamación revisada: la incidencia se mantiene resuelta'
};

const ZONA_POR_DEFECTO = 'America/Mexico_City';

/* ═══════════════════════════ utilidades ═══════════════════════════ */

const limitar = (n, min, max) => Math.min(max, Math.max(min, n));
const numero = (v, defecto) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : defecto);

// Emoji y símbolos que Source Sans no trae: se quitan para no pintar cuadros vacíos.
const SIN_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu;

/** Limpia texto de usuario: sin emoji, sin espacios raros, sin caracteres de control. */
export function limpiar(texto) {
  return String(texto ?? '')
    .replace(SIN_EMOJI, '')
    .replace(/[\u00a0\u2007\u2009\u202f]/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const capitalizar = (t) => {
  const s = limpiar(t);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};

/** "en_proceso" → "En proceso"; deja intacto lo que ya está legible. */
function humanizarToken(token) {
  const clave = String(token).toLowerCase();
  if (ESTADOS[clave]) return ESTADOS[clave].etiqueta;
  if (AMBITOS[clave]) return AMBITOS[clave];
  return token.replace(/_/g, ' ');
}

/** Sustituye valores internos (snake_case) por su etiqueta dentro de una frase. */
export function humanizar(frase) {
  return limpiar(frase).replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (t) => humanizarToken(t));
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Formateadores de fecha en español de México y en la zona horaria del municipio. */
function crearFormatos(zona = ZONA_POR_DEFECTO) {
  const corta = new Intl.DateTimeFormat('es-MX', { timeZone: zona, day: 'numeric', month: 'short', year: 'numeric' });
  const hora = new Intl.DateTimeFormat('es-MX', { timeZone: zona, hour: 'numeric', minute: '2-digit', hour12: true });
  const mes = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'short', year: '2-digit' });
  const entero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
  const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const aFecha = (v) => {
    if (v === null || v === undefined || v === '') return null;
    // "2026-01-01" es un día de calendario, no un instante: se ancla al mediodía UTC
    // para que no retroceda al 31 de diciembre al convertirlo a hora de México.
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
      const [a, m, d] = v.trim().split('-').map(Number);
      return new Date(Date.UTC(a, m - 1, d, 12));
    }
    const f = v instanceof Date ? v : new Date(v);
    return Number.isNaN(f.getTime()) ? null : f;
  };
  return {
    fecha: (v) => (aFecha(v) ? limpiar(corta.format(aFecha(v))) : '—'),
    hora: (v) => (aFecha(v) ? limpiar(hora.format(aFecha(v))) : ''),
    fechaHora: (v) => (aFecha(v) ? `${limpiar(corta.format(aFecha(v)))}, ${limpiar(hora.format(aFecha(v)))}` : '—'),
    mes: (clave) => {
      const m = /^(\d{4})-(\d{2})/.exec(String(clave));
      return m ? limpiar(mes.format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)))) : String(clave);
    },
    entero: (n) => entero.format(numero(n, 0)),
    decimal: (n) => decimal.format(numero(n, 0)),
    dinero: (n) => (n === null || n === undefined || n === '' ? 'No registrado' : limpiar(dinero.format(Number(n)))),
    /** Duración humana entre dos fechas: "35 min", "5 h", "8 días". */
    duracion: (desde, hasta) => {
      const a = aFecha(desde);
      const b = aFecha(hasta);
      if (!a || !b) return '—';
      const ms = Math.max(0, b - a);
      if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`;
      if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
      return plural(Math.round(ms / 86_400_000), 'día', 'días');
    },
    aFecha
  };
}

/* ───────────────────────────── color ───────────────────────────── */

const hexARgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbAHex = (rgb) => `#${rgb.map((v) => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla dos colores: t=0 devuelve `a`, t=1 devuelve `b`. */
function mezclar(a, b, t) {
  const A = hexARgb(a) || [0, 0, 0];
  const B = hexARgb(b) || [255, 255, 255];
  return rgbAHex(A.map((v, i) => v + (B[i] - v) * t));
}

function luminancia(hex) {
  const [r, g, b] = (hexARgb(hex) || [0, 0, 0]).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

/** Oscurece un color hasta que el texto sobre blanco sea legible (WCAG AA, 4.5:1). */
function asegurarContraste(hex, fondo = '#ffffff', minimo = 4.5) {
  let color = hexARgb(hex) ? rgbAHex(hexARgb(hex)) : '#006657';
  for (let i = 0; i < 24 && contraste(color, fondo) < minimo; i += 1) color = mezclar(color, '#000000', 0.1);
  return color;
}

function paleta(acento) {
  const a = asegurarContraste(acento);
  return {
    acento: a,
    acentoSuave: mezclar(a, '#ffffff', 0.9),
    acentoClaro: mezclar(a, '#ffffff', 0.72),
    acentoMedio: mezclar(a, '#ffffff', 0.45),
    tinta: '#1b2733',
    gris: '#566474',
    linea: '#d8dee4',
    lineaSuave: '#ecf0f3',
    panel: '#f5f8f8',
    imagen: '#f0f3f4',
    blanco: '#ffffff'
  };
}

/** Oscurece el color institucional hasta que sea legible sobre blanco (WCAG AA). */
export function acentoLegible(hex, fondo = '#ffffff', minimo = 4.5) {
  return asegurarContraste(hex, fondo, minimo);
}

/** Paleta derivada del acento para las variables --inf-* de la hoja imprimible. */
export function paletaAcento(hex) {
  const p = paleta(hex);
  return { acento: p.acento, suave: p.acentoSuave, medio: p.acentoMedio };
}

/** Escala tipográfica (pt). Un solo lugar para ajustar tamaños. */
const T = {
  titulo: 21,
  h2: 12,
  cuerpo: 10,
  valor: 10.5,
  etiqueta: 8,
  meta: 8.5,
  tabla: 8.8,
  pie: 8,
  kpi: 19
};

/* ═══════════════════════════ diseño (configuración) ═══════════════════════════ */

/**
 * Convierte la configuración guardada (claves `informes.*`) o un objeto camelCase
 * en el diseño que entiende el generador. Valores fuera de rango se acotan.
 *
 * `entrada` puede ser:
 *   · un arreglo [{ clave, valor }] (tal como lo devuelve configuracionService.listar)
 *   · un objeto { 'informes.margen_superior': 18, ... }
 *   · un objeto ya normalizado { margenSuperior: 18, ... }
 */
export function disenoDesdeConfiguracion(entrada = {}, extras = {}) {
  const mapa = Array.isArray(entrada)
    ? Object.fromEntries(entrada.map((fila) => [fila.clave, fila.valor]))
    : { ...entrada };
  const leer = (clave, alterna, defecto) => mapa[clave] ?? mapa[alterna] ?? defecto;
  const mm = (v, defecto, min) => limitar(numero(v, defecto), min, 50) * MM;

  return {
    logo: extras.logo ?? mapa.logo ?? null, // Buffer | ruta | { buffer } | { ruta }
    logoPosicion: ['izquierda', 'derecha', 'centro'].includes(leer('informes.logo_posicion', 'logoPosicion', 'izquierda'))
      ? leer('informes.logo_posicion', 'logoPosicion', 'izquierda')
      : 'izquierda',
    logoAncho: limitar(numero(leer('informes.logo_ancho', 'logoAncho', 90), 90), 30, 220) * PX,
    logoX: limitar(numero(leer('informes.logo_desplazamiento_x', 'logoX', 0), 0), -120, 120) * PX,
    logoY: limitar(numero(leer('informes.logo_desplazamiento_y', 'logoY', 0), 0), -80, 80) * PX,
    // Mínimos suaves: el pie y la cabecera corrida necesitan ~12 mm para no encimarse.
    margenSuperior: mm(leer('informes.margen_superior', 'margenSuperior', 18), 18, 12),
    margenDerecho: mm(leer('informes.margen_derecho', 'margenDerecho', 15), 15, 10),
    margenInferior: mm(leer('informes.margen_inferior', 'margenInferior', 18), 18, 14),
    margenIzquierdo: mm(leer('informes.margen_izquierdo', 'margenIzquierdo', 15), 15, 10),
    pieTexto: limpiar(leer('informes.pie_texto', 'pieTexto', '')) || 'Sistema de Incidencias Municipales',
    acento: leer('informes.color_acento', 'acento', '#006657'),
    evidenciaColumnas: limitar(Math.round(numero(leer('informes.evidencia_columnas', 'evidenciaColumnas', 2), 2)), 1, 3),
    evidenciaPosicion:
      leer('informes.evidencia_posicion', 'evidenciaPosicion', 'final') === 'despues_descripcion'
        ? 'despues_descripcion'
        : 'final'
  };
}

/* ═══════════════════════════ fuentes e imágenes ═══════════════════════════ */

/**
 * Registra Source Sans 3 si está disponible; si no, cae a Helvetica (sin errores).
 * Busca .ttf, .otf, .woff2 o .woff con el mismo nombre base.
 */
function registrarFuentes(doc, dirFuentes) {
  const dir = dirFuentes || path.join(AQUI, 'fonts');
  const F = { regular: 'Helvetica', semi: 'Helvetica-Bold', negrita: 'Helvetica-Bold', cursiva: 'Helvetica-Oblique', incrustadas: false };
  const archivos = { regular: 'SourceSans3-Regular', semi: 'SourceSans3-Semibold', negrita: 'SourceSans3-Bold', cursiva: 'SourceSans3-It' };
  let cargadas = 0;
  for (const [clave, base] of Object.entries(archivos)) {
    for (const ext of ['ttf', 'otf', 'woff2', 'woff']) {
      const ruta = path.join(dir, `${base}.${ext}`);
      if (!fs.existsSync(ruta)) continue;
      try {
        doc.registerFont(`SS-${clave}`, ruta);
        doc.font(`SS-${clave}`); // fuerza la carga ahora, para detectar archivos dañados
        F[clave] = `SS-${clave}`;
        cargadas += 1;
        break;
      } catch {
        /* prueba con la siguiente extensión */
      }
    }
  }
  doc.font(F.regular);
  F.incrustadas = cargadas === 4;
  return F;
}

/** Normaliza el origen de una imagen: Buffer, ruta de archivo, { buffer } o { ruta }. */
function origenImagen(fuente) {
  if (!fuente) return null;
  if (Buffer.isBuffer(fuente)) return { buffer: fuente };
  if (typeof fuente === 'string') return { ruta: fuente };
  return fuente;
}

/** Abre una imagen (PNG/JPEG). Devuelve null si no se puede incrustar. */
async function abrirImagen(doc, fuente, optimizar) {
  try {
    const origen = origenImagen(fuente);
    if (!origen) return null;
    let buffer = origen.buffer || (origen.ruta ? await fs.promises.readFile(origen.ruta) : null);
    if (!buffer) return null;
    if (typeof optimizar === 'function') buffer = (await optimizar(buffer, origen.mime)) || buffer;
    const img = doc.openImage(buffer);
    return { img, ancho: img.width, alto: img.height };
  } catch {
    return null;
  }
}

async function prepararEvidencias(doc, lista, optimizar) {
  const incrustables = [];
  const otros = [];
  for (const [i, ev] of (lista || []).entries()) {
    const abierta = await abrirImagen(doc, ev, optimizar);
    const base = { numero: i + 1, nombre: limpiar(ev.nombre || `archivo-${i + 1}`), mime: ev.mime, tamano: ev.tamano };
    if (abierta) incrustables.push({ ...base, imagen: abierta });
    else otros.push(base);
  }
  return { incrustables, otros, total: (lista || []).length };
}

/* ═══════════════════════════ documento y maquetado ═══════════════════════════ */

/**
 * Abre el documento PDFKit con los márgenes del diseño y devuelve el contexto de
 * maquetado (`ctx`) y la promesa del Buffer final (`fin`). El cursor vertical es
 * `ctx.y`: todos los bloques se dibujan con coordenadas explícitas, así ningún
 * bloque hereda la posición X/Y del anterior (causa de la sangría irregular antes).
 */
function abrirDocumento({ titulo, asunto, palabras, diseno, opciones }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: diseno.margenSuperior, right: diseno.margenDerecho, bottom: diseno.margenInferior, left: diseno.margenIzquierdo },
    bufferPages: true, // necesario para escribir "Página X de Y" al final
    lang: 'es-MX',
    displayTitle: true,
    info: { Title: titulo, Author: diseno.pieTexto, Subject: asunto, Keywords: palabras, Creator: 'Sistema de Incidencias Municipales' }
  });
  const trozos = [];
  doc.on('data', (t) => trozos.push(t));
  const fin = new Promise((resolver, rechazar) => {
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);
  });
  const ctx = {
    doc,
    F: registrarFuentes(doc, opciones.dirFuentes),
    d: diseno,
    c: paleta(diseno.acento),
    f: crearFormatos(opciones.zonaHoraria),
    izq: diseno.margenIzquierdo,
    ancho: doc.page.width - diseno.margenIzquierdo - diseno.margenDerecho,
    y: diseno.margenSuperior,
    logo: null,
    get limite() {
      return doc.page.height - doc.page.margins.bottom;
    }
  };
  return { ctx, fin };
}

/** Fija fuente, tamaño y color en un solo paso. */
function fuente(ctx, tipo, tam, color) {
  return ctx.doc.font(ctx.F[tipo]).fontSize(tam).fillColor(color ?? ctx.c.tinta);
}

function altura(ctx, texto, ancho, tipo = 'regular', tam = T.cuerpo, lineGap = 0) {
  fuente(ctx, tipo, tam);
  return ctx.doc.heightOfString(String(texto), { width: ancho, lineGap });
}

/** Recorta con "…" hasta que el texto quepa en `ancho` (usa la fuente activa). */
function ajustar(doc, texto, ancho) {
  let t = limpiar(texto).replace(/\s*\n\s*/g, ' ');
  if (doc.widthOfString(t) <= ancho) return t;
  let min = 0;
  let max = t.length;
  while (min < max) {
    const medio = Math.ceil((min + max) / 2);
    if (doc.widthOfString(`${t.slice(0, medio).trimEnd()}…`) <= ancho) min = medio;
    else max = medio - 1;
  }
  return `${t.slice(0, min).trimEnd()}…`;
}

/** Recorta por el centro ("Captura de pan…095026.png"): conserva el final y la extensión. */
function ajustarCentro(doc, texto, ancho) {
  const t = limpiar(texto).replace(/\s*\n\s*/g, ' ');
  if (doc.widthOfString(t) <= ancho) return t;
  const cola = t.slice(-Math.min(12, Math.floor(t.length / 3)));
  let min = 0;
  let max = t.length - cola.length;
  while (min < max) {
    const medio = Math.ceil((min + max) / 2);
    if (doc.widthOfString(`${t.slice(0, medio).trimEnd()}…${cola}`) <= ancho) min = medio;
    else max = medio - 1;
  }
  return `${t.slice(0, min).trimEnd()}…${cola}`;
}

/** Escribe texto en coordenadas explícitas. `truncar` fuerza una sola línea con "…". */
function escribir(ctx, texto, x, y, { tipo = 'regular', tam = T.cuerpo, color, ancho, align = 'left', lineGap = 0, enlace, subrayado, truncar } = {}) {
  fuente(ctx, tipo, tam, color);
  const contenido = truncar && ancho ? (truncar === 'centro' ? ajustarCentro(ctx.doc, texto, ancho) : ajustar(ctx.doc, texto, ancho)) : String(texto);
  ctx.doc.text(contenido, x, y, { width: ancho, align, lineGap, lineBreak: !truncar, link: enlace, underline: subrayado });
}

/** Si el bloque no cabe en lo que queda de página, abre otra. Devuelve true si saltó. */
function asegurar(ctx, alto) {
  if (ctx.y + alto <= ctx.limite + 0.01) return false;
  ctx.doc.addPage();
  ctx.y = ctx.doc.page.margins.top;
  return true;
}

function regla(ctx, y, { color, grosor = 0.6, x1 = ctx.izq, x2 = ctx.izq + ctx.ancho } = {}) {
  ctx.doc.moveTo(x1, y).lineTo(x2, y).lineWidth(grosor).strokeColor(color ?? ctx.c.linea).stroke();
}

/** Insignia de estado: punto de color + texto sobre fondo suave. */
function chipEstado(ctx, x, y, clave, { derecha = false, tam = 8.8 } = {}) {
  const e = ESTADOS[String(clave).toLowerCase()] || { etiqueta: capitalizar(humanizarToken(String(clave))), fondo: '#e9ecef', texto: '#41505e', punto: '#7b8794' };
  fuente(ctx, 'semi', tam, e.texto);
  const w = ctx.doc.widthOfString(e.etiqueta) + 22;
  const h = tam + 8;
  const xx = derecha ? x - w : x;
  ctx.doc.roundedRect(xx, y, w, h, h / 2).fill(e.fondo);
  ctx.doc.circle(xx + 10, y + h / 2, 2.6).fill(e.punto);
  fuente(ctx, 'semi', tam, e.texto);
  ctx.doc.text(e.etiqueta, xx + 17, y + (h - ctx.doc.currentLineHeight()) / 2, { lineBreak: false });
  return { w, h };
}

/* ───────────────────────────── bloques ───────────────────────────── */

/**
 * Membrete: logo sobre fondo blanco + institución, y una regla de color.
 * Respeta posición (izquierda/derecha/centro), ancho y ajuste fino del diseño.
 */
function membrete(ctx, { linea1, linea2 }) {
  const { c, d } = ctx;
  const y0 = ctx.y;
  let lw = 0;
  let lh = 0;
  if (ctx.logo) {
    lw = limitar(d.logoAncho, 20, 170);
    lh = (lw * ctx.logo.alto) / ctx.logo.ancho;
    if (lh > 58) {
      lh = 58;
      lw = (lh * ctx.logo.ancho) / ctx.logo.alto;
    }
  }
  const hTexto = 15 + (linea2 ? 14 : 0);
  const separacion = 12;
  const centro = d.logoPosicion === 'centro';
  const alto = centro ? lh + (lh ? 6 : 0) + hTexto : Math.max(lh, hTexto);

  if (ctx.logo) {
    const xBase = d.logoPosicion === 'derecha' ? ctx.izq + ctx.ancho - lw : centro ? ctx.izq + (ctx.ancho - lw) / 2 : ctx.izq;
    ctx.doc.image(ctx.logo.img, xBase + d.logoX, y0 + d.logoY, { width: lw, height: lh });
  }
  const xTexto = d.logoPosicion === 'izquierda' ? ctx.izq + lw + (lw ? separacion : 0) : ctx.izq;
  const anchoTexto = centro ? ctx.ancho : ctx.ancho - lw - (lw ? separacion : 0);
  const yTexto = centro ? y0 + lh + (lh ? 6 : 0) : y0 + (alto - hTexto) / 2;
  const align = centro ? 'center' : 'left';
  escribir(ctx, linea1, xTexto, yTexto, { tipo: 'semi', tam: 13, color: c.acento, ancho: anchoTexto, align, truncar: true });
  if (linea2) escribir(ctx, linea2, xTexto, yTexto + 16, { tam: 9.5, color: c.gris, ancho: anchoTexto, align, truncar: true });

  const yRegla = y0 + alto + 10;
  regla(ctx, yRegla, { color: c.acento, grosor: 1.4 });
  ctx.y = yRegla + 18;
}

/** Título del documento: etiqueta, título (máx. 2 líneas), meta, folio y estado a la derecha. */
function bloqueTitulo(ctx, { etiqueta, titulo, meta, folio, estado }) {
  const { doc, c } = ctx;
  const anchoDerecha = folio || estado ? 150 : 0;
  const anchoIzquierda = ctx.ancho - anchoDerecha - (anchoDerecha ? 16 : 0);
  const y0 = ctx.y;

  escribir(ctx, etiqueta, ctx.izq, y0, { tipo: 'semi', tam: 9.5, color: c.acento, ancho: anchoIzquierda });
  let y = y0 + 15;
  fuente(ctx, 'negrita', T.titulo, c.tinta);
  const unaLinea = doc.currentLineHeight(true) + 1;
  const h = Math.min(doc.heightOfString(titulo, { width: anchoIzquierda, lineGap: 1 }), unaLinea * 2);
  doc.text(titulo, ctx.izq, y, { width: anchoIzquierda, height: h + 1, ellipsis: true, lineGap: 1 });
  y += h + 5;
  if (meta) {
    escribir(ctx, meta, ctx.izq, y, { tam: T.meta, color: c.gris, ancho: anchoIzquierda, truncar: true });
    y += 13;
  }

  if (anchoDerecha) {
    const xDer = ctx.izq + ctx.ancho;
    if (folio) escribir(ctx, folio, xDer - anchoDerecha, y0, { tipo: 'semi', tam: 11, ancho: anchoDerecha, align: 'right', truncar: true });
    if (estado) chipEstado(ctx, xDer, y0 + 17, estado, { derecha: true });
  }
  ctx.y = Math.max(y, y0 + (estado ? 42 : 20)) + 8;
}

/** Franja de resumen: de 3 a 5 datos clave que se leen de un vistazo. */
function franjaResumen(ctx, celdas) {
  const { doc, c } = ctx;
  const grande = celdas.some((x) => x.tam > 14); // cifras tipo KPI necesitan más aire
  const alto = grande ? 64 : 48;
  const yValor = grande ? 19 : 20.5;
  const ySub = grande ? 48 : 36;
  asegurar(ctx, alto + 8);
  const y0 = ctx.y;
  const w = ctx.ancho / celdas.length;
  const pad = 12;
  doc.roundedRect(ctx.izq, y0, ctx.ancho, alto, 4).fill(c.panel);
  celdas.forEach((celda, i) => {
    const x = ctx.izq + i * w;
    if (i > 0) doc.moveTo(x, y0 + 10).lineTo(x, y0 + alto - 10).lineWidth(0.6).strokeColor(c.linea).stroke();
    escribir(ctx, celda.etiqueta, x + pad, y0 + 9, { tam: T.etiqueta, color: c.gris, ancho: w - pad * 2, truncar: true });
    if (celda.estado) {
      const e = ESTADOS[String(celda.estado).toLowerCase()] || ESTADOS.reportada;
      doc.circle(x + pad + 3.5, y0 + 27, 3.5).fill(e.punto);
      escribir(ctx, e.etiqueta, x + pad + 12, y0 + 20.5, { tipo: 'semi', tam: 12.5, color: e.texto, ancho: w - pad * 2 - 12, truncar: true });
    } else {
      escribir(ctx, celda.valor, x + pad, y0 + yValor, { tipo: 'semi', tam: celda.tam || 12.5, ancho: w - pad * 2, truncar: true });
    }
    if (celda.sub) escribir(ctx, celda.sub, x + pad, y0 + ySub, { tam: T.etiqueta, color: c.gris, ancho: w - pad * 2, truncar: true });
  });
  ctx.y = y0 + alto + 6;
}

/** Título de sección con regla y contador opcional. Evita quedar huérfano al pie de página. */
function seccion(ctx, titulo, { cuenta, espacioMinimo = 80 } = {}) {
  const { doc, c } = ctx;
  ctx.y += 10;
  asegurar(ctx, espacioMinimo);
  escribir(ctx, titulo, ctx.izq, ctx.y, { tipo: 'semi', tam: T.h2, color: c.acento, ancho: ctx.ancho });
  if (cuenta !== undefined && cuenta !== null) {
    fuente(ctx, 'semi', T.h2, c.acento);
    const x = ctx.izq + doc.widthOfString(titulo) + 8;
    const txt = String(cuenta);
    fuente(ctx, 'semi', 8.5, c.acento);
    const w = Math.max(18, doc.widthOfString(txt) + 12);
    doc.roundedRect(x, ctx.y + 0.5, w, 14, 7).fill(c.acentoSuave);
    escribir(ctx, txt, x, ctx.y + 3, { tipo: 'semi', tam: 8.5, color: c.acento, ancho: w, align: 'center' });
  }
  regla(ctx, ctx.y + 19, { color: c.linea });
  ctx.y += 27;
}

/**
 * Cuadrícula de datos: etiqueta pequeña arriba, valor debajo. Las celdas se acomodan solas
 * en filas de `columnas`; una celda con `span` ocupa varias columnas y las vacías se omiten.
 * Así, los datos opcionales que falten no dejan huecos ni filas a medias.
 */
function ficha(ctx, entrada, { columnas = 3, separacion = 16 } = {}) {
  const { c } = ctx;
  const cw = (ctx.ancho - separacion * (columnas - 1)) / columnas;
  const celdas = entrada.flat().filter((celda) => celda && celda.valor !== undefined && celda.valor !== null && celda.valor !== '');
  const filas = [];
  let fila = [];
  let usadas = 0;
  for (const celda of celdas) {
    const span = Math.min(celda.span || 1, columnas);
    if (usadas + span > columnas) {
      filas.push(fila);
      fila = [];
      usadas = 0;
    }
    fila.push({ celda, x: ctx.izq + usadas * (cw + separacion), ancho: cw * span + separacion * (span - 1) });
    usadas += span;
    if (usadas === columnas) {
      filas.push(fila);
      fila = [];
      usadas = 0;
    }
  }
  if (fila.length) filas.push(fila);

  for (const colocadas of filas) {
    const alto = Math.max(
      ...colocadas.map(({ celda, ancho }) => 12 + altura(ctx, celda.valor, ancho, 'regular', T.valor, 1.5) + (celda.enlace ? 13 : 0))
    );
    asegurar(ctx, alto + 4);
    for (const { celda, x, ancho } of colocadas) {
      escribir(ctx, celda.etiqueta, x, ctx.y, { tam: T.etiqueta, color: c.gris, ancho, truncar: true });
      escribir(ctx, celda.valor, x, ctx.y + 11, { tam: T.valor, ancho, lineGap: 1.5 });
      if (celda.enlace) {
        const yEnlace = ctx.y + 11 + altura(ctx, celda.valor, ancho, 'regular', T.valor, 1.5) + 2;
        escribir(ctx, celda.enlace.texto, x, yEnlace, { tipo: 'semi', tam: T.meta, color: c.acento, ancho, enlace: celda.enlace.url, subrayado: true, truncar: true });
      }
    }
    ctx.y += alto + 3;
  }
}

/** Párrafo que fluye entre páginas (la paginación automática de PDFKit se encarga). */
function parrafo(ctx, texto, { tipo = 'regular', tam = T.cuerpo, color, x = ctx.izq, ancho = ctx.ancho, lineGap = 2.4 } = {}) {
  fuente(ctx, tipo, tam, color);
  ctx.doc.text(texto, x, ctx.y, { width: ancho, lineGap });
  ctx.y = ctx.doc.y + 4;
}

/**
 * Texto destacado con barra de color. Si es corto se dibuja como panel (se mantiene
 * junto); si es largo fluye como párrafo con la barra, para no dejar medias páginas vacías.
 */
function panelTexto(ctx, texto, { etiqueta, tipo = 'regular', color } = {}) {
  const { doc, c } = ctx;
  const pad = 8;
  const ancho = ctx.ancho - pad * 2 - 3;
  const hEtiqueta = etiqueta ? 13 : 0;
  const hTexto = altura(ctx, texto, ancho, tipo, T.cuerpo, 2.4);
  const alto = hTexto + hEtiqueta + pad * 2;
  const disponible = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  if (alto > disponible * 0.6) {
    if (etiqueta) {
      escribir(ctx, etiqueta, ctx.izq, ctx.y, { tipo: 'semi', tam: T.etiqueta, color: c.gris, ancho: ctx.ancho });
      ctx.y += 13;
    }
    parrafo(ctx, texto, { tipo, color });
    return;
  }
  asegurar(ctx, alto + 6);
  const y0 = ctx.y;
  doc.roundedRect(ctx.izq, y0, ctx.ancho, alto, 3).fill(c.panel);
  doc.rect(ctx.izq, y0, 3, alto).fill(c.acento);
  let y = y0 + pad;
  if (etiqueta) {
    escribir(ctx, etiqueta, ctx.izq + pad + 3, y, { tipo: 'semi', tam: T.etiqueta, color: c.gris, ancho });
    y += hEtiqueta;
  }
  escribir(ctx, texto, ctx.izq + pad + 3, y, { tipo, tam: T.cuerpo, color, ancho, lineGap: 2.4 });
  ctx.y = y0 + alto + 8;
}

/**
 * Línea de tiempo vertical. Agrupa eventos consecutivos idénticos (misma acción,
 * mismo actor y mismo minuto) como "×2": no se pierde ningún registro, solo se compacta.
 */
function agruparEventos(eventos, f) {
  const salida = [];
  for (const ev of eventos || []) {
    const clave = `${humanizar(ev.accion)}|${limpiar(ev.actor)}|${f.fechaHora(ev.fecha)}`;
    const anterior = salida[salida.length - 1];
    if (anterior && anterior.clave === clave) anterior.veces += 1;
    else salida.push({ ...ev, clave, veces: 1 });
  }
  return salida;
}

function estadoDeEvento(ev) {
  if (ev.estado) return String(ev.estado).toLowerCase();
  const t = String(ev.accion || '').toLowerCase();
  if (/resuelt/.test(t)) return 'resuelta';
  if (/en[_ ]proceso/.test(t)) return 'en_proceso';
  if (/report/.test(t)) return 'reportada';
  return null;
}

/** Mide un evento de la línea de tiempo (título, detalle y alto total). */
function medirEvento(ctx, ev, ancho) {
  const titulo = humanizar(ev.accion) + (ev.veces > 1 ? `  ×${ev.veces}` : '');
  const detalle = [ctx.f.fechaHora(ev.fecha), limpiar(ev.actor)].filter(Boolean).join('  ·  ');
  const hTitulo = altura(ctx, titulo, ancho, 'semi', T.valor, 1);
  return { titulo, detalle, hTitulo, alto: hTitulo + 12 + 8 };
}

const SANGRIA_TIEMPO = 18;

/** Alto total de la línea de tiempo (para decidir si la sección cabe completa en la página). */
function alturaLineaTiempo(ctx, eventos) {
  const ancho = ctx.ancho - SANGRIA_TIEMPO;
  return agruparEventos(eventos, ctx.f).reduce((suma, ev) => suma + medirEvento(ctx, ev, ancho).alto, 0);
}

function lineaTiempo(ctx, eventos) {
  const { doc, c } = ctx;
  const ancho = ctx.ancho - SANGRIA_TIEMPO;
  const lista = agruparEventos(eventos, ctx.f);
  lista.forEach((ev, i) => {
    const { titulo, detalle, hTitulo, alto } = medirEvento(ctx, ev, ancho);
    asegurar(ctx, alto);
    const y0 = ctx.y;
    const color = ESTADOS[estadoDeEvento(ev)]?.punto || c.acento;
    if (i < lista.length - 1) doc.moveTo(ctx.izq + 4.5, y0 + 9).lineTo(ctx.izq + 4.5, y0 + alto + 2).lineWidth(1).strokeColor(c.linea).stroke();
    doc.circle(ctx.izq + 4.5, y0 + 5.5, 4).fill(color);
    doc.circle(ctx.izq + 4.5, y0 + 5.5, 1.6).fill(c.blanco);
    escribir(ctx, titulo, ctx.izq + SANGRIA_TIEMPO, y0, { tipo: 'semi', tam: T.valor, ancho, lineGap: 1 });
    escribir(ctx, detalle, ctx.izq + SANGRIA_TIEMPO, y0 + hTitulo + 1, { tam: T.meta, color: c.gris, ancho, truncar: true });
    ctx.y = y0 + alto;
  });
}

/**
 * Galería de evidencia: 1–3 columnas, caja uniforme por fila, imagen ajustada sin
 * deformarse y pie "Evidencia N · nombre". Cada fila se mantiene completa en su página.
 */
function galeria(ctx, items, { columnas = 2 } = {}) {
  const { doc, c } = ctx;
  const cols = limitar(columnas, 1, 3);
  const separacion = 10;
  const cw = (ctx.ancho - separacion * (cols - 1)) / cols;
  const [altoMin, altoMax] = { 1: [140, 340], 2: [96, 210], 3: [76, 160] }[cols];
  const pad = 5;
  const hPie = 14;
  for (let i = 0; i < items.length; i += cols) {
    const fila = items.slice(i, i + cols);
    const alto = limitar(Math.max(...fila.map((it) => ((cw - pad * 2) * it.imagen.alto) / it.imagen.ancho + pad * 2)), altoMin, altoMax);
    asegurar(ctx, alto + hPie + 10);
    const y0 = ctx.y;
    fila.forEach((it, j) => {
      const x = ctx.izq + j * (cw + separacion);
      doc.roundedRect(x, y0, cw, alto, 3).fill(c.imagen);
      const escala = Math.min((cw - pad * 2) / it.imagen.ancho, (alto - pad * 2) / it.imagen.alto, 1.5);
      const dw = it.imagen.ancho * escala;
      const dh = it.imagen.alto * escala;
      doc.image(it.imagen.img, x + (cw - dw) / 2, y0 + (alto - dh) / 2, { width: dw, height: dh });
      doc.roundedRect(x, y0, cw, alto, 3).lineWidth(0.6).strokeColor(c.linea).stroke();
      const etiqueta = `Evidencia ${it.numero}`;
      fuente(ctx, 'semi', T.etiqueta + 0.3);
      const wEtiqueta = doc.widthOfString(etiqueta);
      escribir(ctx, etiqueta, x, y0 + alto + 4, { tipo: 'semi', tam: T.etiqueta + 0.3, ancho: cw });
      escribir(ctx, it.nombre, x + wEtiqueta + 6, y0 + alto + 4, { tam: T.etiqueta, color: c.gris, ancho: cw - wEtiqueta - 6, truncar: 'centro' });
    });
    ctx.y = y0 + alto + hPie + 8;
  }
}

/** Archivos que no se pudieron incrustar (otro formato, dañados o demasiado pesados). */
function listaArchivos(ctx, archivos, titulo) {
  const { c } = ctx;
  if (!archivos.length) return;
  asegurar(ctx, 40);
  escribir(ctx, titulo, ctx.izq, ctx.y, { tipo: 'semi', tam: 9, color: c.tinta, ancho: ctx.ancho });
  ctx.y += 15;
  for (const a of archivos) {
    asegurar(ctx, 18);
    const kb = a.tamano ? `${ctx.f.entero(Math.max(1, Math.round(a.tamano / 1024)))} KB` : '';
    const tipo = a.mime ? String(a.mime).split('/')[1]?.toUpperCase() : '';
    escribir(ctx, a.nombre, ctx.izq, ctx.y, { tam: T.cuerpo - 0.5, ancho: ctx.ancho - 120, truncar: 'centro' });
    escribir(ctx, [tipo, kb].filter(Boolean).join('  ·  '), ctx.izq + ctx.ancho - 120, ctx.y, { tam: T.meta, color: c.gris, ancho: 120, align: 'right' });
    regla(ctx, ctx.y + 14, { color: c.lineaSuave });
    ctx.y += 18;
  }
}

/**
 * Pie de página y cabecera corrida. Se dibuja al final, cuando ya se conoce el total de
 * páginas. Se anulan temporalmente los márgenes para escribir en ellos sin provocar
 * saltos de página automáticos.
 */
function decorarPaginas(ctx, { cabeceraIzquierda, cabeceraDerecha, pie }) {
  const { doc, c } = ctx;
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);
    const { top, bottom } = doc.page.margins;
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;

    const yPie = Math.min(doc.page.height - bottom + 12, doc.page.height - 22);
    regla(ctx, yPie - 6, { color: c.linea, grosor: 0.5 });
    escribir(ctx, pie, ctx.izq, yPie, { tam: T.pie, color: c.gris, ancho: ctx.ancho - 100, truncar: true });
    escribir(ctx, `Página ${i + 1} de ${rango.count}`, ctx.izq + ctx.ancho - 100, yPie, { tam: T.pie, color: c.gris, ancho: 100, align: 'right' });

    if (i > 0 && top >= 34) {
      const yCab = top - 26;
      escribir(ctx, cabeceraIzquierda, ctx.izq, yCab, { tipo: 'semi', tam: T.pie, color: c.gris, ancho: ctx.ancho - 150, truncar: true });
      escribir(ctx, cabeceraDerecha, ctx.izq + ctx.ancho - 150, yCab, { tam: T.pie, color: c.gris, ancho: 150, align: 'right', truncar: true });
      regla(ctx, yCab + 14, { color: c.linea, grosor: 0.5 });
    }
    doc.page.margins.top = top;
    doc.page.margins.bottom = bottom;
  }
}

function cerrar(ctx, fin) {
  ctx.doc.end();
  return fin;
}

/* ═══════════════════════════ PDF de una incidencia ═══════════════════════════ */

/**
 * @typedef {Object} DatosIncidencia
 * @property {string} folio                     Ej. "INC-20261023-083F36"
 * @property {string} [titulo]                  Ej. "Baches múltiples"
 * @property {string} tipo                      Nombre del tipo ("bache")
 * @property {string} estado                    reportada | en_proceso | resuelta
 * @property {string|Date} fechaReporte
 * @property {string} [prioridad]               alta | media | baja
 * @property {string} [ambito]                  urbano | carretera_estatal | ...
 * @property {{nombre:string, clave?:string, estado?:string}|string} municipio
 * @property {string} [comunidad]
 * @property {number} [latitud]
 * @property {number} [longitud]
 * @property {string} [reportadoPor]            Por defecto "Anónimo"
 * @property {boolean} [peligrosa]              Marca de riesgo registrada
 * @property {string} [peligrosaMotivo]
 * @property {{oculta?:boolean, motivo?:string, fecha?:string|Date, por?:string}} [moderacion]
 * @property {string} [descripcion]
 * @property {string} [indicaciones]
 * @property {{nombre?:string, clave?:string, kilometro?:number, sentido?:string, tramo?:string, dependencia?:string}} [via]
 * @property {Array<{nombre:string, mime?:string, tamano?:number, buffer?:Buffer, ruta?:string}>} [evidencias]
 * @property {{fecha:string|Date, costo?:number|null, texto?:string, responsable?:string, evidencias?:Array}} [solucion]
 * @property {Array<{accion:string, fecha:string|Date, actor?:string, estado?:string}>} [historial]
 */

/**
 * Genera el informe PDF de una incidencia.
 *
 * @param {DatosIncidencia} datos
 * @param {Object} [opciones]
 * @param {Object|Array} [opciones.diseno]   Configuración `informes.*` (ver disenoDesdeConfiguracion).
 * @param {Buffer|string} [opciones.logo]    Logo (Buffer o ruta). PNG o JPEG.
 * @param {Date|string} [opciones.generado]  Fecha de generación (por defecto, ahora).
 * @param {string} [opciones.zonaHoraria]    Por defecto America/Mexico_City.
 * @param {string} [opciones.dirFuentes]     Carpeta de las fuentes (por defecto ./fonts).
 * @param {(lat:number,lng:number)=>string} [opciones.urlMapa]  URL del mapa para el enlace.
 * @param {(buf:Buffer,mime?:string)=>Promise<Buffer>} [opciones.optimizarImagen]  Gancho opcional
 *        para reducir imágenes pesadas (p. ej. con `sharp`) antes de incrustarlas.
 * @returns {Promise<Buffer>}
 */
export async function crearPdfIncidencia(datos, opciones = {}) {
  const diseno = disenoDesdeConfiguracion(opciones.diseno || {}, { logo: opciones.logo });
  const folio = limpiar(datos.folio) || 'Sin folio';
  const titulo = limpiar(datos.titulo) || capitalizar(datos.tipo) || 'Incidencia';
  const generado = opciones.generado ?? new Date();
  const { ctx, fin } = abrirDocumento({
    titulo: `Incidencia ${folio}`,
    asunto: 'Informe de incidencia',
    palabras: ['incidencia', limpiar(datos.tipo), folio].filter(Boolean).join(', '),
    diseno,
    opciones
  });
  const { doc, f, c } = ctx;

  ctx.logo = await abrirImagen(doc, diseno.logo, opciones.optimizarImagen);
  const evidencia = await prepararEvidencias(doc, datos.evidencias, opciones.optimizarImagen);
  const evidenciaSolucion = await prepararEvidencias(doc, datos.solucion?.evidencias, opciones.optimizarImagen);

  // Municipio: si solo llega la clave numérica, se rotula como clave (no como nombre).
  const mun = datos.municipio && typeof datos.municipio === 'object' ? datos.municipio : { nombre: datos.municipio };
  const nombreEsClave = /^\d+$/.test(String(mun.nombre || ''));
  const clave = mun.clave || (nombreEsClave ? mun.nombre : '');
  const nombreMunicipio = nombreEsClave ? '' : limpiar(mun.nombre);
  const municipioTexto = nombreMunicipio ? (clave ? `${nombreMunicipio} (${clave})` : nombreMunicipio) : clave ? `Clave ${clave}` : 'No registrado';

  /* ── cabecera ── */
  membrete(ctx, { linea1: diseno.pieTexto, linea2: [nombreMunicipio, limpiar(mun.estado)].filter(Boolean).join(', ') });
  bloqueTitulo(ctx, {
    etiqueta: 'Informe de incidencia',
    titulo,
    meta: `Generado el ${f.fechaHora(generado)}`,
    folio,
    estado: datos.estado
  });

  const resuelta = Boolean(datos.solucion?.fecha);
  franjaResumen(ctx, [
    { etiqueta: 'Estado', estado: datos.estado },
    datos.prioridad ? { etiqueta: 'Prioridad', valor: PRIORIDADES[String(datos.prioridad).toLowerCase()] || capitalizar(datos.prioridad) } : null,
    { etiqueta: 'Tipo', valor: capitalizar(datos.tipo) || '—' },
    { etiqueta: 'Reportada', valor: f.fecha(datos.fechaReporte), sub: f.hora(datos.fechaReporte) },
    resuelta
      ? { etiqueta: 'Tiempo de atención', valor: f.duracion(datos.fechaReporte, datos.solucion.fecha), sub: `hasta el ${f.fecha(datos.solucion.fecha)}` }
      : { etiqueta: 'Tiempo abierta', valor: f.duracion(datos.fechaReporte, generado), sub: `desde el ${f.fecha(datos.fechaReporte)}` }
  ].filter(Boolean));

  /* ── secciones (el orden se puede cambiar con `evidenciaPosicion`) ── */
  const seccionDatos = () => {
    seccion(ctx, 'Datos del reporte');
    const via = datos.via || {};
    const hayVia = Object.values(via).some((v) => v !== undefined && v !== null && v !== '');
    const lat = Number(datos.latitud);
    const lng = Number(datos.longitud);
    const hayCoordenadas = Number.isFinite(lat) && Number.isFinite(lng) && datos.latitud !== null && datos.longitud !== null;
    const urlMapa = (opciones.urlMapa || ((a, b) => `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=18/${a}/${b}`))(lat, lng);
    // Lista plana: la cuadrícula acomoda sola las celdas (3 por fila) y omite las vacías.
    ficha(ctx, [
      { etiqueta: 'Municipio', valor: municipioTexto },
      { etiqueta: 'Comunidad', valor: limpiar(datos.comunidad) },
      { etiqueta: 'Reportado por', valor: limpiar(datos.reportadoPor) || 'Anónimo' },
      { etiqueta: 'Tipo de vía', valor: AMBITOS[datos.ambito] || humanizar(datos.ambito) },
      { etiqueta: 'Fecha y hora del reporte', valor: f.fechaHora(datos.fechaReporte) },
      datos.peligrosa
        ? { etiqueta: 'Marca de peligro', valor: datos.peligrosaMotivo ? `Sí: ${limpiar(datos.peligrosaMotivo)}` : 'Sí' }
        : null,
      datos.moderacion?.oculta
        ? { etiqueta: 'Moderación', valor: [limpiar(datos.moderacion.motivo) || 'Reporte oculto', datos.moderacion.fecha ? `desde el ${f.fecha(datos.moderacion.fecha)}` : ''].filter(Boolean).join(' · ') }
        : null,
      hayCoordenadas ? { etiqueta: 'Ubicación (latitud, longitud)', valor: `${datos.latitud}, ${datos.longitud}`, enlace: { texto: 'Abrir ubicación en el mapa', url: urlMapa } } : null,
      { etiqueta: 'Dependencia responsable', valor: limpiar(via.dependencia) },
      hayVia ? { etiqueta: 'Vía', valor: [limpiar(via.nombre), via.clave ? `(${limpiar(via.clave)})` : ''].filter(Boolean).join(' ') } : null,
      hayVia && via.kilometro !== undefined && via.kilometro !== null && via.kilometro !== '' ? { etiqueta: 'Kilómetro', valor: `km ${via.kilometro}` } : null,
      hayVia ? { etiqueta: 'Sentido / carril', valor: limpiar(via.sentido) } : null,
      hayVia && via.tramo ? { etiqueta: 'Tramo', valor: limpiar(via.tramo), span: 3 } : null
    ]);
  };

  const seccionDescripcion = () => {
    seccion(ctx, 'Descripción del reporte');
    const texto = limpiar(datos.descripcion);
    if (texto) parrafo(ctx, texto);
    else parrafo(ctx, 'Sin descripción registrada.', { tipo: 'cursiva', color: c.gris });
    if (limpiar(datos.indicaciones)) {
      ctx.y += 4;
      panelTexto(ctx, limpiar(datos.indicaciones), { etiqueta: 'Indicaciones' });
    }
  };

  const seccionSolucion = () => {
    if (!datos.solucion) return;
    const s = datos.solucion;
    seccion(ctx, 'Solución aplicada');
    ficha(ctx, [
      { etiqueta: 'Fecha de resolución', valor: f.fechaHora(s.fecha) },
      { etiqueta: 'Costo de reparación', valor: f.dinero(s.costo) },
      { etiqueta: 'Resuelta por', valor: limpiar(s.responsable) }
    ]);
    if (limpiar(s.texto)) {
      ctx.y += 2;
      panelTexto(ctx, limpiar(s.texto), { etiqueta: 'Trabajo realizado' });
    }
  };

  const seccionHistorial = () => {
    if (!datos.historial?.length) return;
    // Si el historial completo cabe en la página, se mantiene junto bajo su título.
    const alto = alturaLineaTiempo(ctx, datos.historial);
    seccion(ctx, 'Historial', { cuenta: datos.historial.length, espacioMinimo: Math.min(alto, 130) + 34 });
    lineaTiempo(ctx, datos.historial);
  };

  const seccionEvidencia = () => {
    const bloques = [
      { titulo: 'Evidencia del reporte', datos: evidencia, otros: 'Otros archivos adjuntos' },
      { titulo: 'Evidencia de la solución', datos: evidenciaSolucion, otros: 'Otros archivos de la solución' }
    ];
    for (const b of bloques) {
      if (!b.datos.total) continue;
      seccion(ctx, b.titulo, { cuenta: b.datos.total, espacioMinimo: { 1: 230, 2: 160, 3: 130 }[diseno.evidenciaColumnas] });
      galeria(ctx, b.datos.incrustables, { columnas: diseno.evidenciaColumnas });
      listaArchivos(ctx, b.datos.otros, b.otros);
    }
  };

  const orden =
    diseno.evidenciaPosicion === 'despues_descripcion'
      ? [seccionDatos, seccionDescripcion, seccionEvidencia, seccionSolucion, seccionHistorial]
      : [seccionDatos, seccionDescripcion, seccionSolucion, seccionHistorial, seccionEvidencia];
  orden.forEach((dibujar) => dibujar());

  decorarPaginas(ctx, {
    cabeceraIzquierda: `${folio}  ·  ${titulo}`,
    cabeceraDerecha: 'Informe de incidencia',
    pie: `${diseno.pieTexto}  ·  ${folio}`
  });
  return cerrar(ctx, fin);
}

/* ═══════════════════════════ gráficas vectoriales ═══════════════════════════ */

function subtitulo(ctx, x, y, ancho, texto) {
  escribir(ctx, texto, x, y, { tipo: 'semi', tam: 9.5, ancho, truncar: true });
  regla(ctx, y + 15, { color: ctx.c.lineaSuave, x1: x, x2: x + ancho });
}

/** Barras horizontales con etiqueta directa. La barra mayor lleva el color pleno. */
function graficoBarras(ctx, x, y, ancho, items, { maximo = 8 } = {}) {
  const { doc, c, f } = ctx;
  let lista = items.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (lista.length > maximo) {
    const resto = lista.slice(maximo - 1);
    lista = [...lista.slice(0, maximo - 1), { etiqueta: `Otros (${resto.length})`, valor: resto.reduce((s, i) => s + i.valor, 0) }];
  }
  const wEtiqueta = Math.min(120, ancho * 0.4);
  const xBarra = x + wEtiqueta + 8;
  const wMax = ancho - wEtiqueta - 8 - 34;
  const mayor = Math.max(1, ...lista.map((i) => i.valor));
  const paso = 19;
  lista.forEach((it, i) => {
    const yy = y + i * paso;
    escribir(ctx, it.etiqueta, x, yy + 1.5, { tam: T.tabla, ancho: wEtiqueta, truncar: true });
    const w = Math.max(3, (it.valor / mayor) * wMax);
    doc.roundedRect(xBarra, yy + 2.5, w, 10, Math.min(2, w / 2)).fill(i === 0 ? c.acento : c.acentoMedio);
    escribir(ctx, f.entero(it.valor), xBarra + w + 5, yy + 1.5, { tipo: 'semi', tam: T.tabla, ancho: 40 });
  });
  return lista.length * paso;
}

/** Dona con total al centro y leyenda con cantidades y porcentajes. */
function graficoDonut(ctx, x, y, ancho, items, { centroEtiqueta = 'incidencias' } = {}) {
  const { doc, c, f } = ctx;
  const lista = items.filter((i) => i.valor > 0);
  const suma = lista.reduce((s, i) => s + i.valor, 0);
  if (!suma) return 0;
  const rad = 46;
  const radInt = 30;
  const cx = x + rad + 2;
  const cy = y + rad + 2;
  const rampa = [c.acento, c.acentoMedio, mezclar(c.acento, '#000000', 0.35), c.acentoClaro, '#9aa7b3', '#6b7a89'];
  const colorDe = (it, i) => ESTADOS[String(it.clave || '').toLowerCase()]?.punto || rampa[i % rampa.length];

  let ang = -Math.PI / 2;
  lista.forEach((it, i) => {
    const frac = it.valor / suma;
    const fin2 = ang + frac * Math.PI * 2;
    if (frac > 0.9999) doc.circle(cx, cy, rad).fill(colorDe(it, i));
    else {
      const [x1, y1] = [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
      const [x2, y2] = [cx + rad * Math.cos(fin2), cy + rad * Math.sin(fin2)];
      doc.path(`M ${cx} ${cy} L ${x1} ${y1} A ${rad} ${rad} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`).lineWidth(1.4).fillAndStroke(colorDe(it, i), c.blanco);
    }
    ang = fin2;
  });
  doc.circle(cx, cy, radInt).fill(c.blanco);
  escribir(ctx, f.entero(suma), cx - radInt, cy - 11, { tipo: 'negrita', tam: 15, ancho: radInt * 2, align: 'center' });
  escribir(ctx, centroEtiqueta, cx - radInt, cy + 5, { tam: 8, color: c.gris, ancho: radInt * 2, align: 'center' });

  const xLeyenda = x + rad * 2 + 24;
  const wLeyenda = ancho - (xLeyenda - x);
  const hItem = 27;
  const y0Leyenda = y + Math.max(2, (rad * 2 + 4 - lista.length * hItem) / 2);
  lista.forEach((it, i) => {
    const yy = y0Leyenda + i * hItem;
    doc.roundedRect(xLeyenda, yy + 2.5, 8, 8, 2).fill(colorDe(it, i));
    escribir(ctx, it.etiqueta, xLeyenda + 14, yy, { tipo: 'semi', tam: T.tabla, ancho: wLeyenda - 14, truncar: true });
    escribir(ctx, `${f.entero(it.valor)}  ·  ${Math.round((it.valor / suma) * 100)} %`, xLeyenda + 14, yy + 11.5, { tam: T.etiqueta, color: c.gris, ancho: wLeyenda - 14, truncar: true });
  });
  return Math.max(rad * 2 + 6, lista.length * hItem + 4);
}

/** Tope redondo del eje: 23 → 24, 170 → 200, 7 → 8. La mitad siempre es un número entero. */
const maximoLimpio = (v) => {
  if (v <= 4) return 4;
  if (v <= 6) return 6;
  if (v <= 8) return 8;
  if (v <= 10) return 10;
  const e = 10 ** Math.floor(Math.log10(v));
  const m = v / e;
  return (m <= 1.2 ? 1.2 : m <= 1.6 ? 1.6 : m <= 2 ? 2 : m <= 2.4 ? 2.4 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * e;
};

/** Tendencia mensual: área + línea con valores sobre cada punto (hasta 14 meses). */
function graficoSerie(ctx, x, y, ancho, alto, puntos) {
  const { doc, c, f } = ctx;
  if (!puntos.length) {
    escribir(ctx, 'Sin datos en el periodo seleccionado.', x, y + 10, { tam: T.tabla, color: c.gris, ancho });
    return;
  }
  const wEje = 30;
  const hEtiquetas = 16;
  const gx = x + wEje;
  const gw = ancho - wEje - 8;
  const gy = y + 10;
  const gh = alto - hEtiquetas - 10;
  const tope = maximoLimpio(Math.max(...puntos.map((p) => p.valor)));
  for (let i = 0; i <= 2; i += 1) {
    const yy = gy + gh - (gh * i) / 2;
    regla(ctx, yy, { color: i === 0 ? c.linea : c.lineaSuave, x1: gx, x2: gx + gw, grosor: i === 0 ? 0.8 : 0.5 });
    escribir(ctx, f.entero((tope * i) / 2), x, yy - 4.5, { tam: 8, color: c.gris, ancho: wEje - 6, align: 'right' });
  }
  const n = puntos.length;
  const px = (i) => (n === 1 ? gx + gw / 2 : gx + (gw * i) / (n - 1));
  const py = (v) => gy + gh - (v / tope) * gh;
  if (n > 1) {
    const linea = puntos.map((p, i) => `${i ? 'L' : 'M'} ${px(i)} ${py(p.valor)}`).join(' ');
    doc.path(`${linea} L ${px(n - 1)} ${gy + gh} L ${px(0)} ${gy + gh} Z`).fill(c.acentoSuave);
    doc.path(linea).lineWidth(1.8).lineJoin('round').strokeColor(c.acento).stroke();
  }
  const paso = Math.ceil(n / 8);
  puntos.forEach((p, i) => {
    doc.circle(px(i), py(p.valor), 2.6).lineWidth(1.4).fillAndStroke(c.blanco, c.acento);
    if (n <= 14) escribir(ctx, f.entero(p.valor), px(i) - 15, py(p.valor) - 13, { tipo: 'semi', tam: 8, ancho: 30, align: 'center' });
    if (i % paso === 0 || i === n - 1) escribir(ctx, p.etiqueta, px(i) - 22, gy + gh + 5, { tam: 8, color: c.gris, ancho: 44, align: 'center' });
  });
}

/* ═══════════════════════════ tablas ═══════════════════════════ */

/**
 * Tabla con encabezado que se repite en cada página, filas cebra y celdas de una línea.
 * columnas: [{ titulo, peso, alinear, valor(fila), tipo: 'estado'|'barra'|undefined }]
 */
function tabla(ctx, columnas, filas, { altoFila = 17 } = {}) {
  const { doc, c } = ctx;
  const suma = columnas.reduce((s, col) => s + col.peso, 0);
  const anchos = columnas.map((col) => (ctx.ancho * col.peso) / suma);
  const pad = 6;

  const encabezado = () => {
    const y0 = ctx.y;
    doc.rect(ctx.izq, y0, ctx.ancho, altoFila + 2).fill(c.acentoSuave);
    let x = ctx.izq;
    columnas.forEach((col, i) => {
      escribir(ctx, col.titulo, x + pad, y0 + 5.5, { tipo: 'semi', tam: T.etiqueta + 0.3, color: c.acento, ancho: anchos[i] - pad * 2, align: col.alinear || 'left', truncar: true });
      x += anchos[i];
    });
    regla(ctx, y0 + altoFila + 2, { color: c.acento, grosor: 0.9 });
    ctx.y = y0 + altoFila + 2;
  };

  asegurar(ctx, altoFila * 4);
  encabezado();
  filas.forEach((fila, r) => {
    if (asegurar(ctx, altoFila)) encabezado();
    const y0 = ctx.y;
    if (r % 2 === 1) doc.rect(ctx.izq, y0, ctx.ancho, altoFila).fill(c.panel);
    let x = ctx.izq;
    columnas.forEach((col, i) => {
      const valor = col.valor(fila);
      const ancho = anchos[i] - pad * 2;
      if (col.tipo === 'estado') {
        const e = ESTADOS[String(valor).toLowerCase()] || { etiqueta: capitalizar(humanizarToken(String(valor))), punto: '#7b8794', texto: c.tinta };
        doc.circle(x + pad + 3, y0 + altoFila / 2, 3).fill(e.punto);
        escribir(ctx, e.etiqueta, x + pad + 11, y0 + 4.5, { tam: T.tabla, ancho: ancho - 11, truncar: true });
      } else if (col.tipo === 'barra') {
        const [fraccion, texto] = valor;
        const wBarra = Math.min(54, ancho - 40);
        doc.roundedRect(x + pad, y0 + altoFila / 2 - 2.5, wBarra, 5, 2.5).fill(c.lineaSuave);
        if (fraccion > 0) doc.roundedRect(x + pad, y0 + altoFila / 2 - 2.5, Math.max(3, wBarra * fraccion), 5, 2.5).fill(c.acento);
        escribir(ctx, texto, x + pad + wBarra + 7, y0 + 4.5, { tam: T.tabla, ancho: ancho - wBarra - 7, truncar: true });
      } else {
        escribir(ctx, valor, x + pad, y0 + 4.5, { tipo: col.negrita ? 'semi' : 'regular', tam: T.tabla, ancho, align: col.alinear || 'left', truncar: true });
      }
      x += anchos[i];
    });
    ctx.y = y0 + altoFila;
  });
  regla(ctx, ctx.y, { color: c.linea });
  ctx.y += 8;
}

/* ═══════════════════════════ PDF del informe general ═══════════════════════════ */

/**
 * @typedef {Object} DatosInforme
 * @property {string} [titulo]
 * @property {{alcance?:string, tipos?:string, desde?:string, hasta?:string, compararPor?:string}} [filtros]
 * @property {{total:number, reportadas?:number, enProceso?:number, resueltas?:number, promedioDias?:number}} resumen
 * @property {Array<{etiqueta:string, total:number}>} [porTipo]
 * @property {Array<{clave?:string, etiqueta:string, total:number}>} [porEstado]
 * @property {Array<{mes:string, total:number}>} [serie]           mes = "2026-10"
 * @property {Array<{etiqueta:string, total:number, resueltas:number, pendientes:number, promedioDias?:number}>} [comparativa]
 * @property {Array<{folio:string, fecha:string|Date, tipo:string, municipio:string, estado:string, dias?:number}>} [incidencias]
 */

/**
 * Genera el informe general (resumen, gráficas, comparación y detalle).
 * `opciones.graficos` acepta { barras, pastel, serie, comparacion, detalle } (todas true por defecto),
 * los mismos interruptores del constructor de informes.
 */
export async function crearPdfInforme(datos, opciones = {}) {
  const diseno = disenoDesdeConfiguracion(opciones.diseno || {}, { logo: opciones.logo });
  const g = { barras: true, pastel: true, serie: true, comparacion: true, detalle: true, ...(opciones.graficos || {}) };
  const generado = opciones.generado ?? new Date();
  const titulo = limpiar(datos.titulo) || 'Informe de incidencias';
  const { ctx, fin } = abrirDocumento({
    titulo,
    asunto: 'Informe general de incidencias',
    palabras: 'incidencias, informe, estadísticas',
    diseno,
    opciones
  });
  const { f, c } = ctx;
  ctx.logo = await abrirImagen(ctx.doc, diseno.logo, opciones.optimizarImagen);

  const filtros = datos.filtros || {};
  const resumen = datos.resumen || { total: 0 };
  const porEstado = datos.porEstado || [];
  const delEstado = (clave) => porEstado.find((e) => e.clave === clave)?.total;
  const total = numero(resumen.total, 0);
  const resueltas = numero(resumen.resueltas ?? delEstado('resuelta'), 0);
  const enProceso = numero(resumen.enProceso ?? delEstado('en_proceso'), 0);
  const reportadas = numero(resumen.reportadas ?? delEstado('reportada'), Math.max(0, total - resueltas - enProceso));

  membrete(ctx, { linea1: diseno.pieTexto, linea2: limpiar(filtros.alcance) });
  bloqueTitulo(ctx, {
    etiqueta: 'Informe general',
    titulo,
    meta: `Generado el ${f.fechaHora(generado)}${opciones.generadoPor ? `  ·  ${limpiar(opciones.generadoPor)}` : ''}`
  });

  const periodo = filtros.desde || filtros.hasta ? `${filtros.desde ? f.fecha(filtros.desde) : 'Inicio'} – ${filtros.hasta ? f.fecha(filtros.hasta) : 'hoy'}` : 'Todo el historial';
  ficha(ctx, [
    { etiqueta: 'Alcance', valor: limpiar(filtros.alcance) || 'Todas las incidencias de mi ámbito' },
    { etiqueta: 'Tipos de incidencia', valor: limpiar(filtros.tipos) || 'Todos' },
    { etiqueta: 'Periodo', valor: periodo }
  ]);
  ctx.y += 2;

  franjaResumen(ctx, [
    { etiqueta: 'Incidencias', valor: f.entero(total), tam: T.kpi },
    { etiqueta: 'Resueltas', valor: f.entero(resueltas), sub: total ? `${Math.round((resueltas / total) * 100)} % del total` : '', tam: T.kpi },
    { etiqueta: 'En proceso', valor: f.entero(enProceso), tam: T.kpi },
    { etiqueta: 'Sin atender', valor: f.entero(reportadas), tam: T.kpi },
    { etiqueta: 'Atención promedio', valor: resumen.promedioDias === undefined || resumen.promedioDias === null ? '—' : `${f.decimal(resumen.promedioDias)} d`, sub: 'días por incidencia', tam: T.kpi }
  ]);

  /* ── gráficas ── */
  const porTipo = (datos.porTipo || []).map((t) => ({ etiqueta: limpiar(t.etiqueta), valor: numero(t.total, 0) }));
  const estados = porEstado.map((e) => ({ clave: e.clave, etiqueta: ESTADOS[e.clave]?.etiqueta || capitalizar(humanizarToken(e.etiqueta || e.clave || '')), valor: numero(e.total, 0) }));
  const hayBarras = g.barras && porTipo.some((t) => t.valor > 0);
  const hayDona = g.pastel && estados.some((e) => e.valor > 0);
  if (hayBarras || hayDona) {
    seccion(ctx, 'Panorama general', { espacioMinimo: 190 });
    const y0 = ctx.y;
    const dosColumnas = hayBarras && hayDona;
    const wIzq = dosColumnas ? ctx.ancho * 0.5 : ctx.ancho;
    const xDer = dosColumnas ? ctx.izq + wIzq + 22 : ctx.izq;
    const wDer = dosColumnas ? ctx.ancho - wIzq - 22 : ctx.ancho;
    let alto = 0;
    if (hayBarras) {
      subtitulo(ctx, ctx.izq, y0, wIzq, 'Incidencias por tipo');
      alto = Math.max(alto, 22 + graficoBarras(ctx, ctx.izq, y0 + 22, wIzq, porTipo));
    }
    if (hayDona) {
      const xx = hayBarras ? xDer : ctx.izq;
      const ww = hayBarras ? wDer : ctx.ancho;
      subtitulo(ctx, xx, y0, ww, 'Distribución por estado');
      alto = Math.max(alto, 22 + graficoDonut(ctx, xx, y0 + 22, ww, estados));
    }
    ctx.y = y0 + alto + 10;
  }

  if (g.serie) {
    const puntos = (datos.serie || []).map((p) => ({ etiqueta: f.mes(p.mes), valor: numero(p.total, 0) }));
    if (puntos.length) {
      asegurar(ctx, 175);
      ctx.y += 4;
      subtitulo(ctx, ctx.izq, ctx.y, ctx.ancho, 'Tendencia mensual de incidencias');
      graficoSerie(ctx, ctx.izq, ctx.y + 22, ctx.ancho, 120, puntos);
      ctx.y += 22 + 120 + 10;
    }
  }

  /* ── tablas ── */
  if (g.comparacion && datos.comparativa?.length) {
    const nombres = { municipio: 'municipio', estado: 'estado', tipo: 'tipo de incidencia', ambito: 'tipo de vía', mes: 'mes' };
    const n = datos.comparativa.length;
    seccion(ctx, `Comparación por ${nombres[filtros.compararPor] || 'grupo'}`, { cuenta: n, espacioMinimo: n <= 12 ? 27 + 19 + n * 17 + 12 : 100 });
    tabla(
      ctx,
      [
        { titulo: 'Grupo', peso: 4, valor: (r) => limpiar(r.etiqueta), negrita: true },
        { titulo: 'Total', peso: 1.1, alinear: 'right', valor: (r) => f.entero(r.total) },
        { titulo: 'Resueltas', peso: 1.3, alinear: 'right', valor: (r) => f.entero(r.resueltas) },
        { titulo: 'Pendientes', peso: 1.3, alinear: 'right', valor: (r) => f.entero(r.pendientes) },
        { titulo: '% resueltas', peso: 2.2, tipo: 'barra', valor: (r) => [r.total ? r.resueltas / r.total : 0, r.total ? `${Math.round((r.resueltas / r.total) * 100)} %` : '—'] },
        { titulo: 'Días prom.', peso: 1.3, alinear: 'right', valor: (r) => (r.promedioDias === undefined || r.promedioDias === null ? '—' : f.decimal(r.promedioDias)) }
      ],
      datos.comparativa
    );
  }

  if (g.detalle && datos.incidencias?.length) {
    seccion(ctx, 'Detalle de incidencias', { cuenta: datos.incidencias.length, espacioMinimo: 110 });
    tabla(
      ctx,
      [
        { titulo: 'Folio', peso: 2.8, valor: (r) => limpiar(r.folio), negrita: true },
        { titulo: 'Fecha', peso: 1.7, valor: (r) => f.fecha(r.fecha) },
        { titulo: 'Tipo', peso: 3, valor: (r) => capitalizar(r.tipo) },
        { titulo: 'Municipio', peso: 3, valor: (r) => limpiar(r.municipio) },
        { titulo: 'Estado', peso: 2, tipo: 'estado', valor: (r) => r.estado },
        { titulo: 'Días', peso: 0.9, alinear: 'right', valor: (r) => (r.dias === undefined || r.dias === null ? '—' : f.entero(r.dias)) }
      ],
      datos.incidencias
    );
  }

  decorarPaginas(ctx, { cabeceraIzquierda: titulo, cabeceraDerecha: 'Informe general', pie: diseno.pieTexto });
  return cerrar(ctx, fin);
}

/* ═══════════════════════════ PDF de una reclamación ═══════════════════════════ */

/**
 * @typedef {Object} DatosReclamacion
 * @property {string} folio                       Folio de la incidencia
 * @property {string} [folioReclamacion]          Folio propio de la reclamación
 * @property {string} [titulo]                    Título de la incidencia
 * @property {string} [tipo]                      Nombre del tipo
 * @property {string} [estado]                    Estado actual de la incidencia
 * @property {{nombre?:string, clave?:string, estado?:string}|string} [municipio]
 * @property {string} [reclamante]
 * @property {string|Date} [fechaReclamacion]
 * @property {string} [motivo]
 * @property {string} [detalle]
 * @property {string} [decision]                  revertir | mantener | pendiente
 * @property {string} [resolvio]
 * @property {string|Date} [fechaDecision]
 * @property {string} [delegadoA]
 * @property {string} [respuesta]
 * @property {string} [solucion]
 * @property {number|null} [costo]
 */

/**
 * Genera el informe preliminar de una reclamación con el mismo sistema visual que
 * el resto de documentos: membrete, tipografía incrustada, ficha, paneles y pie.
 *
 * @param {DatosReclamacion} datos
 * @param {Object} [opciones] Mismas opciones que `crearPdfIncidencia`.
 * @returns {Promise<Buffer>}
 */
export async function crearPdfReclamacion(datos, opciones = {}) {
  const diseno = disenoDesdeConfiguracion(opciones.diseno || {}, { logo: opciones.logo });
  const generado = opciones.generado ?? new Date();
  const folio = limpiar(datos.folio) || 'Sin folio';
  const titulo = limpiar(datos.titulo) || 'Incidencia';
  const { ctx, fin } = abrirDocumento({
    titulo: `Reclamación ${folio}`,
    asunto: 'Informe preliminar de reclamación',
    palabras: ['reclamación', folio].join(', '),
    diseno,
    opciones
  });
  const { f, c } = ctx;
  ctx.logo = await abrirImagen(ctx.doc, diseno.logo, opciones.optimizarImagen);

  const mun = datos.municipio && typeof datos.municipio === 'object' ? datos.municipio : { nombre: datos.municipio };
  const nombreEsClave = /^\d+$/.test(String(mun.nombre || ''));
  const clave = mun.clave || (nombreEsClave ? mun.nombre : '');
  const nombreMunicipio = nombreEsClave ? '' : limpiar(mun.nombre);
  const municipioTexto = nombreMunicipio ? (clave ? `${nombreMunicipio} (${clave})` : nombreMunicipio) : clave ? `Clave ${clave}` : 'No registrado';
  const motivoTexto = MOTIVOS_RECLAMACION[String(datos.motivo || '').toLowerCase()] || humanizar(datos.motivo) || '—';
  const decisionTexto = DECISIONES_RECLAMACION[String(datos.decision || '').toLowerCase()] || 'Pendiente de decisión';
  const estadoTexto = ESTADOS[String(datos.estado || '').toLowerCase()]?.etiqueta || capitalizar(humanizarToken(datos.estado || '—'));

  membrete(ctx, { linea1: diseno.pieTexto, linea2: [nombreMunicipio, limpiar(mun.estado)].filter(Boolean).join(', ') });
  bloqueTitulo(ctx, {
    etiqueta: 'Informe preliminar de reclamación',
    titulo,
    meta: `Generado el ${f.fechaHora(generado)}`,
    folio,
    estado: datos.estado
  });

  franjaResumen(ctx, [
    { etiqueta: 'Estado', estado: datos.estado },
    { etiqueta: 'Motivo', valor: motivoTexto },
    { etiqueta: 'Presentada', valor: f.fecha(datos.fechaReclamacion), sub: f.hora(datos.fechaReclamacion) },
    { etiqueta: 'Decisión', valor: decisionTexto }
  ]);

  seccion(ctx, 'Reclamación');
  ficha(ctx, [
    { etiqueta: 'Reclamante', valor: limpiar(datos.reclamante) || 'Cuenta registrada' },
    { etiqueta: 'Fecha de presentación', valor: f.fechaHora(datos.fechaReclamacion) },
    { etiqueta: 'Motivo', valor: motivoTexto },
    { etiqueta: 'Delegada a', valor: limpiar(datos.delegadoA) },
    { etiqueta: 'Resolvió', valor: limpiar(datos.resolvio) },
    { etiqueta: 'Fecha de decisión', valor: f.fechaHora(datos.fechaDecision) }
  ]);
  if (limpiar(datos.detalle)) {
    ctx.y += 2;
    panelTexto(ctx, limpiar(datos.detalle), { etiqueta: 'Detalle de la reclamación' });
  }

  seccion(ctx, 'Decisión');
  ficha(ctx, [
    { etiqueta: 'Resultado', valor: decisionTexto, span: 2 },
    { etiqueta: 'Resolvió', valor: limpiar(datos.resolvio) },
    { etiqueta: 'Fecha de decisión', valor: f.fechaHora(datos.fechaDecision) },
    { etiqueta: 'Delegada a', valor: limpiar(datos.delegadoA), span: 2 }
  ]);
  if (limpiar(datos.respuesta)) {
    ctx.y += 2;
    panelTexto(ctx, limpiar(datos.respuesta), { etiqueta: 'Respuesta registrada' });
  }

  seccion(ctx, 'Estado de la incidencia');
  ficha(ctx, [
    { etiqueta: 'Folio', valor: folio },
    { etiqueta: 'Municipio', valor: municipioTexto },
    { etiqueta: 'Tipo', valor: capitalizar(datos.tipo) || '—' },
    { etiqueta: 'Título', valor: titulo, span: 3 },
    { etiqueta: 'Estado actual', valor: estadoTexto },
    datos.costo !== undefined && datos.costo !== null
      ? { etiqueta: 'Costo de reparación', valor: f.dinero(datos.costo) }
      : null,
    { etiqueta: 'Solución registrada', valor: limpiar(datos.solucion), span: 2 }
  ]);

  ctx.y += 6;
  panelTexto(
    ctx,
    'Este informe es preliminar y forma parte del expediente de la incidencia. La decisión queda registrada en el historial del reporte y puede consultarse en el sistema.',
    { etiqueta: 'Nota' }
  );

  decorarPaginas(ctx, {
    cabeceraIzquierda: `${folio}  ·  ${titulo}`,
    cabeceraDerecha: 'Informe de reclamación',
    pie: `${diseno.pieTexto}  ·  ${folio}`
  });
  return cerrar(ctx, fin);
}
