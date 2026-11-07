# Instrucciones del repositorio

## Documentación viva obligatoria

Antes de dar por terminado cualquier cambio, actualiza `PROJECT_CONTEXT.md`:

- Esquema, migraciones o datos → secciones «Modelo de datos» y «Migraciones y datos».
- Rutas, controladores o servicios → sección «API».
- Roles, permisos o alcance → sección «Roles y permisos».
- Eventos de notificación → sección «Eventos de notificación».
- Claves de configuración → sección «Configuración».
- Flujos de interfaz, modales o acciones → sección «Arquitectura» y catálogo de tutoriales.
- Seguridad/CSP → sección «Seguridad y CSP».
- Añade siempre una entrada al changelog con la fecha.

Además, mantén sincronizado `SISTEMA_COMPLETO.md` cuando cambien vistas, modales, pestañas,
acciones, permisos, roles o migraciones. Ejecuta
`cd backend && node --test test/sistema-documentado.test.js`.

## Reglas técnicas

- Todo método de repositorio nuevo debe implementarse en `contrato.js`, `json/repositorio.js` y `mysql/repositorio.js`.
- Toda tabla nueva debe registrarse en `TABLAS`; toda columna nueva en `COLUMNAS`.
- FKs a `usuarios.id` con la misma colación (`colacionDeUsuarios`).
- No usar estilos inline, `<style>`, `onclick` ni scripts inline.
- Acciones de UI con `data-action` + `registrarAcciones()`.
- Autorización de roles y alcance siempre en el servidor.
- Los tests deben cubrir JSON y MySQL cuando el cambio toque persistencia.
- No ejecutar `npm run seed` sobre una base con datos reales: es destructivo.
