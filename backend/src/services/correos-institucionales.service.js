/**
 * SERVICIO: directorio de correos institucionales.
 *
 * Solo el administrador maestro lo consulta y mantiene. No hace scraping:
 * ofrece búsquedas asistidas (enlaces a buscadores) y permite registrar,
 * importar, exportar e invitar a los correos que el equipo verifique.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { normalizarCorreo } from '../models/usuario.model.js';
import { enviarCorreo, plantilla, escapar } from './correo.service.js';

const MAX_TEXTO = 160;

function texto(valor, campo, { requerido = false, max = MAX_TEXTO } = {}) {
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

async function resolverMunicipio(repositorio, { municipioId, municipio, estado }) {
  if (municipioId) {
    const encontrado = await repositorio.municipioPorId(String(municipioId));
    if (!encontrado) throw AppError.solicitudInvalida('Municipio no encontrado');
    return encontrado;
  }
  if (municipio) {
    const catalogo = await repositorio.todosMunicipios();
    const encontrado = catalogo.find(
      (m) =>
        m.nombre.toLowerCase() === String(municipio).toLowerCase() &&
        (!estado || m.estado.toLowerCase() === String(estado).toLowerCase())
    );
    if (!encontrado) throw AppError.solicitudInvalida(`Municipio no encontrado: ${municipio}`);
    return encontrado;
  }
  return null;
}

async function existeDuplicado(repositorio, { municipioId, correo, exceptoId = null }) {
  const { correos } = await repositorio.correosInstitucionales({
    municipioId: municipioId || null,
    texto: correo,
    limite: 200
  });
  return correos.some(
    (c) =>
      c.id !== exceptoId &&
      String(c.municipioId || '') === String(municipioId || '') &&
      c.correo.toLowerCase() === correo.toLowerCase()
  );
}

function validarYNormalizar(datos = {}) {
  const correo = normalizarCorreo(datos.correo);
  if (!correo) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido' }
    ]);
  }
  return {
    estado: texto(datos.estado, 'estado', { requerido: true, max: 120 }),
    municipioId: datos.municipioId ? String(datos.municipioId) : null,
    entidad: texto(datos.entidad || datos.estado, 'entidad', { max: MAX_TEXTO }),
    dependencia: texto(datos.dependencia, 'dependencia', { max: MAX_TEXTO }),
    cargo: texto(datos.cargo, 'cargo', { max: 120 }),
    correo,
    telefono: texto(datos.telefono, 'telefono', { max: 40 }),
    fuenteUrl: texto(datos.fuenteUrl, 'fuenteUrl', { max: 500 }),
    verificado: datos.verificado === true,
    notas: texto(datos.notas, 'notas', { max: 2000 })
  };
}

export async function listar(repositorio, filtros = {}) {
  const verificado =
    filtros.verificado === 'si' || filtros.verificado === true
      ? true
      : filtros.verificado === 'no' || filtros.verificado === false
        ? false
        : null;
  return repositorio.correosInstitucionales({
    estado: filtros.estado || null,
    municipioId: filtros.municipioId || null,
    verificado,
    texto: filtros.texto || '',
    pagina: filtros.pagina,
    limite: filtros.limite
  });
}

export async function crear(repositorio, actor, datos = {}) {
  const normalizado = validarYNormalizar(datos);
  if (await existeDuplicado(repositorio, normalizado)) {
    throw AppError.conflicto('Ya existe ese correo para el mismo municipio');
  }
  const correo = {
    id: nuevoId(),
    ...normalizado,
    invitadoEn: null,
    ultimaInvitacionEn: null,
    creadoPor: actor?.username || null,
    actualizadoEn: new Date().toISOString(),
    simulado: datos.simulado === true,
    simulacionId: datos.simulacionId || null
  };
  await repositorio.crearCorreoInstitucional(correo);
  return correo;
}

export async function actualizar(repositorio, id, datos = {}) {
  const actual = await repositorio.correoInstitucionalPorId(id);
  if (!actual) throw AppError.noEncontrado('Correo institucional no encontrado');
  const normalizado = validarYNormalizar({ ...actual, ...datos });
  if (await existeDuplicado(repositorio, { ...normalizado, exceptoId: id })) {
    throw AppError.conflicto('Ya existe ese correo para el mismo municipio');
  }
  return repositorio.actualizarCorreoInstitucional(id, normalizado);
}

export async function eliminar(repositorio, id) {
  const actual = await repositorio.correoInstitucionalPorId(id);
  if (!actual) throw AppError.noEncontrado('Correo institucional no encontrado');
  await repositorio.eliminarCorreoInstitucional(id);
  return { eliminado: true, id };
}

/** Divide una línea CSV respetando comillas dobles. */
function separarLinea(linea, separador = ',') {
  const celdas = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];
    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === separador && !entreComillas) {
      celdas.push(actual.trim());
      actual = '';
    } else {
      actual += caracter;
    }
  }
  celdas.push(actual.trim());
  return celdas;
}

function detectarSeparador(linea) {
  if (linea.includes('\t')) return '\t';
  if (linea.includes(';') && !linea.includes(',')) return ';';
  return ',';
}

export async function importar(repositorio, actor, { csv = '' } = {}) {
  const lineas = String(csv)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lineas.length) throw AppError.solicitudInvalida('Pega al menos una fila CSV');

  const separador = detectarSeparador(lineas[0]);
  const encabezado = separarLinea(lineas[0], separador).map((c) => c.toLowerCase());
  const tieneEncabezado =
    encabezado.includes('correo') || encabezado.includes('email') || encabezado.includes('estado');
  const columnas = tieneEncabezado
    ? encabezado
    : ['estado', 'municipio_id', 'dependencia', 'cargo', 'correo', 'telefono', 'fuente_url', 'notas'];

  const filas = lineas.slice(tieneEncabezado ? 1 : 0);
  let creados = 0;
  const errores = [];

  for (const [indice, linea] of filas.entries()) {
    const celdas = separarLinea(linea, separador);
    const fila = {};
    columnas.forEach((columna, i) => {
      fila[columna] = celdas[i] || '';
    });
    try {
      const municipio = await resolverMunicipio(repositorio, {
        municipioId: fila.municipio_id || fila.municipioId || fila.municipio,
        municipio: fila.municipio,
        estado: fila.estado
      });
      await crear(repositorio, actor, {
        estado: fila.estado || municipio?.estado,
        municipioId: municipio?.id || null,
        entidad: fila.entidad || fila.estado,
        dependencia: fila.dependencia,
        cargo: fila.cargo,
        correo: fila.correo || fila.email,
        telefono: fila.telefono,
        fuenteUrl: fila.fuente_url || fila.fuenteUrl,
        verificado: ['1', 'si', 'sí', 'true', 'verificado'].includes(
          String(fila.verificado || '').toLowerCase()
        ),
        notas: fila.notas
      });
      creados += 1;
    } catch (error) {
      errores.push({ linea: indice + (tieneEncabezado ? 2 : 1), error: error.message });
    }
  }

  return { creados, errores, total: filas.length };
}

function celdaCsv(valor) {
  const limpio = String(valor ?? '');
  return /[",\n]/.test(limpio) ? `"${limpio.replace(/"/g, '""')}"` : limpio;
}

export async function exportar(repositorio, filtros = {}) {
  const { correos } = await listar(repositorio, { ...filtros, limite: 200 });
  const encabezado = [
    'estado',
    'municipio_id',
    'dependencia',
    'cargo',
    'correo',
    'telefono',
    'fuente_url',
    'verificado',
    'notas'
  ];
  const filas = correos.map((c) =>
    [
      c.estado,
      c.municipioId,
      c.dependencia,
      c.cargo,
      c.correo,
      c.telefono,
      c.fuenteUrl,
      c.verificado ? 'si' : 'no',
      c.notas
    ]
      .map(celdaCsv)
      .join(',')
  );
  return {
    contenido: [encabezado.join(','), ...filas].join('\r\n'),
    total: correos.length,
    nombre: `correos-institucionales-${new Date().toISOString().slice(0, 10)}.csv`
  };
}

/** Búsquedas asistidas: enlaces listos para Google, Bing y DuckDuckGo. */
export async function busquedasAsistidas(repositorio, municipioId = null) {
  const municipio = municipioId ? await repositorio.municipioPorId(municipioId) : null;
  const lugar = municipio ? `${municipio.nombre} ${municipio.estado}` : 'Michoacán';
  const consultas = [
    `correo oficial ayuntamiento ${lugar}`,
    `directorio de funcionarios ${lugar} email`,
    `transparencia ${lugar} correo institucional`,
    `dependencias municipales ${lugar} contacto`
  ];
  const codificar = (q) => encodeURIComponent(q);
  return {
    municipio: municipio ? { id: municipio.id, nombre: municipio.nombre, estado: municipio.estado } : null,
    consultas: consultas.map((q) => ({
      consulta: q,
      google: `https://www.google.com/search?q=${codificar(q)}`,
      bing: `https://www.bing.com/search?q=${codificar(q)}`,
      duckduckgo: `https://duckduckgo.com/?q=${codificar(q)}`
    }))
  };
}

export async function invitar(repositorio, actor, datos = {}) {
  const ids = [...new Set((datos.ids || []).filter(Boolean).map(String))];
  const filtros = { ...datos, limite: 200 };
  const { correos } = ids.length
    ? { correos: await Promise.all(ids.map((id) => repositorio.correoInstitucionalPorId(id))) }
    : await listar(repositorio, filtros);
  const destinatarios = (correos || []).filter(Boolean);
  if (!destinatarios.length) {
    throw AppError.solicitudInvalida('No hay correos para invitar con esos filtros');
  }

  const asunto =
    texto(datos.asunto, 'asunto', { max: 160 }) ||
    'Invitación al Sistema de Incidencias Municipales';
  const mensaje =
    texto(datos.mensaje, 'mensaje', { max: 4000 }) ||
    'Te invitamos a conocer el Sistema de Incidencias Municipales y a registrar un canal de contacto para la ciudadanía.';
  const enlace = texto(datos.enlace, 'enlace', { max: 500 }) || '/solicitud-acceso';

  const resultados = [];
  for (const correo of destinatarios) {
    const html = plantilla({
      titulo: asunto,
      contenido: `<p>${escapar(mensaje)}</p><p><a href="${escapar(enlace)}">Abrir el sistema</a></p>`,
      pie: 'Recibiste esta invitación porque tu correo aparece en un directorio público.'
    });
    const envio = await enviarCorreo(repositorio, {
      para: correo.correo,
      asunto,
      html,
      texto: mensaje,
      tipo: 'invitacion_institucional'
    });
    const ahora = new Date().toISOString();
    await repositorio.actualizarCorreoInstitucional(correo.id, {
      invitadoEn: correo.invitadoEn || ahora,
      ultimaInvitacionEn: ahora
    });
    resultados.push({ id: correo.id, correo: correo.correo, ok: envio.ok, simulado: envio.simulado });
  }

  return {
    total: resultados.length,
    enviados: resultados.filter((r) => r.ok).length,
    simulados: resultados.filter((r) => r.simulado).length,
    resultados
  };
}
