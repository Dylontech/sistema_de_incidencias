/**
 * Controlador de términos y condiciones.
 * El contenido se guarda en disco (data/terminos.html).
 */
import { leerTerminos, guardarTerminos } from '../services/terminos.service.js';

export const TerminosController = {
  async obtener(req, res, next) {
    try {
      const html = await leerTerminos();
      res.json({ html });
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    const { html } = req.body || {};

    if (!html || typeof html !== 'string' || html.trim().length < 100) {
      return res.status(400).json({ error: 'Contenido inválido o demasiado corto.' });
    }

    try {
      await guardarTerminos(html);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
};
