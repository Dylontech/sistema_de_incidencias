/**
 * Arranque del servidor.
 * Inicializa el repositorio (datos semilla si faltan), programa el recálculo
 * de alertas por antigüedad (cada 60 s, como el setInterval del monolito) y
 * levanta Express.
 */
import { config } from './config/index.js';
import { crearApp } from './app.js';
import { cerrarRepositorio, obtenerRepositorio } from './repositories/index.js';
import { sincronizarAlertas } from './services/estado.service.js';

const app = crearApp();
const repositorio = await obtenerRepositorio();

await sincronizarAlertas(repositorio);
const intervalo = setInterval(() => {
  sincronizarAlertas(repositorio).catch((e) => console.error('[alertas]', e.message));
}, config.intervaloAlertasMs);

const servidor = app.listen(config.port, () => {
  console.log(`Sistema de Incidencias Municipales`);
  console.log(`  API:      http://localhost:${config.port}/api`);
  console.log(`  App:      http://localhost:${config.port}`);
  console.log(`  Almacén:  ${config.storageDriver} (${config.paths.data})`);
});

const apagar = async (senal) => {
  console.log(`\n${senal} recibida: cerrando…`);
  clearInterval(intervalo);
  servidor.close(async () => {
    await cerrarRepositorio();
    process.exit(0);
  });
};

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
