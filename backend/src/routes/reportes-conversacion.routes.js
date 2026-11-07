/** Rutas de reportes de conversación (bandeja y moderación). */
import { Router } from 'express';
import * as reportes from '../controllers/reportes-conversacion.controller.js';
import { requiereEmpleado, requierePermiso, requiereSesion } from '../middlewares/auth.js';

const router = Router();

// El contexto lo pide el participante antes de confirmar el reporte.
router.get('/reportes-conversacion/contexto', requiereSesion, reportes.contexto);
router.post('/reportes-conversacion', requiereSesion, reportes.crear);

// La cola solo la ve quien tiene `ver_moderacion`; resolver exige `moderar`.
router.get(
  '/reportes-conversacion',
  requiereEmpleado,
  requierePermiso('ver_moderacion'),
  reportes.listar
);
router.patch(
  '/reportes-conversacion/:id/resolver',
  requiereEmpleado,
  requierePermiso('moderar'),
  reportes.resolver
);
router.patch(
  '/reportes-conversacion/:id/revertir',
  requiereEmpleado,
  requierePermiso('moderar'),
  reportes.revertir
);

export default router;
