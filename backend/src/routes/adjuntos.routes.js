/** Rutas de adjuntos privados de chats y comentarios. */
import { Router } from 'express';
import * as adjuntos from '../controllers/adjuntos.controller.js';
import { requiereCuenta, requiereSesion } from '../middlewares/auth.js';
import { recibirAdjuntoChat, recibirAdjuntoComentario } from '../middlewares/upload.js';
import { limiteSubidas } from '../middlewares/limitadores.js';

const router = Router();

router.post(
  '/adjuntos',
  requiereCuenta,
  limiteSubidas,
  recibirAdjuntoChat,
  adjuntos.subirChat
);
router.post(
  '/adjuntos/comentario',
  requiereCuenta,
  limiteSubidas,
  recibirAdjuntoComentario,
  adjuntos.subirComentario
);
router.get('/adjuntos/:id', requiereSesion, adjuntos.descargar);

export default router;
