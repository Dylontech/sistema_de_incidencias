/** Rutas de tickets de soporte. */
import { Router } from 'express';
import * as tickets from '../controllers/tickets.controller.js';
import { requiereCuenta, requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.use(requiereSesion);
router.get('/tickets', tickets.listar);
router.post('/tickets', requiereCuenta, tickets.crear);
router.get('/tickets/:id', tickets.obtener);
router.post('/tickets/:id/mensajes', tickets.responder);
router.patch('/tickets/:id/estado', tickets.cambiarEstado);
router.patch('/tickets/:id/asignacion', tickets.asignar);
router.patch('/tickets/:id/prioridad', tickets.cambiarPrioridad);
router.get('/admin/tickets/reglas', tickets.listarReglas);
router.post('/admin/tickets/reglas', tickets.crearRegla);
router.delete('/admin/tickets/reglas/:id', tickets.eliminarRegla);

export default router;
