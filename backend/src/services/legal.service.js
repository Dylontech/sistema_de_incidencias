/**
 * SERVICIO: documentos legales editables.
 *
 * Cada clave tiene un borrador y una versión publicada. Publicar copia el
 * borrador, incrementa la versión y guarda una instantánea en el historial.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { sanitizarHtml } from '../utils/html-seguro.js';

export const CLAVES_LEGALES = ['terminos', 'privacidad', 'acerca'];

export const TITULOS_LEGALES = {
  terminos: 'Términos y condiciones',
  privacidad: 'Aviso de privacidad',
  acerca: 'Acerca de este sistema'
};

export const CONTENIDO_POR_DEFECTO = {
  terminos: `
<h2>Términos y condiciones de uso</h2>
<p>Este sistema es una herramienta de participación ciudadana para reportar y dar seguimiento a incidencias municipales. No sustituye los canales oficiales de una autoridad gubernamental.</p>
<h3>Uso responsable</h3>
<ul>
  <li>Publica información veraz y relacionada con el municipio.</li>
  <li>No compartas datos personales de terceros sin su consentimiento.</li>
  <li>El mal uso, el spam o las amenazas pueden provocar restricciones o la suspensión de la cuenta.</li>
</ul>
<h3>Contenido</h3>
<p>Las fotografías y comentarios que publiques pueden ser revisados por el personal municipal y por moderación. El contenido oculto o eliminado conserva un registro de auditoría para atender denuncias.</p>
<h3>Disponibilidad</h3>
<p>El servicio puede suspenderse por mantenimiento. Los respaldos y la información se resguardan conforme al aviso de privacidad.</p>
`.trim(),
  privacidad: `
<h2>Aviso de privacidad</h2>
<p>Los datos que proporcionas se utilizan para atender reportes, dar seguimiento a solicitudes y enviarte avisos relacionados con el servicio.</p>
<h3>Datos que se recaban</h3>
<ul>
  <li>Datos de la cuenta: nombre o pseudónimo, correo y municipio.</li>
  <li>Contenido del reporte: descripción, ubicación, fotografías y comentarios.</li>
  <li>Datos técnicos mínimos: dirección IP convertida en huella y agente del navegador.</li>
</ul>
<h3>Finalidades</h3>
<p>Los datos se usan para operar el sistema, enviar notificaciones, generar informes agregados y atender obligaciones legales. No se venden ni se comparten con terceros ajenos al servicio.</p>
<h3>Derechos ARCO</h3>
<p>Puedes solicitar acceso, rectificación, cancelación u oposición escribiendo al correo de contacto del responsable del sistema.</p>
<h3>Conservación</h3>
<p>La información se conserva mientras sea necesaria para el servicio y los respaldos configurados. Los registros de auditoría pueden conservarse por más tiempo para atender denuncias.</p>
`.trim(),
  acerca: `
<h2>Acerca de este sistema</h2>
<p>El Sistema de Incidencias Municipales es una plataforma abierta para reportar problemas urbanos y viales, dar seguimiento a su atención y facilitar la comunicación entre la ciudadanía y el personal municipal.</p>
<h3>Qué puedes hacer</h3>
<ul>
  <li>Reportar incidencias de forma anónima o con una cuenta.</li>
  <li>Consultar el mapa, las capas de satélite, calles y relieve.</li>
  <li>Comentar, firmar y compartir reportes.</li>
  <li>Solicitar informes y consultar tus folios.</li>
</ul>
<h3>Tecnología</h3>
<p>Está construido con software libre: Node.js, Express, MariaDB, Leaflet, OpenStreetMap, OpenTopoMap y Esri. Los mapas offline se generan con datos abiertos.</p>
<h3>Contacto</h3>
<p>Para dudas, mejoras o reportes de seguridad utiliza el módulo de soporte o el correo de contacto publicado por el administrador.</p>
`.trim()
};

function texto(valor, campo, { requerido = false, max = 200000 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida('Documento inválido', [
      { campo, mensaje: 'Este campo es obligatorio' }
    ]);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida('Documento inválido', [
      { campo, mensaje: `No puede exceder ${max} caracteres` }
    ]);
  }
  return limpio;
}

function validarClave(clave) {
  if (!CLAVES_LEGALES.includes(clave)) {
    throw AppError.noEncontrado('Documento legal no encontrado');
  }
}

function conDefecto(clave, fila) {
  const base = CONTENIDO_POR_DEFECTO[clave];
  return {
    clave,
    titulo: fila?.titulo || TITULOS_LEGALES[clave],
    htmlPublicado: fila?.htmlPublicado || base,
    versionPublicada: Number(fila?.versionPublicada) || 0,
    publicadoPor: fila?.publicadoPor || null,
    publicadoEn: fila?.publicadoEn || null,
    htmlBorrador: fila?.htmlBorrador || base,
    actualizadoPor: fila?.actualizadoPor || null,
    actualizadoEn: fila?.actualizadoEn || null
  };
}

/** Solo la versión publicada (público). */
export async function publicado(repositorio, clave) {
  validarClave(clave);
  const fila = await repositorio.documentoLegal(clave);
  const documento = conDefecto(clave, fila);
  return {
    clave,
    titulo: documento.titulo,
    html: documento.htmlPublicado,
    version: documento.versionPublicada,
    publicadoPor: documento.publicadoPor,
    publicadoEn: documento.publicadoEn
  };
}

export async function listarPublicados(repositorio) {
  const documentos = await Promise.all(CLAVES_LEGALES.map((clave) => publicado(repositorio, clave)));
  return documentos.map(({ clave, titulo, version, publicadoEn }) => ({
    clave,
    titulo,
    version,
    publicadoEn
  }));
}

/** Vista del administrador: borrador, publicado e historial. */
export async function administrar(repositorio, clave) {
  validarClave(clave);
  const fila = await repositorio.documentoLegal(clave);
  return {
    documento: conDefecto(clave, fila),
    historial: await repositorio.historialLegal(clave)
  };
}

export async function listarAdministracion(repositorio) {
  return Promise.all(CLAVES_LEGALES.map((clave) => administrar(repositorio, clave)));
}

export async function guardarBorrador(repositorio, actor, clave, datos = {}) {
  validarClave(clave);
  const titulo = texto(datos.titulo || TITULOS_LEGALES[clave], 'titulo', {
    requerido: true,
    max: 160
  });
  const html = sanitizarHtml(texto(datos.html, 'html', { requerido: true, max: 200000 }));
  if (html.length < 20) {
    throw AppError.solicitudInvalida('El contenido es demasiado corto');
  }
  return repositorio.guardarDocumentoLegal(clave, {
    titulo,
    htmlBorrador: html,
    actualizadoPor: actor?.username || null,
    actualizadoEn: new Date().toISOString()
  });
}

export async function publicar(repositorio, actor, clave) {
  validarClave(clave);
  const fila = await repositorio.documentoLegal(clave);
  const documento = conDefecto(clave, fila);
  const html = sanitizarHtml(documento.htmlBorrador);
  if (!html || html.length < 20) {
    throw AppError.solicitudInvalida('No hay un borrador válido para publicar');
  }
  const version = documento.versionPublicada + 1;
  const publicadoEn = new Date().toISOString();
  const actualizado = await repositorio.guardarDocumentoLegal(clave, {
    titulo: documento.titulo,
    htmlPublicado: html,
    versionPublicada: version,
    publicadoPor: actor?.username || null,
    publicadoEn,
    htmlBorrador: html,
    actualizadoPor: actor?.username || null,
    actualizadoEn: publicadoEn
  });
  await repositorio.crearVersionLegal({
    id: nuevoId(),
    clave,
    version,
    titulo: documento.titulo,
    html,
    publicadoPor: actor?.username || null,
    publicadoEn
  });
  return actualizado;
}

export async function restaurar(repositorio, actor, clave, version) {
  validarClave(clave);
  const anterior = await repositorio.versionLegal(clave, version);
  if (!anterior) throw AppError.noEncontrado('Versión no encontrada');
  return repositorio.guardarDocumentoLegal(clave, {
    titulo: anterior.titulo,
    htmlBorrador: sanitizarHtml(anterior.html),
    actualizadoPor: actor?.username || null,
    actualizadoEn: new Date().toISOString()
  });
}

export async function historial(repositorio, clave) {
  validarClave(clave);
  return repositorio.historialLegal(clave);
}
