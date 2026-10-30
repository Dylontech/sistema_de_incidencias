# PROJECT_CONTEXT — Sistema de Incidencias Municipales

> Documento vivo. **Cada cambio en esquema, rutas, servicios, roles, permisos, configuración, eventos o flujos de interfaz debe actualizar este archivo antes de considerarse terminado.**
>
> Última actualización: 2026-10-30 · Versión del documento: 2.11.0 · Estado: V2.11.0 implementada y verificada; suite JSON 345/345.

## 1. Qué es este sistema

Aplicación web para reportar, dar seguimiento y moderar incidencias urbanas y viales de municipios mexicanos. Incluye:

- Reporte ciudadano anónimo o con cuenta, geocercas por municipio/comunidad y evidencia multimedia.
- Panel de personal con alcance territorial por municipio, estado o global.
- Tickets de soporte, mensajería interna, contacto ciudadano y sugerencias.
- Informes internos y solicitudes de informe con cuenta registrada y doble opt-in.
- Notificaciones en tiempo real por SSE, correo y preferencias por evento.
- Moderación de contenido, denuncias, advertencias y suspensiones.
- Campañas de correo con suscripción confirmada.
- App de escritorio Electron con mapas offline.
- V2.2: firmas de incidencias, comentarios con reglas, legal editable, contacto directo a funcionarios, historial de notificaciones, folios, simulador admin, publicidad, directorio de correos institucionales y respaldos.
- V2.3: capas de mapa depuradas y sin solapamientos, geolocalización con cambio de municipio, informes con búsqueda multiestado/municipio, estadísticas comparativas y tiempos de resolución, fichas municipales con aprobación, roles especiales y solicitudes de permisos, editor de publicidad con colores/estructura, claves separadas y tutoriales por sección.
- V2.4: soporte con permiso explícito y enlace oculto, mapa con capas clicables, barra lateral reagrupada y accesible, informes con filtro estado→municipios y visor de archivos, reglas de tickets solo para admin con simulación, publicidad sin guardar y tutoriales con simulaciones seguras.
- V2.5: paginación de informes con Paged.js, diseño configurable de logo institucional, márgenes y pie, y tutoriales con secuencia real de apertura/cierre de modales; tickets e informes quedan restringidos a cuentas registradas.
- V2.6: informes y tickets pasan de páginas independientes a modales de la vista principal; las rutas antiguas redirigen con enlaces profundos. El formulario de informe usa estado→municipios y enlace directo al aviso de privacidad. La bienvenida del tutorial se muestra una sola vez por dispositivo y queda disponible en la enciclopedia.
- V2.7: prioridad de tickets definida solo por soporte/admin; informe con varios estados y municipios; aviso de privacidad en modal reutilizable; aceptación de términos/privacidad versionada y exigida también en servidor; marcador azul distintivo de «mi ubicación».
- V2.10: permisos CRUD separados (ver/crear/editar/eliminar) para usuarios, claves, tipos, solicitudes de acceso y avisos por clave; las claves de acceso llevan su propia matriz de permisos y territorio, y ese alcance se aplica a todas las acciones de la sesión. El alta de personal puede partir de una clave y el correo repetido responde 409.
- V2.11: los roles integrados tienen matriz editable en la tabla `roles` (con «Restablecer a fábrica») y el administrador maestro puede crear roles propios que heredan una plantilla. Las contraseñas se guardan también cifradas (AES-256-GCM) para consulta y restablecimiento auditados; el cambio de contraseña se solicita al administrador. Las estadísticas rechazan con 403 el territorio ajeno y el selector solo ofrece el ámbito propio. Tipografía más grande y ayuda de cada permiso con guías simuladas en la enciclopedia.
- V2.11.1: sin tema claro/oscuro; un funcionario solo edita el nombre de otras cuentas y las bajas se **solicitan** (`solicitudes_baja`) para que las resuelva la administración.
- V2.11.2: los avisos de solicitudes abren la cuenta y su acción en el panel; las contraseñas restablecidas se entregan al solicitante por la campana.
- V2.11.3: las cuentas dadas de baja se pueden **reactivar**; el personal **solicita** las altas (`solicitudes_usuario`) con nombre, usuario, correo y teléfono en lugar de crearlas; Municipios muestra solo la ficha del funcionario de un municipio y el texto del panel es más grande.

## 2. Arranque rápido

### Docker (recomendado)

```
cp .env.example .env
docker compose up -d --wait
docker compose exec app npm run seed
```

La aplicación queda en `http://localhost:3100` (configurable con `APP_PORT`). MariaDB se publica en el host en `127.0.0.1:3310`.

### Host con MariaDB local

```
cp .env.example backend/.env
npm install
npm run migrate
npm run seed
npm run dev
```

La aplicación queda en `http://localhost:3000` si `PORT=3000` en `backend/.env`.

`npm run dev` usa `backend/scripts/dev.mjs`: comprueba el puerto antes de lanzar `node --watch`. Si ya hay un servidor, informa y sale con código 0 sin crear otro watcher, evitando el bucle de «Failed running» por `EADDRINUSE`.

### Credenciales demo

| Rol | Usuario | Contraseña | Clave de municipio |
|---|---|---|---|
| Administrador maestro | `admin` | `admin123` | — |
| Funcionario | `funcionario` | `func123` | `16050` |
| Funcionario | `funcionario2` | `func123` | `16050` |
| Ciudadano | correo propio | contraseña propia | se crea desde la pantalla de acceso |

## 3. Arquitectura

```
backend/    API REST Express + MVC + Repository (MySQL/MariaDB y JSON)
frontend/   SPA modular con ES Modules, sin bundler, servida por Express
desktop/    Electron para Windows/Linux con mapas offline
docker/     Dockerfile y entrypoint
legacy/     Monolito original conservado como referencia
```

### Backend

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| Config | `backend/src/config/` | Variables de entorno, constantes de dominio y semilla. |
| Modelos | `backend/src/models/` | Forma de las entidades y reglas de dominio. |
| Repositorios | `backend/src/repositories/` | Contrato único y drivers `mysql/` y `json/`. |
| Servicios | `backend/src/services/` | Lógica de negocio y autorización fina. |
| Controladores | `backend/src/controllers/` | Traducción HTTP ↔ servicios. |
| Rutas | `backend/src/routes/` | Routers montados bajo `/api`. |
| Middlewares | `backend/src/middlewares/` | Auth, roles, alcance, seguridad, límites, errores, uploads. |

Reglas de oro:

1. Todo método nuevo debe existir en `repositories/contrato.js` y en **ambos** drivers.
2. MySQL valida tablas/columnas al arrancar (`TABLAS`, `COLUMNAS`); si falta algo, hay que migrar.
3. Las FKs a `usuarios.id` deben copiar la colación real (`colacionDeUsuarios`) y usar `utf8mb4`.
4. El rol, los permisos y el alcance se recalculan en cada petición; nunca se confía en el cliente.
5. Los servicios vuelven a comprobar autorización y alcance aunque la ruta ya tenga middleware.

Procesos de fondo:

- `iniciarTrabajador()`: cola de solicitudes de informe.
- `iniciarMuestreo()`: métricas del servidor.
- `iniciarRespaldos()`: cada 30 min comprueba `respaldos.intervalo_horas`; crea un respaldo automático, aplica retención y avisa al admin sin detener el servidor.
- El simulador usa `AsyncLocalStorage` (`simulacion.contexto.js`) para bloquear SSE/correo y etiquetar notificaciones; la reversión borra por `simulacion_id` con comprobaciones de FK.

### Frontend

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| Core | `frontend/js/core/` | API, sesión, store, delegación, modales, SSE, offline, consentimiento. |
| Services | `frontend/js/services/` | Una función por endpoint. |
| Controllers | `frontend/js/controllers/` | Orquestan store + servicios + vistas y registran acciones. |
| Views | `frontend/js/views/` | Renderizan HTML; nunca llaman a la API. |
| Map | `frontend/js/map/` | Leaflet, capas base, límites, zonas y marcadores. |
| Data | `frontend/js/data/` | Catálogos estáticos (tutoriales, capas, acciones y plantillas de publicidad/correo). |
| CSS | `frontend/css/` | `base`, `layout`, `componentes`, `admin`, `extensiones`, `reportes`, `impresion-informe`, `publicidad-estudio`. |

La interfaz no usa `onclick`. Cada elemento declara `data-action="dominio:accion"` (o `data-change`, `data-input`, `data-submit`) y los controladores se registran con `registrarAcciones()`.

Onboarding: `consentimiento.cargarVersion()` consulta `/api/legal/terminos`; la versión publicada (no una fecha fija) decide si hay que volver a aceptar. El panel admin incluye pestañas Municipios (con ficha), Claves de acceso, Simulador, Publicidad y campañas (fusionadas) y Correos institucionales. El botón del usuario abre «Mi cuenta» para consultar permisos y solicitar permisos extra. Las guías de la enciclopedia abren automáticamente el panel, la pestaña, Monitoreo o Informes que necesitan (`vista`/`tab` en `data/tutoriales.js`).

V2.4: la barra lateral se agrupa en «Mi actividad», «Participación» y «Ayuda», con filtros y colindantes separados; incluye controles A−/A+/restablecer persistentes (`inc_accesibilidad_v1`). El tutorial admite un bloque `simulacion` por paso: abre modales, prellena campos y muestra previews sin ejecutar acciones destructivas; los formularios públicos de informe y ticket tienen sandboxes (`modalDemoInforme`, `modalDemoTicket`). El panel de soporte se oculta y se bloquea en cliente si `/api/auth/me` no devuelve `puedeAtenderTickets`. Las solicitudes de informe generan archivos únicos por folio y se abren en el visor modal (`modalVisorInforme`); en Electron/VS Code, donde el visor PDF de Chromium no siempre está disponible, el modal ofrece abrir el PDF fuera y descargarlo.

V2.5: el informe imprimible usa Paged.js (vendorizado y adaptado a CSSOM para la CSP), con márgenes, pie y contador de páginas; el modal de informes permite subir un logo, moverlo con la vista previa, elegir posición/ancho y ajustar márgenes y pie. La guía de reporte abre el formulario, cierra el modal para ubicar el mapa y lo reabre; las guías de detalle cierran el modal antes de señalar la lista. Tickets e informes exigen una cuenta registrada, también en el servidor.

V2.6: `/informes.html` y `/tickets.html` ya no existen como vistas. `GET /informes` y `GET /tickets` redirigen a `/?informe=1`, `/?verificar=…`, `/?tickets=1` o `/?ticket=…`, y `main.js` abre el modal correspondiente. Los enlaces de folio usan `/?informe=1&folio=…` y el modal abre la consulta con el folio precargado; los correos usan `/?verificar=…`. Los modales `modalSolicitudInforme` y `modalTickets` bloquean el formulario para sesiones anónimas con enlaces de acceso; el de informes usa un selector multiestado y el aviso de privacidad en modal. El tutorial inicial («Primeros pasos») se autoabre una sola vez por dispositivo (`inc_tutorial_bienvenida_v1`) y también aparece en la enciclopedia; las guías de informes y tickets abren sus modales de demostración sin navegar fuera de la SPA.

V2.7: `modalSolicitudInforme` usa `crearSelectorTerritorial({modo:'ambos'})`; un estado añadido representa todo el estado y los municipios concretos se suman como unión en el informe. El servidor expande los estados en sus municipios cuando la solicitud combina ambos y ya no trunca la selección en silencio. La prioridad de un ticket ciudadano queda fijada en `media`; solo soporte y administradores pueden definirla o cambiarla desde `/soporte` o `#modalTicketAdmin`. `modalAvisoLegal` muestra términos/privacidad desde `GET /api/legal/:clave` y se abre encima del onboarding o del informe. El onboarding pinta los documentos publicados, guarda una aceptación versionada por `userKey` en `aceptaciones_legales` y el middleware `terminos.js` bloquea las escrituras con 428 hasta que se acepte la versión vigente. `mapa.js` conserva un marcador azul de persona (`marker-usuario`) separado de los pines de incidencia y de los clústeres.

V2.7.1 (estudio de publicidad): la pestaña «Publicidad y campañas» se divide en navegación interna (plantillas, diseñar, exportar/Canva, guardadas y campañas de correo). `data/plantillas-publicidad.js` contiene piezas editoriales, formatos, diseños, familias tipográficas y paletas; `views/diseno-publicidad.js` genera el SVG en vivo, el PNG y el CSV para «Creación en masa» de Canva. El lienzo usa una imagen SVG `data:` permitida por la CSP y los colores se aplican por CSSOM. El editor de correo añade plantillas, HTML avanzado, contador de caracteres, generación de texto plano y vista previa escritorio/móvil.

V2.8 (publicidad medible y adjuntos): el editor admite 22 plantillas, 10 formatos (incluido tamaño personalizado), 8 diseños, 8 familias tipográficas, imagen de fondo editable, importación/exportación JSON, plantillas propias guardadas en `localStorage` y QR configurable (contenido, tamaño, nivel, color y etiqueta). `POST /api/admin/publicidad/qr` genera SVG/PNG/PDF localmente; `GET /api/publico/qr/:codigo` sirve la ficha y `POST /api/publico/qr/:codigo/escaneo` registra el escaneo; `/r/:codigo` redirige a la SPA con `?qr=`. Los adjuntos de chats y comentarios viven en `adjuntos` y se sirven solo por `/api/adjuntos/:id`; los chats aceptan imágenes, PDF y Office, los comentarios solo imágenes. Cada pestaña del panel declara `data-permiso` y las rutas vuelven a exigir el permiso con `requierePermiso`. Los tutoriales reconcilian la vista/modal de cada paso y la tarjeta procura colocarse fuera de la sección enfocada cuando hay espacio.

UI V2.8: el panel oculta las pestañas sin `data-permiso`; la bandeja incorpora la pestaña «Contactos directos» para personal y ciudadanos (con `?contacto=` como enlace profundo), el compositor de mensajes/contactos acepta un archivo y los comentarios muestran una miniatura y un selector de imagen. Los adjuntos se descargan con `urlPrivada()` para añadir el token a las etiquetas `<img>`.

UI V2.8.1/V2.9 (acceso): la tarjeta de acceso muestra los avisos del servidor en `#loginMensaje` (`publico-msg`, `role="status"`), con botón de acción; `.toast` (14000) y `.loading-overlay` (13900) quedan por encima del acceso (10000), del paso previo (11000), del aviso legal (12000) y de la confirmación (13000), de modo que ningún error del alta o del login se pinta detrás de la tarjeta. El ciudadano entra con **nombre o pseudónimo + contraseña** (`#ciud-nombre`); el correo es el canal de avisos y **no puede repetirse** (índice único en la base). Los formularios de acceso y alta validan con `required`/`minlength`, el botón de envío se bloquea mientras dura la petición y un nombre ocupado (409) muestra «Ese nombre ya tiene una cuenta» con la acción «Entrar con este nombre» (`auth:usarNombre` → `prepararLogin`, que precarga el nombre); un correo ocupado (409) avisa y ofrece pasar al acceso (`auth:modoAnon` → `login`). Al terminar el alta se muestra la credencial («Tu cuenta quedó como …»). `alternarPseudonimo()` oculta el bloque del nombre con `hidden`/`u-oculto` y ajusta su `required`, sin estilos inline. El armazón offline pasa a `incidencias-shell-v2.9.0`.

V2.9.2 (selector de informes): `modalSolicitudInforme` usa `crearSelectorTerritorialPorEstado` (`frontend/js/core/selector-territorial-bloques.js`). El estado se elige con un combobox de escritura; cada estado agregado crea un bloque con buscador de municipios, casilla «Seleccionar todos los municipios» (estado completo → `estados`) y lista con casillas. Los municipios concretos se envían en `municipios`; no hay chips ni buscador único. La demo `modalDemoInforme` y los pasos 3–4 de la guía usan el mismo componente. El armazón offline pasa a `incidencias-shell-v2.9.2`.

V2.9.3 (cobertura nacional y carga única): `/api/municipios` y `/api/publico/municipios` devuelven `estados` con las 32 entidades federativas; `store.estado.estados` alimenta los selectores del informe, la demo, estadísticas y cuentas del personal. Los estados que aún no tienen municipios importados se pueden incluir completos (`estados`) y muestran un aviso. `crearSelectorTerritorial` y `crearSelectorTerritorialPorEstado` aceptan `catalogoEstados`, y la validación de alcance de las cuentas acepta cualquier entidad. El splash de arranque es el único spinner mientras está visible: `loading()` actualiza su texto y `retirarArranque()` traspasa la carga pendiente al overlay. El armazón offline pasa a `incidencias-shell-v2.9.3`.

V2.9.4 (claves por estado, sesiones y auditoría): el modal de claves usa el mismo selector territorial por bloques que los informes: se elige un estado con escritura, se buscan sus municipios y «Incluir el estado completo» envía el estado en `estados`. El servidor expande los estados a sus municipios, guarda `clave_acceso_estados` y valida que la entidad tenga catálogo. La lista de claves muestra código, territorio, usuarios vinculados, sesiones activas, usos, vencimiento y estado, y permite eliminar la clave; al eliminarla se cierran sus sesiones (`sesiones_usuario.clave_id`) y el middleware rechaza los tokens en la siguiente petición. El monitoreo de sesiones indica la clave de cada sesión. La pestaña «Auditoría» (`ver_auditoria`) lista cada petición que modifica datos con fecha, actor, rol, permisos, acción, entidad, resultado, clave e IP hash; el cuerpo se sanea y nunca guarda contraseñas, tokens ni claves. La pestaña de estadísticas recrea su selector al abrirse para tomar el catálogo actual (las 32 entidades) y no quedarse con el de la primera carga. El catálogo nacional del INEGI quedó importado con 2 475 municipios y 50 763 comunidades de las 32 entidades; `scripts/sincronizar-catalogo.mjs` los lleva a MySQL sin borrar usuarios ni incidencias. El armazón offline pasa a `incidencias-shell-v2.9.4`.

V2.9.5 (avisos por clave, resumen de solicitudes y panel adaptable): las notificaciones de `solicitud_informe_creada`, `solicitud_informe_enviada` y `solicitud_informe_error` enlazan a `/?admin=solicitudes-informe&solicitud=<id>`; el clic abre la pestaña y el modal con el resumen completo (solicitante, territorio, fechas, tipos, formato, mensaje, error y acciones). La nueva pestaña «Avisos por clave» (`gestionar_avisos_clave`) permite elegir los municipios donde cada clave recibe avisos; el servidor los intersecta con el territorio de la clave y con la sesión más reciente que la usó. Revocar los avisos no invalida la clave para iniciar sesión. El panel de control tiene botones A−/A/A+ que comparten la preferencia global de texto y un control para hacerlo más grande o pequeño, además de redimensionado nativo. La generación de claves usa un candado contra dobles clics y pinta la clave nueva de inmediato. Publicidad y campañas permiten expandir/contraer secciones y redimensionarlas; la etiqueta del QR se acortó y el bloque QR usa una cuadrícula adaptable. Las vistas se ajustan a móvil, laptop, monitores grandes y TV. El armazón offline pasa a `incidencias-shell-v2.9.5-r2`; la creación y validación de claves usan `municipiosLigeros()` para no cargar los polígonos del catálogo.

V2.10 (permisos CRUD y clave en el alta): `frontend/js/data/permisos.js` centraliza la matriz, las etiquetas y los grupos CRUD; el modal de usuario y el de claves pintan una tarjeta por módulo (Usuarios, Claves, Tipos, Solicitudes de acceso, Avisos por clave) con casillas Ver/Crear/Editar/Eliminar. Al abrir el alta de una cuenta, el selector «Clave de acceso» lista las claves vigentes; al elegir una se rellenan el rol, los selectores territoriales y la matriz de permisos como vista previa. La tabla de usuarios muestra los botones de editar y desactivar solo con `editar_usuarios`/`eliminar_usuarios`, y la de claves muestra el número de permisos y oculta «Eliminar» sin `eliminar_claves`. Las pestañas Claves, Avisos por clave y Solicitudes usan `ver_claves`, `ver_avisos_clave` y `ver_solicitudes_acceso`; las rutas repiten la comprobación con los permisos CRUD concretos. El armazón offline pasa a `incidencias-shell-v2.10.0` y precarga `js/data/permisos.js`.

V2.11 (roles propios, contraseñas y tema): el alta de cuentas usa `crearSelectorTerritorialPorEstado` con `alCompletarEstado:'municipios'` para los roles que solo aceptan municipios: se escribe el estado, se busca el municipio y el bloque vacío permite añadir otro estado. El selector de clave muestra un ejemplo práctico y una vista previa de lo que concede. Junto al rol especial hay un botón «Crear rol» que abre `#modalRolesEspeciales` encima del alta (`nested`), guarda el rol propio y ofrece «Aplicar a esta cuenta»; el formulario de usuario se conserva detrás. `#modalRolesEspeciales` pasa a «Roles y permisos» con tres listas (roles del sistema editables + «Restablecer a fábrica», roles propios y roles especiales). La tabla de usuarios añade «Ver contraseña» (`modalPasswordUsuario`, texto difuminado con `.password-oculta`, copiar y restablecer) solo con `revelar_password_usuarios`; el bloque de solicitudes de permisos y el de solicitudes de contraseña se ocultan sin su permiso. «Mi cuenta» permite solicitar el cambio de contraseña con motivo. Cada casilla de la matriz tiene un botón «?» que abre `modalAyudaPermiso` con la explicación de `js/data/permisos-ayuda.js`. Tipografía base de 15px y tablas de 13px. El armazón offline pasa a `incidencias-shell-v2.11.0`.

V2.11.1 (sin tema, funcionario acotado y bajas): se retira por completo el tema claro/oscuro (`tema.js`, `tema-publico.js`, `tema-oscuro.css`, controles y `data-theme`); la interfaz queda en tema claro fijo. Un funcionario con `editar_usuarios` **solo cambia el nombre completo**: el servidor rechaza con 403 rol, rol propio, rol especial, municipios, estados, escritura, estado, correo, permisos y contraseña. Al crear cuentas, el servidor impone `rol='funcionario'` y el territorio del propio funcionario, e ignora los municipios enviados; `claveId`, `rolPropioId`, `rolPersonalizadoId` y `permisos` responden 403. La baja directa también responde 403: se **solicita** (`POST /api/baja/solicitudes`) y la administración la resuelve en la pestaña Usuarios (al aprobar se aplica la baja lógica). El selector de estadísticas usa `alcance.modo` (`todos|estados|municipios`): un funcionario municipal ve `crearSelectorTerritorial` en modo `municipios`, sin «Añadir un estado» ni «Todos los estados». En móvil, `.admin-panel .filter-row > *` recupera `flex: 0 0 auto`, que era la causa de los huecos gigantes en Publicidad y Campañas. El armazón offline pasa a `incidencias-shell-v2.11.1`.

V2.11.2 (avisos de baja y contraseña con entrega): las filas de la tabla de usuarios llevan `data-usuario` y las de las bandejas `data-solicitud`; `admin.controller.enfocarSolicitud()` abre la pestaña Usuarios y resalta (`tr.fila-destacada`) la cuenta y la solicitud del aviso, con sus botones de aprobar/rechazar a la vista. `navegarAlOrigen()` reconoce `/?panel=usuarios&baja=<id>&usuario=<id>` y `...&password=<id>&usuario=<id>`: la administración va al panel y cualquier otra cuenta abre «Mi cuenta», que ahora lista también «Mis solicitudes de baja». La tabla de usuarios añade «Solicitar cambio de contraseña» (`#modalSolicitudPassword`) para quien no es administrador y tiene `editar_usuarios`. Al aprobar, la contraseña temporal se muestra al administrador y se entrega al solicitante por la campana; el titular recibe un aviso sin la clave. El armazón offline pasa a `incidencias-shell-v2.11.2`.

V2.11.3 (reactivar cuentas, solicitud de alta y texto más grande): la pestaña Usuarios muestra «Solicitar alta de usuario» (`#modalSolicitudAlta`) en lugar de «Nuevo usuario» cuando la sesión no administra; la bandeja `#solicitudesAltaBox` resuelve las peticiones y al aprobar abre `modalPasswordUsuario` con la temporal que también viaja al solicitante por `alta_resuelta`. Las filas inactivas muestran «Reactivar» (`admin:usuarioReactivar` → `POST /api/usuarios/:id/reactivar`). En Municipios, `renderMunicipios` recibe/deriva `municipal` y oculta `#municipioActivoBox` y `#municipiosFiltroBox`, dejando solo la fila del municipio propio con su «Ficha». «Editar permisos» de un rol del sistema funciona porque `rolSistemaPorId`/`rolPropioPorId` comparan ids como texto; «Limpiar» deja el formulario en rol propio y habilita la plantilla. La tipografía sube a 16 px base (campos y botones 15, tablas 14, notas 13). El armazón offline pasa a `incidencias-shell-v2.11.3`.

**Roles del sistema editables (V2.11):** la matriz de cada rol integrado se guarda en la tabla `roles` y `permisosDe()` la usa antes que `PERMISOS_POR_ROL`. «Restablecer a fábrica» vuelve a la constante. Los roles propios (`tipo='propio'`) heredan la plantilla guardada en `usuarios.rol` pero **sustituyen** su matriz de permisos; se asignan con `usuarios.rol_propio_id`. Solo el administrador maestro gestiona roles (`/api/roles*`).

**Restricciones del funcionario (V2.11):** quien no es administrador solo crea y edita cuentas con plantilla `funcionario` dentro de sus municipios; no puede cambiar permisos (`exigirPuedeEditarPermisos`), ni contraseñas (`exigirPuedeCambiarPassword`), ni generar claves (`claves.crear/revocar/eliminar` exigen `esAlgunaAdmin` y `generarClave` responde 403). La contraseña inicial sí se fija al crear la cuenta. Nadie concede permisos que no tiene (`permisosOtorgables`), salvo el maestro.

## 4. Roles y permisos

Roles: `anonimo`, `ciudadano`, `funcionario`, `auditor`, `enlace_estatal`, `enlace_federal`, `soporte`, `admin_municipal`, `admin_estatal`, `admin`.

Grupos:

- `ROLES_PERSONAL`: todo el personal con acceso al panel.
- `ROLES_ADMIN`: `admin`, `admin_estatal`, `admin_municipal`.
- `ROLES_ATENCION`: `soporte`, `admin_municipal`, `admin_estatal`, `admin`; abre la cola del panel de soporte.
- `ROLES_LECTURA`: `auditor`, `enlace_estatal`, `enlace_federal`.
- `ROLES_CUENTA`: `ciudadano` + personal.

Permisos base:

`reportar`, `editar_propios`, `cambiar_estado`, `resolver`, `moderar`, `exportar`, `gestionar_usuarios`, `gestionar_claves`, `gestionar_avisos_clave`, `ver_monitoreo`, `responder_tickets`, `atender_tickets`, `configurar_notificaciones`, `ver_metricas`, `ver_auditoria`.

Permisos por sección del panel (V2.8): `ver_moderacion`, `ver_usuarios`, `ver_incidencias_panel`, `ver_tipos`, `gestionar_tipos`, `ver_municipios_panel`, `ver_zonas`, `gestionar_zonas`, `ver_firmas`, `gestionar_solicitudes_informe`, `gestionar_legal`, `gestionar_configuracion`, `gestionar_respaldos`, `usar_simulador`, `gestionar_publicidad`, `gestionar_correos`, `ver_auditoria` (V2.9.4) y `gestionar_avisos_clave` (V2.9.5). La pestaña `admin:tab` lleva `data-permiso`, `PERMISO_POR_TAB` bloquea la apertura y el router correspondiente repite la comprobación en el servidor.

Permisos CRUD (V2.10):

- Usuarios: `ver_usuarios`, `crear_usuarios`, `editar_usuarios`, `eliminar_usuarios` (baja lógica).
- Claves: `ver_claves`, `crear_claves`, `editar_claves` (revocar), `eliminar_claves`.
- Tipos: `ver_tipos`, `crear_tipos`, `eliminar_tipos` (el catálogo no tiene edición; `editar_tipos` queda reservado y no se muestra en la matriz).
- Solicitudes de acceso: `ver_solicitudes_acceso`, `aprobar_solicitudes_acceso`, `rechazar_solicitudes_acceso`.
- Avisos por clave: `ver_avisos_clave`, `editar_avisos_clave`.

Permisos V2.11:

- `ver_solicitudes_permisos`, `aprobar_solicitudes_permisos`, `rechazar_solicitudes_permisos` y el paraguas `gestionar_solicitudes_permisos`: resuelven las peticiones de permisos del personal. Sustituyen al `requiereAlgunaAdmin` de las rutas.
- `revelar_password_usuarios`: permite consultar la contraseña cifrada y restablecerla. Lo tienen `admin`, `admin_estatal` y `admin_municipal`; el resto del personal debe solicitarlo desde «Mi cuenta».

`gestionar_usuarios`, `gestionar_claves`, `gestionar_tipos` y `gestionar_avisos_clave` se conservan como permisos paraguas: `permisosDe()` los expande a sus permisos CRUD, de modo que las cuentas y roles anteriores mantienen exactamente las mismas capacidades. Un `false` explícito en un permiso concreto manda sobre la matriz del rol.

Claves que autorizan (V2.10): cada clave guarda `permisos` (lista expandida) y su territorio. Al iniciar sesión con una clave, la sesión adopta ese territorio y esa lista; el middleware `autenticar` vuelve a aplicar el recorte en cada petición, así que una clave revocada, vencida o con menos permisos surte efecto de inmediato. Por ejemplo, una clave de Maravatío con solo `ver_usuarios` permite listar únicamente las cuentas de Maravatío y rechaza crear/editar/eliminar. Si la clave no declara permisos (claves anteriores), se conservan los de la cuenta.

El alta de personal acepta `claveId`: el servidor toma de la clave el rol, el territorio y los permisos, ignorando los valores manuales del formulario. En el panel, elegir una clave rellena el rol, los selectores territoriales y la matriz de permisos como vista previa.

`atender_tickets` es el permiso que abre el panel de soporte; `responder_tickets` se conserva para responder sin abrir la cola completa. Por defecto solo `soporte` y los tres roles admin tienen `atender_tickets`; un funcionario puede recibirlo como excepción.

`ver_auditoria` (V2.9.4) abre la bitácora de acciones; por defecto solo lo tiene `admin`. Los administradores territoriales y el resto del personal pueden recibirlo como excepción, y la ruta vuelve a comprobarlo en el servidor.

`ver_avisos_clave` (V2.10) abre la pestaña «Avisos por clave»; `editar_avisos_clave` permite configurar y revocar sus municipios. El paraguas `gestionar_avisos_clave` (V2.9.5) concede ambos. Lo tienen `admin`, `admin_estatal` y `admin_municipal`; el alcance de la clave limita qué municipios puede elegir cada administrador.

Reglas clave:

- `admin` es el único con alcance global y gestión completa.
- `admin_estatal` y `admin_municipal` administran su territorio, no son admin maestro.
- `funcionario` escribe dentro de sus municipios y puede moderar.
- `auditor`, `enlace_estatal` y `enlace_federal` son de solo lectura.
- `soporte` atiende tickets con `responder_tickets` y no escribe incidencias.
- `ciudadano` y `anonimo` pueden reportar; solo `ciudadano` recibe avisos y puede firmar (V2.2). El ciudadano entra con su **nombre o pseudónimo + contraseña** (V2.9): el nombre es único entre ciudadanos (sin distinguir mayúsculas ni acentos); el correo es el canal de avisos y también es único (V2.9.1).
- `anonimo` no puede crear tickets ni solicitar informes: los modales muestran un aviso de acceso, las guías no se ofrecen y el servidor responde 403 (V2.5/V2.6).
- Ningún rol puede descartar la aceptación legal: si cambia la versión publicada, el servidor responde 428 en las escrituras y el cliente vuelve a mostrar el onboarding. La prioridad de tickets queda reservada a `puedeAtender` (soporte/admin).
- El alcance se resuelve con `alcanceDe(usuario)`, `filtrosDeAlcance()` y `puedeVerIncidencia()`.

Roles especiales (V2.3):

- `roles_personalizados` suma permisos a un rol base (`funcionario`, `auditor`, etc.) sin cambiar el enum `usuarios.rol`.
- `usuarios.rol_personalizado_id` asigna el rol; `permisosDe()` combina rol base + rol especial + excepciones de la cuenta.
- El administrador maestro crea/edita/elimina roles; solo aparecen los compatibles con el rol base elegido.
- `solicitudes_permisos` permite que el personal pida permisos extra; el administrador de su ámbito aprueba o rechaza y el permiso se guarda como excepción de la cuenta.
- Con `gestionar_usuarios` o un permiso CRUD de usuarios (`crear_usuarios`, `editar_usuarios`, `eliminar_usuarios`) aprobado, un funcionario o soporte puede gestionar cuentas de su ámbito mediante `requierePermiso`; nunca puede crear ni editar administradores.
- V2.11.1: fuera de la administración, el único campo editable es `nombre`; `rol`, `rolPropioId`, `rolPersonalizadoId`, `municipios`, `estados`, `puedeEscribir`, `activo`, `correo`, `permisos` y `password` responden **403**. Al crear solo se acepta `rol='funcionario'`, el territorio lo impone el servidor y la baja directa responde 403: se **solicita** (`solicitudes_baja`) y la resuelve la administración.
- V2.11.2: el funcionario tampoco cambia contraseñas, pero con `editar_usuarios` puede **solicitar** el restablecimiento de otra cuenta de su ámbito (`POST /api/password/solicitudes` con `usuarioId`). La administración la resuelve y la nueva contraseña llega al solicitante por la campana; el titular recibe un aviso. La resolución queda en auditoría sin guardar la clave.
- V2.11.3: **crear cuentas es solo de la administración**. Con `crear_usuarios` un funcionario envía una **solicitud de alta** (`solicitudes_usuario`) con nombre, usuario, correo, teléfono y notas; no elige rol, territorio, permisos ni contraseña. Al aprobarla nace como funcionario en los municipios del solicitante y la contraseña temporal se entrega a quien la pidió. Reactivar una cuenta dada de baja también es de la administración (`POST /api/usuarios/:id/reactivar`).
- Los cambios de permisos se recargan en cada petición (middleware `autenticar`); «Mi cuenta» refresca la sesión para mostrar los permisos aprobados.

Roles propios (V2.11):

- `roles` guarda la matriz de los siete roles integrados del personal (sin `admin`, que siempre tiene todo). Editarla cambia lo que pueden hacer las cuentas de ese rol en su siguiente petición; «Restablecer a fábrica» vuelve a `PERMISOS_POR_ROL`.
- Un rol propio declara `etiqueta`, `rol_plantilla` (funcionario, auditor, enlace estatal/federal o soporte), `territorio`, `permisos` y `activo`. Su matriz **sustituye** la de la plantilla, no se suma.
- `usuarios.rol_propio_id` asigna el rol propio; `usuarios.rol` sigue siendo la plantilla para todos los guards (alcance, escritura, panel). Los roles propios basados en administración no se permiten.
- Solo el administrador maestro gestiona `/api/roles*`; los roles integrados no se eliminan ni se desactivan.
- Un rol propio con cuentas asignadas no se puede eliminar (409): primero hay que cambiarles el rol.

## 5. Modelo de datos

Migraciones actuales: `001`–`020`, `022`–`036`, `20260929_crear_configuracion.js`, `20261025_configuracion_actor.js`, `20261026_simulacion_contexto.js`, `20261027_mejoras_v23.js`, `20261028_aceptaciones_legales.js`, `20261028_claves_estados_sesiones_auditoria.js`, `20261029_avisos_por_clave.js`, `20261030_publicidad_avanzada.js`, `20261031_adjuntos.js`, `20261101_acceso_por_nombre.js`, `20261102_correo_unico.js`, `20261103_permisos_clave.js`, `20261104_roles_permisos.js`, `20261105_password_cifrada.js`, `20261106_solicitudes_permisos_estados.js`, `20261107_roles_permisos_v211.js`, `20261108_solicitudes_baja.js`, `20261109_solicitudes_password_solicitante.js` y `20261110_solicitudes_usuario.js`.

### Catálogos
- `municipios` (id INEGI, nombre, estado, polígono, centro, zoom).
- `zonas` (localidades/colonias/tenencias del municipio).
- `tipos` (tipos de incidencia, personalizables).

### Cuentas y alcance
- `usuarios` (rol, correo, pseudónimo, permisos, suspensión, `rol_personalizado_id` V2.3). En V2.9 el `nombre` del ciudadano es su credencial de acceso (único, sin distinguir mayúsculas ni acentos). El `correo` es el canal de avisos y vuelve a ser único en V2.9.1 (`20261102_correo_unico.js`).
- `usuario_municipios`, `usuario_estados` (alcance N:M).
- `claves_acceso` (V2.3: `correo_contacto`, `correo_institucional_id`; V2.9.5: `notificaciones_activas`; V2.10: `permisos` JSON con la lista expandida o `NULL` = sin recorte), `clave_acceso_municipios`, `clave_acceso_estados` (V2.9.4: estados completos), `clave_notificacion_municipios` (V2.9.5: alcance de avisos, subconjunto de la clave), `clave_acceso_usos`.
- `sesiones_usuario` (V2.9.4: `clave_id` identifica la clave con la que se abrió la sesión; `cerrada_en` y `motivo_cierre` permiten revocarla), `solicitudes_acceso`.
- `auditoria` (V2.9.4: actor, `user_key`, rol, `clave_id`, método, ruta, estado HTTP, acción, entidad, detalle JSON saneado, IP hash, user agent y fecha).
- `roles_personalizados` y `solicitudes_permisos` (V2.3); V2.11 añade `solicitudes_permisos.estados` (destino de las cuentas sin municipio).
- `roles` (V2.11): matriz de permisos de los roles integrados (`tipo='integrado'`, clave = rol del ENUM) y roles propios (`tipo='propio'`, `rol_plantilla`, `territorio`, `activo`, `orden`). `usuarios.rol_propio_id` asigna un rol propio sin cambiar el ENUM.
- `usuarios.password_cifrada` (V2.11): copia AES-256-GCM de la contraseña para consulta y restablecimiento auditados. Las cuentas anteriores quedan en `NULL`.
- `solicitudes_password` (V2.11): peticiones de cambio de contraseña del personal (`motivo`, `estado`, `resuelto_por/en`, `respuesta`). V2.11.2 añade `solicitado_por_id` y `solicitado_por` para distinguir al titular de quien pidió el cambio en su nombre.
- `solicitudes_baja` (V2.11.1): peticiones para dar de baja una cuenta (`usuario_id` FK `CASCADE`, `username`, `nombre`, `solicitado_por_id`, `solicitado_por`, `motivo`, `estado` `pendiente|aprobada|rechazada`, `resuelto_por`, `resuelto_en`, `respuesta`, `creado_en`). Una pendiente por cuenta; al aprobar se aplica la baja lógica (`usuarios.activo = 0`).
- `solicitudes_usuario` (V2.11.3): peticiones de alta de cuentas del personal (`username`, `nombre`, `correo`, `telefono`, `notas`, `municipios`, `estado`, `solicitado_por_id`, `solicitado_por`, `resuelto_por`, `resuelto_en`, `respuesta`, `creado_en`). Al aprobar se crea la cuenta como funcionario en esos municipios con contraseña temporal.
- `usuarios.telefono` (V2.11.3): teléfono de contacto opcional; no se usa para entrar.
- `municipios_informacion` (ficha municipal con estado `borrador|pendiente|aprobado|rechazado`, autor de la propuesta y aprobador).

### Incidencias
- `incidencias`, `incidencia_evidencias`, `incidencia_historial`, `incidencia_comentarios`.
- Nuevas V2.2: `incidencias.folio`, `incidencias.meta_firmas`, `recolecciones_firmas`, `recoleccion_firmas`, `recoleccion_firmas_envios`.

### Comunicación
- `mensajes_contacto`, `sugerencias`, `mensajes_directos`.
- V2.2: `contactos_funcionarios`, `contacto_funcionario_destinatarios`, `contacto_funcionario_mensajes`, `solicitudes_funcionario`.
- V2.8: `adjuntos` (archivo privado, nombre original, MIME, tamaño, SHA-256, propósito `chat|comentario`, autor, contexto polimórfico, estado `pendiente|vinculado`, simulación). Los adjuntos se guardan en `uploads/adjuntos/`, fuera del estático público.

### Informes
- `solicitudes_informe`, `bloqueos_publicos`, `envios_correo`.
- V2.2: columnas `municipios`, `estados`, `tipos_todos`, `ambitos`, `archivo`, `generado_en`, `enviado_en`.

### Notificaciones
- `notificaciones`, `configuracion_notificaciones`, `preferencias_notificacion`, `preferencia_eventos`, `preferencia_municipios`.
- V2.2: `archivada_en`, `eliminada_en`, `simulado`, `simulacion_id`.

### Moderación y tickets
- `denuncias`, columnas de ocultamiento/suspensión.
- `tickets`, `ticket_mensajes`, `ticket_eventos`, `reglas_tickets`.

### Legal y configuración
- `configuracion` (clave-valor).
- V2.2: `documentos_legales`, `documentos_legales_historial`.
- V2.7: `aceptaciones_legales` (`usuario_id` nullable, `user_key`, `version_terminos`, `version_privacidad`, `aceptado_en`, `ip_hash`, `user_agent`).

### V2.2
- `correos_institucionales` (estado, municipio, entidad, dependencia, cargo, correo único por municipio, teléfono, fuente, verificado, invitaciones, `simulado`/`simulacion_id`).
- `publicaciones_redes` (red, plantilla, estructura, municipio, título, cuerpo, texto, CTA, hashtags, enlace, QR, colores primario/secundario, estado, `simulado`/`simulacion_id`; V2.3 permite editar y V2.7.1 conserva plantilla/municipio/enlace al actualizar). V2.8 añade formato, ancho, alto, diseño, fuente, kicker, pie, `mostrar_qr`, `qr_config` JSON, `qr_codigo`, layout, miniatura y `publicado_en`.
- V2.8: `codigos_qr` (código corto, contenido, propósito, config JSON, activo, escaneos) y `qr_escaneos` (código, fecha, municipio detectado, hash de IP, usuario opcional; sin coordenadas).
- `simulacion_sesiones` (admin, rol simulado, estado, fechas, notas, `municipio_id`, `usuario_simulado`, `usuario_incidencia`, `incidencia_simulada_id`, `datos` JSON).
- `simulacion_operaciones` (journal ordenado con `accion_id`, entidad, operación, `antes`/`despues`, endpoint y resultado).
- `respaldos`, `respaldos_eventos`.
- `restricciones_comentarios` y columnas `usuarios.comentarios_restringidos*`.
- Columnas `simulado`/`simulacion_id` en usuarios, incidencias, evidencias, comentarios, firmas, tickets y mensajes, contactos, sugerencias, solicitudes de informe, notificaciones, publicaciones y correos.
- Migración `20261026_simulacion_contexto.js` añade el contexto de sesión del simulador.
- Migración `20261027_mejoras_v23.js`: `municipios_informacion`, `roles_personalizados`, `solicitudes_permisos`, `usuarios.rol_personalizado_id`, correo de contacto en claves y columnas de edición de publicaciones.

## 6. API (resumen por módulo)

### Público
- `POST /api/auth/anonimo`, `/api/auth/registro`, `/api/auth/ciudadano`, `/api/auth/funcionario`, `/api/auth/admin`. El alta (`/registro`) rechaza nombres y correos repetidos (409, el correo porque es el canal de avisos); `/auth/ciudadano` entra con `nombre` (o pseudónimo) y contraseña, y acepta `correo` como respaldo para cuentas antiguas (V2.9/V2.9.1).
- `GET /api/terminos` · `GET /api/legal/:clave` (V2.2).
- `GET /api/legal/aceptacion` (requiere sesión, incluida la anónima) y `POST /api/legal/aceptar` devuelven/registran las versiones vigentes de términos y privacidad (V2.7).
- `GET /api/publico/municipios` (incluye `estados` con las 32 entidades federativas), `/api/publico/tipos`.
- `POST /api/publico/contacto`, `/api/publico/sugerencias`, `/api/publico/solicitudes-acceso`.
- `POST /api/publico/solicitudes-informe` y verificación/consulta por folio.
- `GET /api/publico/qr/:codigo` (ficha) y `POST /api/publico/qr/:codigo/escaneo` (registro) y `GET /r/:codigo` (redirección a `/?qr=`).
- Suscripciones y bajas de campañas.

### Sesión
- `GET /api/auth/me`, `POST /api/auth/salir`. `/auth/me` devuelve `esPersonal`, `soloLectura` y `puedeAtenderTickets` para que la interfaz no dependa de listas de roles incompletas.
- `GET /api/incidencias`, `/mapa`, `/:id`.
- `POST/PUT/PATCH /api/incidencias` (reportar, editar, estado, peligro, resolución).
- `POST /api/incidencias/:id/comentarios` (V2.2: listar, borrar, reglas).
- `POST /api/incidencias/:id/firmas`, `PATCH .../meta-firmas`, `GET .../firmas/export` (V2.2).
- `GET/POST /api/notificaciones` y preferencias.
- `GET /api/folios/mios`, `/api/folios/:folio` (V2.2).
- `GET/POST /api/tickets`, `/mensajes`, `/contacto`, `/sugerencias`.
- Adjuntos V2.8: `POST /api/adjuntos` (chat), `POST /api/adjuntos/comentario` (solo imágenes) y `GET /api/adjuntos/:id` (descarga autorizada). Los IDs se envían en `adjuntos` al crear un mensaje, contacto o comentario y el servicio los vincula al contexto creado.

### Personal
- Panel, estadísticas, exportación, informes.
- `GET /api/stats/panel` y `/api/stats/informes` aceptan `municipios` y `estados` (listas separadas por coma); devuelven `comparativo`, `comparativoEstados` y `tiempos` (promedio, mediana, mín/máx y detalle por incidencia).
- `GET /api/municipios` devuelve el catálogo visible y `estados` con las 32 entidades federativas; `GET /api/municipios/ubicacion?lat=&lng=` detecta el municipio de la geolocalización.
- `GET /api/municipios/:id/ficha` y `PUT /api/municipios/:id/ficha` (funcionario propone, admin guarda aprobado); `POST /api/municipios/:id/ficha/aprobar|rechazar` (solo administración).
- `GET/POST /api/permisos/solicitudes`, `GET /api/permisos/solicitudes/mias`, `POST /api/permisos/solicitudes/:id/aprobar|rechazar`; `GET /api/roles-especiales`, `POST/PATCH/DELETE /api/roles-especiales` (solo admin maestro). V2.11: las rutas de solicitudes exigen `ver/aprobar/rechazar_solicitudes_permisos` (o `gestionar_solicitudes_permisos`) y el servicio comprueba alcance y no escalada.
- Roles V2.11 (solo admin maestro): `GET /api/roles`, `GET /api/roles/catalogo`, `POST /api/roles`, `PATCH /api/roles/:id`, `POST /api/roles/:id/restablecer`, `DELETE /api/roles/:id`.
- Contraseñas V2.11: `GET /api/usuarios/:id/password` (revelado auditado, `Cache-Control: no-store`) y `POST /api/usuarios/:id/password/restablecer`; `GET/POST /api/password/solicitudes[/mias]` y `POST /api/password/solicitudes/:id/aprobar|rechazar`.
- V2.11.2: `POST /api/password/solicitudes` acepta `usuarioId` para que un funcionario con `editar_usuarios` pida el cambio de otra cuenta de su ámbito. Al aprobar, la contraseña temporal se devuelve al panel **y** se entrega al solicitante por aviso (`solicitud_password_resuelta`); si el solicitante no es el titular, este recibe un aviso sin la clave. Aprobar y rechazar dejan `solicitud_password_aprobada` / `solicitud_password_rechazada` en auditoría, sin guardar la contraseña.
- Bajas V2.11.1: `GET/POST /api/baja/solicitudes` (bandeja filtrada por alcance y `estado`; alta con `usuarioId` y `motivo`), `GET /api/baja/solicitudes/mias` y `POST /api/baja/solicitudes/:id/aprobar|rechazar`.
- V2.11.3: `POST /api/usuarios/:id/reactivar` devuelve la cuenta a activa y audita `usuario_reactivado`. `POST /api/usuarios` ya solo lo permite la administración. Altas solicitadas: `GET/POST /api/alta/solicitudes`, `GET /api/alta/solicitudes/mias` y `POST /api/alta/solicitudes/:id/aprobar|rechazar`; aprobar crea la cuenta y devuelve la contraseña temporal una vez.
- `GET /api/usuarios` exige `ver_usuarios`; `POST /api/usuarios` exige `crear_usuarios`; `PATCH /api/usuarios/:id` exige `editar_usuarios`; `DELETE /api/usuarios/:id` exige `eliminar_usuarios` y hace baja lógica (`activo=false`). Un funcionario con esos permisos (o el paraguas `gestionar_usuarios`) solo gestiona cuentas no administrativas de su ámbito. El alta acepta `claveId`: rol, territorio y permisos se toman de la clave. Un correo repetido responde 409 con un mensaje entendible, también si el choque ocurre al editar.
- Bandeja de contacto/sugerencias, mensajería.
- Contacto directo: `GET /api/contacto/funcionarios?municipioId=`, `POST /api/contacto/funcionarios`, `GET /api/contacto/mios`, `GET /api/contacto/directo`, `GET /api/contacto/directo/:id`, `POST /api/contacto/directo/:id/mensajes`.
- Tickets: cola, respuesta, estado, prioridad, asignación, reglas.
- Moderación: denuncias, ocultar, advertir, suspender, restringir comentarios (V2.2).
- Firmas por municipio en solo lectura (V2.2).

### Admin maestro
- Usuarios, claves, sesiones, municipios, zonas, tipos.
- Claves V2.9.4/V2.10: `GET /api/admin/claves` exige `ver_claves` (o `ver_avisos_clave` para la pestaña de avisos); `POST /api/admin/claves` exige `crear_claves` y acepta `municipios`, `estados`, `rolSugerido`, `permisos` (lista CRUD), `usosMaximos` y `expiraEn`; `POST /api/admin/claves/:id/revocar` exige `editar_claves`; `DELETE /api/admin/claves/:id` exige `eliminar_claves`. La lista incluye `usuariosVinculados`, `sesionesActivas`, `sesiones`, `permisos` y territorio; al revocar o eliminar se cierran las sesiones de la clave y se corta su SSE.
- Avisos por clave V2.9.5/V2.10: `PUT /api/admin/claves/:id/notificaciones` acepta `{ activo, municipios }`; `POST .../notificaciones/revocar` y `POST .../notificaciones/reactivar` cambian solo el permiso de avisos. Exigen `editar_avisos_clave` (o el paraguas `gestionar_avisos_clave`); el alcance debe ser un subconjunto del territorio de la clave.
- Solicitudes de acceso V2.10: `GET /api/admin/solicitudes-acceso` exige `ver_solicitudes_acceso`; `POST .../:id/aprobar` exige `aprobar_solicitudes_acceso`; `POST .../:id/rechazar` exige `rechazar_solicitudes_acceso`. El paraguas `gestionar_usuarios` sigue concediendo las tres.
- Sesiones V2.9.4: `GET /api/admin/sesiones` devuelve `claveId`, `claveCodigo` y `claveNombre`; `DELETE /api/admin/sesiones/:id` sigue revocando por `jti`.
- Auditoría V2.9.4: `GET /api/admin/auditoria?username=&accion=&desde=&hasta=&limite=` exige `ver_auditoria` y devuelve las acciones que modifican datos (POST/PUT/PATCH/DELETE) saneadas.
- Configuración global de notificaciones y campañas.
- Solicitudes de informe: listar, previsualizar, generar, enviar, rechazar, reintentar (V2.2); `GET /api/admin/solicitudes-informe/:id/archivo` sirve el archivo guardado en `data/informes` para el visor modal (V2.4).
- `GET /api/informes/estilo.css` publica los márgenes, logo y pie efectivos; `POST /api/admin/informes/logo` sube el logo (solo admin). `POST /api/publico/solicitudes-informe` exige cuenta registrada (V2.5). La UI de solicitud vive en `modalSolicitudInforme`; no hay página `/informes` (V2.6). La solicitud acepta `municipios` y `estados` simultáneos; el informe consulta su unión (V2.7).
- El middleware de términos devuelve `428` con `detalles.codigo = 'terminos_pendientes'` para cualquier escritura sin aceptación vigente.
- Las rutas HTML `/informes` y `/tickets` redirigen a la SPA con `informe=1`, `verificar`, `tickets=1` o `ticket`; los endpoints de datos no cambian.
- Legal: borrador, publicar, historial, restaurar (V2.2).
- Configuración: `GET/PUT /api/admin/configuracion`.
- Legal: `GET /api/admin/legal`, `GET /api/admin/legal/:clave`, `PUT /api/admin/legal/:clave/borrador`, `POST /api/admin/legal/:clave/publicar`, `POST /api/admin/legal/:clave/restaurar/:version`, `GET /api/admin/legal/:clave/historial`.
- Publicidad: `GET /api/admin/publicidad/plantillas` (redes, plantillas y estructuras), `GET/POST /api/admin/publicidad`, `POST /api/admin/publicidad/generar`, `POST /api/admin/publicidad/simular` (vista previa sin guardar), `PATCH /api/admin/publicidad/:id` (red, plantilla, municipio, textos, CTA, estructura, colores, enlace, estado y campos de diseño V2.8), `GET /api/admin/publicidad/:id`, `GET /api/admin/publicidad/:id/descargar` (SVG con colores), `DELETE /api/admin/publicidad/:id`.
- Publicidad V2.8: `POST /api/admin/publicidad/qr`, `POST /api/admin/publicidad/qr/pdf`, `POST /api/admin/publicidad/qr/codigos`, `POST /api/admin/publicidad/assets`, `GET /api/admin/publicidad/estadisticas` y `GET /api/admin/publicidad/:id/estadisticas`. La UI exporta PNG/SVG/CSV e importa/exporta JSON.
- Correos institucionales: `GET/POST /api/admin/correos-institucionales`, `PUT/DELETE /api/admin/correos-institucionales/:id`, `POST .../:id/asignar-clave`, `GET .../busquedas`, `POST .../importar`, `GET .../exportar`, `POST .../invitar`. La asignación crea la clave del municipio si no existe.
- Simulador: `GET /api/admin/simulador/acciones`, `GET/POST /api/admin/simulador/sesiones`, `GET /api/admin/simulador/sesiones/:id`, `POST .../:id/acciones/:accionId`, `POST .../:id/cerrar`, `POST .../:id/revertir`, `POST /api/admin/simulador/revertir-todo`.
- Respaldos: `GET/POST /api/admin/respaldos`, `GET /api/admin/respaldos/estadisticas`, `GET /api/admin/respaldos/:id`, `GET .../:id/descargar`, `POST .../:id/restaurar` (confirmación `RESTAURAR`), `DELETE .../:id`.

## 7. Eventos de notificación

El catálogo está en `backend/src/services/notificaciones.catalogo.js`. Cada evento define etiqueta, descripción, roles por defecto, severidad, canal, alcance y entidad.

Eventos actuales: `incidencia_creada`, `incidencia_estado`, `incidencia_resuelta`, `incidencia_comentario`, `incidencia_peligro`, `incidencia_alerta`, `sugerencia_creada`, `sugerencia_respondida`, `contacto_creado`, `contacto_respondido`, `solicitud_acceso_creada`, `solicitud_acceso_resuelta`, `solicitud_informe_creada`, `solicitud_informe_enviada`, `solicitud_informe_error`, `ticket_creado`, `ticket_asignado`, `ticket_respondido`, `ticket_cerrado`, `ticket_reabierto`, `mensaje_directo`, `difusion_personal`, `moderacion_cuenta`, `moderacion_contenido`, `clave_creada`, `clave_revocada`, `seguridad_alerta`, `prueba_notificacion`.

Eventos V2.2 implementados: `firma_agregada`, `meta_firmas_alcanzada`, `recoleccion_firmas_creada`, `solicitud_firmas_admin`, `documento_firmas_enviado`, `limite_firmas_alcanzado`, `contacto_funcionario_creado`, `contacto_funcionario_respondido`, `municipio_sin_funcionario`, `solicitud_funcionario_atendida`, `respaldo_creado`, `respaldo_error`, `respaldo_restaurado`, `respaldo_eliminado`. Las invitaciones y publicaciones son acciones de admin y no generan avisos masivos.

Eventos V2.3: `ficha_municipio_pendiente`, `ficha_municipio_aprobada`, `ficha_municipio_rechazada`, `permiso_solicitado` y `permiso_resuelto`.

Eventos V2.11: `solicitud_password_creada` (avisa a los administradores) y `solicitud_password_resuelta` (avisa al solicitante). Eventos V2.11.1: `baja_solicitada` (avisa a la administración del ámbito) y `baja_resuelta` (avisa a quien la pidió). En V2.11.2 los avisos de solicitudes llevan `url` con `panel=usuarios`, el id de la solicitud (`baja`/`password`) y el `usuario` afectado; `solicitud_password_resuelta` incluye la contraseña temporal para quien la pidió y `baja_resuelta` informa que la baja se cumplió y quedó en auditoría. En V2.11.3 se suman `alta_solicitada` (avisa a la administración) y `alta_resuelta` (entrega al solicitante el usuario y la contraseña temporal de la cuenta creada); sus enlaces usan `panel=usuarios&alta=<id>`.

Reglas:
- `emitir(repositorio, datos)` es el punto único.
- Si el evento está desactivado en `configuracion_notificaciones`, no se emite.
- Se aplican roles, alcance y preferencias por usuario.
- V2.9.5: si la cuenta tiene una sesión abierta con clave, el aviso también debe caer dentro de los municipios permitidos para esa clave (`clave_notificacion_municipios`). Revocar los avisos de la clave no cierra la sesión ni invalida la clave.
- `claveDedupe` evita duplicados por usuario.
- SSE solo se emite si se creó una fila nueva.
- En modo simulación no se envía correo ni SSE real.

## 8. Configuración

Tabla `configuracion` (clave-valor) y `configuracion.service.js`.

Claves V2.2:
- `firmas.max_por_usuario` (10), `firmas.meta_min`, `firmas.meta_max`, `firmas.meta_default`, `firmas.permitir_anonimas` (false), `firmas.notificar_meta` (true).
- `informes.max_meses` (24), `informes.fecha_minima`, `informes.max_registros` (1500).
- `comentarios.max_por_dia` (20), `comentarios.espera_segundos` (30), `comentarios.max_enlaces` (2), `comentarios.ocultar_automatico` (3).
- `notificaciones.historial_dias` (180).
- `respaldos.activo` (true), `respaldos.intervalo_horas` (24), `respaldos.retencion` (7), `respaldos.incluir_simulados` (false), `respaldos.max_manuales` (20).
- `general.sitio_nombre`, `general.correo_contacto`, `general.url_base`.

Claves V2.5 del diseño de informe:
- `informes.margen_superior|derecho|inferior|izquierdo` (mm; 18/15/18/15).
- `informes.logo_url` (`/uploads/...`), `informes.logo_posicion` (`izquierda|derecha|centro`), `informes.logo_ancho` (px), `informes.logo_desplazamiento_x|y` (px).
- `informes.pie_texto` (texto del pie).

Variables V2.7:
- `TERMINOS_EXIGIR` (true): activa el middleware de consentimiento; `false` solo para depuración local.
- `TERMINOS_EXIGIR_EN_PRUEBAS` (false): activa el bloqueo en `NODE_ENV=test` para el test dedicado.

Variables V2.11:
- `PASSWORD_LLAVE` (vacía en desarrollo): llave de 32 bytes para AES-256-GCM. **Obligatoria en producción** (`problemasDeConfiguracion()` la exige). Sin ella se deriva del secreto JWT en desarrollo. Cambiarla invalida las copias ya cifradas: el panel ofrecerá restablecerlas.

## 9. Seguridad y CSP

- CSP estricta: `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `style-src-attr 'none'`, `script-src-attr 'none'`.
- Prohibido: `style="..."`, `<style>`, `onclick`, `<script>` sin `src`.
- Estilos dinámicos solo por CSSOM o clases; los tests `sin-estilos-inline.test.js` lo verifican.
- Paged.js se vendoriza en `frontend/vendor/pagedjs/` y el script de vendorización lo parchea para insertar sus reglas con `CSSStyleSheet`/`adoptedStyleSheets`; así no necesita `<style>` ni `unsafe-inline`.
- `img-src` permite `self`, `data:`, `blob:`, Esri y OpenTopoMap.
- `frame-src` y `child-src` permiten `self` y `blob:` para el visor PDF de informes; `object-src` sigue en `none`.
- `connect-src` solo `self` y mapas locales `127.0.0.1`.
- Uploads servidos con `X-Content-Type-Options: nosniff` y CSP sandbox.
- Los adjuntos privados viven en `uploads/adjuntos/`, que responde 404 en el estático; solo `/api/adjuntos/:id` los sirve tras `autorizarDescarga` (autor, participante, admin o alcance territorial).
- Las imágenes privadas usan `?token=<JWT>` porque `<img>` no envía `Authorization`; el middleware solo acepta ese parámetro en `/api/adjuntos/` y el endpoint valida además la participación.
- Rate limits por IP/userKey; desactivados en `NODE_ENV=test` salvo prueba explícita.
- Sesiones JWT Bearer, sin cookies; el token se revoca por `jti` en `sesiones_usuario`.
- Consentimiento V2.7: `aceptaciones_legales` + middleware `terminos.js`. Las escrituras sin aceptación vigente responden 428; las lecturas y `/api/legal/*` quedan abiertas para poder aceptar. En pruebas se omite salvo `TERMINOS_EXIGIR_EN_PRUEBAS=true`.
- El HTML legal se pinta con el saneado del servidor (`sanitizarHtml`) y no usa estilos inline.
- V2.11: `usuarios.password_hash` (bcrypt) sigue siendo la única fuente para verificar el acceso; `usuarios.password_cifrada` es una copia AES-256-GCM para consulta/restablecimiento. El revelado exige `revelar_password_usuarios`, respeta el alcance (nunca cuentas de administración salvo el maestro) y escribe `consulta_password` en auditoría sin guardar la contraseña. `GET /api/usuarios/:id/password` responde `Cache-Control: no-store`.
- El estudio de publicidad pinta SVG en `data:` y exporta PNG/SVG/CSV con `Blob`; los colores dinámicos y la vista previa de correo usan CSSOM (`data-e`), nunca atributos `style`.

## 10. Pruebas

- Runner: `node:test` + `node:assert/strict` + `supertest`.
- Driver por defecto: JSON temporal (`test/helpers/entorno.js`).
- MySQL: `STORAGE_DRIVER_TEST=mysql` con `compose.test.yaml` (puerto 3399) o MariaDB local.
- Ejecutar un archivo MySQL a la vez por el coste de la semilla de pruebas (175 municipios y 6,314 zonas del catálogo ligero).
- Comandos:
  - `cd backend && npm test`
  - `cd backend && npm run test:mysql`
  - `cd backend && npm run limpiar-bases-prueba`
  - En Windows/PowerShell, el bloqueo legal dedicado se prueba con `$env:TERMINOS_EXIGIR_EN_PRUEBAS='true'; node --test test/terminos.test.js`.
- Pruebas de UI: contratos estáticos sobre HTML/CSS/JS, sin navegador.
- Pruebas nuevas V2.2: `nuevas-funciones.test.js` (firmas, comentarios, legal, solicitudes, contacto, historial, folios y respaldos), `simulador.test.js` (roles, datos etiquetados, journal y reversión), `publicidad.test.js`, `correos-institucionales.test.js`, `v2-ui.test.js`, tutoriales, catálogo de acciones, capas del mapa y documentación.
- Pruebas V2.3: `mejoras-v23.test.js` (geolocalización, ficha con aprobación, roles especiales, solicitud de permisos, estadísticas multi-territorio, publicidad con colores/edición y correo asignado a clave). Suite JSON: 261 pruebas; MySQL dirigido: 7/7 en `mejoras-v23` y 3/3 en `publicidad`.
- Pruebas V2.4: `/auth/me` con `puedeAtenderTickets`, asignación de tickets por soporte, archivo de informe, simulación de publicidad sin persistencia, filtro puro del selector territorial, cobertura de simulación en todas las guías y contratos estáticos de sidebar/visor/CSP.
- Pruebas V2.5: CSS público del informe, validación de márgenes/pie, subida de logo con PDF, restricción de informes y tickets para anónimos, secuencia de la guía de reporte y cobertura estática del panel de diseño.
- Pruebas V2.6: redirección de `/informes` y `/tickets` a enlaces profundos, modales de informe/ticket con bloqueo anónimo, estado→municipios, enlace directo a `/legal`, guías que abren `modalDemoInforme`/`modalDemoTicket` sin navegar y bienvenida única (`inc_tutorial_bienvenida_v1`). Suite JSON: 284/284.
- Pruebas V2.7: `terminos.test.js` (estado, bloqueo 428, aceptación, nueva versión y reaceptación; JSON y MySQL dirigido 3/3), prioridad forzada/gestión de tickets, selector multiestado y unión territorial, modal legal, onboarding dinámico y marcador azul de ubicación.
- Pruebas V2.7.1: `publicidad-estudio.test.js` valida recursos, contenedores, acciones, biblioteca y precarga del service worker; `publicidad.test.js` cubre la edición de plantilla/municipio/enlace y la vista previa sin persistencia.
- Pruebas V2.8: `adjuntos.test.js` cubre subida privada, token de imagen, bloqueo entre cuentas, comentario solo con imagen, rechazo de PDF en comentarios, adjuntos en contacto directo y en mensajería interna; `permisos-panel.test.js` valida el `data-permiso` de todas las pestañas y `sintaxis-frontend.test.js` evita errores de sintaxis en los módulos del navegador. Suite JSON: 308/308. La prueba MySQL dirigida de publicidad/adjuntos no se pudo ejecutar en este entorno porque Docker no está disponible; debe repetirse con `npm run test:mysql`.
- Pruebas V2.8.1: `registro-cuenta.test.js` fija el orden de capas (aviso y carga por encima del acceso y del paso previo), el aviso `#loginMensaje`, la validación nativa del alta y las respuestas de `POST /api/auth/registro` (201 con nombre y con pseudónimo, 409 para correo repetido y 400 con el detalle del campo). Suite JSON: 316/316.
- Pruebas V2.9: `registro-cuenta.test.js` cubre el acceso por nombre (mayúsculas/acentos y contraseña mala), los pseudónimos únicos, el nombre repetido y el correo repetido; `cuentas.test.js` valida la entrada por nombre y el respaldo por correo. Suite JSON: 319/319; MySQL dirigido de `registro-cuenta` (10/10) y `cuentas` (17/17).
- Pruebas V2.9.2: `v2-ui.test.js` cubre los helpers `estadosDelCatalogo`/`construirBloques` del selector de informes, el contrato del modal y su demo, y la precarga del módulo en `sw.js`; `sin-estilos-inline.test.js` y `sintaxis-frontend.test.js` cubren el archivo nuevo. Suite JSON: 320/320.
- Pruebas V2.9.3: `auth.test.js` valida las 32 entidades en `/api/municipios`; `v2-ui.test.js` cubre `catalogoEstados`/`construirBloques` y el contrato de un solo spinner (splash → overlay). Suite JSON: 321/321.
- Pruebas V2.9.4: `v294-claves-auditoria.test.js` crea una clave con `estados`, comprueba que se expande a municipios, que la sesión queda vinculada a la clave, que eliminarla cierra la sesión y que la auditoría registra actor, resultado, entidad y permisos. Suite JSON: 325/325.
- Pruebas V2.9.5: `avisos-clave.test.js` comprueba el alcance de avisos por municipio, la revocación sin invalidar la clave y la reactivación; `solicitudes.test.js` valida que el aviso enlaza al resumen concreto; `v2-ui.test.js` cubre el modal de detalle, la pestaña de avisos, los controles de tamaño, las secciones redimensionables y la etiqueta corta del QR. Suite JSON: 329/329.
- Pruebas V2.10: `v210-permisos-clave.test.js` cubre correo repetido al crear/editar (409), claves con solo `ver_usuarios` (listar sí, crear no), claves con solo `crear_usuarios` (crear sí, listar no), reducción del territorio del listado, alta de cuenta desde clave y baja lógica. `v2-ui.test.js` y `permisos-panel.test.js` validan las pestañas con los permisos de consulta. Suite JSON: 336/336.
- Pruebas V2.11: `v211-roles-alcance.test.js` (8/8) cubre la matriz editable de un rol integrado y su restablecimiento, el rol propio con plantilla, los límites del funcionario (permisos, contraseñas, claves y rol destino), el 403 de estadísticas con territorio ajeno, el catálogo `alcance` y `colindantes`, la consulta de contraseña auditada, el restablecimiento y la solicitud de contraseña. Suite JSON: 345/345.

## 11. Migraciones y datos

- `npm run migrate` aplica migraciones pendientes (incluye `20261027_mejoras_v23.js`).
- V2.4 no añade tablas ni columnas: `atender_tickets`, el estado `generada` y los nombres únicos de archivo son lógica de aplicación.
- V2.5 tampoco añade tablas ni columnas: el logo se guarda en `uploads/` y su ruta, posición y márgenes viven en `configuracion`. No hay migración nueva.
- V2.7 añade `20261028_aceptaciones_legales.js` con la tabla `aceptaciones_legales`; no modifica tablas existentes.
- V2.7.1 no añade tablas, columnas ni migraciones: el estudio de publicidad y el editor de correo son solo interfaz y reutilizan `publicaciones_redes` y los endpoints existentes.
- V2.8 añade `20261030_publicidad_avanzada.js` (columnas de diseño en `publicaciones_redes`, `codigos_qr`, `qr_escaneos`) y `20261031_adjuntos.js` (`adjuntos`). Ejecutar `npm run migrate` con respaldo previo.
- V2.9 añade `20261101_acceso_por_nombre.js`: quita la unicidad de `usuarios.correo` (pasa a ser dato de contacto) e indexa `usuarios.nombre`, que ahora se consulta en cada entrada ciudadana. Ejecutar `npm run migrate` con respaldo previo.
- V2.9.1 añade `20261102_correo_unico.js`: restaura el índice único de `usuarios.correo` (el correo es el canal de avisos). Si hay correos repetidos, la migración se detiene y los lista para corregirlos a mano; no modifica datos.
- V2.9.4 añade `20261028_claves_estados_sesiones_auditoria.js`: tabla `clave_acceso_estados`, columna `sesiones_usuario.clave_id` con índice y tabla `auditoria` con índices por fecha, usuario y clave. No borra datos; ejecutar `npm run migrate` con respaldo previo.
- Catálogo nacional V2.9.4: `npm run importar-inegi` genera `src/config/seed-data/municipios.json` (2 475 municipios) y `zonas.json` (50 763 comunidades); `npm run sincronizar-catalogo` los inserta o actualiza en MySQL sin borrar usuarios, incidencias, claves ni sesiones. `-- --seco` muestra el conteo sin escribir. `npm run seed` sigue siendo destructivo y no debe usarse sobre datos reales.
- V2.9.5 añade `20261029_avisos_por_clave.js`: columna `claves_acceso.notificaciones_activas` y tabla `clave_notificacion_municipios` con FK a claves y municipios. No modifica datos existentes; las claves actuales quedan con avisos activos y alcance total de su territorio. Ejecutar `npm run migrate` con respaldo previo.
- V2.10 añade `20261103_permisos_clave.js`: columna `claves_acceso.permisos` (TEXT/JSON, nullable). Las claves existentes quedan con `NULL`, que significa «sin recorte» y conserva el comportamiento anterior. No modifica usuarios ni datos de territorio. Ejecutar `npm run migrate` con respaldo previo. La validación de arranque de MySQL incluye ya `claves_acceso.permisos` en `COLUMNAS`.
- V2.11 añade cuatro migraciones: `20261104_roles_permisos.js` (tabla `roles` sembrada con los integrados desde `src/config/roles.js` y columna `usuarios.rol_propio_id`), `20261105_password_cifrada.js` (`usuarios.password_cifrada` y tabla `solicitudes_password`), `20261106_solicitudes_permisos_estados.js` (`solicitudes_permisos.estados`) y `20261107_roles_permisos_v211.js` (añade `gestionar_solicitudes_permisos` y `revelar_password_usuarios` a `admin_municipal`/`admin_estatal` si faltan). No modifican datos existentes salvo el sembrado idempotente de roles, que no pisa matrices ya editadas. Ejecutar `npm run migrate` con respaldo previo; la validación de `TABLAS`/`COLUMNAS` incluye ya `roles`, `solicitudes_password` y las columnas nuevas.
- V2.11.1 añade `20261108_solicitudes_baja.js`: tabla `solicitudes_baja` con FK `usuario_id → usuarios.id` (`ON DELETE CASCADE`, misma colación `colacionDeUsuarios`) e índices por `estado` y `usuario_id`. No modifica datos existentes y ya está registrada en `TABLAS`/`COLUMNAS`. Ejecutar `npm run migrate` con respaldo previo.
- V2.11.2 añade `20261109_solicitudes_password_solicitante.js`: columnas `solicitado_por_id` y `solicitado_por` (nullable) en `solicitudes_password` e índice por solicitante. Las solicitudes anteriores quedan como «las pidió el titular». `COLUMNAS` ya las valida al arrancar. Ejecutar `npm run migrate` con respaldo previo.
- V2.11.3 añade `20261110_solicitudes_usuario.js`: tabla `solicitudes_usuario` y columna nullable `usuarios.telefono`. No modifica datos existentes; `TABLAS` y `COLUMNAS` ya las validan al arrancar. Ejecutar `npm run migrate` con respaldo previo.
- `npm run seed` es **destructivo**; solo en base demo.
- `npm run datos-nuevos` carga datos V2.2 de demostración (firmas, legal, correos, publicaciones y respaldo).
- `npm run verificar-funciones` ejecuta 25 flujos reales contra la base configurada (incluye geolocalización, fichas, estadísticas, roles, permisos, simulación y reversión).
- `node scripts/respaldo-base.mjs --nombre=<nombre>` crea una copia física de la base.
- Los respaldos lógicos viven en `backend/data/respaldos/`; el worker automático se activa con `respaldos.activo` y respeta `respaldos.retencion`.
- Antes de migrar en producción: respaldo, ventana de mantenimiento y prueba en demo.

## 12. Protocolo de mantenimiento de este documento

Al cambiar cualquiera de estos elementos, actualizar la sección correspondiente y el changelog:

1. Tablas, columnas, índices o migraciones → secciones 5 y 11.
2. Rutas, controladores o servicios → sección 6.
3. Roles, permisos o alcance → sección 4.
4. Eventos de notificación → sección 7.
5. Claves de configuración → sección 8.
6. Flujos de interfaz, modales o acciones → sección 3 y catálogo de tutoriales.
7. Variables de entorno, comandos o dependencias → secciones 2, 10 y 11.
8. Cambios de seguridad/CSP → sección 9.

Un cambio no se considera terminado si este archivo no refleja el estado real.

## 13. Changelog

### 2026-10-30 — V2.11.3 (reactivar cuentas, solicitud de alta y texto más grande)

- **Reactivar cuentas dadas de baja**: `POST /api/usuarios/:id/reactivar` devuelve `activo=true` a una cuenta del personal conservando su historial y su territorio. Solo la administración (y el maestro para administradores) puede hacerlo; el funcionario recibe 403. La acción queda en auditoría como `usuario_reactivado` y la tabla de usuarios muestra el botón con icono de deshacer en las filas inactivas.
- **El funcionario ya no crea cuentas**: `POST /api/usuarios` responde 403 fuera de la administración. El botón «Nuevo usuario» se sustituye por «Solicitar alta de usuario» (`#modalSolicitudAlta`), que pide nombre completo, usuario de acceso, correo, teléfono y notas. La administración la revisa en la bandeja «Solicitudes de alta» de la pestaña Usuarios y, al aprobarla, se crea la cuenta como funcionario en los municipios del solicitante con una contraseña temporal que se le entrega por la campana (`alta_resuelta`). Tabla `solicitudes_usuario`, endpoints `POST/GET /api/alta/solicitudes`, `GET /api/alta/solicitudes/mias` y `POST .../aprobar|rechazar`, auditoría `alta_solicitada|aprobada|rechazada`. «Mi cuenta» lista «Mis solicitudes de alta».
- **Municipios en modo municipal**: si la sesión solo gestiona un municipio, la pestaña Municipios oculta el selector de municipio activo y el buscador/filtro nacional (`#municipioActivoBox`, `#municipiosFiltroBox`) y muestra únicamente la fila de su municipio con el botón «Ficha», sin columna «Ir a». `renderMunicipios` deduce el modo de `store.estado.alcance.modo` y del tamaño del catálogo.
- **Roles y permisos**: «Editar permisos» de un rol del sistema vuelve a funcionar (los ids numéricos se comparan como texto en `rolSistemaPorId`/`rolPropioPorId`), el formulario se desplaza a la vista al editar y «Limpiar» deja de quedarse en modo integrado, de modo que la plantilla (rol base) vuelve a estar habilitada; se añade una nota cuando el rol del sistema no permite cambiarla.
- **Texto más grande**: base 16 px, etiquetas 13.5 px, campos y botones 15 px, `.btn-sm` 14 px, tablas 14 px con encabezados de 13 px, `.campo-nota` y utilidades `u-fs-*` un escalón por encima, pestañas del panel 14.5 px y `.titulo-seccion` 15 px.
- `usuarios.telefono` guarda el teléfono de contacto (opcional) y se muestra en la tabla; `crear`/`actualizar` lo aceptan y el funcionario no puede modificarlo.
- La página pública `/acerca` añade la sección «Quiénes lo hicieron» con **Dylon Gabriel Mandujano Gonzalez** (DylonTech) y **Diego Alexander Beltrán Moreno**, ambos ingenieros en sistemas y desarrollo web con contribución equitativa, y actualiza contacto, firma y versión (2.11.3).
- Pruebas: bloque «V2.11.3: solicitud de alta y reactivación de cuentas» (3/3) en `v211-roles-alcance.test.js`, contratos de UI en `v2-ui.test.js` y pruebas de claves/permisos actualizadas al nuevo flujo; suite completa 358/358. Migración `20261110_solicitudes_usuario.js`. El armazón offline pasa a `incidencias-shell-v2.11.3`.

### 2026-10-30 — V2.11.2 (avisos de baja y contraseña con entrega)

- Los avisos de **solicitudes de baja y de contraseña** guardan `url` con `panel=usuarios`, el id de la solicitud y el `usuario` afectado. Al pulsarlos, la administración llega a la pestaña Usuarios con la **fila de la cuenta y la fila de la solicitud resaltadas** (`tr.fila-destacada`), de modo que los botones de aprobar/rechazar quedan a la vista; quien no administra abre «Mi cuenta» y ve el estado de su solicitud.
- `baja_resuelta` avisa al solicitante de que la baja **se cumplió** y quedó registrada en auditoría. Aprobar y rechazar escriben además las acciones `baja_aprobada` / `baja_rechazada` con la cuenta afectada (helper `utils/auditoria.js`).
- **Solicitud de cambio de contraseña para otra cuenta**: la tabla de usuarios incorpora el botón «Solicitar cambio de contraseña» (`#modalSolicitudPassword`) para quien no es administrador y tiene `editar_usuarios`; `POST /api/password/solicitudes` acepta `usuarioId` y valida alcance, rol y estado. Al aprobar, la contraseña temporal se muestra al administrador y se **entrega al solicitante por la campana**; el titular recibe un aviso sin la clave. Las acciones `solicitud_password_aprobada` / `solicitud_password_rechazada` quedan en auditoría sin guardar la contraseña.
- «Mi cuenta» añade «Mis solicitudes de baja» y muestra en las de contraseña quién las pidió y el aviso de que la nueva llegó a la campana. El armazón offline pasa a `incidencias-shell-v2.11.2`.
- Pruebas: bloque «V2.11.2: avisos de baja y contraseña con entrega» (3/3) en `v211-roles-alcance.test.js`, más contratos de UI en `v2-ui.test.js`; suite completa 354/354. Migración `20261109_solicitudes_password_solicitante.js`.

### 2026-10-30 — V2.11.0 (roles propios, contraseñas auditadas y alcance real)

- Los **roles del sistema** pasan a tener su matriz de permisos en la tabla `roles`, editable desde «Roles y permisos» y con «Restablecer a fábrica». El administrador maestro puede crear **roles propios** que heredan una plantilla (`funcionario`, `auditor`, `enlace`, `soporte`) con su propia matriz y su propio territorio; `usuarios.rol` sigue siendo el ENUM de la plantilla y los guards existentes no cambian.
- El alta de cuentas usa el selector territorial por bloques: estado con escritura y autocompletado → municipio con buscador → «Añadir otro estado». Para los roles que solo aceptan municipios, «Seleccionar todos los municipios» expande el estado en lugar de enviar `estados`.
- La clave de acceso muestra un **ejemplo práctico** y una vista previa de lo que concede. Junto al rol especial hay un acceso directo a crear un rol: al guardarlo se puede **aplicar a la cuenta** y volver al formulario con los datos intactos.
- **Estadísticas con alcance real**: `/api/stats/panel`, `/api/stats/informes` y `/api/exportacion` validan `municipios`/`estados` contra `alcanceDe()` y responden **403** si el territorio está fuera; antes devolvían 200 con ceros. `/api/municipios` añade `alcance: { todos, estados, municipios }` y `GET /api/municipios/:id/colindantes` valida el ámbito.
- El **funcionario** ya no puede cambiar permisos ni contraseñas de otras cuentas, ni generar claves, ni crear cuentas que no sean de plantilla `funcionario` dentro de sus municipios. La contraseña inicial sí se fija al crear. Nadie concede permisos que no tiene salvo el maestro.
- **Solicitudes de permisos** con permisos propios (`ver/aprobar/rechazar_solicitudes_permisos`) y alcance por estados corregido; la bandeja solo aparece con el permiso.
- **Contraseñas consultables**: se guarda una copia AES-256-GCM (`PASSWORD_LLAVE`) junto al hash bcrypt. `GET /api/usuarios/:id/password` la revela a la administración dentro de su ámbito y escribe `consulta_password` en auditoría; `POST .../password/restablecer` genera una temporal. El personal **solicita** el cambio desde «Mi cuenta» (`solicitudes_password`).
- **Tipografía** base de 15px con tablas de 13px; el control A−/A+ se conserva.
- **Ayuda de permisos**: `js/data/permisos-ayuda.js` explica cada permiso (qué permite, qué bloquea, ejemplo y riesgo) en `modalAyudaPermiso`, y la enciclopedia incorpora 13 guías simuladas (10 módulos de permisos + roles, contraseñas y solicitudes) con categoría «Permisos».
- Pruebas: `v211-roles-alcance.test.js` (8/8); suite JSON 345/345. Migraciones `20261104_roles_permisos.js`, `20261105_password_cifrada.js`, `20261106_solicitudes_permisos_estados.js` y `20261107_roles_permisos_v211.js`.

### 2026-10-30 — V2.11.1 (tema retirado, funcionario acotado, bajas y móvil)

- Se **elimina el tema claro/oscuro/automático**: se borran `js/core/tema.js`, `js/core/tema-publico.js`, `css/tema-oscuro.css`, los controles de apariencia y `data-theme`; la interfaz queda en claro fijo. Los estilos de los componentes que vivían en el tema oscuro pasan al final de `extensiones.css`. El armazón offline sube a `incidencias-shell-v2.11.1`.
- **Un funcionario solo cambia el nombre completo.** Con `editar_usuarios` puede editar `nombre`; cualquier otro campo (`rol`, `rolPropioId`, `rolPersonalizadoId`, `municipios`, `estados`, `puedeEscribir`, `activo`, `correo`, `permisos`, `password`) responde **403**, igual que `DELETE /api/usuarios/:id`. Al crear, el servidor impone `rol='funcionario'` y el territorio del actor e ignora `municipios`; los demás roles y los campos `claveId`/`rolPropioId`/`rolPersonalizadoId`/`permisos` responden 403.
- **Solicitudes de baja** (`solicitudes_baja`): el personal solicita la baja de otra cuenta de su ámbito con `editar_usuarios` o `eliminar_usuarios`; la administración las resuelve en la pestaña Usuarios (`#solicitudesBajaBox`). Al aprobar se ejecuta la baja lógica y se notifica `baja_resuelta`; al crearse, `baja_solicitada`.
- **Estadísticas**: `/api/municipios` devuelve `alcance: { todos, modo, estados, municipios }`. Con `modo='municipios'` el selector se construye sin «Añadir un estado» ni «Todos los estados» y su filtro de entidades solo lista los estados del propio catálogo visible (antes ofrecía las 32); el controlador pasa `catalogoEstados: []` en ese modo. El servidor mantiene el 403 para territorio ajeno.
- **Móvil**: `.admin-panel .filter-row > *` recupera `flex: 0 0 auto` y `width: 100%` en pantallas ≤640 px (el `flex-basis` de 180 px actuaba como altura en columna y producía huecos enormes en Publicidad y Campañas); se reducen los márgenes de `.pe-form`/`.camp-form`.
- Pruebas: nuevo bloque «V2.11.1: el funcionario solo cambia el nombre y solicita la baja» (3/3) en `v211-roles-alcance.test.js`; suite completa 348/348. Migración `20261108_solicitudes_baja.js`.

### 2026-10-29 — V2.10.0 (permisos CRUD y claves que autorizan)

- Se separaron los permisos de gestión en operaciones CRUD: usuarios (`ver/crear/editar/eliminar`), claves (`ver/crear/revocar/eliminar`), tipos (`ver/crear/eliminar`), solicitudes de acceso (`ver/aprobar/rechazar`) y avisos por clave (`ver/configurar`). Los antiguos `gestionar_*` siguen funcionando como paraguas y se expanden automáticamente.
- Las claves de acceso guardan su propia lista de permisos (`claves_acceso.permisos`) y su territorio. Al entrar con una clave, la sesión adopta ambos y el middleware `autenticar` vuelve a aplicar el recorte en cada petición: una clave de Maravatío con «ver usuarios» solo lista cuentas de Maravatío y no puede crear, editar ni eliminar.
- El modal de claves incorpora la matriz CRUD con preselección por rol. El alta de usuarios permite elegir una clave existente (`claveId`); el servidor toma de ella rol, territorio y permisos y el formulario los muestra como vista previa.
- El alta y la edición de personal comprueban el correo antes de escribir y traducen `ER_DUP_ENTRY` a un 409 legible («Ese correo ya está registrado en otra cuenta»). También se añadió `DELETE /api/usuarios/:id` como baja lógica con permiso `eliminar_usuarios`.
- La tabla de usuarios separa los botones de alta, edición y baja según los permisos; la tabla de claves muestra cuántos permisos concede cada una y oculta la eliminación sin `eliminar_claves`.
- Pruebas: `v210-permisos-clave.test.js` (7/7 en JSON y 7/7 en MySQL), `permisos-panel.test.js`, `v2-ui.test.js` y suite JSON 336/336. Migración `20261103_permisos_clave.js`.

### 2026-10-29 — V2.9.5 (avisos por clave y panel adaptable)

- Las notificaciones de solicitudes de informe enlazan a `/?admin=solicitudes-informe&solicitud=<id>` y abren el resumen completo de la solicitud, con botones para previsualizar, generar y enviar.
- Nueva pestaña «Avisos por clave» con permiso `gestionar_avisos_clave`. Cada clave puede limitar sus avisos a un subconjunto de sus municipios; el permiso se revoca sin invalidar la clave y el servidor aplica el alcance de la sesión más reciente.
- El panel de control incorpora A−/A/A+ compartidos con la preferencia global de texto, control de tamaño del modal y redimensionado nativo. La generación de claves bloquea dobles clics y muestra la clave nueva de inmediato.
- Publicidad y campañas tienen secciones expandibles y redimensionables; el bloque QR usa una cuadrícula adaptable y una etiqueta corta con nota de ayuda. Se añadieron vistas para móvil, laptop, monitores grandes y TV.
- La creación y validación de claves usan un catálogo ligero (`municipiosLigeros()`) sin polígonos: una clave de un estado bajó de ~1.2 s a ~0.25 s y una de las 32 entidades de ~1.5 s a ~0.1 s. El armazón offline pasa a `incidencias-shell-v2.9.5-r2` para invalidar clientes con caché anterior.
- Pruebas: `avisos-clave.test.js` (1/1, también valida el catálogo ligero), `solicitudes.test.js` con el enlace al detalle y `v2-ui.test.js` (34/34); suite JSON 329/329.

### 2026-10-29 — V2.9.4 (claves por estado, sesiones y auditoría)

- El modal de claves usa el selector por estados y municipios con escritura, búsqueda, «Incluir el estado completo» y bloques repetibles. El alta envía `estados` y el servidor los expande a municipios (`clave_acceso_estados`), valida que existan en el catálogo y respeta el alcance del administrador.
- La lista de claves muestra código, nombre, territorio, usuarios vinculados, sesiones activas, usos, vencimiento, estado y eliminación. Al revocar o eliminar se cierran las sesiones de la clave y se corta su canal SSE.
- Las sesiones guardan la clave con la que se abrieron (`sesiones_usuario.clave_id`) y el monitoreo muestra su código y nombre.
- La pestaña de estadísticas recrea su selector territorial al abrirse: así ofrece las 32 entidades y los municipios del catálogo nacional, sin quedarse con el catálogo de la primera carga.
- Nueva pestaña «Auditoría» con permiso `ver_auditoria` y `GET /api/admin/auditoria`. El middleware `auditoria.js` registra toda escritura con actor, rol, permisos, clave, ruta, resultado, entidad, detalle saneado e IP hash; no guarda contraseñas, tokens ni claves.
- La importación del INEGI dejó 2 475 municipios y 50 763 comunidades de las 32 entidades; `scripts/sincronizar-catalogo.mjs` los carga en MySQL de forma no destructiva (`--seco` para previsualizar). El catálogo de pruebas sigue aislado en `backend/test/fixtures/seed-data`.
- Pruebas: `v294-claves-auditoria.test.js` (4/4) y suite JSON 325/325.

### 2026-10-28 — V2.9.3 (32 entidades y carga única)

- El catálogo ligero (`/api/municipios` y `/api/publico/municipios`) publica `estados` con las 32 entidades federativas. El selector territorial del informe, la demo, estadísticas y cuentas del personal las ofrecen aunque solo tres tengan municipios importados; los estados sin datos muestran «Incluir el estado completo» y se envían en `estados`.
- La validación de alcance de las cuentas acepta cualquier entidad de la república, no solo las que tienen municipios en el catálogo.
- El splash de arranque y el overlay de carga ya no muestran dos espirales a la vez: mientras el splash está visible, `loading()` actualiza su texto y `retirarArranque()` transfiere la carga pendiente al overlay.
- `frontend/sw.js` pasa a `incidencias-shell-v2.9.3`.
- Pruebas: `auth.test.js` verifica las 32 entidades en `/api/municipios`; `v2-ui.test.js` cubre los estados adicionales y el contrato del splash. Suite JSON 321/321.

### 2026-10-28 — V2.9.2 (selector de informes por estado)

- `modalSolicitudInforme` sustituye el buscador único «Escribe un municipio o estado…» y los chips por un selector de estado con escritura. Cada estado agregado crea un bloque con buscador de municipios, casilla «Seleccionar todos los municipios» y lista de selección rápida; el bloque vacío final permite añadir otro estado.
- «Seleccionar todos los municipios» envía el estado completo (`estados`); los municipios concretos se envían como IDs en `municipios`. Los estados completos no se duplican como IDs.
- La demo `modalDemoInforme` y los pasos 3–4 de la guía usan el mismo componente y explican el nuevo flujo.
- `frontend/sw.js` precarga `selector-territorial-bloques.js` y el armazón pasa a `incidencias-shell-v2.9.2`.
- Pruebas: `v2-ui.test.js` (helpers de bloques y contrato del modal/demo), `sin-estilos-inline.test.js` y `sintaxis-frontend.test.js`; suite JSON 320/320.

### 2026-10-27 — V2.9.1 (correo único)

- El correo vuelve a ser único: es el canal de avisos y dos cuentas no pueden compartirlo. El alta responde 409 con un mensaje que guía a usar otro correo o entrar con el nombre; si el correo cambia de mayúsculas también se rechaza.
- La migración `20261102_correo_unico.js` restaura el índice único y se detiene sin alterar datos si encuentra correos repetidos, listándolos para corregirlos. En la base de desarrollo se conservó el correo en la cuenta más reciente («Jaguar Errante») y se dejó sin correo la cuenta antigua duplicada («Puma Errante 27»), que sigue funcionando con su nombre y contraseña.
- El error de clave duplicada de MySQL se traduce a 409 (dos altas simultáneas con el mismo correo).
- La nota del alta aclara que cada correo pertenece a una sola cuenta; el aviso ofrece «Entrar a mi cuenta» cuando el conflicto es por correo.
- Pruebas: `registro-cuenta.test.js` (10/10 en JSON y MySQL) y `cuentas.test.js` (17/17); suite JSON 319/319.

### 2026-10-27 — V2.9.0 (acceso por nombre y pseudónimos únicos)

- El ciudadano ya no entra con su correo: el acceso es por **nombre o pseudónimo + contraseña** (`#ciud-nombre`). El servidor busca solo cuentas ciudadanas y prueba la contraseña contra cada coincidencia (las bases antiguas pueden tener nombres repetidos).
- El nombre es la credencial: no se repite entre ciudadanos (sin distinguir mayúsculas ni acentos). Un nombre ocupado responde 409 y ofrece «Entrar con este nombre» (`auth:usarNombre` → `prepararLogin`).
- Los pseudónimos se sortean libres de colisiones (`pseudonimoUnico`): reintenta el azar y, si hace falta, numera el candidato. El alta muestra la credencial resultante («Tu cuenta quedó como …»).
- El correo deja de ser identificador: es un dato de contacto. Se elimina el aviso de «correo en uso»; la migración `20261101_acceso_por_nombre.js` quita la unicidad de `usuarios.correo` e indexa `usuarios.nombre`. **(Revertido en V2.9.1: el correo vuelve a ser único.)**
- La vista de acceso incorpora el botón «Iniciar sesión» en la barra superior para sesiones anónimas, el enlace «Aún no tengo cuenta» y la nota del nombre; «Mi cuenta» recuerda el nombre de acceso.
- Pruebas: `registro-cuenta.test.js` (10/10 en JSON y MySQL), `cuentas.test.js` (17/17); suite JSON 319/319.

### 2026-10-27 — V2.8.1 (alta de cuenta)

- El botón «Crear mi cuenta» ya no parece muerto: `.toast` (14000) y `.loading-overlay` (13900) quedan por encima de `.login-screen` (10000) y de `.onboarding` (11000); antes los errores del alta se pintaban detrás de la tarjeta y no había ninguna señal.
- La tarjeta de acceso incorpora `#loginMensaje` (`publico-msg`, `role="status"`) para avisos en línea, con botón de acción opcional. El acceso y el alta validan con `required`/`minlength`, y el botón de envío se bloquea mientras dura la petición.
- Un correo repetido (409) muestra «Ese correo ya tiene una cuenta registrada» y ofrece «Entrar con esta cuenta», que abre el acceso con el correo precargado (`auth:usarCorreo` → `prepararLogin`). Los errores 429/400/red se traducen a un texto claro dentro de la tarjeta. **(Reemplazado en V2.9.0: el acceso es por nombre y el correo ya no se avisa como ocupado.)**
- `alternarPseudonimo()` deja de usar estilos inline (`hidden`/`u-oculto`) y ajusta el `required` del nombre real.
- El armazón offline pasa a `incidencias-shell-v2.8.1`.
- Pruebas: `registro-cuenta.test.js`; suite JSON 316/316 y MySQL dirigido 8/8. Sin migraciones ni cambios de esquema.

### 2026-10-31 — V2.8.0

- Publicidad: 22 plantillas, 10 formatos, 8 diseños, 8 fuentes, imagen de fondo, importación/exportación JSON, QR editable y estadísticas de escaneos; el servidor persiste todos los campos de diseño y los códigos QR.
- QR: generación local SVG/PNG/PDF, entrada `/r/:codigo` con `?qr=`, registro de ubicación aproximada (municipio, sin coordenadas) y panel de estadísticas.
- Adjuntos: tabla `adjuntos`, políticas por canal (chat: imágenes/PDF/Office; comentarios: solo imágenes), validación por firma binaria, descarga autorizada y UI en mensajería, contactos directos y comentarios.
- Permisos: cada pestaña del panel tiene `data-permiso`, `PERMISO_POR_TAB` y guardas de servidor; se añadieron los permisos de moderación, usuarios, incidencias, tipos, municipios, zonas, firmas, informes, legal, configuración, respaldos, simulador, publicidad y correos.
- Tutoriales: contexto por paso, restauración de vista/modal, foco de sección completa y recolocación de la tarjeta para no tapar el objetivo cuando hay espacio; la guía de cuenta ya no abre el login en su primer paso. Las guías se filtran por permiso.
- El arranque de desarrollo usa `scripts/dev.mjs` para no crear watchers duplicados cuando el puerto ya está ocupado; el segundo `npm run dev` termina con un aviso y sin procesos en cola.
- El armazón offline pasa a `incidencias-shell-v2.8.0` y precarga los módulos de QR, adjuntos y contactos directos.
- Pruebas: `adjuntos.test.js`, `permisos-panel.test.js` y `sintaxis-frontend.test.js`; suite JSON 308/308. MySQL dirigido pendiente por ausencia de Docker.

### 2026-10-26 — V2.7.0

- Tickets: el ciudadano ya no elige prioridad; el servidor fuerza `media` y solo `soporte`/admin pueden fijarla. Se añadió el selector de prioridad al detalle del panel administrador.
- Informes: el modal usa el selector territorial multiestado; los estados completos y los municipios concretos se consultan como unión. Se eliminó el truncado silencioso de territorios y se corrigió el resumen de la notificación multiestado.
- Legal: `modalAvisoLegal` reutilizable para términos/privacidad; el onboarding pinta el texto publicado y guarda una aceptación versionada en `aceptaciones_legales`. El middleware `terminos.js` bloquea escrituras con 428 y obliga a reaceptar cuando cambia la versión.
- Mapa: marcador azul de persona con pulso para «mi ubicación», separado de incidencias y clústeres; limpieza al cambiar de municipio.
- Pruebas: `terminos.test.js` y cobertura de prioridad, multiestado, modal legal y marcador. Suite JSON: 292/292; consentimiento MySQL dirigido: 3/3.

### 2026-10-26 — V2.7.1 (estudio de publicidad)

- La pestaña «Publicidad y campañas» incorpora biblioteca de 12 plantillas, formatos para cada red, paletas, tipografías, lienzo SVG en vivo y exportación PNG/SVG/CSV para Canva.
- El editor de campañas añade plantillas de correo, HTML avanzado con contador, generación de texto plano y vista previa de escritorio/celular.
- `PATCH /api/admin/publicidad/:id` conserva y actualiza plantilla, municipio, estado y enlace normalizado con `?municipio=`; el enlace de suscripción copiado apunta a `/suscripcion`.
- Sin tablas ni migraciones nuevas: el estudio es solo frontend y reutiliza los endpoints existentes.
- El armazón offline (`incidencias-shell-v2.7.1`) precarga los recursos del estudio y del editor de campañas.
- Pruebas: `publicidad-estudio.test.js` y edición de publicaciones. Suite JSON: 297/297. MySQL dirigido pendiente en este entorno por ausencia de Docker.

### 2026-10-29 — V2.6.0

- Informes y tickets dejan de ser páginas independientes: `frontend/informes.html`, `frontend/js/informes.js`, `frontend/tickets.html` y `frontend/js/tickets.js` se retiran. Los enlaces de la barra lateral y las notificaciones abren `modalSolicitudInforme` y `modalTickets`.
- `GET /informes` y `GET /tickets` redirigen a la SPA conservando `verificar`, `informe`, `tickets` o `ticket`; la SPA abre el modal y, si corresponde, la solicitud o el detalle. Los correos de verificación y los enlaces de folio ahora apuntan directamente a `/?verificar=…` y `/?informe=1&folio=…`.
- El modal de informe exige cuenta, explica el bloqueo, llena municipios a partir del estado, mantiene el enlace directo a `/legal` y separa el formulario de consulta para no anidar formularios.
- El tutorial inicial «Primeros pasos» se autoabre una sola vez por dispositivo, se migra desde `inc_tutorial_v1` y queda en la enciclopedia. Las guías de informes y tickets usan sus modales de demostración y ya no navegan a otra página.
- Corregido el foco de los tutoriales: se espera al pintado del modal objetivo, se centra el objetivo y, si aún no es visible, la tarjeta se muestra centrada en vez de apuntar a un elemento de 0×0.
- Suite JSON: 284/284.

### 2026-10-29 — V2.5.0
- Informe imprimible: paginación con Paged.js, sin hojas desperdiciadas por saltos de fila; pie con contador de páginas y saltos `break-inside` controlados.
- Diseño del informe: logo institucional subido por admin, posición izquierda/derecha/centro, ancho, ajuste horizontal/vertical y texto que fluye alrededor; márgenes superior/derecho/inferior/izquierdo y pie configurables.
- PDF público: usa la misma plantilla de logo, márgenes y pie; el CSS se sirve en `/api/informes/estilo.css`.
- Tutoriales: la guía de reporte abre el formulario, cierra el modal para mostrar el mapa y lo reabre; las guías de detalle cierran el modal antes de continuar. Se corrigió la navegación de pestañas del panel.
- Accesos: tickets e informes dejan de mostrarse y de funcionar para sesiones anónimas; se exige cuenta registrada en frontend y backend.
- Pruebas y documentación actualizadas; suite JSON 281/281 y sin migraciones nuevas.

### 2026-10-28 — V2.4.0
- Soporte: permiso `atender_tickets`, enlace oculto para anónimos/ciudadanos/funcionarios y página `/soporte` con validación y redirección; `/auth/me` expone `esPersonal` y `puedeAtenderTickets`.
- Mapa: los controles de capas vuelven a estar visibles y clicables; `.map-container` aísla el apilamiento.
- Barra lateral: grupos «Mi actividad», «Participación» y «Ayuda», scroll y controles A−/A+/restablecer persistentes.
- Informes: el estado filtra sus municipios, permite seleccionar todos y los archivos generados se guardan con folio único, se previsualizan en modal y se descargan; en Electron/VS Code el PDF se ofrece para abrir fuera y descargar.
- Tickets: reglas solo para admin, simulación sin guardar, corrección de asignación a soporte y de la validación de permisos.
- Publicidad/campañas: vista previa sin guardar, bloqueo de campañas enviadas, nombres de segmento y refresco de envíos.
- Tutoriales: simulaciones seguras en todas las guías, sandboxes de informe y ticket, y guía del panel de soporte.
- Pruebas y documentación actualizadas; sin migraciones nuevas. Suite JSON 273/273.

### 2026-10-27 — V2.3.0
- Mapa: se retiró «Terreno y sombras» (servicio sin datos) y los controles de Leaflet bajaron de z-index para no tapar la leyenda ni los desplegables de la barra.
- Geolocalización: `/api/municipios/ubicacion` detecta el municipio real; «mi ubicación» cambia el municipio activo y el del formulario si hace falta.
- Informes públicos: selector territorial con búsqueda, selección múltiple de estados y municipios y atajos «todo el estado».
- Estadísticas: filtros por estado/municipio, comparación por municipio y entidad, y tiempos de resolución con detalle por incidencia; el alcance del actor se respeta en el servidor.
- Municipios: tabla agrupada por estado, búsqueda y filtro desplegable, ficha municipal con flujo funcionario → administrador y pestaña propia de claves.
- Usuarios: roles especiales, asignación compatible, solicitudes de permisos con aprobación y bandeja en el panel; «Mi cuenta» para pedir permisos.
- Publicidad: editor con estructura, CTA, colores personalizables, edición de publicaciones guardadas y fusión con campañas de correo.
- Correos institucionales: un correo verificado se asigna a la clave de su municipio (la crea si no existe).
- Tutoriales: apertura automática de la vista y guías detalladas para cada sección del panel, Monitoreo e Informes.
- Migración `20261027_mejoras_v23.js`; pruebas `mejoras-v23.test.js`; suite JSON 261/261, MySQL dirigido 7/7 y 3/3; `verificar-funciones` real 25/25.

### 2026-10-26 — V2.2.0 (implementación completada)
- Simulador admin: catálogo por rol, sesiones con usuario/reporte simulado, ejecución de acciones reales etiquetadas, journal, cierre y reversión auditada; SSE/correo bloqueados en contexto simulado.
- Publicidad en redes: plantillas, límites por red, hashtags, enlace, QR local (`qrcode`), enlaces de compartir, descarga SVG y listado con búsqueda.
- Directorio de correos institucionales: CRUD, importación/exportación CSV, búsquedas asistidas e invitaciones con registro de fecha.
- Moderación: restricción y levantamiento de restricciones de comentarios desde el panel; las cuentas restringidas aparecen en sanciones.
- Consentimiento: la versión de términos se lee del documento legal publicado, no de una fecha fija.
- Respaldos: worker automático cada 30 min, retención configurable, próximo respaldo en estadísticas y aviso `respaldo_creado`.
- Migración `20261026_simulacion_contexto.js` aplicada en MariaDB local.
- Pruebas nuevas `simulador.test.js`, `publicidad.test.js` y `correos-institucionales.test.js`; suite completa en verde: 251 pruebas JSON y ejecución MySQL dirigida de las funciones V2.2.

### 2026-10-25 — V2.2.0 (en implementación)
- Documento creado.
- Respaldo físico previo a migraciones (`incidencias_backup_pre_v2_2`) con 37 tablas y 6,609 filas.
- Plan de 16 fases aprobado: configuración, firmas, comentarios, legal, informes multi-territorio, contacto a funcionarios, notificaciones, folios, mapa, tutorial, simulador, publicidad, correos, respaldos y verificación real.
- En implementación: configuración central, migraciones 027+, firmas, comentarios, legal, notificaciones e historial, folios, contacto, informes, respaldos, tutorial y simulador.

### 2026-09 (V2.1)
- Alcance territorial N:M, reportes viales, informes públicos, contacto/sugerencias, campañas, monitoreo, mapa optimizado y app de escritorio.
