/** Ruta SSE para notificaciones en tiempo real. */
import { Router } from 'express';
import { suscribir } from '../services/eventos.service.js';
import { limiteEventos } from '../middlewares/limitadores.js';

const router = Router();

// `autenticar` ya se ejecutó en app.js, así que req.usuario está disponible.
router.get('/eventos', limiteEventos, suscribir);

export default router;
