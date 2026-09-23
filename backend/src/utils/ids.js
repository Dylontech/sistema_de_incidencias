import { randomUUID } from 'node:crypto';

/**
 * Identificador único de los documentos.
 * Se prefiere UUID v4 sobre el `uid()` del monolito (fecha + azar en base36)
 * para no filtrar información temporal y evitar colisiones.
 */
export function nuevoId() {
  return randomUUID();
}

/** Identificador con prefijo, útil para tipos personalizados. */
export function nuevoIdConPrefijo(prefijo) {
  return `${prefijo}_${randomUUID()}`;
}
