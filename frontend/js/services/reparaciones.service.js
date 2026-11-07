/** Servicio de reparaciones de campo. */
import { api } from '../core/api.js';

function cadena(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const clave of ['municipio', 'reparacionEstado', 'texto', 'estado', 'tipo', 'orden']) {
    const valor = filtros[clave];
    if (valor !== undefined && valor !== null && valor !== '' && valor !== 'todos') {
      parametros.set(clave, valor);
    }
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

export const reparacionesService = {
  listar(filtros = {}) {
    return api.get(`/incidencias/reparaciones${cadena(filtros)}`);
  },
  cuadrillas() {
    return api.get('/incidencias/reparaciones/cuadrillas');
  },
  asignar(id, datos) {
    return api.post(`/incidencias/${id}/asignar`, datos);
  },
  cambiarEstado(id, datos) {
    return api.patch(`/incidencias/${id}/reparacion`, datos);
  },
  documentos(id, documentos) {
    return api.post(`/incidencias/${id}/reparacion/documentos`, { documentos });
  },
  subirArchivos(archivos) {
    return api.subir('/uploads', archivos);
  }
};
