/**
 * Aplicación Express.
 *
 * Sirve la API bajo /api, la evidencia bajo /uploads y el frontend estático
 * desde ../frontend (mismo origen: no hace falta CORS).
 */
import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config/index.js';
import rutasApi from './routes/index.js';
import { inyectarRepositorio } from './middlewares/repositorio.js';
import { autenticar } from './middlewares/auth.js';
import { auditar } from './middlewares/auditoria.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errors.js';
import {
  cabecerasEvidencia,
  cabecerasSeguridad,
  permisosDelNavegador
} from './middlewares/seguridad.js';
import { instrumentar } from './services/metricas.service.js';

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
  // Contadores de peticiones/latencia para el panel de recursos.
  app.use(instrumentar);
  // Las respuestas del mapa y los catálogos son JSON grande y muy repetitivo.
  app.use(compression());

  // El respaldo del monolito lleva la evidencia en base64, así que solo esa ruta
  // admite un cuerpo grande. El parser global va después y no vuelve a leer el
  // cuerpo ya procesado (body-parser marca `req._body`).
  app.use('/api/admin/importar', express.json({ limit: config.seguridad.maxImportacionBytes }));
  // Los KML/GeoJSON de Google Maps pueden superar el límite JSON normal.
  app.use(
    '/api/admin/vialidades/importar',
    express.json({ limit: config.seguridad.maxImportacionBytes })
  );
  app.use(express.json({ limit: config.seguridad.maxJsonBytes }));
  app.use(express.urlencoded({ extended: false, limit: config.seguridad.maxJsonBytes }));

  app.use(inyectarRepositorio);
  app.use(autenticar);
  app.use(auditar);

  app.use('/api', rutasApi);
  app.use('/api', rutaNoEncontrada);

  // Los adjuntos de chats y comentarios son privados: solo se sirven por
  // `/api/adjuntos/:id` tras comprobar la participación.
  app.use('/uploads/adjuntos', (req, res) => res.status(404).json({ error: 'No encontrado' }));

  // Evidencia subida (nombres UUID, no listables). Es un archivo del usuario:
  // se sirve sin permitir que ejecute nada si se abre la URL directamente.
  app.use(
    '/uploads',
    cabecerasEvidencia,
    express.static(config.paths.uploads, { index: false, dotfiles: 'deny', maxAge: '1d' })
  );

  // Entrada corta de los códigos QR. La SPA captura `qr` y registra el escaneo
  // con la ubicación, si el navegador la concede.
  app.get('/r/:codigo', async (req, res, next) => {
    try {
      const codigo = await req.repositorio?.codigoQrPorCodigo(req.params.codigo);
      if (!codigo || codigo.activo === false) {
        return res.status(404).send('Código QR no encontrado');
      }
      return res.redirect(302, `/?qr=${encodeURIComponent(codigo.codigo)}`);
    } catch (error) {
      return next(error);
    }
  });

  // Las antiguas vistas de informes y tickets ahora son modales de la app.
  // Se conservan las rutas para los enlaces de correo y los enlaces profundos.
  app.get(['/informes', '/informes.html'], (req, res) => {
    const params = new URLSearchParams(req.query);
    if (!params.has('verificar')) params.set('informe', '1');
    res.redirect(302, `/${params.toString() ? `?${params.toString()}` : ''}`);
  });

  app.get(['/tickets', '/tickets.html'], (req, res) => {
    const params = new URLSearchParams(req.query);
    if (!params.has('ticket')) params.set('tickets', '1');
    res.redirect(302, `/${params.toString() ? `?${params.toString()}` : ''}`);
  });

  // El panel de soporte ya es una pestaña del modal de tickets. Se conserva la
  // ruta para correos y marcadores antiguos.
  app.get(['/soporte', '/soporte.html'], (req, res) => {
    const params = new URLSearchParams(req.query);
    if (!params.has('ticket') && !params.has('tickets')) params.set('tickets', '1');
    res.redirect(302, `/${params.toString() ? `?${params.toString()}` : ''}`);
  });

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
