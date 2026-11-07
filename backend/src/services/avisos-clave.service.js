/**
 * AVISOS DE VENCIMIENTO DE CLAVES
 *
 * Las claves de acceso tienen fecha de vencimiento. Este proceso revisa las
 * claves activas y avisa a las cuentas vinculadas (y a la administración
 * responsable) cuando faltan 30, 20, 10, 5 o 0 días. Cada aviso se registra
 * en `avisos_clave_enviados` para no repetirlo en la siguiente pasada.
 */
import { config } from '../config/index.js';
import { ROLES_ADMIN } from '../config/constantes.js';
import { alcanceDe } from './alcance.service.js';
import { emitir } from './notificaciones.service.js';

const DIA_MS = 24 * 60 * 60 * 1000;

function fechaDia(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  // Se usa la fecha local del servidor: la clave se guarda con la hora local
  // del final del día, y así el aviso no se adelanta un día por UTC.
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** Diferencia en días de calendario entre hoy y el vencimiento. */
export function diasHastaVencimiento(expiraEn, ahora = new Date()) {
  const hoy = fechaDia(ahora);
  const vence = fechaDia(expiraEn);
  if (!hoy || !vence) return null;
  return Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / DIA_MS);
}

function umbrales() {
  return String(config.claves.diasAviso || '30,20,10,5,0')
    .split(',')
    .map((valor) => Number(valor.trim()))
    .filter((valor) => Number.isInteger(valor) && valor >= 0);
}

/** ¿El ámbito del administrador incluye el territorio de la clave? */
function adminAlcanzaClave(admin, clave, estadoPorMunicipio = new Map()) {
  const alcance = alcanceDe(admin);
  if (alcance.todos) return true;
  if (alcance.municipios) {
    return (clave.municipios || []).some((id) => alcance.municipios.has(String(id)));
  }
  if (alcance.estados) {
    if ((clave.estados || []).some((estado) => alcance.estados.has(estado))) return true;
    return (clave.municipios || []).some((id) =>
      alcance.estados.has(estadoPorMunicipio.get(String(id)))
    );
  }
  return false;
}

function mensajeAviso(clave, dias) {
  const fecha = fechaDia(clave.expiraEn) || 'sin fecha';
  const nombre = clave.nombre || 'tu clave de acceso';
  if (dias === 0) {
    return `La clave «${nombre}» vence hoy (${fecha}). Pide a la administración que la renueve antes de que termine el día; mañana las cuentas vinculadas ya no podrán entrar.`;
  }
  return `La clave «${nombre}» vence en ${dias} día(s) (${fecha}). Pide a la administración que la renueve antes de esa fecha para no perder el acceso.`;
}

/**
 * Recorre las claves y emite los avisos pendientes de cada umbral.
 * Devuelve cuántos avisos se crearon y cuántas claves se revisaron.
 */
export async function avisarVencimientos(repositorio, { ahora = new Date() } = {}) {
  if (!config.claves.avisosActivo) return { avisos: 0, claves: 0, umbrales: [] };
  const diasAviso = umbrales().sort((a, b) => a - b);
  if (!diasAviso.length) return { avisos: 0, claves: 0, umbrales: [] };

  const [claves, admins, catalogo] = await Promise.all([
    repositorio.todasLasClaves(),
    repositorio.usuariosPorRoles(ROLES_ADMIN),
    repositorio.municipiosLigeros()
  ]);
  const estadoPorMunicipio = new Map(
    (catalogo || []).map((municipio) => [String(municipio.id), municipio.estado])
  );
  let avisos = 0;
  let revisadas = 0;

  for (const clave of claves || []) {
    if (clave.activa === false || !clave.expiraEn) continue;
    const dias = diasHastaVencimiento(clave.expiraEn, ahora);
    if (dias === null || dias < 0) continue;
    // Se usa el umbral más alto que aún no se haya rebasado. Si el servidor
    // estuvo apagado el día exacto, el aviso se envía en la siguiente pasada.
    const umbral = diasAviso.find((valor) => dias <= valor);
    if (umbral === undefined) continue;
    revisadas++;

    const cuentas = (await repositorio.cuentasDeClave(clave.id)).filter(
      (cuenta) => cuenta.activo !== false && cuenta.username
    );
    const destinatarios = new Map();
    for (const cuenta of cuentas) {
      destinatarios.set(cuenta.username, { id: cuenta.id, admin: false });
    }
    for (const admin of admins || []) {
      if (admin.activo === false || !admin.username) continue;
      if (!adminAlcanzaClave(admin, clave, estadoPorMunicipio)) continue;
      if (!destinatarios.has(admin.username)) {
        destinatarios.set(admin.username, { id: admin.id, admin: true });
      }
    }

    for (const [username, info] of destinatarios) {
      if (await repositorio.avisoClaveRegistrado(clave.id, info.id, umbral)) continue;
      const enviado = await emitir(repositorio, {
        evento: 'clave_por_vencer',
        titulo:
          dias === 0
            ? `La clave «${clave.nombre || 'acceso'}» vence hoy`
            : `La clave «${clave.nombre || 'acceso'}» vence en ${dias} día(s)`,
        mensaje: mensajeAviso(clave, dias),
        severidad: dias === 0 ? 'alerta' : 'info',
        paraUsuarios: [username],
        municipioId: (clave.municipios || [])[0] || null,
        entidadTipo: 'clave',
        entidadId: clave.id,
        url: info.admin ? '/?panel=claves' : '/?perfil=1',
        claveDedupe: `clave_por_vencer:${clave.id}:${clave.expiraEn}:${umbral}:${username}`
      });
      if (enviado) {
        await repositorio.registrarAvisoClave({
          claveId: clave.id,
          usuarioId: info.id,
          umbralDias: umbral,
          diasRestantes: dias,
          claveExpiraEn: clave.expiraEn
        });
        avisos++;
      }
    }
  }

  return { avisos, claves: revisadas, umbrales: diasAviso };
}
