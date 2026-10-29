/** Rutas de firmas de incidencias y recolecciones municipales. */
import { Router } from 'express';
import * as firmas from '../controllers/firmas.controller.js';
import { requiereAdmin, requierePermiso, requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.use('/admin/firmas', requiereAdmin, requierePermiso('ver_firmas'));

router.use(requiereSesion);

router.get('/incidencias/:id/firmas', firmas.resumenIncidencia);
router.get('/incidencias/:id/firmas/export', firmas.exportar);
router.post('/incidencias/:id/firmas', firmas.firmar);
router.delete('/incidencias/:id/firmas/mia', firmas.retirar);
router.patch('/incidencias/:id/meta-firmas', firmas.fijarMeta);
router.post('/incidencias/:id/firmas/solicitar', firmas.solicitarAdmin);

router.get('/firmas/municipio', firmas.listarMunicipio);
router.post('/firmas/municipio', firmas.crearMunicipal);
router.post('/firmas/:id/firmar', firmas.firmarMunicipal);
router.post('/firmas/:id/solicitar', firmas.solicitarAdmin);
router.get('/firmas/:id/export', firmas.exportar);

router.get('/admin/firmas', requiereAdmin, firmas.listarAdmin);
router.get('/admin/firmas/:id', requiereAdmin, firmas.detalleAdmin);
router.post('/admin/firmas/:id/enviar', requiereAdmin, firmas.enviar);

export default router;
