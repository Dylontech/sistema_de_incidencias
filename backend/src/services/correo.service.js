/**
 * SERVICIO: correo saliente (verificación de la cuenta y recuperación de
 * contraseña).
 *
 * Dos transportes:
 *  - **SMTP** cuando `SMTP_HOST` está definido; usa `nodemailer`.
 *  - **Registro** en cualquier otro caso: el mensaje, con su enlace, se escribe
 *    en la salida del servidor. Es lo que permite recorrer el flujo completo sin
 *    montar un servidor de correo (y en las pruebas el mensaje queda además en
 *    una bandeja en memoria, de la que se lee el enlace).
 *
 * El envío **nunca lanza hacia arriba**: si el correo falla, el registro de la
 * cuenta sigue adelante y el ciudadano puede pedir que se le reenvíe.
 */
import { config } from '../config/index.js';
import { plazoLegible } from '../utils/tokens.js';

/** Mensajes que se quedaron en el registro (solo se llenan con NODE_ENV=test). */
const bandeja = [];

/** Bandeja en memoria con los últimos mensajes: la usan las pruebas. */
export function bandejaSalida() {
  return bandeja;
}

export function limpiarBandeja() {
  bandeja.length = 0;
}

/** Último mensaje dirigido a una dirección (o null). */
export function ultimoMensajePara(correo) {
  const objetivo = String(correo || '').trim().toLowerCase();
  for (let i = bandeja.length - 1; i >= 0; i--) {
    if (String(bandeja[i].para || '').toLowerCase() === objetivo) return bandeja[i];
  }
  return null;
}

/** ¿Hay servidor de correo configurado? */
export function configurado() {
  return Boolean(config.correo.host);
}

let transportePrometido = null;

function prepararTransporte() {
  if (!transportePrometido) {
    transportePrometido = import('nodemailer')
      .then(({ default: nodemailer }) =>
        nodemailer.createTransport({
          host: config.correo.host,
          port: config.correo.puerto,
          secure: config.correo.seguro,
          auth: config.correo.usuario
            ? { user: config.correo.usuario, pass: config.correo.password }
            : undefined
        })
      )
      .catch((error) => {
        transportePrometido = null;
        throw new Error(
          `no se pudo preparar el transporte SMTP (¿falta "npm install nodemailer"?): ${error.message}`
        );
      });
  }
  return transportePrometido;
}

/**
 * Envía un mensaje. Devuelve `true` si salió por SMTP y `false` si se quedó en
 * el registro. Nunca lanza.
 */
export async function enviar({ para, asunto, texto, html, enlace }) {
  const mensaje = { para, asunto, texto, html, enlace, fecha: new Date().toISOString() };

  if (configurado()) {
    try {
      const transporte = await prepararTransporte();
      await transporte.sendMail({
        from: config.correo.remitente,
        to: para,
        subject: asunto,
        text: texto,
        html
      });
      return true;
    } catch (error) {
      console.error(`[correo] no se pudo enviar a ${para}:`, error.message);
      return false;
    }
  }

  console.log(`[correo] (sin SMTP) para ${para} · ${asunto}\n  ${enlace}`);
  if (config.env === 'test') bandeja.push(mensaje);
  return false;
}

/** Plantilla sencilla: un párrafo, el enlace y la letra pequeña. */
function plantilla({ titulo, parrafo, enlace, pie }) {
  return `<!DOCTYPE html>
<html lang="es"><body style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1a202c;line-height:1.5">
  <h2 style="color:#006657;font-size:18px">${titulo}</h2>
  <p>${parrafo}</p>
  <p style="margin:22px 0">
    <a href="${enlace}" style="background:#006657;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${titulo}</a>
  </p>
  <p style="font-size:12px;color:#718096">Si el botón no funciona, copia esta dirección en el navegador:<br>${enlace}</p>
  <p style="font-size:12px;color:#94a3b8">${pie}</p>
</body></html>`;
}

/** Correo de confirmación de la cuenta. */
export function enviarVerificacion(cuenta, token) {
  const enlace = `${config.correo.urlBase}/?verificar=${encodeURIComponent(token)}`;
  const plazo = plazoLegible(config.cuenta.minutosVerificacion);
  return enviar({
    para: cuenta.correo,
    asunto: 'Confirma tu correo para activar la cuenta',
    enlace,
    texto:
      `Hola ${cuenta.nombre}:\n\n` +
      `Confirma tu correo abriendo este enlace:\n${enlace}\n\n` +
      `El enlace caduca en ${plazo}. Si no has creado una cuenta, ignora este mensaje.`,
    html: plantilla({
      titulo: 'Confirmar mi correo',
      parrafo: `Hola ${cuenta.nombre}: confirma que esta dirección es tuya para poder entrar en la aplicación.`,
      enlace,
      pie: `El enlace caduca en ${plazo}. Si no has creado una cuenta, ignora este mensaje.`
    })
  });
}

/** Correo con el enlace para elegir una contraseña nueva. */
export function enviarRestablecimiento(cuenta, token) {
  const enlace = `${config.correo.urlBase}/?restablecer=${encodeURIComponent(token)}`;
  const plazo = plazoLegible(config.cuenta.minutosRestablecimiento);
  return enviar({
    para: cuenta.correo,
    asunto: 'Elige una contraseña nueva',
    enlace,
    texto:
      `Hola ${cuenta.nombre}:\n\n` +
      `Alguien (esperamos que tú) pidió cambiar la contraseña de esta cuenta. ` +
      `Elige una nueva aquí:\n${enlace}\n\n` +
      `El enlace caduca en ${plazo} y solo se puede usar una vez. ` +
      `Si no has sido tú, no hagas nada: tu contraseña sigue siendo la misma.`,
    html: plantilla({
      titulo: 'Elegir contraseña nueva',
      parrafo: 'Pulsa el botón para elegir una contraseña nueva. Caduca pronto y solo sirve una vez.',
      enlace,
      pie: `El enlace caduca en ${plazo}. Si no has pedido el cambio, ignora este mensaje: tu contraseña no cambia.`
    })
  });
}
