# REPORTEADOR GC

Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Es también la fuente de la lista de precios (`LISTA_PRECIOS`) que usan el catálogo y Maps. Corre en GitHub Pages; los datos vienen de Apps Script (repo `apps-script`) vía un Worker de Cloudflare.

- **Estado actual y reglas:** [`ESTADO.md`](./ESTADO.md)
- **Bitácora completa:** [`HISTORIAL.md`](./HISTORIAL.md)
- **Proyectos hermanos:** CATALOGO-DE-INVENTARIO y Maps

Publicar un cambio: subir los archivos a `main` y subir la versión en `sw.js` y en `APP_BUILD` de `index.html`.
