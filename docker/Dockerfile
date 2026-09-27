# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Imagen única del sistema: API Express + frontend estático + evidencia.
#
#   docker build -f docker/Dockerfile -t sistema-incidencias .
#
# El contexto es la RAÍZ del repositorio (no backend/) porque el backend
# resuelve `config.paths.frontend` como carpeta hermana de backend/.
# ---------------------------------------------------------------------------

# --- Dependencias de producción -------------------------------------------
FROM node:22-alpine AS dependencias
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# --- Aplicación ------------------------------------------------------------
FROM node:22-alpine AS aplicacion

ENV NODE_ENV=production
WORKDIR /app/backend

# Código del backend (incluye db/migrations, db/seeds y src/config/seed-data)
# y el frontend como carpeta hermana.
COPY backend/ ./
COPY frontend/ /app/frontend/
COPY --from=dependencias /app/backend/node_modules ./node_modules

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# uploads/ y data/ tienen que existir y ser del usuario `node`: cuando Docker
# inicializa un volumen con nombre hereda el dueño del directorio de la imagen,
# así que sin esto el contenedor no podría escribir la evidencia.
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /app/backend/uploads /app/backend/data \
  && chown -R node:node /app/backend/uploads /app/backend/data

USER node
EXPOSE 3000

# Espera a MariaDB y aplica las migraciones pendientes (la semilla no: borra datos).
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
