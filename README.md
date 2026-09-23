# Sistema de Incidencias Municipales

Aplicación web para reportar y dar seguimiento a incidencias urbanas (baches, fugas,
luminarias, basura…) con geocercas por colonia/tenencia, roles diferenciados y evidencia
multimedia.

El sistema nació como un único archivo HTML con `localStorage` (conservado en
[`legacy/`](legacy/) como referencia) y hoy está dividido en **backend** y **frontend**:

```
backend/    API REST con Express siguiendo MVC + capa Repository (drivers json / MySQL)
frontend/   Aplicación de navegador en JavaScript modular (ES Modules, sin bundler)
legacy/     Monolito original, solo como respaldo y referencia de paridad
```

---

## Arquitectura

### Backend (Express + MVC)

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| **Modelos** | `backend/src/models/` | Forma de cada entidad, validación y reglas de dominio del objeto (incidencia, tipo, municipio, zona, usuario, notificación). |
| **Repositorios** | `backend/src/repositories/` | Acceso a datos. Contrato único en `contrato.js` con dos drivers intercambiables: `json/` (archivos en disco) y `mysql/` (Knex). |
| **Servicios** | `backend/src/services/` | Lógica de negocio: geocerca, color por antigüedad, autenticación, alcance por rol/municipio, incidencias, estadísticas, evidencia, importación. |
| **Controladores** | `backend/src/controllers/` | Traducen HTTP ↔ servicios. No contienen lógica de negocio. |
| **Rutas** | `backend/src/routes/` | Un router por recurso, montado bajo `/api`. |
| **Middlewares** | `backend/src/middlewares/` | Autenticación JWT, roles, inyección del repositorio, carga de archivos (multer) y errores. |

### Frontend (JavaScript modular, sin framework)

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| **core** | `frontend/js/core/` | Infraestructura: `api.js` (fetch + token), `session.js`, `store.js` (estado observable), `eventos.js` (delegación), `ui.js`, `utils.js`, `geocerca.js`, `aplicacion.js` (orquestación) y `errores.js`. |
| **services** | `frontend/js/services/` | Una función por endpoint. |
| **controllers** | `frontend/js/controllers/` | Orquestan store + servicios + vistas y registran las acciones de la interfaz. |
| **views** | `frontend/js/views/` | Renderizan HTML a partir de datos. Nunca llaman a la API. |
| **map** | `frontend/js/map/` | Todo Leaflet: capa satelital, límites, zonas, marcadores y popups. |
| **css** | `frontend/css/` | `base`, `layout`, `componentes`, `admin` (extraídos del monolito) y `reportes` (impresión). |

La interfaz no usa atributos `onclick`: cada elemento declara `data-action="dominio:accion"`
(o `data-change`, `data-input`, `data-submit`) y los controladores registran su manejador.

---

## Requisitos

- Node.js 20 o superior (probado con 22).
- MySQL o MariaDB **solo** si se usa el driver de base de datos.

## Instalación y arranque

```bash
npm install                 # instala el backend (el frontend no necesita dependencias)
cp .env.example backend/.env
npm run dev                 # servidor con recarga automática
npm start                   # servidor normal
```

La aplicación queda disponible en `http://localhost:3000` (la API en `/api`).
Express sirve el frontend estático, así que no hay CORS ni configuración de URL base.

### Credenciales de demostración

| Rol | Usuario | Contraseña | Clave de municipio |
|---|---|---|---|
| Administrador | `admin` | `admin123` | — |
| Funcionario | `funcionario` | `func123` | `MARAVATIO-2024` |
| Funcionario | `funcionario2` | `func123` | `MARAVATIO-2024` |
| Ciudadano | — | — | acceso anónimo |

> Las contraseñas se guardan con bcrypt. En el monolito estaban en claro dentro de
> `localStorage`.

---

## Scripts

Desde la raíz (delegan en `backend/`):

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm start` | Arranca el servidor (`node --watch` / `node`). |
| `npm test` | Suite de pruebas de la API (node:test + supertest). |
| `npm run migrate` | Aplica las migraciones de Knex. |
| `npm run migrate:rollback` | Revierte el último lote de migraciones. |
| `npm run seed` | Carga los datos semilla (municipios, zonas, tipos, usuarios). |

Dentro de `backend/`:

| Comando | Qué hace |
|---|---|
| `npm run extraer-semilla` | Regenera `src/config/seed-data/*.json` desde `legacy/`. |
| `npm run importar-legacy -- respaldo.json` | Importa un respaldo del sistema anterior. |
| `npm run limpiar-bases-prueba` | Borra las bases `incidencias_test_*` de las pruebas. |

---

## Variables de entorno

Ver [`.env.example`](.env.example). Las relevantes:

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor. |
| `STORAGE_DRIVER` | `json` | `json` (archivos en `backend/data/`) o `mysql` (Knex). |
| `JWT_SECRET` | — | **Obligatorio cambiarlo en producción.** |
| `JWT_EXPIRES_IN` | `8h` | Vigencia del token. |
| `DATA_DIR` / `UPLOAD_DIR` | `backend/data`, `backend/uploads` | Datos y evidencia. |
| `DB_HOST` … `DB_NAME` | `127.0.0.1:3306` / `incidencias` | Conexión MySQL/MariaDB. |
| `MAX_FOTO_BYTES`, `MAX_VIDEO_BYTES`, `MAX_VIDEO_SEG` | 100 MB, 1 GB, 300 s | Límites de evidencia. |

---

## API REST

Todas las rutas requieren `Authorization: Bearer <token>` salvo las de login y `/api/catalogos`.

### Autenticación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/anonimo` | público | Entrada como ciudadano anónimo (`anonId` opcional y persistente). |
| POST | `/api/auth/funcionario` | público | Usuario + contraseña + clave de municipio. |
| POST | `/api/auth/admin` | público | Usuario + contraseña. |
| GET | `/api/auth/me` | sesión | Sesión actual y municipio sugerido para el mapa. |
| POST | `/api/auth/municipio-activo` | empleado | Cambia de municipio (exige la clave) y devuelve token nuevo. |

### Catálogos

| Método | Ruta | Rol |
|---|---|---|
| GET | `/api/catalogos` | público (iconos, ejemplos guía, límites) |
| GET | `/api/municipios` | sesión (la clave solo se incluye al admin) |
| GET | `/api/municipios/:id/zonas` | sesión |
| GET | `/api/municipios/:id/zonas/resumen` | empleado |
| GET / POST / DELETE | `/api/tipos`, `/api/tipos/:id` | sesión / empleado / empleado |
| GET | `/api/usuarios` | empleado (sin hashes de contraseña) |

### Incidencias y evidencia

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/incidencias` | sesión | Filtros: `texto`, `estado`, `tipo`, `color`, `zona`, `orden`. |
| GET | `/api/incidencias/:id` | sesión | Detalle + `permisos` calculados en el servidor. |
| POST | `/api/incidencias` | sesión | Crea un reporte (valida geocerca y duplicados). |
| PUT | `/api/incidencias/:id` | autor o empleado | Edita conservando estado, fecha e historial. |
| PATCH | `/api/incidencias/:id/estado` | empleado | `reportada` ↔ `en_proceso`. |
| POST | `/api/incidencias/:id/resolucion` | empleado | Marca resuelta con descripción y evidencia. |
| DELETE | `/api/incidencias/:id` | admin | Elimina la incidencia. |
| POST | `/api/incidencias/:id/comentarios` | sesión | Comenta y avisa al autor. |
| POST | `/api/uploads` | sesión | Sube evidencia (multipart, campo `archivos`). |

### Informes y administración

| Método | Ruta | Rol |
|---|---|---|
| GET | `/api/stats/panel` | empleado |
| GET | `/api/stats/informes` | empleado |
| GET | `/api/exportacion` | empleado (respaldo sin hashes ni claves) |
| POST | `/api/admin/limpiar` | admin |
| POST | `/api/admin/importar` | admin |

### Alcance de datos (se aplica siempre en el servidor)

| Rol | Qué ve |
|---|---|
| Ciudadano anónimo | Solo sus propios reportes, dentro de su municipio. |
| Funcionario | Todo su municipio. |
| Administrador | Todos los municipios, o solo el que tenga activo. |

---

## Cambiar a MySQL / MariaDB

1. Crea la base de datos:

   ```sql
   CREATE DATABASE incidencias CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Configura `backend/.env`:

   ```ini
   STORAGE_DRIVER=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=incidencias
   DB_PASSWORD=…
   DB_NAME=incidencias
   ```

3. Aplica el esquema y los datos semilla:

   ```bash
   npm run migrate
   npm run seed
   ```

4. Arranca: `npm run dev`. La aplicación funciona igual porque los servicios solo
   conocen el contrato del repositorio.

Detalles de la traducción a tablas: `incidencias` guarda la cabecera; `incidencia_evidencias`
(con `clase = reporte | solucion`), `incidencia_historial` e `incidencia_comentarios` son
tablas hijas con `ON DELETE CASCADE`; `notificaciones.para_usuario` nulo significa
notificación global. Las fechas son `DATETIME(3)` en UTC para que las cadenas ISO coincidan
exactamente con las del driver JSON.

### Actualizar una instalación existente

- **Driver JSON (por defecto)**: el catálogo geográfico —`municipios` y `zonas`— se compara
  con los datos semilla en cada arranque y se reescribe si difiere, así que un cambio de
  contorno municipal o de partición de zonas se aplica solo. Las incidencias, notificaciones,
  tipos y usuarios se conservan intactos.
- **MySQL / MariaDB**: la tabla `municipios` cambia su columna `bbox` por `poligono`
  (`json`). Reaplica el esquema:

  ```bash
  npm run migrate:rollback
  npm run migrate
  npm run seed
  ```

  El `rollback` elimina las tablas, así que si tienes reportes que conservar, expórtalos
  antes (**Informes → Respaldo JSON**) y reimpórtalos después (**Informes → Importar
  respaldo anterior**).

---

## Migrar los datos del sistema anterior

El sistema anterior (monolito) guardaba todo en el navegador. Para traerlo:

1. En la app antigua: **Informes → Respaldo JSON**. Se descarga un `respaldo_AAAA-MM-DD.json`.
2. En la app nueva, con una cuenta de **administrador**: **Informes → Importar respaldo
   anterior → Importar JSON**.
3. La importación convierte la evidencia base64 en archivos reales dentro de
   `backend/uploads/`, descarta el campo obsoleto `colorAuto` y respeta los tipos
   personalizados.

Alternativa por línea de comandos:

```bash
npm --prefix backend run importar-legacy -- ./respaldo_2026-09-23.json
```

---

## Pruebas

```bash
npm test                                                    # driver json (por defecto)
STORAGE_DRIVER_TEST=mysql DB_PORT=3306 DB_USER=root npm test # driver mysql
```

La suite (`backend/test/`) cubre autenticación y roles, ciclo de vida de la incidencia,
geocerca y colores derivados, filtros y alcance por municipio, evidencia, estadísticas,
exportación y la importación de respaldos. Cada archivo de pruebas usa su propio directorio
temporal y, con MySQL, su propia base de datos (`incidencias_test_<pid>`), de modo que la
**misma suite valida los dos drivers**.

---

## Sincronización con la versión nueva del monolito

El proyecto original evolucionó a una segunda versión (`legacy/sistema_de_incidencias.html`)
y esta aplicación se sincronizó con ella. Lo que cambió y cómo queda aquí:

| Cambio en el monolito | Cómo queda en el sistema nuevo |
|---|---|
| El municipio deja de ser un rectángulo (`bbox`) y pasa a ser un **polígono real** de 18 vértices | `municipios.poligono` en el modelo, el contrato del repositorio, la migración y la semilla. El mapa encuadra el polígono, limita el desplazamiento a su envolvente y **sombrea con una máscara** todo lo de fuera. `utils/geometria.js` concentra la geometría compartida. |
| Solo Maravatío (desaparecen Morelia y Uruapán) | Los datos semilla traen un único municipio. El alcance por municipio sigue activo para cuando se añadan más. |
| Las 12 zonas pasan de rectángulos a **polígonos geográficos** | Mismo modelo (`zonas.poligono`); la geocerca y la detección de zona funcionan igual. |
| El público **no pasa por la pantalla de acceso**: entra directo como ciudadano anónimo | `main.js` entra como anónimo si no hay sesión. La pantalla de acceso se abre con el botón **Personal** y se cancela con la «×». |
| La sesión vive en `localStorage` y persiste entre visitas | `core/session.js` y `core/api.js` guardan el token en `localStorage`. |
| Botones nuevos: **Personal** (solo ciudadanos) y **salir** (solo personal) | `#btn-staff-login` y `#btn-logout`, visibles según el rol. |
| Cambiar de rol ya no recarga la página (`App.iniciado` / `App.refrescar`) | `aplicacion.arrancar()` es idempotente: no crea un segundo mapa ni duplica el intervalo, y refresca los datos. |
| **4 capas base** conmutables: Satélite, Calles, Relieve/Topográfico y Físico | `map/mapa.js` con `L.control.layers` en la esquina superior derecha. |
| **Panel de leyenda** en la barra superior (icono de exclamación) | `#infoPanel` con los estados por antigüedad y las zonas; es excluyente con el panel de notificaciones. |
| **Modales anidados**: se abren encima del modal que los invoca sin cerrarlo | `abrirModal(id, { nested: true })` para «Nuevo concepto» y «Resolver». |
| El panel lateral avisa a Leaflet con `invalidateSize()` | `mapa.invalidarTamano()` invocado desde `aplicacion.alternarSidebar()`. |
| El error de ubicación distingue «fuera del municipio» | `incidencias.service.crear` usa `dentroDelMunicipio()` para elegir el mensaje. |

## Diferencias con el sistema anterior

Además de la separación en capas y del traslado de la lógica al servidor, se corrigieron
defectos del monolito:

1. **Editar ya no reinicia el estado**: antes, guardar una edición devolvía la incidencia a
   `reportada` y perdía la fecha original.
2. **El color es derivado**: `colorAuto` se guardaba en `localStorage` y la regla estaba
   duplicada en tres sitios. Ahora se calcula siempre a partir de la fecha y el estado.
3. **Filtro por municipio**: los listados y estadísticas ya no mezclan municipios.
4. **Municipio en la barra superior**: se sincroniza al iniciar sesión; el administrador ya
   no queda atado a Maravatío.
5. **Límites de evidencia homogéneos**: la evidencia de resolución aplica los mismos límites
   (antes aceptaba 100 MB sin validar la duración del video).
6. **Sin pérdidas silenciosas**: la evidencia ya no se guarda como base64 dentro del
   documento (la cuota de `localStorage` era de ~5 MB frente a límites de 100 MB/1 GB);
   ahora vive en disco y el JSON solo guarda metadatos.
7. **Seguridad**: contraseñas con bcrypt, sesión con JWT y permisos comprobados en el
   servidor (antes el rol vivía en el navegador y era manipulable).
8. **Código muerto eliminado**: `tipoIdTemp`, `esImagen`, `esPDF`, `existente`,
   `capaActual`, `incLat`/`incLng` y el `esc()` ausente en los `onclick` interpolados.

---

## Convenios

- Español para nombres de dominio, mensajes de error y comentarios.
- Los controladores no hablan con el repositorio: usan servicios; los servicios no conocen
  Express.
- Las vistas reciben datos y devuelven HTML; todo texto interpolado pasa por `esc()`.
- Los servicios devuelven objetos de dominio; los controladores deciden qué se expone
  (por ejemplo, `passwordHash` y la `clave` del municipio nunca salen salvo para admin).
