/** Enrutador raíz de la API (/api). */
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import catalogosRoutes from './catalogos.routes.js';
import incidenciasRoutes from './incidencias.routes.js';
import moderacionRoutes from './moderacion.routes.js';
import notificacionesRoutes from './notificaciones.routes.js';
import reportesRoutes from './reportes.routes.js';

const router = Router();

router.get('/salud', async (req, res) => {
  const repositorio = req.repositorio;
  const driver = repositorio?.driver || 'desconocido';
  const fecha = new Date().toISOString();

  try {
    // Comprueba el almacén de verdad: es lo que consulta el healthcheck del
    // contenedor, así que un "ok" sin base de datos detrás no sirve de nada.
    await repositorio.ping();
    res.json({ ok: true, fecha, driver, baseDatos: 'ok' });
  } catch (error) {
    console.error('[salud] el almacén no responde:', error.message);
    res.status(503).json({ ok: false, fecha, driver, baseDatos: 'error' });
  }
});

router.use('/auth', authRoutes);
router.use('/', catalogosRoutes);
router.use('/', incidenciasRoutes);
router.use('/', moderacionRoutes);
router.use('/', notificacionesRoutes);
router.use('/', reportesRoutes);

export default router;
