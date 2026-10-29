/** Rutas de solicitudes de permisos. */
import { Router } from 'express';
import * as permisos from '../controllers/permisos.controller.js';
import { requiereAlgunaAdmin, requiereEmpleado } from '../middlewares/auth.js';

const router = Router();

router.get('/permisos/solicitudes/mias', requiereEmpleado, permisos.mias);
router.post('/permisos/solicitudes', requiereEmpleado, permisos.crear);
router.get('/permisos/solicitudes', requiereAlgunaAdmin, permisos.listar);
router.post('/permisos/solicitudes/:id/aprobar', requiereAlgunaAdmin, permisos.aprobar);
router.post('/permisos/solicitudes/:id/rechazar', requiereAlgunaAdmin, permisos.rechazar);

export default router;
