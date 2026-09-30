/** Enrutador raíz de la API (/api). */
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import catalogosRoutes from './catalogos.routes.js';
import cuentaRoutes from './cuenta.routes.js';
import incidenciasRoutes from './incidencias.routes.js';
import moderacionRoutes from './moderacion.routes.js';
import notificacionesRoutes from './notificaciones.routes.js';
import reportesRoutes from './reportes.routes.js';
import { limiteGeneral } from '../middlewares/limitadores.js';

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

// A partir de aquí, todo pasa por el límite general de peticiones. La ruta de
// salud queda fuera a propósito (se registra antes): la consulta el healthcheck
// del contenedor cada 30 s y no debe gastar cupo.
router.use(limiteGeneral);

router.use('/auth', authRoutes);
router.use('/cuenta', cuentaRoutes);
router.use('/', catalogosRoutes);
router.use('/', incidenciasRoutes);
router.use('/', moderacionRoutes);
router.use('/', notificacionesRoutes);
router.use('/', reportesRoutes);

export default router;
