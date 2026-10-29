/** Rutas de autenticación y sesión. */
import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requiereSesion } from '../middlewares/auth.js';
import { limiteAnonimo, limiteEntradas, limiteRegistro } from '../middlewares/limitadores.js';

const router = Router();

// Los límites van antes de los controladores: una contraseña no se prueba a
// fuerza bruta ni se crean cuentas o sesiones en cadena.
router.post('/anonimo', limiteAnonimo, auth.entrarAnonimo);
router.post('/registro', limiteRegistro, auth.registrarCiudadano);
router.post('/ciudadano', limiteEntradas, auth.entrarCiudadano);
router.post('/funcionario', limiteEntradas, auth.entrarFuncionario);
router.post('/admin', limiteEntradas, auth.entrarAdmin);
router.get('/me', requiereSesion, auth.yo);
router.post('/salir', requiereSesion, auth.salir);
router.post('/municipio-activo', requiereSesion, auth.cambiarMunicipio);

export default router;
