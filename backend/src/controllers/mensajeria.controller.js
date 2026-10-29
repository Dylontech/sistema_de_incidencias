/** Controlador de contacto, sugerencias y mensajería interna. */
import { asyncHandler } from '../utils/AppError.js';
import * as contacto from '../services/contacto.service.js';
import * as sugerencias from '../services/sugerencias.service.js';
import * as mensajeria from '../services/mensajeria.service.js';

/* ------------------------------- contacto -------------------------------- */

export const listarContacto = asyncHandler(async (req, res) => {
  const mensajes = await contacto.listar(req.repositorio, req.usuario, {
    estado: req.query.estado || null,
    limite: Number(req.query.limite) || 200
  });
  res.json({ mensajes });
});

export const responderContacto = asyncHandler(async (req, res) => {
  const mensaje = await contacto.responder(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.respuesta || ''
  );
  res.json({ mensaje });
});

/* ------------------------------ sugerencias ------------------------------- */

export const listarSugerencias = asyncHandler(async (req, res) => {
  const lista = await sugerencias.listar(req.repositorio, req.usuario, {
    estado: req.query.estado || null,
    municipio: req.query.municipio || null,
    limite: Number(req.query.limite) || 200
  });
  res.json({ sugerencias: lista });
});

export const responderSugerencia = asyncHandler(async (req, res) => {
  const sugerencia = await sugerencias.responder(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body?.respuesta || ''
  );
  res.json({ sugerencia });
});

/* ------------------------------- mensajería ------------------------------- */

export const bandeja = asyncHandler(async (req, res) => {
  res.json({ hilos: await mensajeria.bandeja(req.repositorio, req.usuario) });
});

export const hilo = asyncHandler(async (req, res) => {
  res.json({ mensajes: await mensajeria.hilo(req.repositorio, req.usuario, req.params.hilo) });
});

export const enviarMensaje = asyncHandler(async (req, res) => {
  const mensaje = await mensajeria.enviar(req.repositorio, req.usuario, req.body || {});
  res.status(201).json({ mensaje });
});

export const marcarLeido = asyncHandler(async (req, res) => {
  res.json({ mensaje: await mensajeria.marcarLeido(req.repositorio, req.usuario, req.params.id) });
});

export const noLeidos = asyncHandler(async (req, res) => {
  res.json({ noLeidos: await mensajeria.noLeidos(req.repositorio, req.usuario) });
});
