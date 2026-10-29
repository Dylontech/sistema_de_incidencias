/**
 * SERVICIO: informes de incidencias (datos, CSV y PDF).
 *
 * El mismo generador sirve para el personal (con su alcance territorial) y para
 * las solicitudes públicas (solo datos agregados, sin autoría ni datos
 * personales).
 */
import { AppError } from '../utils/AppError.js';
import { DIAS_LIMITES } from '../config/constantes.js';
import { enriquecerLista } from './estado.service.js';
import { filtrosDeAlcance } from './alcance.service.js';
import { plantillaInforme } from './configuracion.service.js';

function listaUnica(valor) {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : String(valor).split(',');
  return [...new Set(lista.map((v) => String(v).trim()).filter(Boolean))];
}

function desdeIso(valor, fin = false) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    throw AppError.solicitudInvalida('La fecha debe tener el formato AAAA-MM-DD');
  }
  return `${texto.slice(0, 10)}T${fin ? '23:59:59' : '00:00:00'}.000Z`;
}

/**
 * Convierte la selección «estados completos + municipios concretos» en un
 * único filtro de municipios. Los repositorios aplican municipios y estados
 * con AND; para que un estado completo y un municipio de otro estado se sumen
 * (unión), se expanden aquí los estados seleccionados.
 */
export function unirMunicipiosSeleccionados(catalogo, municipios, estados) {
  const permitidos = new Set(municipios.map(String));
  for (const municipio of catalogo) {
    if (estados.includes(municipio.estado)) permitidos.add(String(municipio.id));
  }
  return [...permitidos];
}

async function resolverConsultaTerritorial(repositorio, municipios, estados) {
  if (!estados.length) return { municipios, estados: [] };
  if (!municipios.length) return { municipios: [], estados };

  const catalogo = await repositorio.todosMunicipios();
  return {
    municipios: unirMunicipiosSeleccionados(catalogo, municipios, estados),
    estados: []
  };
}

/**
 * Reúne los datos del informe.
 *
 * `publico: true` evita cualquier dato personal: ni autor, ni userKey, ni
 * comentarios. Además exige un filtro territorial para no volcar el país entero.
 */
export async function datosInforme(
  repositorio,
  filtros = {},
  { publico = false, usuario = null } = {}
) {
  const municipios = listaUnica(filtros.municipios || filtros.municipioId);
  const estados = listaUnica(filtros.estados || filtros.estadoEntidad);
  const municipioUnico = municipios.length === 1 ? municipios[0] : null;
  const estadoUnico = estados.length === 1 ? estados[0] : null;
  const consultaTerritorial = await resolverConsultaTerritorial(repositorio, municipios, estados);
  const ambito = filtros.ambito || 'todos';
  const ambitos = listaUnica(filtros.ambitos || filtros.ambito).filter((a) => a !== 'todos');
  const tiposTodos = filtros.tiposTodos === true;
  const tipos = tiposTodos ? [] : listaUnica(filtros.tipos);
  const desde = desdeIso(filtros.desde);
  const hasta = desdeIso(filtros.hasta, true);

  if (publico && !municipios.length && !estados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o un estado para el informe');
  }

  const base = {
    municipioId:
      consultaTerritorial.municipios.length === 1 ? consultaTerritorial.municipios[0] : null,
    municipios: consultaTerritorial.municipios.length
      ? consultaTerritorial.municipios
      : null,
    estadoEntidad:
      consultaTerritorial.estados.length === 1 ? consultaTerritorial.estados[0] : null,
    estados: consultaTerritorial.estados.length ? consultaTerritorial.estados : null,
    ambito,
    desde,
    hasta,
    ocultas: 'excluir',
    orden: 'reciente'
  };

  // El personal solo puede informar de su ámbito; el público ya viene filtrado
  // por municipio o estado en el propio formulario.
  const consulta = usuario ? filtrosDeAlcance(usuario, base) : base;
  const todas = await repositorio.buscarIncidencias(consulta);

  const filtradas = todas.filter(
    (i) =>
      (!tipos.length || tipos.includes(i.tipoId)) &&
      (!ambitos.length || ambitos.includes(i.ambito || 'urbano'))
  );

  const enriquecidas = enriquecerLista(filtradas);
  const catalogoTipos = await repositorio.todosLosTipos();
  const porId = new Map(catalogoTipos.map((t) => [t.id, t]));
  const catalogoMunicipios = await repositorio.todosMunicipios();
  const municipiosPorId = new Map(catalogoMunicipios.map((m) => [m.id, m]));

  const resumen = {
    total: enriquecidas.length,
    reportadas: enriquecidas.filter((i) => i.estado === 'reportada').length,
    enProceso: enriquecidas.filter((i) => i.estado === 'en_proceso').length,
    resueltas: enriquecidas.filter((i) => i.estado === 'resuelta').length,
    criticas: enriquecidas.filter(
      (i) => i.estado !== 'resuelta' && Number(i.dias) > DIAS_LIMITES.naranja
    ).length,
    viales: enriquecidas.filter((i) => (i.ambito || 'urbano') !== 'urbano').length
  };
  resumen.tasaResolucion =
    resumen.total > 0 ? Number(((resumen.resueltas / resumen.total) * 100).toFixed(1)) : 0;

  const porTipo = [...porId.values()]
    .map((tipo) => {
      const deTipo = enriquecidas.filter((i) => i.tipoId === tipo.id);
      const resueltas = deTipo.filter((i) => i.estado === 'resuelta').length;
      return {
        tipoId: tipo.id,
        nombre: tipo.nombre,
        icono: tipo.icono,
        total: deTipo.length,
        resueltas,
        pendientes: deTipo.length - resueltas,
        porcentaje:
          resumen.total > 0 ? Number(((deTipo.length / resumen.total) * 100).toFixed(1)) : 0
      };
    })
    .filter((fila) => fila.total > 0)
    .sort((a, b) => b.total - a.total);

  const porMunicipio = [...new Set(enriquecidas.map((i) => i.municipioId))]
    .map((id) => {
      const municipio = municipiosPorId.get(id);
      const deMunicipio = enriquecidas.filter((i) => i.municipioId === id);
      return {
        municipioId: id,
        municipio: municipio?.nombre || id,
        estado: municipio?.estado || '',
        total: deMunicipio.length,
        resueltas: deMunicipio.filter((i) => i.estado === 'resuelta').length
      };
    })
    .sort((a, b) => b.total - a.total);

  const detalle = enriquecidas.slice(0, 1500).map((i) => ({
    id: i.id,
    fecha: i.fecha,
    tipo: porId.get(i.tipoId)?.nombre || i.tipoId,
    titulo: i.titulo,
    estado: i.estado,
    municipio: municipiosPorId.get(i.municipioId)?.nombre || i.municipioId,
    estadoEntidad: municipiosPorId.get(i.municipioId)?.estado || i.estadoEntidad || '',
    zona: i.zonaNombre || '',
    ambito: i.ambito || 'urbano',
    viaNombre: i.viaNombre || '',
    kilometro: i.kilometro ?? null,
    lat: i.lat,
    lng: i.lng,
    dias: i.dias,
    ...(publico
      ? {}
      : {
          autor: i.esAnonimo ? 'Anónimo' : i.autorNombre,
          peligrosa: i.peligrosa === true
        })
  }));

  return {
    generadoEn: new Date().toISOString(),
    plantilla: await plantillaInforme(repositorio),
    filtros: {
      municipioId: municipioUnico,
      municipios,
      estadoEntidad: estadoUnico,
      estados,
      ambito,
      ambitos,
      tipos,
      tiposTodos,
      desde: desde ? desde.slice(0, 10) : null,
      hasta: hasta ? hasta.slice(0, 10) : null
    },
    resumen,
    porTipo,
    porMunicipio,
    detalle
  };
}

const COLUMNAS_CSV = [
  'Folio interno',
  'Fecha',
  'Tipo',
  'Título',
  'Estado',
  'Municipio',
  'Entidad',
  'Comunidad',
  'Ámbito',
  'Vía',
  'Km',
  'Latitud',
  'Longitud',
  'Días'
];

function celda(valor) {
  const texto = String(valor ?? '').replace(/"/g, '""');
  return `"${texto}"`;
}

/** CSV con BOM (Excel en español lo abre con acentos correctos). */
export function generarCSV(datos) {
  const lineas = [];
  lineas.push(
    ['Informe de incidencias', datos.generadoEn].map(celda).join(',')
  );
  const filtros = [
    datos.filtros.municipios?.length && `Municipios: ${datos.filtros.municipios.join(', ')}`,
    datos.filtros.estados?.length && `Estados: ${datos.filtros.estados.join(', ')}`,
    datos.filtros.desde && `Desde: ${datos.filtros.desde}`,
    datos.filtros.hasta && `Hasta: ${datos.filtros.hasta}`,
    datos.filtros.ambitos?.length
      ? `Ámbitos: ${datos.filtros.ambitos.join(', ')}`
      : datos.filtros.ambito !== 'todos' && `Ámbito: ${datos.filtros.ambito}`
  ].filter(Boolean);
  if (filtros.length) lineas.push([filtros.join(' · ')].map(celda).join(','));
  lineas.push('');
  lineas.push(COLUMNAS_CSV.map(celda).join(','));
  for (const inc of datos.detalle) {
    lineas.push(
      [
        inc.id,
        inc.fecha,
        inc.tipo,
        inc.titulo,
        inc.estado,
        inc.municipio,
        inc.estadoEntidad,
        inc.zona,
        inc.ambito,
        inc.viaNombre,
        inc.kilometro,
        inc.lat,
        inc.lng,
        inc.dias
      ]
        .map(celda)
        .join(',')
    );
  }
  return `\uFEFF${lineas.join('\r\n')}`;
}

export function nombreArchivo(datos, formato) {
  const partes = ['informe-incidencias'];
  if (datos.filtros.municipioId) partes.push(datos.filtros.municipioId);
  if (datos.filtros.estadoEntidad) {
    partes.push(String(datos.filtros.estadoEntidad).toLowerCase().replace(/\s+/g, '-'));
  }
  const fecha = datos.generadoEn.slice(0, 10);
  return `${partes.join('-')}-${fecha}.${formato}`;
}
