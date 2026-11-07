/** Rutas de la bitácora de auditoría. */
import { Router } from 'express';
import * as auditoria from '../controllers/auditoria.controller.js';
import { requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.get('/admin/auditoria', requierePermiso('ver_auditoria'), auditoria.listar);
router.get('/admin/auditoria/informe', requierePermiso('ver_auditoria'), auditoria.informe);

export default router;
