/** Documentos legales: lectura pública y edición del admin maestro. */
import { Router } from 'express';
import * as legal from '../controllers/legal.controller.js';
import { requiereAdmin, requierePermiso, requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.use('/admin/legal', requiereAdmin, requierePermiso('gestionar_legal'));

router.get('/legal', legal.listarPublicados);
// Debe ir antes de `/legal/:clave` para que «aceptacion» no se interprete como
// una clave de documento.
router.get('/legal/aceptacion', requiereSesion, legal.estadoAceptacion);
router.post('/legal/aceptar', requiereSesion, legal.aceptar);
router.get('/legal/:clave', legal.obtenerPublicado);

router.get('/admin/legal', requiereAdmin, legal.listarAdmin);
router.get('/admin/legal/:clave', requiereAdmin, legal.obtenerAdmin);
router.put('/admin/legal/:clave/borrador', requiereAdmin, legal.guardarBorrador);
router.post('/admin/legal/:clave/publicar', requiereAdmin, legal.publicar);
router.post('/admin/legal/:clave/restaurar/:version', requiereAdmin, legal.restaurar);
router.get('/admin/legal/:clave/historial', requiereAdmin, legal.historial);

export default router;
