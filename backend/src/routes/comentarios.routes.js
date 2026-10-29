/** Rutas de comentarios con reglas y restricciones de moderación. */
import { Router } from 'express';
import * as comentarios from '../controllers/comentarios.controller.js';
import { requiereEmpleado, requierePermiso, requiereSesion } from '../middlewares/auth.js';
import { limiteEscritura } from '../middlewares/limitadores.js';

const router = Router();

router.use(requiereSesion);

router.get('/incidencias/:id/comentarios', comentarios.listar);
router.post('/incidencias/:id/comentarios', limiteEscritura, comentarios.crear);
router.delete('/incidencias/:id/comentarios/:comentarioId', comentarios.eliminar);

router.patch(
  '/moderacion/cuentas/:username/restriccion-comentarios',
  requiereEmpleado,
  requierePermiso('moderar'),
  comentarios.restringirCuenta
);
router.delete(
  '/moderacion/cuentas/:username/restriccion-comentarios',
  requiereEmpleado,
  requierePermiso('moderar'),
  comentarios.levantarCuenta
);
router.patch(
  '/moderacion/restricciones-comentarios',
  requiereEmpleado,
  requierePermiso('moderar'),
  comentarios.restringirUserKey
);
router.delete(
  '/moderacion/restricciones-comentarios',
  requiereEmpleado,
  requierePermiso('moderar'),
  comentarios.levantarUserKey
);

export default router;
