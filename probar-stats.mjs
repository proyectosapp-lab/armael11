/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LOS NÚMEROS
     node probar-stats.mjs
   No toca la red.

   Nace de comparar nuestra tabla con la que ve cualquier hincha: nos daban
   24 y 25 partidos jugados donde la oficial dice 21 y 22. La cuenta estaba
   bien; lo que estaba mal era qué partidos entraban.
   ══════════════════════════════════════════════════════════════════════════ */
import { calcular, esFaseRegular, rachasDe } from "./stats-calc.mjs";

const casos = [];
const caso = (n, ok, extra = "") => casos.push([n, ok, extra]);

/* ── 1. qué es fase regular y qué no ─────────────────────────────────────
   Nombres de ronda tal como los devuelve API-Football para Argentina.  */
{
  const regular = ["Regular Season - 1", "Regular Season - 22", "Apertura - 14",
                   "Clausura - 7", "1st Phase - 3"];
  const playoff = ["Final", "Semi-finals", "Cuartos de Final", "Octavos de Final",
                   "8th Finals", "Play-offs", "Reclasificación", "3rd Place Final",
                   "1/8 Finals", "1/4 Finals"];
  caso("las rondas de fase regular pasan", regular.every(esFaseRegular),
       regular.filter(r => !esFaseRegular(r)).join(" · "));
  caso("las de eliminación quedan afuera", playoff.every(r => !esFaseRegular(r)),
       playoff.filter(esFaseRegular).join(" · "));
  caso("una ronda vacía se toma como fase regular", esFaseRegular("") && esFaseRegular(null));
}

/* ── 2. la mezcla de fases deforma la tabla ──────────────────────────────
   Se arma un torneo chico: cuatro equipos, todos contra todos (3 partidos
   cada uno), y después una final entre dos. Los finalistas terminan con 4
   partidos y los otros con 3. Es exactamente lo que nos pasaba.        */
const pt = (id, h, a, gh, ga, ronda) => ({ id, fecha: "2026-0" + id + "-01T20:00:00+00:00",
  h, hn: "E" + h, a, an: "E" + a, gh, ga, ronda, th: null, ta: null, xh: null, xa: null });

const liga = [
  pt(1, 1, 2, 2, 0, "Regular Season - 1"),
  pt(2, 3, 4, 1, 1, "Regular Season - 1"),
  pt(3, 1, 3, 1, 0, "Regular Season - 2"),
  pt(4, 2, 4, 0, 3, "Regular Season - 2"),
  pt(5, 1, 4, 2, 2, "Regular Season - 3"),
  pt(6, 2, 3, 1, 2, "Regular Season - 3"),
];
const final = [pt(7, 1, 3, 3, 0, "Final")];

{
  const conTodo  = calcular([...liga, ...final]);
  const soloLiga = calcular(liga);
  const pjTodo   = [...new Set(conTodo.tabla.map(t => t.pj))].sort();
  const pjLiga   = [...new Set(soloLiga.tabla.map(t => t.pj))].sort();
  caso("sumando la final, unos juegan 4 y otros 3", pjTodo.join(",") === "3,4", pjTodo.join(","));
  caso("con solo la fase regular, todos juegan lo mismo", pjLiga.join(",") === "3", pjLiga.join(","));
  caso("y el filtro deja fuera la final",
       [...liga, ...final].filter(m => esFaseRegular(m.ronda)).length === 6);
}

/* ── 3. la tabla oficial manda ───────────────────────────────────────────
   Aunque nuestros partidos digan otra cosa, si la liga publica su tabla,
   los puntos y los partidos son los de ella. Lo nuestro va al lado.   */
{
  const oficial = [
    { id: 3, nom: "El tercero", pj: 3, g: 1, e: 1, p: 1, gf: 3, gc: 4, pts: 4, forma: ["E","P","G"] },
    { id: 1, nom: "El primero", pj: 3, g: 2, e: 1, p: 0, gf: 5, gc: 2, pts: 7, forma: ["G","G","E"] },
  ];
  const out = calcular([...liga, ...final], { oficial });
  caso("la tabla queda en el orden que dio la liga",
       out.tabla.map(t => t.id).join(",") === "3,1", out.tabla.map(t => t.id).join(","));
  caso("los puntos son los de la liga, no los nuestros",
       out.tabla.find(t => t.id === 1).pts === 7);
  caso("los partidos jugados también",
       out.tabla.every(t => t.pj === 3));
  caso("pero la racha la seguimos calculando nosotros",
       out.tabla.find(t => t.id === 1).rachas?.actual.n > 0);
  caso("y el nombre de la liga le gana al nuestro",
       out.tabla.find(t => t.id === 1).nom === "El primero");
}

/* ── 4. rachas ───────────────────────────────────────────────────────────── */
{
  const h = r => r.split("").map(x => ({ r: x }));
  caso("racha actual: tres ganados al hilo", rachasDe(h("PEGGG")).actual.n === 3);
  caso("el invicto más largo cuenta empates", rachasDe(h("PEEGGP")).invicto === 4);
  caso("sin partidos no se rompe", rachasDe([]).actual.tipo === "—");
}

/* ── 5. el xG parcial no contamina ────────────────────────────────────────
   Comparar los goles de todos los partidos contra el xG de unos pocos daba
   diferencias imposibles. Con menos de cinco partidos con xG, no se opina. */
{
  const conPocos = liga.map((m, i) => i < 2 ? { ...m, xh: 1.1, xa: 0.9 } : m);
  const out = calcular(conPocos);
  caso("con dos partidos de xG no se publica diferencia",
       out.tabla.every(t => t.xgDif === null));
  /* El piso son cinco partidos CON xG por equipo, así que hace falta una
     rueda más: con seis fechas cada uno llega a seis.                  */
  const dosRuedas = [...liga, ...liga.map(m => ({ ...m, id: m.id + 10 }))]
    .map(m => ({ ...m, xh: 1.1, xa: 0.9 }));
  const out2 = calcular(dosRuedas);
  caso("con seis partidos con xG por equipo, ya se opina",
       out2.tabla.every(t => t.xgDif !== null),
       "pjXG: " + out2.tabla.map(t => t.pjXG).join(","));
  caso("y la diferencia compara goles y xG del MISMO universo",
       out2.tabla.every(t => Math.abs((t.gfXG - t.xg) - t.xgDif) < 0.05));
}

/* ─── resultado ──────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, extra]) => {
  console.log("  " + (ok ? "ok    " : "MAL   ") + n);
  if (!ok && extra) console.log("        " + extra);
});
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
