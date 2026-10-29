/** Rutas de roles especiales. */
import { Router } from 'express';
import * as roles from '../controllers/roles.controller.js';
import { requiereAdmin, requiereEmpleado } from '../middlewares/auth.js';

const router = Router();

router.get('/roles-especiales', requiereEmpleado, roles.listar);
router.get('/roles-especiales/catalogo', requiereEmpleado, roles.catalogo);
router.post('/roles-especiales', requiereAdmin, roles.crear);
router.patch('/roles-especiales/:id', requiereAdmin, roles.actualizar);
router.delete('/roles-especiales/:id', requiereAdmin, roles.eliminar);

export default router;
