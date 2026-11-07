/** Servicio del catálogo administrativo de vialidades. */
import { api } from '../core/api.js';

function consulta(filtros = {}) {
  const params = new URLSearchParams();
  const agregar = (clave, valor) => {
    if (valor !== undefined && valor !== null && valor !== '' && valor !== 'todas') {
      params.set(clave, valor);
    }
  };
  agregar('municipio', filtros.municipioId || filtros.municipio);
  agregar('tipo', filtros.tipo);
  agregar('fuente', filtros.fuente);
  agregar('texto', filtros.texto);
  if (filtros.desactualizadas) params.set('desactualizadas', '1');
  if (filtros.sinVerificar) params.set('sinVerificar', '1');
  return params.toString();
}

export const vialidadesService = {
  listar(filtros = {}) {
    const cadena = consulta(filtros);
    return api.get(`/admin/vialidades${cadena ? `?${cadena}` : ''}`);
  },
  crear(datos) {
    return api.post('/admin/vialidades', datos);
  },
  actualizar(id, datos) {
    return api.patch(`/admin/vialidades/${encodeURIComponent(id)}`, datos);
  },
  verificar(id) {
    return api.post(`/admin/vialidades/${encodeURIComponent(id)}/verificar`, {});
  },
  eliminar(id) {
    return api.delete(`/admin/vialidades/${encodeURIComponent(id)}`);
  },
  importar(datos) {
    return api.post('/admin/vialidades/importar', datos);
  },
  importarOsm(datos) {
    return api.post('/admin/vialidades/importar-osm', datos);
  }
};
