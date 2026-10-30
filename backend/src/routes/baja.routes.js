/** Rutas de solicitudes de baja de cuentas del personal. */
import { Router } from 'express';
import * as baja from '../controllers/baja.controller.js';
import { requiereAlgunaAdmin, requiereEmpleado } from '../middlewares/auth.js';

const router = Router();

router.get('/baja/solicitudes/mias', requiereEmpleado, baja.mias);
// El servicio comprueba el permiso de gestión y el ámbito territorial.
router.post('/baja/solicitudes', requiereEmpleado, baja.crear);
router.get('/baja/solicitudes', requiereAlgunaAdmin, baja.listar);
router.post('/baja/solicitudes/:id/aprobar', requiereAlgunaAdmin, baja.aprobar);
router.post('/baja/solicitudes/:id/rechazar', requiereAlgunaAdmin, baja.rechazar);

export default router;
