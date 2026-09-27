#!/bin/sh
# ---------------------------------------------------------------------------
# Entrypoint del contenedor: deja la base de datos lista antes de arrancar.
#
#   ESPERAR_BASE=false         no espera a MariaDB (ya lo hace compose)
#   MIGRAR_AL_ARRANCAR=false   no aplica migraciones (p. ej. al correr pruebas)
#   ESPERA_INTENTOS / ESPERA_MS  ajustan la espera
#
# La semilla NUNCA se ejecuta aquí: `npm run seed` borra incidencias,
# notificaciones y usuarios. Se lanza a mano cuando de verdad se quiere:
#
#   docker compose run --rm -e MIGRAR_AL_ARRANCAR=false app npm run seed
# ---------------------------------------------------------------------------
set -e

if [ "${ESPERAR_BASE:-true}" != "false" ]; then
  echo "[entrypoint] esperando a la base de datos…"
  node scripts/esperar-base.mjs
fi

if [ "${MIGRAR_AL_ARRANCAR:-true}" != "false" ]; then
  echo "[entrypoint] aplicando migraciones pendientes…"
  ./node_modules/.bin/knex --knexfile knexfile.js migrate:latest
fi

exec "$@"
