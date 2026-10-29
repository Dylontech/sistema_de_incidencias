/**
 * Controlador HTTP de usuarios.
 *
 * `GET /usuarios` sirve al panel (funcionario y admin): solo devuelve cuentas
 * del personal y sin hashes. El alta y la edición son exclusivas del
 * administrador (`requiereAdmin` en las rutas).
 *
 * Si el panel pide `generarClave`, el alta/edición devuelve además una clave de
 * acceso para los municipios de la cuenta: es el segundo factor que exige el
 * inicio de sesión del personal y solo se muestra una vez.
 */
import { asyncHandler } from '../utils/AppError.js';
import * as usuarios from '../services/usuarios.service.js';
import * as claves from '../services/claves.service.js';

/** Crea la clave si el panel la pidió; usos y vigencia son opcionales. */
async function claveSiSePidio(req, cuenta) {
  if (req.body?.generarClave !== true) return null;
  const usos = req.body.claveUsosMaximos;
  return claves.crearParaCuenta(req.repositorio, req.usuario, cuenta, {
    usosMaximos: usos === null || usos === undefined || usos === '' ? null : Number(usos),
    expiraEn: req.body.claveExpiraEn || null
  });
}

export const listar = asyncHandler(async (req, res) => {
  res.json({
    usuarios: await usuarios.listar(req.repositorio, req.usuario, {
      tipo: req.query.tipo === 'ciudadanos' ? 'ciudadanos' : 'personal'
    })
  });
});

export const crear = asyncHandler(async (req, res) => {
  const usuario = await usuarios.crear(req.repositorio, req.body || {}, { actor: req.usuario });
  const clave = await claveSiSePidio(req, usuario);
  res.status(201).json({ usuario, clave });
});

export const actualizar = asyncHandler(async (req, res) => {
  const usuario = await usuarios.actualizar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  const clave = await claveSiSePidio(req, usuario);
  res.json({ usuario, clave });
});
