/**
 * SERVICIO: correo saliente por SMTP (nodemailer, open source).
 *
 * - Sin `SMTP_HOST` o con `MAIL_DRY_RUN=true` no se envía nada: se registra
 *   como «simulado». Así el desarrollo y las pruebas no dependen de un buzón.
 * - Hay un límite de envíos por minuto para no saturar el servidor SMTP ni el
 *   propio proceso; la cola de solicitudes ya envía de una en una.
 * - Cada intento queda en `envios_correo` (sin guardar el cuerpo del mensaje).
 */
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { nuevoId } from '../utils/ids.js';

let transporte = null;
const marcasDeEnvio = [];

function obtenerTransporte() {
  if (transporte) return transporte;
  transporte = nodemailer.createTransport({
    host: config.correo.host,
    port: config.correo.port,
    secure: config.correo.secure,
    auth: config.correo.user
      ? { user: config.correo.user, pass: config.correo.pass }
      : undefined,
    // Sin esto, un SMTP caído puede dejar la petición colgada mucho tiempo.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  return transporte;
}

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Espera si ya se alcanzó el límite de envíos por minuto. */
async function esperarTurno() {
  const maximo = Math.max(1, Number(config.correo.maxPorMinuto) || 20);
  const ahora = Date.now();
  while (marcasDeEnvio.length && ahora - marcasDeEnvio[0] > 60000) marcasDeEnvio.shift();
  if (marcasDeEnvio.length < maximo) {
    marcasDeEnvio.push(ahora);
    return;
  }
  const espera = 60000 - (ahora - marcasDeEnvio[0]) + 50;
  await dormir(espera);
  return esperarTurno();
}

/** Envoltura HTML común: cabecera, contenido y pie con privacidad. */
export function plantilla({ titulo, contenido, pie = '' }) {
  const url = config.publico.urlBase || '';
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:0 auto;padding:24px 16px">
    <div style="background:#006657;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
      <div style="font-size:18px;font-weight:700">Sistema de Incidencias Municipales</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">${escapar(titulo)}</div>
    </div>
    <div style="background:#fff;padding:22px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
      ${contenido}
      ${pie ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${pie}</div>` : ''}
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
        Este mensaje se envió automáticamente. No compartas tus contraseñas con nadie.
        ${url ? `<br><a href="${escapar(url)}" style="color:#006657">${escapar(url)}</a>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textoDeHtml(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Envía (o simula) un correo y lo registra. Nunca lanza: devuelve
 * `{ ok, simulado, error }` para que la cola decida si reintenta.
 */
export async function enviarCorreo(
  repositorio,
  { para, asunto, html, texto = '', tipo = 'general', attachments = undefined }
) {
  const envio = {
    id: nuevoId(),
    para,
    asunto,
    tipo,
    creadoEn: new Date().toISOString()
  };

  const simulado =
    !config.correo.activo || config.correo.dryRun || !config.correo.host || !para;

  if (simulado) {
    console.log(`[correo] simulado → ${para}: ${asunto}`);
    const registro = { ...envio, estado: 'simulado', error: '' };
    await repositorio?.registrarEnvioCorreo?.(registro);
    return { ok: true, simulado: true };
  }

  try {
    await esperarTurno();
    await obtenerTransporte().sendMail({
      from: config.correo.from,
      to: para,
      replyTo: config.correo.replyTo || undefined,
      subject: asunto,
      text: texto || textoDeHtml(html),
      html,
      attachments
    });
    await repositorio?.registrarEnvioCorreo?.({ ...envio, estado: 'enviado', error: '' });
    return { ok: true, simulado: false };
  } catch (error) {
    console.error('[correo] no se pudo enviar:', error.message);
    await repositorio?.registrarEnvioCorreo?.({
      ...envio,
      estado: 'error',
      error: String(error.message || 'error').slice(0, 800)
    });
    return { ok: false, simulado: false, error };
  }
}

/** Correo de doble opt-in para confirmar una solicitud de informe. */
export function enviarVerificacion(repositorio, solicitud) {
  const base = config.publico.urlBase || 'http://localhost:3000';
  const enlace = `${base}/?verificar=${encodeURIComponent(solicitud.tokenVerificacion)}`;
  const html = plantilla({
    titulo: 'Confirma tu solicitud de informe',
    contenido: `
      <p>Hola ${escapar(solicitud.nombre)},</p>
      <p>Recibimos tu solicitud <strong>${escapar(solicitud.folio)}</strong> para un informe de
      incidencias. Para evitar envíos no solicitados necesitamos que confirmes tu correo:</p>
      <p style="margin:22px 0">
        <a href="${escapar(enlace)}" style="background:#006657;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
          Confirmar y recibir el informe
        </a>
      </p>
      <p>Si no hiciste esta solicitud, ignora este mensaje. No se enviará ningún informe.</p>
      <p style="font-size:12px;color:#64748b">Folio: ${escapar(solicitud.folio)}</p>`,
    pie: 'Al confirmar aceptas el aviso de privacidad y el uso de tu correo únicamente para enviarte este informe.'
  });
  return enviarCorreo(repositorio, {
    para: solicitud.correo,
    asunto: `Confirma tu solicitud de informe (${solicitud.folio})`,
    html,
    tipo: 'verificacion_informe'
  });
}

/** Entrega del informe generado (PDF o CSV adjunto). */
export function enviarInforme(repositorio, solicitud, adjunto) {
  const html = plantilla({
    titulo: `Informe de incidencias ${solicitud.folio}`,
    contenido: `
      <p>Hola ${escapar(solicitud.nombre)},</p>
      <p>Adjuntamos el informe solicitado en formato <strong>${solicitud.formato.toUpperCase()}</strong>.</p>
      <ul style="font-size:13px;color:#475569">
        ${solicitud.municipioId ? `<li>Municipio: ${escapar(solicitud.municipioId)}</li>` : ''}
        ${solicitud.estadoEntidad ? `<li>Estado: ${escapar(solicitud.estadoEntidad)}</li>` : ''}
        ${solicitud.desde ? `<li>Desde: ${escapar(solicitud.desde.slice(0, 10))}</li>` : ''}
        ${solicitud.hasta ? `<li>Hasta: ${escapar(solicitud.hasta.slice(0, 10))}</li>` : ''}
        <li>Folio: ${escapar(solicitud.folio)}</li>
      </ul>
      <p>Los datos personales de quienes reportaron no se incluyen en el informe.</p>`,
    pie: 'Este informe es público y puede compartirse citando la fuente.'
  });
  return enviarCorreo(repositorio, {
    para: solicitud.correo,
    asunto: `Informe de incidencias ${solicitud.folio}`,
    html,
    texto: `Informe ${solicitud.folio} adjunto.`,
    tipo: 'informe',
    attachments: adjunto
      ? [{ filename: adjunto.nombre, content: adjunto.contenido, contentType: adjunto.tipo }]
      : undefined
  });
}

/** Respuesta del personal a un mensaje ciudadano. */
export function enviarRespuestaCiudadano(repositorio, { para, asunto, titulo, mensaje }) {
  const html = plantilla({
    titulo,
    contenido: `
      <p>${escapar(titulo)}</p>
      <p style="white-space:pre-line">${escapar(mensaje)}</p>`,
    pie: 'Puedes responder a este correo para continuar la conversación con el personal municipal.'
  });
  return enviarCorreo(repositorio, { para, asunto, html, tipo: 'respuesta_ciudadano' });
}

/** Mensaje directo entre el personal (admin↔funcionario). */
export function enviarMensajeDirecto(repositorio, { para, asunto, deNombre, cuerpo }) {
  const html = plantilla({
    titulo: asunto,
    contenido: `
      <p><strong>${escapar(deNombre)}</strong> te envió un mensaje:</p>
      <p style="white-space:pre-line">${escapar(cuerpo)}</p>
      <p>Abre la bandeja del sistema para responder y mantener el hilo.</p>`,
    pie: 'Este mensaje es interno del personal del sistema.'
  });
  return enviarCorreo(repositorio, { para, asunto, html, tipo: 'mensaje_directo' });
}

/* --------------------- promoción del servicio (campañas) ------------------ */

/** Enlace público de la página que confirma o da de baja una suscripción. */
function enlaceSuscripcion(token, accion) {
  const base = config.publico.urlBase || 'http://localhost:3000';
  return `${base}/suscripcion.html?${accion}=${encodeURIComponent(token)}`;
}

/** Doble opt-in: confirma que la persona quiere recibir promociones. */
export function enviarConfirmacionSuscripcion(repositorio, suscripcion) {
  const enlace = enlaceSuscripcion(suscripcion.token, 'confirmar');
  const html = plantilla({
    titulo: 'Confirma tu suscripción',
    contenido: `
      <p>Hola${suscripcion.nombre ? ` ${escapar(suscripcion.nombre)}` : ''},</p>
      <p>Recibimos tu solicitud para recibir información y novedades del
      <strong>Sistema de Incidencias Municipales</strong>.</p>
      <p>Para evitar envíos no solicitados necesitamos que confirmes tu correo:</p>
      <p style="margin:22px 0">
        <a href="${escapar(enlace)}" style="background:#006657;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
          Confirmar suscripción
        </a>
      </p>
      <p>Si no solicitaste esto, ignora el mensaje: sin confirmación no se enviará nada.</p>`,
    pie: 'Puedes darte de baja en cualquier momento desde el enlace de cada correo.'
  });
  return enviarCorreo(repositorio, {
    para: suscripcion.correo,
    asunto: 'Confirma tu suscripción al Sistema de Incidencias Municipales',
    html,
    tipo: 'verificacion_suscripcion'
  });
}

/** Envío de una campaña con baja en un clic y aviso de privacidad. */
export function enviarCampana(repositorio, { para, asunto, html, texto = '', tokenBaja }) {
  const baja = enlaceSuscripcion(tokenBaja, 'baja');
  const pie = `
    <p style="margin:0 0 8px">Recibes este correo porque confirmaste tu suscripción.</p>
    <p style="margin:0">
      <a href="${escapar(baja)}" style="color:#006657">Darme de baja con un clic</a>
    </p>
    <p style="margin:8px 0 0">Aviso de privacidad: usamos tu correo solo para enviarte información
    del servicio. No compartimos tus datos con terceros.</p>`;
  return enviarCorreo(repositorio, {
    para,
    asunto,
    html: `${html}\n<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${pie}</div>`,
    texto: `${texto}\n\nDarme de baja: ${baja}`,
    tipo: 'campana'
  });
}

/** Confirmación de baja (no vuelve a incluir enlaces de baja). */
export function enviarBajaConfirmada(repositorio, suscripcion) {
  const html = plantilla({
    titulo: 'Suscripción cancelada',
    contenido: `
      <p>Tu correo <strong>${escapar(suscripcion.correo)}</strong> ya no recibirá
      campañas informativas del Sistema de Incidencias Municipales.</p>
      <p>Si cambias de opinión, puedes volver a suscribirte desde la página de informes.</p>`,
    pie: 'Conservamos el registro de la baja para no volver a escribirte.'
  });
  return enviarCorreo(repositorio, {
    para: suscripcion.correo,
    asunto: 'Tu suscripción fue cancelada',
    html,
    tipo: 'baja_suscripcion'
  });
}

/** Aviso al personal de que entró un mensaje de contacto o una sugerencia. */
export function avisarAlPersonal(repositorio, { para, asunto, titulo, lineas, tipo }) {
  const html = plantilla({
    titulo,
    contenido: `
      <p>${escapar(titulo)}</p>
      <ul style="font-size:13px;color:#475569">
        ${lineas.map((linea) => `<li>${escapar(linea)}</li>`).join('')}
      </ul>`,
    pie: 'Responde desde la bandeja del sistema para mantener el hilo y la trazabilidad.'
  });
  return enviarCorreo(repositorio, { para, asunto, html, tipo });
}
