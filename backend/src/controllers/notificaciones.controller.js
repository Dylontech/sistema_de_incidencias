/** Controlador HTTP de notificaciones. */
import { asyncHandler } from '../utils/AppError.js';
import * as notificaciones from '../services/notificaciones.service.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ notificaciones: await notificaciones.listar(req.repositorio, req.usuario) });
});

export const marcarLeida = asyncHandler(async (req, res) => {
  const lista = await notificaciones.marcarLeida(req.repositorio, req.usuario, req.params.id);
  res.json({ notificaciones: lista });
});

export const marcarTodas = asyncHandler(async (req, res) => {
  const resultado = await notificaciones.marcarTodasLeidas(req.repositorio, req.usuario);
  res.json(resultado);
});

export const eliminar = asyncHandler(async (req, res) => {
  const lista = await notificaciones.eliminar(req.repositorio, req.usuario, req.params.id);
  res.json({ notificaciones: lista });
});

export const historial = asyncHandler(async (req, res) => {
  res.json(
    await notificaciones.historial(req.repositorio, req.usuario, {
      pagina: req.query.pagina,
      limite: req.query.limite,
      evento: req.query.evento,
      desde: req.query.desde,
      hasta: req.query.hasta,
      texto: req.query.texto,
      incluirArchivadas: req.query.historial !== '0'
    })
  );
});

export const archivar = asyncHandler(async (req, res) => {
  const lista = await notificaciones.archivar(req.repositorio, req.usuario, req.params.id);
  res.json({ notificaciones: lista });
});

export const restaurar = asyncHandler(async (req, res) => {
  res.json({
    notificacion: await notificaciones.restaurar(req.repositorio, req.usuario, req.params.id)
  });
});

export const archivarTodas = asyncHandler(async (req, res) => {
  res.json(await notificaciones.archivarTodas(req.repositorio, req.usuario));
});

/** Configuración de avisos de incidencias nuevas (solo personal). */
export const preferencias = asyncHandler(async (req, res) => {
  res.json({ preferencias: await notificaciones.preferencias(req.repositorio, req.usuario) });
});

export const guardarPreferencias = asyncHandler(async (req, res) => {
  const guardadas = await notificaciones.guardarPreferencias(
    req.repositorio,
    req.usuario,
    req.body || {}
  );
  res.json({ preferencias: guardadas });
});

/* --------------------- configuración global (admin) --------------------- */

export const configuracionAdmin = asyncHandler(async (req, res) => {
  res.json({ eventos: await notificaciones.configuracionCompleta(req.repositorio) });
});

export const detalleConfiguracion = asyncHandler(async (req, res) => {
  res.json({
    evento: await notificaciones.configuracionDe(req.repositorio, req.params.evento)
  });
});

export const guardarConfiguracion = asyncHandler(async (req, res) => {
  const guardada = await notificaciones.guardarConfiguracion(
    req.repositorio,
    req.usuario,
    req.params.evento,
    req.body || {}
  );
  res.json({ evento: guardada });
});

/** Envía un aviso de prueba solo al administrador que lo pide. */
export const probar = asyncHandler(async (req, res) => {
  const avisos = await notificaciones.emitir(req.repositorio, {
    evento: 'prueba_notificacion',
    titulo: '🔔 Notificación de prueba',
    mensaje: 'Si ves este aviso en la campana, la configuración funciona.',
    severidad: 'info',
    paraUsuarios: [req.usuario.username],
    claveDedupe: `prueba_notificacion:${Date.now()}`
  });
  res.json({ avisos });
});
