/** Configuración central: límites públicos y edición del administrador. */
import { Router } from 'express';
import * as configuracion from '../controllers/configuracion.controller.js';
import { requiereAdmin, requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.get('/configuracion/publica', configuracion.publicas);
router.get(
  '/admin/configuracion',
  requiereAdmin,
  requierePermiso('gestionar_configuracion'),
  configuracion.listar
);
router.put(
  '/admin/configuracion',
  requiereAdmin,
  requierePermiso('gestionar_configuracion'),
  configuracion.guardar
);

router.get(
  '/admin/verificacion-cuentas',
  requiereAdmin,
  requierePermiso('gestionar_verificacion_cuentas'),
  configuracion.verificacion
);
router.put(
  '/admin/verificacion-cuentas',
  requiereAdmin,
  requierePermiso('gestionar_verificacion_cuentas'),
  configuracion.guardarVerificacion
);

export default router;
