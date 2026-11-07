/** Servicio de incidencias y subida de evidencia. */
import { api } from '../core/api.js';

function cadenaDeFiltros(filtros = {}) {
  const parametros = new URLSearchParams();
  const agregar = (clave, valor) => {
    if (valor !== undefined && valor !== null && valor !== '' && valor !== 'todos') {
      parametros.set(clave, valor);
    }
  };
  agregar('texto', filtros.texto);
  agregar('estado', filtros.estado);
  agregar('tipo', filtros.tipo);
  agregar('color', filtros.color);
  agregar('zona', filtros.zona);
  agregar('ambito', filtros.ambito);
  agregar('municipio', filtros.municipio);
  agregar('orden', filtros.orden);
  agregar('desde', filtros.desde);
  agregar('hasta', filtros.hasta);
  if (filtros.archivo) parametros.set('archivo', '1');
  const cadena = parametros.toString();
  return cadena ? `?${cadena}` : '';
}

export const incidenciasService = {
  listar(filtros) {
    return api.get(`/incidencias${cadenaDeFiltros(filtros)}`);
  },
  /**
   * Puntos ligeros para el mapa. `filtros.bbox` usa el formato de Leaflet
   * (`oeste,sur,este,norte`) y `cluster=1` agrupa por celdas.
   */
  mapa(filtros = {}) {
    const parametros = new URLSearchParams(cadenaDeFiltros(filtros).replace(/^\?/, ''));
    if (filtros.bbox) parametros.set('bbox', filtros.bbox);
    if (filtros.cluster) parametros.set('cluster', '1');
    if (filtros.celdas) parametros.set('celdas', String(filtros.celdas));
    if (filtros.limite) parametros.set('limite', String(filtros.limite));
    const cadena = parametros.toString();
    return api.get(`/incidencias/mapa${cadena ? `?${cadena}` : ''}`);
  },
  /** Capa de condición de vialidades (tramos y calor por zona). */
  vialidades(filtros = {}) {
    const parametros = new URLSearchParams(cadenaDeFiltros(filtros).replace(/^\?/, ''));
    if (filtros.bbox) parametros.set('bbox', filtros.bbox);
    const cadena = parametros.toString();
    return api.get(`/incidencias/vialidades${cadena ? `?${cadena}` : ''}`);
  },
  /** Archivo general agrupado por fecha. */
  archivo(filtros = {}) {
    const parametros = new URLSearchParams(cadenaDeFiltros(filtros).replace(/^\?/, ''));
    const cadena = parametros.toString();
    return api.get(`/incidencias/archivo${cadena ? `?${cadena}` : ''}`);
  },
  /** Expediente JSON de una incidencia resuelta. */
  expediente(id) {
    return api.get(`/incidencias/${encodeURIComponent(id)}/expediente`);
  },
  obtener(id) {
    return api.get(`/incidencias/${id}`);
  },
  crear(datos) {
    return api.post('/incidencias', datos);
  },
  actualizar(id, datos) {
    return api.put(`/incidencias/${id}`, datos);
  },
  cambiarEstado(id, estado) {
    return api.patch(`/incidencias/${id}/estado`, { estado });
  },
  /** Marca o desmarca una incidencia como peligrosa (solo personal). */
  marcarPeligro(id, { peligrosa = true, motivo = '' } = {}) {
    return api.patch(`/incidencias/${id}/peligro`, { peligrosa, motivo });
  },
  resolver(id, { solucion, evidenciaSolucion, costoReparacion = null, desgloseCostos = [] }) {
    return api.post(`/incidencias/${id}/resolucion`, {
      solucion,
      evidenciaSolucion,
      costoReparacion,
      desgloseCostos
    });
  },
  eliminar(id) {
    return api.del(`/incidencias/${id}`);
  },
  comentar(id, texto, adjuntos = []) {
    return api.post(`/incidencias/${id}/comentarios`, { texto, adjuntos });
  },
  comentarios(id, filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.pagina) params.set('pagina', filtros.pagina);
    if (filtros.limite) params.set('limite', filtros.limite);
    const cadena = params.toString();
    return api.get(`/incidencias/${id}/comentarios${cadena ? `?${cadena}` : ''}`);
  },
  borrarComentario(id, comentarioId) {
    return api.del(`/incidencias/${id}/comentarios/${comentarioId}`);
  },
  /** Sube archivos y devuelve sus metadatos (id, url, tipo, tamaño…). */
  async subirEvidencia(archivos) {
    const respuesta = await api.subir('/uploads', archivos);
    return respuesta.evidencia;
  }
};
