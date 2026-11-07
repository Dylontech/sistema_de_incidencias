/** Rutas de autenticación y sesión. */
import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as cuenta from '../controllers/cuenta.controller.js';
import { requiereSesion } from '../middlewares/auth.js';
import {
  limiteAnonimo,
  limiteEntradas,
  limiteRecuperacion,
  limiteRegistro
} from '../middlewares/limitadores.js';

const router = Router();

// Los límites van antes de los controladores: una contraseña no se prueba a
// fuerza bruta ni se crean cuentas o sesiones en cadena.
router.post('/anonimo', limiteAnonimo, auth.entrarAnonimo);
router.post('/registro', limiteRegistro, auth.registrarCiudadano);
router.post('/ciudadano', limiteEntradas, auth.entrarCiudadano);
router.post('/funcionario', limiteEntradas, auth.entrarFuncionario);
router.post('/admin', limiteEntradas, auth.entrarAdmin);

// Recuperación y verificación de correo. Son rutas públicas, con límite propio.
router.post('/cuenta/recuperar', limiteRecuperacion, cuenta.solicitarRecuperacion);
router.post('/cuenta/reenviar-verificacion', limiteRecuperacion, cuenta.reenviarVerificacion);
router.post('/cuenta/validar-token', limiteRecuperacion, cuenta.validarToken);
router.post('/cuenta/verificar', limiteRecuperacion, cuenta.verificarCorreo);
router.post('/cuenta/restablecer', limiteRecuperacion, cuenta.restablecerPassword);

router.get('/me', requiereSesion, auth.yo);
router.post('/salir', requiereSesion, auth.salir);
router.post('/municipio-activo', requiereSesion, auth.cambiarMunicipio);

export default router;
