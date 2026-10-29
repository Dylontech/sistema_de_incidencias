/** Servicio de roles especiales. */
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
  }
};
