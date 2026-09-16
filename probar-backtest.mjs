/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL BACKTEST
     node probar-backtest.mjs
   Sin red. Inventa ligas con fuerzas conocidas y verifica que el modelo
   las descubra —y que NO descubra nada donde no hay nada—. Es la prueba
   más importante: un backtest que "encuentra" ventaja en ruido vendería
   ligas que no funcionan.
   ══════════════════════════════════════════════════════════════════════════ */
import { probabilidades, brier, correr, veredicto, partidosDe, filaDeLiga, agregarALigas,
         ligaNueva, nuevaTemporada, sumar, fuerzas, pronosticar, informe, MODELO,
         clasificarPedido, filaResultado } from "./backtest.mjs";

const casos = [];
const caso = (n, ok, d = "") => casos.push([n, ok, d]);

/* azar con semilla, para que la prueba dé siempre lo mismo */
function azar(semilla) { let a = semilla >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function poissonAzar(l, rnd) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }

/* Una liga inventada: 20 equipos, todos contra todos ida y vuelta, con
   fuerzas de ataque/defensa fijas por equipo. `dispersion` 0 = todos
   iguales (no hay nada que aprender). */
function ligaInventada({ temporadas, dispersion, semilla, local = 1.45, visita = 1.15 }) {
  const rnd = azar(semilla);
  const eq = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i,
    A: Math.exp((rnd() - .5) * 2 * dispersion), D: Math.exp((rnd() - .5) * 2 * dispersion) }));
  return temporadas.map(t => {
    const partidos = []; let dia = 0;
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) if (i !== j) {
      const h = eq[i], a = eq[j];
      partidos.push({ fecha: new Date(Date.UTC(t, 0, 1 + (dia++ % 300))).toISOString(),
        local: h.id, visita: a.id,
        gl: poissonAzar(local * h.A * a.D, rnd), gv: poissonAzar(visita * a.A * h.D, rnd) });
    }
    return { temporada: t, partidos };
  });
}

/* ─── 1. las probabilidades ──────────────────────────────────────────── */
{
  const p = probabilidades(1.4, 1.1);
  caso("las tres probabilidades suman 1", Math.abs(p.H + p.D + p.A - 1) < 1e-9);
  caso("con más goles esperados de local, gana el local", p.H > p.A && p.H > p.D);
  const sin = probabilidades(0.9, 0.9, 0), con = probabilidades(0.9, 0.9, MODELO.rho);
  caso("Dixon-Coles con rho negativo sube el empate en partidos de pocos goles", con.D > sin.D, `${con.D.toFixed(3)} vs ${sin.D.toFixed(3)}`);
  caso("Brier: acertar seguro vale 0, errar seguro vale 2",
       brier({ H: 1, D: 0, A: 0 }, "H") === 0 && brier({ H: 1, D: 0, A: 0 }, "A") === 2);
}

/* ─── 2. el estado de la liga ────────────────────────────────────────── */
{
  const L = ligaNueva(); nuevaTemporada(L, 2024);
  caso("sin partidos, la fuerza es el prior: 1", fuerzas(L, 1).A === 1 && fuerzas(L, 1).D === 1);
  for (let i = 0; i < 10; i++) sumar(L, 1, 2, 3, 0);       /* el 1 le gana 3-0 al 2 diez veces */
  caso("el que hace goles sube el ataque, el que los recibe baja la defensa (número mayor)",
       fuerzas(L, 1).A > 1 && fuerzas(L, 2).D > 1 && fuerzas(L, 2).A < 1);
  caso("no se evalúa antes de los 6 partidos previos", !pronosticar(ligaNueva(), 1, 2).evaluable &&
       pronosticar(L, 1, 2).evaluable);
  const antes = fuerzas(L, 1).A;
  nuevaTemporada(L, 2025);
  const despues = fuerzas(L, 1).A;
  caso("al cambiar de temporada, la fuerza se arrastra encogida hacia 1 (0,55)",
       despues > 1 && despues < antes && Math.abs((despues - 1) - MODELO.arrastre * (antes - 1)) < 1e-9,
       `${antes.toFixed(3)} → ${despues.toFixed(3)}`);
  caso("y los partidos previos se conservan para el mínimo", fuerzas(L, 1).previos === 10);
}

/* ─── 3. encuentra la señal cuando la hay ──────────────────────────────
   Dispersión 0,7: fuerzas entre 0,5 y 2, que es una liga europea de
   verdad (el puntero hace el doble de goles que el colista). Con menos
   dispersión el ruido de estimar 38 partidos tapa la señal, y eso no es un
   defecto del backtest: es lo que pasa en Argentina. */
{
  const T = ligaInventada({ temporadas: [2023, 2024, 2025], dispersion: 0.7, semilla: 7 });
  const r = correr(T);
  caso("en una liga con equipos distintos, evalúa las dos temporadas después del precalentamiento",
       r.n > 600 && Object.keys(r.porTemporada).join() === "2024,2025", `n=${r.n}`);
  caso("y le gana claro a la vara (t > 4)", r.ventaja > 0.02 && r.t > 4, `ventaja ${r.ventaja.toFixed(4)} t ${r.t.toFixed(1)}`);
  caso("acierta más que la vara ciega (>45%)", r.acierta > 0.45, (r.acierta * 100).toFixed(1) + "%");
  caso("el veredicto lo aprueba", veredicto(r).ok);
}

/* ─── 4. y NO la encuentra cuando no la hay ──────────────────────────── */
{
  const ts = [];
  for (const s of [1, 2, 3, 4, 5]) {
    const r = correr(ligaInventada({ temporadas: [2023, 2024, 2025], dispersion: 0, semilla: 100 + s }));
    ts.push(r.t);
  }
  /* Lo que importa es que NO encuentre ventaja donde no hay: t positiva
     alta seria un falso positivo. Que salga negativa es correcto: estimar
     fuerzas que no existen mete ruido y la vara, que aca es la verdad, gana. */
  const maxT = Math.max(...ts);
  caso("con todos los equipos iguales, en cinco ligas al azar la t nunca pasa de 2 (sin falsos positivos)", maxT < 2,
       ts.map(t => t.toFixed(2)).join(" "));
  const r0 = correr(ligaInventada({ temporadas: [2023, 2024, 2025], dispersion: 0, semilla: 101 }));
  caso("y el veredicto NO la aprueba", !veredicto(r0).ok, veredicto(r0).texto);
}

/* ─── 5. los umbrales del veredicto ──────────────────────────────────── */
{
  caso("pocos partidos no alcanzan aunque la t sea alta", !veredicto({ n: 120, t: 9, ventaja: .1 }).ok);
  caso("t de 3 con 500 partidos aprueba", veredicto({ n: 500, t: 3.1, ventaja: .05 }).ok);
  caso("t de 1 no aprueba, y lo dice sin drama", !veredicto({ n: 500, t: 1, ventaja: .004 }).ok &&
       /simular, no prometer/.test(veredicto({ n: 500, t: 1, ventaja: .004 }).texto));
}

/* ─── 6. lo que viene de la API ──────────────────────────────────────── */
{
  const resp = [
    { fixture: { id: 1, date: "2025-03-01T20:00:00+00:00", status: { short: "FT" } }, teams: { home: { id: 5 }, away: { id: 6 } }, goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } },
    { fixture: { id: 2, date: "2025-03-02T20:00:00+00:00", status: { short: "NS" } }, teams: { home: { id: 5 }, away: { id: 6 } }, goals: { home: null, away: null }, score: { fulltime: { home: null, away: null } } },
    { fixture: { id: 3, date: "2025-03-03T20:00:00+00:00", status: { short: "PST" } }, teams: { home: { id: 5 }, away: { id: 6 } }, goals: { home: null, away: null }, score: { fulltime: {} } },
  ];
  const p = partidosDe(resp);
  caso("de la respuesta solo quedan los partidos terminados, con sus goles", p.length === 1 && p[0].gl === 2 && p[0].gv === 1 && p[0].id === 1);
  const fila = filaDeLiga({ id: 262, nombre: "Liga MX", pais: "Mexico" }, { ventaja: 0.04567 });
  caso("la fila para ligas.json tiene slug limpio y la ventaja redondeada",
       fila.slug === "mexico-liga-mx" && fila.ventajaBacktest === 0.0457, JSON.stringify(fila));
  const cfg = { ligas: [{ id: 94 }] };
  const a = agregarALigas(cfg, fila), b = agregarALigas(a.cfg, fila);
  caso("se agrega una vez y la segunda no duplica", a.agregada && a.cfg.ligas.length === 2 && !b.agregada && b.cfg.ligas.length === 2);
  caso("el informe dice si se puede armar el once según haya ratings",
       /se puede armar el once/.test(informe("x", correr(ligaInventada({ temporadas: [2023, 2024], dispersion: .3, semilla: 3 })), { ratings: { jugadores: 30, conRating: 28 } })) &&
       /Sin rating/.test(informe("x", correr(ligaInventada({ temporadas: [2023, 2024], dispersion: .3, semilla: 3 })), { ratings: { jugadores: 30, conRating: 0 } })));
}

/* ─── 7. los pedidos que llegan desde la pantalla ───────────────────── */
{
  const C = "mi-clave";
  caso("un pedido con la clave equivocada se rechaza sin gastar API",
       clasificarPedido({ clave: "otra", ligas: "94" }, C).accion === "rechazar");
  caso("y sin clave configurada en GitHub se rechaza TODO",
       clasificarPedido({ clave: "", ligas: "94" }, "").accion === "rechazar");
  const c = clasificarPedido({ clave: C, ligas: " 94, buscar:Mexico ,abc, 999999999", temporadas: "2023, 2024,2025" }, C);
  caso("de un pedido salen los ids válidos, las búsquedas y las temporadas",
       c.accion === "correr" && c.ids.join() === "94" && c.busquedas.join() === "Mexico" && c.temporadas.join() === "2023,2024,2025",
       JSON.stringify(c));
  caso("una sola temporada no alcanza (la primera solo precalienta)",
       clasificarPedido({ clave: C, ligas: "94", temporadas: "2025" }, C).accion === "rechazar");
  caso("un pedido de sumar es su propia acción",
       clasificarPedido({ clave: C, sumar_liga: 262 }, C).accion === "sumar" && clasificarPedido({ clave: C, sumar_liga: 262 }, C).liga === 262);
  caso("nunca se corren más de seis ligas por pedido",
       clasificarPedido({ clave: C, ligas: "1,2,3,4,5,6,7,8" }, C).ids.length === 6);
  const x = { id: 94, nombreLiga: "Primeira Liga", pais: "Portugal", temporadas: [2023, 2024],
    r: correr(ligaInventada({ temporadas: [2023, 2024], dispersion: .7, semilla: 5 })), ratings: { jugadores: 30, conRating: 27 }, texto: "x" };
  x.v = veredicto(x.r);
  const f = filaResultado(x);
  caso("la fila para la base lleva los números redondeados y el veredicto",
       f.liga_id === 94 && f.tipo === "liga" && typeof f.t === "number" && f.ok === true && f.ratings_con === 27 && f.temporadas === "2023,2024",
       JSON.stringify(f).slice(0, 160));
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n + (d ? "   → " + d : "")));
const mal = casos.filter(c => !c[1]).length;
console.log(linea + "\n\n" + (mal ? mal + " de " + casos.length + " MAL\n" : casos.length + " de " + casos.length + ". Todo bien.\n"));
process.exit(mal ? 1 : 0);
