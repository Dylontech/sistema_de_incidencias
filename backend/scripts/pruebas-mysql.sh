#!/bin/sh
# ---------------------------------------------------------------------------
# Corre la suite de pruebas contra un MariaDB efímero en contenedor.
#
#   npm run test:mysql      (desde la raíz o desde backend/)
#
# Levanta `mariadb-test` (compose.test.yaml: puerto 3399, en memoria, con el
# usuario root porque cada proceso de prueba crea su propia base) y lo baja al
# terminar, pase lo que pase.
#
# Las variables se pasan por comando (no con `export`) para no dejar el entorno
# de la terminal contaminado: dotenv no sobrescribe lo que ya esté exportado, y
# un STORAGE_DRIVER=mysql olvidado estropea los siguientes arranques.
# ---------------------------------------------------------------------------
set -e

raiz=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$raiz"

echo "[pruebas-mysql] levantando mariadb-test…"
docker compose -f compose.test.yaml up -d --wait

bajar() {
  echo "[pruebas-mysql] bajando mariadb-test…"
  docker compose -f compose.test.yaml down
}
trap bajar EXIT INT TERM

echo "[pruebas-mysql] ejecutando la suite contra MariaDB…"
STORAGE_DRIVER_TEST=mysql \
DB_HOST=127.0.0.1 \
DB_PORT=3399 \
DB_USER=root \
DB_PASSWORD=pruebas \
npm --prefix backend test
