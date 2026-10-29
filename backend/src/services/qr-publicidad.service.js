/**
 * Entrada pública de códigos QR y estadísticas agregadas.
 *
 * No se guardan coordenadas exactas: el punto solo se usa para resolver el
 * municipio y después se descarta. Los escaneos repetidos de la misma sesión
 * dentro de la ventana de deduplicación no crean otra fila.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { hashIp } from '../utils/privacidad.js';
import { municipioDePunto } from './municipios.service.js';

const VENTANA_DEDUPE_MS = 30 * 60 * 1000;

function coordenadas(datos = {}) {
  const lat = Number(datos.lat);
  const lng = Number(datos.lng);
  if (!datos.lat || !datos.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function infoCodigo(repositorio, codigo) {
  const registro = await repositorio.codigoQrPorCodigo(String(codigo || '').trim());
  if (!registro || registro.activo === false) throw AppError.noEncontrado('Código QR no encontrado');
  const publicacion = registro.publicacionId
    ? await repositorio.publicacionRedPorId(registro.publicacionId)
    : null;
  return {
    codigo: registro.codigo,
    tipo: registro.tipo,
    destino: registro.destino || publicacion?.enlace || null,
    publicacion: publicacion
      ? {
          id: publicacion.id,
          titulo: publicacion.titulo,
          municipioId: publicacion.municipioId || null,
          red: publicacion.red || null
        }
      : null,
    municipioId: publicacion?.municipioId || null
  };
}

export async function guardarCodigo(repositorio, actor, datos = {}) {
  const contenido = String(datos.contenido || '').trim();
  if (!contenido) throw AppError.solicitudInvalida('Escribe el contenido del QR');
  if (contenido.length > 1500) throw AppError.solicitudInvalida('El contenido es demasiado largo');
  if (/^(javascript|data|vbscript|file|blob):/i.test(contenido)) {
    throw AppError.solicitudInvalida('Ese esquema no está permitido');
  }
  const codigo = nuevoId().replace(/-/g, '').slice(0, 12);
  const registro = {
    id: nuevoId(),
    codigo,
    tipo: String(datos.tipo || 'texto').slice(0, 24),
    contenido,
    destino: /^https?:\/\//i.test(contenido) ? contenido : null,
    publicacionId: datos.publicacionId || null,
    activo: true,
    creadoPor: actor?.username || null,
    creadoEn: new Date().toISOString(),
    simulado: false,
    simulacionId: null
  };
  await repositorio.crearCodigoQr(registro);
  return { codigo: registro };
}

export async function registrarEscaneo(
  repositorio,
  codigo,
  { usuario = null, lat = null, lng = null, precision = null, ip = null, userAgent = '' } = {}
) {
  const info = await infoCodigo(repositorio, codigo);
  const userKey = usuario?.userKey || usuario?.username || null;
  const reciente = await repositorio.escaneoQrReciente({
    codigo: info.codigo,
    userKey,
    ventanaMs: VENTANA_DEDUPE_MS
  });
  if (reciente) {
    return {
      registrado: false,
      duplicado: true,
      codigo: info.codigo,
      publicacion: info.publicacion,
      destino: info.destino
    };
  }

  let municipio = null;
  let ubicacionResuelta = false;
  const punto = coordenadas({ lat, lng });
  if (punto) {
    try {
      municipio = await municipioDePunto(repositorio, null, punto);
      ubicacionResuelta = Boolean(municipio);
    } catch {
      municipio = null;
    }
  }
  if (!municipio && info.municipioId) {
    municipio = await repositorio.municipioPorId(info.municipioId);
  }

  const escaneo = {
    id: nuevoId(),
    codigoId: null,
    codigo: info.codigo,
    publicacionId: info.publicacion?.id || null,
    escaneadoEn: new Date().toISOString(),
    municipioId: municipio?.id || null,
    precisionM: Number.isFinite(Number(precision)) ? Math.max(0, Math.round(Number(precision))) : null,
    userKey,
    ipHash: hashIp(ip),
    userAgent: String(userAgent || '').slice(0, 240),
    origen: 'qr',
    ubicacionResuelta
  };
  await repositorio.registrarEscaneoQr(escaneo);
  return {
    registrado: true,
    duplicado: false,
    codigo: info.codigo,
    publicacion: info.publicacion,
    destino: info.destino,
    municipio: municipio
      ? { id: municipio.id, nombre: municipio.nombre, estado: municipio.estado }
      : null,
    ubicacionResuelta
  };
}

function inicioPorDefecto() {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 30);
  return fecha.toISOString();
}

/** Agrega escaneos para el panel; nunca devuelve coordenadas. */
export async function estadisticas(repositorio, { publicacionId = null, desde = null, hasta = null } = {}) {
  const escaneos = await repositorio.escaneosQr({
    publicacionId: publicacionId || null,
    desde: desde || inicioPorDefecto(),
    hasta: hasta || null
  });
  const porDia = new Map();
  const porMunicipio = new Map();
  const porPublicacion = new Map();
  const unicos = new Set();
  for (const escaneo of escaneos) {
    const dia = String(escaneo.escaneadoEn || '').slice(0, 10);
    if (dia) porDia.set(dia, (porDia.get(dia) || 0) + 1);
    const municipioId = escaneo.municipioId || 'sin-municipio';
    porMunicipio.set(municipioId, (porMunicipio.get(municipioId) || 0) + 1);
    const publicacion = escaneo.publicacionId || 'sin-publicacion';
    porPublicacion.set(publicacion, (porPublicacion.get(publicacion) || 0) + 1);
    unicos.add(escaneo.userKey || escaneo.ipHash || escaneo.id);
  }
  return {
    total: escaneos.length,
    unicos: unicos.size,
    ubicacionResuelta: escaneos.filter((e) => e.ubicacionResuelta).length,
    porDia: [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, total]) => ({ dia, total })),
    porMunicipio: [...porMunicipio.entries()].map(([municipioId, total]) => ({
      municipioId,
      total
    })),
    porPublicacion: [...porPublicacion.entries()].map(([id, total]) => ({ publicacionId: id, total })),
    desde: desde || inicioPorDefecto(),
    hasta: hasta || null
  };
}
