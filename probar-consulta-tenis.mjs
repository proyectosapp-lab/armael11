// probar-consulta-tenis.mjs — las reglas del sitio de consulta, sin red.  node probar-consulta-tenis.mjs
// Si una falla, el Action no publica (va antes de "Bajar, recalcular y pronosticar").
// Datos de prueba: partidos sintéticos (nombres, rondas y marcadores inventados sobre una estructura de circuito).
// Nunca salen de acá: no se publican.
import { recorrer, medir, marcarQualy } from './tenis-fuerzas.mjs';
import * as K from './consulta-tenis.mjs';

let ok = 0, mal = 0;
const es = (t, c, extra) => { if (c) ok++; else { mal++; console.log('MAL:', t, extra ?? ''); } };

// ---------- un circuito de mentira, determinístico ----------
let semilla = 7; const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const APELLIDOS = ['Molina', 'Ferrer', 'Rossi', 'Novak', 'Hansen', 'Duarte', 'Keller', 'Sato', 'Ibarra', 'Petrov', 'Laurent', 'Costa', 'Varga', 'Lindqvist', 'Moreau', 'Silva', 'Bauer', 'Orlov', 'Quiroga', 'Tanaka', 'Weber', 'Kowalski', 'Romero', 'Berg', 'Fontaine', 'Marek', 'Aguirre', 'Holm', 'Rinaldi', 'Szabo'];
const N_JUG = 90, jug = Array.from({ length: N_JUG }, (_, i) => ({ k: String(1000 + i), n: `${'ABCDEFGHJKLMNPRST'[i % 17]}. ${APELLIDOS[i % 30]}${i >= 30 ? ' ' + 'XYZ'[Math.floor(i / 30) - 1] : ''}`, f: rnd() }));
const TORNEOS = [['Rosario Open', 'Clay'], ['Lago Hard', 'Hard'], ['Costa Verde', 'Grass'], ['Montaña Masters', 'Clay'], ['Puerto Indoor', 'Hard'], ['Capital Slam', 'Hard']];
const filas = []; let k = 1;
const hoy = new Date('2026-09-27T15:00:00Z');
const sumar = (f, d) => new Date(Date.parse(f + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
for (let sem = 0; sem < 101; sem++) {                     // desde noviembre de 2024 hasta octubre de 2026
  const [t, sup] = TORNEOS[sem % TORNEOS.length]; const lunes = sumar('2024-11-04', sem * 7);
  const slam = t === 'Capital Slam'; const tk = String(500 + (sem % TORNEOS.length));
  let vivos = [...jug].sort(() => rnd() - 0.5).slice(0, 16).map((j) => j);
  const rondas = ['1/8-finals', 'Quarter-finals', 'Semi-finals', 'Final'];
  for (let r = 0; r < 4; r++) {
    const fecha = sumar(lunes, r * 2), prox = [];
    for (let i = 0; i < vivos.length; i += 2) {
      const A = vivos[i], B = vivos[i + 1]; const pA = 0.5 + (A.f - B.f) * 0.6; const g = rnd() < pA ? 1 : 2;
      const bo = slam ? 5 : 3; const nSets = bo === 5 ? (rnd() < 0.4 ? 3 : rnd() < 0.6 ? 4 : 5) : (rnd() < 0.62 ? 2 : 3);
      const sets = []; let wA = 0, wB = 0;
      for (let s = 0; s < nSets; s++) {
        const needA = Math.ceil(bo / 2) - wA, needB = Math.ceil(bo / 2) - wB;
        const restantes = nSets - s; const ganaA = g === 1 ? (restantes <= needA ? true : rnd() < 0.5 && needB > 1) : !(restantes <= needB ? true : rnd() < 0.5 && needA > 1);
        const x = rnd(); const perdedor = x < 0.15 ? 6 : Math.floor(rnd() * 5);
        const sc = perdedor === 6 ? [7, 6] : [6, perdedor];
        sets.push(ganaA ? sc : [sc[1], sc[0]]); if (ganaA) wA++; else wB++;
      }
      const fila = { k: String(k++), f: fecha, h: ['02:00', '05:30', '09:00', '13:00'][i % 4], t, tk, r: rondas[r], sup, in: t.includes('Indoor') ? 1 : 0, bo, a: A.k, b: B.k, na: A.n, nb: B.n, g: 0, ret: 0, sets: [] };
      if (fecha < '2026-09-27') {
        fila.g = (wA > wB) ? 1 : 2; fila.sets = sets;
        const sa = 60 + Math.floor(rnd() * 40), sb = 60 + Math.floor(rnd() * 40);
        fila.s = [sa, Math.round(sa * (0.58 + A.f * 0.12)), sb, Math.round(sb * (0.58 + B.f * 0.12))];
        // los números que el proveedor manda y antes se tiraban: en 9 de cada 10 partidos
        if (rnd() < 0.9) {
          const ea = 2 + Math.floor(rnd() * 8), eb = 2 + Math.floor(rnd() * 8);
          fila.ac = [Math.floor(rnd() * 14), Math.floor(rnd() * 6), Math.floor(rnd() * 14), Math.floor(rnd() * 6)];
          fila.bp = [Math.floor(rnd() * (ea + 1)), ea, Math.floor(rnd() * (eb + 1)), eb];
          if (rnd() < 0.85) fila.we = [15 + Math.floor(rnd() * 25), 12 + Math.floor(rnd() * 25), 15 + Math.floor(rnd() * 25), 12 + Math.floor(rnd() * 25)];
        }
        if (rnd() < 0.02) fila.ret = 1;
      } else if (fecha > '2026-10-04') continue;
      if (rnd() < 0.01 && fecha >= '2026-09-27') fila.c = 1;
      filas.push(fila); prox.push(fila.g === 2 ? B : A);
    }
    vivos = prox; if (vivos.length < 2) break;
  }
}
const marcadas = marcarQualy(filas);
const { dichos } = recorrer(marcadas);
const m = medir(dichos, '2025-01-01');
const ranking = Object.fromEntries(jug.slice(0, 60).map((j, i) => [j.k, { rk: i + 1, pais: 'ARG' }]));
const t0 = Date.now();
const R = K.construirConsulta({ filas: marcadas, dichos, ranking, anticipados: {}, hoy, m, desdeMedir: '2025-01-01' });
const ms = Date.now() - t0;
const A = R.archivos;
const por = (t) => A.filter((a) => a.tipo === t);
console.log(`páginas: ${A.length} (base ${por('base').length}, jugados ${por('jugado').length}, próximos ${por('proximo').length}, jugadores ${por('jugador').length}, torneos ${por('torneo').length}) en ${ms} ms`);

// 1 · palabras prohibidas, en el texto visible de todas
const conProhibida = A.filter((a) => K.PROHIBIDAS.test(K.textoVisible(a.html)));
es('ninguna página tiene palabras de apuestas', conProhibida.length === 0, conProhibida.slice(0, 2).map((a) => a.ruta + ': ' + K.textoVisible(a.html).match(K.PROHIBIDAS)[0]));
es('la lista de prohibidas agarra lo que tiene que agarrar', ['la cuota', 'un pick', 'la fija', 'Betting Odds', 'acertá', 'ganale a la casa', 'eficacia', 'el único', 'apuestas'].every((x) => K.PROHIBIDAS.test(x)) && !K.PROHIBIDAS.test('valor del saque'));
es('todas dicen "app independiente"', A.every((a) => /app independiente/i.test(K.textoVisible(a.html))));
es('ninguna tiene fotos', A.every((a) => !/<img\b/i.test(a.html)));

// 2 · el número de un partido por jugar queda adentro de la app
const prox = por('proximo');
es('hay próximos para probar', prox.length > 0);
es('los próximos no muestran porcentajes del partido', prox.every((a) => !/\d+%\s*[–-]\s*\d+%/.test(K.textoVisible(a.html)) && !/daba el modelo|probabilidad|le da \d|chances? de ganar/i.test(K.textoVisible(a.html))));
es('los próximos tienen el botón al simulador con el partido', prox.every((a) => /href="\/#simular=[^"]+"/.test(a.html)));
es('la portada estática no tiene números de próximos', !/\d+%\s*[–-]\s*\d+%/.test(K.textoVisible(R.portada)));

// 3 · lo que daba el modelo, rotulado y sin mirar el futuro
const jug2 = por('jugado');
const conModelo = jug2.filter((a) => /Lo que daba el modelo/.test(a.html));
es('hay jugados con lo que daba el modelo', conModelo.length > 50, conModelo.length);
es('siempre rotulado "con lo que se sabía antes del partido"', conModelo.every((a) => /con lo que se sabía antes del partido/i.test(K.textoVisible(a.html))));
{
  // mismo día, mismo horario: darle vuelta al resultado de los OTROS partidos de ese día no cambia lo que se dijo de uno
  const cuenta = new Map(); for (const f of marcadas) if (f.g && f.f >= '2026-03-01') cuenta.set(f.f, (cuenta.get(f.f) || 0) + 1);
  const dia = [...cuenta].sort((a, b) => b[1] - a[1])[0][0];
  const delDia = marcadas.filter((f) => f.f === dia && f.g);
  const x = delDia[0];
  const otra = marcadas.map((f) => (f.f === dia && f.k !== x.k && f.g) ? { ...f, g: f.g === 1 ? 2 : 1 } : f);
  const d1 = dichos.find((d) => d.k === x.k), d2 = recorrer(otra).dichos.find((d) => d.k === x.k);
  es('sin mirar el futuro: los resultados del mismo día no mueven lo que se dijo de otro partido', delDia.length > 1 && Math.abs(d1.p - d2.p) < 1e-12, `${d1.p} ${d2.p}`);
  // y el resultado del propio partido tampoco
  const propia = marcadas.map((f) => (f.k === x.k ? { ...f, g: f.g === 1 ? 2 : 1, s: f.s && [f.s[2], f.s[3], f.s[0], f.s[1]] } : f));
  const d3 = recorrer(propia).dichos.find((d) => d.k === x.k);
  es('sin mirar el futuro: el resultado del propio partido no mueve lo que se dijo de él', Math.abs(d1.p - d3.p) < 1e-12);
}

// 4 · títulos, descripciones y canonical únicos
const unico = (arr) => new Set(arr).size === arr.length;
es('títulos únicos', unico(A.map((a) => a.titulo)), A.length - new Set(A.map((a) => a.titulo)).size);
es('descripciones únicas', unico(A.map((a) => a.descripcion)), A.length - new Set(A.map((a) => a.descripcion)).size);
es('rutas únicas', unico(A.map((a) => a.ruta)));
es('cada una tiene su canonical', A.every((a) => a.html.includes(`<link rel="canonical" href="${K.SITIO}/${a.ruta.replace(/index\.html$/, '')}">`)));

// 5 · con contenido (lo que ve un buscador sin JavaScript)
const pal = (a) => K.palabras(a.html);
es('páginas de base: entre 200 y 450 palabras', por('base').every((a) => pal(a) >= 200 && pal(a) <= 450), por('base').map(pal).join(','));
const pj = jug2.map(pal).sort((x, y) => x - y);
es('jugados: la mediana pasa las 250 palabras', pj[Math.floor(pj.length / 2)] >= 250, pj[Math.floor(pj.length / 2)]);
es('jugados: ninguno debajo de 180', pj[0] >= 180, pj[0]);
es('próximos: ninguno debajo de 150', prox.every((a) => pal(a) >= 150), Math.min(...prox.map(pal)));
es('jugadores: ninguno debajo de 150', por('jugador').every((a) => pal(a) >= 150), Math.min(...por('jugador').map(pal)));
es('el índice pasa las 300', pal(A.find((a) => a.tipo === 'indice')) >= 300);
es('la portada estática suma más de 150 palabras', K.palabras(R.portada) >= 150, K.palabras(R.portada));

// 6 · ningún número inventado: las páginas de base usan solo números de CIFRAS
{
  const C = R.cifras; const ok2 = new Set();
  const add = (x) => { if (x != null && Number.isFinite(x)) ok2.add(String(x)); };
  add(C.partidos); add(C.acierta); add(C.decisivoDicho); add(C.decisivoReal); add(C.saqueCircuito); add(C.cambiaBo3); add(C.cambiaBo5); add(50 + C.cambiaBo3); add(50 + C.cambiaBo5);
  for (const c of C.cajones) { add(c.desde); add(c.hasta); add(c.n); add(c.dijo); add(c.paso); }
  for (const s of Object.values(C.superficies)) { add(s.saque); add(s.tiebreak); add(s.decisivo); add(s.partidos); }
  for (const x of [3, 100, 50, 2025, 2026, 60, 2, 10, 4, 1, 0]) add(x);   // los de la redacción: "3 puntos", "de cada 100", "al 3.er set"…
  const sueltos = [];
  for (const a of por('base')) for (const n of K.textoVisible(a.html).replace(/(\d)\.(\d{3})/g, '$1$2').match(/\d+/g) || []) if (!ok2.has(n)) sueltos.push(a.ruta + ':' + n);
  es('las páginas de base no tienen números que no estén en CIFRAS', sueltos.length === 0, sueltos.slice(0, 5));
  es('CIFRAS sale de la medición', C.partidos === m.n && C.cajones[2].dijo === Math.round(100 * m.cajones[2].dijo));
}

// 7 · los links internos llevan a páginas que existen
{
  const rutas = new Set(A.map((a) => '/' + a.ruta).concat(A.filter((a) => a.ruta.endsWith('index.html')).map((a) => '/' + a.ruta.replace(/index\.html$/, ''))));
  for (const x of ['/', '/privacidad.html', '/terminos.html']) rutas.add(x);
  const rotos = [];
  for (const a of A.concat([{ ruta: 'portada', html: R.portada }])) for (const [, h] of a.html.matchAll(/href="(\/[^"#]*)"/g)) if (!/\.(css|svg)$/.test(h) && !rutas.has(h)) rotos.push(a.ruta + ' → ' + h);
  es('ningún link interno roto', rotos.length === 0, rotos.slice(0, 5));
}

// 8 · el puntito y la aguja (las mismas reglas que la app)
es('52-48 que gana el de 48: parejo, no sorpresa', K.puntito(0.52, 2).rotulo === 'parejo' && K.puntito(0.52, 2).clase === 'pg');
es('65% que gana el favorito: verde', K.puntito(0.65, 1).clase === 'pv' && K.puntito(0.35, 2).rotulo === 'favorito');
es('65% que pierde el favorito: sorpresa naranja', K.puntito(0.65, 2).clase === 'pn');
{
  const f = { na: 'A. Uno', nb: 'B. Dos', g: 2, s: [100, 55, 100, 70] };
  es('la aguja: perdió sacando peor y el otro mejor', /se fue por los dos lados/.test(K.aguja(f, { pa: 0.64, pb: 0.64 }).veredicto));
  es('la aguja: los dos como se esperaba', /Los dos sacaron como se esperaba/.test(K.aguja({ ...f, s: [100, 64, 100, 65] }, { pa: 0.64, pb: 0.64 }).veredicto));
  es('sin estadísticas no hay aguja', K.aguja({ ...f, s: null }, { pa: 0.6, pb: 0.6 }) === null);
}

// 9 · sitemap, robots, noindex, portada
{
  const pj = A.filter((a) => a.tipo === 'jugador' && /Cómo juega/.test(a.html));
  es('página de jugador: la mayoría trae el bloque de cómo juega', pj.length > A.filter((a) => a.tipo === 'jugador').length * 0.5);
  const pp = A.find((a) => a.tipo === 'jugado' && /Break points salvados/.test(a.html));
  es('página de partido: los break points salen en la tabla de los números', !!pp && /Aces/.test(pp.html));
}
es('el sitemap lista solo lo indexable', !R.archivos.filter((a) => !a.indexar).some((a) => R.sitemap.includes(a.ruta)) && R.sitemap.includes(K.SITIO + '/esta-medido.html'));
es('robots apunta al sitemap y deja afuera gracias', /Sitemap: https:\/\/sacavos\.com\/sitemap\.xml/.test(R.robots) && /Disallow: \/gracias\.html/.test(R.robots));
es('los no jugados van con noindex', A.filter((a) => a.tipo === 'nojugado').every((a) => /noindex/.test(a.html)));
{
  const idx = `<main></main>\n    ${K.MARCA_INICIO}\n    viejo\n    ${K.MARCA_FIN}\n<footer>`;
  const nuevo = K.ponerEnPortada(idx, '<p>nuevo</p>');
  es('la portada: reemplaza solo entre las marcas', nuevo.includes('<p>nuevo</p>') && !nuevo.includes('viejo') && nuevo.includes('<footer>') && K.ponerEnPortada('sin marcas', 'x') === 'sin marcas');
}
// 10 · el gancho de la portada
{
  const gt = K.textoVisible(R.gancho);
  const c70 = R.cifras.cajones.find((c) => c.desde === 70);
  const permitidos = new Set([String(R.cifras.partidos)]);
  es('el gancho es corto: qué es, y en cuántos partidos se midió, con link (sin el acierto: Fausto, 1/10)', /Simulador de resultados/.test(gt) && new RegExp(`Medido en ${R.cifras.partidos.toLocaleString('es-AR')} partidos`).test(gt) && !/cada 100/.test(gt) && /href="\/esta-medido\.html"/.test(R.gancho) && K.palabras(R.gancho) <= 30);
  const sueltos = (gt.replace(/(\d)\.(\d{3})/g, '$1$2').match(/\d+/g) || []).filter((n) => !permitidos.has(n));
  es('el gancho: solo números de CIFRAS', sueltos.length === 0, sueltos);
  es('el gancho: sin palabras prohibidas ni números de partidos', !K.PROHIBIDAS.test(gt) && !/\d+%\s*[–-]\s*\d+%/.test(gt));
  const idx = `<header></header>\n    ${K.GANCHO_INICIO}\n    viejo\n    ${K.GANCHO_FIN}\n    ${K.MARCA_INICIO}\n    x\n    ${K.MARCA_FIN}`;
  const n2 = K.ponerEnPortada(K.ponerEnPortada(idx, 'P'), R.gancho, K.GANCHO_INICIO, K.GANCHO_FIN);
  es('el gancho va entre sus marcas y no pisa el otro bloque', n2.includes('id="sv-gancho"') && !n2.includes('viejo') && n2.includes('\n    P\n'));
}
es('todas las páginas llevan el script de AdSense en el head, una sola vez', A.every((a) => (a.html.match(/adsbygoogle\.js\?client=ca-pub-2032639837955609/g) || []).length === 1 && a.html.indexOf('adsbygoogle') < a.html.indexOf('</head>')));
es('no tarda: menos de 20 segundos', ms < 20000, ms);

// ---------- las fichas para la app ----------
{
  const semana = marcadas.filter((f) => f.f >= '2026-09-25' && f.f <= '2026-10-04' && !f.c).map((f) => ({ k: f.k, a: f.a, b: f.b, f: f.f }));
  const F = K.fichasParaLaApp({ filas: marcadas, ranking, hoy, partidos: semana });
  const claves = new Set(semana.flatMap((p) => [String(p.a), String(p.b)]));
  es('fichas: hay una por cada jugador de la semana y ninguna de más', claves.size > 0 && [...claves].every((k) => F.jugadores[k]) && Object.keys(F.jugadores).length === claves.size);
  es('fichas: hay un cara a cara por cada partido de la semana', semana.every((p) => F.cruces[String(p.k)] && typeof F.cruces[String(p.k)].n === 'number'));
  const f1 = Object.values(F.jugadores).find((j) => j.ult.length >= 5 && j.sup.length);
  es('fichas: traen últimos partidos, superficie con ganados y saque, y nombre', !!f1 && f1.ult.length <= 10 && f1.sup.every((x) => x.g <= x.n) && f1.sup.some((x) => x.saque != null) && /\. /.test(f1.nombre));
  es('fichas: nada del futuro: ningún "último partido" es de hoy en adelante y ningún cruce tampoco', Object.values(F.jugadores).every((j) => j.ult.every((u) => u.f < '2026-09-27')) && Object.values(F.cruces).every((c) => c.ult.every((u) => u.f < '2026-09-27')));
  es('fichas: sin pronóstico adentro (ni p, ni probabilidad)', !/"p":|probabil/i.test(JSON.stringify(F)));
  const cruce = Object.entries(F.cruces).find(([, c]) => c.n > 0);
  es('fichas: el cara a cara cuenta bien (ganados de A entre 0 y n, últimos con ganador 1 o 2)', !cruce || (cruce[1].gA <= cruce[1].n && cruce[1].ult.every((u) => u.g === 1 || u.g === 2)));
  es('fichas: pesan poco (menos de 2 KB por jugador)', JSON.stringify(F).length / Math.max(1, Object.keys(F.jugadores).length) < 2048);
  const conG = Object.values(F.jugadores).filter((j) => j.golpes && j.golpes.aces != null);
  es('fichas: traen cómo juega para los que tienen datos', conG.length > 0 && conG.every((j) => j.golpes.salvados >= 0 && j.golpes.salvados <= 100));
}


// ---------- cómo juega: los números descriptivos (H23 refutada, van como información) ----------
{
  const uno = { a: '1', b: '2', f: '2026-09-01', g: 1, ac: [10, 3, 4, 6], bp: [4, 6, 6, 9], we: [25, 18, 14, 30] };
  const G = K.golpesDe([uno, { ...uno, f: '2026-09-02' }, { ...uno, f: '2026-09-03' }, { ...uno, f: '2026-09-04' }, { ...uno, f: '2026-09-05' }], '1', '2026-01-01');
  es('golpes: aces y dobles faltas son promedio por partido', G.aces === 10 && G.df === 3);
  es('golpes: break points salvados son los suyos al saque', G.salvados === Math.round(100 * 20 / 30));
  es('golpes: break points convertidos son los del rival que no salvó', G.convertidos === Math.round(100 * 15 / 45));
  es('golpes: winners y errores por partido', G.winners === 25 && G.errores === 18);
  const B = K.golpesDe([uno, { ...uno, f: '2026-09-02' }, { ...uno, f: '2026-09-03' }, { ...uno, f: '2026-09-04' }, { ...uno, f: '2026-09-05' }], '2', '2026-01-01');
  es('golpes: del otro lado los números se dan vuelta', B.aces === 4 && B.df === 6 && B.salvados === Math.round(100 * 30 / 45));
  es('golpes: con pocos partidos no se inventa un promedio', (() => { const x = K.golpesDe([uno], '1', '2026-01-01'); return x.aces === null && x.winners === null; })());
  es('golpes: sin esos datos, todo en null y el bloque no sale', (() => {
    const x = K.golpesDe([{ a: '1', b: '2', f: '2026-09-01', g: 1 }], '1', '2026-01-01');
    return x.aces === null && x.salvados === null && K.bloqueGolpes(x, 'Molina') === '';
  })());
  es('golpes: un abandono no cuenta', K.golpesDe([{ ...uno, ret: 1 }, { ...uno, f: '2026-09-02', ret: 1 }, { ...uno, f: '2026-09-03', ret: 1 }, { ...uno, f: '2026-09-04', ret: 1 }, { ...uno, f: '2026-09-05', ret: 1 }], '1', '2026-01-01').aces === null);
  es('golpes: lo viejo queda afuera de los 12 meses', K.golpesDe([{ ...uno, f: '2024-01-01' }], '1', '2026-01-01').n === 0);
  const html = K.bloqueGolpes(G, 'Molina');
  es('golpes: el bloque dice que son descriptivos y que el modelo no los usa', /no sirven/.test(html) && /el modelo no los usa/.test(html));
  es('golpes: el bloque no promete nada sobre el próximo partido', !/va a (ganar|sacar)|probabilidad/i.test(html));
  const fg = K.filasGolpes(uno);
  es('filas del partido: las seis filas con los números de los dos', (fg.match(/<tr>/g) || []).length === 6 && fg.includes('4 de 6') && fg.includes('Winners'));
  es('filas del partido: sin datos no hay filas', K.filasGolpes({ a: '1', b: '2' }) === '');
}

console.log(`${ok} pruebas bien, ${mal} mal`);
if (mal) process.exit(1);
