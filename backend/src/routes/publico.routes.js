/** Rutas públicas: solicitudes de informe y formularios de contacto. */
import { Router } from 'express';
import * as publico from '../controllers/publico.controller.js';
import * as publicidad from '../controllers/publicidad.controller.js';
import * as acceso from '../controllers/solicitudes-acceso.controller.js';
import {
  limiteConsultasPublicas,
  limiteSolicitudesPublicas
} from '../middlewares/limitadores.js';
import { requiereCuenta } from '../middlewares/auth.js';
import { recibirDocumentosSolicitud } from '../middlewares/upload.js';

const router = Router();

router.get('/municipios', publico.municipios);
router.get('/tipos', publico.tipos);
router.get('/qr/:codigo', limiteConsultasPublicas, publicidad.infoQr);
router.post('/qr/:codigo/escaneo', limiteConsultasPublicas, publicidad.escanearQr);

// Formularios públicos de comunicación.
router.post('/contacto', limiteSolicitudesPublicas, publico.crearContacto);
router.post('/sugerencias', limiteSolicitudesPublicas, publico.crearSugerencia);
router.get('/sugerencias/:folio', limiteConsultasPublicas, publico.consultarSugerencia);
router.post('/correo/estado', limiteConsultasPublicas, acceso.estadoCorreo);
router.post('/solicitudes-acceso', limiteSolicitudesPublicas, acceso.crear);
router.post(
  '/solicitudes-acceso/documentos',
  limiteSolicitudesPublicas,
  recibirDocumentosSolicitud,
  acceso.subirDocumentos
);

// Suscripción a las campañas informativas (doble opt-in y baja en un clic).
router.post('/suscripciones', limiteSolicitudesPublicas, publico.crearSuscripcion);
router.post('/suscripciones/confirmar', limiteConsultasPublicas, publico.confirmarSuscripcion);
router.post('/suscripciones/baja', limiteConsultasPublicas, publico.bajaSuscripcion);

// El enlace de verificación va antes de `/:folio` para que no se confunda.
router.get(
  '/solicitudes-informe/verificar/:token',
  limiteConsultasPublicas,
  publico.verificarSolicitud
);
router.get('/solicitudes-informe/:folio', limiteConsultasPublicas, publico.consultarSolicitud);
router.post(
  '/solicitudes-informe',
  limiteSolicitudesPublicas,
  requiereCuenta,
  publico.crearSolicitudInforme
);

export default router;
