/** Servicio de firmas y recolecciones. */
import { api, BASE, token } from '../core/api.js';

async function descargar(recoleccionId, formato = 'csv') {
  const respuesta = await fetch(`${BASE}/firmas/${recoleccionId}/export?formato=${formato}`, {
    headers: { Authorization: `Bearer ${token.leer()}` }
  });
  if (!respuesta.ok) throw new Error('No se pudo descargar el documento de firmas');
  const blob = await respuesta.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `firmas-${String(recoleccionId).slice(0, 8)}.${formato}`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

export const firmasService = {
  resumen: (incidenciaId) => api.get(`/incidencias/${incidenciaId}/firmas`),
  firmar: (incidenciaId) => api.post(`/incidencias/${incidenciaId}/firmas`, {}),
  retirar: (incidenciaId) => api.del(`/incidencias/${incidenciaId}/firmas/mia`),
  fijarMeta: (incidenciaId, meta) => api.patch(`/incidencias/${incidenciaId}/meta-firmas`, { meta }),
  solicitarAdmin: (incidenciaId, nota) =>
    api.post(`/incidencias/${incidenciaId}/firmas/solicitar`, { nota }),
  listarMunicipio: () => api.get('/firmas/municipio'),
  listarAdmin: () => api.get('/admin/firmas'),
  detalleAdmin: (id) => api.get(`/admin/firmas/${id}`),
  enviar: (id, datos) => api.post(`/admin/firmas/${id}/enviar`, datos),
  crearMunicipal: (datos) => api.post('/firmas/municipio', datos),
  firmarMunicipal: (id) => api.post(`/firmas/${id}/firmar`, {}),
  descargar,
  urlExport: (id, formato = 'csv') => `${BASE}/firmas/${id}/export?formato=${formato}`
};
