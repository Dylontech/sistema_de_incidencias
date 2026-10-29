/** SERVICIO: Tipos de incidencia (catálogo). */
import { AppError } from '../utils/AppError.js';
import { validarEntrada, construirTipo, esPersonalizado, nombreRepetido } from '../models/tipo.model.js';
import { puedeOperar } from './alcance.service.js';

export async function listar(repositorio) {
  return repositorio.todosLosTipos();
}

export async function crear(repositorio, usuario, datos) {
  if (!puedeOperar(usuario)) {
    throw AppError.prohibido('Tu cuenta es de solo lectura: no puede crear tipos');
  }

  const entrada = validarEntrada(datos);
  const tipos = await repositorio.todosLosTipos();
  if (nombreRepetido(tipos, entrada.nombre)) {
    throw AppError.conflicto('Ya existe un tipo con ese nombre');
  }

  return repositorio.crearTipo(construirTipo(entrada));
}

export async function eliminar(repositorio, usuario, id) {
  if (!puedeOperar(usuario)) {
    throw AppError.prohibido('Tu cuenta es de solo lectura: no puede eliminar tipos');
  }

  const tipo = await repositorio.tipoPorId(id);
  if (!tipo) throw AppError.noEncontrado('Tipo no encontrado');
  if (!esPersonalizado(tipo)) {
    throw AppError.solicitudInvalida('Solo se pueden eliminar los tipos personalizados');
  }

  await repositorio.eliminarTipo(id);
  return { eliminado: true, id };
}
