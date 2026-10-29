# ESTADO — Reporteador GC
Última revisión: 2026-10-29 · Último cambio documentado: lista general de precios (27-oct-2026) · `sw.js`: `reporteador-v86`

## Qué es
Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Lo usan administración y vendedores (cada vendedor ve solo su agencia).

## Estado actual
- v86: Talleres solo para admin real. v85: Cierres mensuales de inventario solo admin.
- v84: costos visibles solo para administración (`puedeVerCostos`). v83: rediseño del Panel General e Inventario › Resumen.
- 27-oct: lista general de precios (`LISTA_PRECIOS`): carga desde el ERP (Excel GCVEN12 o «Control de lista de precios») en modo Avance o Lista completa, y bajo pedido de VENTO sin SKU.
- Verificar versiones: `HISTORIAL.md` menciona v75, v78 y v86 en distintos sitios; la fuente es `sw.js` y `APP_BUILD` en `index.html`.

## Cómo está armado
`index.html` (Panel General, Inventario, Ventas, Talleres, Configuración), `exportar.js` (PDF y Word), `talleres.js`, `sw.js`, `manifest.json` e iconos. Datos: API de Apps Script (`Codigo_Reporteador.js`, `Talleres.js` en el repo `apps-script`) vía Worker de Cloudflare; hojas DATOS, Ventas_Mensual_SKU y Taller_Mensual.

## Reglas que no se rompen
- Cada cambio sube la versión en `sw.js` (`VERSION`) y en `APP_BUILD` de `index.html`. Antes de entregar, revisar la sintaxis de los 4 scripts (`node --check`).
- Todo el reporte va sin IVA.
- Ventas = contado (CONT) y crédito (CRED); para objetivo, rotación y margen solo cuenta lo contado (`ventaAplica`, `esVentaCredito`).
- Talleres mide Timbrado (SUBTOTAL) y Productividad (SUBTOTAL + MANO_OBRA). MANO_OBRA no lleva IVA. Regla de oro: idéntico al Excel REPORTES_MANO_DE_OBRA, salvo los importes sin IVA.
- Permisos: Configuración, subidas, Conciliación de Talleres y Control interno solo admin real; Talleres y Cierres solo admin; costos solo administración. Varios ocultamientos son solo en pantalla: el dato sigue llegando al navegador.
- Avisos con `avisoGC` / `confirmarGC` (sin `alert`/`confirm` del navegador).

## Pendientes (tomados del 15-oct; por revalidar)
- Confirmar con datos reales si el GCVEN02 de Timbrado trae las refacciones de ABONERO (si no, el timbrado de Raúl queda en $0).
- Confirmar con el usuario que los $2,724.15 de enero son de agencias sin objetivo y si el criterio «Vendido» aplica también a KPIs y Panel General.
- Probar en navegador: Configuración sin filtros, tarjeta de ventas del Panel General y ABONERO en Talleres.
- Decidir si `Taller_Mensual` guarda el nombre del producto (Talleres › Producto tiene solo 2 opciones).

## Documentos
`README.md` (presentación) · `ESTADO_REPORTEADOR.md` (este) · `HISTORIAL.md` (bitácora completa por versión y fecha).
