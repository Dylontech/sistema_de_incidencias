/** Rutas de monitoreo de sesiones. */
import { Router } from 'express';
import * as sesiones from '../controllers/sesiones.controller.js';
import { requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.get('/admin/sesiones', requierePermiso('ver_monitoreo'), sesiones.listar);
router.delete('/admin/sesiones/:id', requierePermiso('ver_monitoreo'), sesiones.revocar);

export default router;
