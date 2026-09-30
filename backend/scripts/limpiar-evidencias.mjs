/**
 * EVIDENCIA HUÉRFANA
 *
 * Busca archivos en el directorio de subidas que **ninguna incidencia
 * referencia** y, opcionalmente, los borra.
 *
 * De dónde salen: la evidencia se sube ANTES de guardar el reporte (el
 * formulario sube cada foto y luego manda los metadatos), así que si alguien
 * sube una foto y cierra el formulario sin enviar, el archivo se queda en disco.
 * También pueden quedar restos de un borrado interrumpido o de una importación
 * fallida.
 *
 * Uso:
 *   npm run limpiar-evidencias             # simulación: solo informa
 *   npm run limpiar-evidencias -- --aplicar  # borra de verdad
 *
 * Es destructivo, así que por omisión NO borra nada (al revés que
 * `migrar-catalogo`, donde la simulación se pide con `--seco`).
 */
import { config } from '../src/config/index.js';
import { cerrarRepositorio, obtenerRepositorio } from '../src/repositories/index.js';
import { archivosEnDisco, borrarArchivos, urlsDeEvidencia } from '../src/services/uploads.service.js';

const aplicar = process.argv.includes('--aplicar');

const formatoMegas = (bytes) => `${(Number(bytes) / (1024 * 1024)).toFixed(2)} MB`;

const repositorio = await obtenerRepositorio();
try {
  // `todasLasIncidencias` (y no `buscarIncidencias`): las retiradas por
  // moderación también pueden tener evidencia, y no queremos borrar sus fotos.
  const incidencias = await repositorio.todasLasIncidencias();
  const referenciados = new Set(
    incidencias.flatMap((incidencia) => urlsDeEvidencia(incidencia)).map((url) => url.split('/').pop())
  );

  const archivos = await archivosEnDisco();
  const huerfanos = archivos.filter((archivo) => !referenciados.has(archivo.nombre));

  console.log(`Almacén: ${repositorio.driver}`);
  // El directorio se imprime a propósito: si se ejecuta desde el host contra la
  // base del contenedor, no es el mismo volumen y el resultado no vale.
  console.log(`Directorio: ${config.paths.uploads}`);
  console.log(`Incidencias: ${incidencias.length}`);
  console.log(`Archivos en disco: ${archivos.length}`);
  console.log(`Referenciados: ${referenciados.size}`);
  console.log(`Huérfanos: ${huerfanos.length}`);

  if (!huerfanos.length) {
    console.log('\nNo hay nada que limpiar.');
  } else {
    const peso = huerfanos.reduce((total, archivo) => total + archivo.tamano, 0);
    console.log(`Peso total de los huérfanos: ${formatoMegas(peso)}\n`);
    for (const archivo of huerfanos) {
      console.log(
        `  ${archivo.nombre}  ${formatoMegas(archivo.tamano)}  ${archivo.modificado.toISOString()}`
      );
    }

    if (!aplicar) {
      console.log('\n(simulación: no se ha borrado nada, repite con -- --aplicar)');
    } else {
      const borrados = await borrarArchivos(huerfanos.map((archivo) => archivo.nombre));
      console.log(`\nBorrados ${borrados} archivos.`);
    }
  }
} finally {
  await cerrarRepositorio();
}
