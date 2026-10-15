# ESTADO — Reporteador GC

## Qué es
Dashboard web (PWA) de Grupo Camejo: inventario valorizado, clasificación, ventas contra objetivo y Talleres. Lo usan administración y vendedores (cada vendedor ve solo su agencia).

## Cómo está armado
- `index.html`: toda la app (Panel General, Inventario, Ventas, Talleres, Configuración).
- `exportar.js` (v70): Exportar reporte (PDF y Word). Se abre desde Configuración › Exportar reporte.
- `talleres.js`: pestaña Talleres (Timbrado y Productividad, mecánicos por sucursal).
- `sw.js`: service worker; **cada cambio sube el número de VERSION** (hoy `reporteador-v70`).
- `manifest.json` e iconos: instalación como app.
- Datos: API de Apps Script (`Código.gs`, `Talleres.gs`) vía Worker de Cloudflare; hojas DATOS / Ventas_Mensual_SKU / Taller_Mensual.
- Build visible en Configuración: `APP_BUILD` en index.html (hoy `Reporteador GC · v70 k21 · 15-10-26`). Formato: `Reporteador GC · (versión) (iniciales de la cuenta usada) · (fecha de actualización dd-mm-aa)`.

## Reglas que no se rompen
- Cada cambio sube la versión en `sw.js` y `APP_BUILD`.
- Talleres solo para administración.
- **Pestaña Ventas** = todas las ventas timbradas, a Contado (CONT) y a Crédito (CRED). Para objetivo, rotación y margen solo cuenta lo **contado** (los filtros viven en el código: `ventaAplica` y `esVentaCredito`). Panel General: contado resaltado, abajo crédito sin resaltar y abajo lo que lleva vendido en el mes en curso.
- **Pestaña Talleres** mide lo **Timbrado** (tabula CONT y CRED) y la **Productividad**.
- **Productividad**: se descarga del ERP con los mismos títulos de GCVEN02 pero distinto contenido; ahí sí aparece ABONERO. El Timbrado y la Productividad son dos descargas distintas.
- **Todo el reporte va SIN IVA** (v67). Ya no se muestra ningún importe con IVA ni hay opción para verlo así.
- **Sucursales unidas en una sola tarjeta** (`TL_SUC_UNIR` en talleres.js): SERGIO CAMEJO → CARABELA V1 (v67) y TICUL VENTO → TICUL (v68). Tus tablas dinámicas no separan al técnico por agencia. Debajo del encabezado de la tarjeta se muestra cuánto aporta cada sucursal unida («Incluye SERGIO CAMEJO $… · CARABELA V1 sola $…»).
- **Mecánicos según colaboradores.xlsx** (v68, `TL_PUESTO`): en CARABELA V1 y SERGIO CAMEJO los mecánicos son Barrero y Jorge Alejandro; Lidia Beatriz Cano Poot es GERENTE (su producción sí cuenta en los importes, pero no en el conteo de mecánicos y se rotula «(gerente)»). Victor Giovanni Pool Salazar es asesor de servicio.
- Regla de oro de Talleres: idéntica al Excel REPORTES_MANO_DE_OBRA, salvo que los importes van sin IVA (Timbrado = SUBTOTAL; Productividad = SUBTOTAL + MANO_OBRA). **MANO_OBRA no lleva IVA** (confirmado 14-oct-26); solo TOTAL lo lleva y se sustituye por SUBTOTAL. En el Excel, usar la columna «total M.O. sin IVA» = MANO_OBRA + SUBTOTAL (Barrero septiembre = $31,577.10).
- **Celular en vertical (v69)**: el encabezado se separa de la barra de estado con `env(safe-area-inset-top)` (antes el logo quedaba tapado); los paneles «Filtros del reporte» (Inventario y Talleres) ocupan como máximo la pantalla visible y hacen scroll por dentro, y sus listas de opciones se abren dentro del panel (no flotando). Medidas en `--zf-h` y `--nav-h` (script justo debajo de `APP_BUILD`).
- **Carga de datos (v69)**: las descripciones de cada bloque en Configuración se acortaron; no cambia ninguna regla de subida.
- **Pantalla de recarga (v70)**: al arrancar con sesión guardada el velo dice «Actualizando datos…» (antes «Verificando sesión…») y la barra de carga también («Pidiendo los datos al servidor…» ya no existe). El servidor sigue validando la sesión antes de mostrar datos.
- **Exportar reporte (v70, `exportar.js`)**: ya no hay botón en el menú ni en el encabezado; está en Configuración. Flujo: (1) se lee cada pestaña a un modelo; (2) paso 1: elegir temas por pestaña/subpestaña (todo marcado); (3) paso 2: vista previa con «Quitar» por tema o por página; (4) Exportar PDF o Exportar Word. El Word (.docx, librería `docx@7.8.2` desde jsDelivr, se descarga solo al pedirlo) deja textos y tablas editables y las gráficas como imagen; cada pestaña es Título 1 y cada tema Título 2. «Control interno» nunca se exporta. Talleres solo si la cuenta es admin real.
- **Cierre mensual de inventario (v70)**: ya no hay selectores de año, mes ni fecha. El mes y el día salen de la columna FECHA (V) del GCINV02; si trae varias fechas se usa la más frecuente y el aviso de confirmación muestra el mes detectado. «Ventas de un año anterior (solo totales)» se quitó de Pegar datos (la carga por archivo de años anteriores en Ventas mensuales sigue igual).
- **Ventas (v70)**: «Cumplimiento» y «Cumplimiento proyectado» se dibujan como aros (igual que el Panel General). En Por sucursal, la tarjeta queda como «Ranking de cumplimiento por agencia · mes»: gráfica de ranking y debajo la tabla (Agencia, Zona, Objetivo, Vendido, Cumpl., Obj. diario, Días lab., Proyectada, Cumpl. proy., Rezago). Se eliminó la gráfica anterior de vendido/objetivo por agencia y la tarjeta de ranking duplicada.
- **Panel General (v70)**: la tarjeta de Talleres muestra Timbrado y Productividad, cada uno con su importe (antes de IVA).
- **Talleres (v70)**: «Conciliación y puntos a revisar» solo se muestra a la cuenta admin real (`esAdminCuenta`).

## Pendiente (en orden)
1. ~~Subir el GCVEN02~~ Subido de Timbrado y Productividad (15-oct-26). Pendiente: Raúl aún no aparece en «Mecánicos por sucursal» dentro de Timbrado; probable causa: ABONERO solo existe en Productividad, no en Timbrado. Falta decidir en qué sucursal debe verse (ABONERO o BODEGA).
1b. **Rezago de la tabla mensual/trimestral (Historial de ventas)**: enero 2026 muestra rezago $78,049.47 y el cálculo manual da $75,325.32 (objetivo $603,936.21 − vendido $528,610.88). Diferencia $2,724.15. Hipótesis: «Vendido» suma todas las agencias (`vendTodo`) pero Rezago y Cumpl. solo cuentan agencias con objetivo (`vend`), así que esas ventas sin objetivo no restan. Mismo patrón en Panel General y KPIs de Ventas. Decidir criterio antes de cambiar.
2. ~~Destino de Productividad~~ Decidido (v63/v64): hoja `Productividad_Mensual` en el mismo libro de ventas (ID_SHEETS_VENTAS), mismas columnas que `Taller_Mensual`; no pisa el Timbrado. Requiere `Talleres.gs` actual y las líneas de `doPost` para `actualizarProductividadMensual` (y `obtenerTalleres`). Subir Productividad de enero a la fecha, mes por mes.
3. ~~Henry/Miguel~~ v64: son de DIRECCIÓN (colaboradores.xlsx), no mecánicos: v65: las refacciones de ABONERO YA NO se atribuyen a Raúl: se identifican como sucursal ABONERO y dentro de ella cada quien con su nombre (Raúl, Henry, Miguel; `TL_DIRECCION` solo cuentan dentro de ABONERO y no cuentan en «mecánicos»). v66: solo las REFACCIONES de ABONERO se relabelan ABONERO (`aFila`); lo demás de Raúl conserva su sucursal del ERP (BODEGA, Bajaj Valladolid…), así BODEGA sale en «por sucursal». CAMB. 2 (OLEGARIO) queda fuera de Productividad (`TL_SUC_EXCL_PROD`), no del Timbrado.
4. Probar en el navegador: Configuración sin filtros, tarjeta de ventas del Panel General (contado / crédito / lleva vendido) y ABONERO en Talleres.
5. ~~Aviso «Actualizando datos…»~~ v64: al subir Productividad ahora se muestra el aviso y se recarga el reporte al terminar (antes esa ruta no lo hacía). Probar también con Timbrado/Ventas.
6. v64: ABONERO (incluido Raúl/BODEGA) ya no se pierde con filtro global «Todas» ni con una zona (`tlAboVisible`); solo se oculta al elegir una agencia concreta. Si aún no sale: subir Timbrado y Productividad del mes con esta versión y revisar el aviso en Talleres › Cuadre.
7. Talleres › Producto sigue con 2 opciones (Servicios / INSUMO): `Taller_Mensual` no guarda el nombre del producto. Decidir si se agrega esa columna (más filas, más pesado).

## Cuadre con el Excel (verificado con la hoja DATOS, 14-oct-26)
- Productividad (tabla «Ingreso por productividad en mano de obra 2026», pestaña septiembre26): con los mismos filtros, el reporte coincide al centavo por mecánico y por mes. Septiembre: Barrero $31,577.10, Jorge Alejandro $30,747.50, Lidia $9,460.86 (total $238,034.33 sin IVA; $263,907.27 con IVA en tu Excel). Año: $2,506,794.81 sin IVA ($2,785,344.97 con IVA).
- Tu Excel trae IVA en «total M.O.» (=MANO_OBRA + TOTAL). Para compararlo sin IVA agrega en DATOS la columna «total M.O. sin IVA» = MANO_OBRA + SUBTOTAL (DATOS!$AJ2+DATOS!$S2). Timbrado = SUBTOTAL.
- Talleres tiene la tabla «Por mecánico (todas las sucursales)»: meses en filas y mecánicos en columnas, igual que la tabla dinámica; las refacciones de ABONERO (hoja «refacciones abonero») van en su propia columna.
- Timbrado: queda pendiente revisar con el mismo método (su tabla oculta a mano 285 productos y hay ≈$319 de GARANTÍAS F. VENTONET…).
- Descartado por ahora: la subida única «TIM Y PRO».

## Cómo probar
1. Subir `index.html`, `sw.js`, `talleres.js`, `exportar.js` (archivo nuevo) y `ESTADO.md` a GitHub Pages y recargar; Configuración debe mostrar «Reporteador GC · v70 k21 · 15-10-26».
   En el celular en vertical revisa: el logo se ve completo arriba; en Inventario y en Talleres, «Filtros del reporte» se puede recorrer con el dedo y cada lista (Familia, Subfamilia, Sucursal, Mecánico) muestra todas sus opciones.
2. Panel General: la tarjeta de ventas de refacciones muestra arriba el contado (resaltado), abajo «Crédito: …» y abajo «Lleva vendido en (mes): … a contado · … a crédito».
3. Configuración › Pegar datos: el selector trae «GCVEN02 … - TIMBRADO» y «GCVEN02 … - PRODUCTIVIDAD»; Productividad solo muestra la vista previa.
4. Configuración › Exportar reporte: abre «Preparando…», luego el paso 1 con todo marcado; Siguiente muestra la vista previa; Quitar saca un tema; Exportar PDF y Exportar Word descargan el archivo (el Word se abre y se puede editar).
5. Configuración › Pegar datos: el selector ya no trae «Ventas de un año anterior»; al elegir Cierre mensual no hay año/mes/fecha, y al pegar el GCINV02 la vista previa indica la fecha detectada (columna FECHA).
6. Ventas › Resumen: Cumplimiento y Cumplimiento proyectado son aros. Ventas › Por sucursal: Ranking arriba y su tabla debajo. Panel General: tarjeta de Talleres con Timbrado y Productividad.
