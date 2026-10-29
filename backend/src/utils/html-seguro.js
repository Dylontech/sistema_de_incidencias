/**
 * Sanitizador de HTML para el editor legal.
 *
 * Allowlist deliberadamente pequeña: títulos, párrafos, listas, énfasis,
 * enlaces y saltos. Se eliminan scripts, estilos, iframes, formularios,
 * atributos `on*`, `style`, `class` e `id`. No pretende ser un sanitizador
 * general: el contenido solo lo escribe el administrador maestro.
 */
const ETIQUETAS = new Set([
  'h2',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'u',
  'br',
  'blockquote',
  'a'
]);

const PELIGROSOS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<style\b[^>]*>[\s\S]*?<\/style>/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object\b[^>]*>[\s\S]*?<\/object>/gi,
  /<embed\b[^>]*>[\s\S]*?<\/embed>/gi,
  /<form\b[^>]*>[\s\S]*?<\/form>/gi,
  /<link\b[^>]*>/gi,
  /<meta\b[^>]*>/gi
];

const ALIAS = { b: 'strong', i: 'em' };

function atributosSeguros(nombre, atributos) {
  if (nombre !== 'a') return '';
  const coincidencia = atributos.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = (coincidencia?.[2] ?? coincidencia?.[3] ?? coincidencia?.[4] ?? '').trim();
  if (!/^(https?:\/\/|mailto:|\/)/i.test(href)) return '';
  // Se escapan comillas para no romper el atributo.
  const limpio = href.replace(/"/g, '&quot;').slice(0, 500);
  return ` href="${limpio}" rel="noopener noreferrer"`;
}

export function sanitizarHtml(html) {
  let texto = String(html ?? '');
  for (const patron of PELIGROSOS) texto = texto.replace(patron, '');

  return texto.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (original, etiqueta, atributos) => {
    const nombreOriginal = etiqueta.toLowerCase();
    const nombre = ALIAS[nombreOriginal] || nombreOriginal;
    if (!ETIQUETAS.has(nombre)) return '';
    const cierre = original.startsWith('</');
    if (cierre) return `</${nombre}>`;
    if (nombre === 'br') return '<br>';
    return `<${nombre}${atributosSeguros(nombre, atributos)}>`;
  });
}
