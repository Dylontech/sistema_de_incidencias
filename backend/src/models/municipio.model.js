/**
 * MODELO: Municipio.
 * La `clave` es el código de acceso que pide el login de funcionarios y el
 * cambio de municipio; solo se expone a los administradores.
 */
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

export function centroValido(municipio) {
  return (
    Array.isArray(municipio?.center) &&
    municipio.center.length === 2 &&
    municipio.center.every((n) => Number.isFinite(Number(n)))
  );
}
