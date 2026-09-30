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
import {
  cabecerasEvidencia,
  cabecerasSeguridad,
  permisosDelNavegador
} from './middlewares/seguridad.js';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');

  // Solo se confían en las cabeceras X-Forwarded-* si TRUST_PROXY lo declara:
  // con `true` incondicional, cualquiera podría falsear su IP (y con ella los
  // límites de peticiones). Por omisión no se confía en ninguna.
  app.set('trust proxy', config.seguridad.trustProxy);

  // Las cabeceras van lo primero para que también las lleven las respuestas de
  // error.
  app.use(cabecerasSeguridad());
  app.use(permisosDelNavegador);

  // El respaldo del monolito lleva la evidencia en base64, así que solo esa ruta
  // admite un cuerpo grande. El parser global va después y no vuelve a leer el
  // cuerpo ya procesado (body-parser marca `req._body`).
  app.use('/api/admin/importar', express.json({ limit: config.seguridad.maxImportacionBytes }));
  app.use(express.json({ limit: config.seguridad.maxJsonBytes }));
  app.use(express.urlencoded({ extended: false, limit: config.seguridad.maxJsonBytes }));

  app.use(inyectarRepositorio);
  app.use(autenticar);

  app.use('/api', rutasApi);
  app.use('/api', rutaNoEncontrada);

  // Evidencia subida (nombres UUID, no listables). Es un archivo del usuario:
  // se sirve sin permitir que ejecute nada si se abre la URL directamente.
  app.use(
    '/uploads',
    cabecerasEvidencia,
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
