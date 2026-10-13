// Pruebas sin red del motor diario. Corren antes de gastar un pedido.
import { compactar, saqueDe, superficie, nombreTorneo, numerosDe, bpCierra } from './tenis-compactar.mjs';
import { recorrer, pronostico, crearEstado, aprender, medir, P, marcarQualy, setsJugados, corrimiento, desdeEstado, primerSet, despuesDelPrimerSet, medirEnVivo, ausencia, conAusencia, semana } from './tenis-fuerzas.mjs';
import { createRequire } from 'node:module';
const sv = createRequire(import.meta.url)('./tenis-motor.js');

let ok = 0, mal = 0;
function es(nombre, cond, det) { if (cond) ok++; else { mal++; console.log('FALLA:', nombre, det ?? ''); } }
const cerca = (a, b, t) => Math.abs(a - b) <= t;

// --- compactar, con la forma real que devolvió la sonda
const st = (k, n, w, t) => ({ player_key: k, stat_period: 'match', stat_type: 'Service', stat_name: n, stat_value: null, stat_won: w, stat_total: t });
const crudo = {
  event_key: 99, event_date: '2025-05-10', event_time: '11:00', event_first_player: 'A. Uno', first_player_key: 10, event_second_player: 'B. Dos', second_player_key: 20,
  event_winner: 'First Player', event_status: 'Finished', tournament_name: 'ATP Rome', tournament_key: 7, tournament_round: 'ATP Rome - 1/16-finals',
  scores: [{ score_first: '6', score_second: '4' }, { score_first: '7', score_second: '6' }],
  statistics: [st(10, 'Service Points Won', '45', '70'), st(20, '1st Serve Points Won', '30', '40'), st(20, '2nd Serve Points Won', '12', '25')],
};
const c = compactar(crudo, { 7: 'Clay' });
es('compacta clave, fecha, torneo sin ATP', c.k === '99' && c.f === '2025-05-10' && c.t === 'Rome');
es('ronda sin el nombre del torneo', c.r === '1/16-finals', c.r);
es('superficie desde tournament_sourface', c.sup === 'Clay' && c.in === 0);
es('ganador', c.g === 1);
es('saque: Service Points Won para A, 1st+2nd para B', JSON.stringify(c.s) === JSON.stringify([70, 45, 65, 42]), JSON.stringify(c.s));
es('mejor de 3 fuera de Grand Slam', c.bo === 3);
es('Grand Slam mejor de 5', compactar({ ...crudo, tournament_name: 'ATP Wimbledon' }, {}).bo === 5);
es('Davis afuera', compactar({ ...crudo, tournament_name: 'ATP Davis Cup - World Group I' }, {}) === null);
es('abandono: cuenta el resultado, marcado como ret', (() => { const x = compactar({ ...crudo, event_status: 'Retired' }, {}); return x.g === 1 && x.ret === 1; })());
es('walkover: no cuenta', compactar({ ...crudo, event_status: 'Walk Over' }, {}).g === 0);
es('cancelado: marcado c y sin resultado', (() => { const x = compactar({ ...crudo, event_status: 'Cancelled', event_winner: '-' }, {}); return x.c === 1 && x.g === 0; })());
es('tie-break: games enteros y puntos aparte', (() => { const x = compactar({ ...crudo, scores: [{ score_first: '7.7', score_second: '6.4' }, { score_first: '6', score_second: '3' }] }, {}); return x.sets[0][0] === 7 && x.sets[0][1] === 6 && x.tb[0][1] === 4; })());
es('en juego: marcado vivo', compactar({ ...crudo, event_status: 'Set 2', event_winner: null, event_live: '1' }, {}).vivo === 1);
es('terminado: no queda como en juego', compactar({ ...crudo, event_live: '1' }, {}).vivo === undefined);
es('no terminado: g = 0', compactar({ ...crudo, event_status: '', event_winner: null }, {}).g === 0);
es('sin estadísticas: sin s', compactar({ ...crudo, statistics: [] }, {}).s === undefined);
es('saque incompleto de un jugador: sin s', compactar({ ...crudo, statistics: crudo.statistics.slice(0, 2) }, {}).s === undefined);
es('indoor', superficie('Hard (Indoor)').sup === 'Hard' && superficie('Hard (Indoor)').indoor === true);
es('superficie rara → null', superficie(' - Preliminary').sup === null);
es('clay en minúscula', superficie('clay').sup === 'Clay');
es('nombre torneo unifica', nombreTorneo('ATP  Brisbane') === 'Brisbane' && nombreTorneo('Brisbane') === 'Brisbane');
es('saqueDe ignora estadísticas de set', saqueDe([{ ...st(10, 'Service Points Won', '5', '8'), stat_period: 'set 1' }], 10) === null);

// --- fuerzas: un mundo inventado donde A saca mejor que B
function partido(i, a, b, ganaA, sA, sB, f) {
  return { k: String(i).padStart(6, '0'), f, h: '10:00', t: 'X', sup: 'Hard', bo: 3, a, b, na: a, nb: b, g: ganaA ? 1 : 2, ret: 0, sets: [[6, 4], [6, 4]], s: [100, Math.round(100 * sA), 100, Math.round(100 * sB)] };
}
const filas = []; let i = 0;
const dia = (n) => new Date(Date.UTC(2025, 0, 1) + n * 86400000).toISOString().slice(0, 10);
for (let n = 0; n < 40; n++) { filas.push(partido(i++, 'fuerte', 'r' + (n % 5), true, 0.70, 0.60, dia(n * 3))); filas.push(partido(i++, 'debil', 'r' + (n % 5), false, 0.58, 0.64, dia(n * 3 + 1))); }
const { E, dichos } = recorrer(filas);
const futuro = { k: 'z', f: dia(130), h: '', t: 'X', sup: 'Hard', bo: 3, a: 'fuerte', b: 'debil', na: 'fuerte', nb: 'debil', g: 0, sets: [] };
const p = pronostico(E, futuro);
es('evaluable con 40 partidos cada uno', p.evaluable && p.nA >= P.MIN_PARTIDOS);
es('el que saca mejor tiene más saque', p.saqueA > p.saqueB, `${p.saqueA} ${p.saqueB}`);
es('y es favorito, en saque y en Elo', p.pSaque > 0.7 && p.pElo > 0.7 && p.p > 0.7, `${p.pSaque} ${p.pElo} ${p.p}`);
es('saque encogido hacia el circuito (k 500): menos de 70%', p.saqueA < 0.70);
es('simétrico: dar vuelta los jugadores da 1 − p', cerca(pronostico(E, { ...futuro, a: 'debil', b: 'fuerte' }).p, 1 - p.p, 1e-9));
es('jugador nuevo: no evaluable', !pronostico(E, { ...futuro, b: 'nadie' }).evaluable);
es('dichos: un registro por partido terminado', dichos.length === filas.length);
es('el primer partido se dijo sin datos (no evaluable)', dichos[0].evaluable === false);
es('lo dicho es previo al partido: el primero es 50% de Elo', cerca(dichos[0].pElo, 0.5, 1e-12));
// no mira el futuro: agregar partidos después no cambia lo dicho antes
const { dichos: d2 } = recorrer([...filas, partido(999, 'debil', 'fuerte', true, 0.8, 0.5, dia(200))]);
es('agregar el futuro no cambia el pasado', d2.slice(0, dichos.length).every((d, j) => d.p === dichos[j].p));
// ventana: un partido de hace más de 104 semanas no cuenta
const E2 = crearEstado(); aprender(E2, { ...partido(1, 'x', 'y', true, 0.9, 0.5, '2020-01-01') }, undefined);
es('ventana de 104 semanas', pronostico(E2, { ...futuro, a: 'x', b: 'y', f: '2025-01-01' }).nA === 0);
// un abandono suma resultado pero no estadísticas
const E3 = crearEstado(); aprender(E3, { ...partido(1, 'x', 'y', true, 0.9, 0.5, '2025-01-01'), ret: 1 });
es('abandono: sin saque, con resultado', pronostico(E3, { ...futuro, a: 'x', b: 'y', f: '2025-01-05' }).nA === 0 && E3.jug.get('x').res.length === 1);

// --- H19: semanas sin jugar (claude/tenis-forma-reciente.md, comparaciones 19 y 22)
{
  const J = (ult) => ({ ultSem: ult });
  const hoy = semana('2025-07-01');
  es('H19: el que nunca jugó no arrastra ausencia', ausencia(J(null), hoy) === 0);
  es('H19: dos semanas de gracia (el circuito es semanal)', ausencia(J(hoy - 2), hoy) === 0 && ausencia(J(hoy - 1), hoy) === 0);
  es('H19: a las 12 semanas cuenta 10', ausencia(J(hoy - 12), hoy) === 10);
  es('H19: se corta a las 24 aunque falte un año', ausencia(J(hoy - 60), hoy) === P.AUS_TOPE);
  es('H19: con la misma ausencia, la probabilidad no se toca', conAusencia(0.63, 7, 7) === 0.63 && conAusencia(0.5, 0, 0) === 0.5);
  const parado = conAusencia(0.5, 10, 0);
  es('H19: el que estuvo parado pierde', parado < 0.5 && parado > 0.4, String(parado));
  es('H19: y es simétrico al revés', cerca(conAusencia(0.5, 0, 10), 1 - parado, 1e-12));
  es('H19: 10 semanas valen el c declarado', cerca(Math.log(parado / (1 - parado)), -P.C_AUSENCIA, 1e-9));
  // de punta a punta: el mismo partido, pero uno viene de tres meses parado
  const vuelve = { ...futuro, f: dia(220) };
  const pNormal = pronostico(E, { ...futuro, f: dia(131) });
  const pVuelve = pronostico(E, vuelve);
  es('H19: el pronóstico lo usa y lo informa', pVuelve.ausA > 0 && pVuelve.p < pNormal.p, `${pVuelve.ausA} ${pVuelve.p} ${pNormal.p}`);
  // jugar sin estadísticas también cuenta como jugar
  const E9 = crearEstado();
  aprender(E9, { ...partido(1, 'x', 'y', true, 0.9, 0.5, '2025-01-01'), ret: 1, s: null });
  es('H19: un abandono sin saque igual marca que jugó', E9.jug.get('x').ultSem === semana('2025-01-01'));
}

// --- qualy y sets, con la forma real de junio de 2025
const W = (k, f, r, sets, bo = 5) => ({ k, f, h: '10:00', t: 'Wimbledon', tk: '2053', r, sup: 'Grass', bo, a: 'x' + k, b: 'y' + k, g: 1, ret: 0, sets });
const cero = [0, 0];
const junio = marcarQualy([
  W('q1', '2025-06-23', 'Quarter-finals', [[6, 4], [3, 6], [5, 7], cero, cero]),
  W('q3', '2025-06-26', 'Final', [[6, 4], [6.2, 7.7], [3, 6], [7.13, 6.11], [7.1, 6.7]]),
  W('m1', '2025-06-30', '1/64-finals', [[6, 2], [3, 6], [6.2, 7.7], [6, 4], [6, 4]]),
  W('m7', '2025-07-13', 'Final', [[4, 6], [6, 4], [6, 4], [6, 4], cero]),
  { ...W('h1', '2025-06-14', 'Semi-finals', [[7, 5], [6, 3], cero, cero, cero], 3), t: 'Halle', tk: '2041' },
  { ...W('h2', '2025-06-16', '1/16-finals', [[3, 6], [3, 6], cero, cero, cero], 3), t: 'Halle', tk: '2041' },
  { ...W('f1', '2025-11-12', '', [[6, 4], [6, 4], cero, cero, cero], 3), t: 'ATP Finals - Turin', tk: '9' },
]);
const por = Object.fromEntries(junio.map(f => [f.k, f]));
es('sets jugados ignora el relleno [0,0]', setsJugados(por.q1) === 3 && setsJugados(por.q3) === 5 && setsJugados(por.h1) === 2);
es('qualy de Grand Slam antes del 1/64: marcada y a mejor de 3', por.q1.q === 1 && por.q1.r === 'Qualy' && por.q1.bo === 3);
es('qualy que se jugó a 5 sets queda a mejor de 5', por.q3.q === 1 && por.q3.bo === 5);
es('cuadro principal de Grand Slam: mejor de 5, sin marcar', !por.m1.q && por.m1.bo === 5 && !por.m7.q && por.m7.r === 'Final');
es('qualy de un 250 ("Semi-finals" antes del 1/16)', por.h1.q === 1 && !por.h2.q && por.h1.bo === 3);
es('torneo sin primera ronda (Finals): no se marca nada', !por.f1.q);
es('Stuttgart y Mallorca son césped aunque la API diga polvo', compactar({ ...crudo, tournament_name: 'ATP Stuttgart', tournament_key: 5 }, { 5: 'Clay' }).sup === 'Grass' && compactar({ ...crudo, tournament_name: 'Mallorca', tournament_key: 6 }, { 6: 'Clay' }).sup === 'Grass');
const d5 = recorrer(junio).dichos;
es('set decisivo real: q1 (3 sets, mejor de 3) sí; m7 (4 sets, mejor de 5) no', d5.find(d => d.k === 'q1').fueDecisivo === 1 && d5.find(d => d.k === 'm7').fueDecisivo === 0 && d5.find(d => d.k === 'm1').fueDecisivo === 1);

// --- en vivo (H14, H15)
const d0 = corrimiento(0.64, 0.64, 3, 0.7);
es('corrimiento: el saque corrido da la p pedida', cerca(sv.svProbabilidad(0.64 + d0, 0.64 - d0, 3).ganar, 0.7, 0.002), d0);
const arriba = desdeEstado(0.64, 0.64, 3, { sets: [1, 0], games: [0, 0], puntos: null }, 0, sv.SV.SIGMA);
es('parejos y 1-0 en sets: entre 70 y 85%', arriba > 0.7 && arriba < 0.85, arriba);
es('desdeEstado con σ del modelo = svAhora promediando quién saca', cerca(arriba, 0.5 * (sv.svAhora(0.64, 0.64, 3, { sets: [1, 0], sacaA: true }) + sv.svAhora(0.64, 0.64, 3, { sets: [1, 0], sacaA: false })), 1e-9));
es('primer set con tie-break 7.7-6.4 lo gana A', primerSet({ sets: [[7.7, 6.4], [3, 6], [0, 0]] }) === 1 && primerSet({ sets: [[3, 6]] }) === 2 && primerSet({ sets: [[0, 0]] }) === null);
const pro0 = { pa: 0.64, pb: 0.64, p: 0.5 };
const filaV = { bo: 3, sets: [[6, 4], [6, 4], [0, 0]], s1: [30, 24, 30, 16] };   // A ganó 80% al saque en el set, B 53%
const v = despuesDelPrimerSet(pro0, filaV);
es('en vivo: sin mirar el set, el que ganó el 1er set es favorito', v.ganoA === 1 && v.sinSet > 0.7);
es('en vivo: si además sacó mucho mejor en el set, sube más (forma del día)', v.conSet > v.sinSet, `${v.sinSet} ${v.conSet}`);
es('en vivo: sin estadísticas del set, no hay H15', despuesDelPrimerSet(pro0, { ...filaV, s1: undefined }).conSet === null);
es('en vivo: partido de un solo set (abandono) no cuenta', despuesDelPrimerSet(pro0, { bo: 3, sets: [[6, 4], [0, 0]] }) === null);
es('compacta el saque del set 1', (() => { const x = compactar({ ...crudo, statistics: [...crudo.statistics, { ...st(10, 'Service Points Won', '20', '28'), stat_period: 'set 1' }, { ...st(20, 'Service Points Won', '15', '25'), stat_period: 'set 1' }] }, {}); return JSON.stringify(x.s1) === JSON.stringify([28, 20, 25, 15]) && x.v === 3; })());
// en el mundo inventado, con primer set y s1
const vivos = filas.map((f, j) => ({ ...f, sets: [[6, 4], j % 3 ? [6, 3] : [3, 6], j % 3 ? [0, 0] : [6, 2]], s1: [30, 20, 30, 18] }));
const dv = recorrer(vivos).dichos, mv = medirEnVivo(dv, '2025-01-01');
es('medirEnVivo: cuenta partidos y cajones', mv.n > 0 && mv.cajones.reduce((a, c) => a + c.n, 0) === mv.n && mv.nCon === mv.n);
es('medirEnVivo: H15 trae su calibración y la comparación contra la vara', !mv.h15 || (mv.h15.cajones.reduce((a, c) => a + c.n, 0) === mv.nCon && Number.isFinite(mv.h15.contraVara.t) && mv.h15.acierta > 0));

// medir
const m = medir(dichos, '2025-01-01');
es('medir cuenta solo evaluables', m.n > 0 && m.n < dichos.length);
es('medir: cajones con n que suman', m.cajones.reduce((s, x) => s + x.n, 0) === m.n);


// --- los números del partido que antes se tiraban (aces, break points, winners).
// Descriptivos: H23 midió si servían para pronosticar y no sirven (claude/tenis-break-points.md).
const sN = (k, n, w, t, val) => ({ player_key: k, stat_period: 'match', stat_type: 'Service', stat_name: n, stat_value: val ?? null, stat_won: w, stat_total: t });
const conNum = (extra) => ({ ...crudo, statistics: [...crudo.statistics, ...extra] });
const NUM10 = [sN(10, 'Aces', null, null, '8'), sN(10, 'Double Faults', null, null, '2'), sN(10, 'Break Points Saved', '4', '6'), sN(10, 'Break Points Converted', '3', '9'), sN(10, 'Winners', null, null, '25'), sN(10, 'Unforced Errors', null, null, '18')];
const NUM20 = [sN(20, 'Aces', null, null, '3'), sN(20, 'Double Faults', null, null, '5'), sN(20, 'Break Points Saved', '6', '9'), sN(20, 'Break Points Converted', '2', '6'), sN(20, 'Winners', null, null, '14'), sN(20, 'Unforced Errors', null, null, '30')];
{
  const x = compactar(conNum([...NUM10, ...NUM20]), {});
  es('aces y dobles faltas de los dos', JSON.stringify(x.ac) === JSON.stringify([8, 2, 3, 5]));
  es('break points: salvados y enfrentados de cada uno', JSON.stringify(x.bp) === JSON.stringify([4, 6, 6, 9]));
  es('winners y errores no forzados', JSON.stringify(x.we) === JSON.stringify([25, 18, 14, 30]));
  es('versión 3 de los datos', x.v === 3);
}
es('sin esas estadísticas, los campos no están', (() => { const x = compactar(crudo, {}); return x.ac === undefined && x.bp === undefined && x.we === undefined; })());
es('si falta el dato de un jugador, no se guarda a medias', (() => { const x = compactar(conNum(NUM10), {}); return x.ac === undefined && x.bp === undefined; })());
es('Number("") no se cuela como cero', (() => { const x = compactar(conNum([sN(10, 'Aces', null, null, ''), sN(20, 'Aces', null, null, '3'), sN(10, 'Double Faults', null, null, '1'), sN(20, 'Double Faults', null, null, '2')]), {}); return x.ac === undefined; })());
es('un mapeo dado vuelta (salvados > enfrentados) se descarta', (() => { const x = compactar(conNum([sN(10, 'Break Points Saved', '9', '4'), sN(20, 'Break Points Saved', '6', '9')]), {}); return x.bp === undefined; })());
es('el control de break points cierra cuando los números son coherentes', bpCierra(numerosDe([...NUM10, ...NUM20], 10), numerosDe([...NUM10, ...NUM20], 20)) === true);
es('el control avisa cuando no cierra', (() => { const malos = [sN(10, 'Break Points Saved', '4', '6'), sN(10, 'Break Points Converted', '3', '9'), sN(20, 'Break Points Saved', '6', '9'), sN(20, 'Break Points Converted', '1', '6')]; return bpCierra(numerosDe(malos, 10), numerosDe(malos, 20)) === false; })());
es('el control no opina si faltan los cuatro datos', bpCierra(numerosDe(NUM10, 10), numerosDe(NUM10, 20)) === null);

console.log(`${ok} pruebas bien, ${mal} mal`);
if (mal) process.exit(1);
