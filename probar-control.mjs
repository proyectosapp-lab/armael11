/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA PANTALLA DE CONTROL
     node probar-control.mjs
   No toca la red.

   POR QUÉ ESTO EXISTE. Con estos números se deciden gastos de plata —cuánto
   salió cada visita, si la campaña sirvió— y se va a contestar el rechazo de
   Google. Un panel que divide mal no avisa: muestra un número plausible y
   alguien toma una decisión con él.

   La regla que se prueba en casi todos los casos es la misma: **no inventar
   un número cuando el dato no alcanza**. Un cero y un "no sé" se parecen
   demasiado en una tabla y significan cosas opuestas. Eso fue exactamente lo
   que pasó con el contador de uso entre el 19 y el 20 de septiembre: la
   tabla decía cero y lo que pasaba era que no estábamos contando.
   ══════════════════════════════════════════════════════════════════════════ */
import { strict as assert } from "node:assert";
import { porcentaje, serieDeDias, diaSiguiente, resumenDeUso, embudo,
         alturas, texto, diaCorto, CTL_META_TESTERS, embudoSacavos, plataPorMedio } from "./control.js";

let n = 0;
const ok = (t, c, d = "") => { assert.ok(c, t + (d ? " — " + d : "")); n++; };

/* ─── el porcentaje ─────────────────────────────────────────────────────── */
ok("un porcentaje normal", porcentaje(26, 100) === 26);
ok("redondea a los decimales que se le piden", porcentaje(1, 3, 1) === 33.3);
ok("y sin decimales redondea entero", porcentaje(1, 3) === 33);
ok("SOBRE CERO NO INVENTA: devuelve null, no cero", porcentaje(0, 0) === null);
ok("y con total nulo tampoco", porcentaje(5, null) === null && porcentaje(5, undefined) === null);
ok("cero sobre algo sí es cero: ahí el dato existe", porcentaje(0, 40) === 0);

/* ─── los días ──────────────────────────────────────────────────────────── */
ok("el día siguiente es el día siguiente", diaSiguiente("2026-09-20") === "2026-09-21");
ok("y cruza el fin de mes", diaSiguiente("2026-09-30") === "2026-10-01");
ok("y el fin de año", diaSiguiente("2026-12-31") === "2027-01-01");
/* El día llega ya calculado en hora argentina desde la base. Si lo
   pasáramos por `Date` en horario local se correría tres horas y el domingo
   a la noche cambiaría de día — justo cuando se juega. */
ok("no se corre de día por el huso horario",
   diaSiguiente("2026-09-20") === "2026-09-21" && diaCorto("2026-09-20") === "dom 20/09");

/* ─── LA SERIE SIN AGUJEROS ─────────────────────────────────────────────
   La base devuelve solo los días que tuvieron algo. Un gráfico armado con
   eso miente: dos días con uso separados por una semana muerta se dibujan
   pegados y parece que el uso fue parejo.                               */
{
  const filas = [{ dia: "2026-09-18", app_abrio: 9, app_simulo: 5, web_abrio: 30, web_simulo: 12 },
                 { dia: "2026-09-20", app_abrio: 14, app_simulo: 8, web_abrio: 41, web_simulo: 19 }];
  const s = serieDeDias(filas, "2026-09-17", "2026-09-20");
  ok("la serie trae TODOS los días del período", s.length === 4);
  ok("en orden", s.map(d => d.dia).join(",") === "2026-09-17,2026-09-18,2026-09-19,2026-09-20");
  ok("el día sin dato queda marcado como vacío",
     s[0].vacio === true && s[2].vacio === true && s[1].vacio === false);
  ok("y un día vacío vale cero para las cuentas, no undefined",
     s[2].app_abrio === 0 && s[2].web_simulo === 0);
  ok("los días con dato traen lo suyo", s[3].app_abrio === 14 && s[3].web_abrio === 41);
  ok("sin fechas no devuelve nada en vez de romperse",
     serieDeDias(filas, null, "2026-09-20").length === 0);
  ok("y un rango al revés tampoco",
     serieDeDias(filas, "2026-09-20", "2026-09-17").length === 0);
}

/* ─── EL NÚMERO CON EL QUE SE DISCUTE EL RECHAZO DE GOOGLE ──────────────── */
{
  const s = serieDeDias([
    { dia: "2026-09-18", app_abrio: 12 },
    { dia: "2026-09-19", app_abrio: 3 },
    { dia: "2026-09-20", app_abrio: 15 },
  ], "2026-09-18", "2026-09-20");
  const r = resumenDeUso(s);
  ok("cuenta los días que llegaron a la meta, no si llegó alguna vez",
     r.dias_con_meta === 2, "dio " + r.dias_con_meta);
  ok("la meta por defecto es la que pide Google", r.meta === 12 && CTL_META_TESTERS === 12);
  ok("y se puede pedir otra", resumenDeUso(s, 15).dias_con_meta === 1);
  ok("el mejor día es el mejor día", r.mejor_dia.dia === "2026-09-20");
  ok("los totales suman", r.app_abrio_total === 30);
  ok("cuenta cuántos días tienen dato de verdad", r.dias_con_dato === 3 && r.dias === 3);
  ok("sin serie no hay resumen inventado", resumenDeUso([]) === null && resumenDeUso(null) === null);

  /* El caso que importa entender: quince días de los cuales catorce están
     vacíos NO es una prueba de quince días. */
  const flaca = serieDeDias([{ dia: "2026-09-20", app_abrio: 40 }], "2026-09-06", "2026-09-20");
  const rf = resumenDeUso(flaca);
  ok("un solo día bueno en quince no es una prueba de quince días",
     rf.dias === 15 && rf.dias_con_dato === 1 && rf.dias_con_meta === 1);
}

/* ─── EL EMBUDO DE UNA CAMPAÑA ─────────────────────────────────────────── */
{
  const c = { codigo: "ig1", llegaron: 200, simularon: 50, instalaron: 8, cuentas: 4 };
  const e = embudo(c, 10000);
  ok("el porcentaje que simuló", e.simulo_pct === 25);
  ok("el costo por visita", e.costo_visita === 50);
  ok("y el que de verdad importa, el costo por simulación", e.costo_simulacion === 200);
  ok("y por cuenta", e.costo_cuenta === 2500);

  /* SIN GASTO CARGADO NO HAY COSTO. Poner cero sería decir que la campaña
     fue gratis, que es lo contrario de "no sé cuánto salió". */
  const sinGasto = embudo(c, null);
  ok("sin el gasto cargado, los costos son null y no cero",
     sinGasto.costo_visita === null && sinGasto.costo_simulacion === null);
  ok("pero los porcentajes se calculan igual", sinGasto.simulo_pct === 25);
  ok("un gasto en blanco es lo mismo que no cargarlo",
     embudo(c, "").costo_visita === null);

  const vacia = embudo({ codigo: "ig2" }, 5000);
  ok("una campaña sin una sola llegada no divide por cero",
     vacia.simulo_pct === null && vacia.costo_visita === null);
  ok("y sus números son cero, que es lo que son",
     vacia.llegaron === 0 && vacia.simularon === 0);
  ok("sin código no se queda sin nombre", vacia.codigo === "ig2" && embudo(null, 1).codigo === "?");
  ok("los números que vienen como texto se leen igual",
     embudo({ codigo:"x", llegaron:"200", simularon:"50" }, "10000").costo_visita === 50);
}

/* ─── LAS BARRAS ────────────────────────────────────────────────────────── */
{
  const s = serieDeDias([{ dia:"2026-09-18", app_abrio:5 }, { dia:"2026-09-20", app_abrio:20 }],
                        "2026-09-18", "2026-09-20");
  const a = alturas(s, "app_abrio");
  ok("la barra más alta llega al tope", a[2].alto === 100);
  ok("y las otras son proporcionales al máximo, no a cien", a[0].alto === 25);
  /* Una rayita mínima donde no pasó nada es un día que parece que pasó
     algo. Cero se dibuja como cero. */
  ok("un día en cero dibuja una barra de cero", a[1].alto === 0 && a[1].valor === 0);
  ok("con todo en cero no divide por cero",
     alturas(serieDeDias([], "2026-09-18", "2026-09-19"), "app_abrio").every(d => d.alto === 0));
  ok("sin serie no rompe", alturas(null, "app_abrio").length === 0);
}

/* ─── LA RAYA ───────────────────────────────────────────────────────────── */
ok("un null se escribe como una raya", texto(null) === "—" && texto(undefined) === "—");
ok("y un número como el número", texto(26) === "26" && texto(26, "%") === "26%");
ok("un cero NO es una raya: el cero es un dato", texto(0) === "0");
ok("un infinito tampoco se muestra", texto(Infinity) === "—" && texto(NaN) === "—");

/* ── Sacá vos ── */
{
  const e = embudoSacavos({ codigo: "ig1", llegaron: 200, simularon: 50, cuentas: 10, pases: 4 }, "8000");
  ok("sacá vos: % que simuló y % que sacó el pase", e.simulo_pct === 25 && e.pase_pct === 2);
  ok("sacá vos: costo por pase = gasto / pases", e.costo_pase === 2000 && e.costo_simulacion === 160 && e.costo_visita === 40);
  const sin = embudoSacavos({ codigo: "ig2", llegaron: 30, simularon: 3 }, "");
  ok("sacá vos: sin gasto cargado, los costos son raya y no cero", sin.costo_pase === null && sin.costo_visita === null);
  ok("sacá vos: sin pases, el costo por pase es raya aunque haya gasto", embudoSacavos({ llegaron: 10 }, "500").costo_pase === null);
  const pl = plataPorMedio([{ medio: "Mercado Pago", cuantos: 3, monto: "8970.00", moneda: "ARS" }, { medio: "App Store", cuantos: 2, monto: null, moneda: null }]);
  ok("sacá vos: Mercado Pago con su monto en pesos", pl[0].monto === 8970 && pl[0].moneda === "ARS");
  ok("sacá vos: Apple sin monto es raya, no cero, y sin moneda", pl[1].monto === null && pl[1].moneda === null && pl[1].cuantos === 2);
}

console.log("control: " + n + " pruebas, todo bien");
