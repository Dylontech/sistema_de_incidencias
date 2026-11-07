/**
 * SERVICIO: firmas de incidencias y recolecciones municipales.
 *
 * Reglas:
 *  - Solo cuentas registradas firman; una firma por cuenta y recolección.
 *  - El autor fija la meta; el admin media y puede enviar el documento.
 *  - Funcionario y admin territorial ven solo su ámbito y no modifican.
 *  - Límite global de firmas por cuenta configurable (10 por defecto).
 */
import PDFDocument from 'pdfkit';
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { alcanceDe, esAdmin, esAlgunaAdmin, esEmpleado, exigirVisibilidad } from './alcance.service.js';
import { valor as valorConfig } from './configuracion.service.js';
import { emitir } from './notificaciones.service.js';

const ESTADOS_CERRADOS = new Set(['resuelta']);

function exigirCuenta(usuario) {
  if (!usuario || usuario.rol === 'anonimo') {
    throw AppError.prohibido('Crea una cuenta para firmar o gestionar una recolección de firmas');
  }
}

function texto(valor, campo, { requerido = false, max = 160 } = {}) {
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

function nombrePublico(usuario) {
  return usuario?.pseudonimo ? usuario.nombre : usuario?.nombre || usuario?.username || 'Ciudadano';
}

function alcanceMunicipios(usuario, municipios) {
  const alcance = alcanceDe(usuario);
  if (alcance.todos) return municipios;
  if (alcance.municipios) {
    return municipios.filter((id) => alcance.municipios.has(id));
  }
  return [];
}

async function resumen(repositorio, recoleccion, usuario) {
  if (!recoleccion) return null;
  const firmas = await repositorio.firmasDeRecoleccion(recoleccion.id);
  const maxima = await valorConfig(repositorio, 'firmas.max_por_usuario');
  const firmada = usuario?.userKey
    ? firmas.some((f) => f.userKey === usuario.userKey)
    : false;
  const firmasUsuario = usuario?.userKey
    ? await repositorio.contarFirmasDeUsuario(usuario.userKey)
    : 0;
  return {
    id: recoleccion.id,
    tipo: recoleccion.tipo,
    incidenciaId: recoleccion.incidenciaId,
    municipioId: recoleccion.municipioId,
    titulo: recoleccion.titulo,
    descripcion: recoleccion.descripcion,
    meta: Number(recoleccion.meta) || 0,
    estado: recoleccion.estado,
    total: firmas.length,
    firmada,
    firmasUsuario,
    maximoPorUsuario: maxima,
    puedeFirmar:
      Boolean(usuario) &&
      usuario.rol !== 'anonimo' &&
      !firmada &&
      recoleccion.estado !== 'cerrada' &&
      (recoleccion.estado !== 'enviada' || esAlgunaAdmin(usuario)) &&
      firmasUsuario < maxima,
    puedeEditarMeta:
      Boolean(usuario) &&
      (esAlgunaAdmin(usuario) || recoleccion.creadoPorUserKey === usuario.userKey),
    esAutor: Boolean(usuario) && recoleccion.creadoPorUserKey === usuario.userKey,
    firmantes: firmas.map((f) => ({
      id: f.id,
      nombre: f.nombrePublico || 'Ciudadano',
      creadoEn: f.creadoEn
    })),
    creadoEn: recoleccion.creadoEn,
    metaAlcanzadaEn: recoleccion.metaAlcanzadaEn,
    enviadaEn: recoleccion.enviadaEn,
    enviadaA: recoleccion.enviadaA
  };
}

async function asegurarRecoleccionIncidencia(repositorio, incidencia, usuario) {
  const existente = await repositorio.recoleccionFirmaPorIncidencia(incidencia.id);
  if (existente) return existente;
  const meta = Number(incidencia.metaFirmas) || (await valorConfig(repositorio, 'firmas.meta_default'));
  const recoleccion = {
    id: nuevoId(),
    tipo: 'incidencia',
    incidenciaId: incidencia.id,
    municipioId: incidencia.municipioId,
    titulo: incidencia.titulo,
    descripcion: incidencia.descripcion,
    meta,
    estado: 'abierta',
    creadoPorUsuarioId: usuario?.id || null,
    creadoPorUserKey: usuario?.userKey || null,
    creadoEn: new Date().toISOString(),
    metaAlcanzadaEn: null,
    enviadaEn: null,
    enviadaA: null,
    simulado: false,
    simulacionId: null
  };
  return repositorio.crearRecoleccionFirma(recoleccion);
}

/** Resumen de firmas de una incidencia. */
export async function resumenDeIncidencia(repositorio, usuario, incidenciaId) {
  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  exigirVisibilidad(incidencia, usuario);
  let recoleccion = await repositorio.recoleccionFirmaPorIncidencia(incidenciaId);
  if (!recoleccion && incidencia.metaFirmas) {
    recoleccion = await asegurarRecoleccionIncidencia(repositorio, incidencia, usuario);
  }
  if (!recoleccion) {
    return {
      id: null,
      incidenciaId,
      meta: Number(incidencia.metaFirmas) || 0,
      total: 0,
      firmada: false,
      puedeFirmar:
        Boolean(usuario) &&
        usuario.rol !== 'anonimo' &&
        !ESTADOS_CERRADOS.has(incidencia.estado),
      firmantes: [],
      firmasUsuario: usuario?.userKey
        ? await repositorio.contarFirmasDeUsuario(usuario.userKey)
        : 0,
      maximoPorUsuario: await valorConfig(repositorio, 'firmas.max_por_usuario'),
      puedeEditarMeta:
        Boolean(usuario) &&
        (esAlgunaAdmin(usuario) || (incidencia.userKey && incidencia.userKey === usuario.userKey)),
      esAutor: Boolean(usuario) && incidencia.userKey === usuario.userKey
    };
  }
  return resumen(repositorio, recoleccion, usuario);
}

/** El autor (o un admin) fija la meta de una incidencia. */
export async function fijarMetaIncidencia(repositorio, usuario, incidenciaId, metaCruda) {
  exigirCuenta(usuario);
  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  exigirVisibilidad(incidencia, usuario);
  const esAutor = incidencia.userKey && incidencia.userKey === usuario.userKey;
  if (!esAutor && !esAlgunaAdmin(usuario)) {
    throw AppError.prohibido('Solo el autor o un administrador pueden fijar la meta');
  }
  if (ESTADOS_CERRADOS.has(incidencia.estado)) {
    throw AppError.conflicto('No se puede cambiar la meta de una incidencia resuelta');
  }
  const min = await valorConfig(repositorio, 'firmas.meta_min');
  const max = await valorConfig(repositorio, 'firmas.meta_max');
  const meta = Number(metaCruda);
  if (!Number.isInteger(meta) || meta < min || meta > max) {
    throw AppError.solicitudInvalida('Meta de firmas inválida', [
      { campo: 'meta', mensaje: `Debe ser un entero entre ${min} y ${max}` }
    ]);
  }
  let recoleccion = await repositorio.recoleccionFirmaPorIncidencia(incidenciaId);
  if (!recoleccion) {
    recoleccion = await asegurarRecoleccionIncidencia(repositorio, incidencia, usuario);
  }
  recoleccion = await repositorio.actualizarRecoleccionFirma(recoleccion.id, { meta });
  await repositorio.actualizarIncidencia(incidencia.id, { ...incidencia, metaFirmas: meta });
  await emitir(repositorio, {
    evento: 'recoleccion_firmas_creada',
    titulo: '✍️ Meta de firmas actualizada',
    mensaje: `${incidencia.titulo}: ${meta} firmas`,
    severidad: 'info',
    entidadTipo: 'incidencia',
    entidadId: incidencia.id,
    municipioId: incidencia.municipioId,
    url: `/?incidencia=${encodeURIComponent(incidencia.id)}&firmas=1`,
    claveDedupe: `meta_firmas:${incidencia.id}:${meta}`
  });
  return resumen(repositorio, recoleccion, usuario);
}

async function firmarRecoleccion(repositorio, usuario, recoleccion, ipHash = null) {
  exigirCuenta(usuario);
  if (!recoleccion) throw AppError.noEncontrado('Recolección de firmas no encontrada');
  if (recoleccion.estado === 'cerrada') {
    throw AppError.conflicto('La recolección de firmas está cerrada');
  }
  const existente = await repositorio.firmaDeUsuario(recoleccion.id, usuario.userKey);
  if (existente) {
    throw AppError.conflicto('Ya firmaste esta recolección');
  }
  const maximo = await valorConfig(repositorio, 'firmas.max_por_usuario');
  const totalUsuario = await repositorio.contarFirmasDeUsuario(usuario.userKey);
  if (totalUsuario >= maximo) {
    await emitir(repositorio, {
      evento: 'limite_firmas_alcanzado',
      paraUsuarios: [usuario.userKey],
      titulo: '⚠️ Límite de firmas alcanzado',
      mensaje: `Alcanzaste el límite de ${maximo} firmas por cuenta. Un administrador puede ampliarlo.`,
      entidadTipo: 'cuenta',
      entidadId: usuario.id || null,
      url: '/?perfil=1',
      claveDedupe: `limite_firmas:${usuario.userKey}:${new Date().toISOString().slice(0, 10)}`
    }).catch(() => {});
    throw AppError.conflicto(
      `Alcanzaste el límite de ${maximo} firmas por cuenta. Un administrador puede ampliarlo.`
    );
  }
  const firma = {
    id: nuevoId(),
    recoleccionId: recoleccion.id,
    usuarioId: usuario.id || null,
    userKey: usuario.userKey,
    nombrePublico: nombrePublico(usuario),
    creadoEn: new Date().toISOString(),
    ipHash,
    simulado: false,
    simulacionId: null
  };
  await repositorio.crearFirmaIncidencia(firma);
  const firmas = await repositorio.firmasDeRecoleccion(recoleccion.id);
  let actualizada = recoleccion;
  if (recoleccion.meta > 0 && firmas.length >= recoleccion.meta && recoleccion.estado === 'abierta') {
    actualizada = await repositorio.actualizarRecoleccionFirma(recoleccion.id, {
      estado: 'meta_alcanzada',
      metaAlcanzadaEn: new Date().toISOString()
    });
    const baseMeta = {
      evento: 'meta_firmas_alcanzada',
      titulo: '🎯 Meta de firmas alcanzada',
      mensaje: `La incidencia "${recoleccion.titulo}" alcanzó ${firmas.length} firmas.`,
      severidad: 'exito',
      entidadTipo: 'incidencia',
      entidadId: recoleccion.incidenciaId || recoleccion.id,
      municipioId: recoleccion.municipioId,
      url: recoleccion.incidenciaId
        ? `/?incidencia=${encodeURIComponent(recoleccion.incidenciaId)}&firmas=1`
        : '/?admin=firmas'
    };
    if (recoleccion.creadoPorUserKey) {
      await emitir(repositorio, {
        ...baseMeta,
        paraUsuarios: [recoleccion.creadoPorUserKey],
        claveDedupe: `meta_firmas_autor:${recoleccion.id}`
      });
    }
    await emitir(repositorio, {
      ...baseMeta,
      claveDedupe: `meta_firmas_alcanzada:${recoleccion.id}`
    });
  } else {
    const baseFirma = {
      evento: 'firma_agregada',
      titulo: '✍️ Nueva firma',
      mensaje: `${nombrePublico(usuario)} firmó "${recoleccion.titulo}".`,
      severidad: 'info',
      entidadTipo: recoleccion.incidenciaId ? 'incidencia' : 'recoleccion_firmas',
      entidadId: recoleccion.incidenciaId || recoleccion.id,
      municipioId: recoleccion.municipioId,
      url: recoleccion.incidenciaId
        ? `/?incidencia=${encodeURIComponent(recoleccion.incidenciaId)}&firmas=1`
        : '/?admin=firmas',
      claveDedupe: `firma:${firma.id}`
    };
    if (recoleccion.creadoPorUserKey && recoleccion.creadoPorUserKey !== usuario.userKey) {
      await emitir(repositorio, {
        ...baseFirma,
        paraUsuarios: [recoleccion.creadoPorUserKey],
        claveDedupe: `firma_autor:${firma.id}`
      });
    } else {
      await emitir(repositorio, baseFirma);
    }
  }
  return resumen(repositorio, actualizada, usuario);
}

/** Firma una incidencia concreta. */
export async function firmarIncidencia(repositorio, usuario, incidenciaId, { ipHash = null } = {}) {
  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  exigirVisibilidad(incidencia, usuario);
  if (incidencia.oculta) throw AppError.noEncontrado('Incidencia no encontrada');
  if (ESTADOS_CERRADOS.has(incidencia.estado)) {
    throw AppError.conflicto('No se puede firmar una incidencia resuelta');
  }
  const recoleccion = await asegurarRecoleccionIncidencia(repositorio, incidencia, usuario);
  return firmarRecoleccion(repositorio, usuario, recoleccion, ipHash);
}

/** Retira la firma propia. */
export async function retirarFirmaIncidencia(repositorio, usuario, incidenciaId) {
  exigirCuenta(usuario);
  const recoleccion = await repositorio.recoleccionFirmaPorIncidencia(incidenciaId);
  if (!recoleccion) throw AppError.noEncontrado('Recolección de firmas no encontrada');
  const borrada = await repositorio.eliminarFirmaIncidencia(recoleccion.id, usuario.userKey);
  if (!borrada) throw AppError.noEncontrado('No habías firmado esta incidencia');
  return resumen(repositorio, recoleccion, usuario);
}

/** Firma una recolección municipal. */
export async function firmarRecoleccionMunicipal(repositorio, usuario, recoleccionId, { ipHash = null } = {}) {
  const recoleccion = await repositorio.recoleccionFirmaPorId(recoleccionId);
  if (!recoleccion) throw AppError.noEncontrado('Recolección de firmas no encontrada');
  return firmarRecoleccion(repositorio, usuario, recoleccion, ipHash);
}

/** Crea una recolección municipal (por ejemplo, para pedir funcionarios). */
export async function crearRecoleccionMunicipal(repositorio, usuario, datos = {}) {
  exigirCuenta(usuario);
  const municipioId = texto(datos.municipioId, 'municipioId', { requerido: true, max: 64 });
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');
  const meta = Number(datos.meta);
  const min = await valorConfig(repositorio, 'firmas.meta_min');
  const max = await valorConfig(repositorio, 'firmas.meta_max');
  if (!Number.isInteger(meta) || meta < min || meta > max) {
    throw AppError.solicitudInvalida('Meta de firmas inválida', [
      { campo: 'meta', mensaje: `Debe ser un entero entre ${min} y ${max}` }
    ]);
  }
  const recoleccion = {
    id: nuevoId(),
    tipo: 'municipio',
    incidenciaId: null,
    municipioId,
    titulo: texto(datos.titulo, 'titulo', { requerido: true, max: 160 }),
    descripcion: texto(datos.descripcion, 'descripcion', { max: 1000 }),
    meta,
    estado: 'abierta',
    creadoPorUsuarioId: usuario.id || null,
    creadoPorUserKey: usuario.userKey || null,
    creadoEn: new Date().toISOString(),
    metaAlcanzadaEn: null,
    enviadaEn: null,
    enviadaA: null,
    simulado: false,
    simulacionId: null
  };
  await repositorio.crearRecoleccionFirma(recoleccion);
  await emitir(repositorio, {
    evento: 'recoleccion_firmas_creada',
    titulo: '✍️ Nueva recolección de firmas municipal',
    mensaje: `${recoleccion.titulo} · ${municipio.nombre}`,
    severidad: 'info',
    entidadTipo: 'recoleccion_firmas',
    entidadId: recoleccion.id,
    municipioId,
    url: '/?admin=firmas',
    claveDedupe: `recoleccion_creada:${recoleccion.id}`
  });
  return resumen(repositorio, recoleccion, usuario);
}

/** Lista de recolecciones visibles para el personal. */
export async function listarRecolecciones(repositorio, usuario, filtros = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal puede consultar las recolecciones');
  }
  const todas = await repositorio.recoleccionesFirmas({
    estado: filtros.estado || null,
    limite: filtros.limite || 300
  });
  const visibles = esAdmin(usuario)
    ? todas
    : todas.filter((r) => alcanceMunicipios(usuario, [r.municipioId]).length > 0);
  return Promise.all(
    visibles.map(async (recoleccion) => {
      const firmas = await repositorio.firmasDeRecoleccion(recoleccion.id);
      const incidencia = recoleccion.incidenciaId
        ? await repositorio.incidenciaPorId(recoleccion.incidenciaId)
        : null;
      return {
        ...recoleccion,
        total: firmas.length,
        incidenciaTitulo: incidencia?.titulo || null,
        incidenciaFolio: incidencia?.folio || null,
        firmantes: firmas.map((f) => ({
          nombre: f.nombrePublico || 'Ciudadano',
          creadoEn: f.creadoEn
        }))
      };
    })
  );
}

/** Detalle de una recolección con firmas y envíos. */
export async function detalleRecoleccion(repositorio, usuario, id) {
  const recoleccion = await repositorio.recoleccionFirmaPorId(id);
  if (!recoleccion) throw AppError.noEncontrado('Recolección no encontrada');
  if (!esAdmin(usuario)) {
    if (!esEmpleado(usuario)) throw AppError.prohibido('No tienes acceso a esta recolección');
    const permitidos = alcanceMunicipios(usuario, [recoleccion.municipioId]);
    if (!permitidos.length) throw AppError.prohibido('La recolección pertenece a otro municipio');
  }
  return {
    ...(await resumen(repositorio, recoleccion, usuario)),
    envios: await repositorio.enviosDeRecoleccion(id)
  };
}

/** Solicita al admin que medie o genere el documento. */
export async function solicitarAdmin(repositorio, usuario, id, nota = '') {
  exigirCuenta(usuario);
  const recoleccion = await repositorio.recoleccionFirmaPorId(id);
  if (!recoleccion) throw AppError.noEncontrado('Recolección no encontrada');
  const envio = {
    id: nuevoId(),
    recoleccionId: id,
    tipo: 'solicitud_admin',
    destino: 'administrador',
    estado: 'pendiente',
    nota: texto(nota, 'nota', { max: 500 }),
    creadoPor: usuario.username,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearEnvioFirma(envio);
  await emitir(repositorio, {
    evento: 'solicitud_firmas_admin',
    titulo: '📨 Solicitud de mediación de firmas',
    mensaje: `${usuario.nombre || usuario.username} pidió revisar "${recoleccion.titulo}".`,
    severidad: 'alerta',
    entidadTipo: 'recoleccion_firmas',
    entidadId: id,
    municipioId: recoleccion.municipioId,
    url: '/?admin=firmas',
    claveDedupe: `solicitud_firmas:${id}:${Date.now()}`
  });
  return envio;
}

/** Envío del documento al funcionario (solo admin). */
export async function enviarAFuncionario(repositorio, usuario, id, { destino = '', nota = '' } = {}) {
  if (!esAlgunaAdmin(usuario)) throw AppError.prohibido('Solo un administrador puede enviar el documento');
  const recoleccion = await repositorio.recoleccionFirmaPorId(id);
  if (!recoleccion) throw AppError.noEncontrado('Recolección no encontrada');
  const envio = {
    id: nuevoId(),
    recoleccionId: id,
    tipo: 'envio_funcionario',
    destino: texto(destino, 'destino', { requerido: true, max: 160 }),
    estado: 'enviado',
    nota: texto(nota, 'nota', { max: 500 }),
    creadoPor: usuario.username,
    creadoEn: new Date().toISOString()
  };
  await repositorio.crearEnvioFirma(envio);
  await repositorio.actualizarRecoleccionFirma(id, {
    estado: 'enviada',
    enviadaEn: envio.creadoEn,
    enviadaA: envio.destino
  });
  await emitir(repositorio, {
    evento: 'documento_firmas_enviado',
    titulo: '📄 Documento de firmas enviado',
    mensaje: `"${recoleccion.titulo}" se envió a ${envio.destino}.`,
    severidad: 'exito',
    entidadTipo: 'recoleccion_firmas',
    entidadId: id,
    municipioId: recoleccion.municipioId,
    url: '/?admin=firmas',
    claveDedupe: `envio_firmas:${envio.id}`
  });
  return envio;
}

export async function datosExportacion(repositorio, usuario, recoleccionId) {
  const detalle = await detalleRecoleccion(repositorio, usuario, recoleccionId);
  const incidencia = detalle.incidenciaId
    ? await repositorio.incidenciaPorId(detalle.incidenciaId)
    : null;
  const municipio = detalle.municipioId ? await repositorio.municipioPorId(detalle.municipioId) : null;
  return { ...detalle, incidencia, municipio };
}

export function generarCSV(datos) {
  const celda = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`;
  const lineas = [
    ['Recolección de firmas', datos.titulo].map(celda).join(','),
    ['Municipio', datos.municipio ? `${datos.municipio.nombre}, ${datos.municipio.estado}` : ''].map(celda).join(','),
    ['Meta', datos.meta].map(celda).join(','),
    ['Firmas', datos.total].map(celda).join(','),
    ['Estado', datos.estado].map(celda).join(','),
    ['Folio de incidencia', datos.incidencia?.folio || ''].map(celda).join(','),
    '',
    ['#', 'Nombre', 'Fecha'].map(celda).join(','),
    ...datos.firmantes.map((f, i) => [i + 1, f.nombre, f.creadoEn].map(celda).join(','))
  ];
  return `\uFEFF${lineas.join('\n')}\n`;
}

export function generarPDF(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const trozos = [];
    doc.on('data', (trozo) => trozos.push(trozo));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    doc.fontSize(18).text('Recolección de firmas', { align: 'left' });
    doc.moveDown(0.4);
    doc.fontSize(12).text(datos.titulo);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#444');
    doc.text(`Municipio: ${datos.municipio ? `${datos.municipio.nombre}, ${datos.municipio.estado}` : 'No especificado'}`);
    doc.text(`Meta: ${datos.meta} · Firmas: ${datos.total} · Estado: ${datos.estado}`);
    if (datos.incidencia) doc.text(`Incidencia: ${datos.incidencia.folio || datos.incidencia.id}`);
    doc.moveDown(0.8);
    doc.fillColor('#000').fontSize(11).text('Firmantes', { underline: true });
    doc.moveDown(0.4);
    datos.firmantes.forEach((firma, indice) => {
      doc.fontSize(9).text(`${indice + 1}. ${firma.nombre}`, { continued: true });
      doc.fillColor('#666').text(`   ${new Date(firma.creadoEn).toLocaleString('es-MX')}`);
      doc.fillColor('#000');
    });
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#666').text(
      `Generado el ${new Date().toLocaleString('es-MX')} · Documento de participación ciudadana.`
    );
    doc.end();
  });
}
