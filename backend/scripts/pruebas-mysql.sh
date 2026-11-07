#!/bin/sh
# ---------------------------------------------------------------------------
# Envoltorio POSIX del runner Node de pruebas contra MariaDB.
#
#   npm run test:mysql      (desde la raíz o desde backend/)
#   sh backend/scripts/pruebas-mysql.sh --archivo=test/cuentas.test.js
#
# La lógica vive en `pruebas-mysql.mjs` para que funcione igual en PowerShell,
# cmd y sh: levanta compose.test.yaml, espera la base, ejecuta migraciones
# cuando toca y baja el contenedor al terminar.
# ---------------------------------------------------------------------------
set -e

raiz=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$raiz"

exec node backend/scripts/pruebas-mysql.mjs "$@"
