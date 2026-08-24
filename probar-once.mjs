/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL ONCE AUTOMÁTICO
     node probar-once.mjs
   No toca la red.

   Nace de una queja concreta mirando el sitio publicado: "el 11 que trae está
   todo desajustado, casi todos los jugadores fuera de su puesto". Tenía razón,
   y la causa no era el modelo sino esta función.
   ══════════════════════════════════════════════════════════════════════════ */
import { autoXI, slotsDe, fuerza, penalPuesto } from "./juego.js";

const casos = [];
const caso = (n, ok, extra = "") => casos.push([n, ok, extra]);

/* Un plantel como los de verdad: dos arqueros, seis defensores, siete
   volantes y cinco delanteros, con niveles despatarrados a propósito.  */
let id = 0;
const j = (pos, rating) => ({ id: ++id, nombre: pos + rating, pos,
  ratings: [rating], mins: 270, apar: 3 });

const plantel = [
  j("G", 6.4), j("G", 6.1),
  j("D", 6.3), j("D", 6.2), j("D", 6.0), j("D", 5.9), j("D", 5.8), j("D", 5.7),
  j("M", 7.6), j("M", 7.4), j("M", 7.2), j("M", 6.9), j("M", 6.8), j("M", 6.6), j("M", 6.5),
  j("F", 8.1), j("F", 7.9), j("F", 7.5), j("F", 6.7), j("F", 6.4),
];

const cuenta = xi => xi.reduce((a, p) => (a[p ? p.slotCat : "?"] = (a[p ? p.slotCat : "?"] || 0) + 1, a), {});
const fuera = xi => xi.filter(p => p && p.pos !== p.slotCat);

/* ── 1. con plantel completo, NADIE fuera de puesto ─────────────────────── */
for (const form of ["4-4-2", "4-3-3", "3-5-2", "4-2-3-1", "5-3-2"]) {
  const xi = autoXI(plantel, form);
  const mal = fuera(xi);
  caso("con plantel completo, " + form + " sale sin nadie fuera de puesto",
       mal.length === 0,
       mal.length ? mal.map(p => p.nombre + " de " + p.slotCat).join(", ") : "");
  caso("  y con once jugadores", xi.filter(Boolean).length === 11);
}

/* ── 2. el mejor de cada puesto entra ───────────────────────────────────
   El delantero de 8.1 tiene que jugar de delantero, no de volante. Eso es
   exactamente lo que fallaba: el castigo F↔M es 0.15 y la diferencia de
   nivel contra el mejor volante es 0.5, así que ganaba el delantero.     */
{
  const xi = autoXI(plantel, "4-4-2");
  const delanteros = xi.filter(p => p && p.slotCat === "F").map(p => p.nombre);
  caso("el mejor delantero juega de delantero", delanteros.includes("F8.1"),
       "delanteros elegidos: " + delanteros.join(", "));
  const arquero = xi.find(p => p && p.slotCat === "G");
  caso("el arquero es arquero y es el mejor de los dos", arquero?.nombre === "G6.4");
  const volantes = xi.filter(p => p && p.slotCat === "M").map(p => p.nombre);
  caso("los volantes son los cuatro mejores volantes",
       ["M7.6", "M7.4", "M7.2", "M6.9"].every(n => volantes.includes(n)),
       volantes.join(", "));
}

/* ── 3. si falta gente, improvisa, pero lo mínimo ───────────────────────
   Un plantel sin delanteros tiene que improvisar los dos de arriba y nada
   más. Y para eso elige volantes, que es el cambio más barato.          */
{
  const sinF = plantel.filter(p => p.pos !== "F");
  const xi = autoXI(sinF, "4-4-2");
  const mal = fuera(xi);
  caso("sin delanteros, improvisa exactamente los 2 de arriba", mal.length === 2,
       mal.map(p => p.pos + " de " + p.slotCat).join(", "));
  caso("y los improvisados son volantes, no defensores",
       mal.every(p => p.pos === "M"), mal.map(p => p.pos).join(""));
  caso("igual son once", xi.filter(Boolean).length === 11);
}

/* ── 4. plantel escaso: no se cuelga y respeta el dibujo ───────────────── */
{
  const flaco = [j("G", 6.5), j("D", 6.5), j("D", 6.4), j("M", 6.6), j("F", 6.7)];
  const xi = autoXI(flaco, "4-4-2");
  caso("con cinco jugadores devuelve once lugares", xi.length === 11);
  caso("y no repite a nadie",
       new Set(xi.filter(Boolean).map(p => p.id)).size === xi.filter(Boolean).length);
  caso("el arquero sigue siendo el arquero",
       xi.find(p => p && p.slotCat === "G")?.pos === "G");
}

/* ── 5. los que no vienen jugando no entran de arranque ─────────────────
   Al plantel se le suman los de la lista oficial que no sumaron minutos,
   para que aparezcan y se puedan elegir a mano. Pero de esos no sabemos
   nada: no pueden desplazar a uno que viene jugando.                    */
{
  const sinMinutos = { id: 999, nombre: "Recién llegado", pos: "F",
                       ratings: [], mins: 0, apar: 0 };
  const xi = autoXI([...plantel, sinMinutos], "4-4-2");
  caso("el que no jugó nunca no entra de titular",
       !xi.some(p => p && p.id === 999),
       "delanteros: " + xi.filter(p => p && p.slotCat === "F").map(p => p.nombre).join(", "));
  const soloEl = autoXI([{ ...sinMinutos }, j("G", 6.5)], "4-4-2");
  caso("pero si no hay otro, juega", soloEl.some(p => p && p.id === 999));
}

/* ── 6. el dibujo se respeta siempre ────────────────────────────────────── */
{
  const xi = autoXI(plantel, "3-4-3");
  const c = cuenta(xi);
  caso("3-4-3 da 1 arquero, 3 defensores, 4 volantes y 3 delanteros",
       c.G === 1 && c.D === 3 && c.M === 4 && c.F === 3, JSON.stringify(c));
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
