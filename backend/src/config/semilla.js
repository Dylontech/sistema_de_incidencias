/**
 * Carga de los datos semilla extraídos del monolito original
 * (src/config/seed-data/*.json, generados por scripts/extraer-semilla.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './index.js';

const leer = (archivo, porDefecto) => {
  const ruta = path.join(config.paths.seedData, archivo);
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return porDefecto;
    throw new Error(`No se pudo leer el dato semilla ${archivo}: ${e.message}`);
  }
};

export const municipiosSemilla = leer('municipios.json', []);

/** Las zonas se guardan planas, con su municipioId explícito. */
export const zonasSemilla = Object.entries(leer('zonas.json', {})).flatMap(([municipioId, zonas]) =>
  zonas.map((z) => ({ ...z, municipioId }))
);

export const tiposSemilla = leer('tipos.json', []);
export const ejemplosSemilla = leer('ejemplos-tipo.json', {});
export const iconosSemilla = leer('iconos.json', []);
export const usuariosSemilla = leer('usuarios.json', []);
export const politicaSemilla = leer('politica.json', {});
