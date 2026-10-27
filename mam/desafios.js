// desafios.js — los desafíos de Mano a mano. Script clásico, expone window.mamDesafios.
// Elegís partidos (de uno o varios días, de los tres deportes), le ponés nombre, mandás el link. Los que entran
// eligen quién gana. Todos a ciegas: nadie ve la elección de otro ni la del modelo hasta que el partido empieza
// (eso lo decide el servidor, en ver_desafio; acá solo se dibuja). Un punto por cada partido que elegís bien. Tabla.
(function (raiz) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CU = () => raiz.mamCuentas, N = () => raiz.mamNativo, S = () => raiz.MAM_SITIO || {};
  const ZONA = 'America/Argentina/Buenos_Aires';
  const DEPORTE = { futbol: 'Fútbol', tenis: 'Tenis', nba: 'NBA' };
  const hoyAR = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const diaDe = (ms) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } };
  const horaDe = (ms) => { try { return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); } catch (e) { return ''; } };
  function diaTexto(f) {
    const hoy = hoyAR(); const dif = Math.round((Date.parse(f + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000);
    if (dif === 0) return 'hoy'; if (dif === 1) return 'mañana'; if (dif === -1) return 'ayer';
    const [y, m, d] = f.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
    return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][dt.getUTCDay()] + ' ' + d + '/' + m;
  }
  let raizEl = null, ctx = null, vista = { que: 'lista' }, cache = {};
  const $ = (q) => raizEl.querySelector(q);
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  const aviso = (t, bien) => { const a = $('[data-aviso]'); if (a) { a.textContent = t || ''; a.classList.toggle('bien', !!bien); } };
  const link = (codigo) => (S().desafios || {}).dominio + ((S().desafios || {}).ruta || '/desafio.html') + '#' + codigo;
  const hito = (n) => { try { ctx && ctx.hito && ctx.hito(n); } catch (e) {} };

  // ── la racha del modelo (27/10): lo que se muestra arriba del desafío. Sale de la base (modelo_racha): los últimos
  //    desafíos oficiales terminados, cuántos partidos acertó y en cuántos terminó arriba de todos. Solo se muestra si
  //    terminó arriba al menos una vez: la vidriera es para cuando gana. ──
  let RACHA; // undefined: no se pidió; null: no hay; {desafios, jugados, modelo, arriba}
  async function traerRacha() {
    if (RACHA !== undefined) return RACHA;
    try { const r = await CU().pedir('/rest/v1/rpc/modelo_racha', { metodo: 'POST', cuerpo: {}, sinToken: true }); RACHA = r && r.desafios > 0 && r.arriba > 0 ? r : null; }
    catch (e) { RACHA = null; }
    return RACHA;
  }
  function rachaHTML(r) {
    if (!r) return '';
    const n = r.desafios, veces = r.arriba === n ? (n === 1 ? 'arriba de todos' : n === 2 ? 'arriba de todos las dos veces' : 'arriba de todos las ' + n + ' veces') : 'arriba de todos en ' + r.arriba + ' de ' + n;
    return `<div class="mam-racha"><b>${r.modelo} de ${r.jugados}</b><span>El modelo, en ${n === 1 ? 'el último desafío' : 'los últimos <strong>' + n + ' desafíos</strong>'}. <strong>${esc(veces[0].toUpperCase() + veces.slice(1))}.</strong></span></div>`;
  }
  const racha = (d) => (d.oficial || !d.soy) ? `<div data-racha>${rachaHTML(RACHA || null)}</div>` : '';
  function pintarRacha() { traerRacha().then((r) => { if (!raizEl) return; raizEl.querySelectorAll('[data-racha]').forEach((el) => { el.innerHTML = rachaHTML(r); }); }); }

  // ── el apodo, antes que nada ──
  function necesitaApodo() { const c = CU(); return !(c && c.quienSoy() && c.perfil()); }
  function apodoHTML(porque) {
    return `<div class="mam-tarjeta">
      <h2 class="mam-titulo">¿Cómo te llamas?</h2>
      <p class="mam-nota">${esc(porque || 'Un apodo alcanza para jugar. Sin mail, sin contraseña. Es el nombre que van a ver tus amigos en la tabla.')}</p>
      <form data-form-apodo class="mam-fila"><input class="mam-campo crece" name="apodo" placeholder="tu apodo" maxlength="16" autocomplete="nickname" required><button class="mam-boton chico" type="submit">Listo</button></form>
      <div class="mam-aviso" data-aviso></div>
      <p class="mam-nota">Si ya tienes cuenta en Armá el 11, Sacá vos o el Quinteto, <a href="#" data-ir-cuenta>entra con tu mail</a>.</p>
    </div>`;
  }
  function engancharApodo(despues) {
    const f = $('[data-form-apodo]'); if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const b = f.querySelector('button'); b.disabled = true; aviso('Creando tu cuenta…');
      try { await CU().entrarConApodo(f.apodo.value); hito('cuenta'); if (ctx.alCambiarCuenta) ctx.alCambiarCuenta(); despues(); }
      catch (e) { aviso(e.message); b.disabled = false; }
    });
    const c = $('[data-ir-cuenta]'); if (c) c.addEventListener('click', (ev) => { ev.preventDefault(); ctx.ir('cuenta'); });
  }

  // ── la lista ──
  async function pintarLista() {
    vista = { que: 'lista' };
    if (necesitaApodo()) { raizEl.innerHTML = `${HOY_HTML}<div class="mam-seccion"><span>Tus desafíos</span><small>contra tus amigos y contra el modelo</small></div>${apodoHTML()}${comoFuncionaHTML()}`; engancharApodo(pintarLista); pintarHoy(); return; }
    raizEl.innerHTML = `${HOY_HTML}<div class="mam-seccion"><span>Tus desafíos</span><small>contra tus amigos y contra el modelo</small></div>
      <div class="mam-fila"><button type="button" class="mam-boton" data-crear style="margin:0">Crear un desafío</button><button type="button" class="mam-boton secundario" data-unirme style="margin:0">Tengo un código</button></div>
      <div class="mam-aviso" data-aviso></div>
      <ul class="mam-lista" data-lista><li class="mam-vacio">Cargando…</li></ul>`;
    $('[data-crear]').addEventListener('click', pintarCrear);
    $('[data-unirme]').addEventListener('click', pintarUnirme);
    pintarHoy();
    let mios = [];
    try { mios = (await CU().rpc('mis_desafios')) || []; } catch (e) { aviso(e.message); }
    const ul = $('[data-lista]'); if (!ul) return;
    if (!mios.length) { ul.innerHTML = `<li class="mam-vacio">Todavía no hay desafíos. Crea uno y mándale el link a un amigo.</li>${comoFuncionaHTML()}`; return; }
    ul.innerHTML = mios.map((d) => `<li><button type="button" class="mam-desafio-item" data-abrir="${esc(d.codigo)}">
      <b>${esc(d.nombre)}</b><span class="puesto">${d.estado === 'abierto' ? '' : d.estado === 'terminado' && d.puesto === 1 ? 'ganaste' : (d.puesto || '') + 'º'}</span>
      <small>${d.jugadores} ${d.jugadores === 1 ? 'jugador' : 'jugadores'} · ${d.partidos} ${d.partidos === 1 ? 'partido' : 'partidos'} · <span class="mam-estado ${esc(d.estado.replace(' ', '-'))}">${esc(d.estado)}</span>${d.proximo ? ' · próximo ' + esc(diaTexto(diaDe(Date.parse(d.proximo)))) + ' ' + esc(horaDe(Date.parse(d.proximo))) : ''}</small></button></li>`).join('');
    ul.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.abrir)));
    actualizarGlobo(mios);
  }

  // ── HOY (17/10): lo primero que se ve al abrir la app ──
  // 1. El desafío de la semana: lo arma Mano a mano (ajuste 'desafio_oficial'), cualquiera se suma con un toque.
  // 2. El modelo, hoy: cinco partidos con la elección del modelo y su número, gratis. Cambian cada día. El resto, con un plan.
  const HOY_HTML = `<div data-oficial></div><div data-destacados><div class="mam-tarjeta mam-destacados"><b>El modelo, hoy</b><p class="mam-nota" style="margin:6px 0 0">Mirando los partidos…</p></div></div>`;
  const PLAN_NOMBRE = { futbol: 'Fútbol', tenis: 'Tenis', nba: 'NBA' };
  function vaCon(p) {
    const e = p.m.eleccion; const nombre = p.opciones === 3 ? (e === 1 ? p.local : e === 2 ? 'el empate' : p.visita) : (e === 1 ? p.local : p.visita);
    return { nombre, pct: Math.round(p.m.p * 100) };
  }
  async function traerOficial() {
    try {
      const f = await CU().pedir('/rest/v1/ajuste?select=clave,valor&clave=eq.desafio_oficial', { sinToken: true });
      const x = (f || []).find((r) => r.clave === 'desafio_oficial'); if (!x || !x.valor) return null;
      const d = await CU().rpc('ver_desafio', { p_codigo: x.valor });
      return d && d.codigo ? d : null;
    } catch (e) { return null; }
  }
  function oficialHTML(d) {
    const quedan = d.partidos.filter((p) => !p.empezo);
    const prox = quedan.length ? Date.parse(quedan[0].empieza) : null;
    const total = d.total != null ? d.total : (d.jugadores || []).length;
    const mias = d.partidos.filter((p) => p.mia != null).length;
    const boton = d.soy ? (quedan.some((p) => p.mia == null) ? 'Completar mis elecciones' : 'Ver la tabla') : (quedan.length ? 'Jugar' : 'Ver la tabla');
    return `<div class="mam-tarjeta mam-oficial">
      <span class="mam-etiqueta">El desafío de la semana</span>
      <h2 class="mam-titulo">${esc(d.nombre)}</h2>
      ${racha(d)}
      <p class="mam-nota">${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'} · ${total >= 10 ? total + ' juegan' : 'abierto para todos'}${d.modelo_juega ? ' · juega el modelo' : ''}${prox ? ' · el próximo cierra ' + esc(diaTexto(diaDe(prox))) + ' ' + esc(horaDe(prox)) : ''}${d.soy ? ' · elegiste ' + mias + ' de ' + d.partidos.length : ''}</p>
      ${(() => { const js = (d.jugadores || []).slice(); if (d.modelo_juega > 0) js.push({ apodo: 'el modelo', puntos: d.modelo_puntos || 0, modelo: true }); return ganadorHTML(d, js, true); })()}
      <ul class="mam-mini">${d.partidos.slice(0, 5).map((p) => `<li class="${esc(p.deporte)}"><i></i>${esc(p.local)} – ${esc(p.visita)}</li>`).join('')}${d.partidos.length > 5 ? `<li>y ${d.partidos.length - 5} más</li>` : ''}</ul>
      <button type="button" class="mam-boton" data-oficial-jugar>${boton}</button></div>`;
  }
  let hoyVuelta = 0;
  async function pintarHoy() {
    const vuelta = ++hoyVuelta;
    const sigue = () => vuelta === hoyVuelta && vista.que === 'lista' && raizEl && raizEl.querySelector('[data-destacados]');
    traerOficial().then((d) => {
      const el = sigue() && raizEl.querySelector('[data-oficial]'); if (!el) return;
      if (!d) { el.innerHTML = ''; return; }
      el.innerHTML = oficialHTML(d);
      pintarRacha();
      el.querySelector('[data-oficial-jugar]').addEventListener('click', () => abrir(d.codigo));
      const cr = el.querySelector('[data-compartir-resultado]'); if (cr) cr.addEventListener('click', () => imagenResultado(d, el.querySelector('.mam-oficial')));
    });
    if (!ctx.destacados) return;
    let falta = null, mostrados = -1;
    for (let i = 0; i < 10; i++) {
      let r = null;
      try { r = await ctx.destacados(); } catch (e) { r = null; }
      if (!sigue()) return;
      if (r && r.lista.length > mostrados) {
        if (falta === null) {
          try { const [pases, cobra] = await Promise.all([CU().misPases(), CU().cobra(), verPrueba()]); falta = ['futbol', 'tenis', 'nba'].filter((dep) => cobra[dep] && !pases[dep]); } catch (e) { falta = ['futbol', 'tenis', 'nba']; }
          if (!sigue()) return;
        }
        if (r.lista.length || (r.listos && i >= 2)) { pintarDestacados(r, falta); mostrados = r.lista.length; }
      }
      if (r && ((r.listos && !r.faltan) || r.lista.length >= 5)) break;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    if (mostrados < 0) { const el = sigue() && raizEl.querySelector('[data-destacados]'); if (el) el.innerHTML = ''; }
  }
  // la prueba gratis de la web (7 días con cuenta): si esta persona puede empezarla, el botón de "El modelo, hoy" lo dice
  let PRUEBA_WEB = 0;
  async function verPrueba() {
    try { const n = N(); if (n && n.hayNativo && n.hayNativo()) return; const c = CU(); if (!c.quienSoy() || !c.estadoPrueba) { PRUEBA_WEB = 0; return; } const e = await c.estadoPrueba(); PRUEBA_WEB = e && e.puede ? e.dias : 0; } catch (e) { PRUEBA_WEB = 0; }
  }
  function pintarDestacados(r, falta) {
    const el = raizEl && raizEl.querySelector('[data-destacados]'); if (!el) return;
    if (!r.lista.length) { el.innerHTML = ''; return; }
    const mostrados = { futbol: 0, tenis: 0, nba: 0 }; for (const p of r.lista) mostrados[p.deporte]++;
    const otros = falta.map((dep) => ({ dep, n: Math.max(0, r.total[dep] - mostrados[dep]) })).filter((x) => x.n > 0);
    const nOtros = otros.reduce((a, x) => a + x.n, 0);
    const lista = r.lista.map((p) => { const v = vaCon(p); return `<li><button type="button" class="mam-destacado ${esc(p.deporte)}" data-ver="${esc(p.deporte)}"><i></i>
        <span class="crece"><b>${esc(p.local)} – ${esc(p.visita)}</b><small>${esc((p.rotulo || PLAN_NOMBRE[p.deporte]).split(' · ')[0])} · ${esc(diaTexto(diaDe(p.empieza)))} ${esc(horaDe(p.empieza))}</small></span>
        <span class="mam-va"><small>va con</small><b>${esc(v.nombre)}</b><em>${v.pct}%</em></span></button></li>`; }).join('');
    const y = (xs) => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : xs.join('');
    el.innerHTML = `<div class="mam-tarjeta mam-destacados">
      <div class="mam-fila"><b class="crece">El modelo, hoy</b><small class="mam-nota">gratis · cambian cada día</small></div>
      <ul class="mam-lista">${lista}</ul>
      ${nOtros ? `<p class="mam-nota">${nOtros === 1 ? 'Hay 1 partido más' : 'Hay ' + nOtros + ' partidos más'} con su número en los próximos tres días: ${y(otros.map((x) => x.n + ' de ' + (x.dep === 'futbol' ? 'fútbol' : x.dep === 'tenis' ? 'tenis' : 'NBA')))}. ${PRUEBA_WEB ? 'Mira el pronóstico de todos: ' + PRUEBA_WEB + ' días gratis con tu apodo.' : 'Con un plan los ves todos, con la perilla y la simulación sin tope.'}</p>
      <button type="button" class="mam-boton" data-planes>${PRUEBA_WEB ? PRUEBA_WEB + ' días gratis' : 'Ver los planes'}</button>` : ''}
    </div>`;
    el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => ctx.ir('partidos', b.dataset.ver)));
    const pl = el.querySelector('[data-planes]'); if (pl) pl.addEventListener('click', () => ctx.ir('cuenta'));
  }
  function comoFuncionaHTML() {
    return `<div class="mam-tarjeta" style="margin-top:6px"><b>Cómo es</b><p class="mam-nota" style="margin:0">Eliges partidos de fútbol, tenis o NBA, de hoy o de la semana, y mandas el link. Cada uno elige quién gana, a ciegas: las elecciones se ven recién cuando empieza el partido. Un punto por cada partido bien elegido. El modelo también juega: elige antes que todos y se revela cuando empieza el partido.</p></div>`;
  }
  function actualizarGlobo(mios) {
    const n = (mios || []).filter((d) => d.estado !== 'terminado').length;
    const g = document.getElementById('mam-globo'); if (g) { g.textContent = n; g.hidden = !n; }
  }

  // ── crear ──
  let SEL = new Map(), FILTRO = 'todos', NOMBRE = '';
  function pintarCrear(pre) {
    vista = { que: 'crear' };
    if (pre && pre.nombre) NOMBRE = pre.nombre;
    SEL = new Map();
    const partidos = ctx.partidos();
    const nombre = NOMBRE || sugerirNombre(partidos);
    raizEl.innerHTML = `<div class="mam-seccion"><span>Nuevo desafío</span><button type="button" class="mam-boton secundario chico" data-volver>Volver</button></div>
      <input class="mam-campo" data-nombre placeholder="nombre del desafío" maxlength="60" value="${esc(nombre)}">
      <div class="mam-chips" data-filtro>
        <button type="button" data-f="todos" aria-pressed="true">Todos</button>
        ${['futbol', 'tenis', 'nba'].filter((d) => partidos.some((p) => p.deporte === d)).map((d) => `<button type="button" data-f="${d}" aria-pressed="false">${DEPORTE[d]}</button>`).join('')}
        <button type="button" data-parejos>Los 5 más parejos</button>
      </div>
      <div data-partidos></div>
      <div class="mam-pegajoso"><span class="crece mam-nota" data-cuenta>Elige entre 1 y 30 partidos</span><button type="button" class="mam-boton chico" data-crear-ya disabled>Crear</button></div>
      <div class="mam-aviso" data-aviso></div>`;
    $('[data-volver]').addEventListener('click', pintarLista);
    $('[data-nombre]').addEventListener('input', (e) => { NOMBRE = e.target.value; });
    $('[data-filtro]').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { FILTRO = b.dataset.f; pintarPartidos(); }));
    $('[data-parejos]').addEventListener('click', () => {
      const hoy = hoyAR();
      const cand = partidos.filter((p) => p.p != null && diaDe(p.empieza) === hoy);
      const lista = (cand.length >= 5 ? cand : partidos.filter((p) => p.p != null)).slice().sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)).slice(0, 5);
      SEL = new Map(lista.map((p) => [clave(p), p])); pintarPartidos();
    });
    $('[data-crear-ya]').addEventListener('click', crearYa);
    pintarPartidos();
  }
  const clave = (p) => p.deporte + ':' + p.partido;
  function sugerirNombre(partidos) {
    const n = (partidos.find((p) => p.deporte === 'futbol') || {}).rotulo;
    return n ? n.split(' · ')[0] : 'Mano a mano';
  }
  function pintarPartidos() {
    const partidos = ctx.partidos().filter((p) => FILTRO === 'todos' || p.deporte === FILTRO);
    const cont = $('[data-partidos]'); if (!cont) return;
    if (!partidos.length) { cont.innerHTML = '<div class="mam-vacio">No hay partidos por jugar en estos días.</div>'; return; }
    let html = '', dia = '';
    for (const p of partidos) {
      const d = diaDe(p.empieza);
      if (d !== dia) { dia = d; html += `<div class="mam-dia">${esc(diaTexto(d))}</div>`; }
      const on = SEL.has(clave(p));
      html += `<button type="button" class="mam-partido ${p.deporte}" data-k="${esc(clave(p))}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span class="crece"><b>${esc(p.local)} – ${esc(p.visita)}</b><small>${esc(p.rotulo || DEPORTE[p.deporte])} · ${esc(horaDe(p.empieza))}</small></span><span class="tilde">${on ? '✓' : ''}</span></button>`;
    }
    cont.innerHTML = html;
    cont.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      const p = ctx.partidos().find((x) => clave(x) === b.dataset.k); if (!p) return;
      if (SEL.has(b.dataset.k)) SEL.delete(b.dataset.k); else { if (SEL.size >= 30) return aviso('Hasta 30 partidos.'); SEL.set(b.dataset.k, p); }
      pintarPartidos();
    }));
    $('[data-filtro]').querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === FILTRO ? 'true' : 'false'));
    const n = SEL.size; $('[data-cuenta]').textContent = n ? `${n} ${n === 1 ? 'partido' : 'partidos'} elegidos` : 'Elige entre 1 y 30 partidos'; $('[data-crear-ya]').disabled = !n;
  }
  async function crearYa() {
    const b = $('[data-crear-ya]'); b.disabled = true; aviso('Creando…');
    try {
      const nombre = (($('[data-nombre]') || {}).value || '').trim() || 'Mano a mano';
      const partidos = [];
      for (const p of SEL.values()) {
        const m = await ctx.modelo(p);   // { eleccion, p } o null: lo que el modelo elige HOY, se guarda y se tapa hasta que empiece
        partidos.push({ deporte: p.deporte, partido: String(p.partido), fuente: p.fuente || null, empieza: new Date(p.empieza).toISOString(),
          local: p.local, visita: p.visita, rotulo: p.rotulo || '', opciones: p.opciones || 2, modelo: m ? m.eleccion : null, modelo_p: m ? Math.round(m.p * 1000) / 1000 : null });
      }
      const codigo = await CU().rpc('crear_desafio', { p_nombre: nombre, p_partidos: partidos });
      N() && N().vibrar('set');
      pedirAvisos();
      await abrir(codigo, true);
    } catch (e) { aviso(e.message); b.disabled = false; }
  }

  // ── unirse ──
  function pintarUnirme(codigoPre) {
    vista = { que: 'unirme' };
    raizEl.innerHTML = `<div class="mam-seccion"><span>Tengo un código</span><button type="button" class="mam-boton secundario chico" data-volver>Volver</button></div>
      <form data-form-codigo class="mam-fila"><input class="mam-campo crece" name="codigo" placeholder="el código del link, ej. K7M2PQ" maxlength="6" autocapitalize="characters" autocomplete="off" value="${esc(codigoPre || '')}" required><button class="mam-boton chico" type="submit">Entrar</button></form>
      <div class="mam-aviso" data-aviso></div>`;
    $('[data-volver]').addEventListener('click', pintarLista);
    $('[data-form-codigo]').addEventListener('submit', async (ev) => { ev.preventDefault(); const c = ev.target.codigo.value.trim().toUpperCase(); if (c) await unirme(c); });
  }
  async function unirme(codigo) {
    aviso('Entrando…');
    try { await CU().rpc('unirse_desafio', { p_codigo: codigo }); N() && N().vibrar('set'); pedirAvisos(); await abrir(codigo); }
    catch (e) { aviso(e.message); }
  }
  function pedirAvisos() {
    const n = N(); if (!n || !n.hayNativo()) return;
    n.pedirAvisos(async (token, plataforma) => { try { await CU().rpc('registrar_dispositivo', { p_token: token, p_plataforma: plataforma === 'android' ? 'android' : 'ios' }); } catch (e) {} });
  }

  // ── el desafío ──
  async function abrir(codigo, recienCreado) {
    vista = { que: 'desafio', codigo };
    raizEl.innerHTML = `<div class="mam-vacio">Cargando el desafío…</div>`;
    let d = null;
    try { d = await CU().rpc('ver_desafio', { p_codigo: codigo }); } catch (e) { raizEl.innerHTML = `<div class="mam-vacio">${esc(e.message)}</div>`; return; }
    if (!d) { raizEl.innerHTML = `<div class="mam-vacio">Ese desafío no existe.</div><button type="button" class="mam-boton secundario" data-volver>Volver</button>`; $('[data-volver]').addEventListener('click', pintarLista); return; }
    cache[codigo] = d;
    hito('desafio');
    // 27/10: el que llega por un link (sin cuenta, o con cuenta pero sin haber entrado) ve el desafío entero y elige.
    // El apodo se pide recién al guardar, que es cuando hace falta. Antes había dos pantallas antes de tocar un partido.
    pintarDesafio(d, recienCreado);
  }
  function portadaHTML(d) {
    const quedan = d.partidos.filter((p) => !p.empezo).length;
    const quien = d.oficial ? 'El desafío de la semana' : (d.creador ? esc(d.creador) + ' te desafió' : 'Te desafiaron');
    return `<div class="mam-portada">
      <span class="mam-etiqueta">${quien}</span>
      <h2>${esc(d.nombre)}</h2>
      <p>${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'} de ${yLista([...new Set(d.partidos.map((p) => p.deporte === 'nba' ? 'NBA' : DEPORTE[p.deporte].toLowerCase()))])}${d.modelo_juega ? ' · juega el modelo' : ''}${quedan ? '' : ' · ya empezó'}</p>
      ${racha(d)}
      <div class="mam-pasos"><div><b>1</b>Elige quién gana, a ciegas</div><div><b>2</b>Guarda con un apodo. Sin mail.</div><div><b>3</b>Cuando empieza, se revela todo</div></div>
    </div>`;
  }
  function resumenHTML(d) {
    return `<div class="mam-tarjeta"><h2 class="mam-titulo">${esc(d.nombre)}</h2><p class="mam-nota" style="margin:0">${d.creador ? 'Lo armó ' + esc(d.creador) + '. ' : ''}${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'} · ${d.jugadores.length} ${d.jugadores.length === 1 ? 'jugador' : 'jugadores'}.</p>
      ${ganadorHTML(d, conModelo(d))}
      <ul class="mam-lista">${d.partidos.slice(0, 6).map((p) => `<li class="mam-nota">${esc(p.local)} – ${esc(p.visita)} · ${esc(p.rotulo || DEPORTE[p.deporte])}</li>`).join('')}${d.partidos.length > 6 ? `<li class="mam-nota">y ${d.partidos.length - 6} más</li>` : ''}</ul></div>`;
  }
  // ── quién gana (18/10): arriba del desafío, apenas hay un resultado; "ganó" cuando terminó ──
  // El cálculo es uno solo (lo usan el cartel, la imagen para compartir y el texto que la acompaña). Empates: mismo puesto.
  function resultado(d, jugadores) {
    const jugados = d.partidos.filter((p) => p.resultado != null && p.resultado !== 0).length;
    const tabla = (jugadores || []).slice().sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
    tabla.forEach((j) => { j.puesto = 1 + tabla.filter((x) => (x.puntos || 0) > (j.puntos || 0)).length; });
    const max = tabla.length ? (tabla[0].puntos || 0) : 0;
    const arriba = max > 0 ? tabla.filter((j) => (j.puntos || 0) === max) : [];
    const fin = d.estado === 'terminado';
    const soyYo = arriba.length === 1 && !!arriba[0].yo;
    const quedan = d.partidos.filter((p) => !p.empezo).length;
    return { jugados, tabla, max, arriba, fin, soyYo, quedan, yo: tabla.find((j) => j.yo) || null, modelo: tabla.find((j) => j.modelo) || null };
  }
  const yLista = (xs) => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : (xs[0] || '');
  const puntosTxt = (n) => n + ' ' + (n === 1 ? 'punto' : 'puntos');
  function ganadorHTML(d, jugadores, conBoton) {
    const r = resultado(d, jugadores);
    if (!r.jugados || !r.tabla.length) return '';
    const boton = conBoton ? `<button type="button" class="mam-boton chico" data-compartir-resultado>${r.fin ? 'Compartir el resultado' : 'Compartir cómo va'}</button>` : '';
    if (r.max <= 0) return `<div class="mam-ganador"><small>${r.fin ? 'Terminó' : 'Va'}</small><b>${r.fin ? 'Nadie sumó' : 'Nadie suma todavía'}</b><span>${r.jugados} de ${d.partidos.length} partidos jugados</span></div>`;
    const nombre = (j) => j.yo ? 'tú' : j.apodo;
    const titulo = r.fin ? (r.soyYo ? '¡Ganaste!' : r.arriba.length > 1 ? 'Empate arriba' : 'Ganó') : (r.soyYo ? 'Vas primero' : r.arriba.length > 1 ? 'Van primeros' : 'Va primero');
    const quien = r.soyYo ? (r.fin ? 'Le ganaste a todos' : 'Tú') : yLista(r.arriba.map(nombre));
    return `<div class="mam-ganador${r.fin ? ' fin' : ''}${r.soyYo ? ' yo' : ''}"><small>${esc(titulo)}</small><b>${esc(quien)}</b><span>${puntosTxt(r.max)} · ${r.jugados} de ${d.partidos.length} partidos jugados</span>${boton}</div>`;
  }
  const conModelo = (d) => { const js = (d.jugadores || []).map((j) => Object.assign({}, j)); if (d.modelo_juega > 0) js.push({ apodo: 'el modelo', puntos: d.modelo_puntos || 0, modelo: true, elegidos: d.modelo_juega }); return js; };
  // ── el borrador (19/10): tocar una opción no guarda nada; "Guardar" manda todas juntas y ya no se cambian ──
  const BORR = {};
  const borrador = (codigo) => { if (!BORR[codigo]) { const g = leer('mam.borrador.' + codigo, {}); BORR[codigo] = new Map(Object.entries(g || {})); } return BORR[codigo]; };
  const guardarBorrador = (codigo) => { const m = borrador(codigo); if (m.size) guardar('mam.borrador.' + codigo, Object.fromEntries(m)); else { try { localStorage.removeItem('mam.borrador.' + codigo); } catch (e) {} } };
  const clavePartido = (p) => p.deporte + ':' + p.partido;
  const NOMBRE_OP = (p, i) => (p.opciones === 3 ? [p.local, 'Empate', p.visita] : [p.local, p.visita])[i - 1] || '';
  function pintarDesafio(d, recienCreado) {
    const invitado = !d.soy;
    const bo = borrador(d.codigo);
    for (const p of d.partidos) { const k = clavePartido(p); if (bo.has(k) && (p.mia != null || p.empezo)) bo.delete(k); }
    guardarBorrador(d.codigo);
    const pendientes = d.partidos.filter((p) => !p.empezo && p.mia == null && !bo.has(clavePartido(p))).length;
    const jugadores = conModelo(d);
    jugadores.sort((a, b) => b.puntos - a.puntos);
    let html = `<div class="mam-seccion"><span>${esc(d.estado)}</span><button type="button" class="mam-boton secundario chico" data-volver>${invitado ? 'Desafíos' : 'Mis desafíos'}</button></div>`;
    if (invitado) html += portadaHTML(d) + `<div class="mam-tarjeta">${ganadorHTML(d, jugadores)}
        <div class="mam-fila"><button type="button" class="mam-boton secundario chico crece" data-compartir>Mandar el link</button>${d.estado !== 'abierto' ? '<button type="button" class="mam-boton secundario chico crece" data-imagen>Compartir cómo va</button>' : ''}</div></div>`;
    else html += `<div class="mam-tarjeta">
        <h2 class="mam-titulo">${esc(d.nombre)}</h2>
        ${d.oficial ? racha(d) : ''}
        ${ganadorHTML(d, jugadores)}
        <div class="mam-codigo"><span class="mam-nota">Código del desafío</span><b>${esc(d.codigo)}</b></div>
        ${d.estado === 'terminado'
          ? '<div class="mam-fila"><button type="button" class="mam-boton chico crece" data-imagen>Compartir el resultado</button><button type="button" class="mam-boton secundario chico crece" data-compartir>Mandar el link</button></div>'
          : `<div class="mam-fila"><button type="button" class="mam-boton chico crece" data-compartir>Mandar el link</button>${d.estado !== 'abierto' ? '<button type="button" class="mam-boton secundario chico crece" data-imagen>Compartir cómo va</button>' : ''}</div>`}
        ${d.partidos.some((p) => p.mia != null) ? '<button type="button" class="mam-boton secundario chico" data-mis-elecciones style="width:100%">Compartir mis elecciones</button>' : ''}
        ${recienCreado ? '<p class="mam-nota">Listo. Mándales el link a tus amigos y elige tus ganadores abajo.</p>' : ''}
        ${pendientes ? `<p class="mam-nota">Te ${pendientes === 1 ? 'falta 1 partido' : 'faltan ' + pendientes + ' partidos'} por elegir.</p>` : ''}
      </div>`;
    html += `<div class="mam-aviso" data-aviso></div><div data-compartir-ya></div>`;
    if (d.partidos.some((p) => !p.empezo && p.mia == null)) html += `<p class="mam-nota mam-regla">Elige y toca <b>Guardar</b>. Una vez guardadas, tus elecciones no se pueden cambiar.</p>`;
    let dia = '';
    for (const p of d.partidos) {
      const dd = diaDe(Date.parse(p.empieza));
      if (dd !== dia) { dia = dd; html += `<div class="mam-dia">${esc(diaTexto(dd))}</div>`; }
      html += partidoHTML(d, p);
    }
    html += `<div class="mam-seccion"><span>Tabla</span><small>${d.oficial ? ((d.total || 0) >= 10 ? d.total + ' juegan · se ven los 20 primeros' : 'abierto para todos · se ven los 20 primeros') : 'un punto por cada partido bien elegido'}</small></div>
      <div class="mam-tarjeta"><table class="mam-tabla"><thead><tr><th>#</th><th>jugador</th><th>elegidos</th><th>puntos</th></tr></thead><tbody>
      ${jugadores.map((j, i) => `<tr class="${j.yo ? 'yo' : ''}${j.modelo ? ' modelo' : ''}"><td>${i + 1}</td><td>${esc(j.apodo)}${j.creador ? ' <small class="mam-nota">(lo armó)</small>' : ''}</td><td>${j.elegidos}/${d.partidos.length}</td><td>${j.puntos}</td></tr>`).join('')}
      </tbody></table>
      ${d.modelo_juega > 0 ? '<p class="mam-nota">El modelo elige antes de que empiece cada partido y se revela cuando empieza, igual que todos.</p>' : ''}
      ${d.estado === 'terminado' ? '<button type="button" class="mam-boton" data-revancha>Revancha</button>' : ''}
      </div>`;
    if (bo.size) html += `<div class="mam-pegajoso mam-guardar" data-barra-guardar><span class="crece mam-nota" data-guardar-texto>${bo.size} ${bo.size === 1 ? 'elección' : 'elecciones'} sin guardar</span><button type="button" class="mam-boton chico" data-guardar>Guardar</button></div>`;
    raizEl.innerHTML = html;
    if (invitado || d.oficial) pintarRacha();
    $('[data-volver]').addEventListener('click', pintarLista);
    $('[data-compartir]').addEventListener('click', () => compartir(d));
    const im = $('[data-imagen]'); if (im) im.addEventListener('click', () => imagenResultado(d));
    const me = $('[data-mis-elecciones]'); if (me) me.addEventListener('click', () => imagenElecciones(d));
    /* un desafío terminado en el que jugué, visto por primera vez: un momento para la reseña (una vez por desafío) */
    if (d.estado === 'terminado' && (d.jugadores || []).some((j) => j.yo) && ctx.momento) { const v = leer('mam.vistos', []); if (!v.includes(d.codigo)) { v.push(d.codigo); guardar('mam.vistos', v.slice(-50)); try { ctx.momento('desafio'); } catch (e) {} } }
    const rv = $('[data-revancha]'); if (rv) rv.addEventListener('click', () => pintarCrear({ nombre: 'Revancha: ' + d.nombre.replace(/^Revancha: /, '').slice(0, 50) }));
    raizEl.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', () => elegir(d, b.dataset.deporte, b.dataset.partido, Number(b.dataset.elegir))));
    const gu = $('[data-guardar]'); if (gu) gu.addEventListener('click', () => confirmarGuardar(d));
  }
  // ── el invitado guarda: primero el apodo (si no tiene cuenta), después entra al desafío, después se guardan las elecciones ──
  function pedirApodoYGuardar(d) {
    const barra = $('[data-barra-guardar]'); if (!barra) return;
    const sinCuenta = necesitaApodo();
    barra.innerHTML = `<div class="mam-apodo-guardar crece"><span class="mam-nota">${sinCuenta ? 'Un apodo para la tabla. Sin mail, sin contraseña.' : 'Entras al desafío y se guardan tus elecciones.'}</span>
      <form data-form-apodo-guardar class="mam-fila">${sinCuenta ? '<input class="mam-campo crece" name="apodo" placeholder="tu apodo" maxlength="16" autocomplete="nickname" required>' : ''}<button class="mam-boton chico" type="submit">${sinCuenta ? 'Guardar' : 'Entrar y guardar'}</button></form>
      <div class="mam-aviso" data-aviso-guardar></div></div>`;
    const f = barra.querySelector('[data-form-apodo-guardar]'); const inp = f.querySelector('input'); if (inp) setTimeout(() => inp.focus(), 50);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const b = f.querySelector('button'); b.disabled = true; const av = barra.querySelector('[data-aviso-guardar]');
      try {
        if (sinCuenta) { av.textContent = 'Creando tu cuenta…'; await CU().entrarConApodo(f.apodo.value); hito('cuenta'); if (ctx.alCambiarCuenta) ctx.alCambiarCuenta(); }
        av.textContent = 'Entrando…'; await CU().rpc('unirse_desafio', { p_codigo: d.codigo }); pedirAvisos();
        d.soy = true; const yo = CU().perfil(); d.jugadores = (d.jugadores || []).concat([{ apodo: yo ? yo.usuario : 'tú', puntos: 0, creador: false, yo: true, elegidos: 0 }]);
        await guardarElecciones(d, true);
      } catch (e) { av.textContent = e.message; b.disabled = false; }
    });
  }
  function partidoHTML(d, p) {
    const op = p.opciones === 3 ? [1, 2, 3] : [1, 2];
    const guardada = p.mia != null;
    const bloqueado = p.empezo || guardada;
    const enBorrador = !bloqueado ? borrador(d.codigo).get(clavePartido(p)) : undefined;
    const marcada = guardada ? p.mia : (enBorrador != null ? Number(enBorrador) : null);
    const botones = op.map((i) => {
      const nombre = i === 2 && p.opciones === 3 ? 'Empate' : NOMBRE_OP(p, i);
      let cls = '';
      if (p.resultado) cls = p.resultado === i ? ' acierto' : ' error';
      if (!guardada && marcada === i) cls += ' borrador';
      return `<button type="button" class="${cls.trim()}" data-elegir="${i}" data-deporte="${esc(p.deporte)}" data-partido="${esc(p.partido)}" aria-pressed="${marcada === i ? 'true' : 'false'}" ${bloqueado ? 'disabled' : ''}>${esc(nombre)}</button>`;
    });
    const estado = p.resultado ? (p.mia == null ? 'no elegiste' : p.mia === p.resultado ? '✓ la tuya' : 'no fue')
      : p.empezo ? (guardada ? 'guardado · empezó' : 'empezó: cerrado') : guardada ? '🔒 guardado' : (marcada != null ? 'sin guardar' : 'elegir');
    let revelado = '';
    if (p.empezo) {
      const otros = Object.entries(p.elecciones || {}).map(([a, e]) => `<span><b>${esc(a)}</b> ${esc(NOMBRE_OP(p, e))}</span>`);
      if (p.modelo) otros.unshift(`<span><b>el modelo</b> ${esc(NOMBRE_OP(p, p.modelo))}${p.modelo_p ? ' (' + Math.round(p.modelo_p * 100) + '%)' : ''}</span>`);
      revelado = `<div class="mam-revelado">${otros.join('') || '<span>nadie eligió</span>'}</div>`;
    }
    // en vivo: el marcador mientras se juega (lo trae el cascarón de la web de la NBA); cuando termina, hasta que se resuelva
    const v = (ctx.vivo && !p.resultado && p.empezo) ? ctx.vivo(p.deporte, p.partido) : null;
    const vivoHTML = v && v.estado !== 'programado' && v.pl != null ? `<div class="mam-vivo${v.estado === 'terminado' ? ' final' : ''}"><b>${esc(p.local)} ${v.pl} – ${v.pv} ${esc(p.visita)}</b><small>${v.estado === 'terminado' ? 'terminó · se resuelve en minutos' : v.estado === 'entretiempo' ? 'EN VIVO · entretiempo' : 'EN VIVO · ' + (v.cuarto > 4 ? 'OT' + (v.cuarto - 4) : (v.cuarto || '') + 'Q') + (v.reloj ? ' ' + esc(v.reloj) : '')}</small></div>` : '';
    return `<div class="mam-tarjeta mam-partido-juego${v && v.estado !== 'terminado' && v.estado !== 'programado' ? ' envivo' : ''}${marcada != null ? ' elegido' : ''}">
      <div class="mam-fila"><span class="crece"><b>${esc(p.rotulo || DEPORTE[p.deporte])}</b> <small class="mam-nota">· ${esc(horaDe(Date.parse(p.empieza)))}</small></span><small class="mam-nota">${esc(estado)}</small></div>
      ${vivoHTML}
      <div class="mam-eleccion${p.opciones === 3 ? ' tres' : ''}">${botones.length === 2 ? botones[0] + '<span>o</span>' + botones[1] : botones.join('')}</div>
      ${revelado}</div>`;
  }
  function elegir(d, deporte, partido, eleccion) {
    const p = d.partidos.find((x) => x.deporte === deporte && x.partido === partido);
    if (!p || p.empezo || p.mia != null) return;
    const bo = borrador(d.codigo), k = clavePartido(p);
    if (Number(bo.get(k)) === eleccion) bo.delete(k); else bo.set(k, eleccion);
    guardarBorrador(d.codigo); hito('eligio');
    N() && N().vibrar('toque');
    const y = (raizEl.closest('.mam-pantalla') || document.scrollingElement || {}).scrollTop;
    pintarDesafio(d);
    const c = raizEl.closest('.mam-pantalla') || document.scrollingElement; if (c && y != null) c.scrollTop = y;
  }
  // dos toques: "Guardar" → "Sí, guardar" (avisa que después no se cambian)
  function confirmarGuardar(d) {
    const b = $('[data-guardar]'), t = $('[data-guardar-texto]'); if (!b) return;
    if (!d.soy) return pedirApodoYGuardar(d);
    if (b.dataset.confirmar) return guardarElecciones(d);
    b.dataset.confirmar = '1'; b.textContent = 'Sí, guardar';
    if (t) t.innerHTML = '<b>¿Seguro?</b> Después no se pueden cambiar.';
  }
  async function guardarElecciones(d, recienEntro) {
    const bo = borrador(d.codigo); if (!bo.size) return;
    const b = $('[data-guardar]'); if (b) { b.disabled = true; b.textContent = 'Guardando…'; }
    const lista = [...bo.entries()].map(([k, e]) => { const i = k.indexOf(':'); return { deporte: k.slice(0, i), partido: k.slice(i + 1), eleccion: Number(e) }; });
    try {
      const r = (await CU().rpc('guardar_elecciones', { p_codigo: d.codigo, p_elecciones: lista })) || {};
      const empezados = new Set(r.empezados || []);
      for (const x of lista) { const p = d.partidos.find((q) => q.deporte === x.deporte && q.partido === x.partido); if (p && !empezados.has(clavePartido(p)) && p.mia == null) p.mia = x.eleccion; }
      bo.clear(); guardarBorrador(d.codigo);
      const yo = d.jugadores.find((j) => j.yo); if (yo) yo.elegidos = d.partidos.filter((x) => x.mia != null).length;
      N() && N().vibrar('set'); hito('guardo');
      if (recienEntro) { try { d = (await CU().rpc('ver_desafio', { p_codigo: d.codigo })) || d; cache[d.codigo] = d; } catch (e) {} }
      pintarDesafio(d);
      aviso(empezados.size ? `Guardado. ${empezados.size === 1 ? 'Un partido ya había empezado y quedó afuera' : empezados.size + ' partidos ya habían empezado y quedaron afuera'}.` : 'Guardado. Ya no se cambian. ¡Suerte!', true);
      compartirYaHTML(d);
      if ((r.ya || []).length && !recienEntro) abrir(d.codigo);
    } catch (e) { aviso(e.message); if (b) { b.disabled = false; b.textContent = 'Guardar'; delete b.dataset.confirmar; } }
  }
  // ── compartir al guardar (27/10): el momento en que alguien acaba de jugar es el momento de traer a otro ──
  function textoInvitacion(d) { return `Ya elegí en "${d.nombre}" en Mano a mano. ${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'}, a ciegas, contra el modelo. ¿Te animas? ${link(d.codigo)}`; }
  function compartirYaHTML(d) {
    const el = $('[data-compartir-ya]'); if (!el) return;
    el.innerHTML = `<div class="mam-tarjeta mam-compartir-ya"><b>Listo. ¿A quién le mandas el desafío?</b><p class="mam-nota" style="margin:0">Cuanto más gente, mejor la tabla. El que entra con tu link juega gratis, con un apodo.</p>
      <div class="mam-fila"><button type="button" class="mam-boton chico crece wa" data-wa>Mandar por WhatsApp</button><button type="button" class="mam-boton secundario chico crece" data-otro>Otro</button></div></div>`;
    el.querySelector('[data-wa]').addEventListener('click', () => whatsapp(textoInvitacion(d)));
    el.querySelector('[data-otro]').addEventListener('click', () => compartir(d, textoInvitacion(d)));
    try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }
  function whatsapp(texto) {
    const url = 'https://wa.me/?text=' + encodeURIComponent(texto); const n = N();
    if (n && n.hayNativo && n.hayNativo()) { n.abrir(url); return; }
    try { window.open(url, '_blank'); } catch (e) { location.href = url; }
  }
  async function compartir(d, textoDado) {
    const texto = textoDado || `Te desafío en Mano a mano: "${d.nombre}", ${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'}. Elige quién gana y vemos quién sabe más. Código ${d.codigo}.`;
    const n = N();
    if (n && await n.compartir(texto, link(d.codigo), 'Mandar el desafío')) return;
    try { await navigator.clipboard.writeText(texto + ' ' + link(d.codigo)); aviso('Link copiado. Pégalo donde quieras.', true); } catch (e) { aviso('El link: ' + link(d.codigo), true); }
  }
  // ── compartir el resultado (19/10): 1080×1920, para historias y para WhatsApp. Dibujada acá, sin fotos ni logos.
  // Habla en primera persona (la comparte el que la genera): "Gané", "Voy primero". El ganador grande, la tabla corta
  // (yo y el modelo siempre aparecen) y la invitación: al próximo si terminó, a entrar si todavía quedan partidos.
  function imagenResultado(d, donde) {
    const r = resultado(d, conModelo(d));
    const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const F = (peso, t) => `${peso} ${t}px Poppins, system-ui, sans-serif`;
    const PELOTA = '#DFF140', CREMA = '#F3EEE6', GRIS = '#A39B93', CAJA = '#221D1A';
    const corta = (t, peso, tam, ancho) => { c.font = F(peso, tam); let x = String(t); while (c.measureText(x).width > ancho && x.length > 2) x = x.slice(0, -2) + '…'; return x; };
    const ajusta = (t, peso, tam, min, ancho) => { while (tam > min) { c.font = F(peso, tam); if (c.measureText(t).width <= ancho) break; tam -= 4; } return tam; };
    c.fillStyle = '#14110F'; c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.fillStyle = PELOTA; c.font = F(700, 34); c.fillText('MANO A MANO', W / 2, 150);
    c.fillStyle = GRIS; c.font = F(600, 30); c.fillText(d.oficial ? 'EL DESAFÍO DE LA SEMANA' : 'DESAFÍO', W / 2, 215);
    c.fillStyle = '#FFFFFF'; c.fillText(corta(d.nombre, 800, 54, 920), W / 2, 285);
    // el cartel del ganador
    const yo = r.yo ? r.yo.apodo : '';
    let titulo, quien;
    if (!r.jugados) { titulo = 'Arrancó'; quien = 'Todo por jugarse'; }
    else if (r.max <= 0) { titulo = r.fin ? 'Terminó' : 'Va'; quien = 'Nadie sumó'; }
    else if (r.soyYo) { titulo = r.fin ? 'Gané' : 'Voy primero'; quien = yo; }
    else { titulo = r.fin ? (r.arriba.length > 1 ? 'Empate arriba' : 'Ganó') : (r.arriba.length > 1 ? 'Van primeros' : 'Va primero'); quien = yLista(r.arriba.map((j) => j.apodo)); }
    c.fillStyle = r.fin ? PELOTA : CAJA; c.beginPath(); c.roundRect(80, 350, W - 160, 330, 40); c.fill();
    const tinta = r.fin ? '#14110F' : '#FFFFFF';
    c.fillStyle = r.fin ? '#14110F' : PELOTA; c.font = F(700, 40); c.fillText(titulo.toUpperCase(), W / 2, 440);
    const tq = ajusta(quien, 800, 104, 48, 840); c.fillStyle = tinta; c.font = F(800, tq); c.fillText(corta(quien, 800, tq, 860), W / 2, 560);
    c.fillStyle = r.fin ? '#3A332C' : GRIS; c.font = F(600, 34);
    c.fillText(r.max > 0 ? `${puntosTxt(r.max)} · ${r.jugados} de ${d.partidos.length} partidos jugados` : `${r.jugados} de ${d.partidos.length} partidos jugados`, W / 2, 630);
    // la tabla corta: los 5 primeros, y siempre yo y el modelo
    let filas = r.tabla.slice(0, 5);
    for (const j of [r.yo, r.modelo]) if (j && !filas.includes(j)) filas.push(j);
    filas = filas.slice(0, 7).sort((a, b) => a.puesto - b.puesto);
    let y = 740; const alto = 92, gap = 14;
    for (const j of filas) {
      c.fillStyle = CAJA; c.beginPath(); c.roundRect(80, y, W - 160, alto, 24); c.fill();
      if (j.yo) { c.strokeStyle = PELOTA; c.lineWidth = 5; c.beginPath(); c.roundRect(82, y + 2, W - 164, alto - 4, 22); c.stroke(); }
      c.textAlign = 'left'; c.fillStyle = GRIS; c.font = F(700, 38); c.fillText(j.puesto + 'º', 120, y + 60);
      c.fillStyle = j.modelo ? GRIS : '#FFFFFF'; c.fillText(corta(j.apodo + (j.yo ? ' (yo)' : ''), j.modelo ? 600 : 700, 38, 640), 220, y + 60);
      c.textAlign = 'right'; c.fillStyle = j.yo ? PELOTA : '#FFFFFF'; c.font = F(800, 42); c.fillText(String(j.puntos || 0), W - 120, y + 62);
      y += alto + gap;
    }
    c.textAlign = 'center';
    if (d.oficial && (d.total || 0) >= 10) { c.fillStyle = GRIS; c.font = F(500, 28); c.fillText(`${d.total} juegan`, W / 2, y + 36); }
    // la invitación
    const sitio = String((S().desafios || {}).dominio || 'https://armael11.com').replace(/^https?:\/\//, '').replace(/\/$/, '') + '/app';
    const [inv1, inv2] = r.fin ? ['¿Te animas al próximo?', 'Arma tu desafío en ' + sitio]
      : r.quedan ? ['Todavía estás a tiempo', 'Entra con el código ' + d.codigo] : ['¿Te animas al próximo?', sitio];
    c.fillStyle = PELOTA; c.font = F(800, 60); c.fillText(inv1, W / 2, H - 330);
    c.fillStyle = CREMA; c.font = F(600, 38); c.fillText(inv2, W / 2, H - 262);
    c.fillStyle = GRIS; c.font = F(500, 30); c.fillText('Fútbol, tenis y NBA · gratis, con un apodo', W / 2, H - 200);
    c.fillStyle = '#6B6359'; c.font = F(500, 26); c.fillText('Mano a mano · app independiente', W / 2, H - 140);
    const data = cv.toDataURL('image/png'); const n = N();
    if (n) n.compartirImagen(data, 'resultado-' + d.codigo + '.png', textoResultado(d, r));
    const im = document.createElement('img'); im.className = 'mam-imagen'; im.src = data; im.alt = 'El resultado del desafío';
    const t = donde || $('.mam-tarjeta'); if (t) { t.querySelectorAll('.mam-imagen').forEach((x) => x.remove()); t.appendChild(im); }
    return data;
  }
  function textoResultado(d, r) {
    const l = link(d.codigo), n = `"${d.nombre}"`;
    if (!r.jugados || r.max <= 0) return `${n} en Mano a mano: ${r.fin ? 'terminó sin puntos para nadie' : 'todavía nadie suma'}. ¿Te animas? ${l}`;
    if (r.fin && r.soyYo) return `Gané ${n} en Mano a mano, con ${puntosTxt(r.max)}. ¿Te animas a la revancha? ${l}`;
    if (r.soyYo) return `Voy primero en ${n}, en Mano a mano. ${r.quedan ? 'Todavía estás a tiempo de entrar: ' : '¿Quién me alcanza? '}${l}`;
    const quien = yLista(r.arriba.map((j) => j.apodo));
    const lider = r.arriba.length > 1 ? `empatan arriba ${quien}` : `${r.fin ? 'ganó' : 'va primero'} ${quien}`;
    const mio = r.yo ? ` Yo salí ${r.yo.puesto}º.` : '';
    return `${r.fin ? 'Terminó' : 'Así va'} ${n} en Mano a mano: ${lider} con ${puntosTxt(r.max)}.${r.fin ? mio : ''} ${r.quedan ? 'Todavía estás a tiempo: ' : '¿Quién sabe más? '}${l}`;
  }

  // mis elecciones, para historias: 1080×1920, dibujada acá. Lo que elegí en cada partido (lo de los demás no: es a ciegas).
  function imagenElecciones(d) {
    const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const F = (peso, t) => `${peso} ${t}px Poppins, system-ui, sans-serif`;
    c.fillStyle = '#14110F'; c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.fillStyle = '#DFF140'; c.font = F(700, 34); c.fillText('MANO A MANO', W / 2, 190);
    c.fillStyle = '#FFFFFF'; c.font = F(800, 76); c.fillText('Mis elecciones', W / 2, 290);
    c.fillStyle = '#A39B93'; c.font = F(500, 36); c.fillText(d.nombre.slice(0, 38), W / 2, 350);
    const ps = d.partidos.filter((p) => p.mia != null).slice(0, 7);
    const alto = 150, gap = 18; let y = Math.max(430, (H - (ps.length * (alto + gap))) / 2 - 80);
    const COLOR = { futbol: '#177A40', tenis: '#C2542E', nba: '#E8731C' };
    for (const p of ps) {
      c.fillStyle = '#221D1A'; c.beginPath(); c.roundRect(80, y, W - 160, alto, 28); c.fill();
      c.fillStyle = COLOR[p.deporte] || '#A39B93'; c.beginPath(); c.arc(126, y + alto / 2, 12, 0, Math.PI * 2); c.fill();
      c.textAlign = 'left'; c.fillStyle = '#A39B93'; c.font = F(500, 28); c.fillText((p.local + ' – ' + p.visita).slice(0, 34), 160, y + 58);
      c.fillStyle = '#FFFFFF'; c.font = F(800, 46); c.fillText(NOMBRE_OP(p, p.mia).slice(0, 22), 160, y + 116);
      y += alto + gap;
    }
    c.textAlign = 'center';
    c.fillStyle = '#DFF140'; c.font = F(800, 60); c.fillText('¿Te animas?', W / 2, H - 330);
    c.fillStyle = '#F3EEE6'; c.font = F(600, 38); c.fillText('Entra con el código ' + d.codigo, W / 2, H - 260);
    c.fillStyle = '#A39B93'; c.font = F(500, 30); c.fillText('Fútbol, tenis y NBA · gratis, con un apodo', W / 2, H - 200);
    c.fillStyle = '#6B6359'; c.font = F(500, 26); c.fillText('Mano a mano · app independiente', W / 2, H - 140);
    const data = cv.toDataURL('image/png'); const n = N();
    const texto = `Mis elecciones en "${d.nombre}". ¿Te animas? Código ${d.codigo}: ${link(d.codigo)}`;
    if (n) n.compartirImagen(data, 'mis-elecciones-' + d.codigo + '.png', texto);
    const im = document.createElement('img'); im.className = 'mam-imagen'; im.src = data; im.alt = 'Mis elecciones';
    const t = $('.mam-tarjeta'); if (t) { t.querySelectorAll('.mam-imagen').forEach((x) => x.remove()); t.appendChild(im); }
  }
  // ── entrada ──
  function pintar(contexto) {
    ctx = contexto; raizEl = document.getElementById('mam-desafios');
    if (ctx.codigo) { const c = ctx.codigo; ctx.codigo = null; return abrir(c); }
    if (vista.que === 'desafio' && vista.codigo) return abrir(vista.codigo);
    return pintarLista();
  }
  async function refrescarGlobo() { try { if (!necesitaApodo()) actualizarGlobo((await CU().rpc('mis_desafios')) || []); } catch (e) {} }
  // cuando llegan marcadores nuevos, el desafío abierto se vuelve a pintar (sin perder el scroll)
  try { raiz.addEventListener('mam-vivo', () => { if (vista.que !== 'desafio' || !raizEl) return; const d = cache[vista.codigo]; if (!d || !ctx.vivo || !d.partidos.some((p) => p.empezo && !p.resultado && ctx.vivo(p.deporte, p.partido))) return; const c = raizEl.closest('.mam-pantalla') || document.scrollingElement; const y = c ? c.scrollTop : 0; pintarDesafio(d); if (c) c.scrollTop = y; }); } catch (e) {}
  raiz.mamDesafios = { pintar, abrir, pintarLista, pintarCrear, pintarUnirme, refrescarGlobo, imagenElecciones, imagenResultado, _resultado: (d) => { const r = resultado(d, conModelo(d)); return Object.assign(r, { texto: textoResultado(d, r) }); }, _vista: () => vista };
})(typeof window !== 'undefined' ? window : globalThis);
