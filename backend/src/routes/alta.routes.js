/** Rutas de solicitudes de alta de cuentas del personal. */
import { Router } from 'express';
import * as alta from '../controllers/alta.controller.js';
import { requiereAlgunaAdmin, requiereEmpleado } from '../middlewares/auth.js';

const router = Router();

router.get('/alta/solicitudes/mias', requiereEmpleado, alta.mias);
// El servicio comprueba el permiso `crear_usuarios` y el territorio.
router.post('/alta/solicitudes', requiereEmpleado, alta.crear);
router.get('/alta/solicitudes', requiereAlgunaAdmin, alta.listar);
router.post('/alta/solicitudes/:id/aprobar', requiereAlgunaAdmin, alta.aprobar);
router.post('/alta/solicitudes/:id/rechazar', requiereAlgunaAdmin, alta.rechazar);

export default router;
