/**
 * Middleware de contexto: cada petición lleva su repositorio ya inicializado.
 * Los controladores nunca importan la fábrica ni conocen el driver.
 */
import { obtenerRepositorio } from '../repositories/index.js';

export async function inyectarRepositorio(req, res, next) {
  try {
    req.repositorio = await obtenerRepositorio();
    next();
  } catch (e) {
    next(e);
  }
}
