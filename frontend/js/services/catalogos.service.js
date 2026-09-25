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
  usuarios() {
    return api.get('/usuarios');
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
