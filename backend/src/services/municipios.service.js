/**
 * SERVICIO: Municipios, zonas y catálogos de presentación.
 * La `clave` de acceso solo se muestra a los administradores.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { emitir } from './notificaciones.service.js';
import { publico } from '../models/municipio.model.js';
import { publica as publicaZona } from '../models/zona.model.js';
import { enriquecerLista } from './estado.service.js';
import { alcanceDe, esEmpleado, puedeVerMunicipioCompleto } from './alcance.service.js';
import { dentroDelMunicipio } from './geocerca.service.js';
import { iconosSemilla, ejemplosSemilla, politicaSemilla } from '../config/semilla.js';
import {
  DIAS_LIMITES,
  ETIQUETAS_MOTIVO_DENUNCIA,
  EVIDENCIA_POLITICA,
  LIMITES_TEXTO,
  MUNICIPIO_DEFAULT,
  ROLES_ADMIN
} from '../config/constantes.js';

/**
 * Listado de municipios para el selector.
 *
 * Por omisión va sin polígonos: los 2 475 municipios de las 32 entidades con sus
 * contornos suman decenas de megabytes y el selector sólo necesita nombre, centro
 * y zoom. El contorno del municipio activo se pide con `detalle()`.
 * Se ordena por estado y nombre: el frontend los agrupa por estado.
 */
export async function listar(repositorio, usuario, { incluirPoligono = false } = {}) {
  const municipios = await repositorio.todosMunicipios();
  const incluirClave = ROLES_ADMIN.includes(usuario?.rol);
  const alcance = alcanceDe(usuario);

  // El personal solo ve el catálogo de su ámbito; ciudadanos y admin global,
  // todo. Así el selector de municipio no ofrece destinos inaccesibles.
  const visibles = municipios.filter((m) => {
    if (alcance.todos) return true;
    if (alcance.municipios) return alcance.municipios.has(m.id);
    if (alcance.estados) return alcance.estados.has(m.estado);
    return false;
  });

  return visibles
    .map((m) => publico(m, { incluirClave, incluirPoligono }))
    .sort(
      (a, b) =>
        String(a.estado).localeCompare(String(b.estado), 'es') ||
        a.nombre.localeCompare(b.nombre, 'es')
    );
}

/**
 * Resumen por municipio para el panel: incidencias abiertas, tickets abiertos,
 * sugerencias pendientes y personal asignado. Se acota al alcance del actor.
 */
export async function resumenPanel(repositorio, usuario) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal puede ver el resumen por municipio');
  }

  const [municipios, fichas] = await Promise.all([
    listar(repositorio, usuario),
    repositorio.fichasMunicipios ? repositorio.fichasMunicipios() : Promise.resolve([])
  ]);
  const resumen = await repositorio.resumenPorMunicipio();
  const porId = new Map(resumen.map((r) => [r.municipioId, r]));
  const fichaPorMunicipio = new Map(fichas.map((f) => [String(f.municipioId), f]));
  const cero = {
    incidenciasAbiertas: 0,
    ticketsAbiertos: 0,
    sugerenciasPendientes: 0,
    personal: 0
  };

  return municipios.map((m) => {
    const ficha = fichaPorMunicipio.get(String(m.id));
    return {
      ...m,
      ...(porId.get(m.id) || cero),
      fichaEstado: ficha?.estado || 'sin_ficha',
      fichaActualizadaEn: ficha?.actualizadoEn || null
    };
  });
}

const CAMPOS_FICHA = {
  sitioWeb: 500,
  telefono: 80,
  correo: 160,
  direccion: 300,
  horario: 200,
  notas: 3000
};

function limpiarFicha(datos = {}) {
  const salida = {};
  for (const [campo, max] of Object.entries(CAMPOS_FICHA)) {
    salida[campo] = String(datos[campo] ?? '').trim().slice(0, max);
  }
  return salida;
}

/** Ficha pública/interna de un municipio. */
export async function ficha(repositorio, usuario, municipioId) {
  const municipio = await repositorio.municipioPorId(String(municipioId));
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  if (!puedeVerMunicipioCompleto(usuario, municipio)) {
    throw AppError.prohibido('No tienes acceso a ese municipio');
  }
  const guardada = await repositorio.fichaMunicipio(municipio.id);
  const alcance = alcanceDe(usuario);
  const dentroDelAlcance =
    alcance.todos ||
    Boolean(alcance.municipios?.has(String(municipio.id))) ||
    Boolean(alcance.estados?.has(String(municipio.estado)));
  return {
    municipio: { id: municipio.id, nombre: municipio.nombre, estado: municipio.estado },
    ficha: guardada || {
      municipioId: municipio.id,
      sitioWeb: '',
      telefono: '',
      correo: '',
      direccion: '',
      horario: '',
      notas: '',
      estado: 'sin_ficha'
    },
    puedeEditar: dentroDelAlcance && esEmpleado(usuario),
    puedeAprobar: dentroDelAlcance && ROLES_ADMIN.includes(usuario?.rol)
  };
}

/**
 * Guarda una ficha municipal. El funcionario la deja pendiente de aprobación;
 * un administrador la aprueba en el acto.
 */
export async function guardarFicha(repositorio, usuario, municipioId, datos = {}) {
  const detalle = await ficha(repositorio, usuario, municipioId);
  if (!detalle.puedeEditar) throw AppError.prohibido('No puedes editar este municipio');
  const municipio = detalle.municipio;
  const limpia = limpiarFicha(datos);
  if (limpia.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpia.correo)) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo: 'correo', mensaje: 'Escribe un correo válido' }
    ]);
  }

  const esAdminActor = ROLES_ADMIN.includes(usuario?.rol);
  const anterior = detalle.ficha;
  const estado = esAdminActor ? 'aprobado' : 'pendiente';
  const ahora = new Date().toISOString();
  const guardada = await repositorio.guardarFichaMunicipio({
    id: anterior.id || nuevoId(),
    municipioId: municipio.id,
    ...limpia,
    estado,
    propuestoPor: usuario.username,
    aprobadoPor: esAdminActor ? usuario.username : anterior.aprobadoPor || null,
    motivoRechazo: '',
    creadoEn: anterior.creadoEn || ahora,
    actualizadoEn: ahora
  });

  if (!esAdminActor) {
    await emitir(repositorio, {
      evento: 'ficha_municipio_pendiente',
      titulo: 'Ficha municipal pendiente de aprobación',
      mensaje: `${usuario.nombre || usuario.username} propuso cambios a la ficha de ${municipio.nombre}.`,
      municipioId: municipio.id,
      entidadTipo: 'municipio',
      entidadId: municipio.id,
      url: '/?panel=municipios'
    });
  } else if (anterior.propuestoPor && anterior.propuestoPor !== usuario.username) {
    await emitir(repositorio, {
      evento: 'ficha_municipio_aprobada',
      titulo: 'Ficha municipal aprobada',
      mensaje: `La ficha de ${municipio.nombre} fue aprobada.`,
      paraUsuarios: [anterior.propuestoPor],
      municipioId: municipio.id,
      entidadTipo: 'municipio',
      entidadId: municipio.id,
      url: '/?panel=municipios'
    });
  }
  return { ficha: guardada, municipio };
}

/** Aprueba o rechaza una ficha pendiente (solo administración). */
export async function resolverFicha(repositorio, usuario, municipioId, { aprobar = true, motivo = '' } = {}) {
  const detalle = await ficha(repositorio, usuario, municipioId);
  if (!detalle.puedeAprobar) throw AppError.prohibido('Solo un administrador puede aprobar fichas');
  const anterior = detalle.ficha;
  if (!anterior.id) throw AppError.noEncontrado('El municipio no tiene una ficha pendiente');
  const ahora = new Date().toISOString();
  const guardada = await repositorio.actualizarFichaMunicipio(anterior.id, {
    estado: aprobar ? 'aprobado' : 'rechazado',
    aprobadoPor: aprobar ? usuario.username : null,
    motivoRechazo: aprobar ? '' : String(motivo || '').slice(0, 600),
    actualizadoEn: ahora
  });
  if (anterior.propuestoPor && anterior.propuestoPor !== usuario.username) {
    await emitir(repositorio, {
      evento: aprobar ? 'ficha_municipio_aprobada' : 'ficha_municipio_rechazada',
      titulo: aprobar ? 'Ficha municipal aprobada' : 'Ficha municipal rechazada',
      mensaje: aprobar
        ? `La ficha de ${detalle.municipio.nombre} fue aprobada.`
        : `La ficha de ${detalle.municipio.nombre} fue rechazada. ${motivo || ''}`.trim(),
      paraUsuarios: [anterior.propuestoPor],
      municipioId: detalle.municipio.id,
      entidadTipo: 'municipio',
      entidadId: detalle.municipio.id,
      url: '/?panel=municipios'
    });
  }
  return { ficha: guardada, municipio: detalle.municipio };
}

/** Un municipio con su contorno, para dibujar el límite y la máscara del mapa. */
export async function detalle(repositorio, usuario, id) {
  const municipio = await repositorio.municipioPorId(id);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  if (!puedeVerMunicipioCompleto(usuario, municipio)) {
    throw AppError.prohibido('No tienes acceso a ese municipio');
  }
  return publico(municipio, { incluirClave: usuario?.rol === 'admin' });
}

/**
 * Municipio que contiene un punto (lat, lng).
 * Lo usa la geolocalización del navegador: si la persona está en otro
 * municipio, el mapa debe cambiar a ese municipio en lugar de recortar la
 * vista al municipio activo.
 */
export async function municipioDePunto(repositorio, usuario, { lat, lng } = {}) {
  const latitud = Number(lat);
  const longitud = Number(lng);
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    throw AppError.solicitudInvalida('Indica coordenadas válidas');
  }
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
    throw AppError.solicitudInvalida('Las coordenadas están fuera de rango');
  }

  const municipios = await repositorio.todosMunicipios();
  const encontrado = municipios.find((m) => dentroDelMunicipio(latitud, longitud, m));
  if (!encontrado) return null;
  if (usuario && !puedeVerMunicipioCompleto(usuario, encontrado)) return null;
  return publico(encontrado, { incluirClave: false });
}

/** Zonas del municipio indicado (o del municipio activo del usuario). */
export async function zonas(repositorio, usuario, municipioId) {
  const objetivo = municipioId || usuario.municipioId;
  if (!objetivo) {
    throw AppError.solicitudInvalida('Indica el municipio del que quieres las zonas');
  }
  const municipio = await repositorio.municipioPorId(objetivo);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  if (!puedeVerMunicipioCompleto(usuario, municipio)) {
    throw AppError.prohibido('No tienes acceso a ese municipio');
  }
  const lista = await repositorio.zonasPorMunicipio(objetivo);
  return lista.map(publicaZona);
}

/**
 * Resumen de zonas con conteo de reportes (equivalente a `Admin.renderZonas`).
 */
export async function resumenZonas(repositorio, usuario, municipioId) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal del sistema puede ver el resumen de zonas');
  }

  let objetivo = municipioId || usuario.municipioId;
  if (!objetivo) {
    const municipios = await repositorio.todosMunicipios();
    const alcance = alcanceDe(usuario);
    const visibles = municipios.filter((m) => {
      if (alcance.todos) return true;
      if (alcance.municipios) return alcance.municipios.has(m.id);
      if (alcance.estados) return alcance.estados.has(m.estado);
      return false;
    });
    objetivo =
      (visibles.find((m) => m.id === MUNICIPIO_DEFAULT) || visibles[0])?.id || null;
  }
  if (!objetivo) return [];

  const municipio = await repositorio.municipioPorId(objetivo);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  if (!puedeVerMunicipioCompleto(usuario, municipio)) {
    throw AppError.prohibido('No tienes acceso a ese municipio');
  }

  const [zonasMunicipio, incidencias] = await Promise.all([
    repositorio.zonasPorMunicipio(objetivo),
    repositorio.buscarIncidencias({ municipioId: objetivo })
  ]);

  const enriquecidas = enriquecerLista(incidencias);

  return zonasMunicipio.map((zona) => {
    const deLaZona = enriquecidas.filter((i) => i.zonaId === zona.id);
    const resueltas = deLaZona.filter((i) => i.estado === 'resuelta').length;
    return {
      ...publicaZona(zona),
      reportes: deLaZona.length,
      pendientes: deLaZona.length - resueltas,
      resueltas
    };
  });
}

/**
 * Catálogos que el frontend necesita para pintar el formulario:
 * iconos del selector, ejemplos guía y política de antigüedad/límites.
 */
export async function catalogos() {
  return {
    iconos: iconosSemilla,
    ejemplos: ejemplosSemilla,
    diasLimites: DIAS_LIMITES,
    limites: {
      titulo: 80,
      descripcion: 600,
      indicaciones: 400,
      nombreTipo: 60,
      comentario: 500,
      motivoPeligro: LIMITES_TEXTO.motivoPeligro,
      detalleDenuncia: LIMITES_TEXTO.detalleDenuncia,
      motivoModeracion: LIMITES_TEXTO.motivoModeracion,
      maxFotoBytes: EVIDENCIA_POLITICA.maxFotoBytes,
      maxArchivosPorCarga: EVIDENCIA_POLITICA.maxArchivosPorCarga,
      mimesPermitidos: EVIDENCIA_POLITICA.mimesPermitidos
    },
    // Lista cerrada de motivos de denuncia con sus etiquetas: así el navegador
    // no duplica el catálogo y añadir un motivo es tocar solo las constantes.
    motivosDenuncia: ETIQUETAS_MOTIVO_DENUNCIA,
    politicaLegacy: politicaSemilla
  };
}
