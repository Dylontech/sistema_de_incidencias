#!/usr/bin/env node
/**
 * DATOS DE DEMOSTRACIÓN
 *
 * Crea incidencias repartidas a propósito por TODOS los valores de los filtros
 * (tipo, estado, color/antigüedad y comunidad) para poder probar el listado, el
 * mapa, el panel de administración y las estadísticas con datos variados.
 *
 * Uso:
 *   npm run datos-demo                                # Tarandacuao, 7 por tipo
 *   npm run datos-demo -- --municipio=16050           # otro municipio
 *   npm run datos-demo -- --por-tipo=10               # entre 5 y 15
 *   npm run datos-demo -- --limpiar                   # borra los datos de demo
 *   npm run datos-demo -- --limpiar --por-tipo=5      # limpia y vuelve a crear
 *
 * Los documentos se insertan con el repositorio (no por la API) para no llenar
 * el buzón de notificaciones, y llevan `demo: true` y un id con prefijo para
 * poder retirarlos después.
 */
import { obtenerRepositorio } from '../src/repositories/index.js';
import { bboxDePoligono, centroDePoligono, puntoEnPoligono } from '../src/utils/geometria.js';

/* --------------------------------- opciones -------------------------------- */

const PREFIJO = 'demo';

function leerArgumentos(argumentos) {
  const opciones = {
    municipio: 'Tarandacuao',
    // Mínimo 5 y máximo 15 por tipo: lo justo para que los filtros tengan
    // variedad sin que el mapa se sature.
    porTipo: 7,
    peligrosas: 6,
    limpiar: false
  };

  for (const argumento of argumentos) {
    const [crudo, valor] = argumento.replace(/^--/, '').split('=');
    const clave = crudo.trim();
    if (clave === 'limpiar') opciones.limpiar = true;
    else if (clave === 'municipio') opciones.municipio = valor;
    else if (clave === 'por-tipo') opciones.porTipo = Math.min(15, Math.max(5, Number(valor) || 7));
    else if (clave === 'peligrosas') opciones.peligrosas = Math.max(0, Number(valor) || 0);
    else {
      console.error(`Opción desconocida: ${argumento}`);
      process.exit(1);
    }
  }

  return opciones;
}

const opciones = leerArgumentos(process.argv.slice(2));

/* ------------------------- generador reproducible -------------------------- */

/** PRNG con semilla: los mismos datos en cada ejecución. */
function aleatorioConSemilla(semilla) {
  let estado = semilla;
  return () => {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azar = aleatorioConSemilla(11038);
const entre = (min, max) => min + azar() * (max - min);
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const diasAtras = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

/* ------------------------------ textos del demo ---------------------------- */

/** Título y descripción por tipo, con el nombre de la comunidad interpolado. */
const TEXTOS = {
  bache: ['Bache profundo en la calle principal', 'Bache de más de un metro de ancho que obliga a los autos a invadir el carril contrario.'],
  banqueta: ['Banqueta levantada por las raíces', 'Las losas están levantadas y la gente tropieza; hay adultos mayores que pasan por aquí.'],
  fuga: ['Fuga de agua en la esquina', 'Brota agua desde hace días y ya se formó un charco grande sobre la banqueta.'],
  luminaria: ['Luminaria fundida desde hace semanas', 'La calle queda completamente a oscuras y han ocurrido asaltos por la noche.'],
  agua_contaminada: ['Agua turbia con olor raro', 'Sale agua con sedimentos y olor a cloaca; los vecinos dejaron de usarla.'],
  basura: ['Basura acumulada junto al canal', 'Hay varios montones de basura que atraen fauna y provocan mal olor.'],
  drenaje: ['Drenaje obstruido, se inunda la calle', 'Cuando llueve el agua sube hasta las cocheras porque el drenaje no traga.'],
  pavimento: ['Pavimento destruido tras las lluvias', 'El asfalto se levantó y quedaron piedras sueltas sobre la carpeta de rodamiento.'],
  arbol: ['Árbol a punto de caer sobre la calle', 'Las ramas están sobre el cableado y una raíz levantó el pavimento.'],
  semaforo: ['Semáforo descompuesto', 'Lleva días en intermitente y el cruce es peligroso en horas pico.'],
  cableado: ['Cables colgando a baja altura', 'Los cables quedaron a menos de dos metros del suelo después de la última tormenta.'],
  parque: ['Parque en mal estado', 'Los juegos infantiles están rotos y hay vidrios en la explanada.'],
  senal: ['Señal de alto derribada', 'La señal quedó tirada tras un choque y los autos pasan sin detenerse.'],
  grafiti: ['Grafiti en la fachada de la escuela', 'Pintaron la barda y las paredes del acceso principal durante la madrugada.'],
  animal: ['Jauría de perros sin dueño', 'Varios perros agresivos andan cerca de la primaria y ya mordieron a un vecino.'],
  otro: ['Poste de luz inclinado', 'El poste se está venciendo hacia la banqueta después de que lo golpeó un vehículo.']
};

/* ---------------------------------- datos ---------------------------------- */

const repositorio = await obtenerRepositorio();
await repositorio.inicializar();

const municipios = await repositorio.todosMunicipios();
const municipio = municipios.find(
  (m) => m.id === opciones.municipio || m.nombre.toLowerCase() === String(opciones.municipio).toLowerCase()
);
if (!municipio) {
  console.error(`No se encontró el municipio "${opciones.municipio}".`);
  process.exit(1);
}

const tipos = await repositorio.todosLosTipos();
const zonas = await repositorio.zonasPorMunicipio(municipio.id);

/* -------------------------------- limpieza --------------------------------- */

const existentes = await repositorio.todasLasIncidencias();
const previos = existentes.filter((i) => i.demo === true || String(i.id).startsWith(`${PREFIJO}-`));
if (previos.length) {
  for (const incidencia of previos) await repositorio.eliminarIncidencia(incidencia.id);
  console.log(`Datos de demostración anteriores eliminados: ${previos.length}`);
}
if (opciones.limpiar && !process.argv.includes('--por-tipo')) {
  console.log('Limpiado. No se creó nada nuevo (usa --por-tipo para volver a generarlos).');
  process.exit(0);
}

if (!tipos.length || !zonas.length) {
  console.error(`El municipio ${municipio.nombre} no tiene tipos o comunidades con las que generar datos.`);
  process.exit(1);
}

/* ------------------------------ punto interior ----------------------------- */

/** Punto aleatorio dentro de una comunidad (o su centro si no lo consigue). */
function puntoEnZona(zona) {
  const caja = bboxDePoligono(zona.poligono);
  if (!caja) return null;
  const [[latMin, lngMin], [latMax, lngMax]] = caja;
  for (let intento = 0; intento < 80; intento++) {
    const lat = entre(latMin, latMax);
    const lng = entre(lngMin, lngMax);
    if (puntoEnPoligono(lat, lng, zona.poligono)) return { lat, lng };
  }
  const centro = centroDePoligono(zona.poligono);
  return centro ? { lat: centro[0], lng: centro[1] } : null;
}

/* ---------------------------------- planes --------------------------------- */

/**
 * Plantillas por tipo: cubren los tres estados y las cuatro antigüedades
 * (amarillo < 15 días, naranja 15-30, rojo > 30 y verde resuelta) para que
 * ningún filtro quede vacío.
 */
const PLANTILLAS = [
  { estado: 'reportada', hace: 2, color: 'amarillo' },
  { estado: 'reportada', hace: 6, color: 'amarillo' },
  { estado: 'reportada', hace: 45, color: 'rojo' },
  { estado: 'en_proceso', hace: 20, color: 'naranja' },
  { estado: 'en_proceso', hace: 25, color: 'naranja' },
  { estado: 'resuelta', hace: 10, resueltaHace: 3, color: 'verde' },
  { estado: 'resuelta', hace: 60, resueltaHace: 40, color: 'verde' }
];

const AUTORES = [
  { esAnonimo: true, autor: 'Anónimo', autorNombre: 'Anónimo', userKey: 'demo_ciudadano_1' },
  { esAnonimo: true, autor: 'Anónimo', autorNombre: 'Anónimo', userKey: 'demo_ciudadano_2' },
  { esAnonimo: true, autor: 'Anónimo', autorNombre: 'Anónimo', userKey: 'demo_ciudadano_3' },
  { esAnonimo: false, autor: 'funcionario', autorNombre: 'Juan López', userKey: 'funcionario' },
  { esAnonimo: false, autor: 'funcionario2', autorNombre: 'María Ramírez', userKey: 'funcionario2' }
];

const COMUNIDADES_ALCALDE = ['Tarandacuao'];

const nuevas = [];
let numero = 1;

for (const tipo of tipos) {
  for (let indice = 0; indice < opciones.porTipo; indice++) {
    // Se recorren las comunidades en orden para que todas reciban reportes.
    const zona = zonas[(numero - 1) % zonas.length];
    const punto = puntoEnZona(zona);
    if (!punto) continue;

    const plantilla = PLANTILLAS[indice % PLANTILLAS.length];
    const [tituloBase, descripcionBase] = TEXTOS[tipo.id] || ['Reporte ciudadano', 'Se reporta una afectación en la vía pública.'];
    const autor = AUTORES[(numero - 1) % AUTORES.length];
    const fecha = diasAtras(plantilla.hace + entre(-1, 1));
    const resuelta = plantilla.estado === 'resuelta';
    const fechaResolucion = resuelta ? diasAtras(plantilla.resueltaHace + entre(-1, 1)) : null;

    const historial = [
      { fecha, estado: 'reportada', accion: 'Incidencia reportada', por: autor.autorNombre }
    ];
    if (plantilla.estado !== 'reportada') {
      historial.push({
        fecha: diasAtras(plantilla.hace - 1),
        estado: 'en_proceso',
        accion: 'Estado cambiado a en_proceso',
        por: 'Juan López'
      });
    }
    if (resuelta) {
      historial.push({
        fecha: fechaResolucion,
        estado: 'resuelta',
        accion: 'Incidencia resuelta: Se atendió el reporte',
        por: 'María Ramírez'
      });
    }

    nuevas.push({
      id: `${PREFIJO}-${municipio.id}-${String(numero).padStart(4, '0')}`,
      tipoId: tipo.id,
      iconoCustom: '',
      titulo: `${tituloBase} · ${zona.nombre}`,
      descripcion: `${descripcionBase} (${zona.nombre}${COMUNIDADES_ALCALDE.includes(zona.nombre) ? '' : `, ${municipio.nombre}`}).`,
      indicaciones: `Referencia: ${elegir(['frente a la tienda', 'junto al poste', 'a un lado de la cancha', 'frente a la primaria', 'en la esquina con la calle Juárez'])}.`,
      lat: Number(punto.lat.toFixed(6)),
      lng: Number(punto.lng.toFixed(6)),
      fecha,
      actualizado: fechaResolucion || diasAtras(Math.max(0, plantilla.hace - 2)),
      estado: plantilla.estado,
      esAnonimo: autor.esAnonimo,
      autor: autor.autor,
      autorNombre: autor.autorNombre,
      userKey: autor.userKey,
      municipioId: municipio.id,
      zonaId: zona.id,
      zonaNombre: zona.nombre,
      peligrosa: false,
      peligrosaPor: null,
      peligrosaFecha: null,
      peligrosaMotivo: '',
      evidencia: [],
      historial,
      comentarios:
        indice % 3 === 0
          ? [
              {
                id: `demo-com-${numero}`,
                fecha: diasAtras(Math.max(1, plantilla.hace - 3)),
                autor: 'Juan López',
                texto: 'Se envió la cuadrilla a revisar el reporte.'
              }
            ]
          : [],
      fechaResolucion,
      solucion: resuelta ? 'Se atendió el reporte con la cuadrilla municipal.' : null,
      evidenciaSolucion: [],
      demo: true
    });

    numero++;
  }
}

/* --------------------------- marcas de peligro ----------------------------- */

// Unas cuantas se marcan como peligrosas para ver el bloque destacado del panel.
const candidatas = nuevas.filter((i) => i.estado !== 'resuelta' && i.historial.length === 1);
for (let i = 0; i < Math.min(opciones.peligrosas, candidatas.length); i++) {
  const incidencia = candidatas[Math.floor((i * candidatas.length) / opciones.peligrosas)];
  incidencia.peligrosa = true;
  incidencia.peligrosaPor = 'Juan López';
  incidencia.peligrosaFecha = diasAtras(1);
  incidencia.peligrosaMotivo = elegir([
    'Riesgo para peatones y vehículos',
    'Puede provocar un accidente en horas pico',
    'Afecta el paso de la ambulancia',
    'Riesgo de electrocución'
  ]);
  incidencia.historial = [
    ...incidencia.historial,
    {
      fecha: incidencia.peligrosaFecha,
      estado: incidencia.estado,
      accion: `Marcada como peligrosa: ${incidencia.peligrosaMotivo}`,
      por: 'Juan López'
    }
  ];
}

await repositorio.insertarIncidencias(nuevas);

/* --------------------------------- resumen --------------------------------- */

const contar = (lista, campo) =>
  lista.reduce((acc, item) => {
    const clave = item[campo];
    acc[clave] = (acc[clave] || 0) + 1;
    return acc;
  }, {});

const colorPorAntiguedad = (incidencia) => {
  if (incidencia.estado === 'resuelta') return 'verde';
  const dias = (Date.now() - new Date(incidencia.fecha)) / 86400000;
  if (dias >= 30) return 'rojo';
  if (dias >= 15) return 'naranja';
  return 'amarillo';
};

console.log('');
console.log(`Municipio: ${municipio.nombre}, ${municipio.estado} (${municipio.id})`);
console.log(`Incidencias creadas: ${nuevas.length} (${opciones.porTipo} por cada uno de los ${tipos.length} tipos)`);
console.log('Por estado: ', JSON.stringify(contar(nuevas, 'estado')));
console.log('Por color:  ', JSON.stringify(nuevas.reduce((acc, i) => {
  const c = colorPorAntiguedad(i);
  acc[c] = (acc[c] || 0) + 1;
  return acc;
}, {})));
console.log('Por tipo:   ', `${Object.keys(contar(nuevas, 'tipoId')).length}/${tipos.length} tipos distintos`);
console.log('Comunidades: ', `${Object.keys(contar(nuevas, 'zonaNombre')).length}/${zonas.length} comunidades con reportes`);
console.log('Peligrosas: ', nuevas.filter((i) => i.peligrosa).length);
console.log('');
console.log('Para verlas: elige el municipio en el selector de la barra superior.');
