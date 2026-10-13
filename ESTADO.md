# ESTADO — Reporteador GC

## Qué es
Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Lo usan administración y vendedores (cada vendedor ve solo su agencia).

## Cómo está armado
- `index.html`: toda la app (Panel General, Inventario, Ventas, Talleres, Configuración).
- `talleres.js`: pestaña Talleres (Timbrado y Productividad, mecánicos por sucursal).
- `sw.js`: service worker; **cada cambio sube el número de VERSION** (hoy `reporteador-v59`).
- `manifest.json` e iconos: instalación como app.
- Datos: API de Apps Script (`Código.gs`) vía Worker de Cloudflare; hojas DATOS / Ventas_Mensual_SKU.
- Build visible en Configuración: `APP_BUILD` en index.html (hoy v59 k2120).
- El APP_BUILD. Esta construido por 'Reporteador GC · (version) v56 (iniciales de cuenta usada) ch21 · (fecha de actualizacion) 13-10-26';

## Reglas que no se rompen
- Cada cambio sube la versión en `sw.js` y `APP_BUILD`.
- El crédito (CRED) no cuenta como venta en objetivo/rotación/margen; Talleres sí tabula CONT y CRED.
- Talleres solo para administración.

## Hecho recientemente (13-10-26, v59)
- **Talleres con listas completas y selección predeterminada (pendientes 9 y 10, y el antiguo 2 que era de Talleres, no de Ventas)**: `subirTallerObjetos` (talleres.js) ya NO limita la subida a las familias de taller: manda toda la venta de GCVEN02 (CONT y CRED, todas las familias, con vendedor). Así Familia, Subfamilia, Sucursal y Mecánico muestran la lista completa (como Inventario) y vienen marcados los filtros predeterminados de siempre; los resultados por defecto no cambian. Subfamilia y Mecánico van agrupados (subfamilia bajo su familia principal, taller primero; mecánico bajo su sucursal). La sucursal "casa" de cada mecánico se calcula con sus filas de taller. **Hay que RE-SUBIR el GCVEN02 de cada mes/año** para que entren las demás familias. `Talleres.gs` no cambió (tope 8,000 registros por mes; si el mensaje dice "Demasiados registros", subir `MAX_REGISTROS_TALLER_POR_MES`).
- **Producto** sigue con 2 opciones (Servicios / INSUMO): la hoja `Taller_Mensual` no guarda el nombre del producto. Tener lista de productos exige agregar esa columna (más filas y más pesado). Pendiente de decidir.
- **ABONERO / Raúl en gráficas (pendiente 8)**: diagnóstico en Talleres › «3) Para revisar»: avisa si ABONERO no tiene renglones guardados en el año (causa más probable: falta re-subir el GCVEN02 con v56+), si el filtro global de Agencia lo deja fuera, o si los filtros del reporte lo vacían. En "Lo que los filtros dejan fuera" ABONERO ya muestra su motivo real.
- sw.js → v59, APP_BUILD → v59, `talleres.js?v=59`.

## Hecho antes (v58)
- **Pendiente 4 (sesión/login)**: al abrir, si hay sesión guardada se llama a `validarSesion` (muestra "Verificando sesión…"). Viva → entra directo; vencida → borra sesión local y muestra login limpio; sin red → entra con lo guardado. Ya no se usa `loginTime` para decidir. "Forzar recarga" (`forzarRecarga`) limpia caché y service worker y CONSERVA la sesión. Sin tocar `Código.gs`: las sesiones huérfanas de pestañas cerradas siguen contando para `MAX_SESIONES_POR_USUARIO` (opción C del servidor queda pendiente si reaparece).
- **Pendiente 7**: «Ventas mensuales (detalle por SKU)» rechaza el archivo completo (sin subir nada) si trae filas de años distintos al actual.
- **Pendiente 8**: sin cambio; ver nota abajo.

## Hecho antes (v57)
0. **Histórico de años anteriores con detección automática de año (pendiente 6)**: `procesarYSubirVentasHistoricas` / `subirVentasHistoricasObjetos` (index.html). El campo Año ahora es opcional: vacío = se detectan los años por la FECHA de cada renglón (todos los anteriores al año en curso, el año en curso se omite). Acepta varios archivos a la vez (`multiple`) o un solo archivo con varios años. Pide confirmación mostrando los años detectados (avisa si un año trae menos de 12 meses), sube un POST `actualizarVentasHistoricoMensual` por año (el servidor no cambió) y manda Talleres solo de años anteriores. Si se escribe un año, se comporta como antes. También aplica al pegado (tipo "historico"). Tras subir, refresca el reporte. **Para 2023-2025: subir el GCVEN02 con detalle por SKU en esa tarjeta, con Año vacío.**
1. Nota: las funciones que antes se creían faltantes (`_leerVentasSkuMes`, `_leerSubidas`, `_leerResumenCierres`, `actualizarInventarioDatos`, `guardarCierreInventario`) sí existen en Subidas_y_meses.gs, Inventario_pegado.gs y Cierres_mensuales.gs.

## Hecho antes (v56)
0. **ABONERO llega a Talleres (v56)**: la causa estaba en la SUBIDA, no en el servidor. `subirTallerObjetos` (talleres.js) solo dejaba pasar `01-MOTOS/TALLER` y `03-SERV/SERVICIOS`. Ahora, si la sucursal es ABONERO, deja pasar `01-MOTOS/REFACCIONES` y `05-MOTOCARRO/REFACCIONES` (CONT y CRED) y acepta renglones sin vendedor. `Talleres.gs` / `obtenerTalleres` NO necesitan cambios (solo leen y devuelven la hoja Taller_Mensual). **Hay que volver a subir el GCVEN02 de cada mes** para que ABONERO entre a la hoja.

## Hecho antes (v55)
1. **Configuración sin filtros**: en `cambiarVista` se oculta el filtro global de Agencia (`fg-wrap`) cuando la vista es `config`. (El botón "Filtros del reporte" ya estaba oculto ahí.)
2. **ABONERO / RAUL FRANCISCO NOVELO PAT** (talleres.js):
   - Nueva constante `TL_ABONERO` y función `tlMecDe(r)`: toda fila de sucursal ABONERO se atribuye a Raúl, sin importar el vendedor.
   - `tlPasa`: ABONERO entra con familias 01-MOTOS/REFACCIONES y 05-MOTOCARRO/REFACCIONES, CONT y CRED, todos los vendedores (no le aplican los filtros de subfamilia/producto/mecánico de taller).
   - Raúl "vive" siempre en ABONERO y aparece en la lista de mecánicos aunque no tenga movimientos.
3. sw.js → v55, APP_BUILD → v55 ch21.

## Pendiente (en orden)
1. **Re-subir GCVEN02** (mes en curso y años anteriores que quieras ver) y confirmar que ABONERO sale con Raúl en Talleres.
2. ✓ HECHO en v59, y era para **Talleres** (no Ventas): ver arriba. Falta re-subir GCVEN02 y probar en navegador. (Las funciones que se creían faltantes sí existen; ver nota v57.)
3. Probar en el navegador (no pude abrirlo aquí): Configuración sin filtros y ABONERO en Talleres.
4. ✓ HECHO en v58 (falta probar en navegador).
5. Cuando se sube un documento tarda en actualizar los datos, por ejemplo Procesar y actualizar ventas
✓ 42,415 filas leídas, 39,597 aplicaron el filtro, 11,922 combinaciones SKU+sucursal guardadas en 10 mes(es). Actualizando el reporte... tardo en aparecer  Actualizando datos... para que refresque la pagina
6. ✓ HECHO en v57 (falta probar con el Excel 2023-2025).
7. ✓ HECHO en v58.
8. Sucursal ABONERO / Raúl no aparece en las gráficas (v59: ahora Talleres avisa la causa en «Para revisar»). Revisado: ABONERO no está en AGENCIAS_MOTOS ni en ZONA_POR_AGENCIA, así que con filtro global de zona/agencia queda fuera (con "Todas las agencias" sí debe verse). Si persiste: confirmar que se re-subió el GCVEN02 del mes con v56+ y qué filtro global estaba activo.
9. ✓ HECHO en v59 (falta re-subir GCVEN02 y probar): enlistado completo con filtros predeterminados en Talleres, como Inventario.
10. SUBFAMILIA y VENDEDOR (mecánico) ✓ en v59; PRODUCTO pendiente (requiere guardar el nombre del producto en Taller_Mensual).


## Cómo probar
1. Subir los 4 archivos (index.html, talleres.js, sw.js, ESTADO.md) a GitHub Pages y recargar; Configuración debe mostrar "Reporteador GC · v59 k2120 · 13-10-26".
2. Entrar a Configuración: no debe verse el selector de Agencia ni "Filtros del reporte".
3. Talleres: revisar que ABONERO aparezca con Raúl (requiere re-subir el GCVEN02, pendiente 1).
