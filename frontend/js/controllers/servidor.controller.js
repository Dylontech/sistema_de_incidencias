/** Panel de recursos del servidor (solo administrador). */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, modalAbierto, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { $, esc } from '../core/utils.js';
import { sesion } from '../core/session.js';
import { api } from '../core/api.js';

let temporizador = null;
let serie = [];

function bytes(valor) {
  const numero = Number(valor) || 0;
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let indice = 0;
  let resto = numero;
  while (resto >= 1024 && indice < unidades.length - 1) {
    resto /= 1024;
    indice += 1;
  }
  return `${resto.toFixed(indice === 0 ? 0 : 1)} ${unidades[indice]}`;
}

function kpi(etiqueta, valor, clase = '') {
  return `<div class="monitoreo-kpi ${clase}">
    <div class="monitoreo-kpi-valor">${esc(valor)}</div>
    <div class="monitoreo-kpi-etiqueta">${esc(etiqueta)}</div>
  </div>`;
}

function dibujar(id, valores, color, sufijo = '') {
  const canvas = $(id);
  if (!canvas) return;
  const contexto = canvas.getContext('2d');
  const ancho = canvas.width;
  const alto = canvas.height;
  contexto.clearRect(0, 0, ancho, alto);

  // Rejilla
  contexto.strokeStyle = '#e2e8f0';
  contexto.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (alto / 4) * i;
    contexto.beginPath();
    contexto.moveTo(0, y);
    contexto.lineTo(ancho, y);
    contexto.stroke();
  }

  if (!valores.length) return;
  const maximo = Math.max(...valores, 1) * 1.15;
  const puntos = valores.map((valor, indice) => ({
    x: (ancho / Math.max(valores.length - 1, 1)) * indice,
    y: alto - (Number(valor) / maximo) * (alto - 8) - 4
  }));

  contexto.beginPath();
  contexto.moveTo(puntos[0].x, alto);
  puntos.forEach((p) => contexto.lineTo(p.x, p.y));
  contexto.lineTo(puntos[puntos.length - 1].x, alto);
  contexto.closePath();
  contexto.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.18)');
  contexto.fill();

  contexto.beginPath();
  puntos.forEach((p, indice) => {
    if (indice === 0) contexto.moveTo(p.x, p.y);
    else contexto.lineTo(p.x, p.y);
  });
  contexto.strokeStyle = color;
  contexto.lineWidth = 2;
  contexto.stroke();

  contexto.fillStyle = '#64748b';
  contexto.font = '10px Segoe UI, sans-serif';
  contexto.fillText(`${maximo.toFixed(1)}${sufijo}`, 6, 12);
}

function pintar(datos) {
  const memoria = datos.memoria || {};
  const cpu = datos.cpu || {};
  const disco = datos.disco || {};
  const peticiones = datos.peticiones || {};
  const latencia = datos.latencia || {};

  const kpis = $('servidorKpis');
  if (kpis) {
    kpis.innerHTML = [
      kpi('CPU proceso', `${cpu.proceso ?? 0}%`, 'kpi-amarillo'),
      kpi('Carga (1/5/15)', (cpu.carga || []).join(' / '), 'kpi-azul'),
      kpi('Memoria RSS', bytes(memoria.rss)),
      kpi('Heap usado', bytes(memoria.heapUsado)),
      kpi('Sistema libre', bytes(memoria.sistemaLibre)),
      kpi('Event loop', `${datos.eventLoopLagMs ?? 0} ms`, 'kpi-naranja')
    ].join('');
  }

  const detalle = $('servidorDetalle');
  if (detalle) {
    const lineas = [
      `Uptime: ${Math.floor((datos.uptimeSegundos || 0) / 3600)} h ${Math.floor(((datos.uptimeSegundos || 0) % 3600) / 60)} min`,
      `Núcleos: ${cpu.nucleos ?? '—'} · ${cpu.modelo || ''}`,
      `RAM sistema: ${bytes(memoria.sistemaTotal)} total · ${bytes(memoria.sistemaLibre)} libre`,
      `Disco (uploads): ${bytes(disco.usado)} usado de ${bytes(disco.total)}`,
      `Evidencia en disco: ${bytes(datos.uploadsBytes)}`,
      `Peticiones: ${peticiones.total ?? 0} · 2xx ${peticiones['2xx'] ?? 0} · 4xx ${peticiones['4xx'] ?? 0} · 5xx ${peticiones['5xx'] ?? 0}`,
      `Latencia media: ${latencia.mediaMs ?? 0} ms · máxima: ${latencia.maximaMs ?? 0} ms`,
      `Base de datos: ${datos.baseDatos ? `${datos.baseDatos.usadas ?? '?'} conexiones en uso` : 'sin pool'}`,
      `Correo: ${datos.configuracion?.correoActivo ? 'SMTP activo' : 'modo simulado'} · almacén ${datos.configuracion?.almacen || '—'} · ${datos.configuracion?.entorno || '—'}`
    ];
    detalle.textContent = lineas.join('\n');
  }

  serie.push({
    cpu: Number(cpu.proceso) || 0,
    rss: Number(memoria.rss || 0) / (1024 * 1024)
  });
  if (serie.length > 60) serie.shift();

  dibujar('graficoCpu', serie.map((p) => p.cpu), 'rgb(214, 158, 46)', '%');
  dibujar('graficoMem', serie.map((p) => p.rss), 'rgb(43, 108, 176)', ' MB');
}

async function cargar() {
  const datos = await api.get('/admin/metricas');
  pintar(datos);
}

function detener() {
  if (temporizador) window.clearInterval(temporizador);
  temporizador = null;
}

function iniciar() {
  detener();
  temporizador = window.setInterval(async () => {
    if (!modalAbierto('modalServidor')) {
      detener();
      return;
    }
    if (document.hidden) return;
    try {
      await cargar();
    } catch {
      /* el refresco silencioso no interrumpe */
    }
  }, 10000);
}

export function registrar() {
  registrarAcciones({
    'servidor:abrir': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo un administrador puede ver los recursos del servidor', 'err');
          return;
        }
        serie = [];
        abrirModal('modalServidor');
        await cargar();
        iniciar();
      }),

    'servidor:refrescar': () =>
      intentar(async () => {
        await cargar();
        toast('Métricas actualizadas', 'ok');
      })
  });
}
