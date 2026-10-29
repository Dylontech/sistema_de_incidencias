# Aplicación de escritorio

Contenedor Electron para Windows y Linux del Sistema de Incidencias Municipales.
No incluye el backend: se conecta al servidor que ya tienes desplegado.

## Requisitos

- Node.js 20 o superior (solo para desarrollar y empaquetar).
- Windows 10/11 o una distribución Linux con glibc.
- Acceso de red al servidor (HTTPS recomendado; HTTP solo en red local).

## Desarrollo

```bash
cd desktop
npm install
npm start
```

La primera vez se abre el asistente. Escribe la dirección del servidor, por
ejemplo:

- `https://incidencias.mi-municipio.gob.mx`
- `http://192.168.1.50:3100` (red local, sin TLS)

El botón **Probar conexión** consulta `GET /api/salud`. Si responde, guarda y
abre la aplicación.

## Empaquetado

```bash
npm run dist:win     # instalador NSIS (.exe)
npm run dist:linux   # AppImage y .deb
```

Requisitos del sistema de compilación:

- Linux: `dpkg` y `fakeroot` para el `.deb`; `libfuse2` para ejecutar el AppImage.
- Windows: no requiere herramientas extra; NSIS lo descarga electron-builder.

Los instaladores quedan en `desktop/dist/`.

## Mapas offline: veredicto legal y procedimiento

**No se descargan teselas de los servidores públicos de OSM, OpenTopoMap ni
Esri.** Sus políticas prohíben el *bulk downloading* y el uso por aplicaciones
distribuidas sin permiso.

La alternativa legal y sin costo es generar teselas propias:

1. Descarga un extracto `.osm.pbf` de Geofabrik (datos ODbL).
2. Genera teselas con **tilemaker** (o planetiler) y conviértelas a **PMTiles**.
3. Copia el archivo a `desktop/recursos/mapas/incidencias.pmtiles`.
4. Mantén `LEEME.txt` con la atribución «© OpenStreetMap contributors» y ODbL.

```bash
# Requiere tilemaker y pmtiles instalados
node scripts/generar-mapas-offline.mjs --descargar
# o con un extracto propio:
node scripts/generar-mapas-offline.mjs --osm C:\datos\mexico.osm.pbf
```

Tamaño orientativo: vectorial z0–14 para CDMX + Michoacán + Guanajuato ≈
150–400 MB; México completo ≈ 2–4 GB. La app sirve el PMTiles desde
`127.0.0.1` y el visor lo consume solo si el usuario activa el modo offline.

Si no hay paquete offline, la app usa las teselas del servidor (Esri/OpenTopoMap
configuradas en el frontend) y requiere internet.

## Seguridad

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- El renderer no tiene acceso a Node; solo al puente `desktopApi`.
- La navegación se limita al origen del servidor; los enlaces externos se abren
  en el navegador del sistema.
- Solo se concede permiso de geolocalización (botón «Mi ubicación»).
- El token de sesión vive en el `localStorage` del origen del servidor, igual
  que en la versión web.

## Diagnóstico

Menú **Ayuda → Diagnóstico de conexión**: muestra estado, latencia, almacén,
mapas offline instalados y versión. El menú **Archivo → Configurar servidor…**
permite cambiar la URL sin reinstalar.
