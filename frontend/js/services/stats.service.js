/** Servicio de estadísticas, informes y exportación. */
import { api } from '../core/api.js';

/** Convierte los filtros del panel en query string. */
function conFiltros(ruta, filtros = {}) {
  const params = new URLSearchParams();
  const municipios = filtros.municipios || (filtros.municipioId ? [filtros.municipioId] : []);
  const estados = filtros.estados || [];
  if (municipios.length) params.set('municipios', municipios.join(','));
  if (estados.length) params.set('estados', estados.join(','));
  const query = params.toString();
  return query ? `${ruta}?${query}` : ruta;
}

export const statsService = {
  panel(filtros = {}) {
    return api.get(conFiltros('/stats/panel', filtros));
  },
  informes(filtros = {}) {
    return api.get(conFiltros('/stats/informes', filtros));
  },
  exportacion(filtros = {}) {
    return api.get(conFiltros('/exportacion', filtros));
  },
  limpiar() {
    return api.post('/admin/limpiar');
  },
  importar(respaldo) {
    return api.post('/admin/importar', respaldo);
  },
  subirLogo(archivo) {
    return api.subir('/admin/informes/logo', [archivo], { campo: 'archivo' });
  }
};
