/* ══════════════════════════════════════════════════════════════════════════
   FASES — convierte los grupos de amigos en un torneo que sigue.

     node fases.mjs            cierra lo que haya que cerrar y arma lo que sigue
     node fases.mjs --ver      no escribe nada: dice qué haría

   ─── EL PROBLEMA ────────────────────────────────────────────────────────

   Un torneo de amigos se muere solo. Doce personas juegan cinco fechas,
   gana uno, y no queda nada por hacer: el que ganó no tiene contra quién
   seguir y los otros once ya saben que no ganan. La quinta fecha la juega
   la mitad.

   La solución es vieja y funciona: el grupo de amigos es la FASE
   CLASIFICATORIA. El que gana su grupo pasa a una zona donde compite
   contra ganadores de otros grupos, gente que no conoce. Y el que quedó
   afuera sigue jugando su liga igual, porque la liga no se termina.

   ─── LAS CUATRO REGLAS ──────────────────────────────────────────────────

   1. UNA FASE ES UN RANGO DE FECHAS. "De la 8 a la 12". No días: el
      fantasy ya está organizado por fechas, todo el mundo las entiende, y
      una fecha postergada no rompe nada.

   2. UNA FASE SE CIERRA CUANDO SU ÚLTIMA FECHA ESTÁ PUNTUADA. No cuando
      pasó el tiempo: cuando el puntaje existe. Cerrar una fase con la
      última fecha a medio calcular repartiría zonas con puntajes que
      todavía iban a cambiar.

   3. LOS EMPATES NO SE ROMPEN: PASAN LOS DOS. Cualquier desempate que
      inventemos —el mejor puntaje de una fecha, quién se anotó antes— es
      una regla arbitraria que le saca el lugar a alguien que hizo los
      mismos puntos. Que una zona tenga once en vez de diez no le molesta a
      nadie; que a uno lo eliminen por una regla que no sabía que existía,
      sí.

   4. LAS ZONAS SE ARMAN EN SERPENTINA. Si se cortara la lista por puntaje,
      los diez mejores clasificados quedarían todos en la zona A: nueve de
      los diez mejores afuera en la ronda siguiente, y la última zona
      ganada por alguien que hizo la mitad de puntos. La serpentina reparte
      1-2-3-4, 4-3-2-1, 1-2-3-4… y las zonas quedan parejas.

   Esto corre en GitHub con la clave de servicio. Ninguna de las tablas que
   toca tiene política de escritura: no hay otra forma de escribirlas.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { clasifican, sinRepetidos, serpentina } from "./fases-reglas.mjs";

const aca = p => new URL(p, import.meta.url);
const SERVICIO = process.env.SUPABASE_SERVICE_KEY || "";
const SOLO_VER = process.argv.includes("--ver");

const linea = "═".repeat(70);
console.log("\n" + linea + "\n  LAS FASES DEL TORNEO\n" + linea);

const SB = (() => {
  try { return (JSON.parse(readFileSync(aca("./sitio.json"))).supabase) || {}; }
  catch (e) { return {}; }
})();

const CFG = (() => {
  try { return JSON.parse(readFileSync(aca("./fases.json"))); }
  catch (e) { return {}; }
})();
const LARGO   = Math.max(1, CFG.fechasPorFase   || 5);
const PASAN   = Math.max(1, CFG.clasificanPorGrupo || 1);
const POR_ZONA = Math.max(2, CFG.porZona        || 10);
const MINIMO_GRUPOS = Math.max(2, CFG.minimoGrupos || 2);

if (!SERVICIO || !SB.url) {
  console.log("\n  Falta " + (!SERVICIO ? "SUPABASE_SERVICE_KEY" : "el backend en sitio.json") +
              ": no toco las fases.\n");
  process.exit(0);
}

const sb = async (ruta, opciones = {}) => {
  const r = await fetch(SB.url + "/rest/v1" + ruta, {
    ...opciones,
    headers: { apikey: SERVICIO, Authorization: "Bearer " + SERVICIO,
               "Content-Type": "application/json", ...(opciones.headers || {}) },
  });
  if (!r.ok) throw new Error(ruta.split("?")[0] + " → HTTP " + r.status + " " +
                             (await r.text()).slice(0, 200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

/* ─── QUÉ FECHAS ESTÁN PUNTUADAS ─────────────────────────────────────────
   La única señal que importa para cerrar una fase. Se pregunta por los
   puntajes y no por los partidos: un partido terminado cuya fecha todavía
   no se calculó no sirve para repartir zonas. */
const puntajes = await sb("/puntaje?select=perfil,fecha,puntos");
const fechasPuntuadas = [...new Set(puntajes.map(p => p.fecha))].sort((a, b) => a - b);
const ultimaPuntuada = fechasPuntuadas[fechasPuntuadas.length - 1] ?? null;

if (ultimaPuntuada == null) {
  console.log("\n  Todavía no hay ninguna fecha puntuada. Nada que hacer.\n");
  process.exit(0);
}
console.log("\n  Fechas puntuadas: " + fechasPuntuadas.join(", "));

/* ─── LA FASE EN CURSO ───────────────────────────────────────────────────
   Si no hay ninguna, se crea la primera: arranca en la fecha puntuada más
   vieja, que es desde donde hay con qué medir. */
let fases = await sb("/fase?select=*&order=numero.asc");

if (!fases.length) {
  const desde = fechasPuntuadas[0];
  const nueva = { numero: 1, nombre: "Clasificatoria", desde, hasta: desde + LARGO - 1 };
  console.log("\n  No había ninguna fase. Creo la primera: " +
              "fechas " + nueva.desde + " a " + nueva.hasta + ".");
  if (SOLO_VER) { console.log("\n  (--ver: no escribo nada)\n"); process.exit(0); }
  fases = await sb("/fase", { method: "POST",
    headers: { Prefer: "return=representation" }, body: JSON.stringify(nueva) });
}

const actual = fases.filter(f => !f.cerrada).sort((a, b) => a.numero - b.numero)[0];
if (!actual) {
  console.log("\n  Todas las fases están cerradas. El torneo terminó.\n");
  process.exit(0);
}

console.log("  Fase " + actual.numero + " (" + actual.nombre + ") · fechas " +
            actual.desde + " a " + actual.hasta);

if (ultimaPuntuada < actual.hasta) {
  console.log("\n  Falta puntuar hasta la fecha " + actual.hasta +
              " (vamos por la " + ultimaPuntuada + "). La fase sigue abierta.\n");
  process.exit(0);
}

/* ─── LOS GRUPOS DE ESTA FASE ────────────────────────────────────────────
   En la fase 1 el grupo es la liga de amigos. De la 2 en adelante, la
   zona. Es la única diferencia entre una fase y las que siguen, y por eso
   se resuelve acá arriba y el resto del archivo no vuelve a distinguirlas. */
const suma = (perfil, desde, hasta) => puntajes
  .filter(p => p.perfil === perfil && p.fecha >= desde && p.fecha <= hasta)
  .reduce((s, p) => s + Number(p.puntos || 0), 0);

let grupos = [];
if (actual.numero === 1) {
  const ligas = await sb("/liga?select=id,nombre");
  const miembros = await sb("/liga_miembro?select=liga,perfil");
  grupos = ligas.map(l => ({
    nombre: l.nombre,
    gente: miembros.filter(m => m.liga === l.id).map(m => m.perfil),
  }));
} else {
  const zonas = await sb("/zona?select=id,nombre&fase=eq." + actual.id);
  const miembros = await sb("/zona_miembro?select=zona,perfil");
  grupos = zonas.map(z => ({
    nombre: z.nombre,
    gente: miembros.filter(m => m.zona === z.id).map(m => m.perfil),
  }));
}

grupos = grupos.filter(g => g.gente.length);
console.log("  " + grupos.length + " grupo(s) en juego");

if (grupos.length < MINIMO_GRUPOS) {
  console.log("\n  Con menos de " + MINIMO_GRUPOS + " grupos no hay contra quién " +
              "cruzar a nadie. La fase queda abierta y se reintenta cuando haya más.\n");
  process.exit(0);
}

/* ─── QUIÉNES PASAN ──────────────────────────────────────────────────────
   La regla vive en `fases-reglas.mjs`, que no toca la base y por eso se
   puede probar con casos escritos a mano. Acá solo se la llama y se cuenta
   en el log lo que decidió. */
const clasificados = clasifican(grupos, p => suma(p, actual.desde, actual.hasta), PASAN);

for (const g of grupos) {
  const suyos = clasificados.filter(c => c.viene_de === g.nombre);
  console.log("    " + g.nombre + ": pasan " + suyos.length + " de " + g.gente.length +
              (suyos.length > PASAN ? " (hubo empate)" : ""));
}

const unicos = sinRepetidos(clasificados);

console.log("\n  " + unicos.length + " clasificado(s)");

if (unicos.length < 2) {
  console.log("\n  Con un solo clasificado no hay fase que armar: ya es el campeón.");
  if (!SOLO_VER)
    await sb("/fase?id=eq." + actual.id, { method: "PATCH",
      body: JSON.stringify({ cerrada: true }) });
  console.log("  Cierro la fase " + actual.numero + " y no abro otra.\n");
  process.exit(0);
}

/* ─── LAS ZONAS, EN SERPENTINA ─────────────────────────────────────────── */
const zonas = serpentina(unicos, POR_ZONA);
const cuantas = zonas.length;

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const siguiente = {
  numero: actual.numero + 1,
  nombre: actual.numero === 1 ? "Zonas" : "Zonas " + actual.numero,
  desde: actual.hasta + 1,
  hasta: actual.hasta + LARGO,
};

console.log("\n  Fase " + siguiente.numero + " (" + siguiente.nombre + ") · fechas " +
            siguiente.desde + " a " + siguiente.hasta + " · " + cuantas + " zona(s)");
zonas.forEach((z, i) => console.log("    Zona " + LETRAS[i] + ": " + z.length +
  " · " + z.map(c => c.viene_de).slice(0, 4).join(", ") + (z.length > 4 ? "…" : "")));

if (SOLO_VER) { console.log("\n  (--ver: no escribí nada)\n"); process.exit(0); }

/* ─── A LA BASE ──────────────────────────────────────────────────────────
   La fase nueva primero, las zonas después, los miembros al final, y la
   fase vieja se cierra RECIÉN cuando todo lo demás salió bien. Si algo se
   corta en el medio, la fase vieja sigue abierta y la próxima corrida
   vuelve a intentarlo: es preferible reintentar a quedarse con una fase
   cerrada y ninguna zona a la que entrar. */
const [nueva] = await sb("/fase", { method: "POST",
  headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  body: JSON.stringify(siguiente) });

for (let i = 0; i < zonas.length; i++) {
  const [z] = await sb("/zona", { method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fase: nueva.id, nombre: "Zona " + LETRAS[i] }) });
  await sb("/zona_miembro", { method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(zonas[i].map(c =>
      ({ zona: z.id, perfil: c.perfil, viene_de: c.viene_de }))) });
}

await sb("/fase?id=eq." + actual.id, { method: "PATCH",
  body: JSON.stringify({ cerrada: true }) });

console.log("\n  ✓ fase " + actual.numero + " cerrada y fase " + siguiente.numero +
            " armada con " + unicos.length + " clasificados.\n" + linea + "\n");
