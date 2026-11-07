/** Rutas del catálogo administrativo de vialidades. */
import { Router } from 'express';
import * as vialidades from '../controllers/vialidades.controller.js';
import { requiereAlgunaAdmin, requierePermiso } from '../middlewares/auth.js';
import { limiteEscritura } from '../middlewares/limitadores.js';

const router = Router();

router.use(
  '/admin/vialidades',
  requiereAlgunaAdmin,
  requierePermiso('gestionar_vialidades')
);

router.get('/admin/vialidades', vialidades.listar);
router.post('/admin/vialidades', limiteEscritura, vialidades.crear);
router.post('/admin/vialidades/importar', limiteEscritura, vialidades.importar);
router.post('/admin/vialidades/importar-osm', limiteEscritura, vialidades.importarOsm);
router.post('/admin/vialidades/:id/verificar', limiteEscritura, vialidades.verificar);
router.patch('/admin/vialidades/:id', limiteEscritura, vialidades.actualizar);
router.delete('/admin/vialidades/:id', vialidades.eliminar);

export default router;
