/** Rutas del simulador (solo administrador maestro). */
import { Router } from 'express';
import * as simulador from '../controllers/simulador.controller.js';
import { requiereAdmin, requierePermiso } from '../middlewares/auth.js';

const router = Router();

router.use('/admin/simulador', requiereAdmin, requierePermiso('usar_simulador'));

router.post('/admin/simulador/vialidades', requiereAdmin, simulador.simularVialidades);
router.get('/admin/simulador/acciones', requiereAdmin, simulador.catalogo);
router.get('/admin/simulador/sesiones', requiereAdmin, simulador.listar);
router.post('/admin/simulador/sesiones', requiereAdmin, simulador.abrir);
router.get('/admin/simulador/sesiones/:id', requiereAdmin, simulador.detalle);
router.post('/admin/simulador/sesiones/:id/acciones/:accionId', requiereAdmin, simulador.ejecutar);
router.post('/admin/simulador/sesiones/:id/cerrar', requiereAdmin, simulador.cerrar);
router.post('/admin/simulador/sesiones/:id/revertir', requiereAdmin, simulador.revertir);
router.post('/admin/simulador/revertir-todo', requiereAdmin, simulador.revertirTodas);

export default router;
