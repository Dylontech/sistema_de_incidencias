/** Utilidades de fecha compartidas por modelos y servicios. */

export function ahoraIso() {
  return new Date().toISOString();
}

export function fechaValida(valor) {
  if (!valor) return false;
  const d = new Date(valor);
  return !Number.isNaN(d.getTime());
}

/** Días completos transcurridos desde una fecha ISO. */
export function diasDesde(iso, ahora = new Date()) {
  if (!fechaValida(iso)) return 0;
  const diff = ahora.getTime() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}
