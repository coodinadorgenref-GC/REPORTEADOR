# ESTADO — Reporteador GC

## Qué es
Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Lo usan administración y vendedores (cada vendedor ve solo su agencia).

## Cómo está armado
- `index.html`: toda la app (Panel General, Inventario, Ventas, Talleres, Configuración).
- `talleres.js`: pestaña Talleres (Timbrado y Productividad, mecánicos por sucursal).
- `sw.js`: service worker; **cada cambio sube el número de VERSION** (hoy `reporteador-v62`).
- `manifest.json` e iconos: instalación como app.
- Datos: API de Apps Script (`Código.gs`, `Talleres.gs`) vía Worker de Cloudflare; hojas DATOS / Ventas_Mensual_SKU / Taller_Mensual.
- Build visible en Configuración: `APP_BUILD` en index.html (hoy `Reporteador GC · v62 coor · 14-10-26`). Formato: `Reporteador GC · (versión) (iniciales de la cuenta usada) · (fecha de actualización dd-mm-aa)`.

## Reglas que no se rompen
- Cada cambio sube la versión en `sw.js` y `APP_BUILD`.
- Talleres solo para administración.
- **Pestaña Ventas** = todas las ventas timbradas, a Contado (CONT) y a Crédito (CRED). Para objetivo, rotación y margen solo cuenta lo **contado** (los filtros viven en el código: `ventaAplica` y `esVentaCredito`). Panel General: contado resaltado, abajo crédito sin resaltar y abajo lo que lleva vendido en el mes en curso.
- **Pestaña Talleres** mide lo **Timbrado** (tabula CONT y CRED) y la **Productividad**.
- **Productividad**: se descarga del ERP con los mismos títulos de GCVEN02 pero distinto contenido; ahí sí aparece ABONERO. El Timbrado y la Productividad son dos descargas distintas.
- Regla de oro de Talleres: idéntica al Excel REPORTES_MANO_DE_OBRA, salvo que los importes van sin IVA (Timbrado = SUBTOTAL; Productividad = SUBTOTAL + MANO_OBRA).

## Pendiente (en orden)
1. **Subir el GCVEN02** (aún no se sube): mes en curso y años anteriores que quieras ver; después confirmar que ABONERO sale con Raúl en Talleres.
2. **Productividad sin destino de guardado**: en Configuración › Pegar datos ya existe la opción «GCVEN02 - VENTAS EN GENERAL CON COSTO - PRODUCTIVIDAD» (se reconoce y muestra vista previa), pero **no sube nada** porque Timbrado y Productividad comparten hoy la misma hoja Taller_Mensual y subirla encima reemplazaría el Timbrado del mes. Hay que decidir el destino (hoja nueva o columna de tipo en `Talleres.gs`) y que la pestaña Talleres lea la Productividad de ahí.
3. Confirmar con el usuario: las refacciones de ABONERO las vende Henry/Miguel en el Excel y la pestaña las atribuye a Raúl. ¿Se deja así?
4. Probar en el navegador: Configuración sin filtros, tarjeta de ventas del Panel General (contado / crédito / lleva vendido) y ABONERO en Talleres.
5. Al subir un documento (p. ej. «Procesar y actualizar ventas») el reporte tarda en refrescar; mejorar el aviso «Actualizando datos…».
6. Sucursal ABONERO / Raúl no aparece en las gráficas con filtro global de zona/agencia (ABONERO no está en `AGENCIAS_MOTOS` ni en `ZONA_POR_AGENCIA`); con «Todas las agencias» sí debe verse. Si persiste: confirmar que se re-subió el GCVEN02 del mes y qué filtro global estaba activo.
7. Talleres › Producto sigue con 2 opciones (Servicios / INSUMO): `Taller_Mensual` no guarda el nombre del producto. Decidir si se agrega esa columna (más filas, más pesado).

## Cómo probar
1. Subir `index.html`, `sw.js` y `ESTADO.md` a GitHub Pages y recargar; Configuración debe mostrar «Reporteador GC · v62 coor · 14-10-26». (`talleres.js` no cambió.)
2. Panel General: la tarjeta de ventas de refacciones muestra arriba el contado (resaltado), abajo «Crédito: …» y abajo «Lleva vendido en (mes): … a contado · … a crédito».
3. Configuración › Pegar datos: el selector trae «GCVEN02 … - TIMBRADO» y «GCVEN02 … - PRODUCTIVIDAD»; Productividad solo muestra la vista previa.
