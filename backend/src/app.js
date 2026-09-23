/**
 * Aplicación Express.
 *
 * Sirve la API bajo /api, la evidencia bajo /uploads y el frontend estático
 * desde ../frontend (mismo origen: no hace falta CORS).
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config/index.js';
import rutasApi from './routes/index.js';
import { inyectarRepositorio } from './middlewares/repositorio.js';
import { autenticar } from './middlewares/auth.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errors.js';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // El límite alto es para los respaldos del monolito (evidencia en base64).
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use(inyectarRepositorio);
  app.use(autenticar);

  app.use('/api', rutasApi);
  app.use('/api', rutaNoEncontrada);

  // Evidencia subida (nombres UUID, no listables).
  app.use(
    '/uploads',
    express.static(config.paths.uploads, { index: false, dotfiles: 'deny', maxAge: '1d' })
  );

  // Frontend estático (JavaScript modular servido tal cual, sin bundler).
  app.use(express.static(config.paths.frontend, { extensions: ['html'] }));

  // Cualquier otra ruta devuelve la aplicación.
  app.get('*', (req, res, next) => {
    const indice = path.join(config.paths.frontend, 'index.html');
    if (!fs.existsSync(indice)) {
      return next();
    }
    res.sendFile(indice);
  });

  app.use(manejarErrores);

  return app;
}
