/** Servicio de estadísticas, informes y exportación. */
import { api } from '../core/api.js';

/** El municipio activo viaja como query: los informes se acotan a él. */
function conMunicipio(ruta, municipioId) {
  return municipioId ? `${ruta}?municipio=${encodeURIComponent(municipioId)}` : ruta;
}

export const statsService = {
  panel(municipioId) {
    return api.get(conMunicipio('/stats/panel', municipioId));
  },
  informes(municipioId) {
    return api.get(conMunicipio('/stats/informes', municipioId));
  },
  exportacion(municipioId) {
    return api.get(conMunicipio('/exportacion', municipioId));
  },
  limpiar() {
    return api.post('/admin/limpiar');
  },
  importar(respaldo) {
    return api.post('/admin/importar', respaldo);
  }
};
