// mam.js — el cascarón de Mano a mano. Script clásico, sin bundler.
// Arriba el deporte (Fútbol · Tenis · NBA), abajo la función (Partidos · Jugá · Desafíos · Cuenta). Cada deporte
// es la web de siempre (Armá el 11, Sacá vos, el Quinteto) empaquetada adentro de un marco, en "modo app"
// (?mam=1): sin cabecera, sin pie, sin su propio panel de cuenta. Como los tres marcos y este cascarón viven en el
// mismo origen (capacitor://localhost), comparten localStorage: una sola sesión (tste.sesion) para todo.
//
// Lo que habla con los marcos (postMessage):
//   cascarón → marco   { mam: 'ir', a: 'partidos' | 'juga' }        cambiá de pestaña adentro
//   marco → cascarón   { mam: 'listo' }                              ya cargué y tengo los datos
//                      { mam: 'pase', deporte }                      el usuario tocó algo premium: mostrá los planes
//                      { mam: 'cuenta' }                             el usuario quiere entrar / ver su cuenta
//                      { mam: 'vibrar', tipo } · { mam: 'compartir', texto, url } · { mam: 'abrir', url }
(function (raiz) {
  'use strict';
  const S = () => raiz.MAM_SITIO || {};
  const CU = () => raiz.mamCuentas, N = () => raiz.mamNativo, T = () => raiz.mamTienda, D = () => raiz.mamDesafios;
  const DEPORTES = ['futbol', 'tenis', 'nba'];
  const NOMBRE = { futbol: 'Fútbol', tenis: 'Tenis', nba: 'NBA' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const guardar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };

  // ── el estado ──
  let deportes = leer('mam.deportes', null);          // los que sigue (orden de las solapas)
  let deporte = leer('mam.deporte', null);            // el que está mirando
  let pestana = leer('mam.pestana', 'partidos');       // partidos | juga | desafios | cuenta
  const marcos = {};                                   // deporte → { el, cargado, listo }
  let desafioPendiente = null;                         // un #desafio=CODIGO que llegó antes de estar listos
  let planPendiente = null;                            // el deporte cuyo plan hay que resaltar en Cuenta

  // ── los marcos ──
  function srcDe(d) {
    const base = (S().apps || {})[d] || ''; if (!base) return '';
    return base + (base.includes('?') ? '&' : '?') + 'mam=1';
  }
  function marco(d) {
    if (marcos[d]) return marcos[d];
    const el = $('mam-' + d); if (!el) return null;
    const m = { el, cargado: false, listo: false, esperando: [] };
    el.addEventListener('load', () => { m.cargado = true; });
    marcos[d] = m; return m;
  }
  function cargar(d) {
    const m = marco(d); if (!m || m.el.src) return m;
    m.el.src = srcDe(d);
    return m;
  }
  function ventana(d) { const m = marcos[d]; try { return m && m.el.contentWindow; } catch (e) { return null; } }
  function decirle(d, msj) { const w = ventana(d); if (!w) return; try { w.postMessage(msj, '*'); } catch (e) {} }
  function recargar(d) { const w = ventana(d); if (!w) return; try { w.location.reload(); } catch (e) { const m = marcos[d]; if (m) { m.el.src = ''; m.el.src = srcDe(d); } } }
  function recargarTodos() { for (const d of DEPORTES) if (marcos[d] && marcos[d].el.src) recargar(d); }
  // se cargan todos (los datos de los tres hacen falta para armar un desafío), pero primero el que se está mirando
  function cargarTodos() {
    cargar(deporte);
    setTimeout(() => { for (const d of DEPORTES) if (d !== deporte) cargar(d); }, 1200);
  }
  // los marcos avisan 'listo'; si un marco viejo no avisa, con el load alcanza
  function listo(d) { const m = marcos[d]; return !!(m && (m.listo || m.cargado)); }
  function cuandoEsteListo(d, fn) {
    const m = marco(d); if (!m) return fn();
    if (listo(d)) return fn();
    m.esperando.push(fn);
    setTimeout(() => { const i = m.esperando.indexOf(fn); if (i >= 0) { m.esperando.splice(i, 1); fn(); } }, 6000);
  }

  // ── pintar ──
  function pintarDeportes() {
    const nav = $('mam-deportes');
    nav.querySelectorAll('[data-deporte]').forEach((b) => {
      const d = b.dataset.deporte;
      b.hidden = !(deportes || DEPORTES).includes(d);
      b.setAttribute('aria-selected', d === deporte ? 'true' : 'false');
    });
    document.documentElement.dataset.deporte = deporte || '';
    nav.hidden = (pestana === 'desafios' || pestana === 'cuenta');
  }
  function pintarBarra() {
    $('mam-barra').querySelectorAll('[data-pestana]').forEach((b) => b.setAttribute('aria-selected', b.dataset.pestana === pestana ? 'true' : 'false'));
  }
  // Jugá: tenis juega adentro de su web (el saque); fútbol y NBA tienen sus juegos en el cascarón (juegos.js),
  // y fútbol además puede ir al fantasy de su web.
  let JUGA = leer('mam.juga', { futbol: 'penales', nba: 'triples' });
  const JUEGOS_DE = { futbol: [['penales', 'Penales'], ['libre', 'Tiro libre'], ['fantasy', 'Fantasy']], nba: [['triples', 'Triples']] };
  function jugaEnMarco() { return pestana === 'juga' && (deporte === 'tenis' || (JUGA[deporte] || '') === 'fantasy'); }
  function pintarJuga() {
    const el = $('mam-juga'); const lista = JUEGOS_DE[deporte] || []; const sel = JUGA[deporte] || (lista[0] && lista[0][0]);
    el.innerHTML = `<div class="mam-chips" data-juegos>${lista.map(([k, n]) => `<button type="button" data-j="${k}" aria-pressed="${k === sel ? 'true' : 'false'}">${n}</button>`).join('')}</div><div data-juego></div>`;
    el.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => { JUGA[deporte] = b.dataset.j; guardar('mam.juga', JUGA); mostrar(); }));
    if (raiz.mamJuegos && sel && sel !== 'fantasy') raiz.mamJuegos.montar(el.querySelector('[data-juego]'), sel, { vibrar: (t) => N() && N().vibrar(t), compartir: (t) => N() && N().compartir(t, (S().tiendas || {}).play || '', 'Mano a mano'), rival: { nombre: 'el modelo' } });
  }
  function mostrar() {
    pintarDeportes(); pintarBarra();
    const enMarco = pestana === 'partidos' || jugaEnMarco();
    const juegoPropio = pestana === 'juga' && !jugaEnMarco();
    if (!juegoPropio && raiz.mamJuegos) raiz.mamJuegos.desmontar();
    $('mam-marcos').hidden = !enMarco;
    for (const d of DEPORTES) { const el = $('mam-' + d); if (el) el.hidden = !(enMarco && d === deporte); }
    $('mam-juga').hidden = !juegoPropio;
    $('mam-desafios').hidden = pestana !== 'desafios';
    $('mam-cuenta').hidden = pestana !== 'cuenta';
    if (juegoPropio) pintarJuga();
    if (enMarco) { cargar(deporte); cuandoEsteListo(deporte, () => decirle(deporte, { mam: 'ir', a: pestana })); }
    if (pestana === 'desafios') D().pintar(contexto());
    if (pestana === 'cuenta') pintarCuenta();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function ir(p, d) {
    if (d && DEPORTES.includes(d)) { deporte = d; guardar('mam.deporte', d); if (deportes && !deportes.includes(d)) { deportes.push(d); guardar('mam.deportes', deportes); } }
    if (p) { pestana = p; guardar('mam.pestana', p); }
    mostrar();
    N() && N().vibrar('toque');
  }

  // ── la primera vez ──
  function bienvenida() {
    const sec = $('mam-bienvenida'); sec.hidden = false;
    const elegidos = new Set(['futbol']);
    sec.querySelectorAll('#mam-elegir [data-deporte]').forEach((b) => b.addEventListener('click', () => {
      const d = b.dataset.deporte;
      if (elegidos.has(d)) { if (elegidos.size === 1) return; elegidos.delete(d); } else elegidos.add(d);
      b.setAttribute('aria-pressed', elegidos.has(d) ? 'true' : 'false');
    }));
    $('mam-empezar').addEventListener('click', () => {
      deportes = DEPORTES.filter((d) => elegidos.has(d)); deporte = deportes[0];
      guardar('mam.deportes', deportes); guardar('mam.deporte', deporte);
      sec.hidden = true; cargarTodos();
      if (desafioPendiente) ir('desafios'); else mostrar();
      D().refrescarGlobo();
    });
  }

  // ── los partidos de los tres marcos, para armar un desafío ──
  // Cada uno: { deporte, partido, fuente, empieza (ms), local, visita, rotulo, opciones, p (prob. de que gane el local, si la hay) }
  const DIAS = 10;
  function partidosTenis() {
    const w = ventana('tenis'); const H = w && w.SV_HOY; if (!H || !Array.isArray(H.partidos)) return [];
    const out = [];
    for (const p of H.partidos) {
      if (!p || !p.k || !p.fecha || !p.hora || !p.a || !p.b) continue;
      const empieza = Date.parse(p.fecha + 'T' + p.hora + ':00Z') + 3 * 3600 * 1000;   // la hora viene en hora argentina
      if (!(empieza > 0)) continue;
      // la fuente lleva las claves de los dos jugadores: el servidor resuelve el partido buscándolos en `jugados`
      // (ahí el partido tiene otra clave), con la fecha
      out.push({ deporte: 'tenis', partido: String(p.k), fuente: 'tenis:' + (p.a.k || '') + ':' + (p.b.k || '') + ':' + p.fecha, empieza, local: p.a.nombre || '', visita: p.b.nombre || '',
        rotulo: [p.torneo, p.ronda].filter(Boolean).join(' · '), opciones: 2, p: typeof p.p === 'number' ? p.p : null });
    }
    return out;
  }
  function partidosFutbol() {
    const w = ventana('futbol'); const L = w && w.LIGAS; if (!L) return [];
    const out = [];
    const slugs = Array.isArray(w.LIGAS_DISPONIBLES) ? w.LIGAS_DISPONIBLES.map((x) => (typeof x === 'string' ? x : x && x.slug)).filter(Boolean) : Object.keys(L);
    for (const slug of slugs) {
      const liga = L[slug]; if (!liga || !Array.isArray(liga.partidos)) continue;
      for (const p of liga.partidos) {
        if (!p || p.id == null || !p.fecha) continue;
        const est = String(p.estado || '').toUpperCase();
        if (p.golL != null && p.golV != null && /FT|AET|PEN|FIN/.test(est)) continue;
        if (/POSTP|CANC|SUSP|ABD/.test(est)) continue;
        const empieza = Date.parse(p.fecha); if (!(empieza > 0)) continue;
        const eq = liga.equipos || {};
        const nom = (id) => (eq[id] && (eq[id].n || eq[id].nombre)) || String(id);
        out.push({ deporte: 'futbol', partido: String(p.id), fuente: slug, empieza, local: nom(p.local), visita: nom(p.visita),
          rotulo: [liga.nombre || slug, p.ronda].filter(Boolean).join(' · '), opciones: 3, p: null });
      }
    }
    return out;
  }
  function partidosNba() {
    const w = ventana('nba'); const H = w && w.NBA_HOY; if (!H || !Array.isArray(H.partidos)) return [];
    const out = [];
    for (const p of H.partidos) {
      if (!p || p.id == null || !p.fecha || !p.local || !p.visita) continue;
      const empieza = Date.parse(p.fecha); if (!(empieza > 0)) continue;
      const nom = (e) => e.n || e.nombre || e.codigo || String(e.id || '');
      out.push({ deporte: 'nba', partido: String(p.id), fuente: 'nba-hoy', empieza, local: nom(p.local), visita: nom(p.visita),
        rotulo: 'NBA', opciones: 2, p: p.m1 && typeof p.m1.p === 'number' ? p.m1.p : null });
    }
    return out;
  }
  function partidos() {
    const ahora = Date.now(), tope = ahora + DIAS * 86400000;
    const todos = [].concat(partidosFutbol(), partidosTenis(), partidosNba());
    const vistos = new Set();
    return todos.filter((p) => {
      if (p.empieza <= ahora + 5 * 60000 || p.empieza > tope) return false;
      const k = p.deporte + ':' + p.partido; if (vistos.has(k)) return false; vistos.add(k); return true;
    }).sort((a, b) => a.empieza - b.empieza || a.deporte.localeCompare(b.deporte));
  }
  // lo que el modelo elige hoy. Tenis y NBA ya traen el número; fútbol lo simula el marco (mamPronostico, en app.tpl.html)
  async function modelo(p) {
    try {
      if (p.deporte === 'tenis' || p.deporte === 'nba') { if (p.p == null) return null; return { eleccion: p.p >= 0.5 ? 1 : 2, p: p.p >= 0.5 ? p.p : 1 - p.p }; }
      if (p.deporte === 'futbol') {
        const w = ventana('futbol'); if (!w || typeof w.mamPronostico !== 'function') return null;
        const r = await Promise.race([w.mamPronostico(p.fuente, p.partido), new Promise((res) => setTimeout(() => res(null), 4000))]);
        if (!r) return null;
        const l = +r.l || 0, e = +r.e || 0, v = +r.v || 0;
        const max = Math.max(l, e, v); if (!(max > 0)) return null;
        return { eleccion: max === l ? 1 : max === e ? 2 : 3, p: max };
      }
    } catch (e) {}
    return null;
  }
  function contexto() {
    const codigo = desafioPendiente; desafioPendiente = null;
    return { partidos, modelo, ir: (p) => ir(p), alCambiarCuenta: () => { recargarTodos(); D().refrescarGlobo(); }, codigo };
  }

  // ── la cuenta ──
  let CU_ESTADO = { pases: null, comprando: false, precios: null, aviso: '', bien: false, pedido: false };
  async function pintarCuenta() {
    const raizEl = $('mam-cuenta'); const c = CU(); const n = N(); const nativo = !!(n && n.hayNativo());
    await c.asegurarSesion();
    const yo = c.quienSoy();
    if (yo && !c.perfil()) { try { await c.miPerfil(); } catch (e) {} }
    const perfil = c.perfil();
    const anonima = yo && c.esAnonima && c.esAnonima();
    if (yo && !CU_ESTADO.pases) { try { CU_ESTADO.pases = await c.misPases(); } catch (e) { CU_ESTADO.pases = { futbol: null, tenis: null, nba: null }; } }
    if (nativo && !CU_ESTADO.pedido) { CU_ESTADO.pedido = true; T().arrancar(yo && yo.uid).then(() => T().quienCompra(yo && yo.uid)).then(() => T().traerPrecios()).then((pr) => { CU_ESTADO.precios = pr; if (pestana === 'cuenta') pintarCuenta(); }); }
    const web = {};
    const s = S();
    let html = `<div class="mam-seccion"><span>Cuenta</span><small>${yo ? esc(perfil ? perfil.usuario : '') : 'sin cuenta todavía'}</small></div>`;
    if (!yo) {
      html += `<div class="mam-tarjeta">
        <h2 class="mam-titulo">Entrá con un apodo</h2>
        <p class="mam-nota">Alcanza para jugar desafíos. Sin mail, sin contraseña.</p>
        <form data-form-apodo class="mam-fila"><input class="mam-campo crece" name="apodo" placeholder="tu apodo" maxlength="16" autocomplete="nickname" required><button class="mam-boton chico" type="submit">Listo</button></form>
      </div>
      <div class="mam-tarjeta">
        <h2 class="mam-titulo">¿Ya tenés cuenta?</h2>
        <p class="mam-nota">La misma de Armá el 11, Sacá vos o el Quinteto.</p>
        <form data-form-entrar><input class="mam-campo" name="email" type="email" placeholder="tu mail" autocomplete="email" required><input class="mam-campo" name="clave" type="password" placeholder="contraseña" autocomplete="current-password" required>
        <div class="mam-fila"><button class="mam-boton chico" type="submit">Entrar</button><button class="mam-boton secundario chico" type="button" data-link>Mandame un link</button></div></form>
      </div>
      <div class="mam-aviso${CU_ESTADO.bien ? ' bien' : ''}" data-aviso>${esc(CU_ESTADO.aviso)}</div>`;
    } else {
      html += `<div class="mam-tarjeta">
        <h2 class="mam-titulo">Hola, ${esc(perfil ? perfil.usuario : 'jugador')}</h2>
        <form data-form-apodo class="mam-fila"><input class="mam-campo crece" name="apodo" placeholder="cambiar apodo" maxlength="16" value="${esc(perfil ? perfil.usuario : '')}"><button class="mam-boton secundario chico" type="submit">Cambiar</button></form>
        ${anonima ? `<p class="mam-nota">Tu cuenta vive en este teléfono. Si querés recuperarla en otro, atale un mail.</p>
        <form data-form-atar><input class="mam-campo" name="email" type="email" placeholder="tu mail" autocomplete="email" required><input class="mam-campo" name="clave" type="password" placeholder="una contraseña" autocomplete="new-password" required><button class="mam-boton secundario chico" type="submit">Atar el mail</button></form>` : ''}
        <div class="mam-aviso${CU_ESTADO.bien ? ' bien' : ''}" data-aviso>${esc(CU_ESTADO.aviso)}</div>
      </div>`;
      html += `<div class="mam-seccion"><span>Planes</span><small>los desafíos y los juegos son gratis siempre</small></div>
        <div class="mam-tarjeta" data-planes>${T().panelHTML({ pases: CU_ESTADO.pases || {}, nativo, precios: CU_ESTADO.precios, preciosWeb: web, comprando: CU_ESTADO.comprando })}</div>`;
      html += `<div class="mam-seccion"><span>Qué seguís</span></div>
        <div class="mam-tarjeta"><div class="mam-chips" data-sigo>${DEPORTES.map((d) => `<button type="button" data-d="${d}" aria-pressed="${(deportes || DEPORTES).includes(d) ? 'true' : 'false'}">${NOMBRE[d]}</button>`).join('')}</div></div>`;
      html += `<div class="mam-tarjeta">
        <div class="mam-fila" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><button type="button" class="mam-boton secundario chico" data-salir>Salir</button><button type="button" class="mam-boton secundario chico peligro" data-borrar>Borrar mi cuenta</button></div>
        <p class="mam-letra">Borrar la cuenta elimina tu perfil, tus desafíos y tus elecciones. No se puede deshacer. Las suscripciones se cancelan desde los ajustes del teléfono.</p>
      </div>`;
    }
    html += `<p class="mam-letra">App independiente, sin relación con ligas, torneos, jugadores ni equipos. <a href="${esc(s.privacidad || '#')}" data-abrir>Privacidad</a></p>`;
    raizEl.innerHTML = html;
    CU_ESTADO.aviso = ''; CU_ESTADO.bien = false;
    engancharCuenta(raizEl);
    if (planPendiente) { const b = raizEl.querySelector(`[data-plan="mam.${planPendiente}"]`); planPendiente = null; if (b) { b.classList.add('resaltado'); try { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} } }
  }
  const avisoCuenta = (t, bien) => { const a = $('mam-cuenta').querySelector('[data-aviso]'); if (a) { a.textContent = t || ''; a.classList.toggle('bien', !!bien); } };
  function engancharCuenta(raizEl) {
    const c = CU(); const n = N();
    const form = (sel, fn) => { const f = raizEl.querySelector(sel); if (f) f.addEventListener('submit', async (ev) => { ev.preventDefault(); const b = f.querySelector('button[type=submit]'); if (b) b.disabled = true; try { await fn(f); } catch (e) { avisoCuenta(e.message); if (b) b.disabled = false; } }); return f; };
    form('[data-form-apodo]', async (f) => { await c.entrarConApodo(f.apodo.value); CU_ESTADO.pases = null; CU_ESTADO.aviso = 'Listo.'; CU_ESTADO.bien = true; cambioDeCuenta(); pintarCuenta(); });
    const fe = form('[data-form-entrar]', async (f) => { await c.entrarConClave(f.email.value, f.clave.value); CU_ESTADO.pases = null; CU_ESTADO.pedido = false; cambioDeCuenta(); pintarCuenta(); });
    if (fe) { const l = fe.querySelector('[data-link]'); l.addEventListener('click', async () => { l.disabled = true; try { await c.pedirLink(fe.email.value, (S().desafios || {}).dominio + '/'); avisoCuenta('Te mandé un link al mail. Abrilo desde este teléfono.', true); } catch (e) { avisoCuenta(e.message); l.disabled = false; } }); }
    form('[data-form-atar]', async (f) => { await c.atarMail(f.email.value, f.clave.value); CU_ESTADO.aviso = 'Te mandé un mail para confirmarlo. Mientras tanto, seguís jugando igual.'; CU_ESTADO.bien = true; pintarCuenta(); });
    const salir = raizEl.querySelector('[data-salir]'); if (salir) salir.addEventListener('click', () => { c.salir(); CU_ESTADO = { pases: null, comprando: false, precios: CU_ESTADO.precios, aviso: '', bien: false, pedido: false, web: CU_ESTADO.web }; T().quienCompra(null); cambioDeCuenta(); pintarCuenta(); });
    const borrar = raizEl.querySelector('[data-borrar]'); if (borrar) borrar.addEventListener('click', async () => {
      if (borrar.dataset.seguro !== '1') { borrar.dataset.seguro = '1'; borrar.textContent = 'Tocá otra vez para borrar todo'; setTimeout(() => { borrar.dataset.seguro = ''; borrar.textContent = 'Borrar mi cuenta'; }, 6000); return; }
      borrar.disabled = true;
      try { await c.borrarMiCuenta(); CU_ESTADO = { pases: null, comprando: false, precios: CU_ESTADO.precios, aviso: 'Cuenta borrada.', bien: true, pedido: false, web: CU_ESTADO.web }; T().quienCompra(null); cambioDeCuenta(); pintarCuenta(); }
      catch (e) { avisoCuenta(e.message); borrar.disabled = false; }
    });
    raizEl.querySelectorAll('[data-sigo] [data-d]').forEach((b) => b.addEventListener('click', () => {
      const d = b.dataset.d; const act = (deportes || DEPORTES.slice());
      if (act.includes(d)) { if (act.length === 1) return; deportes = act.filter((x) => x !== d); if (deporte === d) { deporte = deportes[0]; guardar('mam.deporte', deporte); } }
      else { deportes = DEPORTES.filter((x) => act.includes(x) || x === d); cargar(d); }
      guardar('mam.deportes', deportes); pintarDeportes();
      raizEl.querySelectorAll('[data-sigo] [data-d]').forEach((x) => x.setAttribute('aria-pressed', deportes.includes(x.dataset.d) ? 'true' : 'false'));
    }));
    raizEl.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => comprar(b.dataset.plan)));
    const rest = raizEl.querySelector('[data-restaurar]'); if (rest) rest.addEventListener('click', async () => { rest.disabled = true; try { await T().restaurar(); await acreditar(); avisoCuenta('Compras restauradas.', true); } catch (e) { avisoCuenta(T().textoDeError(e)); } rest.disabled = false; });
    raizEl.querySelectorAll('[data-abrir]').forEach((a) => a.addEventListener('click', (ev) => { if (n && n.hayNativo()) { ev.preventDefault(); n.abrir(a.getAttribute('href')); } }));
  }
  function cambioDeCuenta() { recargarTodos(); D().refrescarGlobo(); }
  async function acreditar() {
    try { await CU().avisarPagoDeTienda(); } catch (e) {}
    CU_ESTADO.pases = await CU().misPases();
    recargarTodos();
  }
  async function comprar(plan) {
    const c = CU(); const n = N(); const nativo = !!(n && n.hayNativo());
    if (!c.quienSoy()) { avisoCuenta('Primero elegí un apodo.'); return; }
    if (CU_ESTADO.pases) { const pl = T().PLANES.find((x) => x.id === plan); if (pl && pl.da.every((d) => CU_ESTADO.pases[d])) return; }
    CU_ESTADO.comprando = true; await pintarCuenta();
    try {
      if (nativo) {
        await T().comprar(plan);
        await acreditar();
        CU_ESTADO.aviso = 'Listo. Ya tenés el plan.'; CU_ESTADO.bien = true;
        n.vibrar('partido');
      } else {
        /* en la web no se vende acá: cada deporte se compra en su propio sitio (Mercado Pago, en pesos) */
        const pl = T().PLANES.find((x) => x.id === plan); const d = pl && pl.da.length === 1 ? pl.da[0] : 'futbol';
        const url = (S().sitios || {})[d] || ''; if (url) window.open(url + '/#cuenta', '_blank');
      }
    } catch (e) {
      if (!T().cancelada(e)) CU_ESTADO.aviso = T().textoDeError(e);
    }
    CU_ESTADO.comprando = false; await pintarCuenta();
  }

  // ── los mensajes de los marcos ──
  window.addEventListener('message', (ev) => {
    const m = ev.data; if (!m || typeof m !== 'object' || !m.mam) return;
    const d = DEPORTES.find((x) => ventana(x) === ev.source) || m.deporte || deporte;
    if (m.mam === 'listo') { const mk = marcos[d]; if (mk) { mk.listo = true; const esp = mk.esperando.splice(0); esp.forEach((fn) => fn()); } return; }
    if (m.mam === 'pase') { planPendiente = DEPORTES.includes(m.deporte) ? m.deporte : d; CU_ESTADO.pases = null; ir('cuenta'); return; }
    if (m.mam === 'cuenta') { CU_ESTADO.pases = null; ir('cuenta'); return; }
    if (m.mam === 'sesion') { CU_ESTADO.pases = null; D().refrescarGlobo(); return; }   // el marco entró o salió
    if (m.mam === 'vibrar') { N() && N().vibrar(m.tipo); return; }
    if (m.mam === 'compartir') { N() && N().compartir(m.texto || '', m.url || '', m.titulo); return; }
    if (m.mam === 'abrir') { if (N() && N().hayNativo()) N().abrir(String(m.url || '')); else window.open(String(m.url || ''), '_blank'); return; }
    if (m.mam === 'desafios') { ir('desafios'); return; }
  });

  // ── los links que entran: #desafio=CODIGO (aviso, link universal, link del mail) ──
  function codigoDe(texto) {
    const m = /desafio(?:\.html)?[#=/]+([A-Z0-9]{4,8})/i.exec(String(texto || '')) || /[#&]desafio=([A-Z0-9]{4,8})/i.exec(String(texto || ''));
    return m ? m[1].toUpperCase() : null;
  }
  function abrirDesafio(codigo) {
    if (!codigo) return;
    desafioPendiente = codigo;
    try { if (/desafio=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    ir('desafios');
  }
  function leerHash() {
    const h = location.hash || '';
    const c = codigoDe(h); if (c) return abrirDesafio(c);
    if (/^#juegos/.test(h)) { history.replaceState(null, '', location.pathname); ir('juga'); }
    if (/^#desafios/.test(h)) { history.replaceState(null, '', location.pathname); ir('desafios'); }
  }

  // ── la red ──
  function red(hay) { document.body.classList.toggle('mam-sin-red', !hay); }

  // ── arranque ──
  async function arrancar() {
    const n = N(); const c = CU();
    if (c.capturarVuelta()) { CU_ESTADO.pases = null; }   // volvió del link del mail
    await c.asegurarSesion();
    if (c.quienSoy()) { try { await c.miPerfil(); } catch (e) {} }
    $('mam-deportes').addEventListener('click', (ev) => { const b = ev.target.closest('[data-deporte]'); if (b) ir(pestana === 'partidos' || pestana === 'juga' ? pestana : 'partidos', b.dataset.deporte); });
    $('mam-barra').addEventListener('click', (ev) => { const b = ev.target.closest('[data-pestana]'); if (b) ir(b.dataset.pestana); });
    if (n) { n.engancharLinks(document); n.alCambiarRed(red); n.hayRed().then(red); n.alAbrirLink((url) => { const cd = codigoDe(url); if (cd) abrirDesafio(cd); }); }
    window.addEventListener('hashchange', leerHash);
    window.addEventListener('mam-aviso', (ev) => { const d = ev.detail || {}; if (d.desafio) abrirDesafio(String(d.desafio)); });
    document.body.classList.remove('mam-cargando');
    if (!deportes || !deportes.length) { bienvenida(); const cd = codigoDe(location.hash); if (cd) desafioPendiente = cd; return; }
    if (!deporte || !deportes.includes(deporte)) deporte = deportes[0];
    cargarTodos();
    const cd = codigoDe(location.hash);
    if (cd) abrirDesafio(cd); else { if (/^#juegos/.test(location.hash)) pestana = 'juga'; mostrar(); }
    D().refrescarGlobo();
    setInterval(() => { if (document.visibilityState === 'visible') D().refrescarGlobo(); }, 5 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { CU().asegurarSesion(); D().refrescarGlobo(); } });
    // volver a Desafíos después de la bienvenida con un código pendiente
    if (desafioPendiente && pestana !== 'desafios') ir('desafios');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();

  raiz.mam = { ir, partidos, modelo, abrirDesafio, recargarTodos, estado: () => ({ deportes, deporte, pestana }), _marcos: marcos };
})(typeof window !== 'undefined' ? window : globalThis);
