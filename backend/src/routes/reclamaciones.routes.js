/**
 * Reclamaciones de incidencias resueltas.
 *
 * Cualquier cuenta registrada puede crear una; consultarla y resolverla exige
 * `gestionar_reclamaciones` (funcionarios y administración del municipio).
 */
import { Router } from 'express';
import * as reclamaciones from '../controllers/reclamaciones.controller.js';
import { requiereEmpleado, requierePermiso, requiereSesion } from '../middlewares/auth.js';
import { limiteEscritura } from '../middlewares/limitadores.js';

const router = Router();

router.post(
  '/incidencias/:id/reclamaciones',
  requiereSesion,
  limiteEscritura,
  reclamaciones.crear
);
router.get(
  '/reclamaciones',
  requiereEmpleado,
  requierePermiso('gestionar_reclamaciones'),
  reclamaciones.listar
);
router.get('/reclamaciones/:id/informe', requiereSesion, reclamaciones.informe);
router.get('/reclamaciones/:id', requiereSesion, reclamaciones.obtener);
router.patch(
  '/reclamaciones/:id/delegar',
  requiereEmpleado,
  requierePermiso('gestionar_reclamaciones'),
  reclamaciones.delegar
);
router.patch(
  '/reclamaciones/:id/resolver',
  requiereEmpleado,
  requierePermiso('gestionar_reclamaciones'),
  reclamaciones.resolver
);

export default router;
