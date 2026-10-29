/** Enrutador raíz de la API (/api). */
import { Router } from 'express';
import adjuntosRoutes from './adjuntos.routes.js';
import auditoriaRoutes from './auditoria.routes.js';
import authRoutes from './auth.routes.js';
import catalogosRoutes from './catalogos.routes.js';
import clavesRoutes from './claves.routes.js';
import comentariosRoutes from './comentarios.routes.js';
import comunicacionRoutes from './comunicacion.routes.js';
import configuracionRoutes from './configuracion.routes.js';
import contactosFuncionariosRoutes from './contactos-funcionarios.routes.js';
import correosInstitucionalesRoutes from './correos-institucionales.routes.js';
import eventosRoutes from './eventos.routes.js';
import firmasRoutes from './firmas.routes.js';
import foliosRoutes from './folios.routes.js';
import incidenciasRoutes from './incidencias.routes.js';
import legalRoutes from './legal.routes.js';
import moderacionRoutes from './moderacion.routes.js';
import notificacionesRoutes from './notificaciones.routes.js';
import permisosRoutes from './permisos.routes.js';
import publicidadRoutes from './publicidad.routes.js';
import publicoRoutes from './publico.routes.js';
import rolesRoutes from './roles.routes.js';
import reportesRoutes from './reportes.routes.js';
import respaldosRoutes from './respaldos.routes.js';
import sesionesRoutes from './sesiones.routes.js';
import simuladorRoutes from './simulador.routes.js';
import ticketsRoutes from './tickets.routes.js';
import terminosRoutes from './terminos.routes.js';        // <-- AÑADIDO
import { exigirTerminos } from '../middlewares/terminos.js';
import { limiteGeneral } from '../middlewares/limitadores.js';

const router = Router();

router.get('/salud', async (req, res) => {
  const repositorio = req.repositorio;
  const driver = repositorio?.driver || 'desconocido';
  const fecha = new Date().toISOString();

  try {
    await repositorio.ping();
    res.json({ ok: true, fecha, driver, baseDatos: 'ok' });
  } catch (error) {
    console.error('[salud] el almacén no responde:', error.message);
    res.status(503).json({ ok: false, fecha, driver, baseDatos: 'error' });
  }
});

// SSE: se registra antes del límite general y con su propio cupo.
router.use(eventosRoutes);

router.use(limiteGeneral);
router.use(exigirTerminos);

router.use('/auth', authRoutes);
router.use('/terminos', terminosRoutes);                  // <-- AÑADIDO
router.use('/', configuracionRoutes);
router.use('/', legalRoutes);
router.use('/publico', publicoRoutes);
router.use('/', catalogosRoutes);
// `reportesRoutes` incluye `/informes/estilo.css`, que la ventana de
// impresión carga sin Authorization. Debe ir antes de los routers que usan
// `router.use(requiereSesion)`, porque esos interceptan todo lo montado después.
router.use('/', reportesRoutes);
router.use('/', clavesRoutes);
router.use('/', auditoriaRoutes);
router.use('/', contactosFuncionariosRoutes);
router.use('/', comunicacionRoutes);
router.use('/', correosInstitucionalesRoutes);
router.use('/', sesionesRoutes);
router.use('/', firmasRoutes);
router.use('/', foliosRoutes);
router.use('/', comentariosRoutes);
router.use('/', adjuntosRoutes);
router.use('/', incidenciasRoutes);
router.use('/', moderacionRoutes);
router.use('/', notificacionesRoutes);
router.use('/', permisosRoutes);
router.use('/', publicidadRoutes);
router.use('/', rolesRoutes);
router.use('/', respaldosRoutes);
router.use('/', simuladorRoutes);
router.use('/', ticketsRoutes);

export default router;
