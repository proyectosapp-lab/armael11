// diario-tenis.mjs — baja partidos de api-tennis.com, recalcula a cada jugador con el modelo cerrado y escribe:
//   docs/datos/tenis-hoy.js   → window.SV_HOY: los partidos de los próximos 7 días con su pronóstico
//   medidas/tenis-medicion.md → lo que el modelo dijo antes de cada partido y lo que pasó (la tabla de "Está medido")
// Uso:  node diario-tenis.mjs            → baja el mes anterior, el actual y el siguiente (lo diario, 3 pedidos + 2)
//       node diario-tenis.mjs todo       → baja desde enero de 2021 (la primera vez, ~70 pedidos)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { compactar, numerosDe, bpCierra } from './tenis-compactar.mjs';
import { recorrer, pronostico, medir, marcarQualy, medirEnVivo } from './tenis-fuerzas.mjs';
import { construirConsulta, ponerEnPortada, GANCHO_INICIO, GANCHO_FIN, fichasParaLaApp } from './consulta-tenis.mjs';
import { dirname } from 'node:path';

const CLAVE = process.env.API_TENNIS_KEY;
const BASE = 'https://api.api-tennis.com/tennis/';
const ZONA = 'America/Argentina/Buenos_Aires';
const DESDE_TODO = '2021-01';
const MEDIR_DESDE = '2025-01-01';     // antes, la ventana de 104 semanas de estadísticas está casi vacía (el proveedor carga saque desde marzo de 2024)
let pedidos = 0;

async function pedir(metodo, params = {}) {
  const u = new URL(BASE); u.searchParams.set('method', metodo); u.searchParams.set('APIkey', CLAVE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let i = 1; i <= 3; i++) {
    pedidos++;
    const r = await fetch(u);
    if (r.status === 429 || r.status >= 500) { await new Promise(f => setTimeout(f, 3000 * i)); continue; }
    const j = await r.json();
    if (j && j.success === 1) return j.result || [];
    throw new Error(`${metodo}: ${JSON.stringify(j).slice(0, 200)}`);
  }
  throw new Error(`${metodo}: tres intentos fallidos`);
}
const pausa = () => new Promise(f => setTimeout(f, 400));
const mesDe = (d) => d.toISOString().slice(0, 7);
function meses(desde, hasta) { const out = []; let [y, m] = desde.split('-').map(Number); const [Y, M] = hasta.split('-').map(Number); while (y < Y || (y === Y && m <= M)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } } return out; }
function ultimo(mes) { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

async function main() {
  if (!CLAVE) { console.error('Falta el secreto API_TENNIS_KEY'); process.exit(1); }
  mkdirSync('datos-tenis', { recursive: true }); mkdirSync('docs/datos', { recursive: true }); mkdirSync('medidas', { recursive: true });
  const hoy = new Date();
  const ant = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1)), sig = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));
  // Si falta la historia (menos de 24 meses guardados), baja todo sin que nadie tenga que acordarse.
  const guardados = existsSync('datos-tenis') ? readdirSync('datos-tenis').filter(n => /^\d{4}-\d{2}\.json$/.test(n)).length : 0;
  // Si los archivos son de una versión anterior (la 3 agrega aces, dobles faltas, break points y winners), se rebaja todo una vez.
  const version = existsSync('datos-tenis/version.txt') ? readFileSync('datos-tenis/version.txt', 'utf8').trim() : '1';
  const VERSION_DATOS = '3';
  const todo = process.argv[2] === 'todo' || guardados < 24 || version !== VERSION_DATOS;
  const lista = todo ? meses(DESDE_TODO, mesDe(sig)) : meses(mesDe(ant), mesDe(sig));

  // tipo "Atp Singles" y superficies por torneo
  const tipos = await pedir('get_events'); await pausa();
  const atp = tipos.find(t => /^atp\s*singles$/i.test(t.event_type_type || ''));
  if (!atp) throw new Error('No aparece "Atp Singles" en el plan');
  const torneos = await pedir('get_tournaments'); await pausa();
  const superficies = {};
  for (const t of torneos) if (String(t.event_type_key) === String(atp.event_type_key)) superficies[String(t.tournament_key)] = t.tournament_sourface ?? t.tournament_surface;

  const informe = [];
  // el ranking de hoy (solo para mostrarlo: el modelo no lo usa, usa Elo). Si falla, la pantalla sale sin ranking.
  let ranking = {};
  try { for (const r of await pedir('get_standings', { event_type: 'ATP' })) ranking[String(r.player_key)] = { rk: Number(r.place), pais: paisCorto(r.country) }; }
  catch (e) { informe.push(`- ranking: ERROR ${e.message} (la pantalla sale sin ranking)`); }
  await pausa();

  // El control del mapeo de break points: los que uno convirtió tienen que ser los que el otro
  // enfrentó y no salvó. Si esto no cierra, el mapeo no es el que creemos y hay que mirarlo.
  const ctrlBp = { cierra: 0, falla: 0, sinDatos: 0, muestra: null };
  // primero se consigue lo nuevo; un mes que vuelve vacío o mucho más chico no pisa al anterior
  for (const mes of lista) {
    const archivo = `datos-tenis/${mes}.json`;
    let crudos;
    try { crudos = await pedir('get_fixtures', { date_start: `${mes}-01`, date_stop: `${mes}-${ultimo(mes)}`, event_type_key: atp.event_type_key, timezone: ZONA }); }
    catch (e) { informe.push(`- ${mes}: ERROR ${e.message} (queda el archivo anterior)`); await pausa(); continue; }
    const filas = crudos.map(p => compactar(p, superficies)).filter(Boolean);
    for (const p of crudos) {
      if (!(p.statistics || []).length) continue;
      const c = bpCierra(numerosDe(p.statistics, p.first_player_key), numerosDe(p.statistics, p.second_player_key));
      if (c === null) ctrlBp.sinDatos++; else if (c) ctrlBp.cierra++; else ctrlBp.falla++;
      if (!ctrlBp.muestra) ctrlBp.muestra = (p.statistics || []).filter(s => /^(aces|double faults|break points)/i.test(s.stat_name || ''))
        .slice(0, 4).map(s => `${s.stat_name} ${s.stat_won}/${s.stat_total}`).join(' · ') || null;
    }
    const antes = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')).length : 0;
    if (antes > 50 && filas.length < antes * 0.8) { informe.push(`- ${mes}: vino con ${filas.length} partidos y había ${antes}: NO se pisa`); await pausa(); continue; }
    writeFileSync(archivo, JSON.stringify(filas));
    informe.push(`- ${mes}: ${filas.length} partidos · con saque ${filas.filter(f => f.s).length} · terminados ${filas.filter(f => f.g).length}` +
                 ` · aces ${filas.filter(f => f.ac).length} · break points ${filas.filter(f => f.bp).length} · winners ${filas.filter(f => f.we).length}`);
    await pausa();
  }

  {
    const t = ctrlBp.cierra + ctrlBp.falla;
    informe.push(`- break points, control del mapeo: cierran ${ctrlBp.cierra} de ${t}` +
      (t ? ` (${(100 * ctrlBp.cierra / t).toFixed(1)}%)` : '') + ` · sin los cuatro datos ${ctrlBp.sinDatos}` +
      (ctrlBp.falla > t * 0.05 ? ' · **OJO: el mapeo no cierra, mirar antes de confiar en estos números**' : '') +
      (ctrlBp.muestra ? `\n- muestra de un partido: ${ctrlBp.muestra}` : ''));
  }

  if (todo && !informe.some(l => /ERROR|NO se pisa/.test(l))) writeFileSync('datos-tenis/version.txt', VERSION_DATOS + '\n');

  // todo lo guardado, recorrido en orden
  const todas = readdirSync('datos-tenis').filter(n => /^\d{4}-\d{2}\.json$/.test(n)).sort().flatMap(n => JSON.parse(readFileSync(`datos-tenis/${n}`, 'utf8')));
  const unicas = [...new Map(todas.map(f => [f.k, f])).values()];
  const { E, dichos } = recorrer(unicas);

  // próximos 7 días (hora argentina)
  const hoyAR = new Date(hoy.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const hasta = new Date(hoy.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  // próximos: sin resultado, no cancelados. Un partido cuya hora pasó hace más de 3 horas sale de la lista, salvo que el
  // proveedor diga que está en juego (entonces queda, marcado, hasta 8 horas).
  const ahoraAR = hoy.getTime() - 3 * 3600000;
  const empezoHace = (f) => ahoraAR - Date.parse(`${f.f}T${f.h || '00:00'}:00Z`);
  const marcadas = marcarQualy(unicas);
  const proximos = marcadas.filter(f => !f.g && !f.c && f.f >= hoyAR && f.f <= hasta && empezoHace(f) < (f.vivo ? 8 : 3) * 3600000).sort((x, y) => (x.f + x.h).localeCompare(y.f + y.h));
  // jugados: los últimos 2 días, con lo que el modelo dijo antes (si lo dijo)
  const dicho = new Map(dichos.filter(d => d.evaluable).map(d => [d.k, d]));
  const desdeJugados = new Date(hoy.getTime() - 2 * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
  const jugados = marcadas.filter(f => f.g && f.f >= desdeJugados && f.f <= hoyAR).sort((x, y) => (y.f + y.h).localeCompare(x.f + x.h)).map(f => ({
    k: f.k, qualy: !!f.q, fecha: f.f, hora: f.h, torneo: f.t, ronda: f.r, sup: f.sup, indoor: !!f.in,
    a: { k: f.a, nombre: f.na, ...(ranking[String(f.a)] || {}) }, b: { k: f.b, nombre: f.nb, ...(ranking[String(f.b)] || {}) },
    gano: f.g, ret: !!f.ret, sets: (f.sets || []).filter(x => (x[0] || 0) + (x[1] || 0) > 0), tb: f.tb || null,
    p: dicho.has(f.k) ? r4(dicho.get(f.k).p) : null,
    // el saque: lo que el modelo esperaba de cada uno contra ESTE rival (pa, pb) y lo que pasó (puntos ganados / jugados)
    saque: dicho.has(f.k) && f.s && f.s[0] > 0 && f.s[2] > 0
      ? { espA: r4(dicho.get(f.k).pa), espB: r4(dicho.get(f.k).pb), realA: r4(f.s[1] / f.s[0]), realB: r4(f.s[3] / f.s[2]), ptsA: f.s[0], ptsB: f.s[2] }
      : null,
  }));
  const partidos = proximos.map(f => {
    const p = pronostico(E, f);
    const base = { k: f.k, qualy: !!f.q, fecha: f.f, hora: f.h, torneo: f.t, ronda: f.r, sup: f.sup, indoor: !!f.in, mejorDe: f.bo, ...(f.vivo ? { enJuego: true } : {}), a: { k: f.a, nombre: f.na, ...(ranking[String(f.a)] || {}) }, b: { k: f.b, nombre: f.nb, ...(ranking[String(f.b)] || {}) } };
    if (!p.evaluable) return { ...base, sinDatos: true, nA: p.nA, nB: p.nB };
    return { ...base, pa: r4(p.pa), pb: r4(p.pb), saqueA: r4(p.saqueA), saqueB: r4(p.saqueB), pSaque: r4(p.pSaque), pElo: r4(p.pElo), p: r4(p.p), decisivo: r4(p.decisivo) };
  });
  // las fichas (gratis): quiénes juegan esta semana y cómo llegan, y el cara a cara de cada partido. Si falla, la app sale sin fichas.
  let fichas = { jugadores: {}, cruces: {} };
  try { fichas = fichasParaLaApp({ filas: marcadas, ranking, hoy, partidos: [...proximos, ...marcadas.filter(f => f.g && f.f >= desdeJugados && f.f <= hoyAR)].map(f => ({ k: f.k, a: f.a, b: f.b, f: f.f })) }); }
  catch (e) { informe.push(`- fichas: ERROR ${e.message} (la app sale sin fichas)`); }
  const salida = { generado: new Date().toISOString(), modelo: 'claude/tenis-backtest.md + comparación 12 (Elo)', partidos, jugados, jugadores: fichas.jugadores, cruces: fichas.cruces };
  writeFileSync('docs/datos/tenis-hoy.js', 'window.SV_HOY = ' + JSON.stringify(salida) + ';\n');

  // la medición: sale del recorrido, no se elige nada
  const m = medir(dichos, MEDIR_DESDE);
  // lo que la pantalla "Está medido" muestra (solo el pronóstico previo; el modo en vivo se publica aparte cuando se apruebe)
  if (m.n >= 1000) writeFileSync('docs/datos/tenis-medido.js', 'window.SV_MEDIDO = ' + JSON.stringify({
    generado: salida.generado, desde: MEDIR_DESDE, n: m.n, acierta: r4(m.acierta), t: Math.round(m.t * 10) / 10,
    decisivoDicho: r4(m.decisivoDicho), decisivoReal: r4(m.decisivoReal),
    cajones: m.cajones.map(c => ({ desde: c.desde, hasta: Math.min(1, c.hasta), n: c.n, dijo: r4(c.dijo), paso: r4(c.paso) })),
  }) + ';\n');
  // lo que mostró la app ANTES de cada partido: se anota la primera vez que aparece y no se pisa nunca
  const ANT = 'datos-tenis/anticipados.json';
  let anticipados = {}; try { anticipados = existsSync(ANT) ? JSON.parse(readFileSync(ANT, 'utf8')) : {}; } catch (e) { anticipados = {}; }
  let nuevosAnt = 0;
  for (const p of partidos) if (p.p != null && !anticipados[p.k]) { anticipados[p.k] = { p: p.p, gen: salida.generado }; nuevosAnt++; }
  writeFileSync(ANT, JSON.stringify(anticipados));
  informe.push(`- anticipados: ${Object.keys(anticipados).length} (${nuevosAnt} nuevos)`);

  // el sitio de consulta: páginas de base, una por partido, jugador y torneo, sitemap y la portada estática
  if (m.n >= 1000) {
    try {
      const Rc = construirConsulta({ filas: marcadas, dichos, ranking, anticipados, hoy, m, desdeMedir: MEDIR_DESDE });
      for (const a of Rc.archivos) { mkdirSync(dirname('docs/' + a.ruta), { recursive: true }); writeFileSync('docs/' + a.ruta, a.html); }
      writeFileSync('docs/sitemap.xml', Rc.sitemap); writeFileSync('docs/robots.txt', Rc.robots);
      if (existsSync('docs/index.html')) writeFileSync('docs/index.html', ponerEnPortada(ponerEnPortada(readFileSync('docs/index.html', 'utf8'), Rc.portada), Rc.gancho, GANCHO_INICIO, GANCHO_FIN));
      const cuenta = (t) => Rc.archivos.filter((a) => a.tipo === t).length;
      informe.push(`- consulta: ${Rc.archivos.length} páginas (base ${cuenta('base')}, jugados ${cuenta('jugado')}, próximos ${cuenta('proximo')}, jugadores ${cuenta('jugador')}, torneos ${cuenta('torneo')})`);
    } catch (e) { informe.push(`- consulta: ERROR ${e.message} (el resto se publicó igual)`); }
  }

  const md = [
    `# Sacá vos — lo que dijo el modelo y lo que pasó`, ``,
    `Generado ${salida.generado.slice(0, 16).replace('T', ' ')} UTC. Partidos desde ${MEDIR_DESDE} donde los dos tenían al menos 10 partidos con estadísticas; sin abandonos.`, ``,
    ...(m.n < 1000 ? [`> **Todavía no sirve**: ${m.n} partidos. Hace falta la historia completa (se baja sola si faltan meses).`, ``] : []),
    `- partidos: **${m.n}**`,
    `- acierta el favorito del modelo: ${pc(m.acierta)}`,
    `- Brier modelo ${m.brierModelo.toFixed(4)} · vara (% de victorias) ${m.brierVara.toFixed(4)} · ventaja ${m.ventaja.toFixed(4)} · t ${m.t.toFixed(1)}`,
    `- set decisivo: dijo ${pc(m.decisivoDicho)} · pasó ${pc(m.decisivoReal)}`, ``,
    `| le dio al favorito | partidos | dijo | ganó |`, `|---|---|---|---|`,
    ...m.cajones.map(c => `| ${Math.round(c.desde * 100)} a ${Math.min(100, Math.round(c.hasta * 100))}% | ${c.n} | ${pc(c.dijo)} | ${pc(c.paso)} |`), ``,
    `## Después del primer set (H14, H15)`, ``,
    ...(() => { const v = medirEnVivo(dichos, MEDIR_DESDE); if (!v.n) return ['Sin partidos.', ``]; return [
      `- partidos: **${v.n}**`,
      `- H14 · Brier "ahora" ${v.brierSin.toFixed(4)} · vara (frecuencia del ganador del 1er set) ${v.brierVara.toFixed(4)} · ventaja ${v.h14.m.toFixed(4)} · t ${v.h14.t.toFixed(1)}`, ``,
      `| le dio al que va arriba o abajo | partidos | dijo | ganó |`, `|---|---|---|---|`,
      ...v.cajones.map(c => `| ${Math.round(c.desde * 100)} a ${Math.min(100, Math.round(c.hasta * 100))}% | ${c.n} | ${pc(c.dijo)} | ${pc(c.paso)} |`), ``,
      ...(v.h15 ? [
        `- H15 · con el saque del 1er set: ${v.nCon} partidos · Brier ${v.h15.brierCon.toFixed(4)} contra ${v.h15.brierSin.toFixed(4)} · ventaja ${v.h15.m.toFixed(4)} · t ${v.h15.t.toFixed(1)}`,
        `- H15 contra la vara: Brier ${v.h15.brierCon.toFixed(4)} contra ${v.h15.brierVara.toFixed(4)} · ventaja ${v.h15.contraVara.m.toFixed(4)} · t ${v.h15.contraVara.t.toFixed(1)} · acierta ${pc(v.h15.acierta)}`, ``,
        `| H15 le dio al que cree que gana | partidos | dijo | ganó |`, `|---|---|---|---|`,
        ...v.h15.cajones.map(c => `| ${Math.round(c.desde * 100)} a ${Math.min(100, Math.round(c.hasta * 100))}% | ${c.n} | ${pc(c.dijo)} | ${pc(c.paso)} |`), ``,
      ] : [`- H15 · sin medir: la API no trajo estadísticas del primer set (${v.nCon} partidos con datos).`, ``]),
    ]; })(),
    `## Bajada de hoy`, ``, ...informe, ``, `Pedidos: ${pedidos}. Partidos guardados: ${unicas.length}. Próximos 7 días: ${partidos.length} (${partidos.filter(p => p.sinDatos).length} sin datos suficientes). Jugados en 2 días: ${jugados.length}.`,
  ].join('\n');
  writeFileSync('medidas/tenis-medicion.md', md + '\n');
  console.log(md);
}
const r4 = (x) => Math.round(x * 10000) / 10000;
// país como lo dice el proveedor (nombre en inglés) → tres letras como en el circuito
const PAISES = { Argentina: 'ARG', Spain: 'ESP', Italy: 'ITA', Germany: 'GER', France: 'FRA', 'United States': 'USA', USA: 'USA', 'United Kingdom': 'GBR', 'Great Britain': 'GBR', Serbia: 'SRB', Russia: 'RUS', Greece: 'GRE', Norway: 'NOR', Denmark: 'DEN', Australia: 'AUS', Canada: 'CAN', Chile: 'CHI', Brazil: 'BRA', Poland: 'POL', 'Czech Republic': 'CZE', Czechia: 'CZE', Bulgaria: 'BUL', Netherlands: 'NED', Belgium: 'BEL', Switzerland: 'SUI', Austria: 'AUT', Croatia: 'CRO', Hungary: 'HUN', Kazakhstan: 'KAZ', Japan: 'JPN', China: 'CHN', 'Chinese Taipei': 'TPE', 'South Korea': 'KOR', India: 'IND', Portugal: 'POR', Sweden: 'SWE', Finland: 'FIN', Colombia: 'COL', Peru: 'PER', Bolivia: 'BOL', Uruguay: 'URU', Ecuador: 'ECU', Mexico: 'MEX', Slovakia: 'SVK', Slovenia: 'SLO', Ukraine: 'UKR', Belarus: 'BLR', Georgia: 'GEO', Moldova: 'MDA', Romania: 'ROU', 'Bosnia and Herzegovina': 'BIH', Tunisia: 'TUN', 'South Africa': 'RSA', Israel: 'ISR', Turkey: 'TUR', Lebanon: 'LBN', Egypt: 'EGY', Monaco: 'MON', Latvia: 'LAT', Lithuania: 'LTU', Estonia: 'EST', 'New Zealand': 'NZL', Thailand: 'THA', 'Hong Kong': 'HKG', Cyprus: 'CYP', Luxembourg: 'LUX', Ireland: 'IRL', 'Dominican Republic': 'DOM', Venezuela: 'VEN', Paraguay: 'PAR' };
const paisCorto = (n) => PAISES[String(n || '').trim()] || String(n || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || undefined;
const pc = (x) => (100 * x).toFixed(1) + '%';
main().catch(e => { console.error(e); process.exit(1); });
