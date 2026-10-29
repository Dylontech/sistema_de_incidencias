/**
 * Rutas de términos y condiciones.
 *   GET  /api/terminos  -> público, devuelve el HTML publicado
 *   PUT  /api/terminos  -> solo admin, actualiza el contenido
 */
import { Router } from 'express';
import { requiereAdmin } from '../middlewares/auth.js';
import { TerminosController } from '../controllers/terminos.controller.js';

const router = Router();

router.get('/', TerminosController.obtener);
router.put('/', requiereAdmin, TerminosController.actualizar);

export default router;
