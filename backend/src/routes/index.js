/** Enrutador raíz de la API (/api). */
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import catalogosRoutes from './catalogos.routes.js';
import incidenciasRoutes from './incidencias.routes.js';
import notificacionesRoutes from './notificaciones.routes.js';
import reportesRoutes from './reportes.routes.js';

const router = Router();

router.get('/salud', (req, res) => {
  res.json({ ok: true, fecha: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/', catalogosRoutes);
router.use('/', incidenciasRoutes);
router.use('/', notificacionesRoutes);
router.use('/', reportesRoutes);

export default router;
