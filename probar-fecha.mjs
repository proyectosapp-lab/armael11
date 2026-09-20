/* La elección de la fecha, probada sin salir a la API.

   IMPORTA la función de verdad en vez de copiarla acá: una regla copiada en
   la prueba es una regla que tarde o temprano deja de ser la que corre, y
   justamente esta ya se equivocó una vez. */
import { strict as assert } from "node:assert";
import { partidosDeLaFecha, fechaEntera, rondaDe } from "./fecha-de-liga.mjs";
const elegir = l => partidosDeLaFecha(l, { minimo: 4, tope: 15 });
const p = (r,i) => ({ fixture:{id:i}, league:{round:r} });
let n = 0; const ok = (t,c,d="") => { assert.ok(c, t + (d ? " — " + d : "")); n++; };

/* Una fecha entera de la Premier: diez, y ni uno de la siguiente. */
{
  const l = [...Array(10)].map((_,i)=>p("Regular Season - 5", i))
    .concat([...Array(10)].map((_,i)=>p("Regular Season - 6", 100+i)));
  const r = elegir(l);
  ok("publica la fecha entera", r.length === 10);
  ok("y ninguno de la que viene", r.every(f => rondaDe(f) === "Regular Season - 5"));
}
/* El caso real del 19/9: media fecha ya empezó. Cinco es menos que doce, y
   el .slice viejo rellenaba con siete de la fecha 6. */
{
  const l = [...Array(5)].map((_,i)=>p("Regular Season - 5", i))
    .concat([...Array(10)].map((_,i)=>p("Regular Season - 6", 100+i)));
  const r = elegir(l);
  ok("con media fecha jugada publica lo que queda de ESA fecha", r.length === 5);
  ok("sin colar partidos de tres semanas después",
     r.every(f => rondaDe(f) === "Regular Season - 5"));
}
/* Domingo a la noche: quedan dos. Una lista de dos no sirve. */
{
  const l = [...Array(2)].map((_,i)=>p("Regular Season - 5", i))
    .concat([...Array(10)].map((_,i)=>p("Regular Season - 6", 100+i)));
  const r = elegir(l);
  ok("con la fecha casi jugada suma la siguiente", r.length === 12);
  ok("empezando por los que faltan de la que está en curso",
     rondaDe(r[0]) === "Regular Season - 5" && rondaDe(r[2]) === "Regular Season - 6");
}
/* Argentina: treinta equipos, quince partidos. El tope viejo era doce y le
   cortaba tres partidos a cada fecha. */
{
  const l = [...Array(15)].map((_,i)=>p("Regular Season - 12", i));
  ok("una fecha argentina entra entera: quince partidos", elegir(l).length === 15);
}
/* Sin ronda -alguna copa- todo cae en la misma cadena vacía y queda el
   tope, que es exactamente lo que había antes. Ninguna liga queda peor. */
{
  const l = [...Array(30)].map((_,i)=>p("", i));
  ok("sin ronda no se rompe: queda el tope de siempre", elegir(l).length === 15);
}
ok("sin partidos por jugar devuelve vacío", elegir([]).length === 0);

/* ══════════════════════════════════════════════════════════════════════════
   LA FECHA ENTERA

   Fausto, 20/9/2026: "se borró toda la fecha en juego, en la liga de España
   aparece directamente la próxima fecha".

   El archivo de liga traía solo los que no habían empezado, así que la
   fecha se borraba sola a medida que se jugaba. Estuvo así siempre: no se
   notaba porque el paso se rehacía una vez por día y el archivo quedaba
   congelado. Al arreglar el sello, el archivo empezó a rehacerse cuando
   cambiaba el código y el problema de fondo quedó a la vista.
   ══════════════════════════════════════════════════════════════════════════ */
const pj = (r, i, cuando = "2026-09-20T16:00:00+00:00") =>
  ({ fixture:{ id:i, date:cuando }, league:{ round:r } });

/* El caso exacto de LaLiga: ocho jugados, dos por jugar. */
{
  const jugados  = [...Array(8)].map((_,i)=>pj("Regular Season - 5", i,
    "2026-09-19T16:00:00+00:00"));
  const faltan   = [...Array(2)].map((_,i)=>pj("Regular Season - 5", 50+i,
    "2026-09-20T19:00:00+00:00"));
  const siguiente= [...Array(10)].map((_,i)=>pj("Regular Season - 6", 100+i,
    "2026-09-27T16:00:00+00:00"));
  const todos = [...jugados, ...faltan, ...siguiente];
  /* Lo que ve la función: TODOS los que no empezaron, de la fecha en curso
     y de las que vienen. Es lo que le pasa `ligas-api.mjs`. */
  const proximos = [...faltan, ...siguiente];

  /* Lo que pasaba antes: dos es menos que el piso de cuatro, así que le
     pegaba la fecha siguiente al lado. */
  const viejo = partidosDeLaFecha(proximos, { minimo: 4, tope: 15 });
  ok("ANTES: con dos que faltan, se colaba la fecha siguiente",
     viejo.length === 12, "salieron " + viejo.length);

  /* Lo que pasa ahora: el piso mide la fecha, que son diez. */
  const ahora = partidosDeLaFecha(proximos, { minimo: 4, tope: 15, todos });
  ok("el piso mide la fecha entera, no lo que queda de ella", ahora.length === 2);
  ok("y no se cuela ni uno de la que viene",
     ahora.every(f => rondaDe(f) === "Regular Season - 5"));

  const entera = fechaEntera(todos, ahora);
  ok("la fecha se publica completa: los jugados también", entera.length === 10);
  ok("ordenada por hora, que es como se lee una fecha",
     entera[0].fixture.id === 0 && entera[9].fixture.id === 51);
  ok("sin un solo partido de la fecha siguiente",
     entera.every(f => rondaDe(f) === "Regular Season - 5"));
}

/* La fecha que todavía no empezó tiene que quedar exactamente igual que
   antes: este arreglo no puede cambiar lo que se ve un viernes. */
{
  const faltan = [...Array(10)].map((_,i)=>pj("Regular Season - 7", i));
  const todos = [...faltan, ...[...Array(10)].map((_,i)=>pj("Regular Season - 8", 100+i))];
  const elegidos = partidosDeLaFecha(todos, { minimo: 4, tope: 15, todos });
  ok("una fecha sin empezar sale igual que siempre", elegidos.length === 10);
  ok("y la entera son los mismos diez",
     fechaEntera(todos, elegidos).length === 10);
}

/* Una fecha de verdad chica -una copa con tres partidos- sigue mezclando:
   ahí el piso hace lo que siempre hizo. */
{
  const chica = [...Array(3)].map((_,i)=>pj("Octavos", i));
  const otra  = [...Array(4)].map((_,i)=>pj("Cuartos", 100+i));
  const todos = [...chica, ...otra];
  ok("una fecha que DE VERDAD es chica sigue sumando la siguiente",
     partidosDeLaFecha(todos, { minimo: 4, tope: 15, todos }).length === 7);
}

ok("sin fecha elegida no hay fecha entera", fechaEntera([pj("A",1)], []).length === 0);
ok("y sin calendario tampoco", fechaEntera(null, [pj("A",1)]).length === 0);
console.log("fecha de liga: " + n + " pruebas, todo bien");
