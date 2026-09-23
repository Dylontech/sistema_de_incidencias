/**
 * Importa por línea de comandos un respaldo JSON del sistema anterior.
 *
 *   node scripts/importar-legacy.mjs ./respaldo_2026-09-23.json
 *
 * Convierte la evidencia base64 en archivos reales y descarta los campos
 * obsoletos (`colorAuto`). Es el mismo servicio que usa el endpoint
 * POST /api/admin/importar, pero sin pasar por el navegador.
 */
import fs from 'node:fs';
import { cerrarRepositorio, obtenerRepositorio } from '../src/repositories/index.js';
import { importarRespaldo } from '../src/services/importacion.service.js';

const ruta = process.argv[2];

if (!ruta) {
  console.error('Uso: node scripts/importar-legacy.mjs <ruta del respaldo.json>');
  process.exit(1);
}

if (!fs.existsSync(ruta)) {
  console.error(`No existe el archivo: ${ruta}`);
  process.exit(1);
}

let datos;
try {
  datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
} catch (e) {
  console.error(`El respaldo no es un JSON válido: ${e.message}`);
  process.exit(1);
}

const repositorio = await obtenerRepositorio();
try {
  const resultado = await importarRespaldo(repositorio, datos);
  console.log(
    `Importación completada en el driver "${repositorio.driver}":\n` +
      `  incidencias: ${resultado.incidencias}\n` +
      `  tipos personalizados: ${resultado.tipos}\n` +
      `  archivos de evidencia: ${resultado.archivos}`
  );
} finally {
  await cerrarRepositorio();
}
