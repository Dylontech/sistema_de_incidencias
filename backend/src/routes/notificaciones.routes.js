/** Rutas de notificaciones. */
import { Router } from 'express';
import * as notificaciones from '../controllers/notificaciones.controller.js';
import { requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.use(requiereSesion);

router.get('/notificaciones', notificaciones.listar);
router.post('/notificaciones/marcar-todas', notificaciones.marcarTodas);
router.patch('/notificaciones/:id/leida', notificaciones.marcarLeida);
router.delete('/notificaciones/:id', notificaciones.eliminar);

export default router;
