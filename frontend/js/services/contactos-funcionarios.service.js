/** Servicio de contacto directo a funcionarios. */
import { api } from '../core/api.js';

export const contactosFuncionariosService = {
  funcionarios: (municipioId) =>
    api.get(`/contacto/funcionarios?municipioId=${encodeURIComponent(municipioId)}`),
  crear: (datos) => api.post('/contacto/funcionarios', datos),
  solicitarAdmin: (datos) => api.post('/contacto/funcionarios/solicitar-admin', datos),
  mios: () => api.get('/contacto/mios'),
  bandeja: () => api.get('/contacto/directo'),
  detalle: (id) => api.get(`/contacto/directo/${id}`),
  responder: (id, cuerpo, adjuntos = []) =>
    api.post(`/contacto/directo/${id}/mensajes`, { cuerpo, adjuntos }),
  mediaciones: () => api.get('/admin/contacto/mediaciones'),
  atender: (id, datos) => api.post(`/admin/contacto/mediaciones/${id}/atender`, datos)
};
