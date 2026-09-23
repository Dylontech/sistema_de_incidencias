/**
 * SERVICIO: Municipios, zonas y catálogos de presentación.
 * La `clave` de acceso solo se muestra a los administradores.
 */
import { AppError } from '../utils/AppError.js';
import { publico } from '../models/municipio.model.js';
import { publica as publicaZona } from '../models/zona.model.js';
import { enriquecerLista } from './estado.service.js';
import { esEmpleado } from './alcance.service.js';
import { iconosSemilla, ejemplosSemilla, politicaSemilla } from '../config/semilla.js';
import { DIAS_LIMITES, EVIDENCIA_POLITICA, MUNICIPIO_DEFAULT } from '../config/constantes.js';

/**
 * Listado de municipios para el selector.
 *
 * Por omisión va sin polígonos: los 113 municipios de Michoacán con sus
 * contornos suman más de un megabyte y el selector solo necesita nombre,
 * centro y zoom. El contorno del municipio activo se pide con `detalle()`.
 */
export async function listar(repositorio, usuario, { incluirPoligono = false } = {}) {
  const municipios = await repositorio.todosMunicipios();
  const incluirClave = usuario?.rol === 'admin';
  return municipios
    .map((m) => publico(m, { incluirClave, incluirPoligono }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Un municipio con su contorno, para dibujar el límite y la máscara del mapa. */
export async function detalle(repositorio, usuario, id) {
  const municipio = await repositorio.municipioPorId(id);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  return publico(municipio, { incluirClave: usuario?.rol === 'admin' });
}

/** Zonas del municipio indicado (o del municipio activo del usuario). */
export async function zonas(repositorio, usuario, municipioId) {
  const objetivo = municipioId || usuario.municipioId;
  if (!objetivo) {
    throw AppError.solicitudInvalida('Indica el municipio del que quieres las zonas');
  }
  const lista = await repositorio.zonasPorMunicipio(objetivo);
  return lista.map(publicaZona);
}

/**
 * Resumen de zonas con conteo de reportes (equivalente a `Admin.renderZonas`).
 */
export async function resumenZonas(repositorio, usuario, municipioId) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo funcionarios y administradores pueden ver el resumen de zonas');
  }

  let objetivo = municipioId || usuario.municipioId;
  if (!objetivo) {
    const municipios = await repositorio.todosMunicipios();
    objetivo = (municipios.find((m) => m.id === MUNICIPIO_DEFAULT) || municipios[0])?.id || null;
  }
  if (!objetivo) return [];

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
      maxFotoBytes: EVIDENCIA_POLITICA.maxFotoBytes,
      maxVideoBytes: EVIDENCIA_POLITICA.maxVideoBytes,
      maxVideoSegundos: EVIDENCIA_POLITICA.maxVideoSegundos,
      maxArchivosPorCarga: EVIDENCIA_POLITICA.maxArchivosPorCarga,
      mimesPermitidos: EVIDENCIA_POLITICA.mimesPermitidos
    },
    politicaLegacy: politicaSemilla
  };
}
