/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LOS CLUBES NUEVOS
     node probar-clubes.mjs
   No toca la red.

   Estos casos no los inventé: son titulares REALES que aparecieron en la
   corrida del 2026-08-25, en el feed equivocado. Cada uno costó un error.
   El pack de desambiguación se arma igual que en todos.mjs, leyendo
   clubes.json, así que si alguien toca los datos de un club esto lo avisa.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { construirFeed, seccionDe } from "./pipeline.mjs";

const CLUBES = JSON.parse(readFileSync(new URL("./clubes.json", import.meta.url)));

const packDe = id => {
  const club = CLUBES.find(c => c.id === id);
  return { nombre: club.nom, desambiguacion: {
    fuertes: [club.nombreCompleto, club.nom + " de " + (club.ciudad || ""), club.nom + " " + (club.ciudad || "")]
      .filter(x => x && x.trim().length > 4),
    debiles: club.debiles || [club.nom, ...club.apodos],
    corroboradores: [club.ciudad, "Liga Profesional", "Torneo Clausura"].filter(Boolean),
    bloqueadores: club.bloqueadores,
  }};
};

const AHORA = Date.parse("2026-08-25T12:00:00Z");
const hace = h => new Date(AHORA - h * 36e5).toISOString();

const NACIONAL = { nom:"Doble Amarilla", alcance:"nacional", tipo:"medio", peso:0.7, filtro:"texto", contexto:"deportes" };
const ESPN     = { nom:"ESPN Fans", alcance:"nacional", tipo:"medio", peso:0.7, filtro:"texto", contexto:"deportes" };
const PROPIA   = n => ({ nom:n, alcance:"propio", tipo:"medio", peso:0.8, filtro:"ninguno", contexto:"deportes" });

/* Corre un lote contra un club y devuelve los títulos que entraron. */
function entraron(clubId, lotes) {
  const feed = construirFeed(lotes, packDe(clubId), { ahora: AHORA });
  return feed.clusters.flatMap(c => [c.principal, ...c.tambien]).map(x => x.titulo);
}
const conVs = (clubId, lotes, frag) => entraron(clubId, lotes).some(t => t.includes(frag));

const casos = [];
const caso = (nom, ok) => casos.push([nom, ok]);

/* ── 1. ARGENTINOS ────────────────────────────────────────────────────────
   "Argentinos" es el gentilicio antes que el club. Con el nombre corto como
   señal débil, cualquier nota que dijera "clubes argentinos" entraba.     */
{
  const lote = [{ fuente: NACIONAL, items: [
    { titulo: "Platense, entre los mejores 8 de la Libertadores: dos antecedentes",
      resumen: "Es uno de los cuatro clubes argentinos que siguen en carrera",
      url: "u1", fecha: hace(2) },
    { titulo: "Argentinos Juniors visita a Lanús por la fecha 7",
      resumen: "El Bicho juega el domingo", url: "u2", fecha: hace(3) },
  ]}, { fuente: PROPIA("Argentinos Pasión"), items: [
    { titulo: "A Puro Bicho - Programa 1133", resumen: "", url: "u3", fecha: hace(1) },
  ]}];
  caso("NO entra Platense por decir 'clubes argentinos'", !conVs("argentinos", lote, "Platense"));
  caso("entra Argentinos Juniors nombrado entero",         conVs("argentinos", lote, "Argentinos Juniors visita"));
  caso("entra el programa partidario del Bicho",           conVs("argentinos", lote, "A Puro Bicho"));
}

/* ── 2. UNIÓN ─────────────────────────────────────────────────────────────
   Entraron dos notas de la UEFA en el feed del Tatengue.                  */
{
  const lote = [{ fuente: NACIONAL, items: [
    { titulo: "Aleksander Čeferin negó ser candidato a la presidencia de la UEFA",
      resumen: "La Unión Europea de Fútbol define su futuro", url: "u4", fecha: hace(2) },
    { titulo: "Unión se lo dio vuelta y complicó aún más a Aldosivi",
      resumen: "El Tatengue ganó en Santa Fe", url: "u5", fecha: hace(4) },
  ]}];
  caso("NO entra la UEFA en el feed de Unión", !conVs("union", lote, "Čeferin"));
  caso("entra Unión ganándole a Aldosivi",      conVs("union", lote, "se lo dio vuelta"));
}

/* ── 3. ESTUDIANTES DE RÍO CUARTO ─────────────────────────────────────────
   El apodo del club es el León. "Los Leones" es el seleccionado argentino
   de hockey, y ESPN le llenó el feed con hockey.                          */
{
  const lote = [{ fuente: ESPN, items: [
    { titulo: "¡PARA EMOCIONARSE! ASÍ CANTARON LOS LEONES EL HIMNO ARGENTINO",
      resumen: "El seleccionado argentino de hockey antes de la final", url:"u6", fecha: hace(5) },
    { titulo: "Estudiantes de Río Cuarto y San Lorenzo no movieron el cero",
      resumen: "Empate sin goles por el Torneo Clausura", url:"u7", fecha: hace(6) },
  ]}];
  caso("NO entra el hockey en el feed del León", !conVs("estudiantes-rc", lote, "LOS LEONES"));
  caso("entra Estudiantes de Río Cuarto",         conVs("estudiantes-rc", lote, "no movieron el cero"));
  caso("y tampoco se cuela en Estudiantes de La Plata",
       !conVs("estudiantes-lp", lote, "LOS LEONES"));
}

/* ── 4. EL MISMO MEDIO REPITIÉNDOSE ───────────────────────────────────────
   El canal de Central Córdoba subió el mismo partido de juveniles en seis
   videos, uno por división, y los seis encabezaban el feed.               */
{
  const canal = { nom:"Central Córdoba Oficial", alcance:"propio", tipo:"club",
                  peso:1, filtro:"ninguno", contexto:"deportes" };
  const div = n => ({ titulo: "(" + n + "°) División - #JuvenilesLPF | CACC vs INDEPENDIENTE",
                      resumen: "Divisiones juveniles de la Liga Profesional",
                      url: "d" + n, fecha: hace(3) });
  const feed = construirFeed([{ fuente: canal, items: [div(4), div(5), div(6)] }],
                             packDe("central-cordoba-sde"), { ahora: AHORA });
  caso("los seis videos de juveniles quedan en una sola historia", feed.clusters.length === 1);
  caso("y esa historia sigue contando como UNA fuente",
       feed.clusters[0] && feed.clusters[0].nFuentes === 1);
}

/* ── 5. LO PROPIO ANTES QUE LO NACIONAL ───────────────────────────────────
   El feed de Vélez abría con tres notas de ESPN sobre River. Las tres decían
   "Vélez", así que entraban bien: el problema era el orden.               */
{
  const propia  = { nom:"Noti Vélez", alcance:"propio", tipo:"medio", peso:0.7, filtro:"ninguno", contexto:"deportes" };
  const lote = [
    { fuente: ESPN,   items: [{ titulo:"EL ENOJO DE LOS HINCHAS DE RIVER TRAS EL EMPATE CON VÉLEZ",
                                resumen:"", url:"v1", fecha: hace(3) }]},
    { fuente: propia, items: [{ titulo:"VÉLEZ REACCIONÓ Y SE LO EMPATÓ A RIVER EN EL MONUMENTAL",
                                resumen:"", url:"v2", fecha: hace(3) }]},
  ];
  const feed = construirFeed(lote, packDe("velez"), { ahora: AHORA });
  caso("con igual peso y hora, manda la fuente propia",
       feed.clusters[0] && feed.clusters[0].principal.fuente === "Noti Vélez");
}


/* ── 6. SECCIÓN SIN ETIQUETAS ─────────────────────────────────────────────
   Los feeds de YouTube no traen categorías y ya son más de treinta fuentes.
   Todos estos títulos son reales, de la corrida del 2026-08-25.           */
{
  const s = (t) => seccionDe([], t);
  caso("(6°) División de juveniles -> reserva",
       s("(6°) División - #JuvenilesLPF | CACC vs INDEPENDIENTE") === "reserva");
  caso("Torneo de Juveniles -> reserva",
       s("Estudiantes vs. Godoy Cruz | Fecha 22 - Torneo de Juveniles 2026") === "reserva");
  caso("FORMATIVAS DE AFA -> reserva",
       s("UNIÓN vs ARGENTINOS JRS | FORMATIVAS DE AFA | JORNADA COMPLETA") === "reserva");
  caso("LOBAS -> femenino",
       s("Torneo Metropolitano - LOBAS vs ESTUDIANTES") === "femenino");
  caso("Las Matadoras -> femenino",
       s("Las Matadoras vencieron a Newell's en La Boutique") === "femenino");
  caso("Futsal no es el equipo -> institucional",
       s("Futsal AFA | Rosario Central vs Primera Junta | Primera C") === "institucional");
  caso("conferencia de prensa -> primera",
       s("Diego Martínez en conferencia de prensa, HURACÁN VS DEPORTIVO RIESTRA") === "primera");
  caso("resumen del partido -> primera",
       s("ALDOSIVI 1 - 3 UNIÓN | Resumen del partido | #TorneoMercadoLibre") === "primera");
  caso("'Primera División' NO es reserva",
       s("Talleres jugará en Primera División el año que viene") !== "reserva");
  caso("un comunicado suelto sigue siendo institucional",
       s("Ser socio está bien: experiencia en Casa Unión") === "institucional");
  caso("las etiquetas del medio siguen mandando sobre el texto",
       seccionDe(["Femenino"], "Resumen del partido | Fecha 6") === "femenino");
}

/* ── 7. LA UVE DE VÉLEZ ───────────────────────────────────────────────────
   No se puede "ver" en una prueba, pero sí se puede fijar el número. Con
   122/238 el chevron sale invertido —una Λ en vez de una V— y así estuvo
   en la planilla de aprobación hasta que Fausto lo miró. Vélez es el único
   club con este patrón: si nadie lo mira, nadie se entera.             */
{
  const app = readFileSync(new URL("./app.tpl.html", import.meta.url), "utf8");
  const cl  = readFileSync(new URL("./clubes.tpl.html", import.meta.url), "utf8");
  caso("la app dibuja la uve (antes Vélez caía al patrón por defecto)",
       /case "uve"/.test(app));
  caso("y la dibuja con la punta abajo: 58 y 302, no 122 y 238",
       /linear-gradient\(58deg/.test(app) && /linear-gradient\(302deg/.test(app) &&
       !/linear-gradient\(122deg/.test(app));
  caso("la planilla de clubes usa los mismos ángulos",
       /linear-gradient\(58deg/.test(cl) && !/linear-gradient\(122deg/.test(cl));

  const river = CLUBES.find(c => c.id === "river");
  caso("River es blanco con banda roja, no al revés",
       river.color.toUpperCase() === "#FFFFFF" && river.color2.toUpperCase() === "#E4002B",
       river.color + " / " + river.color2);
}

/* ── 8. LOS TRES QUE YA REVISÓ EL HINCHA ──────────────────────────────────
   Estos tres me hicieron ruido a mí: Huracán sin la banda, Central a
   bastones y no franja, Platense a franja y no bastones. Los tres están
   bien: Fausto los confirmó el 2026-08-26. Los clavo acá para que nadie
   —yo incluido, en otra sesión— los "corrija" de memoria. Si hay que
   cambiarlos, que lo pida un hincha, no una corazonada.                 */
{
  const P = { huracan: "liso", "rosario-central": "bastones", platense: "franja" };
  for (const [id, patron] of Object.entries(P)) {
    const c = CLUBES.find(x => x.id === id);
    caso(c.nom + " sigue como lo confirmó Fausto: " + patron,
         c.patron === patron && !!c._porqueColor, c.patron);
  }
}

/* ─── resultado ──────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([nom, ok]) => console.log("  " + (ok ? "ok    " : "MAL   ") + nom));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
