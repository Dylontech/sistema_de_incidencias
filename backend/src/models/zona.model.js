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

/**
 * Tipos de zona admitidos: `localidad` es el nombre que usa el INEGI para las
 * comunidades (cabecera, tenencias, ranchos, colonias rurales) y `municipio`
 * se usa como zona única cuando un municipio no tiene localidades con polígono.
 */
export const TIPOS_ZONA = ['localidad', 'colonia', 'tenencia', 'zona', 'municipio'];

export function publica(zona) {
  if (!zona) return null;
  return {
    id: zona.id,
    municipioId: zona.municipioId,
    nombre: zona.nombre,
    tipo: zona.tipo,
    ambito: zona.ambito || null,
    clave: zona.clave || null,
    poblacion: Number(zona.poblacion) || 0,
    color: zona.color,
    poligono: zona.poligono
  };
}
