/** Rutas de roles especiales, roles integrados y roles propios. */
import { Router } from 'express';
import * as roles from '../controllers/roles.controller.js';
import { requiereAdmin, requiereEmpleado } from '../middlewares/auth.js';

const router = Router();

router.get('/roles-especiales', requiereEmpleado, roles.listar);
router.get('/roles-especiales/catalogo', requiereEmpleado, roles.catalogo);
router.post('/roles-especiales', requiereAdmin, roles.crear);
router.patch('/roles-especiales/:id', requiereAdmin, roles.actualizar);
router.delete('/roles-especiales/:id', requiereAdmin, roles.eliminar);

// V2.11 — matriz editable de los roles integrados y roles propios.
router.get('/roles', requiereEmpleado, roles.listarRoles);
router.get('/roles/catalogo', requiereEmpleado, roles.catalogoRoles);
router.post('/roles', requiereAdmin, roles.crearRol);
router.patch('/roles/:id', requiereAdmin, roles.actualizarRol);
router.post('/roles/:id/restablecer', requiereAdmin, roles.restablecerRol);
router.delete('/roles/:id', requiereAdmin, roles.eliminarRol);

export default router;
