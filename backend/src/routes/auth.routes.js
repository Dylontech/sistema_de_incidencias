/** Rutas de autenticación y sesión. */
import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.post('/anonimo', auth.entrarAnonimo);
router.post('/funcionario', auth.entrarFuncionario);
router.post('/admin', auth.entrarAdmin);
router.get('/me', requiereSesion, auth.yo);
router.post('/municipio-activo', requiereSesion, auth.cambiarMunicipio);

export default router;
