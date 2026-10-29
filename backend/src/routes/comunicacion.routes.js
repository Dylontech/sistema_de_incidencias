/** Rutas de contacto, sugerencias, mensajería interna y campañas. */
import { Router } from 'express';
import * as mensajeria from '../controllers/mensajeria.controller.js';
import * as campanas from '../controllers/campanas.controller.js';
import {
  requiereAlgunaAdmin,
  requiereAdmin,
  requiereEscritura,
  requierePersonal,
  requierePermiso
} from '../middlewares/auth.js';

const router = Router();

router.use('/admin', requiereAdmin, requierePermiso('gestionar_publicidad'));

// IMPORTANTE: este router se monta en la raíz de /api, así que el control de
// acceso va ruta por ruta. Un `router.use(requierePersonal)` aquí bloquearía
// también las incidencias públicas que se registran después.

router.get('/contacto', requierePersonal, mensajeria.listarContacto);
router.post(
  '/contacto/:id/responder',
  requierePersonal,
  requiereEscritura,
  mensajeria.responderContacto
);

router.get('/sugerencias', requierePersonal, requiereAlgunaAdmin, mensajeria.listarSugerencias);
router.post(
  '/sugerencias/:id/responder',
  requierePersonal,
  requiereAlgunaAdmin,
  mensajeria.responderSugerencia
);

// `no-leidos` va antes de `/:hilo` para que no se interprete como un id.
router.get('/mensajes/no-leidos', requierePersonal, mensajeria.noLeidos);
router.get('/mensajes', requierePersonal, mensajeria.bandeja);
router.get('/mensajes/:hilo', requierePersonal, mensajeria.hilo);
router.post('/mensajes', requierePersonal, requiereEscritura, mensajeria.enviarMensaje);
router.patch('/mensajes/:id/leido', requierePersonal, mensajeria.marcarLeido);

/* ------------------- campañas de promoción (solo admin) ------------------ */

router.get('/admin/campanas', requiereAdmin, campanas.listarCampanas);
router.get('/admin/campanas/resumen', requiereAdmin, campanas.resumen);
router.get('/admin/campanas/:id', requiereAdmin, campanas.detalleCampana);
router.post('/admin/campanas', requiereAdmin, campanas.crearCampana);
router.put('/admin/campanas/:id', requiereAdmin, campanas.actualizarCampana);
router.post('/admin/campanas/:id/prueba', requiereAdmin, campanas.enviarPrueba);
router.post('/admin/campanas/:id/enviar', requiereAdmin, campanas.enviarCampana);
router.get('/admin/suscripciones', requiereAdmin, campanas.listarSuscripciones);

export default router;
