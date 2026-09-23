/** Rutas de estadísticas, informes y tareas administrativas. */
import { Router } from 'express';
import * as stats from '../controllers/stats.controller.js';
import * as admin from '../controllers/admin.controller.js';
import { requiereAdmin, requiereEmpleado } from '../middlewares/auth.js';

const router = Router();

router.get('/stats/panel', requiereEmpleado, stats.panelAdmin);
router.get('/stats/informes', requiereEmpleado, stats.informes);
router.get('/exportacion', requiereEmpleado, stats.exportacion);

router.post('/admin/limpiar', requiereAdmin, admin.limpiar);
router.post('/admin/importar', requiereAdmin, admin.importar);

export default router;
