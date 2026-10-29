/**
 * Aceptaciones legales versionadas.
 *
 * La aceptación cubre términos y aviso de privacidad al mismo tiempo. Se
 * guarda por `userKey` (usuario registrado o identidad anónima del navegador)
 * para poder exigirla también en el servidor. Las aceptaciones anteriores se
 * conservan: al publicar una versión nueva se añade otra fila y la anterior
 * deja de ser vigente.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { hashIp } from '../utils/privacidad.js';
import * as legal from './legal.service.js';

export const CLAVES_ACEPTACION = ['terminos', 'privacidad'];

function versionDe(documento) {
  return Number(documento?.version) || 0;
}

async function documentosVigentes(repositorio) {
  const documentos = await Promise.all(
    CLAVES_ACEPTACION.map((clave) => legal.publicado(repositorio, clave))
  );
  return {
    documentos,
    versiones: {
      terminos: versionDe(documentos[0]),
      privacidad: versionDe(documentos[1])
    }
  };
}

function coinciden(ultima, versiones) {
  return Boolean(
    ultima &&
      Number(ultima.versionTerminos) === versiones.terminos &&
      Number(ultima.versionPrivacidad) === versiones.privacidad
  );
}

/** Versiones vigentes sin cargar el HTML completo de los documentos. */
export async function versionesVigentes(repositorio) {
  const [terminos, privacidad] = await Promise.all([
    repositorio.documentoLegal('terminos'),
    repositorio.documentoLegal('privacidad')
  ]);
  return {
    terminos: Number(terminos?.versionPublicada) || 0,
    privacidad: Number(privacidad?.versionPublicada) || 0
  };
}

/** Comprobación usada por el middleware antes de las acciones de escritura. */
export async function aceptacionVigente(repositorio, usuario) {
  const versiones = await versionesVigentes(repositorio);
  const ultima = usuario?.userKey
    ? await repositorio.ultimaAceptacionLegal(usuario.userKey)
    : null;
  return { vigente: coinciden(ultima, versiones), versiones, ultima };
}

/** Estado para el onboarding: documentos, versiones y aceptación vigente. */
export async function estadoAceptacion(repositorio, usuario) {
  const { documentos, versiones } = await documentosVigentes(repositorio);
  const ultima = usuario?.userKey
    ? await repositorio.ultimaAceptacionLegal(usuario.userKey)
    : null;
  return {
    aceptada: coinciden(ultima, versiones),
    aceptadoEn: ultima?.aceptadoEn || null,
    versiones,
    documentos: documentos.map((documento) => ({
      clave: documento.clave,
      titulo: documento.titulo,
      version: versionDe(documento),
      publicadoEn: documento.publicadoEn || null,
      html: documento.html || ''
    }))
  };
}

/** Guarda una aceptación nueva de la pareja de versiones vigente. */
export async function aceptar(repositorio, usuario, datos = {}, meta = {}) {
  if (!usuario?.userKey) throw AppError.noAutenticado('Inicia sesión para aceptar los términos');

  const { documentos, versiones } = await documentosVigentes(repositorio);
  const terminos = Number(datos.terminos);
  const privacidad = Number(datos.privacidad);
  if (terminos !== versiones.terminos || privacidad !== versiones.privacidad) {
    throw AppError.conflicto('Los términos cambiaron. Revisa la versión publicada y vuelve a aceptar.', {
      codigo: 'terminos_actualizados',
      versiones,
      documentos
    });
  }

  const ultima = await repositorio.ultimaAceptacionLegal(usuario.userKey);
  if (coinciden(ultima, versiones)) {
    return {
      aceptada: true,
      yaAceptada: true,
      aceptadoEn: ultima.aceptadoEn,
      versiones
    };
  }

  const registro = {
    id: nuevoId(),
    usuarioId: usuario.id || null,
    userKey: usuario.userKey,
    versionTerminos: versiones.terminos,
    versionPrivacidad: versiones.privacidad,
    aceptadoEn: new Date().toISOString(),
    ipHash: hashIp(meta.ip),
    userAgent: String(meta.userAgent || '').slice(0, 255)
  };
  await repositorio.registrarAceptacionLegal(registro);

  return {
    aceptada: true,
    aceptadoEn: registro.aceptadoEn,
    versiones
  };
}
