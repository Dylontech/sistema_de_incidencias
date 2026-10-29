/** Rutas del historial de folios. */
import { Router } from 'express';
import * as folios from '../controllers/folios.controller.js';
import { requiereAdmin, requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.use(requiereSesion);

router.get('/folios/mios', folios.mios);
router.get('/admin/folios', requiereAdmin, folios.todos);
router.get('/folios/:folio', folios.detalle);

export default router;
