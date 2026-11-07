/**
 * graficos-svg.js — Gráficas SVG para el informe imprimible (HTML + Paged.js).
 *
 * Devuelven una cadena <svg> lista para `figure.innerHTML = …`. Reglas de diseño:
 *   · Solo atributos SVG y clases CSS (definidas en impresion-informe.css): sin
 *     atributos de estilo ni bloques incrustados, así respetan la CSP.
 *   · Texto con etiqueta directa (sin leyendas lejanas) y tamaño ≥ 8 pt al imprimir.
 *   · Vectoriales: no se pixelan al imprimir ni al exportar a PDF.
 *   · Todo texto de usuario se escapa; las etiquetas largas se recortan y llevan <title>.
 *
 * Ejemplo:
 *   import { graficoBarrasSvg } from './graficos-svg.js';
 *   figura.innerHTML = graficoBarrasSvg(datos.porTipo.map((t) => ({ etiqueta: t.nombre, valor: t.total })));
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const r = (n) => Math.round(n * 100) / 100;
const entero = (n) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Number(n) || 0);

/** Recorta con "…" según un ancho aproximado en píxeles (≈ 5.8 px por carácter a 11 px). */
function recortar(texto, ancho) {
  const max = Math.max(4, Math.floor(ancho / 5.8));
  const t = String(texto ?? '');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Tope redondo del eje: 23 → 24, 170 → 200. La mitad siempre es entera. */
function maximoLimpio(v) {
  if (v <= 4) return 4;
  if (v <= 6) return 6;
  if (v <= 8) return 8;
  if (v <= 10) return 10;
  const e = 10 ** Math.floor(Math.log10(v));
  const m = v / e;
  return ([1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((c) => m <= c) || 10) * e;
}

/** "2026-10" → "oct 26" (en UTC, sin corrimientos de zona horaria). */
function etiquetaMes(clave) {
  const m = /^(\d{4})-(\d{2})/.exec(String(clave));
  if (!m) return String(clave);
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'short', year: '2-digit' })
    .format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)))
    .replace('.', '');
}

/**
 * Anchos por defecto: 318 px (≈ 8 cm) cabe en media hoja A4 con márgenes de 15–16 mm sin reducirse,
 * así el texto conserva su tamaño de 8 pt. Si tus márgenes son mayores, pasa un `ancho` menor.
 *
 * Barras horizontales. La mayor lleva el color pleno y el resto el tono suave: el ojo
 * va primero al dato principal. items: [{ etiqueta, valor }]
 */
export function graficoBarrasSvg(items, { ancho = 318, maximo = 8, descripcion = 'Incidencias por tipo' } = {}) {
  let lista = (items || []).filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (!lista.length) return '';
  if (lista.length > maximo) {
    const resto = lista.slice(maximo - 1);
    lista = [...lista.slice(0, maximo - 1), { etiqueta: `Otros (${resto.length})`, valor: resto.reduce((s, i) => s + i.valor, 0) }];
  }
  const paso = 23;
  const wEtiqueta = Math.min(130, Math.round(ancho * 0.4));
  const x0 = wEtiqueta + 8;
  const wMax = ancho - x0 - 34;
  const mayor = Math.max(...lista.map((i) => i.valor));
  const alto = lista.length * paso + 4;
  const filas = lista
    .map((it, i) => {
      const y = i * paso + 2;
      const w = Math.max(3, (it.valor / mayor) * wMax);
      return (
        `<g><title>${esc(it.etiqueta)}: ${entero(it.valor)}</title>` +
        `<text class="grafico-texto" x="0" y="${r(y + 14)}">${esc(recortar(it.etiqueta, wEtiqueta))}</text>` +
        `<rect class="${i === 0 ? 'serie-1' : 'serie-1-suave'}" x="${x0}" y="${r(y + 3)}" width="${r(w)}" height="13" rx="2.5"/>` +
        `<text class="grafico-texto grafico-texto-fuerte" x="${r(x0 + w + 6)}" y="${r(y + 14)}">${entero(it.valor)}</text></g>`
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(descripcion)}" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${filas}</svg>`;
}

/**
 * Dona con total al centro y leyenda de dos líneas (nombre y «cantidad · porcentaje»).
 * items: [{ etiqueta, valor, clase }] — `clase` puede ser 'estado-resuelta', 'estado-en_proceso',
 * 'estado-reportada' o 'serie-1'…'serie-6'; si falta, se usa la serie por orden.
 */
export function graficoDonaSvg(items, { ancho = 318, descripcion = 'Distribución por estado', centro = 'incidencias' } = {}) {
  const lista = (items || []).filter((i) => i.valor > 0);
  const suma = lista.reduce((s, i) => s + i.valor, 0);
  if (!suma) return '';
  const rad = 62;
  const radInt = 40;
  const cx = rad + 4;
  const cy = rad + 4;
  const alto = Math.max(rad * 2 + 8, lista.length * 36 + 8);
  let ang = -Math.PI / 2;
  const rebanadas = lista
    .map((it, i) => {
      const clase = it.clase || `serie-${(i % 6) + 1}`;
      const frac = it.valor / suma;
      const fin = ang + frac * Math.PI * 2;
      let figura;
      if (frac > 0.9999) figura = `<circle class="${clase} grafico-corte" cx="${cx}" cy="${cy}" r="${rad}"/>`;
      else {
        const [x1, y1] = [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
        const [x2, y2] = [cx + rad * Math.cos(fin), cy + rad * Math.sin(fin)];
        figura = `<path class="${clase} grafico-corte" d="M${r(cx)} ${r(cy)} L${r(x1)} ${r(y1)} A${rad} ${rad} 0 ${frac > 0.5 ? 1 : 0} 1 ${r(x2)} ${r(y2)} Z"/>`;
      }
      ang = fin;
      return figura;
    })
    .join('');
  const xLey = rad * 2 + 28;
  const y0 = Math.max(4, (rad * 2 + 8 - lista.length * 36) / 2);
  const leyenda = lista
    .map((it, i) => {
      const clase = it.clase || `serie-${(i % 6) + 1}`;
      const y = y0 + i * 36;
      return (
        `<g><rect class="${clase}" x="${xLey}" y="${r(y + 3)}" width="10" height="10" rx="2.5"/>` +
        `<text class="grafico-texto grafico-texto-fuerte" x="${xLey + 17}" y="${r(y + 12)}">${esc(recortar(it.etiqueta, ancho - xLey - 17))}</text>` +
        `<text class="grafico-texto-suave" x="${xLey + 17}" y="${r(y + 27)}">${entero(it.valor)} · ${Math.round((it.valor / suma) * 100)} %</text></g>`
      );
    })
    .join('');
  const total =
    `<circle class="grafico-hueco" cx="${cx}" cy="${cy}" r="${radInt}"/>` +
    `<text class="grafico-total" x="${cx}" y="${cy + 4}" text-anchor="middle">${entero(suma)}</text>` +
    `<text class="grafico-texto-suave" x="${cx}" y="${cy + 19}" text-anchor="middle">${esc(centro)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(descripcion)}" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${rebanadas}${total}${leyenda}</svg>`;
}

/**
 * Tendencia mensual: área + línea, valor sobre cada punto (hasta 14) y eje con tope redondo.
 * puntos: [{ mes: '2026-10', total: 23 }]  (también acepta { etiqueta, valor })
 */
export function graficoSerieSvg(puntos, { ancho = 660, alto = 190, descripcion = 'Tendencia mensual de incidencias' } = {}) {
  const lista = (puntos || []).map((p) => ({ etiqueta: p.etiqueta ?? etiquetaMes(p.mes), valor: Number(p.valor ?? p.total) || 0 }));
  if (!lista.length) return '';
  const wEje = 34;
  const gx = wEje;
  const gw = ancho - wEje - 14;
  const gy = 18;
  const gh = alto - gy - 24;
  const tope = maximoLimpio(Math.max(...lista.map((p) => p.valor)));
  const n = lista.length;
  const px = (i) => (n === 1 ? gx + gw / 2 : gx + (gw * i) / (n - 1));
  const py = (v) => gy + gh - (v / tope) * gh;
  const rejilla = [0, 1, 2]
    .map((i) => {
      const y = gy + gh - (gh * i) / 2;
      return `<line class="grafico-linea" x1="${gx}" x2="${gx + gw}" y1="${r(y)}" y2="${r(y)}"/><text class="grafico-texto-suave" x="${wEje - 6}" y="${r(y + 3.5)}" text-anchor="end">${entero((tope * i) / 2)}</text>`;
    })
    .join('');
  const trazo = lista.map((p, i) => `${i ? 'L' : 'M'}${r(px(i))} ${r(py(p.valor))}`).join(' ');
  const forma =
    n > 1
      ? `<path class="grafico-area" d="${trazo} L${r(px(n - 1))} ${r(gy + gh)} L${r(px(0))} ${r(gy + gh)} Z"/><path class="grafico-trazo" d="${trazo}"/>`
      : '';
  const paso = Math.ceil(n / 8);
  const marcas = lista
    .map((p, i) => {
      const etiquetaX = i % paso === 0 || i === n - 1 ? `<text class="grafico-texto-suave" x="${r(px(i))}" y="${gy + gh + 16}" text-anchor="middle">${esc(p.etiqueta)}</text>` : '';
      const valor = n <= 14 ? `<text class="grafico-texto grafico-texto-fuerte" x="${r(px(i))}" y="${r(py(p.valor) - 9)}" text-anchor="middle">${entero(p.valor)}</text>` : '';
      return `<g><title>${esc(p.etiqueta)}: ${entero(p.valor)}</title><circle class="grafico-punto" cx="${r(px(i))}" cy="${r(py(p.valor))}" r="3.2"/>${valor}${etiquetaX}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(descripcion)}" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${rejilla}${forma}${marcas}</svg>`;
}
