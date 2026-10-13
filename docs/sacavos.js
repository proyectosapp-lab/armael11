// sacavos.js — la puerta de Sacá vos. Script clásico, sin dependencias, prefijo `sv`.
// Lee window.SV_HOY (lo deja el motor diario en docs/datos/tenis-hoy.js) y usa window.sv (tenis-motor.js).
// La perilla mueve los puntos que cada uno gana con su saque; la probabilidad sale del motor, no de una aproximación.
(function () {
  'use strict';
  let HOY = window.SV_HOY || { partidos: [] };
  let MEDIDO = window.SV_MEDIDO || null;
  // adentro del iPhone: nativo-sv.js y tienda-sv.js viajan solo en el .ipa; en la web no existen y todo esto se apaga solo
  const NAT = () => window.svNativo || null;
  const esIos = () => { const n = NAT(); return !!(n && n.esIos()); };
  const TIENDA = () => window.svTienda || null;
  const CA = () => window.svCampana || null;
  const sv = window.sv;
  const CU = window.svCuentas || null;
  // ACCESO: lo decide el servidor. `cobra` = si el pase se exige (ajuste cobra_sacavos); `pase` = si esta persona lo tiene.
  // Mientras no cobra, el pronóstico es de todos. Sin backend configurado, tampoco se frena a nadie.
  const ACCESO = { cobra: false, pase: false, sesion: null, hasta: null, precio: null, prueba: null };
  // la prueba cuenta mientras no venció; se vuelve a mirar el reloj cada vez, no solo al cargar
  const enPrueba = () => !!ACCESO.prueba && new Date(ACCESO.prueba) > new Date();
  const abierto = () => !ACCESO.cobra || ACCESO.pase || enPrueba();
  // "2 días y 5 h" · "5 h y 12 min" · "12 min". Pura, para poder probarla.
  function faltaTexto(hasta, ahora) {
    const ms = Date.parse(hasta) - (ahora || Date.now()); if (!(ms > 0)) return null;
    const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
    if (d >= 1) return d + (d === 1 ? ' día' : ' días') + (h % 24 ? ' y ' + (h % 24) + ' h' : '');
    if (h >= 1) return h + ' h' + (min % 60 ? ' y ' + (min % 60) + ' min' : '');
    return Math.max(1, min) + ' min';
  }
  window.svFaltaTexto = faltaTexto;
  const ZONA = 'America/Argentina/Buenos_Aires';
  const SIMS = 2000;
  const $ = (id) => document.getElementById(id);
  const pct = (x) => Math.round(x * 100);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- fechas (hora argentina) ----------
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function hoyAR() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  const HOY_AR = hoyAR();
  function diaDe(f) {  // 'YYYY-MM-DD' → { corto: 'mié 23', largo: 'hoy' | 'mañana' | 'miércoles 23' }
    const [y, m, d] = f.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    const dif = Math.round((fecha - new Date(HOY_AR + 'T00:00:00Z')) / 86400000);
    const nombre = DIAS[fecha.getUTCDay()];
    const corto = nombre.slice(0, 3) + ' ' + d;
    return { corto, largo: dif === 0 ? 'hoy' : dif === 1 ? 'mañana' : nombre + ' ' + d, dif };
  }
  const viejaLaFoto = (iso) => !!iso && Date.now() - Date.parse(iso) > 6 * 3600000;   // más de 6 horas: se dice
  function generadoTexto(iso) {
    if (!iso) return '';
    try {
      const f = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
      return 'actualizado ' + f.replace(',', ' ·');
    } catch (e) { return ''; }
  }

  // ---------- nombres, monogramas, superficies ----------
  function apellido(nombre) {  // "J. Sinner" → "Sinner"; "Francisco Cerundolo" → "Cerundolo"
    const partes = String(nombre || '').trim().split(/\s+/);
    const sinIniciales = partes.filter((x) => !/^[A-ZÁÉÍÓÚ]\.$/.test(x));   // "J. M. Cerundolo" → "Cerundolo"
    return (sinIniciales.length ? sinIniciales : partes.slice(-1)).join(' ');
  }
  function corto(nombre) {  // "Francisco Cerundolo" → "F. Cerundolo"; "J. Sinner" queda
    const partes = String(nombre || '').trim().split(/\s+/);
    if (partes.length < 2) return partes[0] || '';
    const inicial = partes[0].replace(/\.$/, '').charAt(0);
    return inicial + '. ' + partes.slice(1).join(' ');
  }
  function monograma(nombre) {
    const partes = String(nombre || '').replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
    return ((partes[0] || '?').charAt(0) + (partes.length > 1 ? partes[partes.length - 1].charAt(0) : '')).toUpperCase();
  }
  // "ARG · 21 del ranking · 64% con su saque" (el ranking y el país vienen de get_standings, si vinieron)
  function datoJugador(j, saque) {
    const partes = [];
    if (j.pais) partes.push(esc(j.pais));
    if (j.rk) partes.push(j.rk + ' del ranking');
    if (saque != null) partes.push(pct(saque) + '% con su saque');
    return partes.join(' · ');
  }
  const SUP = { Clay: ['Polvo', 'clay'], Hard: ['Dura', 'hard'], Grass: ['Césped', 'grass'] };
  function supDe(p) { const s = SUP[p.sup] || ['Dura', 'hard']; return { texto: s[0] + (p.indoor ? ' · indoor' : ''), clase: 'sv-sup-' + s[1] }; }
  const RONDAS = { 'Final': 'final', 'Semi-finals': 'semifinal', 'Quarter-finals': 'cuartos', '1/8-finals': 'octavos', '1/16-finals': '1/16', '1/32-finals': '1/32', '1/64-finals': '1/64', 'Qualy': 'qualy' };
  const rondaDe = (r) => RONDAS[r] || String(r || '').toLowerCase();

  // ---------- el estado de la puerta ----------
  // El pronóstico publicado (p) mezcla saque y resultados. Se busca el corrimiento δ con el que el modelo de saque solo
  // da esa misma p: así la perilla parte exactamente de lo publicado y todo lo que mueve sale del motor.
  function corrimiento(pa, pb, bo, objetivo) {
    let lo = -0.2, hi = 0.2;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (sv.svProbabilidad(pa + m, pb - m, bo).ganar < objetivo) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  let E = null;   // { p: partido, bo, delta, base1, base2, s1, s2 }
  function cargar(partido) {
    const bo = partido.mejorDe === 5 ? 5 : 3;
    const base1 = pct(partido.saqueA), base2 = pct(partido.saqueB);
    E = { p: partido, bo, delta: corrimiento(partido.pa, partido.pb, bo, partido.p), base1, base2, s1: base1, s2: base2 };
  }
  function calcular() {  // { ganar, decisivo, pa, pb } con la perilla donde está
    const pa = E.p.pa + (E.s1 - E.base1) / 100, pb = E.p.pb + (E.s2 - E.base2) / 100;
    const r = sv.svProbabilidad(pa + E.delta, pb - E.delta, E.bo);
    return { ganar: r.ganar, decisivo: r.decisivo, pa: pa + E.delta, pb: pb - E.delta };
  }

  // ---------- la puerta ----------
  // La franja de la prueba: arriba de la puerta mientras dura, con cuánto falta y el botón del pase.
  function franjaPruebaHTML() {
    return '';   // desde el 27/9 lo dice la barra fija de abajo (pintarBarra), que está siempre
    if (!ACCESO.cobra || ACCESO.pase || !enPrueba()) return '';
    const falta = faltaTexto(ACCESO.prueba);
    return `<div class="sv-prueba" role="status"><div><b>Prueba gratis</b> · te quedan <b id="sv-prueba-falta">${esc(falta)}</b></div>
      <button class="sv-liso" type="button" data-ir-cuenta>${esIos() ? 'Ver el pase' : 'Sacar el pase'}</button></div>`;
  }
  // la tarjeta del jugador en la puerta: si hay ficha, se toca
  function tarjetaJugador(j, lado, saque) {
    const f = fichaDe(j);
    const adentro = `<div class="sv-mono">${esc(monograma(j.nombre))}</div><div class="sv-jnombre">${esc(corto(j.nombre))}</div><div class="sv-jdato">${datoJugador(j, saque)}</div>${f ? '<div class="sv-jficha">ver ficha</div>' : ''}`;
    return f ? `<button class="sv-tarjeta sv-jugador ${lado} tocable" type="button" data-ficha="${esc(f.k)}">${adentro}</button>` : `<div class="sv-tarjeta sv-jugador ${lado}">${adentro}</div>`;
  }
  function pintarPuerta() {
    const el = $('sv-puerta'); const p = E.p; const s = supDe(p); const d = diaDe(p.fecha);
    const cuando = d.largo + (p.hora ? ' ' + p.hora : '');
    const seccion = `<div class="sv-seccion"><span>${p.enJuego ? 'En juego' : d.dif === 0 ? 'Próximo partido' : 'El partido que viene'}</span><small>toca un jugador para ver su ficha</small></div>`;
    if (!abierto()) {
      // sin pase: se ve el partido y quién juega; el número, la perilla y la simulación son del pase
      el.innerHTML = `${seccion}
      <div class="sv-chips">
        <span class="sv-chip ${s.clase}">${esc(s.texto)}</span>
        ${p.qualy ? '<span class="sv-chip sv-chip-q">qualy</span>' : ''}
        <span>${esc(p.torneo)} · ${esc(rondaDe(p.ronda))} · ${esc(cuando)}</span>
      </div>
      <div class="sv-jugadores">
        ${tarjetaJugador(p.a, 'a', null)}
        ${tarjetaJugador(p.b, 'b', null)}
      </div>
      ${caraACaraHTML(p)}
      <div class="sv-prob sv-tapado" aria-hidden="true">
        <div class="sv-prob-fila"><div class="sv-grande">··%</div><div class="sv-nota">probabilidad de ganar</div><div class="sv-grande b">··%</div></div>
        <div class="sv-barra"><div style="width:50%"></div></div>
      </div>
      ${candadoHTML()}`;
      engancharCandado(el);
      engancharFichas(el);
      el.hidden = false;
      return;
    }
    el.innerHTML = `${seccion}${franjaPruebaHTML()}
      <div class="sv-chips">
        <span class="sv-chip ${s.clase}">${esc(s.texto)}</span>
        ${p.qualy ? '<span class="sv-chip sv-chip-q">qualy</span>' : ''}
        <span>${esc(p.torneo)} · ${esc(rondaDe(p.ronda))} · ${esc(cuando)}</span>
      </div>
      <div class="sv-jugadores">
        ${tarjetaJugador(p.a, 'a', p.saqueA)}
        ${tarjetaJugador(p.b, 'b', p.saqueB)}
      </div>
      ${caraACaraHTML(p)}
      <div class="sv-prob">
        <div class="sv-prob-fila"><div class="sv-grande" id="sv-p1"></div><div class="sv-nota">probabilidad de ganar</div><div class="sv-grande b" id="sv-p2"></div></div>
        <div class="sv-barra"><div id="sv-ancho"></div></div>
        <div class="sv-prob-pie"><span id="sv-corridos"></span><span id="sv-decisivo"></span></div>
      </div>
      <div class="sv-tarjeta sv-perilla">
        <h2>Puntos que gana con su saque</h2>
        <div class="sv-nota">Muévelo y mira cuánto cambia: unos pocos puntos de saque mueven mucho el partido.</div>
        <div class="sv-p-fila"><label for="sv-s1">${esc(apellido(p.a.nombre))}</label><div class="sv-p-valor" id="sv-v1"></div></div>
        <input id="sv-s1" type="range" min="50" max="80" step="1" value="${E.s1}" aria-label="Puntos que gana ${esc(apellido(p.a.nombre))} con su saque">
        <div class="sv-p-fila"><label for="sv-s2">${esc(apellido(p.b.nombre))}</label><div class="sv-p-valor" id="sv-v2"></div></div>
        <input id="sv-s2" type="range" min="50" max="80" step="1" value="${E.s2}" aria-label="Puntos que gana ${esc(apellido(p.b.nombre))} con su saque">
        <div class="sv-p-pie"><button class="sv-liso" id="sv-volver" type="button">Volver a lo medido</button><div class="sv-nota">medido: ${E.base1}% y ${E.base2}%</div></div>
      </div>
      <button class="sv-boton" id="sv-simular" type="button">Simular el partido</button>`;
    $('sv-s1').addEventListener('input', (e) => { E.s1 = Number(e.target.value); pintarNumeros(); });
    $('sv-s2').addEventListener('input', (e) => { E.s2 = Number(e.target.value); pintarNumeros(); });
    $('sv-volver').addEventListener('click', () => { E.s1 = E.base1; E.s2 = E.base2; $('sv-s1').value = E.s1; $('sv-s2').value = E.s2; pintarNumeros(); });
    $('sv-simular').addEventListener('click', () => simular(1));
    el.querySelectorAll('[data-ir-cuenta]').forEach((b) => b.addEventListener('click', () => { const c = $('sv-cuenta'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    engancharFichas(el);
    el.hidden = false;
    pintarNumeros();
  }
  function pintarNumeros() {
    const r = calcular(); const p1 = pct(r.ganar), p2 = 100 - p1, dec = pct(r.decisivo);
    $('sv-p1').textContent = p1 + '%'; $('sv-p2').textContent = p2 + '%'; $('sv-ancho').style.width = p1 + '%';
    $('sv-corridos').textContent = 'sets corridos ' + (100 - dec) + '%'; $('sv-decisivo').textContent = 'set decisivo ' + dec + '%';
    $('sv-v1').textContent = E.s1 + '%'; $('sv-v2').textContent = E.s2 + '%';
    $('sv-volver').disabled = E.s1 === E.base1 && E.s2 === E.base2;
    $('sv-simulacion').hidden = true;   // moviste la perilla: la simulación anterior ya no corresponde
  }

  // ---------- la simulación ----------
  let semilla = 1;
  function simular(vez) {
    if (vez === 1 && CA()) CA().simulo();
    const r = calcular(); const p = E.p;
    const rng = sv.svRng((semilla++ * 2654435761) >>> 0);
    const una = sv.svSimular(r.pa, r.pb, E.bo, rng);
    const muchas = sv.svSimularMuchas(r.pa, r.pb, E.bo, SIMS, 7 + E.s1 * 100 + E.s2);
    // tie-breaks: los puntos del que perdió el set, desde el punto a punto
    const tb = {};
    for (const ev of una.puntos) if (ev.tiebreak) tb[ev.set] = ev.marcador;
    const setA = [], setB = [];
    una.sets.forEach(([a, b], i) => {
      const t = tb[i + 1]; let sa = '', sb = '';
      if (t) { const [x, y] = t.split('-').map(Number); if (a > b) sb = '<sup>' + Math.min(x, y) + '</sup>'; else sa = '<sup>' + Math.min(x, y) + '</sup>'; }
      setA.push('<span class="' + (a > b ? 'g' : 'p') + '">' + a + sa + '</span>'); setB.push('<span class="' + (b > a ? 'g' : 'p') + '">' + b + sb + '</span>');
    });
    const gano = una.ganaA ? p.a : p.b; const ns = una.sets.length;
    const quiebres = una.puntos.filter((e) => e.quiebre).length;
    const aces = una.puntos.filter((e) => e.tipo === 'ace').length;
    const linea = `Gana ${esc(apellido(gano.nombre))} en ${ns} sets${una.decisivo ? ', con set decisivo' : ''} · ${quiebres} quiebre${quiebres === 1 ? '' : 's'} · ${aces} ace${aces === 1 ? '' : 's'} · ${una.minutos} minutos`;
    const el = $('sv-simulacion');
    el.innerHTML = `
      <h2>Una simulación${vez > 1 ? ' · la ' + vez + 'ª' : ''}</h2>
      <div class="sv-marcador">
        <div class="n${una.ganaA ? ' gano' : ''}">${esc(corto(p.a.nombre))}</div><div class="sv-sets">${setA.join('')}</div>
        <div class="n${una.ganaA ? '' : ' gano'}">${esc(corto(p.b.nombre))}</div><div class="sv-sets">${setB.join('')}</div>
      </div>
      <div class="sv-sim-linea">${linea}</div>
      <div class="sv-sim-resumen">
        <div><b>${pct(r.ganar)}%</b><span>gana ${esc(apellido(p.a.nombre))}</span></div>
        <div><b>${pct(r.decisivo)}%</b><span>set decisivo</span></div>
        <div><b>${muchas.minutos}'</b><span>duración típica</span></div>
      </div>
      <div class="sv-sim-regla">Lo que viste arriba es una simulación punto a punto con la perilla donde la dejaste. Los números de abajo son los de arriba, calculados: lo que viste y el número final nunca se contradicen. La duración sale de ${SIMS.toLocaleString('es-AR')} simulaciones.</div>
      <div class="sv-sim-acciones"><button class="sv-liso" id="sv-otra" type="button">Simular otra vez</button><button class="sv-liso" id="sv-compartir" type="button">Compartir</button></div>`;
    $('sv-compartir').addEventListener('click', () => compartirPartido());
    $('sv-otra').addEventListener('click', () => simular(vez + 1));
    el.hidden = false;
    // los sets aparecen de a uno: se siente cada set en la mano (Haptics) y el partido al cerrarse
    const celdas = el.querySelectorAll('.sv-sets span'); const porSet = celdas.length / 2;
    celdas.forEach((c) => { c.style.visibility = 'hidden'; });
    for (let i = 0; i < porSet; i++) setTimeout(() => {
      celdas[i].style.visibility = ''; celdas[porSet + i].style.visibility = '';
      const n = NAT(); if (n) n.vibrar(i === porSet - 1 ? 'partido' : 'set');
    }, 350 + i * 550);
    if (vez === 1) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // compartir el pronóstico: la hoja del sistema en el iPhone, navigator.share en la web, y si no hay nada se copia
  async function compartirPartido() {
    const p = E.p; const r = calcular();
    const texto = `${apellido(p.a.nombre)} ${pct(r.ganar)}% – ${apellido(p.b.nombre)} ${100 - pct(r.ganar)}% · ${p.torneo} · Sacá vos`;
    const n = NAT(); if (n && await n.compartir(texto, 'https://sacavos.com')) return;
    try { if (navigator.share) { await navigator.share({ text: texto, url: 'https://sacavos.com' }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(texto + ' sacavos.com'); alert('Copiado.'); } catch (e) {}
  }

  // ---------- la ficha del jugador (gratis: dato puro, sin pronóstico) ----------
  // Viene en tenis-hoy.js (HOY.jugadores, por clave) para los que juegan esta semana. Se abre tocando un nombre.
  const fichaDe = (j) => (j && j.k != null && HOY.jugadores && HOY.jugadores[String(j.k)]) || null;
  function nombreFicha(j) { const f = fichaDe(j); const n = esc(apellido(j.nombre)); return f ? `<span class="sv-nombre-ficha" role="button" tabindex="0" data-ficha="${esc(f.k)}">${n}</span>` : n; }
  function engancharFichas(el) {
    el.querySelectorAll('[data-ficha]').forEach((b) => {
      const abrir = (ev) => { ev.stopPropagation(); abrirFicha(b.dataset.ficha); };
      b.addEventListener('click', abrir);
      b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(ev); } });
    });
  }
  const SUP_NOMBRE = { Hard: 'dura', Clay: 'polvo', Grass: 'césped' };
  function fichaHTML(f) {
    const A = esc(apellido(f.nombre));
    const cab = [f.pais, f.rk ? f.rk + ' del ranking' : null].filter(Boolean).map(esc).join(' · ');
    const filaSup = (x) => `<tr><td>${esc(SUP_NOMBRE[x.s] || x.s)}</td><td>${x.n ? `${x.g} de ${x.n}` : '–'}</td><td>${x.saque != null ? x.saque + '%' : '–'}</td><td>${x.resto != null ? x.resto + '%' : '–'}</td></tr>`;
    const rival = (u) => { const r = HOY.jugadores && HOY.jugadores[String(u.rk)]; const n = esc(apellido(u.rival)); return r ? `<span class="sv-nombre-ficha" role="button" tabindex="0" data-ficha="${esc(r.k)}">${n}</span>` : n; };
    const ult = f.ult.map((u) => `<li><i class="sv-gp ${u.g ? 'g' : 'p'}">${u.g ? 'G' : 'P'}</i><span><b>${u.g ? 'le ganó a' : 'perdió con'} ${rival(u)}</b> ${esc(u.m)}<br><small>${esc(u.t)} · ${esc(rondaDe(u.r))} · ${esc(SUP_NOMBRE[u.sup] || '')} · ${esc(fechaCortaDe(u.f))}</small></span></li>`).join('');
    const viene = f.viene.map((v) => `<li><span><b>contra ${rival(v)}</b><br><small>${esc(v.t)} · ${esc(rondaDe(v.r))} · ${esc(diaDe(v.f).largo)}</small></span></li>`).join('');
    const golpes = golpesHTML(f.golpes, A);
    return `<div class="sv-ficha-cab"><div class="sv-mono">${esc(monograma(f.nombre))}</div><div><h2>${esc(f.nombre)}</h2><div class="sv-nota">${cab || 'circuito ATP'}</div></div><button class="sv-liso sv-ficha-cerrar" type="button" data-cerrar aria-label="Cerrar">Cerrar</button></div>
      <p class="sv-ficha-resumen">${f.n ? `En ${f.anio} ganó <b>${f.g} de ${f.n}</b> partidos.` : `Sin partidos terminados en ${f.anio}.`}</p>
      ${f.sup.length ? `<table class="sv-ficha-tabla"><thead><tr><th>${f.anio}</th><th>ganados</th><th>saque</th><th>devolución</th></tr></thead><tbody>${f.sup.map(filaSup).join('')}</tbody></table>
      <div class="sv-nota">Saque y devolución: puntos ganados en los últimos 12 meses, por superficie. Es lo que usa el modelo.</div>` : ''}
      ${golpes}
      ${ult ? `<h3>Últimos partidos</h3><ul class="sv-ficha-lista">${ult}</ul>` : ''}
      ${viene ? `<h3>Lo que viene</h3><ul class="sv-ficha-lista">${viene}</ul>` : ''}
      <div class="sv-nota">Sacá vos es una app independiente. Datos: api-tennis.com.</div>`;
  }
  // Cómo juega: los números de los últimos 12 meses. Son descriptivos, y la nota lo dice.
  function golpesHTML(G, A) {
    if (!G) return '';
    const filas = [];
    if (G.aces != null) filas.push(['aces por partido', G.aces], ['dobles faltas por partido', G.df]);
    if (G.salvados != null) filas.push(['break points salvados', G.salvados + '%']);
    if (G.convertidos != null) filas.push(['break points convertidos', G.convertidos + '%']);
    if (G.winners != null) filas.push(['winners por partido', G.winners], ['errores no forzados', G.errores]);
    if (!filas.length) return '';
    return `<h3>Cómo juega</h3>
      <table class="sv-ficha-tabla"><tbody>${filas.map(([t, v]) => `<tr><td>${esc(t)}</td><td>${esc(String(v))}</td></tr>`).join('')}</tbody></table>
      <div class="sv-nota">Últimos 12 meses. Son números de lo que pasó: probamos si los break points servían para pronosticar y no sirven, así que el modelo no los usa. Están porque dicen cómo juega ${A}.</div>`;
  }
  const fechaCortaDe = (f) => { const [, m, d] = String(f).split('-').map(Number); return `${d}/${m}`; };
  function abrirFicha(k) {
    const f = HOY.jugadores && HOY.jugadores[String(k)]; if (!f) return;
    let capa = $('sv-ficha');
    if (!capa) { capa = document.createElement('div'); capa.id = 'sv-ficha'; capa.className = 'sv-ficha-capa'; document.body.appendChild(capa); }
    capa.innerHTML = `<div class="sv-ficha" role="dialog" aria-modal="true" aria-label="Ficha de ${esc(f.nombre)}">${fichaHTML(f)}</div>`;
    capa.hidden = false; document.body.classList.add('sv-con-ficha');
    const cerrar = () => { capa.hidden = true; document.body.classList.remove('sv-con-ficha'); };
    capa.onclick = (ev) => { if (ev.target === capa) cerrar(); };
    capa.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
    engancharFichas(capa);
    capa.querySelector('.sv-ficha').scrollTop = 0;
  }
  // el cara a cara del partido de la puerta (HOY.cruces, por clave del partido)
  function caraACaraHTML(p) {
    const c = HOY.cruces && HOY.cruces[String(p.k)]; if (!c) return '';
    const A = esc(apellido(p.a.nombre)), B = esc(apellido(p.b.nombre));
    if (!c.n) return `<div class="sv-h2h"><span>Primer cruce entre ${A} y ${B} desde 2021.</span></div>`;
    const ult = c.ult.map((u) => `${u.g === 1 ? A : B} ${esc(u.m)} (${esc(u.t)})`).join(' · ');
    return `<div class="sv-h2h"><span>Se cruzaron ${c.n} ${c.n === 1 ? 'vez' : 'veces'} desde 2021: <b>${A} ${c.gA}</b> – <b>${B} ${c.n - c.gA}</b>.</span>${ult ? `<small>${ult}</small>` : ''}</div>`;
  }

  // ---------- la lista de la semana ----------
  // Por día y por torneo, con desplegables cerrados: el que abre ve el panorama en pocas líneas y abre lo que le interesa.
  // Solo se abre solo el torneo del partido que está en la puerta (el que llega por un link lo ve). Lo que el usuario
  // abre o cierra queda para toda la visita.
  const ABIERTOS = new Set();
  const claveGrupo = (p) => p.fecha + '|' + p.torneo + '|' + (p.qualy ? 'q' : '');
  function agrupar(lista) {
    const dias = [];
    for (const p of lista) {
      let d = dias[dias.length - 1]; if (!d || d.fecha !== p.fecha) { d = { fecha: p.fecha, grupos: [] }; dias.push(d); }
      const k = claveGrupo(p); let g = d.grupos.find((x) => x.k === k);
      if (!g) { g = { k, torneo: p.torneo, qualy: !!p.qualy, sup: supDe(p), partidos: [] }; d.grupos.push(g); }
      g.partidos.push(p);
    }
    return dias;
  }
  function engancharGrupos(el, repintar) {
    el.querySelectorAll('.sv-grupo-cab[data-g]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.g; if (ABIERTOS.has(k)) ABIERTOS.delete(k); else ABIERTOS.add(k);
      repintar();
    }));
  }
  function cabeceraGrupo(g, resumen, abierto) {
    return `<button class="sv-grupo-cab" type="button" data-g="${esc(g.k)}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="punto ${g.sup.clase}"></span>
        <span class="t"><b>${esc(g.torneo)}${g.qualy ? ' · qualy' : ''}</b><span>${resumen}</span></span>
        <span class="sv-flecha" aria-hidden="true"></span></button>`;
  }
  function pintarLista(partidos) {
    const el = $('sv-lista');
    if (!partidos.length) { el.innerHTML = '<div class="sv-vacio">No hay partidos ATP en los próximos días.</div>'; return; }
    if (E && E.p) ABIERTOS.add(claveGrupo(E.p));
    let html = `<div class="sv-seccion"><span>Esta semana</span><small>${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'} · toca un torneo para abrirlo</small></div>`;
    for (const d of agrupar(partidos)) {
      const n = d.grupos.reduce((a, g) => a + g.partidos.length, 0);
      html += `<div class="sv-dia">${esc(diaDe(d.fecha).largo)} · ${n} ${n === 1 ? 'partido' : 'partidos'}</div>`;
      for (const g of d.grupos) {
        const ab = ABIERTOS.has(g.k); const enJuego = g.partidos.filter((p) => p.enJuego).length;
        const primera = g.partidos.find((p) => !p.enJuego && p.hora);
        const resumen = [esc(g.sup.texto.toLowerCase()), `${g.partidos.length} ${g.partidos.length === 1 ? 'partido' : 'partidos'}`,
          enJuego ? `<em class="sv-vivo">${enJuego} en juego</em>` : primera ? 'desde las ' + esc(primera.hora) : ''].filter(Boolean).join(' · ');
        html += `<div class="sv-grupo${ab ? ' abierto' : ''}">${cabeceraGrupo(g, resumen, ab)}`;
        if (ab) for (const p of g.partidos) {
          const activo = E && E.p.k === p.k;
          const der = p.sinDatos ? '<span class="pct sin">sin datos suficientes</span>' : abierto() ? `<span class="pct">${pct(p.p)}% – ${100 - pct(p.p)}%</span>` : '<span class="pct sin">con el pase</span>';
          html += `<button class="sv-fila" type="button" data-k="${esc(p.k)}" ${activo ? 'aria-current="true"' : ''} ${p.sinDatos ? 'disabled' : ''}>
            <span class="t"><b>${esc(apellido(p.a.nombre))} – ${esc(apellido(p.b.nombre))}</b><span>${esc(rondaDe(p.ronda))}${p.enJuego ? ' · <em class="sv-vivo">en juego</em>' : p.hora ? ' · ' + esc(p.hora) : ''}</span></span>${der}</button>`;
        }
        html += '</div>';
      }
    }
    el.innerHTML = html;
    engancharGrupos(el, () => pintarLista(partidos));
    el.querySelectorAll('.sv-fila[data-k]').forEach((b) => b.addEventListener('click', () => {
      const p = partidos.find((x) => x.k === b.dataset.k); if (!p || p.sinDatos) return;
      cargar(p); pintarPuerta(); pintarLista(partidos); window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  }

  // ---------- jugados: lo que dijo y lo que pasó ----------
  function marcador(p) {
    return p.sets.map(([a, b], i) => {
      const t = p.tb && p.tb[i]; let s = a + '-' + b;
      if (t && t[0] != null && t[1] != null) s += '(' + Math.min(t[0], t[1]) + ')';
      return s;
    }).join(' ') + (p.ret ? ' ret.' : '');
  }
  // El saque, esperado contra lo que pasó. "Perdió porque sacó peor" o "porque el otro sacó mejor": con 3 puntos de umbral,
  // porque menos que eso es el ruido normal de un partido. Devuelve { linea, veredicto } o null si no hay estadísticas.
  function leerSaque(p) {
    const s = p.saque; if (!s) return null;
    const a = apellido(p.a.nombre), b = apellido(p.b.nombre);
    const dA = pct(s.realA) - pct(s.espA), dB = pct(s.realB) - pct(s.espB);
    const fmt = (n, real, esp) => `${esc(n)} ${pct(real)}% con su saque (esperaba ${pct(esp)}%)`;
    const linea = fmt(a, s.realA, s.espA) + ' · ' + fmt(b, s.realB, s.espB);
    const perdio = p.gano === 1 ? b : a, gano = p.gano === 1 ? a : b;
    const dPerdio = p.gano === 1 ? dB : dA, dGano = p.gano === 1 ? dA : dB;
    let veredicto;
    if (dPerdio <= -3 && dGano >= 3) veredicto = `${perdio} sacó peor de lo esperado y ${gano} mejor: el partido se fue por los dos lados.`;
    else if (dPerdio <= -3) veredicto = `${perdio} perdió sacando ${Math.abs(dPerdio)} puntos peor de lo esperado.`;
    else if (dGano >= 3) veredicto = `${perdio} sacó como se esperaba; ${gano} sacó ${dGano} puntos mejor y ahí estuvo la diferencia.`;
    else if (dPerdio >= 3) veredicto = `${perdio} sacó ${dPerdio} puntos mejor de lo esperado y perdió igual: se definió en los puntos justos.`;
    else veredicto = 'Los dos sacaron como se esperaba: se definió en los puntos justos.';
    return { linea, veredicto: esc(veredicto) };
  }
  function pintarJugados(jugados) {
    if (!jugados.length) return;
    const el = document.createElement('section'); el.className = 'sv-lista sv-jugados'; el.id = 'sv-jugados';
    // la leyenda de los puntitos, con cuántos hubo de cada uno en estos días
    const cuenta = { pv: 0, pg: 0, pn: 0 };
    for (const p of jugados) { if (p.p == null) continue; const fav = Math.max(pct(p.p), 100 - pct(p.p)); const ok = (p.p >= 0.5) === (p.gano === 1); cuenta[ok ? 'pv' : fav < 60 ? 'pg' : 'pn']++; }
    const n = (k, uno, varios) => `${cuenta[k]} ${cuenta[k] === 1 ? uno : varios}`;
    let html = `<div class="sv-seccion"><span>Resultados</span><small>${jugados.length} ${jugados.length === 1 ? 'partido' : 'partidos'} · lo que dijo y lo que pasó</small></div>
      <details class="sv-leyenda" id="sv-leyenda">
        <summary><i class="sv-bola pv"></i>${cuenta.pv} <i class="sv-bola pg"></i>${cuenta.pg} <i class="sv-bola pn"></i>${cuenta.pn} <u>¿Qué son los colores?</u></summary>
        <div><i class="sv-bola pv"></i><span><b>Verde:</b> ganó el que el modelo ponía arriba.</span></div>
        <div><i class="sv-bola pg"></i><span><b>Gris:</b> ganó el otro, pero era parejo (el modelo no le daba 60% a ninguno).</span></div>
        <div><i class="sv-bola pn"></i><span><b>Naranja:</b> sorpresa. Ganó el que tenía 40% o menos.</span></div>
        <p>En estos días: ${n('pv', 'verde', 'verdes')}, ${n('pg', 'gris', 'grises')} y ${n('pn', 'naranja', 'naranjas')}. Se muestran todos, también los que no salieron. El punto al lado del nombre del torneo es la superficie.</p>
      </details>`;
    const clase = (p) => { if (p.p == null) return null; const fav = Math.max(pct(p.p), 100 - pct(p.p)); const ok = (p.p >= 0.5) === (p.gano === 1); return ok ? 'pv' : fav < 60 ? 'pg' : 'pn'; };
    const filaJugado = (p) => {
      let html = '';
      const s = supDe(p); const ganador = p.gano === 1 ? p.a : p.b;
      const dijo = p.p == null ? 'sin pronóstico' : `dijo ${pct(p.p)}% – ${100 - pct(p.p)}%`;
      // parejo: el favorito no llegaba al 60%; con 60% o más, favorito si ganó y sorpresa si perdió
      const fav = p.p == null ? null : Math.max(pct(p.p), 100 - pct(p.p)) / 100;   // con el número redondeado que se muestra
      const acerto = p.p != null && ((p.p >= 0.5) === (p.gano === 1));
      // el puntito: verde si ganó el pronóstico, gris si ganó el otro pero daba parejo, naranja si fue sorpresa
      const etiqueta = p.p == null ? null : fav < 0.6 ? (acerto ? ['parejo', 'par pv'] : ['parejo', 'par pg']) : acerto ? ['favorito', 'si pv'] : ['sorpresa', 'no pn'];
      html += `<div class="sv-fila sv-jugado">
        <span class="t"><b>${nombreFicha(p.a)} – ${nombreFicha(p.b)}</b><span>${esc(rondaDe(p.ronda))} · ${esc(dijo)}</span></span>
        <span class="res"><b>${esc(apellido(ganador.nombre))}</b><span>${esc(marcador(p))}</span>${etiqueta ? `<i class="${etiqueta[1]}"><u></u>${etiqueta[0]}</i>` : ''}</span></div>`;
      // el porqué del color, en palabras, en cada partido: el que llega no tiene por qué saber la regla
      if (etiqueta) {
        const favP = p.p >= 0.5 ? p.a : p.b, perdedor = p.gano === 1 ? p.b : p.a, favPct = Math.max(pct(p.p), 100 - pct(p.p));
        const A = esc(apellido(favP.nombre)), G = esc(apellido(ganador.nombre)), Pd = esc(apellido(perdedor.nombre));
        const porque = etiqueta[0] === 'sorpresa' ? `<b>Sorpresa.</b> El modelo le daba ${favPct}% a ${A} y ganó ${G}.`
          : etiqueta[0] === 'favorito' ? `<b>Ganó el favorito.</b> El modelo le daba ${favPct}% a ${G}.`
          : acerto ? `<b>Parejo, y ganó el de arriba.</b> El modelo le daba ${favPct}% a ${G}: por poco, pero arriba.`
          : `<b>Parejo.</b> El modelo le daba ${favPct}% a ${A} y ganó ${G}: con menos de 60%, cualquiera de los dos podía ganar.`;
        html += `<div class="sv-porque"><i class="sv-bola ${etiqueta[1].split(' ')[1]}"></i><span>${porque}</span></div>`;
      }
      const sq = leerSaque(p);
      if (sq) html += `<div class="sv-saque"><span>${sq.linea}</span><b>${sq.veredicto}</b></div>`;
      return html;
    };
    // por día y por torneo, cerrados: la cabecera ya cuenta cómo le fue al modelo en ese torneo
    for (const d of agrupar(jugados)) {
      const dd = diaDe(d.fecha); const n = d.grupos.reduce((a, g) => a + g.partidos.length, 0);
      html += `<div class="sv-dia">${esc(dd.dif === 0 ? 'hoy' : dd.dif === -1 ? 'ayer' : dd.largo)} · ${n} ${n === 1 ? 'partido' : 'partidos'}</div>`;
      for (const g of d.grupos) {
        const c = { pv: 0, pg: 0, pn: 0 }; for (const p of g.partidos) { const k = clase(p); if (k) c[k]++; }
        const bolas = ['pv', 'pg', 'pn'].filter((k) => c[k]).map((k) => `<i class="sv-bola ${k}"></i>${c[k]}`).join(' ');
        const ab = ABIERTOS.has('j:' + g.k);
        const resumen = `${g.partidos.length} ${g.partidos.length === 1 ? 'partido' : 'partidos'}${bolas ? ' · ' + bolas : ''}`;
        html += `<div class="sv-grupo${ab ? ' abierto' : ''}">${cabeceraGrupo({ ...g, k: 'j:' + g.k }, resumen, ab)}${ab ? g.partidos.map(filaJugado).join('') : ''}</div>`;
      }
    }
    el.innerHTML = html;
    engancharGrupos(el, () => { const nuevo = pintarJugados(jugados); if (nuevo) el.replaceWith(nuevo); });
    engancharFichas(el);
    const viejo = $('sv-jugados'); if (viejo && viejo !== el) { viejo.replaceWith(el); return el; }
    ($('sv-juga') || $('sv-lista')).insertAdjacentElement('afterend', el);
    return el;
  }

  // ---------- está medido ----------
  function pintarMedido() {
    if (!MEDIDO || !MEDIDO.n) return;
    const el = $('sv-medido');
    const filas = MEDIDO.cajones.map((c) => `<tr><td>${Math.round(c.desde * 100)} a ${Math.round(c.hasta * 100)}%</td><td>${c.n.toLocaleString('es-AR')}</td><td>${pct(c.dijo)}%</td><td>${pct(c.paso)}%</td></tr>`).join('');
    const c75 = MEDIDO.cajones.find((c) => c.desde >= 0.7 && c.desde < 0.8);
    el.innerHTML = `
      <div class="sv-seccion"><span>Está medido</span><small>el modelo contra lo que pasó</small></div>
      <div class="sv-nota">${MEDIDO.n.toLocaleString('es-AR')} partidos ATP desde ${MEDIDO.desde.slice(0, 4)}, pronosticados antes de jugarse. Lo que dijo y lo que pasó.</div>
      <table><thead><tr><th>le dio al favorito</th><th>partidos</th><th>dijo</th><th>pasó</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="sv-nota">${c75 ? `Cuando dice ${pct(c75.dijo)}%, pasa el ${pct(c75.paso)}%. ` : ''}Dijo que el partido llega al set decisivo el ${pct(MEDIDO.decisivoDicho)}% de las veces; pasó el ${pct(MEDIDO.decisivoReal)}%. El mismo modelo para todos los partidos, sin elegir después.</div>`;
    el.hidden = false;
  }

  // ---------- el candado y la cuenta ----------
  const diasPrueba = () => '3 días';   // lo que dice el ajuste prueba_sacavos_dias; si se cambia allá, se cambia acá
  function precioTexto() { return ACCESO.precio ? '$' + Number(ACCESO.precio).toLocaleString('es-AR') + ' por mes' : 'por mes'; }
  /* LOS DOS PLANES, EN LA WEB (12/10/2026). El que llega por un posteo de
     tenis veía un solo botón y nunca se enteraba de que existían los otros
     dos deportes. Los precios los manda el servidor (`planes()`), no se
     escriben acá. En el iPhone no van: ahí el precio lo pone StoreKit. Y
     adentro de Mano a mano tampoco: el panel de planes lo pinta el cascarón. */
  const esDoble = () => !esIos() && !MAM() && Array.isArray(ACCESO.planes) && ACCESO.planes.length > 1;
  function botonesPlanes(idAviso) {
    if (!esDoble()) return `<button class="sv-boton" id="sv-pagar" type="button">Sacar el pase</button><div class="sv-aviso" id="${idAviso}"></div>`;
    const pesos = (n) => '$' + Number(n).toLocaleString('es-AR');
    const linea = (p) => `<button class="sv-plan" type="button" data-plan="${esc(p.id)}">
        <span class="sv-plan-n">${esc(p.id === 'todo' ? 'Todo' : 'Tenis')}</span>
        <span class="sv-plan-d">${esc(p.id === 'todo' ? 'tenis, fútbol y NBA' : 'el circuito ATP')}</span>
        <span class="sv-plan-p">${esc(pesos(p.precio))}<small>por mes</small></span>
      </button>`;
    return `<div class="sv-planes">${ACCESO.planes.map(linea).join('')}</div>
      <div class="sv-nota sv-planes-pie">Se paga con Mercado Pago, una vez. Sin renovación automática.</div>
      <div class="sv-aviso" id="${idAviso}"></div>`;
  }
  /* un solo lugar que engancha los botones de plan, lo use el candado o la cuenta */
  function engancharPlanes(el, idAviso) {
    el.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', async () => {
      const aviso = el.querySelector('#' + idAviso);
      /* sin cuenta no se puede pagar: se recuerda cuál eligió y se lo manda al
         formulario. Al entrar, `seguirAlPagoSiQueria` lo lleva a ESE plan. */
      if (!ACCESO.sesion) {
        try { sessionStorage.setItem(QUIERE, b.dataset.plan); } catch (e) {}
        if (aviso) aviso.textContent = 'Entra o crea tu cuenta: el pase queda en tu cuenta y sigues directo al pago.';
        const c = $('sv-cuenta');
        const f = el.querySelector('input[type=email]') || (c && c.querySelector('input[type=email]'));
        if (f) { f.focus(); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (aviso) aviso.textContent = 'Armando el pago…';
      try { location.href = await CU.linkDePago(b.dataset.plan); }
      catch (err) { if (aviso) aviso.textContent = err.message; }
    }));
  }
  const MAM = () => !!(window.mamMarco && window.mamMarco.adentro());
  function candadoHTML() {
    const entro = !!ACCESO.sesion;
    if (MAM()) return window.mamMarco.candadoHTML({ clase: 'sv-tarjeta sv-candado', boton: 'sv-boton', deporte: 'tenis', titulo: ACCESO.prueba ? 'Terminó tu prueba gratis' : 'El número es del plan Tenis', texto: 'La probabilidad, la perilla y la simulación punto a punto de cada partido ATP. Los resultados, los juegos y los desafíos son gratis siempre.' });
    if (esIos()) return candadoIosHTML(entro);   // primera línea, a propósito: adentro del iPhone no existe otra caja
    return `
      <div class="sv-tarjeta sv-candado">
        <h2>${ACCESO.prueba ? 'Terminó tu prueba gratis' : 'El pronóstico es del pase'}</h2>
        <div class="sv-nota">Los números de los próximos partidos, la perilla y la simulación punto a punto. Los resultados y "Está medido" son gratis, siempre.</div>
        ${esDoble() ? '' : `<div class="sv-precio">${esc(precioTexto())}<span> · se paga con Mercado Pago · sin renovación automática</span></div>`}
        ${entro
          ? botonesPlanes('sv-aviso-pago')
          : `${esDoble() ? botonesPlanes('sv-aviso-pago') : ''}<div class="sv-nota"><b>Pruébalo ${esc(diasPrueba())} gratis:</b> entra o crea tu cuenta y el pronóstico se abre solo. Es la misma cuenta que Armá el 11.</div>${formularioHTML('sv-c1')}`}
      </div>`;
  }
  function formularioHTML(id) {
    return `
      <form class="sv-form" id="${id}" autocomplete="on">
        <input type="email" name="mail" placeholder="tu mail" required autocomplete="email" inputmode="email">
        <div class="sv-clave"><input type="password" name="clave" placeholder="contraseña (6 o más)" minlength="6" autocomplete="current-password"><button type="button" class="sv-ojo" data-ojo aria-label="Mostrar la contraseña" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line class="tachado" x1="4" y1="4" x2="20" y2="20"/></svg></button></div>
        <div class="sv-form-botones">
          <button class="sv-boton" type="submit" data-que="entrar">Entrar</button>
          <button class="sv-liso" type="button" data-que="crear">Crear cuenta</button>
          ${esIos() ? '' : '<button class="sv-liso" type="button" data-que="link">Mándame un link</button>'}
        </div>
        <div class="sv-aviso"></div>
      </form>`;
  }
  function engancharFormulario(form) {
    if (!form || !CU) return;
    const aviso = form.querySelector('.sv-aviso');
    const decir = (t, bien) => { aviso.textContent = t; aviso.className = 'sv-aviso' + (bien ? ' bien' : ''); };
    const datos = () => ({ mail: form.mail.value, clave: form.clave.value });
    const ojo = form.querySelector('[data-ojo]'); if (ojo) ojo.addEventListener('click', () => { const i = form.clave; const ver = i.type === 'password'; i.type = ver ? 'text' : 'password'; ojo.setAttribute('aria-pressed', String(ver)); ojo.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña'); i.focus(); });
    const listo = async () => { await cargarAcceso(); repintar(); await seguirAlPagoSiQueria(); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); decir('Entrando…');
      try { await CU.entrarConClave(datos().mail, datos().clave); await listo(); } catch (err) { decir(err.message); }
    });
    form.querySelector('[data-que="crear"]').addEventListener('click', async () => {
      decir('Creando la cuenta…');
      try { const r = await CU.crearCuenta(datos().mail, datos().clave); if (CA()) CA().cuenta(); if (r.confirmar) decir('Te mandamos un mail para confirmar la cuenta. Después entra con tu contraseña.', true); else await listo(); }
      catch (err) { decir(err.message); }
    });
    const bl = form.querySelector('[data-que="link"]'); if (bl) bl.addEventListener('click', async () => {
      decir('Mandando el link…');
      try { await CU.pedirLink(datos().mail, location.origin + location.pathname); decir('Listo: abre el mail y toca el link. Entras sin contraseña.', true); }
      catch (err) { decir(err.message); }
    });
  }
  function engancharCandado(el) {
    engancharFormulario(el.querySelector('form'));
    engancharIos(el);
    engancharPlanes(el, 'sv-aviso-pago');
    const b = el.querySelector('#sv-pagar');
    if (b) b.addEventListener('click', async () => {
      const aviso = el.querySelector('#sv-aviso-pago'); aviso.textContent = 'Armando el pago…';
      try { const link = await CU.linkDePago(); location.href = link; }   // misma pestaña: en el celular es lo que funciona
      catch (err) { aviso.textContent = err.message; }
    });
  }
  // el botón del encabezado: "Entrar" o el estado del pase; toca y baja al panel de la cuenta
  function pintarBotonCuenta() {
    const b = $('sv-cuenta-boton'); if (!b || !CU || !CU.hayBackend() || MAM()) return;
    const entro = !!ACCESO.sesion;
    const prueba = !ACCESO.pase && enPrueba() && ACCESO.cobra;
    b.innerHTML = entro ? `<span class="sv-punto-pase${ACCESO.pase || prueba ? '' : ' sin'}"></span>${ACCESO.pase ? 'Con el pase' : prueba ? 'Prueba: ' + esc(faltaTexto(ACCESO.prueba)) : 'Tu cuenta'}` : (ACCESO.cobra ? 'Probar gratis' : 'Entrar');
    b.onclick = () => { const c = $('sv-cuenta'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = c && c.querySelector('input[type=email]'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 400); };
    b.hidden = false;
  }
  // ---------- el iPhone: la compra por StoreKit ----------
  // Si tienda-sv.js no viajó, se dice que lo básico es gratis y no se ofrece nada. Nunca Mercado Pago.
  function candadoIosHTML(entro) {
    return `<div class="sv-tarjeta sv-candado"><h2>${ACCESO.prueba ? 'Terminó tu prueba gratis' : 'El pronóstico es del pase'}</h2>
      <div class="sv-nota">Los números de los próximos partidos, la perilla y la simulación punto a punto. Los resultados y "Está medido" son gratis, siempre.</div>
      ${entro ? panelIosHTML() : `<div class="sv-nota"><b>Pruébalo ${esc(diasPrueba())} gratis:</b> entra o crea tu cuenta y el pronóstico se abre solo.</div>${formularioHTML('sv-c1')}`}</div>`;
  }
  let IOS_COMPRANDO = false;
  function panelIosHTML() {
    const T = TIENDA();
    if (!T) return '<div class="sv-nota"><b>Lo básico es gratis:</b> los resultados con su pronóstico y "Está medido".</div>';
    const e = T.estado();
    if (T.hayQuePreguntar(e.plan, e.estado, e.cuando)) T.traerPlan().then(() => repintar());
    return `<div class="sv-ios">${T.panelHTML({ comprando: IOS_COMPRANDO })}</div>`;
  }
  function engancharIos(el) {
    const T = TIENDA(); if (!T || !el) return;
    const decir = (t) => { const a = el.querySelector('.sv-aviso-ios'); if (a) a.textContent = t; };
    el.querySelectorAll('[data-ios="link"]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); const n = NAT(); if (!(n && n.abrir(a.href))) window.open(a.href, '_blank'); }));
    const c = el.querySelector('[data-ios="comprar"]'); if (c) c.addEventListener('click', async () => {
      IOS_COMPRANDO = true; repintar();
      try { await T.comprar(); await confirmarConApple(); }
      catch (err) { if (!T.cancelada(err)) alert(T.textoDeError(err)); }
      finally { IOS_COMPRANDO = false; repintar(); }
    });
    const r = el.querySelector('[data-ios="restaurar"]'); if (r) r.addEventListener('click', async () => {
      IOS_COMPRANDO = true; repintar();
      try { await T.restaurar(); await confirmarConApple(); }
      catch (err) { alert(T.textoDeError(err)); }
      finally { IOS_COMPRANDO = false; repintar(); }
    });
  }
  // La compra terminó en el teléfono; el pase lo decide el servidor: se le pregunta a pago-apple y se vuelve a leer el pase.
  async function confirmarConApple() {
    try { await CU.avisarPagoDeApple(); } catch (e) { alert(e.message || 'Apple cobró pero no pude activarlo. Escríbenos y lo arreglamos.'); }
    await cargarAcceso(); repintar();
  }

  // ---------- la barra del pase: fija abajo, siempre que no tengas el pase ----------
  // Con prueba: cuánto te queda + comprar. Sin prueba: comprar. Sin cuenta: comprar (pide entrar y después sigue solo al pago).
  const QUIERE = 'sv.quiere-pase';
  function pintarBarra() {
    let b = $('sv-barra-pase');
    const toca = CU && CU.hayBackend() && ACCESO.cobra && !ACCESO.pase;
    if (!toca) { if (b) b.hidden = true; document.body.classList.remove('sv-con-barra'); return; }
    if (!b) { b = document.createElement('div'); b.id = 'sv-barra-pase'; b.className = 'sv-barra-pase'; document.body.appendChild(b); }
    const entro = !!ACCESO.sesion; const prueba = entro && enPrueba();
    const texto = prueba ? `<b>Prueba gratis</b> · te quedan <b id="sv-prueba-falta">${esc(faltaTexto(ACCESO.prueba))}</b>`
      : entro && ACCESO.prueba ? '<b>Terminó tu prueba gratis</b>'
      : entro ? '<b>El pronóstico es del pase</b>'
      : `<b>${esc(diasPrueba())} gratis</b> · después ${ACCESO.precio ? esc(precioTexto()) : 'con el pase'}`;
    const precio = !esIos() && ACCESO.precio ? `<span>${esc(precioTexto())}</span>` : '';
    b.innerHTML = `<div class="sv-barra-texto">${texto}</div>
      <button class="sv-boton" type="button" id="sv-comprar">${esIos() ? 'Ver el pase' : 'Sacar el pase'}${entro && precio ? precio : ''}</button>
      <div class="sv-aviso" id="sv-aviso-barra"></div>`;
    b.hidden = false; document.body.classList.add('sv-con-barra');
    b.querySelector('#sv-comprar').onclick = MAM() ? () => window.mamMarco.pase('tenis') : comprar;
  }
  async function comprar(plan) {
    const aviso = $('sv-aviso-barra');
    const irACuenta = (msg) => { const c = $('sv-cuenta'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (msg && aviso) aviso.textContent = msg; const i = c && c.querySelector('input[type=email]'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 400); };
    if (esIos()) return irACuenta();                                   // en el iPhone se compra en el panel de StoreKit
    if (!ACCESO.sesion) { try { sessionStorage.setItem(QUIERE, '1'); } catch (e) {} return irACuenta('Entra o crea tu cuenta: el pase queda en tu cuenta y sigues directo al pago.'); }
    if (aviso) aviso.textContent = 'Armando el pago…';
    try { location.href = await CU.linkDePago(plan); } catch (err) { if (aviso) aviso.textContent = err.message; }
  }
  // si tocó "Sacar el pase" sin cuenta, al entrar sigue solo al pago
  async function seguirAlPagoSiQueria() {
    let q = null; try { q = sessionStorage.getItem(QUIERE); } catch (e) {}
    if (!q || !ACCESO.sesion || ACCESO.pase || esIos()) return;
    try { sessionStorage.removeItem(QUIERE); } catch (e) {}
    await comprar(q === '1' ? null : q);          /* '1' es el recuerdo viejo, sin plan */
  }

  let BORRANDO = false;
  function borrarHTML() {
    return `<div class="sv-borrando" id="sv-borrando">
      <b>¿Borrar tu cuenta para siempre?</b>
      <div class="sv-nota">Se borran en el acto tu correo, tu pase, tu prueba gratis y todo lo tuyo. Es la misma cuenta que Armá el 11, así que también se borra ahí. No se puede deshacer.</div>
      ${esIos() ? '<div class="sv-nota">Si pagas el plan con Apple, borrar la cuenta no corta la suscripción: se cancela en Ajustes › tu nombre › Suscripciones.</div>' : ''}
      <div class="sv-form-botones"><button class="sv-liso" id="sv-no-borrar" type="button">Mejor no</button><button class="sv-boton sv-boton-peligro" id="sv-si-borrar" type="button">Sí, borrarla</button></div>
      <div class="sv-aviso" id="sv-aviso-borrar"></div></div>`;
  }
  function pintarCuenta() {
    pintarBotonCuenta();
    pintarBarra();
    const el = $('sv-cuenta'); if (!el || !CU || !CU.hayBackend()) return;
    if (MAM()) { el.hidden = true; return; }   // adentro de Mano a mano la cuenta es una sola y la pinta el cascarón
    const entro = !!ACCESO.sesion;
    const hasta = ACCESO.hasta ? new Date(ACCESO.hasta) : null;
    const pase = ACCESO.pase && hasta ? 'Tienes el pase hasta el ' + hasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) + '.' : ACCESO.cobra && enPrueba() ? 'Estás en la prueba gratis: te quedan ' + faltaTexto(ACCESO.prueba) + '. Después, el pronóstico es del pase.' : ACCESO.cobra && ACCESO.prueba ? 'Terminó tu prueba gratis. No tienes el pase.' : ACCESO.cobra ? 'No tienes el pase.' : 'No tienes el pase. Por ahora el pronóstico es gratis para todos; el pase se puede sacar igual.';
    el.innerHTML = `
      <div class="sv-seccion"><span>Cuenta</span><small>la misma que Armá el 11</small></div>
      <div class="sv-tarjeta">
        ${entro
          ? `<div class="sv-nota">Entraste. ${esc(pase)}</div>${!ACCESO.pase && esIos() ? panelIosHTML() : !ACCESO.pase ? `${esDoble() ? '' : `<div class="sv-precio">${esc(precioTexto())}<span>el pronóstico, la perilla y la simulación de todos los partidos · se paga con Mercado Pago · sin renovación automática</span></div>`}${botonesPlanes('sv-aviso-pago-2')}` : ''}<div class="sv-form-botones"><button class="sv-liso" id="sv-salir" type="button">Salir</button><button class="sv-liso sv-borrar" id="sv-borrar" type="button">Borrar mi cuenta</button></div>${BORRANDO ? borrarHTML() : ''}`
          : `<div class="sv-nota">Sin cuenta se ve todo lo gratis. La cuenta sirve para el pase, y es la misma que Armá el 11.</div>${formularioHTML('sv-c2')}`}
      </div>`;
    engancharFormulario(el.querySelector('form'));
    engancharIos(el);
    const salir = el.querySelector('#sv-salir'); if (salir) salir.addEventListener('click', async () => { CU.salir(); await cargarAcceso(); repintar(); });
    const bb = el.querySelector('#sv-borrar'); if (bb) bb.addEventListener('click', () => { BORRANDO = true; pintarCuenta(); const c = $('sv-borrando'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    const bn = el.querySelector('#sv-no-borrar'); if (bn) bn.addEventListener('click', () => { BORRANDO = false; pintarCuenta(); });
    const bs = el.querySelector('#sv-si-borrar'); if (bs) bs.addEventListener('click', async () => {
      const aviso = el.querySelector('#sv-aviso-borrar'); bs.disabled = true; aviso.textContent = 'Borrando…';
      try { await CU.borrarMiCuenta(); BORRANDO = false; await cargarAcceso(); repintar(); const n = $('sv-cuenta'); const t = n && n.querySelector('.sv-tarjeta'); if (t) t.insertAdjacentHTML('afterbegin', '<div class="sv-aviso">Listo: tu cuenta se borró.</div>'); }
      catch (err) { bs.disabled = false; aviso.textContent = 'No se pudo borrar: ' + (err.message || 'prueba de nuevo.'); }
    });
    engancharPlanes(el, 'sv-aviso-pago-2');
    const b = el.querySelector('#sv-pagar-2'); if (b) b.addEventListener('click', async () => {
      const aviso = el.querySelector('#sv-aviso-pago-2'); aviso.textContent = 'Armando el pago…';
      try { location.href = await CU.linkDePago(); } catch (err) { aviso.textContent = err.message; }
    });
    el.hidden = false;
  }
  async function cargarAcceso() {
    ACCESO.sesion = null; ACCESO.pase = false; ACCESO.hasta = null; ACCESO.prueba = null;
    if (!CU || !CU.hayBackend()) { ACCESO.cobra = false; return; }
    CU.capturarVuelta();
    ACCESO.sesion = await CU.asegurarSesion();
    if (ACCESO.sesion && CU.asegurarPerfil) { try { await CU.asegurarPerfil(); } catch (e) {} }
    const T = TIENDA(); if (T) { T.arrancar(ACCESO.sesion ? ACCESO.sesion.uid : null); T.quienCompra(ACCESO.sesion ? ACCESO.sesion.uid : null); }
    ACCESO.cobra = await CU.cobraDeVerdad();
    if (ACCESO.sesion) { try { const m = await CU.miPase(); ACCESO.pase = m.activo; ACCESO.hasta = m.hasta; if (m.activo && CA()) CA().pase(); } catch (e) {} }
    ACCESO.prueba = null;
    if (ACCESO.sesion && ACCESO.cobra && !ACCESO.pase && CU.miPrueba) { try { const pr = await CU.miPrueba(); ACCESO.prueba = pr.hasta; } catch (e) {} }
    if (!esIos() && !ACCESO.pase && (ACCESO.cobra || ACCESO.sesion) && ACCESO.precio == null) { /* en iPhone el precio lo pone StoreKit */ try { const pl = await CU.planes(); ACCESO.planes = pl; ACCESO.precio = pl[0] ? pl[0].precio : null; } catch (e) {} }
  }
  let PARTIDOS = [];
  function repintar() {
    if (E) pintarPuerta();
    pintarLista(PARTIDOS);
    pintarCuenta();
  }

  // el reloj de la prueba: el texto se actualiza solo, y cuando vence se cierra la puerta sin recargar
  let estabaAbierto = null;
  setInterval(() => {
    if (!ACCESO.prueba) return;
    const f = $('sv-prueba-falta'); const t = faltaTexto(ACCESO.prueba); if (f && t) f.textContent = t;
    const ab = abierto(); if (estabaAbierto !== null && ab !== estabaAbierto) repintar(); estabaAbierto = ab;
    if (!t) pintarBarra();
    pintarBotonCuenta();
  }, 30000);

  // ---------- las pestañas de arriba ----------
  // Tres lugares, no una tira: Partidos (la puerta y la semana), Juegos, Resultados (jugados y "Está medido").
  // La cuenta está en las tres, abajo. La elegida queda para la visita; el que llega por un link a un partido ve Partidos.
  const PESTANAS = ['partidos', 'juegos', 'resultados'];
  const PEST_DE = { lista: 'partidos', perilla: 'partidos', simular: 'partidos', juga: 'juegos', jugados: 'resultados', medido: 'resultados' };
  function pestana(nombre) {
    if (!PESTANAS.includes(nombre)) nombre = 'partidos';
    PESTANAS.forEach((n) => document.body.classList.toggle('sv-pest-' + n, n === nombre));
    document.body.classList.toggle('sv-pest-ambas', MAM() && nombre === 'partidos');   // adentro de la app, los resultados van debajo de los partidos
    document.querySelectorAll('#sv-pestanas [data-pestana]').forEach((b) => b.setAttribute('aria-selected', b.dataset.pestana === nombre ? 'true' : 'false'));
    try { sessionStorage.setItem('sv.pestana', nombre); } catch (e) {}
    return nombre;
  }
  function engancharPestanas(inicial) {
    document.querySelectorAll('#sv-pestanas [data-pestana]').forEach((b) => b.addEventListener('click', () => { pestana(b.dataset.pestana); window.scrollTo({ top: 0 }); }));
    let guardada = null; try { guardada = sessionStorage.getItem('sv.pestana'); } catch (e) {}
    pestana(inicial || guardada || 'partidos');
  }
  window.svPestana = pestana;

  // ---------- arranque ----------
  async function arrancar() {
    if (CA()) CA().arrancar();
    if (window.svDatosListos) { try { await window.svDatosListos; } catch (e) {} HOY = window.SV_HOY || HOY; MEDIDO = window.SV_MEDIDO || MEDIDO; }
    const n = NAT(); if (n) { n.engancharLinks(document); n.alCambiarRed((hay) => { document.body.classList.toggle('sv-sin-red', !hay); }); n.hayRed().then((hay) => document.body.classList.toggle('sv-sin-red', !hay)); }
    $('sv-fecha').textContent = generadoTexto(HOY.generado) + (viejaLaFoto(HOY.generado) ? ' · datos de ese momento' : '');
    // un partido cuya hora pasó hace más de 3 horas y sin resultado no se ofrece (casi seguro ya se jugó), salvo que esté en juego
    const ahora = Date.now() - 3 * 3600000;
    const viejo = (p) => ahora - Date.parse(p.fecha + 'T' + (p.hora || '00:00') + ':00Z') > (p.enJuego ? 8 : 3) * 3600000;
    const partidos = (HOY.partidos || []).filter((p) => !viejo(p)).sort((x, y) => (x.fecha + (x.hora || '')).localeCompare(y.fecha + (y.hora || '')));
    if (!sv) { $('sv-lista').innerHTML = '<div class="sv-vacio">Falta el motor (tenis-motor.js).</div>'; return; }
    // la puerta abre con el primer partido con pronóstico: el de hoy si hay, si no el próximo
    // #simular=<id>: viene de una página de consulta con ese partido. Se abre ese, y el pedido se borra de la barra
    // (volver atrás no lo reabre). Si el partido ya no está en la lista, queda la portada de siempre, sin error.
    const pedido = (() => { const m = /^#simular=([^&]+)/.exec(location.hash || ''); try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; } })();
    if (pedido) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    engancharPestanas(pedido ? 'partidos' : (/^#(juegos|resultados)$/.exec(location.hash || '') || [])[1]);
    const elPedido = pedido ? partidos.find((p) => String(p.k) === pedido && !p.sinDatos) : null;
    const primero = elPedido || partidos.find((p) => !p.sinDatos && p.fecha >= HOY_AR) || partidos.find((p) => !p.sinDatos);
    PARTIDOS = partidos.filter((p) => p.fecha >= HOY_AR).length ? partidos.filter((p) => p.fecha >= HOY_AR) : partidos;
    // lo gratis se pinta ya; la puerta y la semana esperan a saber si hay pase (una o dos consultas cortas)
    pintarJugados(HOY.jugados || []);
    if (window.svJuegos) { try { window.svJuegos.pintar({ partidos, jugados: HOY.jugados || [], hoy: HOY_AR, jugadores: HOY.jugadores || {} }); } catch (e) { console.error(e); } }
    pintarMedido();
    await cargarAcceso();
    if (primero) cargar(primero);
    repintar();
    pintarGancho(partidos, !!elPedido);
    if (MAM()) { window.mamMarco.alIr((a) => { pestana(a === 'juga' ? 'juegos' : 'partidos'); }); window.mamMarco.listo(); }
    else seguirAlPagoSiQueria();   // volvió del link del mail después de tocar "Sacar el pase"
  }
  // ---------- el gancho de arriba ----------
  // El HTML lo arma el motor (con los números medidos). Acá: la línea de hoy (quién juega, nunca el número), los
  // atajos a cada cosa de la app, y achicarlo para el que ya vino varias veces.
  function pintarGancho() { /* el gancho es estático y corto; las pestañas de arriba son la navegación */ }
  if (typeof window !== 'undefined') window.svPintarGancho = pintarGancho;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
  // instalable: el service worker guarda la pantalla y sirve los datos de la última vez si no hay red
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
