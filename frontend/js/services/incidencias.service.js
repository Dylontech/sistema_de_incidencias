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
  agregar('orden', filtros.orden);
  const cadena = parametros.toString();
  return cadena ? `?${cadena}` : '';
}

export const incidenciasService = {
  listar(filtros) {
    return api.get(`/incidencias${cadenaDeFiltros(filtros)}`);
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
  resolver(id, { solucion, evidenciaSolucion }) {
    return api.post(`/incidencias/${id}/resolucion`, { solucion, evidenciaSolucion });
  },
  eliminar(id) {
    return api.del(`/incidencias/${id}`);
  },
  comentar(id, texto) {
    return api.post(`/incidencias/${id}/comentarios`, { texto });
  },
  /** Sube archivos y devuelve sus metadatos (id, url, tipo, tamaño…). */
  async subirEvidencia(archivos) {
    const respuesta = await api.subir('/uploads', archivos);
    return respuesta.evidencia;
  }
};
