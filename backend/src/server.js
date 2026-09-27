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

/** Descripción del almacén activo para los mensajes de arranque y de error. */
function descripcionAlmacen() {
  if (config.storageDriver === 'mysql') {
    const { host, port, database } = config.db.connection;
    return `${config.storageDriver} (${host}:${port}/${database})`;
  }
  return `${config.storageDriver} (${config.paths.data})`;
}

async function arrancar() {
  const app = crearApp();

  // El almacén se prepara ANTES de escuchar: con MySQL el driver comprueba la
  // conexión y que las tablas existan, así que un fallo aquí (base apagada,
  // migraciones pendientes) se explica con instrucciones en lugar de volcar la
  // traza de un rechazo no capturado, que es lo que hace un contenedor al
  // arrancar antes de que la base esté lista.
  let repositorio;
  try {
    repositorio = await obtenerRepositorio();
    await sincronizarAlertas(repositorio);
  } catch (error) {
    console.error(`\nNo se pudo preparar el almacén de datos: ${descripcionAlmacen()}`);
    console.error(error.message);
    if (config.storageDriver === 'mysql') {
      console.error('\nComprueba que la base de datos esté arrancada y migrada:');
      console.error('  npm run migrate               aplica el esquema pendiente');
      console.error('  docker compose up -d --wait   levanta MariaDB y la aplicación');
      console.error('  STORAGE_DRIVER=json npm run dev   arranca sin base de datos');
    }
    process.exit(1);
  }

  const intervalo = setInterval(() => {
    sincronizarAlertas(repositorio).catch((e) => console.error('[alertas]', e.message));
  }, config.intervaloAlertasMs);

  const servidor = app.listen(config.port, () => {
    console.log(`Sistema de Incidencias Municipales`);
    console.log(`  API:      http://localhost:${config.port}/api`);
    console.log(`  App:      http://localhost:${config.port}`);
    console.log(`  Almacén:  ${descripcionAlmacen()}`);
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
    // Docker espera 10 s antes de matar el proceso: soltar las conexiones
    // keep-alive evita que el cierre se quede colgado tras un SIGTERM.
    servidor.closeIdleConnections?.();
    servidor.close(async () => {
      await cerrarRepositorio();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
}

await arrancar();
