/** Rutas de incidencias y de carga de evidencia. */
import { Router } from 'express';
import * as incidencias from '../controllers/incidencias.controller.js';
import * as uploads from '../controllers/uploads.controller.js';
import { requiereSesion } from '../middlewares/auth.js';
import { recibirArchivos } from '../middlewares/upload.js';
import { limiteEscritura, limiteSubidas } from '../middlewares/limitadores.js';

const router = Router();

router.use(requiereSesion);

// Evidencia: se sube primero y luego se adjunta como metadatos. El límite va
// antes de multer para no escribir en disco lo que se va a rechazar.
router.post('/uploads', limiteSubidas, recibirArchivos, uploads.subir);

router.get('/incidencias', incidencias.listar);
router.post('/incidencias', limiteEscritura, incidencias.crear);
router.get('/incidencias/:id', incidencias.obtener);
router.put('/incidencias/:id', incidencias.actualizar);
router.patch('/incidencias/:id/estado', incidencias.cambiarEstado);
router.patch('/incidencias/:id/peligro', incidencias.marcarPeligro);
router.post('/incidencias/:id/resolucion', incidencias.resolver);
router.delete('/incidencias/:id', incidencias.eliminar);
router.post('/incidencias/:id/comentarios', limiteEscritura, incidencias.comentar);

export default router;
