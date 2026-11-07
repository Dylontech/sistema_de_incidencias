/**
 * Bloqueos personales entre cuentas.
 *
 * No requieren permisos especiales: cualquier cuenta con sesión puede dejar
 * de recibir mensajes de otra persona y deshacerlo cuando quiera.
 */
import { Router } from 'express';
import * as bloqueos from '../controllers/bloqueos.controller.js';
import { requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.get('/bloqueos', requiereSesion, bloqueos.listar);
router.post('/bloqueos', requiereSesion, bloqueos.bloquear);
router.delete('/bloqueos/:id', requiereSesion, bloqueos.desbloquear);

export default router;
