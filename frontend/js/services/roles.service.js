/** Servicio de roles: especiales, integrados (matriz editable) y propios. */
import { api } from '../core/api.js';

export const rolesService = {
  listar() {
    return api.get('/roles-especiales');
  },
  catalogo() {
    return api.get('/roles-especiales/catalogo');
  },
  crear(datos) {
    return api.post('/roles-especiales', datos);
  },
  actualizar(id, datos) {
    return api.patch(`/roles-especiales/${id}`, datos);
  },
  eliminar(id) {
    return api.del(`/roles-especiales/${id}`);
  },
  // V2.11 — roles del sistema y roles propios.
  listarRoles() {
    return api.get('/roles');
  },
  catalogoAsignable() {
    return api.get('/roles/catalogo');
  },
  crearRol(datos) {
    return api.post('/roles', datos);
  },
  actualizarRol(id, datos) {
    return api.patch(`/roles/${id}`, datos);
  },
  restablecerRol(id) {
    return api.post(`/roles/${id}/restablecer`, {});
  },
  eliminarRol(id) {
    return api.del(`/roles/${id}`);
  }
};
