/** Reclamaciones de incidencias resueltas. */
import { api } from '../core/api.js';

export const reclamacionesService = {
  crear(incidenciaId, { motivo, detalle }) {
    return api.post(`/incidencias/${encodeURIComponent(incidenciaId)}/reclamaciones`, {
      motivo,
      detalle
    });
  },
  listar({ estado = '' } = {}) {
    const query = estado ? `?estado=${encodeURIComponent(estado)}` : '';
    return api.get(`/reclamaciones${query}`);
  },
  obtener(id) {
    return api.get(`/reclamaciones/${encodeURIComponent(id)}`);
  },
  delegar(id, delegadoA) {
    return api.patch(`/reclamaciones/${encodeURIComponent(id)}/delegar`, { delegadoA });
  },
  resolver(id, { decision, respuesta }) {
    return api.patch(`/reclamaciones/${encodeURIComponent(id)}/resolver`, {
      decision,
      respuesta
    });
  },
  informe(id, motor = null) {
    const query = motor && motor !== 'auto' ? `?pdf=${encodeURIComponent(motor)}` : '';
    return api.blob(`/reclamaciones/${encodeURIComponent(id)}/informe${query}`);
  }
};
