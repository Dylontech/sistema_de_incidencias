/** Servicio de catálogos: municipios, zonas, tipos, usuarios y datos de apoyo. */
import { api } from '../core/api.js';

export const catalogosService = {
  catalogos() {
    return api.get('/catalogos');
  },
  municipios() {
    return api.get('/municipios');
  },
  zonas(municipioId) {
    return api.get(`/municipios/${municipioId}/zonas`);
  },
  resumenZonas(municipioId) {
    return api.get(`/municipios/${municipioId}/zonas/resumen`);
  },
  usuarios() {
    return api.get('/usuarios');
  }
};
