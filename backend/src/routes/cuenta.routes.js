/** Rutas autenticadas de la propia cuenta. */
import { Router } from 'express';
import * as cuenta from '../controllers/cuenta.controller.js';
import { requiereCuenta } from '../middlewares/auth.js';

const router = Router();

router.get('/', requiereCuenta, cuenta.estado);
router.get('/clave', requiereCuenta, cuenta.clave);
router.post('/clave/solicitar-renovacion', requiereCuenta, cuenta.solicitarRenovacionClave);
router.post('/correo', requiereCuenta, cuenta.cambiarCorreo);
router.post('/password', requiereCuenta, cuenta.cambiarPassword);
router.post('/congelar', requiereCuenta, cuenta.congelar);
router.post('/eliminar', requiereCuenta, cuenta.eliminar);

export default router;
