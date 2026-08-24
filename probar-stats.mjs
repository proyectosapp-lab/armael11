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

/* ── 3. TODAS las tablas, no una ─────────────────────────────────────────
   La liga publica varias: el torneo terminado, el que está en curso, cada
   zona. Quedarse con una y elegirla mal —agarramos la del torneo YA
   TERMINADO— muestra algo cierto y viejo, que se ve igual de mal que algo
   falso. Van todas, y la anual calculada por nosotros va siempre.      */
{
  const apertura = { nombre: "Torneo Apertura", filas: [
    { id: 1, nom: "El primero", pj: 16, g: 10, e: 2, p: 4, gf: 30, gc: 15, pts: 32, forma: ["G","G","E"] },
    { id: 3, nom: "El tercero", pj: 16, g: 8,  e: 4, p: 4, gf: 22, gc: 18, pts: 28, forma: ["E","P","G"] },
  ]};
  const clausura = { nombre: "Clausura - Zona A", filas: [
    { id: 3, nom: "El tercero", pj: 6, g: 4, e: 1, p: 1, gf: 9, gc: 4, pts: 13, forma: ["G","G","P"] },
    { id: 1, nom: "El primero", pj: 6, g: 2, e: 2, p: 2, gf: 7, gc: 7, pts: 8,  forma: ["P","E","G"] },
  ]};
  /* Ojo con esto: `calcular` NO filtra por ronda. Cuenta lo que le dan. El
     filtro es responsabilidad de quien trae los partidos, y así queda
     escrito acá abajo para que nadie lo dé por hecho.                  */
  const regular = [...liga, ...final].filter(m => esFaseRegular(m.ronda));
  const out = calcular(regular, { tablas: [apertura, clausura] });

  caso("guarda las dos de la liga más la anual", out.tablas.length === 3,
       out.tablas.map(t => t.nombre).join(" · "));
  caso("la última es la anual y está marcada como calculada",
       out.tablas[2].nombre === "Anual" && out.tablas[2].oficial === false);
  caso("las de la liga quedan marcadas como oficiales",
       out.tablas[0].oficial === true && out.tablas[1].oficial === true);
  caso("cada tabla conserva SUS propios puntos",
       out.tablas[0].filas.find(f => f.id === 1).pts === 32 &&
       out.tablas[1].filas.find(f => f.id === 1).pts === 8);
  caso("y su propio orden", out.tablas[1].filas[0].id === 3);
  caso("la anual, ya filtrada, no cuenta la final",
       out.tablas[2].filas.every(f => f.pj === 3),
       out.tablas[2].filas.map(f => f.pj).join(","));
  caso("y si NO se filtra antes, la final se cuela: el filtro es del que trae",
       calcular([...liga, ...final]).tablas[0].filas.some(f => f.pj === 4));
  caso("las rachas salen de los partidos, no de la tabla elegida",
       out.rachas.invictos.length > 0 && out.records.masGoleador.length > 0);
}

/* Sin tablas de la liga, queda la anual sola y no se rompe nada. */
{
  const out = calcular(liga);
  caso("sin /standings queda solo la anual", out.tablas.length === 1 && out.tablas[0].nombre === "Anual");
  caso("y el campo `oficial` dice que no lo es", out.oficial === false);
  caso("`tabla` sigue existiendo para lo que ya la leía", Array.isArray(out.tabla) && out.tabla.length === 4);
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
