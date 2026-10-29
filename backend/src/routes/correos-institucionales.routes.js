/** Rutas del directorio de correos institucionales (solo admin maestro). */
import { Router } from 'express';
import * as correos from '../controllers/correos-institucionales.controller.js';
import { requiereAdmin, requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.use(
  '/admin/correos-institucionales',
  requiereAdmin,
  requierePermiso('gestionar_correos')
);

router.get('/admin/correos-institucionales/busquedas', requiereAdmin, correos.busquedas);
router.get('/admin/correos-institucionales/exportar', requiereAdmin, correos.exportar);
router.post('/admin/correos-institucionales/importar', requiereAdmin, correos.importar);
router.post('/admin/correos-institucionales/invitar', requiereAdmin, correos.invitar);
router.get('/admin/correos-institucionales', requiereAdmin, correos.listar);
router.post('/admin/correos-institucionales', requiereAdmin, correos.crear);
router.put('/admin/correos-institucionales/:id', requiereAdmin, correos.actualizar);
router.post('/admin/correos-institucionales/:id/asignar-clave', requiereAdmin, correos.asignarClave);
router.delete('/admin/correos-institucionales/:id', requiereAdmin, correos.eliminar);

export default router;
