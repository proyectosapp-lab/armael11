// consulta-tenis.mjs — el sitio de consulta de sacavos.com, en HTML estático que arma el motor diario.
//
// Por qué existe (claude/adsense-contenido-familia.md): la portada de sacavos.com tenía 51 palabras visibles sin
// JavaScript. Para un buscador (y para AdSense) era un sitio vacío. Esto agrega dos capas, las dos en HTML que llega
// armado, sin nada dibujado por script:
//   1. Páginas de base: cómo funciona, está medido, el saque, las superficies y el set decisivo. Cada una abre con un
//      número medido (de CIFRAS, una sola tabla) y cierra con el botón al simulador.
//   2. La consulta: una página por partido (jugado o por jugar), por jugador y por torneo, más un índice.
//
// Reglas que no se negocian (cada una tiene prueba en probar-consulta-tenis.mjs):
//   · El número de un partido POR JUGAR queda adentro de la app. Las páginas de próximos no tienen porcentajes del
//     partido: tienen quién juega, cuándo, cómo llega cada uno y el botón "Simulalo" (/#simular=<id>).
//   · "Lo que daba el modelo" sale del recorrido walk-forward: con lo que se sabía antes de cada partido. Se rotula así.
//   · Ningún número inventado: los de las páginas de base salen de CIFRAS, y CIFRAS sale de la medición y de los datos.
//   · Sin palabras de apuestas. Sin fotos, escudos ni logos: monogramas. "App independiente" en todas.
//   · Títulos, descripciones y canonical únicos.
// Puro: recibe datos, devuelve archivos. No toca la red ni el disco.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sv = require('./tenis-motor.js');

export const SITIO = 'https://sacavos.com';
// AdSense: el script va en el <head> de las páginas de la web (no en el iPhone: el empaquetador lo saca).
export const ADSENSE_CLIENTE = 'ca-pub-2032639837955609';
export const ADSENSE_SCRIPT = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENTE}" crossorigin="anonymous"></script>`;
export const DESDE_CONSULTA = '2026-01-01';       // desde acá hay página por partido (lo anterior queda en la historia de cada jugador)
export const MIN_PARTIDOS_JUGADOR = 5;            // menos que esto no alcanza para una página con hechos propios
export const MIN_PARTIDOS_TORNEO = 3;

// En el texto visible de CUALQUIER página pública. "value" se busca como palabra suelta en el texto, no en atributos.
export const PROHIBIDAS = /(?<![\p{L}\p{N}])(cuotas?|picks?|fijas?|value|acert[aá]|ganale a la casa|eficacia|el [uú]nico|apuestas?|apost[aá]r?|betting|odds|bookmakers?|casas? de apuestas)(?![\p{L}\p{N}])/iu;

// ---------- chiquitos ----------
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
export function apellido(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  const sin = partes.filter((x) => !/^[A-ZÁÉÍÓÚ]\.$/.test(x));
  return (sin.length ? sin : partes.slice(-1)).join(' ') || 'Jugador';
}
export const pct = (x) => Math.round(100 * x);
const juegos = (x) => Math.floor(Number(x) || 0);
const SUP = { Hard: 'dura', Clay: 'polvo de ladrillo', Grass: 'césped' };
const SUP_CORTA = { Hard: 'dura', Clay: 'polvo', Grass: 'césped' };
export const supTexto = (f) => (SUP[f.sup] || 'dura') + (f.in ? ' (indoor)' : '');
const RONDAS = { 'Final': 'final', 'Semi-finals': 'semifinal', 'Quarter-finals': 'cuartos de final', '1/8-finals': 'octavos de final', '1/16-finals': '16avos de final', '1/32-finals': '32avos de final', '1/64-finals': '64avos de final', 'Qualy': 'clasificación' };
export const rondaDe = (r) => RONDAS[r] || String(r || 'ronda').toLowerCase();
// "la final", "los cuartos de final", "la clasificación"
export const conArticulo = (r) => { const t = rondaDe(r); return (/avos|cuartos|octavos/.test(t) ? 'los ' : 'la ') + t; };
const ORDEN_RONDA = ['Final', 'Semi-finals', 'Quarter-finals', '1/8-finals', '1/16-finals', '1/32-finals', '1/64-finals', 'Qualy'];
const ordenRonda = (r) => { const i = ORDEN_RONDA.indexOf(r); return i < 0 ? 50 : i; };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLarga(f) { const [y, m, d] = f.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${DIAS[dt.getUTCDay()]} ${d} de ${MESES[m - 1]} de ${y}`; }
const fechaCorta = (f) => { const [, m, d] = f.split('-').map(Number); return `${d}/${m}`; };
const anio = (f) => f.slice(0, 4);
export const setsJugados = (f) => (f.sets || []).filter((s) => juegos(s[0]) + juegos(s[1]) > 0);
export function marcador(f, desde = 'a') {
  const tb = f.tb || [];
  return setsJugados(f).map((s, i) => {
    const a = juegos(s[0]), b = juegos(s[1]); const t = tb[i];
    const [x, y] = desde === 'a' ? [a, b] : [b, a];
    const perdedorTb = t && (a === 7 && b === 6 ? t[1] : a === 6 && b === 7 ? t[0] : null);
    return `${x}-${y}${perdedorTb != null && Number.isFinite(Number(perdedorTb)) ? `(${juegos(perdedorTb)})` : ''}`;
  }).join(' ');
}
const nombreDe = (f, lado) => (lado === 'a' ? f.na : f.nb) || 'Jugador';
const claveDe = (f, lado) => String(lado === 'a' ? f.a : f.b);

// ---------- la tabla de cifras (una sola; las páginas de base leen solo de acá) ----------
export function cifrasDe(m, filas, desde) {
  const r1 = (x) => Math.round(x);
  const caj = (lo) => (m.cajones || []).find((c) => Math.abs(c.desde - lo) < 1e-9) || { n: 0, dijo: 0, paso: 0 };
  // el saque del circuito y "3 puntos de saque cambian X de partido", con el motor de verdad
  const con = filas.filter((f) => f.g && !f.ret && f.s && f.s[0] > 0 && f.s[2] > 0 && f.f >= desde);
  const S = con.reduce((s, f) => s + f.s[0] + f.s[2], 0), W = con.reduce((s, f) => s + f.s[1] + f.s[3], 0);
  const spw = S ? W / S : 0.63;
  const cambia = (bo) => r1(100 * sv.svProbabilidad(spw + 0.03, spw, bo).ganar) - 50;
  const porSup = {};
  for (const sup of ['Hard', 'Clay', 'Grass']) {
    const fs = filas.filter((f) => f.g && !f.ret && f.f >= desde && (f.sup || 'Hard') === sup);
    const cs = fs.filter((f) => f.s && f.s[0] > 0 && f.s[2] > 0);
    const s = cs.reduce((a, f) => a + f.s[0] + f.s[2], 0), w = cs.reduce((a, f) => a + f.s[1] + f.s[3], 0);
    const sets = fs.flatMap((f) => setsJugados(f));
    const tbs = sets.filter((x) => (juegos(x[0]) === 7 && juegos(x[1]) === 6) || (juegos(x[0]) === 6 && juegos(x[1]) === 7)).length;
    const bo3 = fs.filter((f) => (f.bo || 3) === 3);
    const dec = bo3.filter((f) => setsJugados(f).length === 3).length;
    porSup[sup] = { partidos: fs.length, saque: s ? r1(100 * w / s) : null, tiebreak: sets.length ? r1(100 * tbs / sets.length) : null, decisivo: bo3.length ? r1(100 * dec / bo3.length) : null };
  }
  return {
    desde, partidos: m.n, acierta: r1(100 * m.acierta),
    cajones: [0.5, 0.6, 0.7, 0.8].map((lo) => { const c = caj(lo); return { desde: r1(lo * 100), hasta: lo === 0.8 ? 100 : r1(lo * 100 + 10), n: c.n, dijo: r1(100 * c.dijo), paso: r1(100 * c.paso) }; }),
    decisivoDicho: r1(100 * m.decisivoDicho), decisivoReal: r1(100 * m.decisivoReal),
    saqueCircuito: r1(100 * spw), cambiaBo3: cambia(3), cambiaBo5: cambia(5), superficies: porSup,
  };
}

// ---------- el esqueleto de cada página ----------
const PIE_LINKS = [['/como-funciona.html', 'Cómo funciona'], ['/esta-medido.html', 'Está medido'], ['/el-saque.html', 'El saque'], ['/superficies.html', 'Las superficies'], ['/set-decisivo.html', 'El set decisivo'], ['/consulta/', 'Resultados y partidos'], ['/privacidad.html', 'Privacidad'], ['/terminos.html', 'Términos y contacto']];
export function pagina({ ruta, titulo, descripcion, cuerpo, indexar = true }) {
  const canon = SITIO + '/' + ruta.replace(/index\.html$/, '');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(canon)}">
${indexar ? '' : '<meta name="robots" content="noindex">\n'}<meta name="theme-color" content="#F6F1EA">
<link rel="icon" href="/icono.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/sacavos.css">
<link rel="stylesheet" href="/consulta.css">
${ADSENSE_SCRIPT}
</head>
<body>
<div class="sv-app sv-pagina">
  <header class="sv-cab">
    <a class="sv-marca" href="/" aria-label="Sacá vos, el simulador">
      <span class="sv-loseta"><span class="sv-pelota"></span></span>
      <span class="sv-nombre">Sacá vos</span>
    </a>
    <a class="sv-cuenta-boton" href="/">Abrir el simulador</a>
  </header>
  <main>
${cuerpo}
  </main>
  <footer class="sv-pie">
    <nav class="sv-doc-links">${PIE_LINKS.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join(' · ')}</nav>
    <p><strong>Sacá vos</strong> es una app independiente. No tiene relación con la ATP, los torneos ni los jugadores. Datos de partidos: api-tennis.com.</p>
    <p><a href="https://www.instagram.com/sacavos.ok" rel="noopener">@sacavos.ok</a></p>
  </footer>
</div>
</body>
</html>
`;
}
const boton = (href, texto) => `<p class="sv-doc-cta"><a class="sv-boton" href="${esc(href)}">${esc(texto)}</a></p>`;
const mono = (n) => { const p = apellido(n).replace(/[^A-Za-zÀ-ÿ]/g, ''); const ini = String(n || '').trim().charAt(0); return esc(((ini || '') + (p.charAt(0) || '')).toUpperCase().slice(0, 2)); };

// ---------- el puntito (la misma regla que la app) ----------
// parejo: el favorito no llegaba al 60% (con el número redondeado que se muestra); con 60% o más, favorito si ganó y
// sorpresa si perdió.
export function puntito(p, gano) {
  if (p == null) return null;
  const fav = Math.max(pct(p), 100 - pct(p));
  const acerto = (p >= 0.5) === (gano === 1);
  if (fav < 60) return { clase: acerto ? 'pv' : 'pg', rotulo: 'parejo', fav };
  return acerto ? { clase: 'pv', rotulo: 'favorito', fav } : { clase: 'pn', rotulo: 'sorpresa', fav };
}

// el porqué del color, corto, para las listas
export function porqueCorto(f, d) {
  const pt = d ? puntito(d.p, f.g) : null; if (!pt) return '';
  const fav = apellido(d.p >= 0.5 ? f.na : f.nb);
  const t = pt.rotulo === 'sorpresa' ? `sorpresa: el modelo le daba ${pt.fav}% a ${fav}`
    : pt.rotulo === 'favorito' ? `ganó el favorito (${pt.fav}%)`
    : pt.clase === 'pv' ? `parejo, ganó el de arriba (${pt.fav}%)` : `parejo: le daba ${pt.fav}% a ${fav}`;
  return ` <span class="sv-doc-porque">· ${esc(t)}</span>`;
}

// la leyenda de los puntitos (la misma que en la app)
export const LEYENDA = `<div class="sv-leyenda">
      <div><i class="sv-dot pv"></i><span><b>Verde:</b> ganó el que el modelo ponía arriba.</span></div>
      <div><i class="sv-dot pg"></i><span><b>Gris:</b> ganó el otro, pero era parejo (el modelo no le daba 60% a ninguno).</span></div>
      <div><i class="sv-dot pn"></i><span><b>Naranja:</b> sorpresa. Ganó el que tenía 40% o menos.</span></div>
      <p>Siempre con lo que se sabía antes de cada partido. Se muestran todos, también los que no salieron.</p></div>`;

// ---------- la aguja: el saque esperado contra el real (la misma lectura que la app) ----------
export function aguja(f, d) {
  if (!d || !f.s || !(f.s[0] > 0) || !(f.s[2] > 0) || d.pa == null) return null;
  const a = apellido(f.na), b = apellido(f.nb);
  const espA = pct(d.pa), espB = pct(d.pb), realA = pct(f.s[1] / f.s[0]), realB = pct(f.s[3] / f.s[2]);
  const dA = realA - espA, dB = realB - espB;
  const perdio = f.g === 1 ? b : a, gano = f.g === 1 ? a : b;
  const dPerdio = f.g === 1 ? dB : dA, dGano = f.g === 1 ? dA : dB;
  let veredicto;
  if (dPerdio <= -3 && dGano >= 3) veredicto = `${perdio} sacó peor de lo esperado y ${gano} mejor: el partido se fue por los dos lados.`;
  else if (dPerdio <= -3) veredicto = `${perdio} perdió sacando ${Math.abs(dPerdio)} puntos peor de lo esperado.`;
  else if (dGano >= 3) veredicto = `${perdio} sacó como se esperaba; ${gano} sacó ${dGano} puntos mejor y ahí estuvo la diferencia.`;
  else if (dPerdio >= 3) veredicto = `${perdio} sacó ${dPerdio} puntos mejor de lo esperado y perdió igual: se definió en los puntos justos.`;
  else veredicto = 'Los dos sacaron como se esperaba: se definió en los puntos justos.';
  return { a, b, espA, espB, realA, realB, veredicto };
}

// ---------- los datos, ordenados una vez ----------
export function prepararDatos({ filas, dichos, ranking = {}, anticipados = {}, hoy }) {
  const validas = filas.filter((f) => f && f.k && f.a && f.b && f.f);
  const orden = [...validas].sort((x, y) => (x.f + (x.h || '')).localeCompare(y.f + (y.h || '')) || String(x.k).localeCompare(String(y.k)));
  const porJugador = new Map();
  for (const f of orden) for (const lado of ['a', 'b']) { const k = claveDe(f, lado); if (!porJugador.has(k)) porJugador.set(k, []); porJugador.get(k).push(f); }
  const dicho = new Map(dichos.filter((d) => d.evaluable).map((d) => [String(d.k), d]));
  const nombres = new Map();
  for (const f of orden) { if (f.na) nombres.set(String(f.a), f.na); if (f.nb) nombres.set(String(f.b), f.nb); }
  const hoyAR = new Date(hoy.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  return { orden, porJugador, dicho, nombres, ranking, anticipados, hoyAR };
}

// rutas (una sola función por tipo, así los links nunca se desarman)
const torneoClave = (f) => `${f.tk || slug(f.t)}|${anio(f.f)}`;
export const rutaPartido = (f) => `consulta/partidos/${anio(f.f)}/${slug(f.t)}/${slug(apellido(f.na))}-${slug(apellido(f.nb))}-${slug(f.k)}.html`;
export const rutaJugador = (k, nombre) => `consulta/jugadores/${slug(nombre)}-${slug(k)}.html`;
export const rutaTorneo = (f, choca) => `consulta/torneos/${anio(f.f)}/${slug(f.t)}${choca ? '-' + slug(f.tk) : ''}.html`;

// ¿qué páginas hay? (para no linkear a una que no existe)
export function planear(D) {
  const partidos = D.orden.filter((f) => f.f >= DESDE_CONSULTA && f.na && f.nb);
  const jugadores = new Set();
  for (const [k, lista] of D.porJugador) {
    const recientes = lista.filter((f) => f.f >= DESDE_CONSULTA && (f.g || f.f >= D.hoyAR) && !f.c);
    const rk = D.ranking[k] && D.ranking[k].rk;
    if (recientes.length >= MIN_PARTIDOS_JUGADOR || (rk && rk <= 200 && recientes.length >= 1)) jugadores.add(k);
  }
  const torneos = new Map();
  for (const f of partidos) { const c = torneoClave(f); if (!torneos.has(c)) torneos.set(c, []); torneos.get(c).push(f); }
  for (const [c, l] of [...torneos]) if (l.filter((f) => !f.c).length < MIN_PARTIDOS_TORNEO) torneos.delete(c);
  // dos torneos con el mismo nombre el mismo año (pasa con los challengers de semanas distintas): se les suma la clave
  const nombres = new Map(); for (const [c, l] of torneos) { const n = anio(l[0].f) + '|' + slug(l[0].t); nombres.set(n, (nombres.get(n) || 0) + 1); }
  const rutaT = new Map(); for (const [c, l] of torneos) rutaT.set(c, rutaTorneo(l[0], nombres.get(anio(l[0].f) + '|' + slug(l[0].t)) > 1));
  return { partidos, jugadores, torneos, rutaT };
}

const linkJugador = (D, P, k, texto) => P.jugadores.has(String(k)) ? `<a href="/${rutaJugador(k, D.nombres.get(String(k)) || texto)}">${esc(texto)}</a>` : esc(texto);
const linkPartido = (f, texto, P) => (f.f >= DESDE_CONSULTA && f.na && f.nb) ? `<a href="/${rutaPartido(f)}">${esc(texto)}</a>` : esc(texto);
const linkTorneo = (P, f, texto) => { const r = P.rutaT.get(torneoClave(f)); return r ? `<a href="/${r}">${esc(texto)}</a>` : esc(texto); };

// cómo llegaba un jugador ANTES de una fecha (lo que se sabía: nada del futuro)
function llegada(D, k, antesDe, sup) {
  const lista = (D.porJugador.get(String(k)) || []).filter((f) => f.g && f.f < antesDe);
  const ult = lista.slice(-5).reverse();
  const hace = new Date(Date.parse(antesDe + 'T00:00:00Z') - 365 * 86400000).toISOString().slice(0, 10);
  const anioAtras = lista.filter((f) => f.f >= hace);
  let S = 0, W = 0, Ss = 0, Ws = 0, g = 0;
  for (const f of anioAtras) {
    const esA = String(f.a) === String(k); if ((f.g === 1) === esA) g++;
    if (f.s && !f.ret && f.s[0] > 0 && f.s[2] > 0) { const s = esA ? f.s[0] : f.s[2], w = esA ? f.s[1] : f.s[3]; S += s; W += w; if ((f.sup || 'Hard') === sup) { Ss += s; Ws += w; } }
  }
  return { ult, n: anioAtras.length, g, saque: S >= 200 ? pct(W / S) : null, saqueSup: Ss >= 150 ? pct(Ws / Ss) : null };
}
function lineaResultado(D, P, f, k) {
  const esA = String(f.a) === String(k); const gano = (f.g === 1) === esA;
  const rival = esA ? f.nb : f.na;
  return `<li><span class="sv-gp ${gano ? 'g' : 'p'}">${gano ? 'G' : 'P'}</span> ${linkPartido(f, (gano ? 'le ganó a ' : 'perdió con ') + apellido(rival), P)} · ${esc(marcador(f, esA ? 'a' : 'b'))} · ${esc(f.t)}, ${esc(rondaDe(f.r))} (${fechaCorta(f.f)})</li>`;
}
function bloqueLlegada(D, P, f) {
  const sup = f.sup || 'Hard';
  return ['a', 'b'].map((lado) => {
    const k = claveDe(f, lado), n = nombreDe(f, lado), L = llegada(D, k, f.f, sup);
    const datos = [];
    if (L.n) datos.push(`en los 12 meses anteriores ganó ${L.g} de ${L.n} partidos`);
    if (L.saque != null) datos.push(`ganaba el ${L.saque}% de los puntos con su saque${L.saqueSup != null ? ` (${L.saqueSup}% en ${SUP_CORTA[sup]})` : ''}`);
    return `<div class="sv-tarjeta sv-doc-llega"><div class="sv-doc-jug"><span class="sv-mono">${mono(n)}</span><h3>${linkJugador(D, P, k, n)}</h3></div>
      <p>${datos.length ? esc(apellido(n)) + ' ' + esc(datos.join('; ')) + '.' : 'Sin partidos registrados en los 12 meses anteriores.'}</p>
      ${L.ult.length ? `<ul class="sv-doc-lista">${L.ult.map((x) => lineaResultado(D, P, x, k)).join('')}</ul>` : ''}</div>`;
  }).join('\n');
}
function caraACara(D, P, f) {
  const antes = (D.porJugador.get(String(f.a)) || []).filter((x) => x.g && x.f < f.f && (String(x.b) === String(f.b) || String(x.a) === String(f.b)));
  if (!antes.length) return `<p>Es el primer cruce entre ${esc(apellido(f.na))} y ${esc(apellido(f.nb))} desde 2021 en el circuito.</p>`;
  const gA = antes.filter((x) => (x.g === 1) === (String(x.a) === String(f.a))).length;
  return `<p>Se cruzaron ${antes.length} ${antes.length === 1 ? 'vez' : 'veces'} desde 2021: ${esc(apellido(f.na))} ganó ${gA} y ${esc(apellido(f.nb))} ${antes.length - gA}.</p>
    <ul class="sv-doc-lista">${antes.slice(-5).reverse().map((x) => lineaResultado(D, P, x, f.a)).join('')}</ul>`;
}

// ---------- las fichas para la app (gratis): dato puro, sin pronóstico ----------
// Por cada jugador que aparece en la semana: país y ranking, ganados por superficie en el año, saque y devolución de los
// últimos 12 meses por superficie (lo mismo que usa el modelo), los últimos 10 partidos y lo que viene. Y por cada
// partido, el cara a cara. Es lo que ya cuentan las páginas de consulta, en JSON chico para llevarlo adentro de la app.
export function fichaJugador(D, k) {
  k = String(k);
  const lista = D.porJugador.get(k) || [];
  const nombre = D.nombres.get(k) || 'Jugador';
  const rk = D.ranking[k] || {};
  const jugados = lista.filter((f) => f.g && !f.c);
  const anioAct = D.hoyAR.slice(0, 4);
  const delAnio = jugados.filter((f) => anio(f.f) === anioAct);
  const gana = (f) => (f.g === 1) === (String(f.a) === k);
  const hace = new Date(Date.parse(D.hoyAR + 'T00:00:00Z') - 365 * 86400000).toISOString().slice(0, 10);
  const sup = ['Hard', 'Clay', 'Grass'].map((s) => {
    const l = delAnio.filter((f) => (f.sup || 'Hard') === s);
    let S = 0, W = 0, R = 0, V = 0;
    for (const f of jugados) { if (f.f < hace || f.ret || !f.s || (f.sup || 'Hard') !== s || !(f.s[0] > 0) || !(f.s[2] > 0)) continue; const esA = String(f.a) === k; S += esA ? f.s[0] : f.s[2]; W += esA ? f.s[1] : f.s[3]; R += esA ? f.s[2] : f.s[0]; V += esA ? f.s[2] - f.s[3] : f.s[0] - f.s[1]; }
    return { s, n: l.length, g: l.filter(gana).length, saque: S >= 150 ? pct(W / S) : null, resto: R >= 150 ? pct(V / R) : null };
  }).filter((x) => x.n || x.saque != null);
  const ult = jugados.slice(-10).reverse().map((f) => { const esA = String(f.a) === k; return { f: f.f, t: f.t, r: f.r, rival: esA ? f.nb : f.na, rk: esA ? f.b : f.a, g: gana(f) ? 1 : 0, m: marcador(f, esA ? 'a' : 'b') + (f.ret ? ' ret.' : ''), sup: f.sup || 'Hard' }; });
  const viene = lista.filter((f) => !f.g && !f.c && f.f >= D.hoyAR).slice(0, 3).map((f) => { const esA = String(f.a) === k; return { f: f.f, t: f.t, r: f.r, rival: esA ? f.nb : f.na, rk: esA ? f.b : f.a, k: f.k }; });
  return { k, nombre, pais: rk.pais || null, rk: rk.rk || null, anio: anioAct, n: delAnio.length, g: delAnio.filter(gana).length, sup, ult, viene, golpes: golpesDe(jugados, k, hace) };
}
/* Los números de los últimos 12 meses que el proveedor manda y antes se tiraban. Son
   descriptivos: se midió si servían para pronosticar y no sirven (claude/tenis-break-points.md).
   Van acá porque al hincha le interesan, no porque muevan el modelo. */
export function golpesDe(jugados, k, desde) {
  k = String(k);
  let n = 0, aces = 0, df = 0, nAc = 0, bpS = 0, bpE = 0, bpC = 0, bpO = 0, win = 0, err = 0, nWe = 0;
  for (const f of jugados) {
    if (f.f < desde || f.ret) continue;
    const esA = String(f.a) === k; n++;
    if (f.ac) { nAc++; aces += esA ? f.ac[0] : f.ac[2]; df += esA ? f.ac[1] : f.ac[3]; }
    if (f.bp) {
      const [sa, ea, sb, eb] = f.bp;
      bpS += esA ? sa : sb; bpE += esA ? ea : eb;                        // los que salvó al saque
      bpC += esA ? eb - sb : ea - sa; bpO += esA ? eb : ea;              // los que convirtió al resto
    }
    if (f.we) { nWe++; win += esA ? f.we[0] : f.we[2]; err += esA ? f.we[1] : f.we[3]; }
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    n, nAc, nWe,
    aces: nAc >= 5 ? r1(aces / nAc) : null, df: nAc >= 5 ? r1(df / nAc) : null,
    salvados: bpE >= 30 ? pct(bpS / bpE) : null, convertidos: bpO >= 30 ? pct(bpC / bpO) : null,
    winners: nWe >= 5 ? r1(win / nWe) : null, errores: nWe >= 5 ? r1(err / nWe) : null,
  };
}
export function caraACaraDatos(D, f) {
  const antes = (D.porJugador.get(String(f.a)) || []).filter((x) => x.g && !x.c && x.f < f.f && (String(x.b) === String(f.b) || String(x.a) === String(f.b)));
  const gA = antes.filter((x) => (x.g === 1) === (String(x.a) === String(f.a))).length;
  return { n: antes.length, gA, ult: antes.slice(-3).reverse().map((x) => { const esA = String(x.a) === String(f.a); return { f: x.f, t: x.t, g: (x.g === 1) === esA ? 1 : 2, m: marcador(x, esA ? 'a' : 'b'), sup: x.sup || 'Hard' }; }) };
}
// lo que va adentro de tenis-hoy.js: { jugadores: {k: ficha}, cruces: {kPartido: caraACara} } para los partidos de la semana
export function fichasParaLaApp({ filas, ranking, hoy, partidos }) {
  const D = prepararDatos({ filas, dichos: [], ranking, hoy });
  const jugadores = {}, cruces = {};
  for (const p of partidos) {
    for (const k of [p.a, p.b]) if (k != null && !jugadores[String(k)]) jugadores[String(k)] = fichaJugador(D, k);
    cruces[String(p.k)] = caraACaraDatos(D, { k: p.k, a: p.a, b: p.b, f: p.f });
  }
  return { jugadores, cruces };
}

// ---------- una página por partido ----------
/* Las filas de aces, break points y winners de un partido, para la tabla de los números.
   Cada una sale solo si el proveedor trajo ese dato: no hay ceros inventados. */
export function filasGolpes(f) {
  const filas = [];
  if (f.ac) filas.push(['Aces', f.ac[0], f.ac[2]], ['Dobles faltas', f.ac[1], f.ac[3]]);
  if (f.bp) {
    const [sa, ea, sb, eb] = f.bp;
    if (ea || eb) filas.push(['Break points salvados', `${sa} de ${ea}`, `${sb} de ${eb}`]);
    if (ea || eb) filas.push(['Break points convertidos', `${eb - sb} de ${eb}`, `${ea - sa} de ${ea}`]);
  }
  if (f.we) filas.push(['Winners', f.we[0], f.we[2]], ['Errores no forzados', f.we[1], f.we[3]]);
  return filas.map(([t, a, b]) => `<tr><td>${t}</td><td>${a}</td><td>${b}</td></tr>`).join('');
}
export function paginaPartido(D, P, f) {
  const ruta = rutaPartido(f);
  const A = apellido(f.na), B = apellido(f.nb), ronda = rondaDe(f.r), torneo = `${f.t} ${anio(f.f)}`;
  const cab = `<p class="sv-doc-sup"><span class="sv-chip sv-sup-${(f.sup || 'Hard').toLowerCase()}">${esc(SUP_CORTA[f.sup] || 'dura')}</span> ${linkTorneo(P, f, torneo)} · ${esc(ronda)} · ${esc(fechaLarga(f.f))}</p>`;
  if (f.c && !f.g) {
    return { ruta, indexar: false, tipo: 'nojugado', titulo: `${A} vs ${B}, ${torneo}: no se jugó | Sacá vos`, descripcion: `${A} y ${B} no llegaron a jugar en ${torneo}.`,
      cuerpo: `<article class="sv-doc">${cab}<h1>${esc(A)} vs ${esc(B)}</h1><p>Este partido de ${esc(conArticulo(f.r))} no se jugó.</p>${boton('/', 'Ver los partidos de la semana')}</article>` };
  }
  if (!f.g) {
    // POR JUGAR: sin número. Quién juega, cuándo, cómo llega cada uno, el cara a cara y el botón al simulador.
    const cuando = `${fechaLarga(f.f)}${f.h ? ', ' + f.h + ' (hora argentina, aproximada)' : ''}`;
    const cuerpo = `<article class="sv-doc">${cab}
      <h1>${esc(A)} vs ${esc(B)}</h1>
      <p class="sv-doc-bajada">${esc(A)} y ${esc(B)} juegan ${esc(conArticulo(f.r))} de ${esc(torneo)}, en cancha ${esc(supTexto(f))}, el ${esc(cuando)}. Al mejor de ${f.bo === 5 ? 'cinco' : 'tres'} sets.</p>
      <h2>Cómo llega cada uno</h2>
      ${bloqueLlegada(D, P, f)}
      <h2>El cara a cara</h2>
      ${caraACara(D, P, f)}
      <h2>El partido, en el simulador</h2>
      <p>En Sacá vos este partido tiene su número, una perilla de saque para cada uno y la simulación punto a punto: movés cuánto saca cada jugador y ves cómo cambia.</p>
      ${boton('/#simular=' + encodeURIComponent(f.k), 'Simulalo')}
    </article>`;
    return { ruta, tipo: 'proximo', indexar: true, titulo: `${A} vs ${B}: ${ronda} de ${torneo} | Sacá vos`, descripcion: `${A} y ${B} en ${ronda} de ${torneo}, en ${SUP_CORTA[f.sup] || 'dura'}: cuándo juegan, cómo llega cada uno y el cara a cara.`, cuerpo };
  }
  // JUGADO
  const ganA = f.g === 1, G = ganA ? A : B, Pd = ganA ? B : A;
  const sets = setsJugados(f); const mark = marcador(f, ganA ? 'a' : 'b');
  const tbs = sets.filter((s) => (juegos(s[0]) === 7 && juegos(s[1]) === 6) || (juegos(s[0]) === 6 && juegos(s[1]) === 7)).length;
  const primero = sets[0] ? (juegos(sets[0][0]) > juegos(sets[0][1]) ? 1 : 2) : null;
  const remontada = primero && primero !== f.g;
  const rosco = sets.some((s) => (juegos(s[0]) === 6 && juegos(s[1]) === 0) || (juegos(s[0]) === 0 && juegos(s[1]) === 6));
  const hechos = [];
  if (f.ret) hechos.push(`${Pd} se retiró durante el partido`);
  else if (remontada) hechos.push(`lo dio vuelta después de perder el primer set`);
  else if (sets.length === (f.bo === 5 ? 3 : 2)) hechos.push(`sin ceder un set`);
  else hechos.push(`en ${sets.length} sets`);
  if (tbs) hechos.push(tbs === 1 ? 'con un tie-break' : `con ${tbs} tie-breaks`);
  if (rosco) hechos.push('con un set 6-0');
  const bajada = `${G} le ganó a ${Pd} ${mark ? mark + ', ' : ''}${hechos.join(', ')}, en ${conArticulo(f.r)} de ${torneo}.`;
  const d = D.dicho.get(String(f.k));
  const ag = aguja(f, d);
  const pt = d ? puntito(d.p, f.g) : null;
  const ant = D.anticipados[String(f.k)];
  const stats = f.s && f.s[0] > 0 && f.s[2] > 0 ? (() => {
    const [sa, wa, sb, wb] = f.s; const ra = sb - wb, rb = sa - wa;
    const tot = sa + sb; const ga = sets.reduce((s, x) => s + juegos(x[0]), 0), gb = sets.reduce((s, x) => s + juegos(x[1]), 0);
    return `<h2>Los números del partido</h2><table class="sv-doc-tabla"><thead><tr><th></th><th>${esc(A)}</th><th>${esc(B)}</th></tr></thead><tbody>
      <tr><td>Puntos ganados con el saque</td><td>${wa} de ${sa} (${pct(wa / sa)}%)</td><td>${wb} de ${sb} (${pct(wb / sb)}%)</td></tr>
      <tr><td>Puntos ganados con la devolución</td><td>${ra} de ${sb} (${pct(ra / sb)}%)</td><td>${rb} de ${sa} (${pct(rb / sa)}%)</td></tr>
      <tr><td>Puntos ganados en total</td><td>${wa + ra} de ${tot}</td><td>${wb + rb} de ${tot}</td></tr>
      <tr><td>Games ganados</td><td>${ga}</td><td>${gb}</td></tr>${filasGolpes(f)}</tbody></table>`;
  })() : '<p>El proveedor no trajo las estadísticas de saque de este partido.</p>';
  const modelo = pt ? `<h2>Lo que daba el modelo</h2>
      <p class="sv-doc-modelo"><span class="sv-dot ${pt.clase}"></span> ${pt.rotulo === 'sorpresa'
        ? `Sorpresa: el modelo le daba ${pt.fav}% a ${esc(d.p >= 0.5 ? A : B)}, y ganó ${esc(G)}.`
        : pt.rotulo === 'favorito' ? `Ganó el favorito: el modelo le daba ${pt.fav}% a ${esc(G)}.`
        : `Partido parejo: el modelo le daba ${pt.fav}% a ${esc(d.p >= 0.5 ? A : B)}.`}</p>
      ${LEYENDA}
      <p class="sv-doc-nota">Calculado con lo que se sabía antes del partido: los puntos con el saque y con la devolución de cada uno en los dos años anteriores y sus resultados. Nada de lo que pasó ese día.${ant && ant.p != null ? ` Sacá vos mostró ${pct(ant.p)}% – ${100 - pct(ant.p)}% antes de que se jugara.` : ''}</p>` : '';
  const agujaHtml = ag ? `<h2>La aguja: el saque</h2>
      <p class="sv-doc-aguja">${esc(ag.veredicto)}</p>
      <p>${esc(ag.a)} ganó el ${ag.realA}% de los puntos con su saque; con lo que se sabía antes del partido se esperaba ${ag.espA}% contra este rival. ${esc(ag.b)}: ${ag.realB}%, y se esperaba ${ag.espB}%.</p>` : '';
  const cuerpo = `<article class="sv-doc">${cab}
      <h1>${esc(A)} vs ${esc(B)}</h1>
      <div class="sv-tarjeta sv-doc-marcador"><div><b>${esc(f.na)}</b>${ganA ? ' <span class="sv-gp g">ganó</span>' : ''}<span>${esc(sets.map((s) => juegos(s[0])).join('  '))}</span></div>
        <div><b>${esc(f.nb)}</b>${!ganA ? ' <span class="sv-gp g">ganó</span>' : ''}<span>${esc(sets.map((s) => juegos(s[1])).join('  '))}</span></div></div>
      <p class="sv-doc-bajada">${esc(bajada)}</p>
      ${agujaHtml}
      ${modelo}
      ${stats}
      <h2>Cómo llegaba cada uno</h2>
      ${bloqueLlegada(D, P, f)}
      <h2>El cara a cara</h2>
      ${caraACara(D, P, f)}
      <p>En Sacá vos cada partido de la semana tiene su número y una perilla de saque para cada jugador: movés el saque y lo jugás punto a punto.</p>
      ${boton('/', 'Simulá los partidos de esta semana')}
    </article>`;
  return { ruta, tipo: 'jugado', indexar: true, titulo: `${A} vs ${B}, ${ronda} de ${torneo}: ${G} ganó ${mark} | Sacá vos`,
    descripcion: `${bajada}${ag ? ' ' + ag.veredicto : ''}`.slice(0, 300), cuerpo };
}

// ---------- una página por jugador ----------
/* El bloque de "cómo juega": los números de los últimos 12 meses, con la aclaración de que
   son descriptivos. Si el proveedor no trajo nada, no aparece. */
export function bloqueGolpes(G, A) {
  if (!G) return '';
  const filas = [];
  if (G.aces != null) filas.push(['Aces por partido', G.aces], ['Dobles faltas por partido', G.df]);
  if (G.salvados != null) filas.push(['Break points salvados', G.salvados + '%']);
  if (G.convertidos != null) filas.push(['Break points convertidos', G.convertidos + '%']);
  if (G.winners != null) filas.push(['Winners por partido', G.winners], ['Errores no forzados por partido', G.errores]);
  if (!filas.length) return '';
  return `<h2>Cómo juega, últimos 12 meses</h2>
    <table class="sv-doc-tabla"><tbody>${filas.map(([t, v]) => `<tr><td>${t}</td><td>${v}</td></tr>`).join('')}</tbody></table>
    <p class="sv-doc-nota">Son números de lo que pasó, no de lo que va a pasar: probamos si los break points servían para pronosticar y no sirven, así que el modelo no los usa. Están porque dicen cómo juega ${esc(A)}.</p>`;
}
export function paginaJugador(D, P, k) {
  const lista = D.porJugador.get(String(k)) || [];
  const nombre = D.nombres.get(String(k)) || 'Jugador'; const A = apellido(nombre);
  const rk = D.ranking[String(k)] || {};
  const jugados = lista.filter((f) => f.g);
  const anioAct = D.hoyAR.slice(0, 4);
  const delAnio = jugados.filter((f) => anio(f.f) === anioAct);
  const gana = (f) => (f.g === 1) === (String(f.a) === String(k));
  const porSup = ['Hard', 'Clay', 'Grass'].map((s) => { const l = delAnio.filter((f) => (f.sup || 'Hard') === s); return { s, n: l.length, g: l.filter(gana).length }; }).filter((x) => x.n);
  const L = llegada(D, k, '9999-12-31', 'Hard');
  const hace = new Date(Date.parse(D.hoyAR + 'T00:00:00Z') - 365 * 86400000).toISOString().slice(0, 10);
  const saqueSup = ['Hard', 'Clay', 'Grass'].map((s) => {
    let S = 0, W = 0, R = 0, V = 0;
    for (const f of jugados) { if (f.f < hace || f.ret || !f.s || (f.sup || 'Hard') !== s || !(f.s[0] > 0) || !(f.s[2] > 0)) continue; const esA = String(f.a) === String(k); S += esA ? f.s[0] : f.s[2]; W += esA ? f.s[1] : f.s[3]; R += esA ? f.s[2] : f.s[0]; V += esA ? f.s[2] - f.s[3] : f.s[0] - f.s[1]; }
    return { s, saque: S >= 150 ? pct(W / S) : null, resto: R >= 150 ? pct(V / R) : null };
  }).filter((x) => x.saque != null);
  const proximos = lista.filter((f) => !f.g && !f.c && f.f >= D.hoyAR);
  const torneosAnio = [...new Map(delAnio.map((f) => [torneoClave(f), f])).values()];
  const ruta = rutaJugador(k, nombre);
  // dos jugadores con el mismo nombre corto ("A. Zverev" y otro "A. Zverev"): el título suma el país o la clave
  const homonimos = [...P.jugadores].filter((x) => x !== String(k) && D.nombres.get(x) === nombre).length;
  const titulo = `${nombre}${homonimos ? ` (${rk.pais || 'id ' + k})` : ''}: resultados ${anioAct}, saque y devolución por superficie | Sacá vos`;
  const resumen = `${delAnio.length ? `ganó ${delAnio.filter(gana).length} de sus ${delAnio.length} partidos de ${anioAct}` : `no tiene partidos terminados en ${anioAct}`}${L.saque != null ? `, y en los últimos 12 meses ganó el ${L.saque}% de los puntos con su saque` : ''}.`;
  const cuerpo = `<article class="sv-doc">
    <div class="sv-doc-jug grande"><span class="sv-mono">${mono(nombre)}</span><div><h1>${esc(nombre)}</h1>
      <p class="sv-doc-sup">${[rk.pais, rk.rk ? rk.rk + ' del ranking ATP' : null].filter(Boolean).map(esc).join(' · ') || 'Circuito ATP'}</p></div></div>
    <p class="sv-doc-bajada">${esc(A)} ${esc(resumen)}</p>
    ${porSup.length ? `<h2>${anioAct}, por superficie</h2><table class="sv-doc-tabla"><thead><tr><th>Superficie</th><th>Ganados</th><th>Jugados</th></tr></thead><tbody>${porSup.map((x) => `<tr><td>${esc(SUP[x.s])}</td><td>${x.g}</td><td>${x.n}</td></tr>`).join('')}</tbody></table>` : ''}
    ${saqueSup.length ? `<h2>El saque y la devolución, últimos 12 meses</h2><table class="sv-doc-tabla"><thead><tr><th>Superficie</th><th>Puntos con el saque</th><th>Puntos con la devolución</th></tr></thead><tbody>${saqueSup.map((x) => `<tr><td>${esc(SUP[x.s])}</td><td>${x.saque}%</td><td>${x.resto == null ? '—' : x.resto + '%'}</td></tr>`).join('')}</tbody></table>
      <p class="sv-doc-nota">Es lo que usa el modelo de Sacá vos para cada partido: los puntos que gana con su saque y con la devolución, en esa superficie, con más peso a lo reciente.</p>` : ''}
    ${bloqueGolpes(golpesDe(jugados, k, hace), A)}
    <h2>Últimos partidos</h2>
    ${jugados.length ? `<ul class="sv-doc-lista">${jugados.slice(-10).reverse().map((f) => lineaResultado(D, P, f, k)).join('')}</ul>` : '<p>Sin partidos terminados.</p>'}
    ${proximos.length ? `<h2>Lo que viene</h2><ul class="sv-doc-lista">${proximos.slice(0, 5).map((f) => { const esA = String(f.a) === String(k); return `<li>${linkPartido(f, 'contra ' + apellido(esA ? f.nb : f.na), P)} · ${esc(f.t)}, ${esc(rondaDe(f.r))} (${fechaCorta(f.f)})</li>`; }).join('')}</ul>` : ''}
    ${torneosAnio.length ? `<h2>Torneos de ${anioAct}</h2><p>${torneosAnio.map((f) => linkTorneo(P, f, f.t)).join(' · ')}</p>` : ''}
    ${boton('/', proximos.length ? `Simulá el próximo partido de ${A}` : 'Abrir el simulador')}
  </article>`;
  return { ruta, tipo: 'jugador', indexar: true, titulo, descripcion: `${nombre}${homonimos ? ` (${rk.pais || 'id ' + k})` : ''} ${resumen} Saque y devolución por superficie y sus últimos partidos.`, cuerpo };
}

// ---------- una página por torneo ----------
export function paginaTorneo(D, P, clave) {
  const lista = P.torneos.get(clave); const f0 = lista[0]; const nombre = `${f0.t} ${anio(f0.f)}`;
  const jugados = lista.filter((f) => f.g), proximos = lista.filter((f) => !f.g && !f.c);
  const final = jugados.find((f) => f.r === 'Final');
  const desde = lista.reduce((m, f) => (f.f < m ? f.f : m), lista[0].f), hasta = lista.reduce((m, f) => (f.f > m ? f.f : m), lista[0].f);
  const porRonda = new Map(); for (const f of jugados) { const r = f.q ? 'Qualy' : f.r; if (!porRonda.has(r)) porRonda.set(r, []); porRonda.get(r).push(f); }
  const rondas = [...porRonda.keys()].sort((a, b) => ordenRonda(a) - ordenRonda(b));
  const campeon = final ? (final.g === 1 ? final.na : final.nb) : null;
  const sorpresas = jugados.filter((f) => { const d = D.dicho.get(String(f.k)); const p = d && puntito(d.p, f.g); return p && p.rotulo === 'sorpresa'; });
  const bajada = `${f0.t} se juega en cancha ${supTexto(f0)}${f0.bo === 5 ? ', al mejor de cinco sets' : ''}. ${campeon ? `Lo ganó ${campeon}.` : `Van ${jugados.length} partidos jugados${proximos.length ? ` y ${proximos.length} por jugar` : ''}.`}${sorpresas.length ? ` Hubo ${sorpresas.length} ${sorpresas.length === 1 ? 'sorpresa' : 'sorpresas'} para el modelo.` : ''}`;
  const fila = (f) => { const d = D.dicho.get(String(f.k)); const p = d ? puntito(d.p, f.g) : null; const ganA = f.g === 1;
    return `<li>${p ? `<span class="sv-dot ${p.clase}" title="${esc(p.rotulo)}"></span> ` : ''}${linkPartido(f, `${apellido(ganA ? f.na : f.nb)} le ganó a ${apellido(ganA ? f.nb : f.na)}`, P)} · ${esc(marcador(f, ganA ? 'a' : 'b'))}${f.ret ? ' (abandono)' : ''}${porqueCorto(f, d)}</li>`; };
  const cuerpo = `<article class="sv-doc">
    <p class="sv-doc-sup"><span class="sv-chip sv-sup-${(f0.sup || 'Hard').toLowerCase()}">${esc(SUP_CORTA[f0.sup] || 'dura')}</span> del ${fechaCorta(desde)} al ${fechaCorta(hasta)}</p>
    <h1>${esc(nombre)}</h1>
    <p class="sv-doc-bajada">${esc(bajada)}</p>
    ${proximos.length ? `<h2>Por jugar</h2><ul class="sv-doc-lista">${proximos.map((f) => `<li>${linkPartido(f, `${apellido(f.na)} vs ${apellido(f.nb)}`, P)} · ${esc(rondaDe(f.r))}, ${fechaCorta(f.f)}${f.h ? ' ' + esc(f.h) : ''}</li>`).join('')}</ul>${boton('/', 'Simulá los partidos que vienen')}` : ''}
    ${rondas.map((r) => `<h2>${esc(rondaDe(r).replace(/^./, (c) => c.toUpperCase()))}</h2><ul class="sv-doc-lista">${porRonda.get(r).map(fila).join('')}</ul>`).join('\n')}
    ${LEYENDA}
    ${proximos.length ? '' : boton('/', 'Abrir el simulador')}
  </article>`;
  return { ruta: P.rutaT.get(clave), tipo: 'torneo', indexar: true, titulo: `${nombre}: resultados${campeon ? ' y campeón' : ''} ronda por ronda | Sacá vos`, descripcion: bajada.slice(0, 300), cuerpo };
}

// ---------- el índice de la consulta ----------
export function paginaIndice(D, P) {
  const jugados = P.partidos.filter((f) => f.g).slice(-20).reverse();
  const proximos = P.partidos.filter((f) => !f.g && !f.c && f.f >= D.hoyAR).slice(0, 20);
  const torneos = [...P.torneos.entries()].map(([c, l]) => ({ c, f: l[0], hasta: l.reduce((m, f) => (f.f > m ? f.f : m), l[0].f) })).sort((a, b) => b.hasta.localeCompare(a.hasta));
  const top = [...P.jugadores].map((k) => ({ k, rk: (D.ranking[k] || {}).rk })).filter((x) => x.rk).sort((a, b) => a.rk - b.rk).slice(0, 50);
  const fila = (f) => { const d = D.dicho.get(String(f.k)); const p = d ? puntito(d.p, f.g) : null; const ganA = f.g === 1;
    return `<li>${p ? `<span class="sv-dot ${p.clase}" title="${esc(p.rotulo)}"></span> ` : ''}${linkPartido(f, `${apellido(ganA ? f.na : f.nb)} le ganó a ${apellido(ganA ? f.nb : f.na)}`, P)} · ${esc(marcador(f, ganA ? 'a' : 'b'))} · ${linkTorneo(P, f, f.t)}, ${esc(rondaDe(f.r))} (${fechaCorta(f.f)})${porqueCorto(f, d)}</li>`; };
  const cuerpo = `<article class="sv-doc">
    <h1>Resultados y partidos del circuito ATP</h1>
    <p class="sv-doc-bajada">Cada partido del circuito tiene su página: el resultado, la aguja (el saque que se esperaba contra el que hubo), lo que daba el modelo con lo que se sabía antes, y cómo llegaba cada uno. Los que vienen muestran quién juega, cuándo y el cara a cara. El número de los que vienen está en el simulador.</p>
    <h2>Últimos resultados</h2>
    <ul class="sv-doc-lista">${jugados.map(fila).join('')}</ul>
    ${LEYENDA}
    ${proximos.length ? `<h2>Lo que viene</h2><ul class="sv-doc-lista">${proximos.map((f) => `<li>${linkPartido(f, `${apellido(f.na)} vs ${apellido(f.nb)}`, P)} · ${linkTorneo(P, f, f.t)}, ${esc(rondaDe(f.r))} (${fechaCorta(f.f)}${f.h ? ' ' + esc(f.h) : ''})</li>`).join('')}</ul>${boton('/', 'Simulá los partidos que vienen')}` : ''}
    <h2>Torneos</h2>
    <p>${torneos.map((t) => linkTorneo(P, t.f, `${t.f.t} ${anio(t.f.f)}`)).join(' · ')}</p>
    ${top.length ? `<h2>Jugadores</h2><p>${top.map((x) => linkJugador(D, P, x.k, D.nombres.get(x.k) || '')).join(' · ')}</p>` : ''}
    <h2>Para entender los números</h2>
    <p><a href="/como-funciona.html">Cómo funciona</a> · <a href="/esta-medido.html">Está medido</a> · <a href="/el-saque.html">El saque</a> · <a href="/superficies.html">Las superficies</a> · <a href="/set-decisivo.html">El set decisivo</a></p>
  </article>`;
  return { ruta: 'consulta/index.html', tipo: 'indice', indexar: true, titulo: 'Resultados y partidos del circuito ATP, con el saque de cada uno | Sacá vos', descripcion: 'Resultados del circuito ATP con la aguja del saque, lo que daba el modelo antes de cada partido y cómo llegaba cada jugador. Los partidos que vienen, con el cara a cara.', cuerpo };
}

// ---------- las páginas de base (leen SOLO de CIFRAS) ----------
export function paginasBase(C) {
  const c70 = C.cajones.find((c) => c.desde === 70) || C.cajones[2];
  const sup = C.superficies;
  const s = (k) => sup[k] || {};
  const orden = ['Grass', 'Hard', 'Clay'].filter((k) => s(k).saque != null).sort((a, b) => s(b).saque - s(a).saque);
  // no se ordena por medio punto: si dos superficies difieren en menos de un punto se dicen juntas
  const frSaque = orden.length >= 2 ? (s(orden[0]).saque - s(orden[orden.length - 1]).saque >= 1
    ? `En ${SUP[orden[0]]}, el que saca gana ${s(orden[0]).saque} de cada 100 puntos. En ${SUP[orden[orden.length - 1]]}, ${s(orden[orden.length - 1]).saque}.`
    : `En las tres superficies el que saca gana unos ${s(orden[0]).saque} de cada 100 puntos.`) : `El que saca gana ${C.saqueCircuito} de cada 100 puntos.`;
  const paginas = [
    { ruta: 'como-funciona.html', titulo: 'Cómo funciona Sacá vos: el saque de cada jugador, jugado punto a punto', descripcion: `Sacá vos calcula cada partido ATP con los puntos que gana cada jugador con su saque y con la devolución. Medido en ${C.partidos.toLocaleString('es-AR')} partidos.`,
      cuerpo: `<article class="sv-doc"><h1>Movés el saque. Cambia el partido.</h1>
      <p class="sv-doc-bajada">Sacá vos es un simulador de tenis. Para cada partido del circuito ATP calcula quién tiene más chances de ganar, y te deja mover el saque de cada jugador para ver cuánto cambia.</p>
      <h2>De dónde sale el número</h2>
      <p>De dos cosas que se pueden contar. La primera: cuántos puntos gana cada jugador con su saque y cuántos con la devolución, en esa superficie, en los últimos dos años y con más peso a lo reciente. La segunda: sus resultados, con un puntaje que sube cuando le gana a alguien fuerte y baja cuando pierde con alguien de abajo. Con eso, el modelo juega el partido punto por punto, game por game y set por set.</p>
      <h2>La perilla</h2>
      <p>Cada jugador tiene una perilla con su porcentaje de puntos ganados con el saque. Si creés que hoy saca mejor, la subís y ves el número nuevo. Tres puntos de saque, en un partido parejo al mejor de tres sets, son ${C.cambiaBo3} puntos de partido.</p>
      <h2>La simulación</h2>
      <p>El botón Simular juega el partido entero, punto a punto, con quiebres y tie-breaks. Cada simulación da un partido distinto; el número de abajo no cambia, porque sale de jugarlo miles de veces.</p>
      <h2>Está medido</h2>
      <p>No es una opinión: el modelo pronosticó ${C.partidos.toLocaleString('es-AR')} partidos antes de que se jugaran, desde 2025, y cuando dijo ${c70.dijo}%, ganó el favorito el ${c70.paso}% de las veces.</p>
      ${boton('/', 'Probalo con los partidos de esta semana')}</article>` },
    { ruta: 'esta-medido.html', titulo: `Está medido: cuando Sacá vos dice ${c70.dijo}%, pasa el ${c70.paso}%`, descripcion: `${C.partidos.toLocaleString('es-AR')} partidos ATP pronosticados antes de jugarse: lo que dijo el modelo y lo que pasó, por tramos.`,
      cuerpo: `<article class="sv-doc"><h1>Dice ${c70.dijo}%. Pasa ${c70.paso}%.</h1>
      <p class="sv-doc-bajada">Un número de probabilidad sirve si cumple lo que dice. Medimos el de Sacá vos en ${C.partidos.toLocaleString('es-AR')} partidos del circuito ATP desde 2025, cada uno pronosticado con lo que se sabía antes de jugarse.</p>
      <table class="sv-doc-tabla"><thead><tr><th>Le daba al favorito</th><th>Partidos</th><th>Dijo</th><th>Ganó el favorito</th></tr></thead><tbody>
      ${C.cajones.map((c) => `<tr><td>${c.desde} a ${c.hasta}%</td><td>${c.n.toLocaleString('es-AR')}</td><td>${c.dijo}%</td><td>${c.paso}%</td></tr>`).join('')}</tbody></table>
      <h2>Cómo se lee</h2>
      <p>En los partidos donde el modelo le daba al favorito entre ${c70.desde} y ${c70.hasta}%, en promedio dijo ${c70.dijo}%, y el favorito ganó el ${c70.paso}%. Si el número dijera más de lo que pasa, estaría inflado; si dijera menos, se estaría quedando corto.</p>
      <h2>Por qué importa</h2>
      <p>En total, el que el modelo ponía arriba ganó ${C.acierta} de cada 100 partidos. Un 60% no es una promesa: significa que de cada diez partidos así, unos cuatro los gana el otro. Por eso en Sacá vos los partidos terminados se muestran todos, con un puntito verde, gris o naranja, también los que no salieron.</p>
      <p>Y el número se prueba solo: la tabla se vuelve a calcular con cada partido nuevo.</p>
      ${boton('/', 'Mirá el número de los partidos de hoy')}</article>` },
    { ruta: 'el-saque.html', titulo: `El saque en el tenis: 3 puntos de saque cambian ${C.cambiaBo3} de partido`, descripcion: `En el circuito ATP el que saca gana ${C.saqueCircuito} de cada 100 puntos. Cuánto mueve el partido sacar un poco mejor, en tres y en cinco sets.`,
      cuerpo: `<article class="sv-doc"><h1>3 puntos de saque cambian ${C.cambiaBo3} de partido.</h1>
      <p class="sv-doc-bajada">En el circuito ATP, el que saca gana ${C.saqueCircuito} de cada 100 puntos. Parece poco margen, pero en el tenis se amplifica: un punto se vuelve un game, el game un set y el set el partido.</p>
      <h2>La cuenta</h2>
      <p>Dos jugadores que sacan igual tienen 50% cada uno. Si uno gana 3 puntos más de cada 100 con su saque, pasa a tener ${50 + C.cambiaBo3}% al mejor de tres sets. Al mejor de cinco, como en los Grand Slams, ${50 + C.cambiaBo5}%: cuanto más largo el partido, menos lugar para la sorpresa.</p>
      <h2>Por qué el saque</h2>
      <p>Porque es la parte del juego que el jugador controla y la que más se repite: cada game arranca con un saque. Por eso el modelo de Sacá vos mira los puntos que gana cada uno con su saque y con la devolución, en cada superficie.</p>
      <h2>Probalo vos</h2>
      <p>En cada partido de la semana hay una perilla por jugador. Subís el saque de uno y ves cuánto cambia el partido. Si pensás que hoy saca mejor de lo que dicen sus números, ahí está la cuenta.</p>
      ${boton('/', 'Mové el saque de un partido de hoy')}</article>` },
    { ruta: 'superficies.html', titulo: 'Polvo, dura y césped: el saque y los tie-breaks en cada superficie del circuito ATP', descripcion: `${frSaque} Cuántos sets terminan en tie-break y cuántos partidos llegan al set decisivo en cada superficie.`,
      cuerpo: `<article class="sv-doc"><h1>Polvo, dura y césped no se juegan igual.</h1>
      <p class="sv-doc-bajada">${esc(frSaque)} Esa diferencia cambia todo lo demás: los quiebres, los tie-breaks y cuántos partidos se estiran.</p>
      <table class="sv-doc-tabla"><thead><tr><th>Superficie</th><th>Puntos para el que saca</th><th>Sets en tie-break</th><th>Llegan al 3.er set</th><th>Partidos</th></tr></thead><tbody>
      ${['Clay', 'Hard', 'Grass'].filter((k) => s(k).partidos).map((k) => `<tr><td>${esc(SUP[k])}</td><td>${s(k).saque ?? '—'}%</td><td>${s(k).tiebreak ?? '—'}%</td><td>${s(k).decisivo ?? '—'}%</td><td>${s(k).partidos.toLocaleString('es-AR')}</td></tr>`).join('')}</tbody></table>
      <p class="sv-doc-nota">Partidos del circuito ATP desde 2025, sin abandonos. "Llegan al 3.er set": partidos al mejor de tres.</p>
      <h2>Por qué cambia tanto</h2>
      <p>En polvo de ladrillo la pelota pica más alto y más lenta: el que devuelve tiene tiempo, los puntos se alargan y el saque pesa menos. En césped pica bajo y rápido, y un buen saque alcanza para ganar muchos puntos sin peloteo. La dura queda en el medio, y es donde se juega la mayor parte del año.</p>
      <h2>Qué hace el modelo con esto</h2>
      <p>Mira el saque y la devolución de cada jugador en la superficie del partido, con más peso a lo reciente. Hay jugadores que en polvo son otros: el mismo cruce en dura y en polvo puede dar números muy distintos, y en el simulador lo vas a ver en la perilla de cada uno.</p>
      ${boton('/', 'Mirá los partidos de esta semana')}</article>` },
    { ruta: 'set-decisivo.html', titulo: `El set decisivo: el modelo dice ${C.decisivoDicho}%, pasa el ${C.decisivoReal}%`, descripcion: `Cuántos partidos ATP llegan al set decisivo, lo que dice el modelo de Sacá vos y lo que pasa. Medido en ${C.partidos.toLocaleString('es-AR')} partidos.`,
      cuerpo: `<article class="sv-doc"><h1>Dice ${C.decisivoDicho}%. Pasa ${C.decisivoReal}%.</h1>
      <p class="sv-doc-bajada">Además de quién gana, el modelo de Sacá vos calcula si el partido va a llegar al set decisivo. En ${C.partidos.toLocaleString('es-AR')} partidos del circuito desde 2025 dijo que llegaban el ${C.decisivoDicho}% de las veces, y llegaron el ${C.decisivoReal}%.</p>
      <h2>Qué lo empuja</h2>
      <p>Dos cosas: que los jugadores estén parejos y la superficie. Cuanto más se parecen los dos sacando y devolviendo, más fácil que se repartan los sets. Y donde el saque domina, cada set se define por uno o dos quiebres, o por un tie-break.</p>
      <table class="sv-doc-tabla"><thead><tr><th>Superficie</th><th>Llegan al 3.er set</th></tr></thead><tbody>
      ${['Clay', 'Hard', 'Grass'].filter((k) => s(k).decisivo != null).map((k) => `<tr><td>${esc(SUP[k])}</td><td>${s(k).decisivo}%</td></tr>`).join('')}</tbody></table>
      <h2>Por qué sirve medirlo</h2>
      <p>Es una segunda prueba del modelo, independiente de quién gana: si el número de set decisivo estuviera inflado, el modelo estaría viendo los partidos más parejos de lo que son. Que lo dicho y lo que pasa coincidan dice que también entiende cuánto se parecen los dos jugadores.</p>
      <h2>En la app</h2>
      <p>Cada partido de la semana muestra la chance de sets corridos y de set decisivo. Si movés el saque de uno, se mueven las dos, y la simulación te muestra un partido posible, set por set.</p>
      ${boton('/', 'Simulá un partido de hoy')}</article>` },
  ];
  return paginas.map((p) => ({ ...p, tipo: 'base', indexar: true, titulo: p.titulo + ' | Sacá vos' }));
}

// ---------- todo junto ----------
export function construirConsulta({ filas, dichos, ranking, anticipados, hoy, m, desdeMedir }) {
  const D = prepararDatos({ filas, dichos, ranking, anticipados, hoy });
  const P = planear(D);
  const C = cifrasDe(m, filas, desdeMedir);
  const salen = [
    ...paginasBase(C),
    paginaIndice(D, P),
    ...P.partidos.map((f) => paginaPartido(D, P, f)),
    ...[...P.jugadores].map((k) => paginaJugador(D, P, k)),
    ...[...P.torneos.keys()].map((c) => paginaTorneo(D, P, c)),
  ];
  const archivos = salen.map((p) => ({ ruta: p.ruta, tipo: p.tipo, titulo: p.titulo, descripcion: p.descripcion, indexar: p.indexar, html: pagina(p) }));
  const urls = ['', ...archivos.filter((a) => a.indexar).map((a) => a.ruta.replace(/index\.html$/, ''))];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITIO}/${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nDisallow: /gracias.html\n\nSitemap: ${SITIO}/sitemap.xml\n`;
  return { archivos, sitemap, robots, cifras: C, portada: portadaEstatica(D, P, C), gancho: portadaGancho(C) };
}

// ---------- el bloque estático de la portada (entre las marcas de docs/index.html) ----------
// Sin JavaScript la portada tenía 51 palabras. Esto va SIEMPRE (con o sin script): qué es, los últimos resultados con
// su página, y las páginas para leer. Nada de números de partidos por jugar.
export function portadaEstatica(D, P, C) {
  const ult = P.partidos.filter((f) => f.g).slice(-8).reverse();
  return `<section class="sv-doc-portada" id="sv-para-leer">
      <h2 class="sv-titulo">Qué es Sacá vos</h2>
      <p>Un simulador de tenis para los partidos del circuito ATP. Cada partido de la semana tiene su número: quién tiene más chances, calculado con los puntos que gana cada jugador con su saque y con la devolución, en esa superficie. Movés el saque de cada uno con una perilla y ves cuánto cambia, y lo jugás punto a punto. Medido en ${C.partidos.toLocaleString('es-AR')} partidos desde 2025.</p>
      ${ult.length ? `<h2 class="sv-titulo">Últimos resultados</h2><ul class="sv-doc-lista">${ult.map((f) => { const ganA = f.g === 1; return `<li>${linkPartido(f, `${apellido(ganA ? f.na : f.nb)} le ganó a ${apellido(ganA ? f.nb : f.na)}`, P)} · ${esc(marcador(f, ganA ? 'a' : 'b'))} · ${esc(f.t)}, ${esc(rondaDe(f.r))}</li>`; }).join('')}</ul><p><a href="/consulta/">Todos los resultados y los partidos que vienen</a></p>` : ''}
      <h2 class="sv-titulo">Para leer</h2>
      <p><a href="/como-funciona.html">Cómo funciona</a> · <a href="/esta-medido.html">Está medido</a> · <a href="/el-saque.html">El saque</a> · <a href="/superficies.html">Las superficies</a> · <a href="/set-decisivo.html">El set decisivo</a></p>
    </section>`;
}
// ---------- el gancho de la portada (arriba de todo, entre <!-- gancho:inicio --> y <!-- gancho:fin -->) ----------
// Para el que llega por un link: qué es en una frase, la cuenta del saque como demostración (50% → 50+N%, números de
// CIFRAS: dos que sacan igual contra uno que saca 3 puntos más), y lo que ofrece a mano. Sin números de partidos por jugar.
export function portadaGancho(C) {
  // Primer impacto, corto (Fausto, 1/10: "Simulador de resultados. Algo bien conciso"). Una línea de qué es, una de
  // prueba. Nada de explicar: lo demás se ve abajo, y las páginas de base explican.
  return `<section class="sv-gancho" id="sv-gancho">
      <h1>Simulador de resultados</h1>
      <p class="sv-gancho-sub">Tenis ATP. Cada partido con su número, antes de jugarse.</p>
      <a class="sv-gancho-medido" href="/esta-medido.html">Medido en <b>${C.partidos.toLocaleString('es-AR')} partidos</b></a>
    </section>`;
}
export const GANCHO_INICIO = '<!-- gancho:inicio -->', GANCHO_FIN = '<!-- gancho:fin -->';
export const MARCA_INICIO = '<!-- consulta:inicio -->', MARCA_FIN = '<!-- consulta:fin -->';
export function ponerEnPortada(index, bloque, inicio = MARCA_INICIO, fin = MARCA_FIN) {
  const i = index.indexOf(inicio), j = index.indexOf(fin);
  if (i < 0 || j < i) return index;   // sin las marcas no se toca nada
  return index.slice(0, i + inicio.length) + '\n    ' + bloque + '\n    ' + index.slice(j);
}
// El texto visible de una página, para las pruebas y para contar palabras (lo que ve un buscador sin JavaScript).
export function textoVisible(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
export const palabras = (html) => textoVisible(html).split(' ').filter(Boolean).length;
