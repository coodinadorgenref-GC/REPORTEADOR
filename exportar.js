// ════════════════════════════════════════════════════════════
//  exportar.js · v70 · Exportar reporte (PDF o Word)
//  1) Se lee cada pestaña del Reporteador a un MODELO neutro (temas con títulos, textos, gráficas como imagen y tablas).
//  2) La persona elige qué temas incluir y los revisa en una vista previa (puede quitar los que no quiera).
//  3) Del mismo modelo se genera el PDF (jsPDF) o el Word editable (docx): textos y tablas editables, gráficas como imagen.
//  Depende de globals de index.html: cambiarVista, charts, vf, renderVentasObjetivo, tl, tlRender, MESES_ES, fgTexto,
//  sesion, esAdminCuenta, CLAVE_VISTA y PDF_SECCIONES.
// ════════════════════════════════════════════════════════════
const EXP = { visible: el => el.getClientRects().length > 0 };   // se puede sustituir en pruebas
const EXP_GRIS = [100, 116, 139];
const EXP_MAX_FILAS = 300;
const EXP_VALOR_KPI = 'p[class*="text-2xl"], p[class*="text-xl"]';

const expNorm = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const expEsc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Helvetica del PDF no trae estos símbolos; en Word sí se conservan tal cual.
const expLimpia = t => String(t == null ? '' : t).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/[▲▼]/g, '').replace(/[—–]/g, '-').replace(/…/g, '...');
const expRgb = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [+m[1], +m[2], +m[3]] : [148, 163, 184]; };
const expHex = rgb => rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

// ── 1) Lectura de la pantalla ───────────────────────────────
function expLeerLeyenda(n) {
  let items = [...n.querySelectorAll('.leyenda-item')].filter(EXP.visible).map(el => {
    const pu = el.querySelector('.punto'), b = el.querySelector('b'), c = el.cloneNode(true);
    c.querySelectorAll('b, .punto').forEach(x => x.remove());
    return { color: expRgb(pu ? getComputedStyle(pu).backgroundColor : ''), etq: expNorm(c.textContent), pct: b ? expNorm(b.textContent) : '' };
  }).filter(i => i.etq);
  if (!items.length) items = [...n.children].map(x => expNorm(x.textContent)).filter(Boolean).map(t => ({ color: null, etq: t, pct: '' }));
  return items.length ? items : null;
}

function expTextoCelda(c) {
  const k = c.cloneNode(true);
  k.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  return String(k.textContent || '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
function expTipoFila(tr) {
  const c = tr.classList;
  return c.contains('vt-tri') ? 'tri' : c.contains('vt-sub') ? 'sub' : (c.contains('vt-tot') || c.contains('fila-total')) ? 'tot' : c.contains('vt-dest') ? 'dest' : c.contains('mv-ags') ? 'ags' : '';
}
function expLeerTabla(tb) {
  const copia = tb.cloneNode(true), host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1200px';
  host.appendChild(copia); document.body.appendChild(host);
  try {
    // Celdas con varias líneas (ej. "$167,896.90" y debajo "obj $206,896.55 · 81.2%"): se separan con saltos de línea.
    copia.querySelectorAll('td, th').forEach(c => {
      const chips = c.querySelectorAll('span.inline-flex');
      if (chips.length) { c.textContent = 'Lo venden:  ' + [...chips].map(s => s.textContent.replace(/\s+/g, ' ').trim()).join('   |   '); return; }
      if (c.querySelector('div, p')) c.innerHTML = c.innerHTML.replace(/<(div|p)[^>]*>/gi, '<br>').replace(/<\/(div|p)>/gi, '').replace(/^\s*<br>/i, '');
    });
    const celda = c => ({ c: expTextoCelda(c), span: c.colSpan > 1 ? c.colSpan : 1, color: (c.dataset && c.dataset.color) || '' });
    const head = copia.tHead ? [...copia.tHead.rows].map(r => [...r.cells].map(celda)) : [];
    let filas = []; [...copia.tBodies].forEach(tbd => filas.push(...tbd.rows));
    if (copia.tFoot) filas.push(...copia.tFoot.rows);
    const total = filas.length;
    if (total > EXP_MAX_FILAS) filas = filas.slice(0, EXP_MAX_FILAS);
    return { k: 'tab', head, body: filas.map(r => ({ tipo: expTipoFila(r), celdas: [...r.cells].map(celda) })), total, recortada: total > EXP_MAX_FILAS };
  } finally { host.remove(); }
}

const expEsInterno = c => c.id === 'vs-semana' || /control interno/i.test((c.querySelector('h3') || {}).textContent || '');   // lo de "control interno" no se exporta
const expEsKpi = c => !c.querySelector('canvas, table, h3') && !!c.querySelector(EXP_VALOR_KPI);
function expDatosKpi(c) {
  const valores = [...c.querySelectorAll(EXP_VALOR_KPI)].filter(EXP.visible), ps = [...c.querySelectorAll('p.card-s')].filter(EXP.visible);
  const etiquetas = new Set(valores.length > 1 ? valores.map(v => v.previousElementSibling).filter(Boolean) : []);   // tarjeta con varios importes (p. ej. Talleres: Timbrado y Productividad)
  const titulo = ps.length ? ps[0].textContent.trim() : '';
  const det = ps.slice(1).filter(p => !etiquetas.has(p)).map(p => p.textContent.trim()).filter(Boolean).join(' · ');
  const val = valores.length > 1
    ? valores.map(v => { const p = v.previousElementSibling; return (p && etiquetas.has(p) ? p.textContent.trim() + ': ' : '') + v.textContent.trim(); }).join('\n')
    : (valores[0] ? valores[0].textContent.trim() : '');
  return [titulo, val + (det ? '\n' + det : '')];
}

// Una tarjeta (.card) = un tema. Se conserva la lógica del PDF anterior: el título y sus notas viajan pegados a la primera gráfica o tabla.
function expLeerCard(c) {
  const h3 = c.querySelector('h3'), tituloCard = h3 ? expNorm(h3.textContent) : '';
  const items = [], leyHechas = new Set();
  let tituloPend = '', tituloMostrado = false, notasPend = [], conGrafica = !!c.querySelector('canvas, table');
  const emitir = () => {
    if (!tituloPend && !tituloMostrado && tituloCard) tituloPend = tituloCard;
    if (!tituloPend) return;
    items.push({ k: 'tit', t: tituloPend });
    notasPend.forEach(n => items.push({ k: 't', t: n, nota: true }));
    tituloPend = ''; notasPend = []; tituloMostrado = true;
  };
  const rec = n => {
    if (n.nodeType !== 1 || !EXP.visible(n)) return;
    const t = n.tagName;
    if (['BUTTON', 'INPUT', 'SELECT', 'SCRIPT', 'STYLE'].includes(t)) return;
    if (t === 'CANVAS') {
      if (!n.width || !n.height) return;
      const cd = n.closest('.card'), lg = cd && cd.querySelector('[id^="leyenda"]');
      const ley = (lg && EXP.visible(lg) && !leyHechas.has(lg)) ? expLeerLeyenda(lg) : null;
      emitir();
      items.push({ k: 'img', src: n.toDataURL('image/png'), pw: n.width, ph: n.height, cssW: n.getBoundingClientRect().width || n.width, ley });
      if (lg && ley) leyHechas.add(lg);
      conGrafica = false; return;
    }
    if (t === 'TABLE') {
      const tb = expLeerTabla(n); emitir(); items.push(tb);
      if (tb.recortada) items.push({ k: 't', t: 'Se muestran las primeras ' + EXP_MAX_FILAS + ' de ' + tb.total.toLocaleString('es-MX') + ' filas. Para el detalle completo usa "Exportar SKU visibles (CSV)" en Inventario.' });
      conGrafica = false; return;
    }
    if (/^leyenda/.test(n.id || '')) {
      if (leyHechas.has(n)) return;
      const cd = n.closest('.card'); if (cd && cd.querySelector('canvas')) return;   // se dibuja como pie de su gráfica
      const ley = expLeerLeyenda(n); if (!ley) return;
      emitir(); items.push({ k: 'ley', items: ley }); leyHechas.add(n); return;
    }
    if (t === 'H3') { if (tituloPend) emitir(); tituloPend = expNorm(n.textContent); return; }
    if (n.classList && n.classList.contains('aro-v')) {   // valor (%) dentro de un aro de cumplimiento
      const tx = expNorm(n.textContent); if (tx) { emitir(); items.push({ k: 't', t: tx, tam: 15, b: true }); } return;
    }
    if (t === 'P') {
      const tx = expNorm(n.textContent); if (!tx) return;
      if (conGrafica && (tituloPend || (tituloCard && !tituloMostrado))) { notasPend.push(tx); return; }   // la nota viaja junto con el título y su gráfica
      emitir(); items.push({ k: 't', t: tx }); return;
    }
    [...n.children].forEach(rec);
  };
  rec(c); emitir();
  if (!items.length) return null;
  const alt = items.find(i => i.k === 't'), titulo = tituloCard || (alt ? alt.t.slice(0, 70) : (items.some(i => i.k === 'img') ? 'Gráfica' : 'Tabla'));
  return { titulo, items };
}
function expLeerContenedor(cont) {
  const temas = []; let kpis = [], padre = null;
  const vaciar = () => { if (kpis.length) { temas.push({ titulo: 'Indicadores', items: [{ k: 'kpis', head: kpis.map(x => x[0]), body: kpis.map(x => x[1]) }] }); kpis = []; } };
  [...cont.querySelectorAll('.card')].filter(c => EXP.visible(c) && !c.parentElement.closest('.card') && !expEsInterno(c)).forEach(c => {
    if (expEsKpi(c)) { if (padre && c.parentElement !== padre) vaciar(); padre = c.parentElement; kpis.push(expDatosKpi(c)); return; }
    vaciar(); padre = null;
    const t = expLeerCard(c); if (t) temas.push(t);
  });
  vaciar();
  return temas;
}

// Recorre las pestañas (como el PDF anterior) y devuelve el modelo { secciones: [{ id, clave, titulo, sub, color, notas, temas: [{ id, titulo, items, incluir }] }] }.
async function expCapturar(claves, avance, cancelado) {
  let ini = ['general'];
  try { ini = (sessionStorage.getItem(CLAVE_VISTA) || 'general').split(':'); } catch (e) {}
  const vfSubIni = vf.sub, vfResIni = vf.res;
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  // Gráficas con el doble de resolución mientras se captura (se restaura al terminar).
  const refrescar = async () => { Object.values(charts).forEach(c => { try { c.options.devicePixelRatio = 2; c.resize(); } catch (e) {} }); await esperar(350); };
  const secciones = []; let nT = 0;
  const agregar = (clave, sub, notas, cont) => {
    const s = PDF_SECCIONES[clave], temas = expLeerContenedor(cont).map(t => Object.assign(t, { id: 't' + (++nT), incluir: true }));
    secciones.push({ id: 's' + (secciones.length + 1), clave, titulo: s.titulo, sub: sub || '', color: s.color, notas, temas, incluir: true });
  };
  const paso = async (txt) => { if (cancelado()) throw new Error('cancelado'); if (avance) avance(txt); await esperar(0); };
  try {
    for (const k of claves) {
      if (k === 'general') {
        await paso('Panel General…'); cambiarVista('general'); await refrescar();
        agregar('general', '', [{ t: 'Filtro global · ' + fgTexto() }], document.getElementById('vista-general'));
      }
      if (k === 'inventario') {
        for (const [sub, nombre, id] of [['resumen', 'Resumen', 'vista-dashboard'], ['sucursal', 'Por sucursal', 'vista-inventario']]) {
          await paso('Inventario · ' + nombre + '…'); cambiarVista('inventario', sub); await refrescar();
          const notas = [{ t: 'Filtro global · ' + fgTexto() }], xb = document.getElementById('barra-xf');
          if (xb && EXP.visible(xb)) notas.push({ t: expNorm(xb.innerText), azul: true });
          agregar('inventario', nombre, notas, document.getElementById(id));
        }
      }
      if (k === 'ventas') {
        await paso('Ventas…'); cambiarVista('ventas');
        vf.res = 'todos';   // se incluyen las dos gráficas de Resumen
        for (const [sub, nombre] of [['resumen', 'Resumen'], ['sucursal', 'Por sucursal'], ['masvendidas', 'Más vendidas']]) {
          await paso('Ventas · ' + nombre + '…'); vf.sub = sub; renderVentasObjetivo(); await refrescar();
          agregar('ventas', nombre, [{ t: 'Agencias de motos · Refacciones · Zona: ' + (vf.zona === 'TODAS' ? 'todas' : vf.zona) + ' · Agencia: ' + (vf.ag === 'TODAS' ? 'todas' : vf.ag) }], document.getElementById('vs-' + sub));
        }
      }
      if (k === 'talleres') {
        const tlPrev = tl.sub;
        try {
          for (const [sub, nombre] of [['timbrado', 'Timbrado'], ['productividad', 'Productividad']]) {
            await paso('Talleres · ' + nombre + '…'); cambiarVista('talleres'); tl.sub = sub; tlRender(); await refrescar();
            agregar('talleres', nombre, [{ t: 'Importes antes de IVA · ' + (tl.mes ? MESES_ES[tl.mes - 1] + ' ' : 'Año ') + tl.anio + ' · Filtro global: ' + fgTexto() }], document.getElementById('vista-talleres'));
          }
        } finally { tl.sub = tlPrev; tlRender(); }
      }
    }
  } finally {
    Object.values(charts).forEach(c => { try { c.options.devicePixelRatio = window.devicePixelRatio || 1; c.resize(); } catch (e) {} });
    vf.sub = vfSubIni; vf.res = vfResIni; renderVentasObjetivo(); cambiarVista(ini[0], ini[1]);
  }
  return { secciones: secciones.filter(s => s.temas.length) };
}

// Lo que realmente se exporta: secciones y temas que siguen marcados.
function expSeleccion(modelo) {
  return modelo.secciones.filter(s => s.incluir !== false).map(s => Object.assign({}, s, { temas: s.temas.filter(t => t.incluir !== false) })).filter(s => s.temas.length);
}
const expContar = modelo => expSeleccion(modelo).reduce((n, s) => n + s.temas.length, 0);

// ── 2) PDF (jsPDF + autoTable) ──────────────────────────────
function expRenderPDF(modelo) {
  const secs = expSeleccion(modelo);
  if (!secs.length) throw new Error('No hay temas seleccionados.');
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), TOP = 46, BOT = 34, GRIS = EXP_GRIS, limpia = expLimpia;
  const paginas = {}, indice = [];
  let etiqueta = { texto: 'Reporteador GC', color: [51, 65, 85] }, y = TOP, yBase = 0, pagBase = 0;
  const marcar = () => { paginas[doc.internal.getNumberOfPages()] = etiqueta; };
  const nueva = () => { doc.addPage(); y = TOP; marcar(); };
  const hace = h => { if (y + h > H - BOT) nueva(); };

  const texto = (t, tam, rgb, negrita) => {
    t = limpia(t).replace(/\s+/g, ' ').trim(); if (!t) return;
    doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const l = doc.splitTextToSize(t, W - 80), alto = l.length * (tam + 2) + 4;
    hace(alto); doc.text(l, 40, y + tam); y += alto;
  };
  const altoTexto = (t, tam, negrita) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(tam);
    return doc.splitTextToSize(limpia(t).replace(/\s+/g, ' ').trim(), W - 80).length * (tam + 2) + 4;
  };

  // Título de cada gráfica/tabla: nunca se queda solo al final de una página (se pasa junto con lo que le sigue).
  let tituloPend = '', notasPend = [];
  const conTitulo = alto => {
    if (!tituloPend) return;
    const extra = notasPend.reduce((a, n) => a + altoTexto(n, 8), 0);
    hace(altoTexto(tituloPend, 11, true) + extra + alto);
    const t = tituloPend, notas = notasPend; tituloPend = ''; notasPend = [];
    texto(t, 11, [15, 23, 42], true);
    notas.forEach(n => texto(n, 8, GRIS));
  };

  // Leyenda de una gráfica como PIE: punto de color + nombre en texto oscuro + % en negritas, centrada y en 10 pt.
  const LEY_TAM = 10, LEY_FILA = 18, LEY_GAP = 18;
  const maquetarLeyenda = lista => {
    const items = lista.map(i => ({ color: i.color, etq: limpia(i.etq), pct: limpia(i.pct) }));
    items.forEach(i => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(LEY_TAM); let w = doc.getTextWidth(i.etq) + (i.color ? 14 : 0);
      if (i.pct) { doc.setFont('helvetica', 'bold'); w += 5 + doc.getTextWidth(i.pct); }
      i.w = w;
    });
    const filas = []; let fila = [], ancho = 0;
    items.forEach(i => {
      const nuevo = ancho + (fila.length ? LEY_GAP : 0) + i.w;
      if (fila.length && nuevo > W - 80) { filas.push({ items: fila, w: ancho }); fila = []; ancho = 0; }
      ancho += (fila.length ? LEY_GAP : 0) + i.w; fila.push(i);
    });
    if (fila.length) filas.push({ items: fila, w: ancho });
    return { filas, alto: filas.length * LEY_FILA + 8 };
  };
  const dibujarLeyenda = ley => {
    y += 4;
    ley.filas.forEach(f => {
      let x = (W - f.w) / 2; const base = y + LEY_TAM + 2;
      f.items.forEach(i => {
        if (i.color) { doc.setFillColor(i.color[0], i.color[1], i.color[2]); doc.circle(x + 4.5, base - 3.5, 4.5, 'F'); x += 14; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(LEY_TAM); doc.setTextColor(30, 41, 59); doc.text(i.etq, x, base); x += doc.getTextWidth(i.etq);
        if (i.pct) { x += 5; doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42); doc.text(i.pct, x, base); x += doc.getTextWidth(i.pct); }
        x += LEY_GAP;
      });
      y += LEY_FILA;
    });
    y += 4;
  };

  const tab = o => {
    doc.autoTable(Object.assign({
      startY: y, theme: 'grid', styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { top: TOP, left: 40, right: 40, bottom: BOT }, didDrawPage: marcar
    }, o));
    y = doc.lastAutoTable.finalY + 14;
  };
  const FILL = { tri: [224, 231, 255], sub: [226, 232, 240], tot: [203, 213, 225], dest: [219, 234, 254], ags: [219, 234, 254] };
  const tablaModelo = it => {
    const colorCol = {};   // índice de columna -> [r,g,b] (solo tablas cuyos encabezados traen color)
    const head = it.head.map(r => { let idx = 0; return r.map(c => {
      const o = { content: limpia(c.c), colSpan: c.span || 1 };
      if (c.color) { const hx = c.color.replace('#', ''), rgb = [0, 2, 4].map(i => parseInt(hx.substr(i, 2), 16)); colorCol[idx] = rgb; o.styles = { fillColor: rgb, textColor: (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? [15, 23, 42] : [255, 255, 255] }; }
      idx += o.colSpan; return o; }); });
    const body = it.body.map(r => { let idx = 0; return r.celdas.map(c => {
      const o = { content: limpia(c.c), colSpan: c.span || 1 }, f = FILL[r.tipo];
      if (f) { o.styles = { fillColor: f }; if (r.tipo !== 'ags') o.styles.fontStyle = 'bold'; }
      else if (colorCol[idx]) o.styles = { fillColor: colorCol[idx].map(v => Math.round(v * 0.13 + 255 * 0.87)) };
      idx += o.colSpan; return o; }); });
    return { head, body };
  };

  // Gráfica centrada, con su título justo arriba y al tamaño real que tiene en pantalla.
  const imagen = it => {
    const ley = it.ley ? maquetarLeyenda(it.ley) : null, altoLey = ley ? ley.alto : 0;
    const cssW = it.cssW || it.pw;
    let w = Math.min(W - 80, Math.max(260, cssW * 0.8)), h = w * it.ph / it.pw;
    // Alto que ocupan título + notas pendientes + leyenda: el área para la gráfica es lo que sobra de la página.
    const cab = (tituloPend ? altoTexto(tituloPend, 11, true) + notasPend.reduce((a, n) => a + altoTexto(n, 8), 0) : 0) + altoLey + 14;
    const maxPag = H - TOP - BOT - cab, libre = H - BOT - y - cab;
    const vacia = doc.getNumberOfPages() === pagBase && y <= yBase + 1;   // la página solo trae el encabezado de la sección
    let hFin = Math.min(h, maxPag);
    if (hFin > libre && libre >= hFin * (vacia ? 0.5 : 0.8)) hFin = libre;   // se encoge para quedarse en esta página
    if (hFin < h) { w = w * hFin / h; h = hFin; }
    conTitulo(h + altoLey + 10); hace(h + altoLey + 10);
    doc.addImage(it.src, 'PNG', (W - w) / 2, y, w, h, undefined, 'FAST'); y += h + 8;
    if (ley) dibujarLeyenda(ley);
  };

  const dibujar = it => {
    if (it.k === 'tit') { if (tituloPend) conTitulo(0); tituloPend = it.t; return; }
    if (it.k === 't') {
      if (it.nota) { notasPend.push(it.t); return; }
      conTitulo(altoTexto(it.t, it.tam || 8, it.b)); texto(it.t, it.tam || 8, it.b ? [15, 23, 42] : GRIS, it.b); return;
    }
    if (it.k === 'img') { imagen(it); return; }
    if (it.k === 'tab') { conTitulo(70); hace(50); tab(tablaModelo(it)); return; }
    if (it.k === 'kpis') { hace(50); tab({ head: [it.head.map(limpia)], body: [it.body.map(limpia)], styles: { fontSize: 8, cellPadding: 4 } }); return; }
    if (it.k === 'ley') { const ley = maquetarLeyenda(it.items); conTitulo(ley.alto); hace(ley.alto); dibujarLeyenda(ley); }
  };

  // Página nueva con el nombre y el color de la pestaña; además alimenta el índice.
  const seccion = s => {
    etiqueta = { texto: s.titulo.toUpperCase() + (s.sub ? '  ·  ' + s.sub : ''), color: s.color };
    doc.addPage(); y = TOP; marcar();
    const pag = doc.internal.getNumberOfPages();
    if (!indice.some(e => e.clave === s.clave && e.nivel === 0)) indice.push({ clave: s.clave, color: s.color, nivel: 0, titulo: s.titulo, pagina: pag });
    if (s.sub) indice.push({ clave: s.clave, color: s.color, nivel: 1, titulo: s.sub, pagina: pag });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(s.color[0], s.color[1], s.color[2]);
    doc.text(limpia(s.titulo + (s.sub ? ' - ' + s.sub : '')), 40, y + 16); y += 32;
  };

  // Portada con índice (se dibuja al final, cuando ya se conocen las páginas de cada tema).
  const portada = () => {
    doc.setPage(1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(15, 23, 42); doc.text('Reporteador GC', 40, 96);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    doc.text(limpia('Importes antes de IVA · ' + new Date().toLocaleString('es-MX') + (typeof sesion !== 'undefined' && sesion && (sesion.nombre || sesion.correo) ? ' · ' + (sesion.nombre || sesion.correo) : '')), 40, 114);
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.8); doc.line(40, 128, W - 40, 128);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(51, 65, 85); doc.text('ÍNDICE', 40, 154);
    let yy = 182;
    indice.forEach(e => {
      const s = e, sub = e.nivel === 1, xt = sub ? 84 : 62, tam = sub ? 11 : 13;
      if (!sub) { if (e.nivel === 0 && yy > 182) yy += 8; doc.setFillColor(s.color[0], s.color[1], s.color[2]); doc.rect(40, yy - 11, 13, 13, 'F'); }
      else { doc.setFillColor(s.color[0], s.color[1], s.color[2]); doc.circle(72, yy - 4, 2, 'F'); }
      doc.setFont('helvetica', sub ? 'normal' : 'bold'); doc.setFontSize(tam); doc.setTextColor(15, 23, 42);
      const t = limpia(e.titulo); doc.text(t, xt, yy);
      const pg = String(e.pagina), wPg = doc.getTextWidth(pg), xIni = xt + doc.getTextWidth(t) + 6, xFin = W - 40 - wPg - 6;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
      const nP = Math.max(0, Math.floor((xFin - xIni) / doc.getTextWidth('.')));
      if (nP > 0) doc.text('.'.repeat(nP), xIni, yy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42); doc.text(pg, W - 40, yy, { align: 'right' });
      doc.link(40, yy - tam, W - 80, tam + 6, { pageNumber: e.pagina });
      yy += sub ? 21 : 27;
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    doc.text('Haz clic en un tema del índice para ir a su página.', 40, H - 40);
  };

  paginas[1] = etiqueta;
  secs.forEach(s => {
    seccion(s);
    (s.notas || []).forEach(n => texto(n.t, 8, n.azul ? [37, 99, 235] : GRIS));
    yBase = y; pagBase = doc.getNumberOfPages();
    s.temas.forEach(t => { tituloPend = ''; notasPend = []; t.items.forEach(dibujar); conTitulo(0); });
  });
  portada();
  // Encabezado de color por pestaña, enlace al índice y numeración en todas las páginas.
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    const e = paginas[p] || { texto: 'Reporteador GC', color: [51, 65, 85] };
    doc.setPage(p);
    doc.setFillColor(e.color[0], e.color[1], e.color[2]); doc.rect(0, 0, W, 24, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.text(limpia(e.texto), 40, 16);
    doc.setFont('helvetica', 'normal');
    const pie = 'Página ' + p + ' de ' + total;
    doc.text(pie, W - 40, 16, { align: 'right' });
    if (p > 1) { const x = W - 40 - doc.getTextWidth(pie) - 24; doc.text('Índice', x, 16, { align: 'right' }); doc.link(x - doc.getTextWidth('Índice'), 4, doc.getTextWidth('Índice'), 16, { pageNumber: 1 }); }
  }
  return doc;
}

// ── 3) Word (.docx) ─────────────────────────────────────────
// Textos y tablas quedan como contenido editable de Word; las gráficas van como imagen. Cada pestaña empieza en página nueva
// con un título de nivel 1 y cada tema con uno de nivel 2 (sirven para el panel de navegación de Word).
function expB64aBytes(src) {
  const b64 = String(src).replace(/^data:[^,]*,/, '');
  if (typeof atob === 'function') { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
function expRenderWord(modelo, lib) {
  const secs = expSeleccion(modelo);
  if (!secs.length) return Promise.reject(new Error('No hay temas seleccionados.'));
  const D = lib || window.docx;
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, HeadingLevel, AlignmentType, PageOrientation, Header, Footer, PageNumber } = D;
  const GRIS = expHex(EXP_GRIS), hoy = new Date().toLocaleString('es-MX');
  const kids = [];
  const par = (t, o) => new Paragraph({ spacing: { before: (o && o.antes) || 0, after: (o && o.despues) != null ? o.despues : 80 }, alignment: o && o.centro ? AlignmentType.CENTER : undefined,
    children: [new TextRun({ text: String(t), size: ((o && o.tam) || 9) * 2, bold: !!(o && o.b), color: (o && o.color) || '0F172A' })] });
  const lineas = (t, o) => String(t).split('\n').map((l, i) => new TextRun({ text: l, break: i ? 1 : 0, size: o.size, bold: o.bold, color: o.color }));

  kids.push(new Paragraph({ spacing: { before: 600, after: 120 }, children: [new TextRun({ text: 'Reporteador GC', bold: true, size: 56, color: '0F172A' })] }));
  kids.push(par('Importes antes de IVA · ' + hoy + (typeof sesion !== 'undefined' && sesion && (sesion.nombre || sesion.correo) ? ' · ' + (sesion.nombre || sesion.correo) : ''), { color: GRIS, tam: 10, despues: 240 }));
  kids.push(par('CONTENIDO', { b: true, tam: 13, color: '334155', despues: 120 }));
  secs.forEach(s => {
    kids.push(par(s.titulo + (s.sub ? ' · ' + s.sub : ''), { b: true, tam: 12, color: expHex(s.color), antes: 80, despues: 40 }));
    s.temas.forEach(t => kids.push(par('   •  ' + t.titulo, { tam: 10, color: '334155', despues: 20 })));
  });
  kids.push(par('Todo el contenido es editable: puedes borrar o escribir sobre cualquier texto o tabla. Las gráficas son imágenes.', { color: GRIS, tam: 9, antes: 240 }));

  const celda = (c, o) => new TableCell({
    columnSpan: c.span > 1 ? c.span : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    children: [new Paragraph({ children: lineas(c.c, { size: 16, bold: !!o.b, color: o.color || '0F172A' }) })]
  });
  const tabla = it => {
    const colorCol = {}, rows = [];
    it.head.forEach(r => { let idx = 0; rows.push(new TableRow({ tableHeader: true, children: r.map(c => {
      let fill = '334155', color = 'FFFFFF';
      if (c.color) { const hx = c.color.replace('#', ''), rgb = [0, 2, 4].map(i => parseInt(hx.substr(i, 2), 16)); colorCol[idx] = rgb; fill = expHex(rgb); color = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? '0F172A' : 'FFFFFF'; }
      idx += c.span || 1; return celda(c, { fill, color, b: true }); }) })); });
    const FILL = { tri: 'E0E7FF', sub: 'E2E8F0', tot: 'CBD5E1', dest: 'DBEAFE', ags: 'DBEAFE' };
    it.body.forEach(r => { let idx = 0; rows.push(new TableRow({ children: r.celdas.map(c => {
      let fill = FILL[r.tipo] || null; const b = !!FILL[r.tipo] && r.tipo !== 'ags';
      if (!fill && colorCol[idx]) fill = expHex(colorCol[idx].map(v => v * 0.13 + 255 * 0.87));
      idx += c.span || 1; return celda(c, { fill, b }); }) })); });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
  };
  const tablaKpis = it => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ tableHeader: true, children: it.head.map(h => celda({ c: h, span: 1 }, { fill: '334155', color: 'FFFFFF', b: true })) }),
    new TableRow({ children: it.body.map(v => celda({ c: v, span: 1 }, {})) })] });

  secs.forEach(s => {
    const col = expHex(s.color);
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 120 }, children: [new TextRun({ text: s.titulo + (s.sub ? ' - ' + s.sub : ''), bold: true, size: 36, color: col })] }));
    (s.notas || []).forEach(n => kids.push(par(n.t, { tam: 8, color: n.azul ? '2563EB' : GRIS, despues: 40 })));
    s.temas.forEach(t => {
      t.items.forEach(it => {
        if (it.k === 'tit') kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, keepNext: true, children: [new TextRun({ text: it.t, bold: true, size: 24, color: '0F172A' })] }));
        else if (it.k === 't') kids.push(par(it.t, { tam: it.tam || 8, b: it.b, color: it.b ? '0F172A' : GRIS, despues: 60 }));
        else if (it.k === 'img') {
          const w = Math.round(Math.min(900, Math.max(320, (it.cssW || it.pw) * 0.95))), h = Math.round(w * it.ph / it.pw);
          kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [new ImageRun({ data: expB64aBytes(it.src), transformation: { width: w, height: h } })] }));
          if (it.ley) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: it.ley.flatMap(i => [
            new TextRun({ text: i.color ? '● ' : '', color: i.color ? expHex(i.color) : '0F172A', size: 20 }),
            new TextRun({ text: i.etq, size: 20, color: '1E293B' }),
            new TextRun({ text: i.pct ? ' ' + i.pct : '', bold: true, size: 20, color: '0F172A' }),
            new TextRun({ text: '      ', size: 20 })]) }));
        }
        else if (it.k === 'ley') kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: it.items.flatMap(i => [
          new TextRun({ text: i.color ? '● ' : '', color: i.color ? expHex(i.color) : '0F172A', size: 20 }),
          new TextRun({ text: i.etq + (i.pct ? ' ' + i.pct : '') + '      ', size: 20, color: '1E293B' })]) }));
        else if (it.k === 'tab') { kids.push(tabla(it)); kids.push(par('', { despues: 120 })); }
        else if (it.k === 'kpis') { kids.push(tablaKpis(it)); kids.push(par('', { despues: 120 })); }
      });
    });
  });

  const doc = new Document({
    creator: 'Reporteador GC', title: 'Reporteador GC',
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Reporteador GC · importes antes de IVA', size: 16, color: GRIS })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 16, color: GRIS })] })] }) },
      children: kids
    }]
  });
  return Packer.toBlob ? Packer.toBlob(doc) : Packer.toBuffer(doc);
}

// ── 4) Ventana de exportación: elegir temas → vista previa → PDF o Word ──
const expEstado = arr => { const n = arr.filter(Boolean).length; return n === 0 ? 0 : n === arr.length ? 1 : 2; };   // 0 ninguno · 1 todos · 2 algunos

function expHtmlSeleccion(modelo) {
  const claves = []; modelo.secciones.forEach(s => { if (!claves.includes(s.clave)) claves.push(s.clave); });
  const ck = (tipo, id, est) => '<input type="checkbox" data-exp="' + tipo + '" data-id="' + id + '"' + (est === 1 ? ' checked' : '') + (est === 2 ? ' data-mixto="1"' : '') + '>';
  return claves.map(cl => {
    const ss = modelo.secciones.filter(s => s.clave === cl), col = ss[0].color, todos = ss.flatMap(s => s.temas.map(t => t.incluir !== false));
    let h = '<div class="mb-4"><label class="flex items-center gap-2 py-1 cursor-pointer">' + ck('tab', cl, expEstado(todos))
      + '<span style="width:10px;height:10px;border-radius:2px;background:rgb(' + col.join(',') + ')"></span><span class="text-sm font-medium text-slate-900">' + expEsc(ss[0].titulo) + '</span>'
      + '<span class="card-s">(' + todos.filter(Boolean).length + ' de ' + todos.length + ' temas)</span></label>';
    ss.forEach(s => {
      if (s.sub) h += '<label class="flex items-center gap-2 py-1 pl-6 cursor-pointer">' + ck('sec', s.id, expEstado(s.temas.map(t => t.incluir !== false))) + '<span class="text-sm font-medium text-slate-700">' + expEsc(s.sub) + '</span></label>';
      s.temas.forEach(t => { h += '<label class="flex items-start gap-2 py-0.5 cursor-pointer ' + (s.sub ? 'pl-12' : 'pl-6') + '">' + ck('tema', t.id, t.incluir !== false ? 1 : 0).replace('<input ', '<input class="mt-1" ') + '<span class="text-sm text-slate-600">' + expEsc(t.titulo) + '</span></label>'; });
    });
    return h + '</div>';
  }).join('');
}

function expHtmlTabla(it) {
  const MAX = 6, c = x => '<td class="border border-slate-200 px-1.5 py-0.5 align-top" colspan="' + (x.span || 1) + '" style="white-space:pre-line">' + expEsc(x.c) + '</td>';
  const cab = it.head.map(r => '<tr>' + r.map(x => '<th class="border border-slate-200 px-1.5 py-0.5 bg-slate-100 text-left" colspan="' + (x.span || 1) + '">' + expEsc(x.c) + '</th>').join('') + '</tr>').join('');
  const cuerpo = it.body.slice(0, MAX).map(r => '<tr' + (r.tipo ? ' class="font-medium bg-slate-50"' : '') + '>' + r.celdas.map(c).join('') + '</tr>').join('');
  const mas = it.body.length > MAX ? '<p class="card-s mt-1">… y ' + (it.total - MAX) + ' fila(s) más</p>' : '';
  return '<div class="overflow-auto" style="max-height:190px"><table class="text-[11px] w-full border-collapse">' + cab + cuerpo + '</table></div>' + mas;
}
function expHtmlItem(it, tema) {
  if (it.k === 'tit') return it.t === tema.titulo ? '' : '<p class="text-xs font-medium text-slate-800">' + expEsc(it.t) + '</p>';
  if (it.k === 't') return '<p class="' + (it.b ? 'text-sm font-medium text-slate-900' : 'card-s') + '">' + expEsc(it.t) + '</p>';
  const ley = l => '<p class="card-s text-center">' + l.map(i => (i.color ? '<span style="color:rgb(' + i.color.join(',') + ')">●</span> ' : '') + expEsc(i.etq) + (i.pct ? ' <b>' + expEsc(i.pct) + '</b>' : '')).join(' &nbsp; ') + '</p>';
  if (it.k === 'img') return '<img src="' + it.src + '" alt="" style="display:block;margin:0 auto;max-width:100%;max-height:230px">' + (it.ley ? ley(it.ley) : '');
  if (it.k === 'ley') return ley(it.items);
  if (it.k === 'tab') return expHtmlTabla(it);
  if (it.k === 'kpis') return expHtmlTabla({ head: [it.head.map(x => ({ c: x }))], body: [{ tipo: '', celdas: it.body.map(x => ({ c: x })) }], total: 1 });
  return '';
}
function expHtmlVista(modelo) {
  const secs = expSeleccion(modelo);
  if (!secs.length) return '<p class="card-s py-8 text-center">No quedó ningún tema. Regresa al paso 1 y elige al menos uno.</p>';
  return secs.map(s => {
    let h = '<div class="mb-5"><div class="flex items-center justify-between gap-2 px-3 py-2 rounded-t-lg text-white text-sm font-medium" style="background:rgb(' + s.color.join(',') + ')"><span>' + expEsc(s.titulo + (s.sub ? ' · ' + s.sub : '')) + '</span>'
      + '<button type="button" data-exp-del="sec" data-id="' + s.id + '" class="text-xs underline shrink-0">Quitar esta página</button></div><div class="border border-slate-200 border-t-0 rounded-b-lg divide-y divide-slate-100">';
    (s.notas || []).forEach(n => { h += '<p class="card-s px-3 pt-2">' + expEsc(n.t) + '</p>'; });
    s.temas.forEach(t => {
      h += '<div class="p-3"><div class="flex items-start justify-between gap-2"><p class="text-sm font-medium text-slate-900">' + expEsc(t.titulo) + '</p>'
        + '<button type="button" data-exp-del="tema" data-id="' + t.id + '" title="Quitar este tema del reporte" class="shrink-0 text-xs text-red-600 border border-red-200 rounded px-2 py-0.5">Quitar</button></div>'
        + '<div class="mt-2 space-y-2">' + t.items.map(i => expHtmlItem(i, t)).join('') + '</div></div>';
    });
    return h + '</div></div>';
  }).join('');
}

function expCargarDocx() {   // la librería de Word solo se descarga cuando se pide un Word
  if (window.docx) return Promise.resolve();
  return new Promise((ok, mal) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/docx@7.8.2/build/index.js';
    sc.onload = () => window.docx ? ok() : mal(new Error('La librería de Word no cargó bien.'));
    sc.onerror = () => mal(new Error('No se pudo descargar la librería de Word. Revisa tu conexión e inténtalo de nuevo.'));
    document.head.appendChild(sc);
  });
}
function expDescargar(blob, nombre) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

async function abrirExportar() {
  if (document.getElementById('modal-pdf')) return;
  const m = document.createElement('div');
  m.id = 'modal-pdf';   // mismo id que antes: el botón «atrás» del celular lo cierra
  m.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.5)';
  m.innerHTML = '<div class="bg-white rounded-xl shadow-xl w-full flex flex-col" style="max-width:780px;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px)"></div>';
  document.body.appendChild(m);
  const caja = m.firstChild, claves = ['general', 'inventario', 'ventas'].concat(esAdminCuenta() ? ['talleres'] : []);
  let modelo = null, paso = 0;
  const cab = (t, s) => '<div class="px-5 pt-4 pb-3 border-b border-slate-100"><p class="text-base font-medium text-slate-900">' + t + '</p><p class="card-s mt-0.5">' + s + '</p></div>';
  const pie = (izq, bt) => '<div class="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-end"><span class="card-s mr-auto">' + izq + '</span>' + bt + '</div>';
  const bt = (id, txt, cls, off) => '<button type="button" id="' + id + '" class="px-4 py-2 rounded-lg text-sm font-medium ' + cls + (off ? ' opacity-50' : '') + '"' + (off ? ' disabled' : '') + '>' + txt + '</button>';
  const BORDE = 'border border-slate-300 text-slate-700', AZUL = 'bg-blue-600 text-white';

  const pintar = () => {
    const prev = caja.querySelector('#exp-cuerpo'), sc = prev ? prev.scrollTop : 0, n = expContar(modelo), t = n + ' tema' + (n === 1 ? '' : 's');
    if (paso === 1) caja.innerHTML = cab('Exportar reporte', 'Paso 1 de 2 · Elige qué incluir. Viene todo marcado: desmarca lo que no quieras.')
      + '<div id="exp-cuerpo" class="px-5 py-3 overflow-auto flex-1">' + expHtmlSeleccion(modelo) + '</div>'
      + pie(t + ' seleccionado' + (n === 1 ? '' : 's'), bt('exp-cancelar', 'Cancelar', BORDE) + bt('exp-sig', 'Siguiente', AZUL, !n));
    else caja.innerHTML = cab('Vista previa', 'Paso 2 de 2 · Revisa el contenido. Con «Quitar» sacas un tema o una página completa; después exporta.')
      + '<div id="exp-cuerpo" class="px-5 py-3 overflow-auto flex-1">' + expHtmlVista(modelo) + '</div>'
      + pie(t + ' en el reporte', bt('exp-atras', 'Atrás', BORDE) + bt('exp-word', '<i class="fa-solid fa-file-word mr-1"></i>Exportar Word', BORDE, !n) + bt('exp-pdf', '<i class="fa-solid fa-file-pdf mr-1"></i>Exportar PDF', AZUL, !n));
    caja.querySelectorAll('[data-mixto]').forEach(i => { i.indeterminate = true; });
    const cp = caja.querySelector('#exp-cuerpo'); if (cp) cp.scrollTop = sc;
  };
  const hacer = async tipo => {
    m.dataset.ocupado = '1';   // generando: el botón «atrás» no lo cancela a medias
    const nom = 'reporteador_gc_' + new Date().toISOString().slice(0, 10);
    caja.innerHTML = cab('<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generando ' + (tipo === 'pdf' ? 'PDF' : 'Word') + '…', 'Esto tarda unos segundos. No cierres ni cambies de pestaña hasta que termine.');
    try {
      await new Promise(r => setTimeout(r, 60));
      if (tipo === 'pdf') expRenderPDF(modelo).save(nom + '.pdf');
      else { await expCargarDocx(); expDescargar(await expRenderWord(modelo), nom + '.docx'); }
      m.remove();
    } catch (e) { delete m.dataset.ocupado; alert('No se pudo generar el ' + (tipo === 'pdf' ? 'PDF' : 'Word') + ': ' + e.message); paso = 2; pintar(); }
  };

  caja.addEventListener('change', e => {
    const d = e.target && e.target.dataset; if (!d || !d.exp || !modelo) return;
    const v = e.target.checked;
    if (d.exp === 'tab') modelo.secciones.filter(s => s.clave === d.id).forEach(s => s.temas.forEach(t => { t.incluir = v; }));
    else if (d.exp === 'sec') modelo.secciones.filter(s => s.id === d.id).forEach(s => s.temas.forEach(t => { t.incluir = v; }));
    else modelo.secciones.forEach(s => s.temas.forEach(t => { if (t.id === d.id) t.incluir = v; }));
    pintar();
  });
  caja.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled || !modelo && b.id !== 'exp-cancelar') return;
    const del = b.dataset.expDel;
    if (del === 'tema') { modelo.secciones.forEach(s => s.temas.forEach(t => { if (t.id === b.dataset.id) t.incluir = false; })); pintar(); }
    else if (del === 'sec') { modelo.secciones.filter(s => s.id === b.dataset.id).forEach(s => s.temas.forEach(t => { t.incluir = false; })); pintar(); }
    else if (b.id === 'exp-cancelar') m.remove();
    else if (b.id === 'exp-sig') { paso = 2; pintar(); }
    else if (b.id === 'exp-atras') { paso = 1; pintar(); }
    else if (b.id === 'exp-pdf') hacer('pdf');
    else if (b.id === 'exp-word') hacer('word');
  });
  m.addEventListener('click', e => { if (e.target === m && !m.dataset.ocupado) m.remove(); });

  caja.innerHTML = cab('Exportar reporte', 'Preparando el contenido de cada pestaña…')
    + '<div class="px-5 py-8 text-sm text-slate-600"><i class="fa-solid fa-spinner fa-spin mr-2"></i><span id="exp-avance">Preparando…</span></div>'
    + pie('', bt('exp-cancelar', 'Cancelar', BORDE));
  try {
    modelo = await expCapturar(claves, t => { const a = document.getElementById('exp-avance'); if (a) a.textContent = t; }, () => !m.isConnected);
  } catch (e) { if (m.isConnected) { m.remove(); if (e.message !== 'cancelado') alert('No se pudo preparar el reporte: ' + e.message); } return; }
  if (!m.isConnected) return;
  if (!modelo.secciones.length) { m.remove(); alert('No hay contenido para exportar.'); return; }
  paso = 1; pintar();
}
function abrirExportarPDF() { return abrirExportar(); }   // nombre anterior

if (typeof module !== 'undefined' && module.exports) module.exports = { expHtmlSeleccion, expHtmlVista, expEstado, EXP, expLeerContenedor, expLeerCard, expLeerTabla, expRenderPDF, expRenderWord, expSeleccion, expContar, expDatosKpi };
