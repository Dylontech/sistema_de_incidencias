/**
 * SERVICIO: generador de publicaciones para redes sociales.
 *
 * No se conecta a APIs externas: arma el texto, los hashtags, el enlace y un
 * QR descargable para que el administrador los copie o comparta. Las piezas
 * quedan guardadas en `publicaciones_redes` para reutilizarlas o archivarlas.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { valor as valorConfig } from './configuracion.service.js';

export const REDES = [
  { clave: 'facebook', nombre: 'Facebook', limite: 2200, hashtags: 5, formato: 'Enlace + imagen' },
  { clave: 'instagram', nombre: 'Instagram', limite: 2200, hashtags: 10, formato: 'Imagen + pie de foto' },
  { clave: 'tiktok', nombre: 'TikTok', limite: 2200, hashtags: 8, formato: 'Guion corto' },
  { clave: 'whatsapp', nombre: 'WhatsApp', limite: 1000, hashtags: 3, formato: 'Mensaje + enlace' },
  { clave: 'x', nombre: 'X (Twitter)', limite: 280, hashtags: 3, formato: 'Texto corto + enlace' }
];

/** Estructuras editoriales que el generador propone al administrador. */
export const ESTRUCTURAS = [
  { clave: 'anuncio', nombre: 'Anuncio directo', descripcion: 'Gancho, desarrollo y llamado a la acción.' },
  { clave: 'paso_a_paso', nombre: 'Paso a paso', descripcion: 'Introducción breve y pasos numerados.' },
  { clave: 'dato_clave', nombre: 'Dato clave', descripcion: 'Abre con un dato y explica por qué importa.' },
  { clave: 'testimonio', nombre: 'Testimonio', descripcion: 'Voz de la comunidad y cierre con invitación.' }
];

export const PLANTILLAS = [
  {
    clave: 'reportar',
    nombre: 'Invitar a reportar',
    titulo: 'Reporta los problemas de tu municipio',
    texto:
      '¿Viste un bache, una luminaria apagada o un drenaje obstruido? Regístralo en el Sistema de Incidencias Municipales, sigue su estado y suma firmas para que se atienda.',
    cta: 'Reporta aquí',
    hashtags: '#Reporta #MiMunicipio #ParticipaciónCiudadana'
  },
  {
    clave: 'firmas',
    nombre: 'Recolectar firmas',
    titulo: 'Tu firma hace la diferencia',
    texto:
      'Apoya las causas de tu comunidad. Firma las incidencias que te importan y comparte la recolección con tus vecinos; al llegar a la meta se avisa a las autoridades.',
    cta: 'Firma y comparte',
    hashtags: '#Firmas #Comunidad #CambioLocal'
  },
  {
    clave: 'funcionarios',
    nombre: 'Contactar funcionarios',
    titulo: 'Habla directamente con tu municipio',
    texto:
      'Si tienes una cuenta, puedes escribirle al personal municipal desde el sistema, sin publicar tus datos personales. Si no hay funcionario asignado, la administración recibe tu solicitud.',
    cta: 'Abre el canal de contacto',
    hashtags: '#ContactoCiudadano #Transparencia #ServicioPúblico'
  },
  {
    clave: 'informes',
    nombre: 'Solicitar un informe',
    titulo: 'Datos abiertos para tu comunidad',
    texto:
      'Solicita un informe público por municipio, estado, tipo de incidencia y rango de fechas. Recibirás el PDF o CSV en el correo que registres.',
    cta: 'Solicita tu informe',
    hashtags: '#DatosAbiertos #RendiciónDeCuentas #InformaciónPública'
  },
  {
    clave: 'reconocimiento',
    nombre: 'Reconocer avances',
    titulo: 'Así avanza el mantenimiento',
    texto:
      'Comparte con la comunidad los reportes que ya fueron atendidos. La transparencia también se construye mostrando los avances.',
    cta: 'Mira los reportes resueltos',
    hashtags: '#Avances #Transparencia #TrabajoEnEquipo'
  }
];

const REDES_VALIDAS = new Set(REDES.map((r) => r.clave));
const PLANTILLAS_VALIDAS = new Set(PLANTILLAS.map((p) => p.clave));
const ESTRUCTURAS_VALIDAS = new Set(ESTRUCTURAS.map((e) => e.clave));
const COLOR_HEX = /^#[0-9a-f]{6}$/i;
const FORMATOS_VALIDOS = new Set([
  'cuadrado',
  'vertical',
  'historia',
  'horizontal',
  'portada',
  'cuatro-tercios',
  'tres-dos',
  'banner',
  'linkedin',
  'personalizado'
]);

function objetoJson(valor, { max = 20000 } = {}) {
  if (!valor) return null;
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  if (texto.length > max) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function codigoCorto() {
  return nuevoId().replace(/-/g, '').slice(0, 12);
}

function normalizarQrConfig(datos = {}, enlace = '') {
  const qr = objetoJson(datos, { max: 4000 }) || {};
  const contenido = String(qr.contenido || qr.enlace || '').trim();
  return {
    tipo: ['sistema', 'url', 'texto'].includes(qr.tipo) ? qr.tipo : 'sistema',
    contenido: contenido.slice(0, 1500),
    enlace: String(qr.enlace || '').slice(0, 1500),
    tamano: Math.max(60, Math.min(Number(qr.tamano) || 180, 600)),
    margen: Math.max(0, Math.min(Number(qr.margen) || 1, 8)),
    color: COLOR_HEX.test(String(qr.color || '')) ? String(qr.color).toLowerCase() : undefined,
    nivel: ['L', 'M', 'Q', 'H'].includes(qr.nivel) ? qr.nivel : 'M',
    etiqueta: String(qr.etiqueta || 'Escanea y participa').slice(0, 80),
    posicion: ['inferior-derecha', 'inferior-izquierda', 'superior-derecha', 'superior-izquierda', 'centro'].includes(qr.posicion)
      ? qr.posicion
      : 'inferior-derecha',
    enlaceSistema: enlace
  };
}

function contenidoQr(config, enlace) {
  if (config?.contenido) return config.contenido;
  if (config?.enlace) return config.enlace;
  return enlace;
}

function color(valor, porDefecto) {
  const limpio = String(valor || '').trim();
  return COLOR_HEX.test(limpio) ? limpio : porDefecto;
}

function texto(valor, campo, { requerido = false, max = 2000 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: 'Este campo es obligatorio' }
    ]);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: `No puede exceder ${max} caracteres` }
    ]);
  }
  return limpio;
}

function normalizarHashtags(valor, maximo) {
  const lista = String(valor ?? '')
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .filter((h, i, todos) => todos.indexOf(h) === i);
  return lista.slice(0, maximo).join(' ');
}

function escaparXml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** QR local con `qrcode` (si está instalado); si no, una tarjeta con el enlace. */
async function generarQr(textoQr, colorPrimario = '#006657') {
  try {
    const qrcode = await import('qrcode');
    const svg = await qrcode.toString(textoQr, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: colorPrimario, light: '#ffffff' }
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

function enlacesCompartir({ red, textoPublicacion, enlace }) {
  const t = encodeURIComponent(textoPublicacion);
  const u = encodeURIComponent(enlace);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    red
  };
}

/** Catálogo para la pestaña de publicidad. */
export function catalogo() {
  return { redes: REDES, plantillas: PLANTILLAS, estructuras: ESTRUCTURAS };
}

/** Arma el texto final respetando el límite de la red. */
function componerTexto({ titulo, cuerpo, cta, enlace, hashtags, estructura, limite }) {
  const bloques = [titulo, ''];
  if (estructura === 'paso_a_paso') {
    bloques.push('Pasos para participar:', '');
    const pasos = String(cuerpo)
      .split(/\n+/)
      .filter(Boolean)
      .map((linea, i) => `${i + 1}. ${linea}`)
      .join('\n');
    bloques.push(pasos, '');
  } else if (estructura === 'dato_clave') {
    bloques.push('Dato clave:', '', cuerpo, '');
  } else if (estructura === 'testimonio') {
    bloques.push('Lo que dice la comunidad:', '', cuerpo, '');
  } else {
    bloques.push(cuerpo, '');
  }
  if (estructura === 'testimonio') bloques.push('«La comunidad también puede participar.»', '');
  bloques.push(cta ? `👉 ${cta}` : '', enlace, '', hashtags);
  const bloque = bloques
    .filter((linea, i, todas) => linea !== '' || todas[i - 1] !== '')
    .join('\n')
    .trim();
  return bloque.length > limite ? `${bloque.slice(0, limite - 1)}…` : bloque;
}

/**
 * Base pública del enlace. Si la edición no envía una nueva, se prefiere la
 * configuración del servidor y se descarta cualquier query anterior para no
 * duplicar `?municipio=` al cambiar de municipio.
 */
async function baseDelEnlace(repositorio, datos = {}, actual = null) {
  return String(
    datos.enlace ||
      (await valorConfig(repositorio, 'general.url_base')) ||
      actual?.enlace ||
      'http://localhost:3000'
  )
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

async function componerPublicacion(repositorio, actor, datos = {}) {
  const redClave = REDES_VALIDAS.has(datos.red) ? datos.red : 'facebook';
  const red = REDES.find((r) => r.clave === redClave);
  const plantillaClave = PLANTILLAS_VALIDAS.has(datos.plantilla) ? datos.plantilla : 'reportar';
  const plantilla = PLANTILLAS.find((p) => p.clave === plantillaClave);

  const municipioId = datos.municipioId ? String(datos.municipioId) : null;
  const municipio = municipioId ? await repositorio.municipioPorId(municipioId) : null;
  if (municipioId && !municipio) throw AppError.solicitudInvalida('Municipio no encontrado');

  const titulo = texto(datos.titulo || plantilla.titulo, 'titulo', { requerido: true, max: 160 });
  const cuerpo = texto(datos.texto || plantilla.texto, 'texto', { requerido: true, max: 1800 });
  const cta = texto(datos.cta || plantilla.cta, 'cta', { max: 80 });
  const hashtags = normalizarHashtags(datos.hashtags || plantilla.hashtags, red.hashtags);
  const estructura = ESTRUCTURAS_VALIDAS.has(datos.estructura) ? datos.estructura : 'anuncio';
  const colorPrimario = color(datos.colorPrimario, '#006657');
  const colorSecundario = color(datos.colorSecundario, '#0f3d3a');

  const base = await baseDelEnlace(repositorio, datos);
  const enlace = `${base}/${municipio ? `?municipio=${encodeURIComponent(municipio.id)}` : ''}`;
  const formato = FORMATOS_VALIDOS.has(datos.formato) ? datos.formato : 'cuadrado';
  const ancho = formato === 'personalizado' && Number(datos.ancho) ? Math.max(320, Math.min(Number(datos.ancho), 4096)) : null;
  const alto = formato === 'personalizado' && Number(datos.alto) ? Math.max(320, Math.min(Number(datos.alto), 4096)) : null;
  const qrCodigo = String(datos.qrCodigo || codigoCorto()).slice(0, 64);
  const qrConfig = normalizarQrConfig(datos.qrConfig, enlace);
  qrConfig.codigo = qrCodigo;
  const qrContenido = contenidoQr(
    qrConfig,
    `${base}/?qr=${encodeURIComponent(qrCodigo)}${municipio ? `&municipio=${encodeURIComponent(municipio.id)}` : ''}`
  );
  const imagenUrl = String(datos.imagenUrl || '').startsWith('/uploads/') ? datos.imagenUrl : null;
  const layout = objetoJson(datos.layout, { max: 100000 });

  const recortado = componerTexto({
    titulo,
    cuerpo,
    cta,
    enlace,
    hashtags,
    estructura,
    limite: red.limite
  });

  const publicacion = {
    id: nuevoId(),
    red: red.clave,
    plantilla: plantilla.clave,
    municipioId: municipio?.id || null,
    titulo,
    texto: recortado,
    cuerpo,
    cta,
    estructura,
    colorPrimario,
    colorSecundario,
    hashtags,
    enlace,
    formato,
    ancho,
    alto,
    diseno: String(datos.diseno || 'banda').slice(0, 40),
    fuente: String(datos.fuente || 'sans').slice(0, 40),
    kicker: String(datos.kicker || '').slice(0, 160),
    pie: String(datos.pie || '').slice(0, 200),
    mostrarQr: datos.mostrarQr !== false,
    qrConfig,
    qrCodigo,
    layout,
    imagenUrl,
    miniaturaUrl: null,
    qrUrl: await generarQr(qrContenido, qrConfig.color || colorPrimario),
    estado: ['borrador', 'lista', 'archivada'].includes(datos.estado) ? datos.estado : 'lista',
    creadoPor: actor?.username || null,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    simulado: datos.simulado === true,
    simulacionId: datos.simulacionId || null
  };

  return {
    publicacion,
    texto: recortado,
    caracteres: recortado.length,
    limite: red.limite,
    compartir: enlacesCompartir({ red: red.clave, textoPublicacion: recortado, enlace })
  };
}

/** Vista previa completa sin persistir la publicación. */
export async function simular(repositorio, actor, datos = {}) {
  const resultado = await componerPublicacion(repositorio, actor, datos);
  return { ...resultado, simulada: true };
}

export async function generar(repositorio, actor, datos = {}) {
  const resultado = await componerPublicacion(repositorio, actor, datos);
  await repositorio.crearPublicacionRed(resultado.publicacion);
  const p = resultado.publicacion;
  if (p.qrCodigo) {
    await repositorio.crearCodigoQr({
      id: nuevoId(),
      codigo: p.qrCodigo,
      tipo: p.qrConfig?.tipo || 'sistema',
      contenido: p.qrConfig?.contenido || p.enlace,
      destino: p.enlace,
      publicacionId: p.id,
      activo: true,
      creadoPor: p.creadoPor,
      creadoEn: new Date().toISOString(),
      simulado: p.simulado,
      simulacionId: p.simulacionId
    });
  }
  return resultado;
}

export async function listar(repositorio, filtros = {}) {
  return repositorio.publicacionesRed(filtros);
}

export async function detalle(repositorio, id) {
  const publicacion = await repositorio.publicacionRedPorId(id);
  if (!publicacion) throw AppError.noEncontrado('Publicación no encontrada');
  return publicacion;
}

/** Edición de una publicación conservando su estructura editorial. */
export async function actualizar(repositorio, id, datos = {}) {
  const actual = await repositorio.publicacionRedPorId(id);
  if (!actual) throw AppError.noEncontrado('Publicación no encontrada');
  const redClave = REDES_VALIDAS.has(datos.red) ? datos.red : actual.red;
  const red = REDES.find((r) => r.clave === redClave);
  const plantillaClave = PLANTILLAS_VALIDAS.has(datos.plantilla)
    ? datos.plantilla
    : actual.plantilla || 'reportar';
  const municipioId =
    datos.municipioId === undefined
      ? actual.municipioId || null
      : datos.municipioId
        ? String(datos.municipioId)
        : null;
  const municipio = municipioId ? await repositorio.municipioPorId(municipioId) : null;
  if (municipioId && !municipio) throw AppError.solicitudInvalida('Municipio no encontrado');
  const titulo = texto(datos.titulo ?? actual.titulo, 'titulo', { requerido: true, max: 160 });
  const cuerpo = texto(datos.cuerpo ?? datos.texto ?? actual.cuerpo ?? actual.texto, 'texto', {
    requerido: true,
    max: 1800
  });
  const cta = texto(datos.cta ?? actual.cta ?? '', 'cta', { max: 80 });
  const hashtags = normalizarHashtags(datos.hashtags ?? actual.hashtags, red.hashtags);
  const estructura = ESTRUCTURAS_VALIDAS.has(datos.estructura)
    ? datos.estructura
    : actual.estructura || 'anuncio';
  const colorPrimario = color(datos.colorPrimario, actual.colorPrimario || '#006657');
  const colorSecundario = color(datos.colorSecundario, actual.colorSecundario || '#0f3d3a');
  const base = await baseDelEnlace(repositorio, datos, actual);
  const enlace = `${base}/${municipio ? `?municipio=${encodeURIComponent(municipio.id)}` : ''}`;
  const formato = FORMATOS_VALIDOS.has(datos.formato)
    ? datos.formato
    : actual.formato || 'cuadrado';
  const ancho =
    formato === 'personalizado' && Number(datos.ancho ?? actual.ancho)
      ? Math.max(320, Math.min(Number(datos.ancho ?? actual.ancho), 4096))
      : null;
  const alto =
    formato === 'personalizado' && Number(datos.alto ?? actual.alto)
      ? Math.max(320, Math.min(Number(datos.alto ?? actual.alto), 4096))
      : null;
  const qrCodigo = String(datos.qrCodigo || actual.qrCodigo || codigoCorto()).slice(0, 64);
  const qrConfig = normalizarQrConfig(datos.qrConfig ?? actual.qrConfig, enlace);
  qrConfig.codigo = qrCodigo;
  const qrContenido = contenidoQr(
    qrConfig,
    `${base}/?qr=${encodeURIComponent(qrCodigo)}${municipio ? `&municipio=${encodeURIComponent(municipio.id)}` : ''}`
  );
  const imagenUrl = String(datos.imagenUrl ?? actual.imagenUrl ?? '').startsWith('/uploads/')
    ? datos.imagenUrl ?? actual.imagenUrl
    : null;
  const layout = objetoJson(datos.layout ?? actual.layout, { max: 100000 });
  const recortado = componerTexto({
    titulo,
    cuerpo,
    cta,
    enlace,
    hashtags,
    estructura,
    limite: red.limite
  });
  const cambios = {
    red: redClave,
    plantilla: plantillaClave,
    municipioId: municipio?.id || null,
    titulo,
    texto: recortado,
    cuerpo,
    cta,
    estructura,
    colorPrimario,
    colorSecundario,
    hashtags,
    enlace,
    formato,
    ancho,
    alto,
    diseno: String(datos.diseno ?? actual.diseno ?? 'banda').slice(0, 40),
    fuente: String(datos.fuente ?? actual.fuente ?? 'sans').slice(0, 40),
    kicker: String(datos.kicker ?? actual.kicker ?? '').slice(0, 160),
    pie: String(datos.pie ?? actual.pie ?? '').slice(0, 200),
    mostrarQr: datos.mostrarQr === undefined ? actual.mostrarQr !== false : datos.mostrarQr !== false,
    qrConfig,
    qrCodigo,
    layout,
    imagenUrl,
    qrUrl: await generarQr(qrContenido, qrConfig.color || colorPrimario),
    actualizadoEn: new Date().toISOString()
  };
  if (['borrador', 'lista', 'archivada'].includes(datos.estado)) cambios.estado = datos.estado;
  const actualizada = await repositorio.actualizarPublicacionRed(id, cambios);
  const codigo = await repositorio.codigoQrPorPublicacion(id);
  if (codigo) {
    await repositorio.actualizarCodigoQr(codigo.id, {
      contenido: qrConfig.contenido || actualizada.enlace,
      destino: actualizada.enlace,
      actualizadoEn: new Date().toISOString()
    });
  }
  return actualizada;
}

export async function eliminar(repositorio, id) {
  const publicacion = await repositorio.publicacionRedPorId(id);
  if (!publicacion) throw AppError.noEncontrado('Publicación no encontrada');
  await repositorio.eliminarPublicacionRed(id);
  return { eliminada: true, id };
}

/** SVG descargable con la pieza y el QR. */
export async function svgDe(publicacion) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(publicacion.texto || '').split(/\s+/)) {
    if ((actual + ' ' + palabra).trim().length > 46) {
      lineas.push(actual.trim());
      actual = palabra;
    } else {
      actual = `${actual} ${palabra}`.trim();
    }
  }
  if (actual) lineas.push(actual);

  const alto = Math.max(560, 250 + lineas.length * 26);
  const textoLineas = lineas
    .slice(0, 18)
    .map(
      (linea, i) =>
        `<text x="48" y="${210 + i * 26}" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#173f3b">${escaparXml(linea)}</text>`
    )
    .join('');

  const qr = publicacion.qrUrl
    ? `<image href="${escaparXml(publicacion.qrUrl)}" x="640" y="${alto - 280}" width="220" height="220" />`
    : '';
  const primario = escaparXml(publicacion.colorPrimario || '#006657');
  const secundario = escaparXml(publicacion.colorSecundario || '#0f3d3a');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="920" height="${alto}" viewBox="0 0 920 ${alto}">
  <rect width="920" height="${alto}" fill="#f4fbf9"/>
  <rect x="0" y="0" width="920" height="128" fill="${primario}"/>
  <text x="48" y="58" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Sistema de Incidencias Municipales</text>
  <text x="48" y="92" font-family="Segoe UI, Arial, sans-serif" font-size="16" fill="#d7f3ec">${escaparXml(String(publicacion.red || 'red').toUpperCase())} · ${escaparXml(publicacion.titulo || 'Publicación')}</text>
  <text x="48" y="170" font-family="Segoe UI, Arial, sans-serif" font-size="23" font-weight="700" fill="${secundario}">${escaparXml(publicacion.titulo)}</text>
  ${textoLineas}
  <text x="640" y="${alto - 300}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="${primario}">Escanea para abrir</text>
  ${qr}
  <text x="48" y="${alto - 48}" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#5b7774">${escaparXml(publicacion.enlace || '')}</text>
</svg>`;
}

export function nombreArchivo(publicacion) {
  const base = String(publicacion.titulo || 'publicacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `publicacion-${publicacion.red}-${base || 'redes'}.svg`;
}
