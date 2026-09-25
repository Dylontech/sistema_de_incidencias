/**
 * MODELO: Incidencia.
 *
 * Define la forma del documento, valida la entrada del cliente y construye o
 * edita la entidad. No accede a datos ni conoce Express: eso es de los
 * repositorios y controladores.
 *
 * Nota de diseño: `colorAuto` (del monolito) ya NO se persiste. El color es
 * siempre derivado de la fecha y el estado (ver services/estado.service.js),
 * de modo que existe una única fuente de verdad.
 */
import { ESTADO_INICIAL, LIMITES_TEXTO, PRECISION_DUPLICADO } from '../config/constantes.js';
import { recolector, normalizarBusqueda } from '../utils/validacion.js';
import { ahoraIso } from '../utils/fechas.js';
import { nuevoId } from '../utils/ids.js';

/** Campos que el cliente puede enviar al crear o editar. */
export const CAMPOS_ENTRADA = [
  'tipoId',
  'iconoCustom',
  'titulo',
  'descripcion',
  'indicaciones',
  'lat',
  'lng',
  'anonima',
  'evidencia'
];

const MIME_EVIDENCIA = /^(image\/|video\/|application\/pdf)/;

/** Acepta booleanos y las cadenas que envía un formulario HTML. */
function comoBooleano(valor) {
  return valor === true || valor === 'true' || valor === 'on' || valor === 1 || valor === '1';
}

/** Normaliza y valida una entrada de incidencia. `parcial` = edición. */
export function validarEntrada(datos = {}, { parcial = false, exigirUbicacion = true } = {}) {
  const v = recolector();
  const salida = {};
  const tiene = (campo) => Object.prototype.hasOwnProperty.call(datos, campo);

  const tipoId = v.texto(datos.tipoId, 'tipoId', { requerido: !parcial, max: 120 });
  if (tipoId) salida.tipoId = tipoId;

  if (tiene('iconoCustom')) {
    salida.iconoCustom = v.texto(datos.iconoCustom, 'iconoCustom', { max: 24 });
  }

  const titulo = v.texto(datos.titulo, 'titulo', {
    requerido: !parcial || tiene('titulo'),
    max: LIMITES_TEXTO.titulo
  });
  if (titulo || !parcial) salida.titulo = titulo;

  const descripcion = v.texto(datos.descripcion, 'descripcion', {
    requerido: !parcial || tiene('descripcion'),
    max: LIMITES_TEXTO.descripcion
  });
  if (descripcion || !parcial) salida.descripcion = descripcion;

  if (tiene('indicaciones') || !parcial) {
    salida.indicaciones = v.texto(datos.indicaciones, 'indicaciones', { max: LIMITES_TEXTO.indicaciones });
  }

  const requerida = !parcial && exigirUbicacion;
  if (parcial && tiene('lat') !== tiene('lng')) {
    v.agregar('lat', 'Debes enviar latitud y longitud juntas');
  }
  const lat = v.numero(datos.lat, 'lat', { requerido: requerida, min: -90, max: 90 });
  const lng = v.numero(datos.lng, 'lng', { requerido: requerida, min: -180, max: 180 });
  if (lat !== null) salida.lat = lat;
  if (lng !== null) salida.lng = lng;

  if (tiene('evidencia') || !parcial) {
    salida.evidencia = normalizarEvidencia(datos.evidencia, v);
  }

  // El autor decide, reporte a reporte, si aparece su nombre (o pseudónimo) o
  // si el reporte queda anónimo. Acepta booleanos y las cadenas del formulario.
  if (tiene('anonima')) salida.anonima = comoBooleano(datos.anonima);

  // Municipio activo elegido en la interfaz (el selector es público). Con él se
  // busca la zona del reporte; no se guarda tal cual, la incidencia hereda el
  // municipio de la zona encontrada.
  if (tiene('municipioId')) {
    salida.municipioId = v.texto(datos.municipioId, 'municipioId', { max: 64 });
  }

  v.terminar();
  return salida;
}

/** Metadatos de archivos ya subidos por el endpoint de cargas. */
function normalizarEvidencia(lista, v) {
  if (!Array.isArray(lista)) return [];
  const salida = [];
  lista.slice(0, 20).forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      v.agregar(`evidencia[${i}]`, 'Elemento inválido');
      return;
    }
    const url = v.texto(item.url, `evidencia[${i}].url`, { requerido: true, max: 400 });
    const tipo = v.texto(item.tipo, `evidencia[${i}].tipo`, { max: 100 });
    if (tipo && !MIME_EVIDENCIA.test(tipo)) {
      v.agregar(`evidencia[${i}].tipo`, 'Tipo de archivo no permitido');
      return;
    }
    salida.push({
      id: item.id ? String(item.id) : nuevoId(),
      nombre: v.texto(item.nombre, `evidencia[${i}].nombre`, { max: 200 }) || 'archivo',
      tipo,
      tamano: Number(item.tamano) || 0,
      url,
      duracion: item.duracion === undefined || item.duracion === null ? null : Number(item.duracion)
    });
  });
  return salida;
}

/** Documento completo de una incidencia nueva. */
export function construirIncidencia({ entrada, usuario, zona, municipioId, ahora = ahoraIso() }) {
  // Una sesión sin cuenta solo puede reportar en anónimo. Con cuenta, manda la
  // elección que venga en el formulario (por omisión, firma el reporte).
  const anonima = usuario.rol === 'anonimo' ? true : entrada.anonima === true;
  // El historial es público: si el reporte va sin nombre, tampoco puede decir
  // quién lo escribió (delataría al autor anónimo).
  const quien = anonima ? 'Anónimo' : usuario.nombre;
  return {
    id: nuevoId(),
    tipoId: entrada.tipoId,
    iconoCustom: entrada.iconoCustom || '',
    titulo: entrada.titulo,
    descripcion: entrada.descripcion,
    indicaciones: entrada.indicaciones || '',
    lat: entrada.lat,
    lng: entrada.lng,
    fecha: ahora,
    actualizado: ahora,
    estado: ESTADO_INICIAL,
    esAnonimo: anonima,
    // `autor` guarda siempre la identidad interna (username): es lo que da
    // autoría para editar y para dirigir los avisos, aunque no se muestre.
    autor: usuario.username,
    autorNombre: anonima ? 'Anónimo' : usuario.nombre,
    userKey: usuario.userKey,
    municipioId,
    zonaId: zona ? zona.id : null,
    zonaNombre: zona ? zona.nombre : null,
    // Marca de peligro: solo el personal puede activarla (ver
    // `incidencias.service.marcarPeligro`). Nace apagada.
    peligrosa: false,
    peligrosaPor: null,
    peligrosaFecha: null,
    peligrosaMotivo: '',
    evidencia: entrada.evidencia || [],
    historial: [
      {
        fecha: ahora,
        estado: ESTADO_INICIAL,
        accion: 'Incidencia reportada',
        por: quien
      }
    ],
    comentarios: [],
    fechaResolucion: null,
    solucion: null,
    evidenciaSolucion: []
  };
}

/**
 * Aplica una edición conservando lo que no debe cambiar:
 * id, fecha de creación, estado, historial, comentarios y autoría.
 */
export function aplicarEdicion(actual, entrada, { ahora = ahoraIso() } = {}) {
  const editado = {
    ...actual,
    ...entrada,
    actualizado: ahora
  };
  // Campos derivados o históricos que jamás se sobrescriben desde una edición.
  delete editado.colorAuto;
  delete editado.anonima;
  editado.estado = actual.estado;
  editado.fecha = actual.fecha;
  editado.historial = actual.historial;
  editado.comentarios = actual.comentarios;
  editado.userKey = actual.userKey;
  editado.autor = actual.autor;
  editado.autorNombre = actual.autorNombre;
  editado.esAnonimo = actual.esAnonimo;
  editado.municipioId = actual.municipioId;
  // La marca de peligro la controla el personal, no el autor del reporte.
  editado.peligrosa = actual.peligrosa === true;
  editado.peligrosaPor = actual.peligrosaPor ?? null;
  editado.peligrosaFecha = actual.peligrosaFecha ?? null;
  editado.peligrosaMotivo = actual.peligrosaMotivo ?? '';
  return editado;
}

export function agregarHistorial(incidencia, { estado, accion, por, ahora = ahoraIso() }) {
  return [
    ...(incidencia.historial || []),
    { fecha: ahora, estado: estado || incidencia.estado, accion, por: por || '—' }
  ];
}

export function agregarComentario(incidencia, { autor, texto, ahora = ahoraIso() }) {
  return [
    ...(incidencia.comentarios || []),
    { id: nuevoId(), fecha: ahora, autor, texto }
  ];
}

/**
 * Todos los roles pueden LEER las incidencias de su municipio: el listado es
 * público para que los vecinos vean los problemas reportados. Editar, resolver
 * o eliminar se controla con `puedeEditar` y con los permisos de cada servicio.
 */
export function puedeVer(incidencia, usuario) {
  return !!incidencia && !!usuario;
}

/** Reglas de edición (paridad con la vista de detalle del monolito). */
export function puedeEditar(incidencia, usuario) {
  if (!usuario) return false;
  if (usuario.rol === 'admin' || usuario.rol === 'funcionario') return true;
  if (incidencia.userKey !== usuario.userKey) return false;
  return incidencia.estado !== 'resuelta';
}

/** Detección de reportes duplicados: mismo usuario, tipo y ubicación (±0.0002°). */
export function coincideUbicacion(a, b) {
  return (
    Math.abs((a.lat || 0) - (b.lat || 0)) < PRECISION_DUPLICADO &&
    Math.abs((a.lng || 0) - (b.lng || 0)) < PRECISION_DUPLICADO
  );
}

export function esDuplicado(existente, candidato) {
  if (existente.estado === 'resuelta') return false;
  if (existente.userKey !== candidato.userKey) return false;
  if (existente.tipoId !== candidato.tipoId) return false;
  return coincideUbicacion(existente, candidato);
}

/** Filtro de texto libre (título o descripción), insensible a acentos. */
export function coincideTexto(incidencia, consulta) {
  if (!consulta) return true;
  const q = normalizarBusqueda(consulta);
  return (
    normalizarBusqueda(incidencia.titulo).includes(q) ||
    normalizarBusqueda(incidencia.descripcion).includes(q)
  );
}
