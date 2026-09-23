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

// Puerto ocupado (lo más habitual: otro proyecto usando el 3000).
// Se avisa con instrucciones en lugar de volcar la traza de Node.
servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    const alternativa = config.port + 1;
    console.error(`\nNo se pudo arrancar: el puerto ${config.port} ya está en uso.`);
    console.error('Opciones:');
    console.error(`  1. Cambia PORT en backend/.env (por ejemplo PORT=${alternativa}).`);
    console.error(`  2. Libera el puerto: ss -ltnp | grep ${config.port}`);
    console.error(`  3. Arranca puntualmente en otro puerto: PORT=${alternativa} npm run dev`);
  } else if (error.code === 'EACCES') {
    console.error(`\nNo se pudo arrancar: sin permisos para usar el puerto ${config.port}.`);
    console.error('Usa un puerto por encima de 1024 (PORT=3100 en backend/.env).');
  } else {
    console.error('\nNo se pudo iniciar el servidor:', error.message);
  }
  clearInterval(intervalo);
  process.exit(1);
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
