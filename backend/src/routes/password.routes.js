/** Rutas de solicitudes de cambio de contraseña. */
import { Router } from 'express';
import * as password from '../controllers/password.controller.js';
import { requiereEmpleado, requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.get('/password/solicitudes/mias', requiereEmpleado, password.mias);
router.post('/password/solicitudes', requiereEmpleado, password.crear);
// Revisarlas y resolverlas es de la administración (mismo permiso que revelar).
router.get(
  '/password/solicitudes',
  requiereEmpleado,
  requierePermiso('revelar_password_usuarios'),
  password.listar
);
router.post(
  '/password/solicitudes/:id/aprobar',
  requiereEmpleado,
  requierePermiso('revelar_password_usuarios'),
  password.aprobar
);
router.post(
  '/password/solicitudes/:id/rechazar',
  requiereEmpleado,
  requierePermiso('revelar_password_usuarios'),
  password.rechazar
);

export default router;
