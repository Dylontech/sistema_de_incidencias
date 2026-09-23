/**
 * MODELO: Municipio.
 *
 * La `clave` es el código de acceso que pide el login de funcionarios y el
 * cambio de municipio; solo se expone a los administradores.
 *
 * En la versión nueva del monolito el municipio define su límite con un
 * polígono real (`poligono`) en lugar del rectángulo `bbox` anterior.
 */
import { bboxDePoligono, centroDePoligono, poligonoValido } from '../utils/geometria.js';

export { poligonoValido };

export function normalizarClave(clave) {
  return String(clave || '').trim().toUpperCase();
}

export function coincideClave(municipio, clave) {
  return !!municipio && normalizarClave(municipio.clave) === normalizarClave(clave);
}

/**
 * Vista pública del municipio.
 *
 * `incluirPoligono` se desactiva en el listado: con 113 municipios del estado
 * los límites suman más de un megabyte y el selector solo necesita nombre,
 * centro y zoom. El polígono se pide aparte para el municipio activo.
 */
export function publico(municipio, { incluirClave = false, incluirPoligono = true } = {}) {
  if (!municipio) return null;
  const { clave, poligono, ...resto } = municipio;
  const salida = incluirPoligono ? { ...resto, poligono } : resto;
  return incluirClave ? { ...salida, clave } : salida;
}

/** Envolvente del municipio, usada para encuadrar el mapa y filtrar rápido. */
export function bounds(municipio) {
  if (!municipio?.poligono) return null;
  return bboxDePoligono(municipio.poligono);
}

/** Centro del municipio (el declarado o, si falta, el centroide). */
export function centro(municipio) {
  if (municipio?.center) return municipio.center.map(Number);
  if (!municipio?.poligono) return null;
  return centroDePoligono(municipio.poligono);
}

/** Un municipio es utilizable si tiene identificador, nombre, clave y polígono. */
export function municipioValido(municipio) {
  return Boolean(
    municipio?.id && municipio?.nombre && municipio?.clave && poligonoValido(municipio.poligono)
  );
}
