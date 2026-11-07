/** Rutas de estadísticas, informes y tareas administrativas. */
import { Router } from 'express';
import * as stats from '../controllers/stats.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as adminPublico from '../controllers/admin-publico.controller.js';
import * as informes from '../controllers/informes.controller.js';
import * as metricas from '../controllers/metricas.controller.js';
import * as acceso from '../controllers/solicitudes-acceso.controller.js';
import { requiereAdmin, requiereEmpleado, requierePermiso } from '../middlewares/auth.js';
import { recibirLogotipo } from '../middlewares/upload.js';
import { limiteSubidas } from '../middlewares/limitadores.js';

const router = Router();

router.get('/stats/panel', requiereEmpleado, requierePermiso('ver_metricas'), stats.panelAdmin);
router.get('/stats/informes', requiereEmpleado, requierePermiso('ver_metricas'), stats.informes);
router.get('/exportacion', requiereEmpleado, requierePermiso('exportar'), stats.exportacion);
router.get('/informes/exportar', requiereEmpleado, requierePermiso('exportar'), informes.exportar);
router.get('/informes/datos', requiereEmpleado, requierePermiso('exportar'), informes.datos);
router.get('/informes/motor-pdf', requiereEmpleado, informes.motorPdf);
router.get('/informes/estilo.css', informes.estilo);
router.post(
  '/admin/informes/logo',
  requiereAdmin,
  limiteSubidas,
  recibirLogotipo,
  informes.subirLogo
);

router.post('/admin/limpiar', requiereAdmin, admin.limpiar);
router.post('/admin/importar', requiereAdmin, admin.importar);

// Solicitudes públicas de informe, bloqueos reversibles y bitácora de correo.
router.use(
  '/admin/solicitudes-informe',
  requiereAdmin,
  requierePermiso('gestionar_solicitudes_informe')
);
router.get('/admin/solicitudes-informe', requiereAdmin, adminPublico.listarSolicitudes);
router.get('/admin/solicitudes-informe/:id', requiereAdmin, adminPublico.detalleSolicitud);
router.get(
  '/admin/solicitudes-informe/:id/archivo',
  requiereAdmin,
  adminPublico.archivoSolicitud
);
router.get(
  '/admin/solicitudes-informe/:id/vista-previa',
  requiereAdmin,
  adminPublico.vistaPreviaSolicitud
);
router.post(
  '/admin/solicitudes-informe/:id/generar',
  requiereAdmin,
  adminPublico.generarSolicitud
);
router.post(
  '/admin/solicitudes-informe/:id/enviar',
  requiereAdmin,
  adminPublico.enviarSolicitud
);
router.post(
  '/admin/solicitudes-informe/:id/reintentar',
  requiereAdmin,
  adminPublico.reintentarSolicitud
);
router.post(
  '/admin/solicitudes-informe/:id/rechazar',
  requiereAdmin,
  adminPublico.rechazarSolicitud
);
router.get('/admin/bloqueos', requiereAdmin, adminPublico.listarBloqueos);
router.post('/admin/bloqueos', requiereAdmin, adminPublico.crearBloqueo);
router.delete('/admin/bloqueos/:id', requiereAdmin, adminPublico.eliminarBloqueo);
router.get('/admin/correos', requiereAdmin, adminPublico.listarEnvios);

// Recursos del servidor (solo administrador).
router.get('/admin/metricas', requiereAdmin, requierePermiso('ver_metricas'), metricas.actual);
router.get(
  '/admin/metricas/historico',
  requiereAdmin,
  requierePermiso('ver_metricas'),
  metricas.historico
);

router.get(
  '/admin/solicitudes-acceso',
  requierePermiso('ver_solicitudes_acceso'),
  acceso.listar
);
router.post(
  '/admin/solicitudes-acceso/:id/aprobar',
  requierePermiso('aprobar_solicitudes_acceso'),
  acceso.aprobar
);
router.post(
  '/admin/solicitudes-acceso/:id/rechazar',
  requierePermiso('rechazar_solicitudes_acceso'),
  acceso.rechazar
);

export default router;
