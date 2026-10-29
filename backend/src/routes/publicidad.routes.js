/** Rutas de publicidad en redes (solo admin maestro). */
import { Router } from 'express';
import * as publicidad from '../controllers/publicidad.controller.js';
import { requiereAdmin, requierePermiso } from '../middlewares/auth.js';
import { recibirImagenPublicidad } from '../middlewares/upload.js';
import { limiteSubidas } from '../middlewares/limitadores.js';

const router = Router();

router.use('/admin/publicidad', requiereAdmin, requierePermiso('gestionar_publicidad'));

router.get('/admin/publicidad/plantillas', requiereAdmin, publicidad.catalogo);
router.post('/admin/publicidad/qr', requiereAdmin, publicidad.generarQr);
router.post('/admin/publicidad/qr/pdf', requiereAdmin, publicidad.descargarQrPdf);
router.post('/admin/publicidad/qr/codigos', requiereAdmin, publicidad.guardarCodigoQr);
router.post(
  '/admin/publicidad/assets',
  requiereAdmin,
  limiteSubidas,
  recibirImagenPublicidad,
  publicidad.subirAsset
);
router.get('/admin/publicidad', requiereAdmin, publicidad.listar);
router.post('/admin/publicidad/simular', requiereAdmin, publicidad.simular);
router.post('/admin/publicidad/generar', requiereAdmin, publicidad.generar);
router.get('/admin/publicidad/estadisticas', requiereAdmin, publicidad.estadisticasQr);
router.get('/admin/publicidad/:id/estadisticas', requiereAdmin, publicidad.estadisticasQr);
router.get('/admin/publicidad/:id', requiereAdmin, publicidad.detalle);
router.patch('/admin/publicidad/:id', requiereAdmin, publicidad.actualizar);
router.get('/admin/publicidad/:id/descargar', requiereAdmin, publicidad.descargar);
router.delete('/admin/publicidad/:id', requiereAdmin, publicidad.eliminar);

export default router;
