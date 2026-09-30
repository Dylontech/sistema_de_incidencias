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
import { requiereEmpleado, requiereSesion } from '../middlewares/auth.js';
import { limiteEscritura } from '../middlewares/limitadores.js';

const router = Router();

router.use(requiereSesion);

/* ---------------------------------- denuncias ----------------------------- */

router.post('/incidencias/:id/denuncias', limiteEscritura, moderacion.denunciar);
router.get('/denuncias/mias', moderacion.misDenuncias);

/* ------------------------------- cola de trabajo -------------------------- */

router.get('/moderacion/denuncias', requiereEmpleado, moderacion.listarDenuncias);
router.get('/moderacion/resumen', requiereEmpleado, moderacion.resumen);
router.patch('/moderacion/denuncias/:id', requiereEmpleado, moderacion.resolver);

/* -------------------------------- contenido ------------------------------- */

router.patch('/moderacion/incidencias/:id/ocultar', requiereEmpleado, moderacion.ocultarIncidencia);
router.patch(
  '/moderacion/incidencias/:id/comentarios/:comentarioId/ocultar',
  requiereEmpleado,
  moderacion.ocultarComentario
);

/* --------------------------------- cuentas -------------------------------- */

router.post('/moderacion/incidencias/:id/advertir', requiereEmpleado, moderacion.advertir);
router.get('/moderacion/cuentas', requiereEmpleado, moderacion.sanciones);
router.get('/moderacion/cuentas/:username', requiereEmpleado, moderacion.cuenta);
router.post('/moderacion/cuentas/:username/suspension', requiereEmpleado, moderacion.suspender);
router.delete('/moderacion/cuentas/:username/suspension', requiereEmpleado, moderacion.reactivar);

export default router;
