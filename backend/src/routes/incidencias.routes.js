/** Rutas de incidencias y de carga de evidencia. */
import { Router } from 'express';
import * as incidencias from '../controllers/incidencias.controller.js';
import * as reparaciones from '../controllers/reparaciones.controller.js';
import * as uploads from '../controllers/uploads.controller.js';
import { requierePermiso, requiereSesion } from '../middlewares/auth.js';
import { recibirArchivos } from '../middlewares/upload.js';
import { limiteEscritura, limiteSubidas } from '../middlewares/limitadores.js';

const router = Router();

router.use(requiereSesion);

// Evidencia: se sube primero y luego se adjunta como metadatos. El límite va
// antes de multer para no escribir en disco lo que se va a rechazar.
router.post('/uploads', limiteSubidas, recibirArchivos, uploads.subir);

router.get('/incidencias', incidencias.listar);
// Debe ir antes de `/:id`, o «mapa» se interpretaría como un id.
router.get('/incidencias/mapa', incidencias.mapa);
router.get('/incidencias/vialidades', incidencias.vialidadesMapa);
router.get(
  '/incidencias/archivo',
  requierePermiso('ver_incidencias_panel'),
  incidencias.archivoGeneral
);
router.get(
  '/incidencias/reparaciones',
  requierePermiso('ver_reparaciones_panel'),
  reparaciones.listar
);
router.get(
  '/incidencias/reparaciones/cuadrillas',
  requierePermiso('coordinar_reparaciones'),
  reparaciones.cuadrillas
);
router.post(
  '/incidencias/:id/asignar',
  limiteEscritura,
  requierePermiso('coordinar_reparaciones'),
  reparaciones.asignar
);
router.patch(
  '/incidencias/:id/reparacion',
  limiteEscritura,
  requierePermiso('atender_reparaciones'),
  reparaciones.cambiarEstado
);
router.post(
  '/incidencias/:id/reparacion/documentos',
  limiteSubidas,
  requierePermiso('subir_documentos_reparacion'),
  reparaciones.documentos
);
router.post('/incidencias', limiteEscritura, requierePermiso('reportar'), incidencias.crear);
router.get(
  '/incidencias/:id/pdf',
  requierePermiso('ver_incidencias_panel'),
  incidencias.pdf
);
router.get(
  '/incidencias/:id/expediente',
  requierePermiso('ver_incidencias_panel'),
  incidencias.expediente
);
router.get(
  '/incidencias/:id/expediente/pdf',
  requierePermiso('ver_incidencias_panel'),
  incidencias.pdf
);
router.get('/incidencias/:id', incidencias.obtener);
router.put('/incidencias/:id', requierePermiso('editar_propios'), incidencias.actualizar);
router.patch('/incidencias/:id/estado', requierePermiso('cambiar_estado'), incidencias.cambiarEstado);
router.patch('/incidencias/:id/peligro', requierePermiso('moderar'), incidencias.marcarPeligro);
router.post('/incidencias/:id/resolucion', requierePermiso('resolver'), incidencias.resolver);
router.delete('/incidencias/:id', incidencias.eliminar);

// Los comentarios se atienden en comentarios.routes.js (comentarios.crear),
// que valida reglas anti-abuso y vincula las imágenes en la misma operación.

export default router;
