# ESTADO — Reporteador GC

## Qué es
Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Lo usan administración y vendedores (cada vendedor ve solo su agencia).

## Cómo está armado
- `index.html`: toda la app (Panel General, Inventario, Ventas, Talleres, Configuración).
- `talleres.js`: pestaña Talleres (Timbrado y Productividad, mecánicos por sucursal).
- `sw.js`: service worker; **cada cambio sube el número de VERSION** (hoy `reporteador-v55`).
- `manifest.json` e iconos: instalación como app.
- Datos: API de Apps Script (`Código.gs`) vía Worker de Cloudflare; hojas DATOS / Ventas_Mensual_SKU.
- Build visible en Configuración: `APP_BUILD` en index.html (hoy v55 k1).

## Reglas que no se rompen
- Cada cambio sube la versión en `sw.js` y `APP_BUILD`.
- El crédito (CRED) no cuenta como venta en objetivo/rotación/margen; Talleres sí tabula CONT y CRED.
- Talleres solo para administración.

## Hecho recientemente (13-10-26, v55)
1. **Configuración sin filtros**: en `cambiarVista` se oculta el filtro global de Agencia (`fg-wrap`) cuando la vista es `config`. (El botón "Filtros del reporte" ya estaba oculto ahí.)
2. **ABONERO / RAUL FRANCISCO NOVELO PAT** (talleres.js):
   - Nueva constante `TL_ABONERO` y función `tlMecDe(r)`: toda fila de sucursal ABONERO se atribuye a Raúl, sin importar el vendedor.
   - `tlPasa`: ABONERO entra con familias 01-MOTOS/REFACCIONES y 05-MOTOCARRO/REFACCIONES, CONT y CRED, todos los vendedores (no le aplican los filtros de subfamilia/producto/mecánico de taller).
   - Raúl "vive" siempre en ABONERO y aparece en la lista de mecánicos aunque no tenga movimientos.
3. sw.js → v55, APP_BUILD → v55 k1.

## Pendiente (en orden)
1. **Confirmar ABONERO con datos reales**: `obtenerTalleres` (Talleres.gs / Código.gs) hoy probablemente solo manda familias de taller. Para que ABONERO salga hay que mandar también las filas de sucursal ABONERO con familias de REFACCIONES (CONT y CRED). **Necesito Talleres.gs / el doPost de Código.gs.**
2. **Ventas con listas completas y selección predeterminada** (como Inventario): panel "Filtros del reporte" exclusivo de Ventas con Familia, Subfamilia, Producto, Vendedor y Sucursal; se listan todos los valores de DATOS y vienen marcados solo los criterios de `ventaAplica()` (excluye vendedores varios, clientes excluidos, CANCUN, etc.). Para esto el servidor debe mandar el universo de valores y la venta por mes agregada por esas dimensiones (hoy `ventasSkuMes` solo trae SKU × sucursal × mes, sin vendedor ni subfamilia). **Necesito Código.gs** para ver qué agrega hoy y ampliarlo sin hacer pesada la carga.
3. Probar en el navegador (no pude abrirlo aquí): que Configuración no muestre filtros y que ABONERO aparezca en Talleres.

## Cómo probar
1. Subir los 4 archivos (index.html, talleres.js, sw.js, ESTADO.md) a GitHub Pages y recargar; Configuración debe mostrar "v55 k1".
2. Entrar a Configuración: no debe verse el selector de Agencia ni "Filtros del reporte".
3. Talleres: revisar que ABONERO aparezca con Raúl (requiere el ajuste del pendiente 1).
