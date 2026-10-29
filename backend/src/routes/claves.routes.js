/** Rutas de administración de claves de acceso. */
import { Router } from 'express';
import * as claves from '../controllers/claves.controller.js';
import { requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.get('/admin/claves', requierePermiso('gestionar_claves'), claves.listar);
router.post('/admin/claves', requierePermiso('gestionar_claves'), claves.crear);
router.post('/admin/claves/:id/revocar', requierePermiso('gestionar_claves'), claves.revocar);
router.delete('/admin/claves/:id', requierePermiso('gestionar_claves'), claves.eliminar);

export default router;
