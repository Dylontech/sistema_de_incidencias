/**
 * Bitácora de auditoría.
 *
 * Registra toda petición que modifica datos (POST, PUT, PATCH y DELETE), venga
 * de una sesión anónima, ciudadana o del personal. Se guarda el actor, su rol y
 * sus permisos, la ruta, el resultado HTTP, la clave de acceso usada y una
 * huella de la IP. El cuerpo se sanea: contraseñas, tokens y claves nunca se
 * escriben en la bitácora.
 *
 * El registro se hace al terminar la respuesta y no bloquea la petición.
 */
import { nuevoId } from '../utils/ids.js';
import { hashIp } from '../utils/privacidad.js';

const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXCLUIR = [/^\/api\/salud\b/, /^\/api\/eventos\b/];
const CLAVES_OCULTAS = new Set([
  'password',
  'contrasena',
  'contraseña',
  'clave',
  'claveAcceso',
  'claveMunicipio',
  'token',
  'authorization',
  'passwordhash',
  'passwordHash',
  'secreto'
]);

function sanear(valor, profundidad = 0) {
  if (profundidad > 4) return '[…]';
  if (Array.isArray(valor)) return valor.slice(0, 50).map((item) => sanear(item, profundidad + 1));
  if (valor && typeof valor === 'object') {
    const salida = {};
    for (const [clave, dato] of Object.entries(valor)) {
      salida[clave] = CLAVES_OCULTAS.has(clave) ? '[omitido]' : sanear(dato, profundidad + 1);
    }
    return salida;
  }
  if (typeof valor === 'string' && valor.length > 500) return `${valor.slice(0, 500)}…`;
  return valor;
}

function datosDeRuta(ruta) {
  const partes = String(ruta || '').split('/').filter(Boolean);
  const indiceAdmin = partes.indexOf('admin');
  if (indiceAdmin >= 0) {
    return { entidad: partes[indiceAdmin + 1] || null, entidadId: partes[indiceAdmin + 2] || null };
  }
  return { entidad: partes[1] || null, entidadId: partes[2] || null };
}

export function auditar(req, res, next) {
  if (!METODOS.has(req.method)) return next();
  const ruta = String(req.originalUrl || '').split('?')[0];
  if (EXCLUIR.some((patron) => patron.test(ruta))) return next();

  // Se guarda el cuerpo de la respuesta para poder anotar el id de lo creado.
  let respuesta = null;
  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => {
    respuesta = cuerpo;
    return jsonOriginal(cuerpo);
  };

  res.on('finish', () => {
    const repositorio = req.repositorio;
    if (!repositorio?.registrarAuditoria) return;

    const esImportacion = ruta.startsWith('/api/admin/importar');
    const cuerpo = esImportacion
      ? '[omitido: importación]'
      : req.is('multipart/form-data')
        ? '[formulario con archivo]'
        : sanear(req.body || {});
    const { entidad, entidadId } = datosDeRuta(ruta);
    const esAuth = ruta.startsWith('/api/auth/');
    const usuarioRespuesta = respuesta?.usuario || null;
    const actor = req.usuario || {};
    // En el login todavía no hay sesión: el actor real es el usuario que
    // devuelve la respuesta (o el nombre que se intentó usar).
    const identidad = esAuth && usuarioRespuesta ? usuarioRespuesta : actor;
    const permisos = Array.isArray(identidad.permisos)
      ? identidad.permisos
      : Array.isArray(actor.permisos)
        ? actor.permisos
        : undefined;
    const idDeRespuesta =
      respuesta?.clave?.id ||
      respuesta?.incidencia?.id ||
      respuesta?.usuario?.id ||
      respuesta?.registro?.id ||
      respuesta?.id ||
      null;
    const detalle = JSON.stringify({
      body: cuerpo,
      query: sanear(req.query || {}),
      params: sanear(req.params || {}),
      permisos,
      resultadoId: idDeRespuesta || undefined
    });

    repositorio
      .registrarAuditoria({
        id: nuevoId(),
        usuarioId: identidad.id || null,
        username:
          identidad.username ||
          req.body?.username ||
          req.body?.nombre ||
          req.body?.correo ||
          null,
        userKey: identidad.userKey || null,
        rol: identidad.rol || null,
        claveId: identidad.claveId || null,
        metodo: req.method,
        ruta: ruta.slice(0, 240),
        estadoHttp: res.statusCode,
        accion: `${req.method} ${ruta}`.slice(0, 160),
        entidad: entidad ? String(entidad).slice(0, 80) : null,
        entidadId: entidadId
          ? String(entidadId).slice(0, 120)
          : idDeRespuesta
            ? String(idDeRespuesta).slice(0, 120)
            : null,
        detalle: detalle.length > 8000 ? `${detalle.slice(0, 8000)}…` : detalle,
        ipHash: hashIp(req.ip),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
        creadoEn: new Date().toISOString()
      })
      .catch((error) => {
        // En las pruebas el directorio temporal se borra al terminar y la
        // escritura diferida puede llegar tarde; no es un fallo real.
        if (process.env.NODE_ENV !== 'test') {
          console.error('[auditoria] no se pudo registrar la acción:', error.message);
        }
      });
  });

  next();
}
