/** Rutas de respaldos (solo admin maestro). */
import { Router } from 'express';
import * as respaldos from '../controllers/respaldos.controller.js';
import { requiereAdmin, requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.use('/admin/respaldos', requiereAdmin, requierePermiso('gestionar_respaldos'));

router.get('/admin/respaldos/estadisticas', requiereAdmin, respaldos.estadisticas);
router.get('/admin/respaldos', requiereAdmin, respaldos.listar);
router.post('/admin/respaldos', requiereAdmin, respaldos.crear);
router.get('/admin/respaldos/:id', requiereAdmin, respaldos.detalle);
router.get('/admin/respaldos/:id/descargar', requiereAdmin, respaldos.descargar);
router.post('/admin/respaldos/:id/restaurar', requiereAdmin, respaldos.restaurar);
router.delete('/admin/respaldos/:id', requiereAdmin, respaldos.eliminar);

export default router;
