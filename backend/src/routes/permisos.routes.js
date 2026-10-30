/** Rutas de solicitudes de permisos. */
import { Router } from 'express';
import * as permisos from '../controllers/permisos.controller.js';
import { requiereEmpleado, requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.get('/permisos/solicitudes/mias', requiereEmpleado, permisos.mias);
router.post('/permisos/solicitudes', requiereEmpleado, permisos.crear);
// Resolverlas es de la administración o de quien reciba el permiso concreto;
// el servicio vuelve a comprobar el alcance y la no escalada.
router.get(
  '/permisos/solicitudes',
  requiereEmpleado,
  requierePermiso('ver_solicitudes_permisos'),
  permisos.listar
);
router.post(
  '/permisos/solicitudes/:id/aprobar',
  requiereEmpleado,
  requierePermiso('aprobar_solicitudes_permisos'),
  permisos.aprobar
);
router.post(
  '/permisos/solicitudes/:id/rechazar',
  requiereEmpleado,
  requierePermiso('rechazar_solicitudes_permisos'),
  permisos.rechazar
);

export default router;
