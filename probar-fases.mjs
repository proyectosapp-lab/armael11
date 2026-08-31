/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LAS FASES
     node probar-fases.mjs

   No toca la red. Prueba las dos decisiones que arman el torneo: quién
   clasifica y en qué zona cae. Son las dos que, si están mal, dejan gente
   afuera sin que falle nada — y el que quedó afuera injustamente no vuelve
   a jugar.
   ══════════════════════════════════════════════════════════════════════════ */
import { clasifican, sinRepetidos, serpentina } from "./fases-reglas.mjs";

const casos = [];
const caso = (n, ok, det = "") => casos.push([n, ok, det]);

const grupo = (nombre, ...gente) => ({ nombre, gente });
const conPuntos = tabla => p => tabla[p] ?? 0;

/* ─── QUIÉN PASA ─────────────────────────────────────────────────────────── */
{
  const g = [grupo("Los pibes", "a", "b", "c"), grupo("La oficina", "d", "e")];
  const P = conPuntos({ a: 50, b: 30, c: 10, d: 44, e: 80 });
  const cl = clasifican(g, P, 1);
  caso("pasa el primero de cada grupo",
       cl.length === 2 && cl.some(c => c.perfil === "a") && cl.some(c => c.perfil === "e"),
       cl.map(c => c.perfil).join(","));
  caso("y se anota de qué torneo viene",
       cl.find(c => c.perfil === "a").viene_de === "Los pibes");
}

/* LA REGLA QUE MÁS IMPORTA. Cualquier desempate que inventáramos le sacaría
   el lugar a alguien que hizo exactamente los mismos puntos. */
{
  const g = [grupo("Empatados", "a", "b", "c")];
  const cl = clasifican(g, conPuntos({ a: 50, b: 50, c: 10 }), 1);
  caso("si dos empatan en el primer puesto, pasan los dos", cl.length === 2,
       cl.map(c => c.perfil + ":" + c.puntos).join(", "));

  const tres = clasifican([grupo("Todos iguales", "a", "b", "c")],
                          conPuntos({ a: 7, b: 7, c: 7 }), 1);
  caso("si empatan todos, pasan todos: no hay a quién dejar afuera", tres.length === 3);

  const dos = clasifican([grupo("Dos y empate", "a", "b", "c", "d")],
                         conPuntos({ a: 90, b: 50, c: 50, d: 4 }), 2);
  caso("con dos por grupo, el empate en el segundo puesto pasa entero",
       dos.length === 3, dos.map(c => c.perfil).join(","));
}

{
  const vacio = clasifican([grupo("Nadie")], conPuntos({}), 1);
  caso("un grupo sin gente no clasifica a nadie ni rompe nada", vacio.length === 0);

  const cero = clasifican([grupo("Nadie jugó", "a", "b")], conPuntos({}), 1);
  caso("un grupo donde nadie sumó puntos igual tiene ganadores empatados en cero",
       cero.length === 2);
}

/* ─── EL QUE GANA DOS GRUPOS ─────────────────────────────────────────────── */
{
  const cl = clasifican([grupo("Uno", "a", "b"), grupo("Otro", "a", "c")],
                        conPuntos({ a: 99, b: 1, c: 1 }), 1);
  caso("el que gana dos grupos aparece dos veces antes de limpiar", cl.length === 2);
  const u = sinRepetidos(cl);
  caso("y una sola vez después: jugar contra uno mismo no es un torneo",
       u.length === 1 && u[0].perfil === "a");
}

/* ─── LAS ZONAS ──────────────────────────────────────────────────────────── */
{
  /* Doce clasificados ordenados de mejor a peor, con 4 por zona: la
     serpentina tiene que repartir los tres mejores en zonas distintas. */
  const gente = Array.from({ length: 12 }, (_, i) =>
    ({ perfil: "p" + i, puntos: 100 - i, viene_de: "g" + i }));
  const z = serpentina(gente, 4);
  caso("doce clasificados con cupo de cuatro dan tres zonas", z.length === 3,
       z.map(x => x.length).join("/"));
  caso("y quedan parejas en cantidad", z.every(x => x.length === 4));
  caso("los tres mejores caen en zonas DISTINTAS: eso es la serpentina",
       new Set(z.map(x => x[0].perfil)).size === 3,
       z.map(x => x[0].perfil).join(","));

  /* La prueba de fuego de la serpentina: la suma de puntos de cada zona
     tiene que ser casi igual. Cortando la lista, la primera zona sumaría
     mucho más que la última. */
  const sumas = z.map(x => x.reduce((s, c) => s + c.puntos, 0));
  caso("y la fuerza queda repartida, no amontonada en la primera",
       Math.max(...sumas) - Math.min(...sumas) <= 4, sumas.join(" / "));

  /* Con menos gente que un cupo, una sola zona. */
  const pocos = serpentina(gente.slice(0, 3), 10);
  caso("con pocos clasificados se arma una sola zona",
       pocos.length === 1 && pocos[0].length === 3);
  caso("nadie se pierde en el reparto, nunca",
       serpentina(gente, 5).flat().length === 12);
}

/* ─── QUE LOS NÚMEROS DE LA CONFIGURACIÓN SEAN LOS QUE DECIMOS ──────────── */
{
  const cfg = JSON.parse(
    (await import("node:fs")).readFileSync(new URL("./fases.json", import.meta.url)));
  caso("fases.json tiene los cuatro números",
       ["fechasPorFase", "clasificanPorGrupo", "porZona", "minimoGrupos"]
         .every(k => Number.isFinite(cfg[k])));
  caso("y cada uno está explicado en el propio archivo",
       ["fechasPorFase", "clasificanPorGrupo", "porZona", "minimoGrupos"]
         .every(k => typeof cfg["_" + k] === "string" && cfg["_" + k].length > 40));
  caso("no se cruza a nadie con menos de dos grupos: sería el mismo grupo",
       cfg.minimoGrupos >= 2);
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n +
  (ok || !d ? "" : "   → " + d)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
