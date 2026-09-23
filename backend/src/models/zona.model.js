/**
 * MODELO: Zona de responsabilidad (colonia / tenencia).
 *
 * El polígono es una lista de vértices [lat, lng] sin cerrar (el último se une
 * con el primero). Es la base de la geocerca estricta de reportes, que en la
 * versión nueva del monolito son polígonos geográficos reales (antes eran
 * rectángulos de una cuadrícula).
 *
 * La geometría vive en utils/geometria.js, compartida con el municipio.
 */
import {
  bboxDePoligono,
  centroDePoligono,
  poligonoValido
} from '../utils/geometria.js';

export { bboxDePoligono, centroDePoligono, poligonoValido };

export const TIPOS_ZONA = ['colonia', 'tenencia', 'zona'];

export function publica(zona) {
  if (!zona) return null;
  return {
    id: zona.id,
    municipioId: zona.municipioId,
    nombre: zona.nombre,
    tipo: zona.tipo,
    color: zona.color,
    poligono: zona.poligono
  };
}
