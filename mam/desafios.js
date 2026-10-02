// desafios.js — los desafíos de Mano a mano. Script clásico, expone window.mamDesafios.
// Elegís partidos (de uno o varios días, de los tres deportes), le ponés nombre, mandás el link. Los que entran
// eligen quién gana. Todos a ciegas: nadie ve la elección de otro ni la del modelo hasta que el partido empieza
// (eso lo decide el servidor, en ver_desafio; acá solo se dibuja). Un punto por cada partido que elegís bien. Tabla. Sin plata, sin premios.
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
  const aviso = (t, bien) => { const a = $('[data-aviso]'); if (a) { a.textContent = t || ''; a.classList.toggle('bien', !!bien); } };
  const link = (codigo) => (S().desafios || {}).dominio + ((S().desafios || {}).ruta || '/desafio.html') + '#' + codigo;

  // ── el apodo, antes que nada ──
  function necesitaApodo() { const c = CU(); return !(c && c.quienSoy() && c.perfil()); }
  function apodoHTML(porque) {
    return `<div class="mam-tarjeta">
      <h2 class="mam-titulo">¿Cómo te llamás?</h2>
      <p class="mam-nota">${esc(porque || 'Un apodo alcanza para jugar. Sin mail, sin contraseña. Es el nombre que van a ver tus amigos en la tabla.')}</p>
      <form data-form-apodo class="mam-fila"><input class="mam-campo crece" name="apodo" placeholder="tu apodo" maxlength="16" autocomplete="nickname" required><button class="mam-boton chico" type="submit">Listo</button></form>
      <div class="mam-aviso" data-aviso></div>
      <p class="mam-nota">¿Ya tenés cuenta en Armá el 11, Sacá vos o el Quinteto? <a href="#" data-ir-cuenta>Entrá con tu mail</a>.</p>
    </div>`;
  }
  function engancharApodo(despues) {
    const f = $('[data-form-apodo]'); if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const b = f.querySelector('button'); b.disabled = true; aviso('Creando tu cuenta…');
      try { await CU().entrarConApodo(f.apodo.value); if (ctx.alCambiarCuenta) ctx.alCambiarCuenta(); despues(); }
      catch (e) { aviso(e.message); b.disabled = false; }
    });
    const c = $('[data-ir-cuenta]'); if (c) c.addEventListener('click', (ev) => { ev.preventDefault(); ctx.ir('cuenta'); });
  }

  // ── la lista ──
  async function pintarLista() {
    vista = { que: 'lista' };
    if (necesitaApodo()) { raizEl.innerHTML = `<div class="mam-seccion"><span>Desafíos</span><small>contra tus amigos y contra el modelo</small></div>${apodoHTML()}${comoFuncionaHTML()}`; engancharApodo(pintarLista); return; }
    raizEl.innerHTML = `<div class="mam-seccion"><span>Desafíos</span><small>contra tus amigos y contra el modelo</small></div>
      <div class="mam-fila"><button type="button" class="mam-boton" data-crear style="margin:0">Crear un desafío</button><button type="button" class="mam-boton secundario" data-unirme style="margin:0">Tengo un código</button></div>
      <div class="mam-aviso" data-aviso></div>
      <ul class="mam-lista" data-lista><li class="mam-vacio">Cargando…</li></ul>`;
    $('[data-crear]').addEventListener('click', pintarCrear);
    $('[data-unirme]').addEventListener('click', pintarUnirme);
    let mios = [];
    try { mios = (await CU().rpc('mis_desafios')) || []; } catch (e) { aviso(e.message); }
    const ul = $('[data-lista]'); if (!ul) return;
    if (!mios.length) { ul.innerHTML = `<li class="mam-vacio">Todavía no tenés desafíos. Creá uno y mandale el link a un amigo.</li>${comoFuncionaHTML()}`; return; }
    ul.innerHTML = mios.map((d) => `<li><button type="button" class="mam-desafio-item" data-abrir="${esc(d.codigo)}">
      <b>${esc(d.nombre)}</b><span class="puesto">${d.estado === 'abierto' ? '' : (d.puesto || '') + 'º'}</span>
      <small>${d.jugadores} ${d.jugadores === 1 ? 'jugador' : 'jugadores'} · ${d.partidos} ${d.partidos === 1 ? 'partido' : 'partidos'} · <span class="mam-estado ${esc(d.estado.replace(' ', '-'))}">${esc(d.estado)}</span>${d.proximo ? ' · próximo ' + esc(diaTexto(diaDe(Date.parse(d.proximo)))) + ' ' + esc(horaDe(Date.parse(d.proximo))) : ''}</small></button></li>`).join('');
    ul.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.abrir)));
    actualizarGlobo(mios);
  }
  function comoFuncionaHTML() {
    return `<div class="mam-tarjeta" style="margin-top:6px"><b>Cómo es</b><p class="mam-nota" style="margin:0">Elegís partidos de fútbol, tenis o NBA, de hoy o de la semana, y mandás el link. Cada uno elige quién gana, a ciegas: las elecciones se ven recién cuando empieza el partido. Un punto por cada partido que elegís bien. El modelo también juega, y pierde seguido.</p></div>`;
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
      <div class="mam-pegajoso"><span class="crece mam-nota" data-cuenta>Elegí entre 1 y 30 partidos</span><button type="button" class="mam-boton chico" data-crear-ya disabled>Crear</button></div>
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
    const n = SEL.size; $('[data-cuenta]').textContent = n ? `${n} ${n === 1 ? 'partido' : 'partidos'} elegidos` : 'Elegí entre 1 y 30 partidos'; $('[data-crear-ya]').disabled = !n;
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
    if (necesitaApodo()) {
      raizEl.innerHTML = `<div class="mam-seccion"><span>Te desafiaron</span></div>${resumenHTML(d)}${apodoHTML(`${d.creador ? esc(d.creador) + ' te desafió' : 'Te desafiaron'}: ${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'}. Elegí un apodo para entrar.`)}`;
      engancharApodo(() => unirme(codigo)); return;
    }
    if (!d.soy) {
      raizEl.innerHTML = `<div class="mam-seccion"><span>Te desafiaron</span></div>${resumenHTML(d)}<button type="button" class="mam-boton" data-entrar>Entrar al desafío</button><div class="mam-aviso" data-aviso></div><button type="button" class="mam-boton secundario" data-volver>Ahora no</button>`;
      $('[data-entrar]').addEventListener('click', () => unirme(codigo)); $('[data-volver]').addEventListener('click', pintarLista); return;
    }
    pintarDesafio(d, recienCreado);
  }
  function resumenHTML(d) {
    return `<div class="mam-tarjeta"><h2 class="mam-titulo">${esc(d.nombre)}</h2><p class="mam-nota" style="margin:0">${d.creador ? 'Lo armó ' + esc(d.creador) + '. ' : ''}${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'} · ${d.jugadores.length} ${d.jugadores.length === 1 ? 'jugador' : 'jugadores'}.</p>
      <ul class="mam-lista">${d.partidos.slice(0, 6).map((p) => `<li class="mam-nota">${esc(p.local)} – ${esc(p.visita)} · ${esc(p.rotulo || DEPORTE[p.deporte])}</li>`).join('')}${d.partidos.length > 6 ? `<li class="mam-nota">y ${d.partidos.length - 6} más</li>` : ''}</ul></div>`;
  }
  const NOMBRE_OP = (p, i) => (p.opciones === 3 ? [p.local, 'Empate', p.visita] : [p.local, p.visita])[i - 1] || '';
  function pintarDesafio(d, recienCreado) {
    const pendientes = d.partidos.filter((p) => !p.empezo && p.mia == null).length;
    const jugadores = d.jugadores.slice();
    if (d.modelo_juega > 0) jugadores.push({ apodo: 'el modelo', puntos: d.modelo_puntos, modelo: true, elegidos: d.modelo_juega });
    jugadores.sort((a, b) => b.puntos - a.puntos);
    let html = `<div class="mam-seccion"><span>${esc(d.estado)}</span><button type="button" class="mam-boton secundario chico" data-volver>Mis desafíos</button></div>
      <div class="mam-tarjeta">
        <h2 class="mam-titulo">${esc(d.nombre)}</h2>
        <div class="mam-codigo"><span class="mam-nota">Código del desafío</span><b>${esc(d.codigo)}</b></div>
        <div class="mam-fila"><button type="button" class="mam-boton chico crece" data-compartir>Mandar el link</button>${d.estado !== 'abierto' ? '<button type="button" class="mam-boton secundario chico crece" data-imagen>Imagen de la tabla</button>' : ''}</div>
        ${recienCreado ? '<p class="mam-nota">Listo. Mandale el link a tus amigos y elegí tus ganadores abajo.</p>' : ''}
        ${pendientes ? `<p class="mam-nota">Te faltan ${pendientes} ${pendientes === 1 ? 'partido' : 'partidos'} por elegir.</p>` : ''}
      </div>
      <div class="mam-aviso" data-aviso></div>`;
    let dia = '';
    for (const p of d.partidos) {
      const dd = diaDe(Date.parse(p.empieza));
      if (dd !== dia) { dia = dd; html += `<div class="mam-dia">${esc(diaTexto(dd))}</div>`; }
      html += partidoHTML(d, p);
    }
    html += `<div class="mam-seccion"><span>Tabla</span><small>un punto por cada partido bien elegido</small></div>
      <div class="mam-tarjeta"><table class="mam-tabla"><thead><tr><th>#</th><th>jugador</th><th>elegidos</th><th>puntos</th></tr></thead><tbody>
      ${jugadores.map((j, i) => `<tr class="${j.yo ? 'yo' : ''}${j.modelo ? ' modelo' : ''}"><td>${i + 1}</td><td>${esc(j.apodo)}${j.creador ? ' <small class="mam-nota">(lo armó)</small>' : ''}</td><td>${j.elegidos}/${d.partidos.length}</td><td>${j.puntos}</td></tr>`).join('')}
      </tbody></table>
      ${d.modelo_juega > 0 ? '<p class="mam-nota">El modelo elige antes de que empiece cada partido y se revela cuando empieza, igual que vos.</p>' : ''}
      ${d.estado === 'terminado' ? '<button type="button" class="mam-boton" data-revancha>Revancha</button>' : ''}
      </div>`;
    raizEl.innerHTML = html;
    $('[data-volver]').addEventListener('click', pintarLista);
    $('[data-compartir]').addEventListener('click', () => compartir(d));
    const im = $('[data-imagen]'); if (im) im.addEventListener('click', () => imagen(d));
    const rv = $('[data-revancha]'); if (rv) rv.addEventListener('click', () => pintarCrear({ nombre: 'Revancha: ' + d.nombre.replace(/^Revancha: /, '').slice(0, 50) }));
    raizEl.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', () => elegir(d, b.dataset.deporte, b.dataset.partido, Number(b.dataset.elegir))));
  }
  function partidoHTML(d, p) {
    const op = p.opciones === 3 ? [1, 2, 3] : [1, 2];
    const bloqueado = p.empezo;
    const botones = op.map((i) => {
      const nombre = i === 2 && p.opciones === 3 ? 'Empate' : NOMBRE_OP(p, i);
      let cls = '';
      if (p.resultado) cls = p.resultado === i ? ' acierto' : ' error';
      return `<button type="button" class="${cls}" data-elegir="${i}" data-deporte="${esc(p.deporte)}" data-partido="${esc(p.partido)}" aria-pressed="${p.mia === i ? 'true' : 'false'}" ${bloqueado ? 'disabled' : ''}>${esc(nombre)}</button>`;
    });
    const estado = p.resultado ? (p.mia == null ? 'no elegiste' : p.mia === p.resultado ? '✓ la tuya' : 'no fue')
      : bloqueado ? 'empezó: cerrado' : (p.mia == null ? 'elegí' : 'elegido');
    let revelado = '';
    if (p.empezo) {
      const otros = Object.entries(p.elecciones || {}).map(([a, e]) => `<span><b>${esc(a)}</b> ${esc(NOMBRE_OP(p, e))}</span>`);
      if (p.modelo) otros.unshift(`<span><b>el modelo</b> ${esc(NOMBRE_OP(p, p.modelo))}${p.modelo_p ? ' (' + Math.round(p.modelo_p * 100) + '%)' : ''}</span>`);
      revelado = `<div class="mam-revelado">${otros.join('') || '<span>nadie eligió</span>'}</div>`;
    }
    return `<div class="mam-tarjeta mam-partido-juego">
      <div class="mam-fila"><span class="crece"><b>${esc(p.rotulo || DEPORTE[p.deporte])}</b> <small class="mam-nota">· ${esc(horaDe(Date.parse(p.empieza)))}</small></span><small class="mam-nota">${esc(estado)}</small></div>
      <div class="mam-eleccion${p.opciones === 3 ? ' tres' : ''}">${botones.length === 2 ? botones[0] + '<span>o</span>' + botones[1] : botones.join('')}</div>
      ${revelado}</div>`;
  }
  async function elegir(d, deporte, partido, eleccion) {
    try {
      await CU().rpc('elegir_desafio', { p_codigo: d.codigo, p_deporte: deporte, p_partido: partido, p_eleccion: eleccion });
      N() && N().vibrar('toque');
      const p = d.partidos.find((x) => x.deporte === deporte && x.partido === partido); if (p) p.mia = eleccion;
      const yo = d.jugadores.find((j) => j.yo); if (yo) yo.elegidos = d.partidos.filter((x) => x.mia != null).length;
      pintarDesafio(d);
    } catch (e) { aviso(e.message); if (/empezó/.test(e.message)) abrir(d.codigo); }
  }
  async function compartir(d) {
    const texto = `Te desafío en Mano a mano: "${d.nombre}", ${d.partidos.length} ${d.partidos.length === 1 ? 'partido' : 'partidos'}. Elegí quién gana y vemos quién sabe más. Código ${d.codigo}.`;
    const n = N();
    if (n && await n.compartir(texto, link(d.codigo), 'Mandar el desafío')) return;
    try { await navigator.clipboard.writeText(texto + ' ' + link(d.codigo)); aviso('Link copiado. Pegalo donde quieras.', true); } catch (e) { aviso('El link: ' + link(d.codigo), true); }
  }
  // la imagen de la tabla: 1080×1350, dibujada acá, sin fotos ni logos
  function imagen(d) {
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = '#14110F'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#F6F1EA'; c.font = '800 54px Poppins, system-ui, sans-serif'; c.textAlign = 'left';
    c.fillText('Mano a mano', 80, 130);
    c.font = '500 34px Poppins, system-ui, sans-serif'; c.fillStyle = '#A39B93'; c.fillText(d.nombre.slice(0, 40), 80, 185);
    const js = d.jugadores.slice(); if (d.modelo_juega > 0) js.push({ apodo: 'el modelo', puntos: d.modelo_puntos, modelo: true }); js.sort((a, b) => b.puntos - a.puntos);
    const top = js.slice(0, 8); let y = 300;
    for (let i = 0; i < top.length; i++) {
      const j = top[i]; const alto = i === 0 ? 120 : 90;
      c.fillStyle = i === 0 ? '#C2542E' : (j.modelo ? '#2A323E' : '#242B36'); c.beginPath(); c.roundRect(80, y, W - 160, alto, 22); c.fill();
      c.fillStyle = '#F6F1EA'; c.font = `800 ${i === 0 ? 56 : 42}px Poppins, system-ui, sans-serif`; c.textAlign = 'left'; c.fillText((i + 1) + 'º  ' + j.apodo.slice(0, 16), 110, y + alto / 2 + (i === 0 ? 20 : 15));
      c.textAlign = 'right'; c.fillText(String(j.puntos), W - 110, y + alto / 2 + (i === 0 ? 20 : 15));
      y += alto + 16;
    }
    c.fillStyle = '#A39B93'; c.font = '500 30px Poppins, system-ui, sans-serif'; c.textAlign = 'left';
    const term = d.partidos.filter((p) => p.resultado).length;
    c.fillText(`${term} de ${d.partidos.length} partidos jugados · ${d.estado}`, 80, y + 50);
    c.fillStyle = '#F6F1EA'; c.font = '700 34px Poppins, system-ui, sans-serif'; c.fillText('¿Te animás? Código ' + d.codigo, 80, H - 120);
    c.fillStyle = '#A39B93'; c.font = '500 26px Poppins, system-ui, sans-serif'; c.fillText('Mano a mano · fútbol, tenis y NBA · app independiente', 80, H - 70);
    const n = N(); const data = cv.toDataURL('image/png');
    if (n) n.compartirImagen(data, 'mano-a-mano-' + d.codigo + '.png', `"${d.nombre}" en Mano a mano. Código ${d.codigo}.`);
    const im = document.createElement('img'); im.className = 'mam-imagen'; im.src = data; im.alt = 'La tabla del desafío';
    const t = $('.mam-tarjeta'); if (t) t.appendChild(im);
  }

  // ── entrada ──
  function pintar(contexto) {
    ctx = contexto; raizEl = document.getElementById('mam-desafios');
    if (ctx.codigo) { const c = ctx.codigo; ctx.codigo = null; return abrir(c); }
    if (vista.que === 'desafio' && vista.codigo) return abrir(vista.codigo);
    return pintarLista();
  }
  async function refrescarGlobo() { try { if (!necesitaApodo()) actualizarGlobo((await CU().rpc('mis_desafios')) || []); } catch (e) {} }
  raiz.mamDesafios = { pintar, abrir, pintarLista, pintarCrear, pintarUnirme, refrescarGlobo, _vista: () => vista };
})(typeof window !== 'undefined' ? window : globalThis);
