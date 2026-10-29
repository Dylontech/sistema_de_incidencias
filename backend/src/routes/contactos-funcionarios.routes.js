/** Rutas de contacto directo a funcionarios. */
import { Router } from 'express';
import * as contactos from '../controllers/contactos-funcionarios.controller.js';
import { requiereAdmin, requiereEmpleado, requiereSesion } from '../middlewares/auth.js';

const router = Router();

router.use(requiereSesion);

router.get('/contacto/funcionarios', contactos.funcionarios);
router.post('/contacto/funcionarios', contactos.crear);
router.post('/contacto/funcionarios/solicitar-admin', contactos.solicitarAdmin);

router.get('/contacto/mios', contactos.mios);
router.get('/contacto/directo', requiereEmpleado, contactos.bandeja);
router.get('/contacto/directo/:id', contactos.detalle);
router.post('/contacto/directo/:id/mensajes', contactos.responder);

router.get('/admin/contacto/mediaciones', requiereAdmin, contactos.mediaciones);
router.post('/admin/contacto/mediaciones/:id/atender', requiereAdmin, contactos.atenderMediacion);

export default router;
