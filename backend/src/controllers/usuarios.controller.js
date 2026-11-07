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
import { asyncHandler, AppError } from '../utils/AppError.js';
import * as usuarios from '../services/usuarios.service.js';
import * as claves from '../services/claves.service.js';
import { esAlgunaAdmin } from '../services/alcance.service.js';
import { permisosDe } from '../services/permisos.service.js';
import { ROLES_ADMIN, ROLES_PERSONAL } from '../config/constantes.js';
import { nuevoId } from '../utils/ids.js';
import { hashIp } from '../utils/privacidad.js';
import { registrarAccion } from '../utils/auditoria.js';

/**
 * Generar una clave es de la administración: un funcionario puede usar la suya
 * para entrar, pero no crear claves para sí ni para nadie.
 */
function exigirPuedeGenerarClave(req) {
  if (req.body?.generarClave === true && !esAlgunaAdmin(req.usuario)) {
    throw AppError.prohibido('Solo los administradores pueden generar claves de acceso');
  }
}

/** Crea la clave si el panel la pidió; usos y vigencia son opcionales. */
async function claveSiSePidio(req, cuenta) {
  if (req.body?.generarClave !== true) return null;
  // Las cuentas administrativas no usan clave de activación: se autentican
  // por la puerta de administración y su ámbito lo define su rol.
  if (ROLES_ADMIN.includes(cuenta.rol)) return null;
  const usos = req.body.claveUsosMaximos;
  return claves.crearParaCuenta(req.repositorio, req.usuario, cuenta, {
    usosMaximos: usos === null || usos === undefined || usos === '' ? null : Number(usos),
    expiraEn: req.body.claveExpiraEn || null
  });
}

/**
 * Anota el acceso a una contraseña. El middleware de auditoría solo registra
 * escrituras, así que la consulta se graba aquí de forma explícita; nunca
 * guarda la contraseña, solo quién la consultó y por qué.
 */
async function auditarConsultaPassword(req, id, { resultado, motivo = '' }) {
  const repositorio = req.repositorio;
  if (!repositorio?.registrarAuditoria) return;
  const actor = req.usuario || {};
  await repositorio.registrarAuditoria({
    id: nuevoId(),
    usuarioId: actor.id || null,
    username: actor.username || null,
    userKey: actor.userKey || null,
    rol: actor.rol || null,
    claveId: actor.claveId || null,
    metodo: req.method,
    ruta: String(req.originalUrl || '').split('?')[0].slice(0, 240),
    estadoHttp: resultado,
    accion: 'consulta_password',
    entidad: 'usuarios',
    entidadId: String(id),
    detalle: JSON.stringify({ motivo: String(motivo || '').slice(0, 200), resultado }),
    ipHash: hashIp(req.ip),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    creadoEn: new Date().toISOString()
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
  exigirPuedeGenerarClave(req);
  const usuario = await usuarios.crear(req.repositorio, req.body || {}, { actor: req.usuario });
  const clave = await claveSiSePidio(req, usuario);
  res.status(201).json({ usuario, clave });
});

export const actualizar = asyncHandler(async (req, res) => {
  if (req.body?.generarClave === true) {
    throw AppError.solicitudInvalida(
      'La clave de acceso se genera al crear la cuenta. Para renovarla usa la acción de renovación.'
    );
  }
  const usuario = await usuarios.actualizar(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  res.json({ usuario });
});

/** Estado de la clave de activación de una cuenta (solo administración). */
export const estadoClave = asyncHandler(async (req, res) => {
  const cuenta = await req.repositorio.usuarioPorId(req.params.id);
  if (!cuenta) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(cuenta.rol)) {
    throw AppError.prohibido('Esa cuenta no es del personal del sistema');
  }
  if (ROLES_ADMIN.includes(cuenta.rol) && !esAlgunaAdmin(req.usuario)) {
    throw AppError.prohibido('Solo la administración consulta las claves de administración');
  }
  const clave = cuenta.claveId
    ? await req.repositorio.claveAccesoPorId(cuenta.claveId)
    : null;
  await registrarAccion(req, {
    accion: 'consulta_clave_usuario',
    entidad: 'usuarios',
    entidadId: cuenta.id,
    detalle: { claveId: clave?.id || null, username: cuenta.username }
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    cuenta: {
      id: cuenta.id,
      username: cuenta.username,
      nombre: cuenta.nombre,
      claveId: cuenta.claveId || null,
      claveActivadaEn: cuenta.claveActivadaEn || null,
      claveVigenteHasta: cuenta.claveVigenteHasta || null
    },
    clave: clave
      ? {
          id: clave.id,
          codigo: clave.codigo,
          nombre: clave.nombre,
          modo: clave.modo,
          activa: clave.activa,
          usos: clave.usos,
          usosMaximos: clave.usosMaximos,
          expiraEn: clave.expiraEn,
          activadaEn: clave.activadaEn,
          activadaPorUsuarioId: clave.activadaPorUsuarioId
        }
      : null
  });
});

/** Vincula una clave a una cuenta que aún no tiene acceso (solo administración). */
export const vincularClave = asyncHandler(async (req, res) => {
  const resultado = await claves.vincularACuenta(
    req.repositorio,
    req.usuario,
    req.params.id,
    {
      claveId: req.body?.claveId || null,
      generarClave: req.body?.generarClave === true,
      claveExpiraEn: req.body?.claveExpiraEn || null
    }
  );
  await registrarAccion(req, {
    accion: 'clave_vinculada',
    entidad: 'usuarios',
    entidadId: req.params.id,
    detalle: {
      claveId: resultado.clave?.id || null,
      generada: req.body?.generarClave === true
    }
  });
  res.status(201).json(resultado);
});

/** Renueva la clave de activación de una cuenta (solo administración). */
export const renovarClave = asyncHandler(async (req, res) => {
  const cuenta = await req.repositorio.usuarioPorId(req.params.id);
  if (!cuenta) throw AppError.noEncontrado('Usuario no encontrado');
  if (!ROLES_PERSONAL.includes(cuenta.rol) || ROLES_ADMIN.includes(cuenta.rol)) {
    throw AppError.prohibido('Las claves de activación son para cuentas de personal no administrativo');
  }
  const alcance = await req.repositorio.alcanceDeUsuario(cuenta.id);
  const clave = await claves.crearParaCuenta(
    req.repositorio,
    req.usuario,
    {
      ...cuenta,
      municipios: alcance.municipios.length
        ? alcance.municipios
        : cuenta.municipioId
          ? [cuenta.municipioId]
          : [],
      estados: alcance.estados,
      permisosEfectivos: permisosDe(cuenta)
    },
    { expiraEn: req.body?.claveExpiraEn || null }
  );
  if (!clave) {
    throw AppError.solicitudInvalida(
      'La cuenta no tiene municipios o estados para asignarle una clave'
    );
  }
  await registrarAccion(req, {
    accion: 'clave_renovada',
    entidad: 'usuarios',
    entidadId: cuenta.id,
    detalle: { claveId: clave.id, username: cuenta.username }
  });
  res.status(201).json({ clave });
});

/** Baja lógica: desactiva la cuenta sin borrar su historial. */
export const eliminar = asyncHandler(async (req, res) => {
  res.json({ usuario: await usuarios.eliminar(req.repositorio, req.usuario, req.params.id) });
});

/** Reactiva una cuenta dada de baja (baja lógica reversible). */
export const reactivar = asyncHandler(async (req, res) => {
  const usuario = await usuarios.reactivar(req.repositorio, req.usuario, req.params.id);
  await registrarAccion(req, {
    accion: 'usuario_reactivado',
    entidad: 'usuarios',
    entidadId: usuario.id,
    detalle: { username: usuario.username, rol: usuario.rol }
  });
  res.json({ usuario });
});

/** Consulta auditada de la contraseña de una cuenta. */
export const revelarPassword = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const resultado = await usuarios.revelarPassword(req.repositorio, req.usuario, req.params.id);
    await auditarConsultaPassword(req, req.params.id, {
      resultado: 200,
      motivo: req.query.motivo
    });
    res.json(resultado);
  } catch (error) {
    await auditarConsultaPassword(req, req.params.id, {
      resultado: error?.estado || 500,
      motivo: req.query.motivo
    });
    throw error;
  }
});

/** Restablece la contraseña y devuelve la nueva una única vez. */
export const restablecerPassword = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const resultado = await usuarios.restablecerPassword(
    req.repositorio,
    req.usuario,
    req.params.id,
    req.body || {}
  );
  res.json(resultado);
});
