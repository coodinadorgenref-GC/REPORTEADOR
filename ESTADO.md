# ESTADO — Reporteador GC

## Qué es
Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Lo usan administración y vendedores (cada vendedor ve solo su agencia).

## Cómo está armado
- `index.html`: toda la app (Panel General, Inventario, Ventas, Talleres, Configuración).
- `talleres.js`: pestaña Talleres (Timbrado y Productividad, mecánicos por sucursal).
- `sw.js`: service worker; **cada cambio sube el número de VERSION** (hoy `reporteador-v66`).
- `manifest.json` e iconos: instalación como app.
- Datos: API de Apps Script (`Código.gs`, `Talleres.gs`) vía Worker de Cloudflare; hojas DATOS / Ventas_Mensual_SKU / Taller_Mensual.
- Build visible en Configuración: `APP_BUILD` en index.html (hoy `Reporteador GC · v66 reff · 14-10-26`). Formato: `Reporteador GC · (versión) (iniciales de la cuenta usada) · (fecha de actualización dd-mm-aa)`.

## Reglas que no se rompen
- Cada cambio sube la versión en `sw.js` y `APP_BUILD`.
- Talleres solo para administración.
- **Pestaña Ventas** = todas las ventas timbradas, a Contado (CONT) y a Crédito (CRED). Para objetivo, rotación y margen solo cuenta lo **contado** (los filtros viven en el código: `ventaAplica` y `esVentaCredito`). Panel General: contado resaltado, abajo crédito sin resaltar y abajo lo que lleva vendido en el mes en curso.
- **Pestaña Talleres** mide lo **Timbrado** (tabula CONT y CRED) y la **Productividad**.
- **Productividad**: se descarga del ERP con los mismos títulos de GCVEN02 pero distinto contenido; ahí sí aparece ABONERO. El Timbrado y la Productividad son dos descargas distintas.
- Regla de oro de Talleres: idéntica al Excel REPORTES_MANO_DE_OBRA, salvo que los importes van sin IVA (Timbrado = SUBTOTAL; Productividad = SUBTOTAL + MANO_OBRA).

## Pendiente (en orden)
1. **Subir el GCVEN02** (aún no se sube): mes en curso y años anteriores que quieras ver; después confirmar que ABONERO sale con Raúl en Talleres.
2. ~~Destino de Productividad~~ Decidido (v63/v64): hoja `Productividad_Mensual` en el mismo libro de ventas (ID_SHEETS_VENTAS), mismas columnas que `Taller_Mensual`; no pisa el Timbrado. Requiere `Talleres.gs` actual y las líneas de `doPost` para `actualizarProductividadMensual` (y `obtenerTalleres`). Subir Productividad de enero a la fecha, mes por mes.
3. ~~Henry/Miguel~~ v64: son de DIRECCIÓN (colaboradores.xlsx), no mecánicos: v65: las refacciones de ABONERO YA NO se atribuyen a Raúl: se identifican como sucursal ABONERO y dentro de ella cada quien con su nombre (Raúl, Henry, Miguel; `TL_DIRECCION` solo cuentan dentro de ABONERO y no cuentan en «mecánicos»). v66: solo las REFACCIONES de ABONERO se relabelan ABONERO (`aFila`); lo demás de Raúl conserva su sucursal del ERP (BODEGA, Bajaj Valladolid…), así BODEGA sale en «por sucursal». CAMB. 2 (OLEGARIO) queda fuera de Productividad (`TL_SUC_EXCL_PROD`), no del Timbrado.
4. Probar en el navegador: Configuración sin filtros, tarjeta de ventas del Panel General (contado / crédito / lleva vendido) y ABONERO en Talleres.
5. ~~Aviso «Actualizando datos…»~~ v64: al subir Productividad ahora se muestra el aviso y se recarga el reporte al terminar (antes esa ruta no lo hacía). Probar también con Timbrado/Ventas.
6. v64: ABONERO (incluido Raúl/BODEGA) ya no se pierde con filtro global «Todas» ni con una zona (`tlAboVisible`); solo se oculta al elegir una agencia concreta. Si aún no sale: subir Timbrado y Productividad del mes con esta versión y revisar el aviso en Talleres › Cuadre.
7. Talleres › Producto sigue con 2 opciones (Servicios / INSUMO): `Taller_Mensual` no guarda el nombre del producto. Decidir si se agrega esa columna (más filas, más pesado).

## Cuadre con el Excel (verificado con la hoja DATOS, 14-oct-26)
- Tus dos tablas dinámicas se reproducen exacto desde DATOS: Timbrado (TOTAL) $2,019,623 y Productividad (total M.O.) $2,785,345.
- El dashboard muestra ANTES de IVA; con IVA y SIN las refacciones de ABONERO (que están en tu hoja «refacciones abonero», no en esas dos tablas) coincide, salvo $319 de un producto (GARANTÍAS F. VENTONET…) que tu tabla oculta a mano. El panel «Cuadre con tu Excel» ahora separa esas refacciones.

## Cómo probar
1. Subir `index.html`, `sw.js`, `talleres.js` y `ESTADO.md` a GitHub Pages y recargar; Configuración debe mostrar «Reporteador GC · v66 reff · 14-10-26». (`talleres.js` cambió en v64.)
2. Panel General: la tarjeta de ventas de refacciones muestra arriba el contado (resaltado), abajo «Crédito: …» y abajo «Lleva vendido en (mes): … a contado · … a crédito».
3. Configuración › Pegar datos: el selector trae «GCVEN02 … - TIMBRADO» y «GCVEN02 … - PRODUCTIVIDAD»; Productividad solo muestra la vista previa.
