/** Servicio del generador de publicaciones para redes. */
import { api, BASE, token } from '../core/api.js';

function consulta(filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
  }
  const cadena = params.toString();
  return cadena ? `?${cadena}` : '';
}

export const publicidadService = {
  catalogo: () => api.get('/admin/publicidad/plantillas'),
  listar: (filtros) => api.get(`/admin/publicidad${consulta(filtros)}`),
  generar: (datos) => api.post('/admin/publicidad/generar', datos),
  simular: (datos) => api.post('/admin/publicidad/simular', datos),
  actualizar: (id, datos) => api.patch(`/admin/publicidad/${id}`, datos),
  eliminar: (id) => api.del(`/admin/publicidad/${id}`),
  qrInfo: (codigo) => api.get(`/publico/qr/${encodeURIComponent(codigo)}`),
  escanearQr: (codigo, datos) =>
    api.post(`/publico/qr/${encodeURIComponent(codigo)}/escaneo`, datos),
  generarQr: (datos) => api.post('/admin/publicidad/qr', datos),
  guardarCodigoQr: (datos) => api.post('/admin/publicidad/qr/codigos', datos),
  subirImagen: (archivo) =>
    api.subir('/admin/publicidad/assets', [archivo], { campo: 'archivo' }),
  async descargarQrPdf(datos, nombre = 'codigo-qr.pdf') {
    const respuesta = await fetch(`${BASE}/admin/publicidad/qr/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.leer()}`
      },
      body: JSON.stringify(datos)
    });
    if (!respuesta.ok) throw new Error('No se pudo generar el PDF');
    const blob = await respuesta.blob();
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  },
  estadisticas: (filtros = {}) => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
    });
    const cadena = params.toString();
    return api.get(`/admin/publicidad/estadisticas${cadena ? `?${cadena}` : ''}`);
  },
  urlDescarga: (id) => `${BASE}/admin/publicidad/${id}/descargar`,
  async descargar(id, nombre = 'publicacion.svg') {
    const respuesta = await fetch(this.urlDescarga(id), {
      headers: { Authorization: `Bearer ${token.leer()}` }
    });
    if (!respuesta.ok) throw new Error('No se pudo descargar la publicación');
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
