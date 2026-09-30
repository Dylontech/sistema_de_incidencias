/** Rutas de autenticación y sesión. */
import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as cuenta from '../controllers/cuenta.controller.js';
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

// Ciclo de vida del correo y de la contraseña. Se llega aquí desde un enlace
// del correo, sin sesión, así que van con el límite de entradas (el mismo que
// protege el login): sin él, se podrían pedir enlaces en cadena.
router.post('/verificar', limiteEntradas, cuenta.verificar);
router.post('/reenviar', limiteEntradas, cuenta.reenviar);
router.post('/olvide', limiteEntradas, cuenta.olvide);
router.post('/restablecer', limiteEntradas, cuenta.restablecer);

router.get('/me', requiereSesion, auth.yo);
router.post('/municipio-activo', requiereSesion, auth.cambiarMunicipio);

export default router;
