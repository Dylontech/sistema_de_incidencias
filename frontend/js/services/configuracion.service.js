/** Servicio de configuración. */
import { api } from '../core/api.js';

export const configuracionService = {
  publica: () => api.get('/configuracion/publica'),
  listar: () => api.get('/admin/configuracion'),
  guardar: (cambios) => api.put('/admin/configuracion', cambios),
  verificacion: () => api.get('/admin/verificacion-cuentas'),
  guardarVerificacion: (cambios) => api.put('/admin/verificacion-cuentas', cambios)
};
