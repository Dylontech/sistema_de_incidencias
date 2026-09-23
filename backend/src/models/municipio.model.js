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

/** Vista pública del municipio. `incluirClave` solo para admin. */
export function publico(municipio, { incluirClave = false } = {}) {
  if (!municipio) return null;
  const { clave, ...resto } = municipio;
  return incluirClave ? { ...resto, clave } : resto;
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
