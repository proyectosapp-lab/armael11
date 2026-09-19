/* La elección de la fecha, probada sin salir a la API.

   IMPORTA la función de verdad en vez de copiarla acá: una regla copiada en
   la prueba es una regla que tarde o temprano deja de ser la que corre, y
   justamente esta ya se equivocó una vez. */
import { strict as assert } from "node:assert";
import { partidosDeLaFecha, rondaDe } from "./fecha-de-liga.mjs";
const elegir = l => partidosDeLaFecha(l, { minimo: 4, tope: 15 });
const p = (r,i) => ({ fixture:{id:i}, league:{round:r} });
let n = 0; const ok = (t,c) => { assert.ok(c, t); n++; };

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
console.log("fecha de liga: " + n + " pruebas, todo bien");
