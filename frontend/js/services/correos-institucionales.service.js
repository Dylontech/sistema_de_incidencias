/** Servicio del directorio de correos institucionales. */
import { api, BASE, token } from '../core/api.js';

function consulta(filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
  }
  const cadena = params.toString();
  return cadena ? `?${cadena}` : '';
}

export const correosInstitucionalesService = {
  listar: (filtros) => api.get(`/admin/correos-institucionales${consulta(filtros)}`),
  crear: (datos) => api.post('/admin/correos-institucionales', datos),
  actualizar: (id, datos) => api.put(`/admin/correos-institucionales/${id}`, datos),
  eliminar: (id) => api.del(`/admin/correos-institucionales/${id}`),
  importar: (csv) => api.post('/admin/correos-institucionales/importar', { csv }),
  busquedas: (municipioId) =>
    api.get(`/admin/correos-institucionales/busquedas${municipioId ? `?municipioId=${encodeURIComponent(municipioId)}` : ''}`),
  invitar: (datos) => api.post('/admin/correos-institucionales/invitar', datos),
  asignarClave: (id) => api.post(`/admin/correos-institucionales/${id}/asignar-clave`, {}),
  urlExportar: (filtros) => `${BASE}/admin/correos-institucionales/exportar${consulta(filtros)}`,
  async exportar(filtros, nombre = 'correos-institucionales.csv') {
    const respuesta = await fetch(this.urlExportar(filtros), {
      headers: { Authorization: `Bearer ${token.leer()}` }
    });
    if (!respuesta.ok) throw new Error('No se pudo exportar el directorio');
    const blob = await respuesta.blob();
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  }
};
