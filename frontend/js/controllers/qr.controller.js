/**
 * Generador QR del estudio de publicidad.
 *
 * La imagen se genera en el servidor con qrcode (sin CDNs ni APIs externas) y
 * se compone en un canvas para poder añadir logo y etiqueta antes de exportar.
 */
import { registrarAcciones } from '../core/eventos.js';
import { toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { publicidadService } from '../services/publicidad.service.js';

let ultimo = null;
let logotipo = null;
let temporizador = null;

const $ = (id) => document.getElementById(id);
const valor = (id) => $(id)?.value?.trim() || '';

function escaparWifi(texto) {
  return String(texto || '').replace(/([\\;,:"])/g, '\\$1');
}

function contenidoQr() {
  const tipo = $('qrTipo')?.value || 'texto';
  if (tipo === 'wifi') {
    const ssid = valor('qrWifiSsid');
    if (!ssid) return '';
    const enc = $('qrWifiEnc')?.value || 'WPA';
    let salida = `WIFI:T:${enc};S:${escaparWifi(ssid)};`;
    if (enc !== 'nopass') salida += `P:${escaparWifi(valor('qrWifiPass'))};`;
    return `${salida};`;
  }
  if (tipo === 'vcard') {
    const nombre = valor('qrVcardNombre');
    if (!nombre) return '';
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${nombre}\nTEL:${valor('qrVcardTel')}\nEMAIL:${valor('qrVcardEmail')}\nEND:VCARD`;
  }
  if (tipo === 'email') {
    const para = valor('qrEmailTo');
    if (!para) return '';
    return `mailto:${para}?subject=${encodeURIComponent(valor('qrEmailAsunto'))}`;
  }
  if (tipo === 'sms') return valor('qrTelefono') ? `SMSTO:${valor('qrTelefono')}:${valor('qrMensaje')}` : '';
  if (tipo === 'whatsapp') {
    const numero = valor('qrTelefono').replace(/\D/g, '');
    return numero ? `https://wa.me/${numero}${valor('qrMensaje') ? `?text=${encodeURIComponent(valor('qrMensaje'))}` : ''}` : '';
  }
  if (tipo === 'tel') return valor('qrSoloTelefono') ? `tel:${valor('qrSoloTelefono')}` : '';
  if (tipo === 'geo') {
    const lat = valor('qrLat');
    const lng = valor('qrLng');
    return lat && lng ? `geo:${lat},${lng}` : '';
  }
  return valor('qrTexto');
}

function actualizarCampos() {
  const tipo = $('qrTipo')?.value || 'texto';
  document.querySelectorAll('[data-qr-campo]').forEach((campo) => {
    campo.classList.toggle('u-oculto', !campo.dataset.qrCampo.split(' ').includes(tipo));
  });
  const aviso = $('qrAviso');
  if (aviso) aviso.textContent = tipo === 'texto' || tipo === 'url' ? 'El QR de una URL puede abrir la vista inicial del sistema.' : '';
}

function dibujarConLogo(datos) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => {
      const canvas = document.createElement('canvas');
      const lado = Number(datos.tamano) || 512;
      canvas.width = lado;
      canvas.height = lado;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, lado, lado);
      ctx.drawImage(imagen, 0, 0, lado, lado);
      if (logotipo) {
        const logo = canvas.width * 0.2;
        const x = (lado - logo) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 6, x - 6, logo + 12, logo + 12);
        ctx.drawImage(logotipo, x, x, logo, logo);
      }
      resolver(canvas);
    };
    imagen.onerror = () => rechazar(new Error('No se pudo componer el QR'));
    imagen.src = datos.png || datos.svgUrl;
  });
}

async function generar({ silencioso = false } = {}) {
  actualizarCampos();
  const contenido = contenidoQr();
  if (!contenido) {
    if (!silencioso) toast('Escribe el contenido del QR', 'err');
    return null;
  }
  if (/^(javascript|data|vbscript|file|blob):/i.test(contenido.trim())) {
    toast('Ese tipo de enlace no está permitido', 'err');
    return null;
  }
  const datos = await publicidadService.generarQr({
    contenido,
    tamano: Number(valor('qrTamano')) || 512,
    color: valor('qrColor') || '#0b1020',
    nivel: valor('qrNivel') || 'M',
    margen: Number(valor('qrMargen')) || 0
  });
  ultimo = datos;
  const canvas = await dibujarConLogo(datos);
  const preview = $('qrPreview');
  if (preview) {
    preview.src = canvas.toDataURL('image/png');
    preview.hidden = false;
  }
  const info = $('qrInfo');
  if (info) info.textContent = `${datos.tamano} × ${datos.tamano} px · corrección ${datos.nivel}`;
  if (!silencioso) toast('Código QR generado', 'ok');
  return canvas;
}

function descargarCanvas(canvas, nombre, tipo = 'image/png') {
  const enlace = document.createElement('a');
  enlace.href = canvas.toDataURL(tipo, 0.95);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

function programar() {
  actualizarCampos();
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    if (contenidoQr()) generar({ silencioso: true }).catch(() => {});
  }, 260);
}

export function registrar() {
  registrarAcciones({
    'qr:tipo': () => {
      actualizarCampos();
      programar();
    },
    'qr:vivo': () => programar(),
    'qr:logo': async ({ evento }) => {
      const archivo = evento?.target?.files?.[0];
      logotipo = null;
      if (!archivo) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
        return toast('Usa PNG, JPG o WebP para el logo', 'err');
      }
      if (archivo.size > 2 * 1024 * 1024) return toast('El logo supera 2 MB', 'err');
      logotipo = await new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => {
          const imagen = new Image();
          imagen.onload = () => resolver(imagen);
          imagen.onerror = rechazar;
          imagen.src = lector.result;
        };
        lector.onerror = rechazar;
        lector.readAsDataURL(archivo);
      }).catch(() => null);
      if (logotipo) {
        toast('Logo cargado', 'ok');
        await generar({ silencioso: true }).catch(() => null);
      }
    },
    'qr:generar': () => intentar(() => generar()),
    'qr:png': () =>
      intentar(async () => {
        const canvas = await generar({ silencioso: true });
        if (canvas) descargarCanvas(canvas, 'codigo-qr.png');
      }),
    'qr:jpg': () =>
      intentar(async () => {
        const canvas = await generar({ silencioso: true });
        if (!canvas) return;
        const blanco = document.createElement('canvas');
        blanco.width = canvas.width;
        blanco.height = canvas.height;
        const ctx = blanco.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, blanco.width, blanco.height);
        ctx.drawImage(canvas, 0, 0);
        descargarCanvas(blanco, 'codigo-qr.jpg', 'image/jpeg');
      }),
    'qr:pdf': () =>
      intentar(async () => {
        if (!ultimo) await generar({ silencioso: true });
        await publicidadService.descargarQrPdf({
          contenido: ultimo?.contenido || contenidoQr(),
          tamano: ultimo?.tamano || 512,
          color: ultimo?.color || valor('qrColor'),
          nivel: ultimo?.nivel || valor('qrNivel'),
          margen: ultimo?.margen || 1
        });
      }),
    'qr:copiar': () =>
      intentar(async () => {
        const canvas = await generar({ silencioso: true });
        if (!canvas) return;
        const blob = await new Promise((resolver) => canvas.toBlob(resolver, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Imagen copiada', 'ok');
      }),
    'qr:guardarCodigo': () =>
      intentar(async () => {
        const contenido = contenidoQr();
        if (!contenido) return toast('Primero escribe el contenido', 'err');
        const resultado = await publicidadService.guardarCodigoQr({
          contenido,
          tipo: $('qrTipo')?.value || 'texto'
        });
        toast(`Código guardado: ${resultado.codigo?.codigo || ''}`, 'ok');
      })
  });

  actualizarCampos();
}
