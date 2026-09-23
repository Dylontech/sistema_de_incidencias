/** Servicio de estadísticas, informes y exportación. */
import { api } from '../core/api.js';

export const statsService = {
  panel() {
    return api.get('/stats/panel');
  },
  informes() {
    return api.get('/stats/informes');
  },
  exportacion() {
    return api.get('/exportacion');
  },
  limpiar() {
    return api.post('/admin/limpiar');
  },
  importar(respaldo) {
    return api.post('/admin/importar', respaldo);
  }
};
