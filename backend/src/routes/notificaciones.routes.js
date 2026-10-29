/** Rutas de notificaciones. */
import { Router } from 'express';
import * as notificaciones from '../controllers/notificaciones.controller.js';
import {
  requiereAdmin,
  requiereEmpleado,
  requierePermiso,
  requiereSesion
} from '../middlewares/auth.js';

const router = Router();

router.use(requiereSesion);

router.get('/notificaciones', notificaciones.listar);
router.get('/notificaciones/historial', notificaciones.historial);
router.post('/notificaciones/archivar-todas', notificaciones.archivarTodas);
router.get('/notificaciones/preferencias', requiereEmpleado, notificaciones.preferencias);
router.put('/notificaciones/preferencias', requiereEmpleado, notificaciones.guardarPreferencias);
router.post('/notificaciones/marcar-todas', notificaciones.marcarTodas);
router.patch('/notificaciones/:id/leida', notificaciones.marcarLeida);
router.patch('/notificaciones/:id/restaurar', notificaciones.restaurar);
router.patch('/notificaciones/:id/archivar', notificaciones.archivar);
router.delete('/notificaciones/:id', notificaciones.eliminar);

// Configuración global por evento (panel de administración).
router.use(
  '/admin/notificaciones',
  requiereAdmin,
  requierePermiso('configurar_notificaciones')
);
router.get('/admin/notificaciones/config', requiereAdmin, notificaciones.configuracionAdmin);
router.get(
  '/admin/notificaciones/config/:evento',
  requiereAdmin,
  notificaciones.detalleConfiguracion
);
router.put(
  '/admin/notificaciones/config/:evento',
  requiereAdmin,
  notificaciones.guardarConfiguracion
);
router.post('/admin/notificaciones/probar', requiereAdmin, notificaciones.probar);

export default router;
