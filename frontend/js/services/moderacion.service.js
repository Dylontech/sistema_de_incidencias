/** Servicio de moderación: denuncias, cola de trabajo, ocultamiento y sanciones. */
import { api } from '../core/api.js';

function cadenaDeParametros(filtros = {}) {
  const parametros = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') parametros.set(clave, valor);
  });
  const cadena = parametros.toString();
  return cadena ? `?${cadena}` : '';
}

export const moderacionService = {
  /** Denuncia un reporte o uno de sus comentarios. Cualquier sesión. */
  denunciar(id, { motivo, detalle = '', comentarioId = null } = {}) {
    return api.post(`/incidencias/${id}/denuncias`, {
      motivo,
      detalle,
      ...(comentarioId ? { comentarioId } : {})
    });
  },

  /** Cola de moderación: denuncias agrupadas por contenido. */
  cola({ estado = 'pendiente', municipio = null } = {}) {
    return api.get(`/moderacion/denuncias${cadenaDeParametros({ estado, municipio })}`);
  },

  resumen(municipio = null) {
    return api.get(`/moderacion/resumen${cadenaDeParametros({ municipio })}`);
  },

  /** Cierra la denuncia aplicando la decisión (descartar, ocultar, advertir…). */
  resolver(id, { accion = 'descartar', motivo = '', resolucion = '', hasta = null } = {}) {
    return api.patch(`/moderacion/denuncias/${id}`, { accion, motivo, resolucion, hasta });
  },

  ocultar(id, { oculta = true, motivo = '' } = {}) {
    return api.patch(`/moderacion/incidencias/${id}/ocultar`, { oculta, motivo });
  },

  ocultarComentario(incidenciaId, comentarioId, { oculto = true, motivo = '' } = {}) {
    return api.patch(
      `/moderacion/incidencias/${incidenciaId}/comentarios/${comentarioId}/ocultar`,
      { oculto, motivo }
    );
  },

  advertir(id, { motivo = '' } = {}) {
    return api.post(`/moderacion/incidencias/${id}/advertir`, { motivo });
  },

  /** Cuentas advertidas o suspendidas que el moderador puede gestionar. */
  sanciones() {
    return api.get('/moderacion/cuentas');
  },

  cuenta(username) {
    return api.get(`/moderacion/cuentas/${username}`);
  },

  suspender(username, { motivo = '', hasta = null } = {}) {
    return api.post(`/moderacion/cuentas/${username}/suspension`, { motivo, hasta });
  },

  reactivar(username) {
    return api.del(`/moderacion/cuentas/${username}/suspension`);
  }
};
