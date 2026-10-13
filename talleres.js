/* ═══════════════════════════════════════════════════════════════════
   talleres.js — pestaña Talleres del Reporteador GC
   Se carga DESPUÉS del script principal de index.html (usa sus funciones:
   fmtMoney, fmtCompacto, pct, esc, nuevoChart, alturaChart, voCanon, numERP,
   parseFechaVenta, fgAgencias, sesion, etc.).

   · Timbrado      = suma de TOTAL (lo facturado)            → Contado (CONT) y Crédito (CRED)
   · Productividad = suma de MANO_OBRA + TOTAL (total M.O.)  → contra lo timbrado
   Filtros predeterminados = los de tus tablas dinámicas del Excel
   (familias de taller, CONT y CRED, 12 mecánicos, sin productos INSUMO).
   ═══════════════════════════════════════════════════════════════════ */

const TL_FAMILIAS_DEFECTO = ['01-MOTOS/TALLER', '03-SERV/SERVICIOS'];
const TL_SUBFAM_DEFECTO = ['01-MOTOS/TALLER/MANO DE OBRA', '03-SERV/SERVICIOS/SERVICIOS', '03-SERV/SERVICIOS/TALLER', 'Mano De Obra', 'Taller', 'insumos', 'Servicios Taller'];
const TL_MECANICOS_DEFECTO = ['CARLOS ALONSO MEDINA TEC', 'JAZIEL EFRAIN CAUICH GONZALEZ', 'JORGE ALEJANDRO NOVELO PAT', 'JORGE PUC MAZUN',
  'JOSE ANTONIO FERNANDEZ SANSORES', 'JOSE MANUEL BARRERO CASANOVA', 'JOSE MICHELL RAMIREZ LOVERA', 'JUAN ANTONIO UUH CHI',
  'LIDIA BEATRIZ CANO POOT', 'LUIS ALBERTO TUN MENDOZA', 'RAUL FRANCISCO NOVELO PAT', 'VICTOR GIOVANNI POOL SALAZAR'];
const TL_CLAVE = 'rep_taller_filtros_v2';
const TL_COL = { cont: '#4285f4', cred: '#fbbc04', prod: '#7c3aed', tim: '#16a34a', mo: '#f97316' };

// "José Michell Ramírez" aparece escrito de 4 formas distintas en el ERP: se unifica.
function tlMec(n) {
  const u = String(n || '').toUpperCase().replace(/\s+/g, ' ').trim();
  return /^JOSE MICHELLE? RAMIREZ/.test(u) ? 'JOSE MICHELL RAMIREZ LOVERA' : u;
}
// v55 · ABONERO: el mecánico de esa sucursal es RAUL FRANCISCO NOVELO PAT sin importar quién vendió.
// Sus ventas son de REFACCIONES (01-MOTOS/REFACCIONES y 05-MOTOCARRO/REFACCIONES), CONT y CRED, todos los vendedores.
const TL_ABONERO = { sucursal: 'ABONERO', mecanico: 'RAUL FRANCISCO NOVELO PAT', familias: ['01-MOTOS/REFACCIONES', '05-MOTOCARRO/REFACCIONES'] };
const tlEsAbonero = r => String(r.sucursal || '').toUpperCase().trim() === TL_ABONERO.sucursal;
const tlMecDe = r => tlEsAbonero(r) ? TL_ABONERO.mecanico : tlMec(r.vendedor);
function tlNombre(n) {
  let t = String(n || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  return t.length > 30 ? t.slice(0, 29) + '…' : t;
}

function tlFiltrosDefecto() {   // = los filtros de las tablas dinámicas del Excel de mano de obra
  return {
    familia: new Set(TL_FAMILIAS_DEFECTO), subfam: new Set(TL_SUBFAM_DEFECTO.map(s => s.toLowerCase())),
    venta: new Set(['CONT', 'CRED']), sucExcl: new Set(), mec: new Set(TL_MECANICOS_DEFECTO), prod: new Set(['SERV'])
  };
}
function tlLeerFiltros() {
  try {
    const o = JSON.parse(localStorage.getItem(TL_CLAVE) || 'null');
    if (!o) return tlFiltrosDefecto();
    return {
      familia: new Set(o.familia || TL_FAMILIAS_DEFECTO), subfam: new Set(o.subfam || TL_SUBFAM_DEFECTO.map(s => s.toLowerCase())),
      venta: new Set(o.venta || ['CONT', 'CRED']), sucExcl: new Set(o.sucExcl || []), mec: new Set(o.mec || TL_MECANICOS_DEFECTO),
      prod: new Set(o.prod || ['SERV'])
    };
  } catch (e) { return tlFiltrosDefecto(); }
}
function tlGuardarFiltros() {
  try {
    const f = tl.f;
    localStorage.setItem(TL_CLAVE, JSON.stringify({ familia: [...f.familia], subfam: [...f.subfam], venta: [...f.venta], sucExcl: [...f.sucExcl], mec: [...f.mec], prod: [...f.prod] }));
  } catch (e) {}
}
function tlEsDefecto() {
  const f = tl.f, d = tlFiltrosDefecto(), ig = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  return ig(f.familia, d.familia) && ig(f.subfam, d.subfam) && ig(f.venta, d.venta) && ig(f.mec, d.mec) && ig(f.prod, d.prod) && f.sucExcl.size === 0;
}

let tl = { filas: [], cargado: false, cargando: false, error: '', sub: 'timbrado', anio: 0, mes: 0, f: tlLeerFiltros(), listas: {}, disp: {} };

// ── Carga de datos ──────────────────────────────────────────
async function tlCargar() {
  if (tl.cargando || !sesion) return;
  tl.cargando = true; tl.error = '';
  tlRender();
  try {
    const resp = await fetch(CATALOGO_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'obtenerTalleres', correo: sesion.correo, token: sesion.token }) });
    const data = await leerRespuestaJSON(resp);
    if (data.sesionInvalida) { manejarSesionExpirada(); return; }
    if (!data.success) throw new Error((data.message || 'No se pudo cargar Talleres.') + (/no reconocida/i.test(data.message || '') ? ' Falta pegar Talleres.gs y las dos líneas de doPost en Apps Script (y publicar una versión nueva).' : ''));
    tl.filas = (data.filas || []).map(a => ({
      anio: Number(a[0]), mes: Number(a[1]), sucursal: String(a[2] || ''), vendedor: String(a[3] || ''), venta: String(a[4] || ''),
      familia: String(a[5] || ''), subfam: String(a[6] || ''), insumo: Number(a[7]) === 1,
      total: Number(a[8]) || 0, subtotal: Number(a[9]) || 0, manoObra: Number(a[10]) || 0, lineas: Number(a[11]) || 0
    }));
    tl.cargado = true;
    const ys = [...new Set(tl.filas.map(r => r.anio))].sort((a, b) => b - a);
    if (!tl.anio || !ys.includes(tl.anio)) tl.anio = ys.includes(OBJ_ANIO) ? OBJ_ANIO : (ys[0] || OBJ_ANIO);
    tlArmarListas();
  } catch (e) { tl.error = e.message; tl.cargado = false; }
  finally { tl.cargando = false; }
  tlPintarPanel(); tlRender(); tlKpiGeneral();
}

function tlArmarListas() {
  const u = fn => [...new Set(tl.filas.map(fn))].filter(Boolean);
  tl.disp = {};
  tl.filas.forEach(r => { const k = r.subfam.toLowerCase(); if (k && !tl.disp[k]) tl.disp[k] = r.subfam; });
  // Cada mecánico "vive" en la sucursal donde más produce (antes de IVA); así el filtro los agrupa por sucursal.
  const vol = {}, volSuc = {};
  tl.filas.forEach(r => { const m = tlMecDe(r), v = r.subtotal + r.manoObra; vol[m] = (vol[m] || 0) + v; const s = volSuc[m] || (volSuc[m] = {}); s[r.sucursal] = (s[r.sucursal] || 0) + v; });
  const gr = {};
  Object.keys(volSuc).forEach(m => { const casa = m === TL_ABONERO.mecanico ? TL_ABONERO.sucursal : Object.entries(volSuc[m]).sort((a, b) => b[1] - a[1])[0][0]; (gr[casa] = gr[casa] || []).push(m); });
  if (!volSuc[TL_ABONERO.mecanico]) (gr[TL_ABONERO.sucursal] = gr[TL_ABONERO.sucursal] || []).push(TL_ABONERO.mecanico);   // v55: aparece aunque aún no tenga movimientos
  const grupos = Object.keys(gr).sort().map(s => [s, gr[s].sort((a, b) => (vol[b] || 0) - (vol[a] || 0) || a.localeCompare(b))]);
  tl.listas = {
    familia: u(r => r.familia).sort(), subfam: Object.keys(tl.disp).sort(), sucursal: u(r => r.sucursal).sort(),
    venta: ['CONT', 'CRED'], prod: ['SERV', 'INSUMO'],
    mec: grupos.reduce((a, g) => a.concat(g[1]), []), mecGrupos: grupos
  };
}

// ── Filtros ─────────────────────────────────────────────────
function tlPasa(r, f) {
  if (tlEsAbonero(r)) return TL_ABONERO.familias.includes(r.familia) && f.venta.has(r.venta) && !f.sucExcl.has(r.sucursal);
  return f.familia.has(r.familia) && f.subfam.has(r.subfam.toLowerCase()) && f.venta.has(r.venta)
    && f.prod.has(r.insumo ? 'INSUMO' : 'SERV') && f.mec.has(tlMecDe(r)) && !f.sucExcl.has(r.sucursal);
}
function tlFiltradas(todoElAnio, f, sinGlobal) {
  f = f || tl.f; const g = sinGlobal ? null : fgAgencias();
  return tl.filas.filter(r => r.anio === tl.anio && (todoElAnio || !tl.mes || r.mes === tl.mes) && tlPasa(r, f) && (!g || g.has(r.sucursal)));
}
// Importes ANTES DE IVA: Timbrado = SUBTOTAL · Productividad = SUBTOTAL + MANO_OBRA.  `tot` guarda el TOTAL con IVA solo para conciliar con el Excel.
const tlCero = () => ({ cont: 0, cred: 0, tim: 0, prod: 0, mo: 0, tot: 0, n: 0 });
function tlAgg(filas, keyFn) {
  const m = {};
  filas.forEach(r => {
    const k = keyFn(r), a = m[k] || (m[k] = tlCero()), s = r.subtotal;
    if (r.venta === 'CRED') a.cred += s; else a.cont += s;
    a.tim += s; a.mo += r.manoObra; a.prod += s + r.manoObra; a.tot += r.total; a.n += r.lineas;
  });
  return m;
}
function tlSuma(filas) { return tlAgg(filas, () => 'T').T || tlCero(); }

// ── Panel «Filtros del reporte · Talleres» (mismo estilo que Inventario; solo existe en esta pestaña) ──
const TL_ETQ = { venta: { CONT: 'Contado (CONT)', CRED: 'Crédito (CRED)' }, prod: { SERV: 'Servicios y mano de obra', INSUMO: 'INSUMOS (las tablas dinámicas los ocultan)' } };
const TL_PLURAL = { familia: 'familias', subfam: 'subfamilias', venta: 'tipos', prod: 'tipos', sucursal: 'sucursales', mec: 'mecánicos' };
function tlTxt(tipo, v) { return tipo === 'subfam' ? (tl.disp[v] || v) : tipo === 'mec' ? tlNombre(v) : TL_ETQ[tipo] ? TL_ETQ[tipo][v] : v; }
function _tlSet(tipo) { const f = tl.f; return tipo === 'familia' ? f.familia : tipo === 'subfam' ? f.subfam : tipo === 'mec' ? f.mec : tipo === 'venta' ? f.venta : tipo === 'prod' ? f.prod : f.sucExcl; }
const tlOn = (tipo, v) => tipo === 'sucursal' ? !tl.f.sucExcl.has(v) : _tlSet(tipo).has(v);

function tlDD(tipo, titulo, grupos) {
  const items = tl.listas[tipo] || [];
  const lis = grupos.map(([g, l]) => (g ? '<div class="tl-gr text-xs font-medium text-slate-500 uppercase pt-1">' + esc(g) + '</div>' : '')
    + l.map(v => '<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" ' + (tlOn(tipo, v) ? 'checked' : '') + ' onchange="tlTog(\'' + tipo + '\',' + items.indexOf(v) + ')"><span class="truncate" title="' + esc(tlTxt(tipo, v)) + '">' + esc(tlTxt(tipo, v)) + '</span></label>').join('')).join('');
  return '<div class="relative filtro-dd tl-dd min-w-0"><label class="text-xs text-slate-500 mb-1 block">' + titulo + '</label>'
    + '<button type="button" onclick="tlDdToggle(\'' + tipo + '\', event)" class="w-full flex items-center justify-between gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"><span id="tl-et-' + tipo + '" class="truncate text-slate-700"></span><i class="fa-solid fa-chevron-down text-xs text-slate-400"></i></button>'
    + '<div id="tl-dd-' + tipo + '" class="hidden absolute z-30 mt-1 w-full min-w-[16rem] bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-2">'
    + '<input type="text" oninput="tlBuscar(\'' + tipo + '\', this.value)" placeholder="Buscar..." class="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">'
    + '<div class="flex gap-4 text-xs font-medium text-blue-700"><button type="button" onclick="tlMarcar(\'' + tipo + '\',true)">Seleccionar todo</button><button type="button" onclick="tlMarcar(\'' + tipo + '\',false)">Deseleccionar todo</button></div>'
    + '<div id="tl-lista-' + tipo + '" class="max-h-56 overflow-y-auto text-sm space-y-1">' + (lis || '<span class="text-slate-400">Sin datos aún</span>') + '</div></div></div>';
}
function tlPintarPanel() {
  const c = document.getElementById('card-filtros-tal');
  if (!c) return;
  const L = tl.listas, uno = tipo => [[null, L[tipo] || []]];
  c.innerHTML = '<div class="flex flex-wrap items-center justify-between gap-2"><h3 class="card-t">Filtros del reporte · Talleres</h3>'
    + '<button onclick="tlRestablecer()" class="text-xs font-medium text-blue-700 hover:underline">Restablecer a los válidos por defecto</button></div>'
    + '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">'
    + tlDD('familia', 'Familia', uno('familia')) + tlDD('subfam', 'Subfamilia', uno('subfam')) + tlDD('venta', 'Venta (contado / crédito)', uno('venta'))
    + tlDD('prod', 'Producto', uno('prod')) + tlDD('sucursal', 'Sucursal (donde se vendió)', uno('sucursal')) + tlDD('mec', 'Mecánico (por sucursal)', L.mecGrupos || [])
    + '</div><p class="card-s">Vienen activados los mismos filtros de las tablas dinámicas del Excel de mano de obra (familias de taller, subfamilias de taller, CONT y CRED, 12 mecánicos y sin productos INSUMO). '
    + 'Aplican solo en esta pestaña, junto con el filtro global de Agencia de la barra superior. Todos los importes son antes de IVA. Tu selección se guarda en este navegador.</p>';
  Object.keys(TL_PLURAL).forEach(tlEtiqueta);
  tlActualizarBoton();
}
function tlEtiqueta(tipo) {
  const el = document.getElementById('tl-et-' + tipo); if (!el) return;
  const items = tl.listas[tipo] || [], on = items.filter(v => tlOn(tipo, v));
  el.textContent = !items.length ? 'Sin datos aún' : on.length === items.length ? 'Todos (' + items.length + ')' : !on.length ? 'Ninguno seleccionado'
    : on.length <= 2 ? on.map(v => tlTxt(tipo, v)).join(', ') : on.length + ' de ' + items.length + ' ' + TL_PLURAL[tipo];
}
function tlTog(tipo, i) {
  const v = tl.listas[tipo][i], s = _tlSet(tipo);
  if (s.has(v)) s.delete(v); else s.add(v);
  tlEtiqueta(tipo); tlCambio();
}
function tlMarcar(tipo, marcar) {   // marca o desmarca TODAS las opciones, aunque el buscador oculte algunas
  const s = _tlSet(tipo), items = tl.listas[tipo] || [];
  s.clear();
  if (tipo === 'sucursal') { if (!marcar) items.forEach(v => s.add(v)); } else if (marcar) items.forEach(v => s.add(v));
  document.querySelectorAll('#tl-lista-' + tipo + ' input').forEach((c, i) => { c.checked = tlOn(tipo, items[i]); });
  tlEtiqueta(tipo); tlCambio();
}
function tlBuscar(tipo, texto) {
  const q = normBusqueda(texto).trim(); let grupo = null, vis = 0;
  const cierra = () => { if (grupo) grupo.classList.toggle('hidden', q !== '' && vis === 0); };
  Array.from(document.getElementById('tl-lista-' + tipo).children).forEach(el => {
    if (el.classList.contains('tl-gr')) { cierra(); grupo = el; vis = 0; return; }
    const ok = q === '' || normBusqueda(el.textContent).indexOf(q) !== -1;
    el.classList.toggle('hidden', !ok); if (ok) vis++;
  });
  cierra();
}
function tlCerrarDD() { Object.keys(TL_PLURAL).forEach(t => { const d = document.getElementById('tl-dd-' + t); if (d) d.classList.add('hidden'); }); }
function tlDdToggle(tipo, ev) {
  if (ev) ev.stopPropagation();
  const d = document.getElementById('tl-dd-' + tipo), abrir = d.classList.contains('hidden');
  tlCerrarDD();
  if (abrir) { d.classList.remove('hidden'); const b = d.querySelector('input[type=text]'); if (b) b.focus(); }
}
function tlRestablecer() { tl.f = tlFiltrosDefecto(); tlGuardarFiltros(); tlArmarListas(); tlPintarPanel(); tlRender(); tlKpiGeneral(); }
function tlCambio() { tlGuardarFiltros(); tlActualizarBoton(); tlRender(); tlKpiGeneral(); }
function tlActualizarBoton() {
  const t = document.getElementById('btn-filtros-tal-txt');
  if (t) t.textContent = tlEsDefecto() ? '· Predeterminados' : '· Personalizado';
}
function tlAlternarPanel() {
  const p = document.getElementById('panel-filtros-tal'), b = document.getElementById('btn-filtros-tal');
  if (!p) return;
  if (vistaActual !== 'talleres') { tlCerrarPanel(); return; }   // los filtros del reporte de Talleres solo existen en esta pestaña
  const abrir = p.classList.contains('hidden');
  p.classList.toggle('hidden', !abrir); if (!abrir) tlCerrarDD();
  if (b) { b.classList.toggle('abierto', abrir); b.setAttribute('aria-expanded', abrir ? 'true' : 'false'); }
}
function tlCerrarPanel() {
  const p = document.getElementById('panel-filtros-tal'), b = document.getElementById('btn-filtros-tal');
  tlCerrarDD();
  if (p) p.classList.add('hidden');
  if (b) { b.classList.remove('abierto'); b.setAttribute('aria-expanded', 'false'); }
}
document.addEventListener('click', ev => {
  if (!ev.target.isConnected) return;
  if (!ev.target.closest('.tl-dd')) tlCerrarDD();
  const p = document.getElementById('panel-filtros-tal');
  if (!p || p.classList.contains('hidden')) return;
  if (!ev.target.closest('#panel-filtros-tal, #btn-filtros-tal')) tlCerrarPanel();
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') tlCerrarPanel(); });

// ── Selectores de la vista ──────────────────────────────────
function tlSub(s) { tl.sub = s; tlRender(); }
function tlSetAnio(v) { tl.anio = Number(v); tl.mes = 0; tlRender(); tlKpiGeneral(); }
function tlSetMes(v) { tl.mes = Number(v); tlRender(); }
function tlPintarSelects() {
  const a = document.getElementById('tl-anio'), m = document.getElementById('tl-mes');
  if (!a || !m) return;
  const ys = [...new Set(tl.filas.map(r => r.anio))].sort((x, y) => y - x);
  if (!ys.length) ys.push(tl.anio || OBJ_ANIO);
  a.innerHTML = ys.map(y => '<option value="' + y + '"' + (y === tl.anio ? ' selected' : '') + '>' + y + '</option>').join('');
  m.innerHTML = '<option value="0">Todo el año</option>' + MESES_ES.map((n, j) => '<option value="' + (j + 1) + '"' + (tl.mes === j + 1 ? ' selected' : '') + '>' + n + '</option>').join('');
  document.querySelectorAll('.tab-tl').forEach(b => {
    const on = b.dataset.ts === tl.sub;
    ['bg-blue-600', 'text-white', 'border-blue-600'].forEach(c => b.classList.toggle(c, on));
    ['bg-white', 'text-slate-600', 'border-slate-300'].forEach(c => b.classList.toggle(c, !on));
  });
}

// ── Gráficas ────────────────────────────────────────────────
function tlBarraH(labels, series, apilado) {
  return {
    type: 'bar',
    data: { labels, datasets: series.map(s => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 3, maxBarThickness: 16, stack: apilado ? 's' : undefined })) },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', axis: 'y', intersect: false },
      plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtMoney(c.raw || 0),
        footer: its => apilado ? 'Total: ' + fmtMoney(its.reduce((s, i) => s + (i.raw || 0), 0)) : '' } } },
      scales: {
        x: { stacked: !!apilado, grid: { color: gridColor(), drawTicks: false }, border: { display: false }, ticks: { maxTicksLimit: 6, callback: v => fmtCompacto(v) } },
        y: { stacked: !!apilado, grid: { display: false }, border: { display: false }, ticks: { autoSkip: false } }
      }
    }
  };
}

// ── Render principal ────────────────────────────────────────
function tlRender() {
  const sec = document.getElementById('vista-talleres');
  if (!sec || !sesion || !esAdminCuenta()) return;
  tlPintarSelects();
  const av = document.getElementById('tl-aviso');
  const msg = tl.error || (tl.cargando && !tl.cargado ? 'Cargando datos de taller…'
    : (tl.cargado && !tl.filas.length ? 'Aún no hay datos de taller guardados. Sube el reporte GCVEN02 (Ventas del mes) en Configuración: ahora también guarda el resumen de taller.' : ''));
  av.textContent = msg; av.classList.toggle('hidden', !msg);
  if (vistaActual !== 'talleres' || !tl.cargado) return;

  const esT = tl.sub === 'timbrado', A = tl.anio, mN = tl.mes ? MESES_ES[tl.mes - 1] + ' ' + A : 'Año ' + A;
  const filas = tlFiltradas(false), delAnio = tlFiltradas(true), T = tlSuma(filas);
  const nSuc = new Set(filas.map(r => r.sucursal)).size, nMec = new Set(filas.map(r => tlMecDe(r))).size;

  // KPIs
  const kpi = (t, v, d, ic, c, r) => '<div class="card kpi" style="--c:' + c + '"><span class="kpi-ico"><i class="fa-solid ' + ic + '"></i></span><p class="card-s">' + esc(t) + '</p><p class="text-xl font-medium text-slate-900">' + v + '</p><p class="card-s">' + esc(d) + '</p>'
    + (r == null ? '' : '<div class="kpi-bar"><div style="width:' + Math.max(0, Math.min(100, r * 100)) + '%;background:' + c + '"></div></div>') + '</div>';
  document.getElementById('tl-kpis').innerHTML = esT
    ? kpi('Timbrado total · ' + mN, fmtMoney(T.tim), 'antes de IVA · ' + nSuc + ' sucursales · ' + nMec + ' mecánicos', 'fa-stamp', TL_COL.tim, null)
      + kpi('Contado (CONT)', fmtMoney(T.cont), pct(T.cont, T.tim, 1) + ' del timbrado', 'fa-money-bill-wave', TL_COL.cont, T.tim ? T.cont / T.tim : null)
      + kpi('Crédito (CRED)', fmtMoney(T.cred), pct(T.cred, T.tim, 1) + ' del timbrado', 'fa-file-invoice-dollar', TL_COL.cred, T.tim ? T.cred / T.tim : null)
      + kpi('Productividad (referencia)', fmtMoney(T.prod), 'SUBTOTAL + MANO_OBRA · ver pestaña Productividad', 'fa-gauge-high', TL_COL.prod, null)
    : kpi('Productividad · ' + mN, fmtMoney(T.prod), 'SUBTOTAL + MANO_OBRA · antes de IVA', 'fa-gauge-high', TL_COL.prod, null)
      + kpi('Timbrado (facturado)', fmtMoney(T.tim), pct(T.tim, T.prod, 1) + ' de la productividad', 'fa-stamp', TL_COL.tim, T.prod ? T.tim / T.prod : null)
      + kpi('Sin timbrar (mano de obra)', fmtMoney(T.mo), pct(T.mo, T.prod, 1) + ' de la productividad', 'fa-hourglass-half', TL_COL.mo, T.prod ? T.mo / T.prod : null)
      + kpi('Mecánicos con producción', String(nMec), nSuc + ' sucursales', 'fa-user-gear', '#2563eb', null);

  // 1) Por mes (todo el año; el mes elegido se resalta y se puede cambiar con clic en la barra)
  document.getElementById('tl-mes-titulo').textContent = (esT ? 'Timbrado por mes · ' : 'Productividad contra timbrado por mes · ') + A;
  document.getElementById('tl-mes-nota').textContent = esT ? 'Contado y crédito, apilados, antes de IVA. Clic en un mes para ver solo ese mes abajo (otro clic lo quita).'
    : 'Barras: productividad (SUBTOTAL + MANO_OBRA) y timbrado (SUBTOTAL), antes de IVA. Línea: % de la productividad que se timbró. Clic en un mes para verlo abajo.';
  const pm = tlAgg(delAnio, r => r.mes), meses = MESES_ES.map((_, j) => pm[j + 1] || tlCero());
  const cm = (base, i) => (!tl.mes || tl.mes === i + 1) ? base : hexA(base, 0.35);
  const eje = { grid: { color: gridColor(), drawTicks: false }, border: { display: false }, ticks: { callback: v => fmtCompacto(v) } };
  let ds, scales;
  if (esT) {
    ds = [{ label: 'Contado', data: meses.map(m => m.cont), backgroundColor: meses.map((m, i) => cm(TL_COL.cont, i)), borderRadius: 3, maxBarThickness: 40, stack: 't' },
      { label: 'Crédito', data: meses.map(m => m.cred), backgroundColor: meses.map((m, i) => cm(TL_COL.cred, i)), borderRadius: 3, maxBarThickness: 40, stack: 't' }];
    scales = { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, eje) };
  } else {
    ds = [{ label: 'Productividad', data: meses.map(m => m.prod), backgroundColor: meses.map((m, i) => cm(TL_COL.prod, i)), borderRadius: 3, maxBarThickness: 28, order: 1 },
      { label: 'Timbrado', data: meses.map(m => m.tim), backgroundColor: meses.map((m, i) => cm(TL_COL.tim, i)), borderRadius: 3, maxBarThickness: 28, order: 1 },
      { type: 'line', label: '% timbrado', data: meses.map(m => m.prod ? m.tim / m.prod * 100 : null), yAxisID: 'y1', borderColor: '#94a3b8', backgroundColor: '#94a3b8', pointRadius: 4, borderWidth: 2, tension: 0, order: 0 }];
    scales = { x: { grid: { display: false } }, y: eje, y1: { position: 'right', beginAtZero: true, suggestedMax: 100, grid: { display: false }, ticks: { callback: v => v + '%' } } };
  }
  const chM = nuevoChart('tlMes', 'tlChartMes', { type: 'bar', data: { labels: MESES_ES, datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: {
        title: it => MESES_ES[it[0].dataIndex] + ' ' + A,
        label: c => c.dataset.yAxisID === 'y1' ? c.dataset.label + ': ' + (c.raw == null ? '—' : c.raw.toFixed(1) + '%') : c.dataset.label + ': ' + fmtMoney(c.raw || 0),
        footer: its => esT ? 'Total: ' + fmtMoney(its.reduce((s, i) => s + (i.raw || 0), 0)) : '' } } },
      scales } });
  chM.canvas.style.cursor = 'pointer';
  chM.canvas.onclick = ev => { const els = chM.getElementsAtEventForMode(ev, 'index', { intersect: false }, false); if (els.length) { const m = els[0].index + 1; tlSetMes(tl.mes === m ? 0 : m); } };

  // 2) Por sucursal
  const val = a => esT ? a.tim : a.prod;
  const aSuc = tlAgg(filas, r => r.sucursal);
  const sucs = Object.keys(aSuc).filter(s => val(aSuc[s]) !== 0).sort((a, b) => val(aSuc[b]) - val(aSuc[a]));
  document.getElementById('tl-suc-titulo').textContent = (esT ? 'Timbrado por sucursal · ' : 'Productividad contra timbrado por sucursal · ') + mN;
  alturaChart('tl-suc-cont', sucs.length, esT ? 30 : 46, 160);
  nuevoChart('tlSuc', 'tlChartSuc', tlBarraH(sucs.map(s => s + ' · ' + fmtCompacto(val(aSuc[s]))),
    esT ? [{ label: 'Contado', data: sucs.map(s => aSuc[s].cont), color: TL_COL.cont }, { label: 'Crédito', data: sucs.map(s => aSuc[s].cred), color: TL_COL.cred }]
        : [{ label: 'Productividad', data: sucs.map(s => aSuc[s].prod), color: TL_COL.prod }, { label: 'Timbrado', data: sucs.map(s => aSuc[s].tim), color: TL_COL.tim }], esT));

  // 3) Mecánicos dentro de su sucursal (una tarjeta por sucursal)
  const aMec = tlAgg(filas, r => r.sucursal + '||' + tlMecDe(r)), porSuc = {};
  Object.keys(aMec).forEach(k => { const p = k.split('||'); if (val(aMec[k]) === 0) return; (porSuc[p[0]] = porSuc[p[0]] || []).push({ m: p[1], a: aMec[k] }); });
  const orden = Object.keys(porSuc).sort((x, y) => val(aSuc[y] || tlCero()) - val(aSuc[x] || tlCero()));
  orden.forEach(s => porSuc[s].sort((x, y) => val(y.a) - val(x.a)));
  Object.keys(charts).filter(k => k.indexOf('tlMec') === 0).forEach(k => { try { charts[k].destroy(); } catch (e) {} delete charts[k]; });
  document.getElementById('tl-mec-titulo').textContent = 'Mecánicos por sucursal · ' + mN;
  document.getElementById('tl-mec-grid').innerHTML = orden.length ? orden.map((s, i) => '<div class="card space-y-2"><div><h3 class="card-t">' + esc(s) + '</h3><p class="card-s">'
    + porSuc[s].length + ' mecánico' + (porSuc[s].length === 1 ? '' : 's') + ' · ' + (esT ? 'Timbrado ' : 'Productividad ') + fmtMoney(val(aSuc[s] || tlCero())) + '</p></div>'
    + '<div id="tlMecCont' + i + '" style="height:120px"><canvas id="tlMecCv' + i + '"></canvas></div></div>').join('')
    : '<div class="card"><p class="card-s">Sin datos con los filtros actuales.</p></div>';
  orden.forEach((s, i) => {
    const L = porSuc[s];
    alturaChart('tlMecCont' + i, L.length, esT ? 30 : 46, 120);
    nuevoChart('tlMec' + i, 'tlMecCv' + i, tlBarraH(L.map(x => tlNombre(x.m) + ' · ' + fmtCompacto(val(x.a))),
      esT ? [{ label: 'Contado', data: L.map(x => x.a.cont), color: TL_COL.cont }, { label: 'Crédito', data: L.map(x => x.a.cred), color: TL_COL.cred }]
          : [{ label: 'Productividad', data: L.map(x => x.a.prod), color: TL_COL.prod }, { label: 'Timbrado', data: L.map(x => x.a.tim), color: TL_COL.tim }], esT));
  });

  // 4) Tabla: sucursal → mecánicos, con subtotal por sucursal
  const cel = a => esT ? [fmtMoney(a.cont), fmtMoney(a.cred), fmtMoney(a.tim), a.tim ? pct(a.cred, a.tim, 1) : '—']
                       : [fmtMoney(a.prod), fmtMoney(a.tim), fmtMoney(a.mo), a.prod ? pct(a.tim, a.prod, 1) : '—'];
  const tr = (cls, c0, c1, a) => '<tr class="' + cls + '"><td>' + c0 + '</td><td>' + c1 + '</td>' + cel(a).map(x => '<td class="r">' + x + '</td>').join('') + '</tr>';
  const cab = esT ? ['Contado', 'Crédito', 'Timbrado', '% crédito'] : ['Productividad', 'Timbrado', 'Sin timbrar', '% timbrado'];
  let cuerpo = '';
  orden.forEach(s => { porSuc[s].forEach(x => { cuerpo += tr('', esc(s), esc(tlNombre(x.m)), x.a); }); cuerpo += tr('vt-sub', 'Subtotal · ' + esc(s), '', aSuc[s] || tlCero()); });
  document.getElementById('tl-tabla').innerHTML = orden.length
    ? '<table class="vt"><thead><tr><th>Sucursal</th><th>Mecánico</th>' + cab.map(c => '<th class="r">' + c + '</th>').join('') + '</tr></thead><tbody>' + cuerpo + tr('vt-tot', 'Total', '', T) + '</tbody></table>'
    : '<p class="text-sm text-slate-500">Sin datos con los filtros actuales.</p>';

  document.getElementById('tl-nota').textContent = 'Fuente: GCVEN02 (Ventas del mes). Todos los importes son ANTES DE IVA: Timbrado = SUBTOTAL (lo facturado); Productividad = SUBTOTAL + MANO_OBRA. MANO_OBRA se suma tal como la registra el ERP (no trae el IVA desglosado). El mecánico va en la sucursal donde se hizo la venta. Se incluyen todos los estados de venta (FA y AC), igual que el Excel.';

  // 5) Conciliación con el Excel y puntos a revisar
  tlConciliar(T, filas);
}

// ── Conciliación: cuadre con el Excel, lo que los filtros dejan fuera y puntos a revisar ──
function tlConciliar(T, filas) {
  const cont = document.getElementById('tl-concil'); if (!cont) return;
  const g = fgAgencias(), A = tl.anio, f = tl.f;
  const money = v => fmtMoney(v), th = c => '<th class="' + (c.r ? 'r' : '') + '">' + c.t + '</th>';
  // a) Cuadre de importes (mismo periodo y filtros que la vista)
  const cuadre = [['Timbrado antes de IVA (SUBTOTAL) · lo que muestra este reporte', T.tim, 'vt-sub'],
    ['+ IVA', T.tot - T.tim, ''],
    ['Timbrado con IVA (TOTAL) · lo que suma tu tabla «Ingreso real por mano de obra timbrada»', T.tot, ''],
    ['Mano de obra (MANO_OBRA), tal como la registra el ERP', T.mo, ''],
    ['Productividad antes de IVA (SUBTOTAL + MANO_OBRA) · lo que muestra este reporte', T.prod, 'vt-sub'],
    ['Productividad con IVA (TOTAL + MANO_OBRA) · lo que suma tu tabla «Ingreso por productividad en mano de obra»', T.tot + T.mo, '']];
  const tCuadre = '<table class="vt"><thead><tr><th>Concepto</th><th class="r">Importe</th></tr></thead><tbody>'
    + cuadre.map(c => '<tr class="' + c[2] + '"><td>' + esc(c[0]) + '</td><td class="r">' + money(c[1]) + '</td></tr>').join('') + '</tbody></table>';
  // b) Lo que dejan fuera los filtros (mismo periodo y filtro global de agencia)
  const base = tl.filas.filter(r => r.anio === A && (!tl.mes || r.mes === tl.mes) && (!g || g.has(r.sucursal)));
  const motivo = r => {
    const m = tlMecDe(r), k = r.subfam.toLowerCase();
    if (!f.mec.has(m)) return ['Vendedor fuera de la lista de mecánicos', tlNombre(m)];
    if (!f.familia.has(r.familia)) return ['Familia desmarcada', r.familia];
    if (!f.subfam.has(k)) return ['Subfamilia desmarcada', tl.disp[k] || r.subfam];
    if (!f.venta.has(r.venta)) return ['Tipo de venta desmarcado', r.venta === 'CRED' ? 'Crédito (CRED)' : 'Contado (CONT)'];
    if (!f.prod.has(r.insumo ? 'INSUMO' : 'SERV')) return ['Producto desmarcado', r.insumo ? 'INSUMOS' : 'Servicios y mano de obra'];
    return ['Sucursal desmarcada', r.sucursal];
  };
  const fu = {};
  base.forEach(r => { if (tlPasa(r, f)) return; const [mo, de] = motivo(r), k = mo + '||' + de, a = fu[k] || (fu[k] = { mo, de, prod: 0, n: 0, suc: {} });
    a.prod += r.subtotal + r.manoObra; a.n += r.lineas; a.suc[r.sucursal] = (a.suc[r.sucursal] || 0) + r.subtotal + r.manoObra; });
  const lista = Object.values(fu).filter(a => Math.abs(a.prod) >= 0.5).sort((a, b) => b.prod - a.prod);
  const totFuera = lista.reduce((s, a) => s + a.prod, 0), top = lista.slice(0, 12), resto = lista.slice(12);
  const sucTop = a => Object.entries(a.suc).sort((x, y) => y[1] - x[1])[0][0];
  const tFuera = lista.length ? '<table class="vt"><thead><tr><th>Motivo</th><th>Concepto</th><th>Sucursal principal</th><th class="r">Productividad antes de IVA</th><th class="r">Renglones</th></tr></thead><tbody>'
    + top.map(a => '<tr><td>' + esc(a.mo) + '</td><td>' + esc(a.de) + '</td><td>' + esc(sucTop(a)) + '</td><td class="r">' + money(a.prod) + '</td><td class="r">' + a.n.toLocaleString('es-MX') + '</td></tr>').join('')
    + (resto.length ? '<tr><td colspan="3">Otros ' + resto.length + ' conceptos</td><td class="r">' + money(resto.reduce((s, a) => s + a.prod, 0)) + '</td><td class="r">' + resto.reduce((s, a) => s + a.n, 0).toLocaleString('es-MX') + '</td></tr>' : '')
    + '<tr class="vt-tot"><td colspan="3">Total fuera de los filtros</td><td class="r">' + money(totFuera) + '</td><td class="r">' + lista.reduce((s, a) => s + a.n, 0).toLocaleString('es-MX') + '</td></tr></tbody></table>'
    : '<p class="card-s">Con los filtros actuales no queda nada fuera de este periodo.</p>';
  // c) Puntos a revisar
  const aMec = tlAgg(filas, r => tlMecDe(r)), avisos = [];
  Object.keys(aMec).filter(m => aMec[m].prod > 0 && aMec[m].tim / aMec[m].prod < 0.5).sort((a, b) => aMec[b].prod - aMec[a].prod)
    .forEach(m => avisos.push('<b>' + esc(tlNombre(m)) + '</b>: solo el ' + pct(aMec[m].tim, aMec[m].prod, 1) + ' de su productividad se timbró (' + money(aMec[m].tim) + ' de ' + money(aMec[m].prod) + ').'));
  const sinMov = [...f.mec].filter(m => !aMec[m]).sort();
  if (sinMov.length) avisos.push('Mecánicos marcados sin movimientos en este periodo: ' + esc(sinMov.map(tlNombre).join(', ')) + '.');
  const fueraMec = lista.filter(a => a.mo.indexOf('Vendedor') === 0), sMec = fueraMec.reduce((s, a) => s + a.prod, 0);
  if (fueraMec.length) avisos.push(fueraMec.length + ' vendedores fuera de la lista suman ' + money(sMec) + ' en familias de taller. Los mayores: ' + fueraMec.slice(0, 4).map(a => esc(a.de) + ' (' + money(a.prod) + ', ' + esc(sucTop(a)) + ')').join('; ') + '. Revisa si alguno es mecánico; si lo es, márcalo en el filtro Mecánico.');
  avisos.push('MANO_OBRA no trae el IVA desglosado en el ERP: se suma tal cual. Si algunos montos ya incluyeran IVA, la productividad antes de IVA saldría algo alta.');
  cont.innerHTML = '<div class="space-y-4">'
    + '<div><p class="text-sm font-medium text-slate-700 mb-1">1) Cuadre con tu Excel · ' + esc(tl.mes ? MESES_ES[tl.mes - 1] + ' ' + A : 'Año ' + A) + '</p><div class="overflow-x-auto">' + tCuadre + '</div>'
    + '<p class="card-s mt-1">Compara las líneas «con IVA» contra tus tablas dinámicas (con sus mismos filtros). Si no coinciden, la causa está en los puntos 2 y 3.</p></div>'
    + '<div><p class="text-sm font-medium text-slate-700 mb-1">2) Lo que los filtros dejan fuera</p><div class="overflow-x-auto">' + tFuera + '</div></div>'
    + '<div><p class="text-sm font-medium text-slate-700 mb-1">3) Para revisar</p><ul class="text-sm text-slate-600 space-y-1 list-disc pl-5">' + avisos.map(a => '<li>' + a + '</li>').join('') + '</ul></div></div>';
}

// Tarjeta "Talleres" del Panel General
function tlKpiGeneral() {
  const c = document.getElementById('g-talleres-card');
  if (!c || !tl.cargado || !tl.filas.length || !esAdminCuenta()) return;
  const ps = c.querySelectorAll('p');
  if (ps.length < 3) return;
  const T = tlSuma(tlFiltradas(true, tlFiltrosDefecto()));   // los Filtros del reporte de Talleres no afectan al Panel General
  ps[0].textContent = 'Talleres · productividad ' + tl.anio;
  ps[1].className = 'text-2xl font-medium text-slate-900'; ps[1].textContent = fmtMoney(T.prod);
  ps[2].textContent = 'Timbrado ' + fmtMoney(T.tim) + ' (' + pct(T.tim, T.prod, 1) + ')';
}

// ── Gancho al cambiar de pestaña ────────────────────────────
function tallerAlCambiarVista(vista) {
  const admin = esAdminCuenta(), b = document.getElementById('btn-filtros-tal');
  if (b) b.classList.toggle('hidden', vista !== 'talleres' || !admin);
  tlCerrarPanel();
  if (!admin) return;
  if (!tl.cargado && !tl.cargando) tlCargar(); else if (vista === 'talleres') tlRender();
}

// ── Subida: se llama desde la carga de GCVEN02 (ventas del mes y años anteriores) ──
async function subirTallerObjetos(objetos, soloAnio) {
  const porMes = {};
  let leidas = 0;
  objetos.forEach(row => {
    const fam = String(row['FAMILIA'] || '').toUpperCase().trim();
    const esAbo = voCanon(row['SUCURSAL']) === TL_ABONERO.sucursal;   // v56: ABONERO manda también sus REFACCIONES
    if (esAbo ? TL_ABONERO.familias.indexOf(fam) === -1 : TL_FAMILIAS_DEFECTO.indexOf(fam) === -1) return;
    const venta = String(row['VENTA'] || '').toUpperCase().trim();
    if (venta !== 'CONT' && venta !== 'CRED') return;
    const f = parseFechaVenta(row['FECHA']);
    if (!f || (soloAnio && f.getFullYear() !== soloAnio)) return;
    const anio = f.getFullYear(), mes = f.getMonth() + 1, suc = voCanon(row['SUCURSAL']);
    let vend = String(row['VENDEDOR'] || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (esAbo && !vend) vend = 'SIN VENDEDOR';   // en ABONERO el mecánico no depende del vendedor
    if (!suc || !vend) return;
    let sub = String(row['SUBFAMILIA'] || '').trim(); if (sub.toLowerCase() === 'insumos') sub = 'insumos';
    const ins = String(row['PRODUCTO'] || '').toUpperCase().trim().indexOf('INSUMO') === 0 ? 1 : 0;
    const k = [suc, vend, venta, fam, sub, ins].join('|');
    const m = porMes[anio + '-' + mes] || (porMes[anio + '-' + mes] = { anio, mes, acc: {} });
    const a = m.acc[k] || (m.acc[k] = { sucursal: suc, vendedor: vend, venta, familia: fam, subfamilia: sub, insumo: ins, total: 0, subtotal: 0, manoObra: 0, lineas: 0 });
    a.total += numERP(row['TOTAL']); a.subtotal += numERP(row['SUBTOTAL']); a.manoObra += numERP(row['MANO_OBRA']); a.lineas++; leidas++;
  });
  const meses = Object.values(porMes);
  if (!meses.length) return '';
  let guardados = 0;
  for (const m of meses) {
    const registros = Object.values(m.acc);
    const resp = await fetch(CATALOGO_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'actualizarTallerMensual', token: sesion.token, correo: sesion.correo, anio: m.anio, mes: m.mes, registros }) });
    const data = await leerRespuestaJSON(resp);
    if (data.sesionInvalida) { manejarSesionExpirada(); return ''; }
    if (!data.success) throw new Error('Talleres ' + m.anio + '-' + m.mes + ': ' + (data.message || 'no se pudo guardar') + (/no reconocida/i.test(data.message || '') ? ' (falta pegar Talleres.gs y doPost)' : ''));
    guardados += registros.length;
  }
  tl.cargado = false;   // se vuelve a leer en cuanto se abra Talleres
  tlCargar();
  return 'Talleres: ' + leidas.toLocaleString('es-MX') + ' renglones de taller resumidos en ' + guardados.toLocaleString('es-MX') + ' registros (' + meses.length + ' mes' + (meses.length === 1 ? '' : 'es') + ').';
}

// ── Enganches finales ───────────────────────────────────────
if (typeof renderTodo === 'function') {   // al cambiar el filtro global de agencia o el tema, Talleres se repinta
  const _renderTodoOrig = renderTodo;
  renderTodo = function () {
    _renderTodoOrig.apply(this, arguments);
    try { tlKpiGeneral(); if (vistaActual === 'talleres') tlRender(); } catch (e) { console.error('Talleres:', e); }
  };
}
try { if (sesion) { tlPintarPanel(); tallerAlCambiarVista(vistaActual); } } catch (e) { console.error('Talleres:', e); }
