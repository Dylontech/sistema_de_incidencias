/**
 * Rutas de moderación.
 *
 * Denunciar está al alcance de cualquier sesión (incluida la anónima): es el
 * aviso del vecindario. Todo lo demás —ver la cola, ocultar contenido, advertir
 * o suspender— es del personal del municipio; el servicio vuelve a comprobar el
 * rol y el alcance por municipio.
 */
import { Router } from 'express';
import * as moderacion from '../controllers/moderacion.controller.js';
import { requiereEmpleado, requierePermiso, requiereSesion } from '../middlewares/auth.js';
import { limiteEscritura } from '../middlewares/limitadores.js';

const router = Router();

router.use(requiereSesion);

/* ---------------------------------- denuncias ----------------------------- */

router.post('/incidencias/:id/denuncias', limiteEscritura, moderacion.denunciar);
router.get('/denuncias/mias', moderacion.misDenuncias);

/* ------------------------------- cola de trabajo -------------------------- */

router.get(
  '/moderacion/denuncias',
  requiereEmpleado,
  requierePermiso('ver_moderacion'),
  moderacion.listarDenuncias
);
router.get(
  '/moderacion/resumen',
  requiereEmpleado,
  requierePermiso('ver_moderacion'),
  moderacion.resumen
);
router.patch('/moderacion/denuncias/:id', requiereEmpleado, requierePermiso('moderar'), moderacion.resolver);

/* -------------------------------- contenido ------------------------------- */

router.patch('/moderacion/incidencias/:id/ocultar', requiereEmpleado, requierePermiso('moderar'), moderacion.ocultarIncidencia);
router.patch(
  '/moderacion/incidencias/:id/comentarios/:comentarioId/ocultar',
  requiereEmpleado,
  requierePermiso('moderar'),
  moderacion.ocultarComentario
);

/* --------------------------------- cuentas -------------------------------- */

router.post('/moderacion/incidencias/:id/advertir', requiereEmpleado, requierePermiso('moderar'), moderacion.advertir);
router.get(
  '/moderacion/cuentas',
  requiereEmpleado,
  requierePermiso('ver_moderacion'),
  moderacion.sanciones
);
router.get(
  '/moderacion/cuentas/:username',
  requiereEmpleado,
  requierePermiso('ver_moderacion'),
  moderacion.cuenta
);
router.post('/moderacion/cuentas/:username/suspension', requiereEmpleado, requierePermiso('moderar'), moderacion.suspender);
router.delete('/moderacion/cuentas/:username/suspension', requiereEmpleado, requierePermiso('moderar'), moderacion.reactivar);

export default router;
