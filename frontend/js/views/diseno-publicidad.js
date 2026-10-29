/**
 * Motor de diseño de publicidad (solo cliente, sin llamadas a la API).
 *
 * - `construirSvg` dibuja la pieza (5 diseños × 5 formatos) como SVG vectorial.
 * - `svgAPng` la convierte a PNG del tamaño exacto para subirla a Canva o a la red.
 * - `csvCanva` genera el archivo para «Creación en masa» de Canva.
 * - `construirCorreo` arma el HTML del correo (estilos en línea para clientes
 *   de correo) y `prepararVistaHtml` lo muestra en pantalla respetando la CSP
 *   estricta (`style-src-attr 'none'`): los estilos pasan a `data-e` y se
 *   aplican por CSSOM con `aplicarEstilosData`.
 *
 * Ninguna cadena de este archivo lleva atributos de estilo en línea literales.
 */
import { FORMATOS, FUENTES } from '../data/plantillas-publicidad.js';

const COLOR_HEX = /^#[0-9a-f]{6}$/i;
const NOMBRE_SISTEMA = 'Sistema de Incidencias Municipales';

/* ----------------------------- utilidades base ---------------------------- */

export function colorValido(valor, porDefecto) {
  const limpio = String(valor || '').trim();
  return COLOR_HEX.test(limpio) ? limpio.toLowerCase() : porDefecto;
}

export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const redondear = (n) => Math.round(n * 10) / 10;

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex(canales) {
  return `#${canales.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Mezcla dos colores; `t` = 0 devuelve `a` y 1 devuelve `b`. */
export function mezclar(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return aHex(A.map((x, i) => x + (B[i] - x) * t));
}

function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto legible (blanco u oscuro) sobre un fondo. */
export function textoSobre(fondo) {
  return luminancia(fondo) > 0.42 ? '#10201e' : '#ffffff';
}

function dominio(enlace) {
  return String(enlace || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

/** Sustituye `{municipio}` por el nombre elegido (o una fórmula neutra). */
export function aplicarTokens(texto, municipio) {
  return String(texto ?? '').replace(/\{municipio\}/gi, municipio || 'tu municipio');
}

/** ¿Quedan marcas de «completar» entre corchetes? */
export function pendientesDe(...textos) {
  return textos.some((t) => /\[[^\]]+\]/.test(String(t || '')));
}

/* ------------------------- texto: ajuste y envoltura ----------------------- */

function envolver(texto, ancho, fs, factor) {
  const maximo = Math.max(4, Math.floor(ancho / (fs * factor)));
  const lineas = [];
  for (const parrafo of String(texto || '').split(/\n+/)) {
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (prueba.length > maximo && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);
  }
  return lineas;
}

/** Busca el mayor cuerpo de letra que cabe; si no cabe, recorta con «…». */
function ajustar(texto, { ancho, alto, max, min, factor, interl = 1.22, maxLineas = 99 }) {
  const tope = Math.max(min, max);
  for (let fs = Math.round(tope); fs >= min; fs -= 2) {
    const lineas = envolver(texto, ancho, fs, factor);
    if (lineas.length <= maxLineas && lineas.length * fs * interl <= alto) {
      return { lineas, fs, alto: lineas.length * fs * interl };
    }
  }
  const fs = Math.round(min);
  let lineas = envolver(texto, ancho, fs, factor);
  const filas = Math.max(1, Math.min(maxLineas, Math.floor(alto / (fs * interl))));
  if (lineas.length > filas) {
    lineas = lineas.slice(0, filas);
    const limite = Math.max(4, Math.floor(ancho / (fs * factor)) - 1);
    lineas[filas - 1] = `${lineas[filas - 1].slice(0, limite).replace(/[\s.,;:¿¡-]+$/, '')}…`;
  }
  return { lineas, fs, alto: lineas.length * fs * interl };
}

function lineasSvg(c, lineas, x, y, fs, { interl = 1.22, fill, peso = 400, anchor = 'start', espaciado = 0 } = {}) {
  return lineas
    .map(
      (linea, i) =>
        `<text x="${redondear(x)}" y="${redondear(y + fs * 0.9 + i * fs * interl)}" font-family="${c.fam}" font-size="${fs}" font-weight="${peso}" fill="${fill}" text-anchor="${anchor}"${
          espaciado ? ` letter-spacing="${espaciado}"` : ''
        }>${esc(linea)}</text>`
    )
    .join('');
}

/* ------------------------------ piezas gráficas ---------------------------- */

const PIN =
  'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z';

function marca(x, y, tam, fondo, trazo) {
  const escala = (tam * 0.62) / 24;
  const desplaza = tam * 0.19;
  return `<rect x="${redondear(x)}" y="${redondear(y)}" width="${redondear(tam)}" height="${redondear(tam)}" rx="${redondear(tam * 0.26)}" fill="${fondo}"/><path transform="translate(${redondear(x + desplaza)} ${redondear(y + desplaza)}) scale(${redondear(escala * 100) / 100})" d="${PIN}" fill="${trazo}"/>`;
}

/** Marca + nombre del sistema. `ancla`: 'start' (izquierda) o 'middle' (centro). */
function cabecera(c, x, centroY, tam, colorTexto, fondoMarca, trazoMarca, ancla = 'start') {
  const fs = Math.round(Math.max(17, tam * 0.4));
  const anchoNombre = NOMBRE_SISTEMA.length * fs * 0.54 * c.fx;
  const total = tam + tam * 0.3 + anchoNombre;
  const x0 = ancla === 'middle' ? x - total / 2 : x;
  return `${marca(x0, centroY - tam / 2, tam, fondoMarca, trazoMarca)}<text x="${redondear(x0 + tam * 1.3)}" y="${redondear(centroY + fs * 0.35)}" font-family="${c.fam}" font-size="${fs}" font-weight="700" fill="${colorTexto}">${esc(NOMBRE_SISTEMA)}</text>`;
}

function pildora(c, x, y, texto, fs, fondo, tinta, ancla = 'start') {
  const alto = fs * 2.3;
  const ancho = texto.length * fs * 0.56 * c.fx + fs * 2.2;
  const x0 = ancla === 'middle' ? x - ancho / 2 : x;
  return {
    ancho,
    alto,
    svg: `<rect x="${redondear(x0)}" y="${redondear(y)}" width="${redondear(ancho)}" height="${redondear(alto)}" rx="${redondear(alto / 2)}" fill="${fondo}"/><text x="${redondear(x0 + ancho / 2)}" y="${redondear(y + alto / 2 + fs * 0.35)}" font-family="${c.fam}" font-size="${fs}" font-weight="700" fill="${tinta}" text-anchor="middle">${esc(texto)}</text>`
  };
}

/** Bloque del QR. Devuelve medidas y una función para dibujarlo en (x, y). */
function bloqueQr(c, ladoBase) {
  const { p } = c;
  if (!p.mostrarQr || (!p.qrUrl && !p.qrMarcador)) return { w: 0, h: 0, dibujar: () => '' };
  const factor = Math.max(0.45, Math.min(Number(p.qrConfig?.tamano || 180) / 180, 2.5));
  const lado = ladoBase * factor;
  const pad = lado * 0.08;
  const pie = lado * 0.17;
  const w = lado + pad * 2;
  const h = lado + pad * 2 + pie;
  return {
    w,
    h,
    dibujar(x, y) {
      let interior;
      if (p.qrUrl) {
        const href = esc(p.qrUrl);
        interior = `<image x="${redondear(x + pad)}" y="${redondear(y + pad)}" width="${redondear(lado)}" height="${redondear(lado)}" href="${href}" xlink:href="${href}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        interior = `<rect x="${redondear(x + pad)}" y="${redondear(y + pad)}" width="${redondear(lado)}" height="${redondear(lado)}" rx="8" fill="#f1f5f4" stroke="#9fb5b1" stroke-width="3" stroke-dasharray="10 8"/><text x="${redondear(x + w / 2)}" y="${redondear(y + pad + lado / 2 + lado * 0.06)}" font-family="${c.fam}" font-size="${redondear(lado * 0.2)}" font-weight="700" fill="#7b918d" text-anchor="middle">QR</text>`;
      }
      const fsPie = Math.max(11, lado * 0.075);
      const etiqueta = esc(String(p.qrConfig?.etiqueta || 'Escanea y participa').slice(0, 60));
      return `<rect x="${redondear(x)}" y="${redondear(y)}" width="${redondear(w)}" height="${redondear(h)}" rx="${redondear(lado * 0.09)}" fill="#ffffff"/>${interior}<text x="${redondear(x + w / 2)}" y="${redondear(y + pad * 2 + lado + fsPie * 0.95)}" font-family="${c.fam}" font-size="${redondear(fsPie)}" font-weight="700" fill="#3d5b57" text-anchor="middle">${etiqueta}</text>`;
    }
  };
}

function lineaPie(c, x, y, fill, ancla = 'start') {
  const fs = Math.round(Math.max(13, 19 * c.u));
  return `<text x="${redondear(x)}" y="${redondear(y)}" font-family="${c.fam}" font-size="${fs}" fill="${fill}" text-anchor="${ancla}">${esc(c.pie)}</text>`;
}

function etiqueta(c, texto, x, y, fill, ancla = 'start') {
  if (!texto) return { svg: '', alto: 0 };
  const fs = Math.round(Math.max(15, 21 * c.u));
  return {
    alto: fs * 1.9,
    svg: `<text x="${redondear(x)}" y="${redondear(y + fs * 0.9)}" font-family="${c.fam}" font-size="${fs}" font-weight="700" letter-spacing="${redondear(fs * 0.12)}" fill="${fill}" text-anchor="${ancla}">${esc(String(texto).toUpperCase().slice(0, 48))}</text>`
  };
}

/* --------------------------------- diseños --------------------------------- */

function pasosDe(texto, maximo) {
  let items = String(texto || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length < 2) {
    items = String(texto || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return items.slice(0, maximo);
}

function disenoBanda(c) {
  const { w, h, u, m, P, p, horiz } = c;
  const banda = Math.round(horiz ? h * 0.19 : h * 0.115);
  const q = bloqueQr(c, Math.round(horiz ? h * 0.33 : w * 0.2));
  const ctaFs = Math.round(Math.max(21, 31 * u));
  const pieY = h - m * 0.42;
  const ctaTop = h - m * 0.45 - Math.max(13, 19 * u) * 2.1 - ctaFs * 2.3;
  let s = `<rect width="${w}" height="${h}" fill="${mezclar(P, '#ffffff', 0.93)}"/><rect width="${w}" height="${banda}" fill="${P}"/>`;
  s += cabecera(c, m, banda / 2, banda * 0.52, textoSobre(P), '#ffffff', P);

  const qY = horiz ? (banda + h) / 2 - q.h / 2 : h - m * 0.55 - q.h;
  const limite = horiz ? ctaTop : Math.min(ctaTop, q.w ? qY : ctaTop);
  const ancho = horiz ? w - m * 2 - (q.w ? q.w + m * 0.7 : 0) : w - m * 2;
  const arriba = banda + m * 0.75;
  const alto = limite - m * 0.45 - arriba;
  const k = etiqueta(c, p.kicker, m, arriba, c.P);
  const tit = ajustar(p.titulo, { ancho, alto: (alto - k.alto) * 0.5, max: 92 * u, min: 30 * u, factor: 0.55 * c.fx, interl: 1.12, maxLineas: 4 });
  const cuerpo = ajustar(p.cuerpo, { ancho, alto: alto - k.alto - tit.alto - m * 0.3, max: 38 * u, min: 16 * u, factor: 0.48 * c.fx });
  s += k.svg;
  s += lineasSvg(c, tit.lineas, m, arriba + k.alto, tit.fs, { interl: 1.12, fill: c.S, peso: 800 });
  s += lineasSvg(c, cuerpo.lineas, m, arriba + k.alto + tit.alto + m * 0.3, cuerpo.fs, { fill: '#2b4a46' });
  if (p.cta) s += pildora(c, m, ctaTop, p.cta, ctaFs, P, textoSobre(P)).svg;
  s += lineaPie(c, m, pieY, '#5b7774');
  if (q.w) s += q.dibujar(w - m - q.w, qY);
  return s;
}

function disenoCentrado(c) {
  const { w, h, u, m, P, S, p, horiz } = c;
  const q = bloqueQr(c, Math.round(horiz ? h * 0.3 : w * 0.19));
  const zonaW = horiz && q.w ? w - q.w - m * 1.2 : w;
  const cx = zonaW / 2;
  const ancho = zonaW - m * 2;
  const ctaFs = Math.round(Math.max(21, 31 * u));
  let s = `<defs><linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P}"/><stop offset="1" stop-color="${S}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#fondo)"/>`;
  s += `<circle cx="${redondear(w * 0.92)}" cy="${redondear(h * 0.08)}" r="${redondear(Math.min(w, h) * 0.34)}" fill="#ffffff" fill-opacity="0.07"/><circle cx="${redondear(w * 0.04)}" cy="${redondear(h * 0.96)}" r="${redondear(Math.min(w, h) * 0.26)}" fill="#ffffff" fill-opacity="0.06"/>`;
  s += cabecera(c, cx, m * 0.95, Math.round(Math.max(40, 64 * u)), '#ffffff', '#ffffff', P, 'middle');

  const arriba = m * 0.95 + Math.max(40, 64 * u) / 2 + m * 0.7;
  const pieY = h - m * 0.42;
  const baseCta = horiz
    ? h - m * 0.45 - Math.max(13, 19 * u) * 2.1 - ctaFs * 2.3
    : (q.w ? h - m * 1.05 - q.h - m * 0.45 : h - m * 0.45 - Math.max(13, 19 * u) * 2.1) - ctaFs * 2.3;
  const limite = baseCta - m * 0.35;
  const alto = limite - arriba;
  const k = etiqueta(c, p.kicker, cx, arriba, mezclar(P, '#ffffff', 0.75), 'middle');
  const tit = ajustar(p.titulo, { ancho, alto: (alto - k.alto) * 0.52, max: 96 * u, min: 32 * u, factor: 0.55 * c.fx, interl: 1.12, maxLineas: 5 });
  const cuerpo = ajustar(p.cuerpo, { ancho: ancho * 0.94, alto: alto - k.alto - tit.alto - m * 0.3, max: 40 * u, min: 17 * u, factor: 0.48 * c.fx });
  const sobrante = alto - (k.alto + tit.alto + m * 0.3 + cuerpo.alto);
  const dy = !horiz && sobrante > 0 ? sobrante * 0.45 : 0;
  s += k.svg.replace(/ y="([\d.]+)"/, (_, y) => ` y="${redondear(Number(y) + dy)}"`);
  s += lineasSvg(c, tit.lineas, cx, arriba + dy + k.alto, tit.fs, { interl: 1.12, fill: '#ffffff', peso: 800, anchor: 'middle' });
  s += lineasSvg(c, cuerpo.lineas, cx, arriba + dy + k.alto + tit.alto + m * 0.3, cuerpo.fs, { fill: '#e6f4f1', anchor: 'middle' });
  if (p.cta) s += pildora(c, cx, baseCta, p.cta, ctaFs, '#ffffff', P, 'middle').svg;
  if (q.w) s += q.dibujar(horiz ? w - m - q.w : cx - q.w / 2, horiz ? (h - q.h) / 2 : h - m * 1.05 - q.h);
  s += lineaPie(c, cx, pieY, '#d3ece7', 'middle');
  return s;
}

function disenoDividido(c) {
  const { w, h, u, m, P, p, horiz } = c;
  const q = bloqueQr(c, Math.round(horiz ? h * 0.25 : w * 0.18));
  const ctaFs = Math.round(Math.max(21, 30 * u));
  const sobre = textoSobre(P);
  const pieFs = Math.max(13, 19 * u);
  const pieY = h - m * 0.42;
  const ctaTop = h - m * 0.45 - pieFs * 2.1 - ctaFs * 2.3;
  let s = `<rect width="${w}" height="${h}" fill="#f6fbfa"/>`;
  let zona;
  let qDerecha = q;
  if (horiz) {
    // En horizontal el QR va sobre el bloque de color, abajo a la izquierda.
    const cut = Math.round(w * 0.52);
    s += `<rect width="${cut}" height="${h}" fill="${P}"/><circle cx="${cut}" cy="${redondear(h * 0.5)}" r="${redondear(h * 0.12)}" fill="#f6fbfa"/>`;
    s += cabecera(c, m, m * 0.95, Math.round(48 * u), sobre, '#ffffff', P);
    const arriba = m * 1.9;
    const reservaQr = q.w ? q.h + m * 0.35 : 0;
    const alto = h - arriba - m * 0.5 - reservaQr;
    const k = etiqueta(c, p.kicker, m, arriba, mezclar(P, '#ffffff', 0.72));
    const tit = ajustar(p.titulo, { ancho: cut - m * 1.8, alto: alto - k.alto, max: 80 * u, min: 24 * u, factor: 0.55 * c.fx, interl: 1.12, maxLineas: 5 });
    s += k.svg + lineasSvg(c, tit.lineas, m, arriba + k.alto, tit.fs, { interl: 1.12, fill: sobre, peso: 800 });
    if (q.w) s += q.dibujar(m, h - m * 0.5 - q.h);
    qDerecha = { w: 0, h: 0, dibujar: () => '' };
    zona = { x: cut + m * 0.9, ancho: w - cut - m * 1.8, arriba: m * 1.2 };
  } else {
    const cut = Math.round(h * 0.5);
    s += `<rect width="${w}" height="${cut}" fill="${P}"/><circle cx="${redondear(w * 0.9)}" cy="${cut}" r="${redondear(w * 0.07)}" fill="#f6fbfa"/>`;
    s += cabecera(c, m, m * 0.95, Math.round(56 * u), sobre, '#ffffff', P);
    const arriba = m * 1.95;
    const alto = cut - arriba - m * 0.6;
    const k = etiqueta(c, p.kicker, m, arriba, mezclar(P, '#ffffff', 0.72));
    const tit = ajustar(p.titulo, { ancho: w - m * 2, alto: alto - k.alto, max: 94 * u, min: 32 * u, factor: 0.55 * c.fx, interl: 1.12, maxLineas: 5 });
    s += k.svg + lineasSvg(c, tit.lineas, m, arriba + k.alto, tit.fs, { interl: 1.12, fill: sobre, peso: 800 });
    zona = { x: m, ancho: w - m * 2, arriba: cut + m * 0.8 };
  }
  const qY = h - m * 0.5 - qDerecha.h;
  const limite = Math.min(ctaTop, qDerecha.w ? qY : ctaTop) - m * 0.3;
  const cuerpo = ajustar(p.cuerpo, { ancho: zona.ancho, alto: limite - zona.arriba, max: 36 * u, min: 16 * u, factor: 0.48 * c.fx, maxLineas: 8 });
  s += lineasSvg(c, cuerpo.lineas, zona.x, zona.arriba, cuerpo.fs, { fill: '#2b4a46' });
  if (p.cta) s += pildora(c, zona.x, ctaTop, p.cta, ctaFs, P, sobre).svg;
  s += lineaPie(c, zona.x, pieY, '#5b7774');
  if (qDerecha.w) s += qDerecha.dibujar(w - m - qDerecha.w, qY);
  return s;
}

function disenoTarjeta(c) {
  const { w, h, u, m, P, S, p, horiz } = c;
  const q = bloqueQr(c, Math.round(horiz ? h * 0.3 : w * 0.18));
  const inset = Math.round(m * 0.55);
  const cw = w - inset * 2;
  const ch = h - inset * 2;
  const ix = inset + m * 0.85;
  const ctaFs = Math.round(Math.max(21, 30 * u));
  let s = `<defs><linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P}"/><stop offset="1" stop-color="${S}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#fondo)"/>`;
  s += `<rect x="${inset}" y="${inset}" width="${cw}" height="${ch}" rx="${redondear(m * 0.4)}" fill="#ffffff"/>`;
  const cab = Math.round(Math.max(36, 54 * u));
  s += cabecera(c, ix, inset + m * 0.9, cab, S, P, textoSobre(P));
  const arriba = inset + m * 0.9 + cab / 2 + m * 0.6;
  const pieY = h - inset - m * 0.38;
  const ctaTop = pieY - Math.max(13, 19 * u) * 2.1 - ctaFs * 2.3;
  const qY = horiz ? (arriba + ctaTop) / 2 - q.h / 2 + m * 0.2 : h - inset - m * 0.45 - q.h;
  const ancho = horiz ? cw - m * 1.7 - (q.w ? q.w + m * 0.6 : 0) : cw - m * 1.7;
  const limite = (horiz ? ctaTop : Math.min(ctaTop, q.w ? qY : ctaTop)) - m * 0.35;
  const alto = limite - arriba;
  const k = etiqueta(c, p.kicker, ix, arriba, P);
  const tit = ajustar(p.titulo, { ancho, alto: (alto - k.alto) * 0.52, max: 84 * u, min: 28 * u, factor: 0.55 * c.fx, interl: 1.12, maxLineas: 4 });
  const cuerpo = ajustar(p.cuerpo, { ancho, alto: alto - k.alto - tit.alto - m * 0.25, max: 36 * u, min: 16 * u, factor: 0.48 * c.fx });
  s += k.svg + lineasSvg(c, tit.lineas, ix, arriba + k.alto, tit.fs, { interl: 1.12, fill: S, peso: 800 });
  s += lineasSvg(c, cuerpo.lineas, ix, arriba + k.alto + tit.alto + m * 0.25, cuerpo.fs, { fill: '#2b4a46' });
  if (p.cta) s += pildora(c, ix, ctaTop, p.cta, ctaFs, P, textoSobre(P)).svg;
  s += lineaPie(c, ix, pieY, '#5b7774');
  if (q.w) s += q.dibujar(w - inset - m * 0.7 - q.w, qY);
  return s;
}

function disenoPasos(c) {
  const { w, h, u, m, P, S, p, horiz } = c;
  const sobre = textoSobre(P);
  const q = bloqueQr(c, Math.round(horiz ? h * 0.28 : w * 0.17));
  const ctaFs = Math.round(Math.max(20, 29 * u));
  const cab = horiz ? Math.round(h * 0.4) : Math.round(h * 0.28);
  let s = `<rect width="${w}" height="${h}" fill="${mezclar(P, '#ffffff', 0.93)}"/><rect width="${w}" height="${cab}" fill="${P}"/>`;
  s += cabecera(c, m, m * 0.85, Math.round(Math.max(34, 48 * u)), sobre, '#ffffff', P);
  const arribaT = horiz ? m * 1.45 : m * 1.55;
  const k = etiqueta(c, p.kicker, m, arribaT, mezclar(P, '#ffffff', 0.72));
  const tit = ajustar(p.titulo, { ancho: w - m * 2, alto: cab - arribaT - k.alto - m * 0.35, max: 78 * u, min: 26 * u, factor: 0.55 * c.fx, interl: 1.1, maxLineas: 3 });
  s += k.svg + lineasSvg(c, tit.lineas, m, arribaT + k.alto, tit.fs, { interl: 1.1, fill: sobre, peso: 800 });

  const pieY = h - m * 0.42;
  const ctaTop = pieY - Math.max(13, 19 * u) * 2.1 - ctaFs * 2.3;
  const qY = h - m * 0.55 - q.h;
  const limite = (horiz ? ctaTop : Math.min(ctaTop, q.w ? qY : ctaTop)) - m * 0.35;
  const pasos = pasosDe(p.cuerpo, horiz ? 3 : 4);
  const zonaAlto = limite - (cab + m * 0.55);
  const fila = zonaAlto / Math.max(pasos.length, 1);
  const ancho = w - m * 2 - Math.min(fila * 0.8, 80 * u) - m * 0.4 - (horiz && q.w ? q.w + m * 0.5 : 0);
  const radio = Math.min(fila * 0.28, 34 * u);
  pasos.forEach((texto, i) => {
    const cy = cab + m * 0.55 + fila * i + fila / 2;
    const ajuste = ajustar(texto, { ancho, alto: fila * 0.92, max: 34 * u, min: 15 * u, factor: 0.48 * c.fx, interl: 1.18, maxLineas: 3 });
    s += `<circle cx="${redondear(m + radio)}" cy="${redondear(cy)}" r="${redondear(radio)}" fill="${S}"/><text x="${redondear(m + radio)}" y="${redondear(cy + radio * 0.36)}" font-family="${c.fam}" font-size="${redondear(radio * 1.05)}" font-weight="800" fill="${textoSobre(S)}" text-anchor="middle">${i + 1}</text>`;
    s += lineasSvg(c, ajuste.lineas, m + radio * 2 + m * 0.4, cy - ajuste.alto / 2, ajuste.fs, { interl: 1.18, fill: '#1f3a37' });
  });
  if (p.cta) s += pildora(c, m, ctaTop, p.cta, ctaFs, P, sobre).svg;
  s += lineaPie(c, m, pieY, '#5b7774');
  if (q.w) s += q.dibujar(w - m - q.w, horiz ? (cab + h) / 2 - q.h / 2 : qY);
  return s;
}

const DISENOS_SVG = {
  banda: disenoBanda,
  centrado: disenoCentrado,
  dividido: disenoDividido,
  tarjeta: disenoTarjeta,
  pasos: disenoPasos,
  marco: disenoTarjeta,
  diagonal: disenoDividido,
  lateral: disenoDividido
};

/* ------------------------------- API pública ------------------------------- */

export function dimensiones(formato, opciones = {}) {
  if (formato === 'personalizado') {
    const w = Math.max(320, Math.min(Number(opciones.ancho) || 1080, 4096));
    const h = Math.max(320, Math.min(Number(opciones.alto) || 1080, 4096));
    return { w, h, nombre: 'Tamaño personalizado', detalle: `${w} × ${h} px` };
  }
  const f = FORMATOS[formato] || FORMATOS.cuadrado;
  return { w: f.w, h: f.h, nombre: f.nombre, detalle: f.detalle };
}

/**
 * Dibuja la pieza.
 * @param {object} p titulo, cuerpo, cta, kicker, pie, enlace, colorPrimario,
 *   colorSecundario, formato, diseno, fuente, mostrarQr, qrUrl, qrMarcador.
 */
export function construirSvg(p = {}) {
  const f = dimensiones(p.formato, p);
  const fu = FUENTES[p.fuente] || FUENTES.sans;
  const c = {
    p,
    w: f.w,
    h: f.h,
    u: Math.min(f.w / 1080, f.h / 540),
    horiz: f.w / f.h > 1.3,
    P: colorValido(p.colorPrimario, '#006657'),
    S: colorValido(p.colorSecundario, '#0f3d3a'),
    fam: fu.familia,
    fx: fu.ancho,
    pie: String(p.pie || '').trim() || dominio(p.enlace) || NOMBRE_SISTEMA
  };
  c.m = Math.max(40, Math.round(72 * c.u));
  const dibujar = DISENOS_SVG[p.diseno] || disenoBanda;
  const fondo = p.imagenUrl
    ? `<image x="0" y="0" width="${f.w}" height="${f.h}" href="${esc(p.imagenUrl)}" xlink:href="${esc(p.imagenUrl)}" preserveAspectRatio="xMidYMid slice" opacity="0.38"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${f.w}" height="${f.h}" viewBox="0 0 ${f.w} ${f.h}">${fondo}${dibujar(c)}</svg>`;
}

export function svgADataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasteriza el SVG a PNG con las medidas exactas del formato. */
export function svgAPng(svg, ancho, alto) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => {
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);
      lienzo.toBlob(
        (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo crear el PNG'))),
        'image/png'
      );
    };
    imagen.onerror = () => rechazar(new Error('No se pudo dibujar la pieza'));
    imagen.src = svgADataUri(svg);
  });
}

export function descargarBlob(blob, nombre) {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1500);
}

export function nombreArchivo(p, extension) {
  const base = String(p.titulo || 'publicacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 50);
  const f = dimensiones(p.formato, p);
  return `${base || 'publicacion'}-${f.w}x${f.h}.${extension}`;
}

/* ---------------------------------- Canva ---------------------------------- */

export const COLUMNAS_CANVA = ['red', 'kicker', 'titulo', 'texto', 'cta', 'hashtags', 'enlace', 'municipio'];

export function csvCanva(filas) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const cuerpo = [COLUMNAS_CANVA.map(celda).join(',')]
    .concat(filas.map((f) => COLUMNAS_CANVA.map((col) => celda(f[col])).join(',')))
    .join('\r\n');
  return new Blob([`\ufeff${cuerpo}\r\n`], { type: 'text/csv;charset=utf-8' });
}

export function textoKitMarca(p) {
  const P = colorValido(p.colorPrimario, '#006657');
  const S = colorValido(p.colorSecundario, '#0f3d3a');
  const f = dimensiones(p.formato);
  const fu = FUENTES[p.fuente] || FUENTES.sans;
  return [
    `Kit de marca — ${NOMBRE_SISTEMA}`,
    '',
    `Color principal: ${P.toUpperCase()}`,
    `Color secundario: ${S.toUpperCase()}`,
    `Fondo suave: ${mezclar(P, '#ffffff', 0.93).toUpperCase()}`,
    `Acento claro: ${mezclar(P, '#ffffff', 0.72).toUpperCase()}`,
    `Texto: #2B4A46`,
    '',
    `Tipografías sugeridas en Canva: ${fu.canva}`,
    `Tamaño del lienzo: ${f.w} × ${f.h} px (${f.nombre})`
  ].join('\n');
}

/* --------------------------------- correo ---------------------------------- */

function parrafos(texto) {
  return String(texto || '')
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * HTML del cuerpo del correo con tablas y estilos en línea. El servidor añade
 * la cabecera del sistema, el aviso de privacidad y el enlace de baja.
 * Los estilos se escriben como `data-e` y se serializan como estilos en línea
 * por CSSOM, así el código fuente no contiene atributos de estilo literales.
 */
export function construirCorreo(d = {}) {
  const c1 = colorValido(d.color, '#006657');
  const c2 = colorValido(d.color2, '#0f3d3a');
  const sobre = textoSobre(c1);
  const fam = "'Segoe UI',Helvetica,Arial,sans-serif";
  const puntos = String(d.puntos || '')
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  const enlace = String(d.enlace || '').trim();

  let bloque = '';
  if (d.estilo === 'pasos') {
    bloque = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-e="margin:8px 0 6px">${puntos
      .map(
        (t, i) =>
          `<tr><td width="48" valign="top" data-e="padding:7px 0"><div data-e="width:34px;height:34px;line-height:34px;border-radius:17px;background:${c1};color:${sobre};text-align:center;font-weight:700;font-size:16px">${i + 1}</div></td><td valign="top" data-e="padding:8px 0 10px;font-size:16px;line-height:1.5;color:#2b4a46">${esc(t)}</td></tr>`
      )
      .join('')}</table>`;
  } else if (d.estilo === 'tarjetas') {
    const trio = puntos.slice(0, 3);
    const ancho = Math.floor(100 / Math.max(trio.length, 1));
    bloque = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-e="margin:10px 0 6px;border-collapse:separate;border-spacing:8px 0"><tr>${trio
      .map((t) => {
        const [titulo, ...resto] = t.split(':');
        const detalle = resto.join(':').trim();
        return `<td width="${ancho}%" valign="top" data-e="background:#f1f8f6;border:1px solid #d5e8e4;border-top:4px solid ${c1};border-radius:8px;padding:14px 12px"><div data-e="font-size:15px;font-weight:700;color:${c2};line-height:1.35">${esc(detalle ? titulo : t)}</div>${
          detalle ? `<div data-e="font-size:14px;color:#2b4a46;line-height:1.45;margin-top:6px">${esc(detalle)}</div>` : ''
        }</td>`;
      })
      .join('')}</tr></table>`;
  } else {
    bloque = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-e="margin:8px 0 6px">${puntos
      .map(
        (t) =>
          `<tr><td width="30" valign="top" data-e="padding:6px 0;font-size:17px;font-weight:700;color:${c1}">&#10003;</td><td valign="top" data-e="padding:7px 0;font-size:16px;line-height:1.5;color:#2b4a46">${esc(t)}</td></tr>`
      )
      .join('')}</table>`;
  }

  const boton = d.boton && enlace
    ? `<table role="presentation" cellpadding="0" cellspacing="0" data-e="margin:22px 0 8px"><tr><td data-e="background:${c1};border-radius:999px"><a href="${esc(enlace)}" target="_blank" data-e="display:inline-block;padding:14px 30px;font-size:16px;font-weight:700;color:${sobre};text-decoration:none;font-family:${fam}">${esc(d.boton)}</a></td></tr></table>`
    : '';

  const cuerpo = `<div data-e="max-width:600px;margin:0 auto;font-family:${fam};color:#173f3b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-e="border-collapse:collapse"><tr><td data-e="background:${c1};padding:30px 32px;border-radius:12px 12px 0 0"><div data-e="font-size:12px;font-weight:700;letter-spacing:1.5px;color:${sobre};opacity:0.8;text-transform:uppercase">${esc(NOMBRE_SISTEMA)}</div><h1 data-e="margin:10px 0 0;font-size:27px;line-height:1.2;color:${sobre};font-family:${fam}">${esc(d.titular || 'Titular del correo')}</h1></td></tr><tr><td data-e="background:#ffffff;padding:26px 32px 28px;border:1px solid #d5e8e4;border-top:0;border-radius:0 0 12px 12px">${parrafos(d.intro)
    .map((t) => `<p data-e="margin:0 0 14px;font-size:16px;line-height:1.6;color:#2b4a46">${esc(t).replace(/\n/g, '<br>')}</p>`)
    .join('')}${bloque}${boton}<p data-e="margin:20px 0 0;font-size:14px;color:#5b7774">Equipo del ${esc(NOMBRE_SISTEMA)}</p></td></tr></table></div>`;

  return estilosAEnLinea(cuerpo);
}

export function correoATexto(d = {}) {
  const puntos = String(d.puntos || '')
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const lista = puntos.map((t, i) => (d.estilo === 'pasos' ? `${i + 1}. ${t}` : `- ${t}`));
  return [
    d.titular || '',
    '',
    ...parrafos(d.intro).flatMap((t) => [t, '']),
    ...lista,
    '',
    d.boton && d.enlace ? `${d.boton}: ${d.enlace}` : '',
    '',
    `Equipo del ${NOMBRE_SISTEMA}`
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convierte `data-e` en estilos en línea reales (para el HTML que viaja por correo). */
export function estilosAEnLinea(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll('[data-e]').forEach((el) => {
    el.style.cssText = el.getAttribute('data-e');
    el.removeAttribute('data-e');
  });
  return doc.body.innerHTML;
}

/* ------------------------- vista previa compatible con CSP ------------------ */

const BLOQUEADAS = 'script,style,iframe,object,embed,form,link,meta,base,svg,math,video,audio';

/**
 * Limpia el HTML del correo para mostrarlo en pantalla: sin scripts ni
 * manejadores, con los estilos movidos a `data-e` y las imágenes remotas
 * sustituidas por un marcador (la CSP solo permite imágenes locales).
 */
export function prepararVistaHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  doc.body.querySelectorAll(BLOQUEADAS).forEach((n) => n.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const atributo of [...el.attributes]) {
      const nombre = atributo.name.toLowerCase();
      if (nombre.startsWith('on')) {
        el.removeAttribute(atributo.name);
      } else if (nombre === 'style') {
        el.setAttribute('data-e', atributo.value);
        el.removeAttribute('style');
      } else if ((nombre === 'href' || nombre === 'src') && /^\s*(javascript|vbscript|data:(?!image\/))/i.test(atributo.value)) {
        el.removeAttribute(atributo.name);
      }
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (el.tagName === 'IMG' && /^\s*https?:/i.test(el.getAttribute('src') || '')) {
      const marcador = doc.createElement('span');
      marcador.className = 'camp-imagen-remota';
      marcador.textContent = `Imagen: ${el.getAttribute('alt') || 'se verá en el correo'}`;
      el.replaceWith(marcador);
    }
  });
  return doc.body.innerHTML;
}

/** Aplica por CSSOM los estilos guardados en `data-e` (permitido por la CSP). */
export function aplicarEstilosData(raiz) {
  raiz?.querySelectorAll('[data-e]').forEach((el) => {
    el.style.cssText = el.getAttribute('data-e');
  });
}

/** Texto plano a partir de HTML (para la versión alternativa del correo). */
export function htmlATexto(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  doc.body.querySelectorAll('script,style').forEach((n) => n.remove());
  doc.body.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href && /^https?:/i.test(href)) a.append(` (${href})`);
  });
  doc.body.querySelectorAll('p,h1,h2,h3,h4,li,tr,div').forEach((n) => n.append('\n'));
  return (doc.body.textContent || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
