/** Rutas de administración de claves de acceso. */
import { Router } from 'express';
import * as claves from '../controllers/claves.controller.js';
import { requiereAlgunPermiso, requierePermiso } from '../middlewares/auth.js';

const router = Router();

// La pestaña «Avisos por clave» también necesita listar claves: se acepta ver
// claves o ver avisos, nunca modificar la clave.
router.get('/admin/claves', requiereAlgunPermiso(['ver_claves', 'ver_avisos_clave']), claves.listar);
router.get(
  '/admin/claves/renovaciones',
  requierePermiso('editar_claves'),
  claves.listarRenovaciones
);
router.post(
  '/admin/claves/renovaciones/:id/aprobar',
  requierePermiso('editar_claves'),
  claves.resolverRenovacion
);
router.post(
  '/admin/claves/renovaciones/:id/rechazar',
  requierePermiso('editar_claves'),
  claves.resolverRenovacion
);
router.post('/admin/claves', requierePermiso('crear_claves'), claves.crear);
router.patch('/admin/claves/:id', requierePermiso('editar_claves'), claves.actualizar);
router.post('/admin/claves/:id/renovar', requierePermiso('editar_claves'), claves.renovar);
router.post('/admin/claves/:id/revocar', requierePermiso('editar_claves'), claves.revocar);
router.delete('/admin/claves/:id', requierePermiso('eliminar_claves'), claves.eliminar);
router.put(
  '/admin/claves/:id/notificaciones',
  requierePermiso('editar_avisos_clave'),
  claves.configurarNotificaciones
);
router.post(
  '/admin/claves/:id/notificaciones/revocar',
  requierePermiso('editar_avisos_clave'),
  claves.revocarNotificaciones
);
router.post(
  '/admin/claves/:id/notificaciones/reactivar',
  requierePermiso('editar_avisos_clave'),
  claves.reactivarNotificaciones
);

export default router;
