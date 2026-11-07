/** Servicio de catálogos: municipios, zonas, tipos, usuarios y datos de apoyo. */
import { api } from '../core/api.js';

export const catalogosService = {
  catalogos() {
    return api.get('/catalogos');
  },
  municipios() {
    return api.get('/municipios');
  },
  /** Municipio concreto con su contorno (el listado llega sin polígonos). */
  municipio(id) {
    return api.get(`/municipios/${id}`);
  },
  /** Municipio que contiene unas coordenadas (geolocalización). */
  municipioEnUbicacion(lat, lng) {
    return api.get(`/municipios/ubicacion?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
  },
  zonas(municipioId) {
    return api.get(`/municipios/${municipioId}/zonas`);
  },
  /** Municipios que tocan las fronteras del indicado (para saltar entre ellos). */
  colindantes(municipioId) {
    return api.get(`/municipios/${municipioId}/colindantes`);
  },
  resumenZonas(municipioId) {
    return api.get(`/municipios/${municipioId}/zonas/resumen`);
  },
  /** Municipios visibles con conteos de carga de trabajo (solo administración). */
  resumenMunicipios() {
    return api.get('/admin/municipios/resumen');
  },
  fichaMunicipio(id) {
    return api.get(`/municipios/${id}/ficha`);
  },
  guardarFichaMunicipio(id, datos) {
    return api.put(`/municipios/${id}/ficha`, datos);
  },
  aprobarFichaMunicipio(id) {
    return api.post(`/municipios/${id}/ficha/aprobar`, {});
  },
  rechazarFichaMunicipio(id, motivo) {
    return api.post(`/municipios/${id}/ficha/rechazar`, { motivo });
  },
  usuarios(tipo = 'personal') {
    return api.get(`/usuarios?tipo=${encodeURIComponent(tipo)}`);
  },
  /** Alta de una cuenta del personal (solo administrador). */
  crearUsuario(datos) {
    return api.post('/usuarios', datos);
  },
  /** Edición de una cuenta del personal (solo administrador). */
  actualizarUsuario(id, datos) {
    return api.patch(`/usuarios/${id}`, datos);
  },
  /** Baja lógica de una cuenta del personal. */
  eliminarUsuario(id) {
    return api.delete(`/usuarios/${id}`);
  },
  reactivarUsuario(id) {
    return api.post(`/usuarios/${id}/reactivar`, {});
  },
  /** Consulta auditada de la contraseña de una cuenta. */
  passwordUsuario(id, motivo = '') {
    const query = motivo ? `?motivo=${encodeURIComponent(motivo)}` : '';
    return api.get(`/usuarios/${id}/password${query}`);
  },
  /** Genera una contraseña temporal nueva (o fija la indicada). */
  restablecerPassword(id, datos = {}) {
    return api.post(`/usuarios/${id}/password/restablecer`, datos);
  },
  /** Estado de la clave de activación de una cuenta. */
  claveUsuario(id) {
    return api.get(`/usuarios/${id}/clave`);
  },
  /** Renueva la clave de activación (solo administración). */
  renovarClaveUsuario(id, datos = {}) {
    return api.post(`/usuarios/${id}/clave/renovar`, datos);
  }
};
