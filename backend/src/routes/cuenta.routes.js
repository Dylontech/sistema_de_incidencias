/**
 * Rutas de la cuenta.
 *
 * Son las acciones que cualquiera con sesión ejerce sobre su propia cuenta:
 * cambiar la contraseña, reenviar la confirmación del correo, descargar sus
 * datos y darse de baja. Las de recuperación sin sesión viven en
 * `auth.routes.js`, junto al resto del acceso.
 */
import { Router } from 'express';
import * as cuenta from '../controllers/cuenta.controller.js';
import { requiereSesion } from '../middlewares/auth.js';
import { limiteEntradas } from '../middlewares/limitadores.js';

const router = Router();

// Nada de aquí se puede hacer sin sesión: todas actúan sobre `req.usuario`.
router.use(requiereSesion);

// Cambiar la contraseña y darse de baja piden la contraseña actual, así que
// también se limitan: una sesión abierta en un equipo ajeno no debe permitir
// probar contraseñas tranquilamente.
router.post('/password', limiteEntradas, cuenta.cambiarPassword);
router.post('/correo/reenviar', cuenta.reenviarCorreo);
router.get('/datos', cuenta.descargarDatos);
router.delete('/', limiteEntradas, cuenta.eliminar);

export default router;
