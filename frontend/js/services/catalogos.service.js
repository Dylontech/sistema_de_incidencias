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
  }
};
