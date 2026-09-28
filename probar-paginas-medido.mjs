/* ══════════════════════════════════════════════════════════════════════════
   PRUEBAS DE LAS PÁGINAS DE "ESTÁ MEDIDO" — sin red, sin navegador.

     node probar-paginas-medido.mjs

   Lo que se cuida acá es lo que hace que estas páginas existan: que tengan
   texto de verdad (el rechazo de AdSense fue por 65 palabras), que no
   afirmen nada que no esté medido, que no se conviertan en un sitio de
   pronósticos, y que un número publicado en un lado no diga otra cosa en
   otro.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { paginasMedido, mapaDelSitio, robots, gruposDeLigas, PAGINAS,
         MEDIDO, carasDe, caras } from "./paginas-medido.mjs";

let ok = 0, mal = 0;
const caso = (nombre, cond, detalle = "") => {
  if (cond) { ok++; console.log("  ok    " + nombre); }
  else { mal++; console.log("  MAL   " + nombre + (detalle ? "  →  " + detalle : "")); }
};
const aca = p => new URL(p, import.meta.url);
const leer = f => JSON.parse(readFileSync(aca(f), "utf8"));
const texto = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

const RAIZ = "https://armael11.com";
const LIGAS = leer("./ligas.json").ligas;
/* `stats-liga.json` lo genera la corrida, y estas pruebas corren ANTES que
   ella y son obligatorias: si el archivo no está, reventar acá frenaría la
   publicación entera por un dato que todavía no se bajó. Así que, si falta,
   se usa una foto chica con la misma forma. Lo que se prueba es el
   mecanismo, no los números de hoy. */
const FOTO = {
  temporada: 2026, partidosJugados: 330,
  promedios: { golesPorPartido: 2.06, local: 44.2, empate: 27.6, visita: 28.2, ceroACero: 41 },
  tabla: ["Argentinos JRS","Boca Juniors","River Plate","Racing Club","Independiente","San Lorenzo",
          "Velez Sarsfield","Estudiantes L.P.","Talleres Cordoba","Belgrano Cordoba","Lanus","Huracan",
          "Rosario Central","Newells Old Boys","Instituto Cordoba","Union Santa Fe","Tigre","Banfield",
          "Platense","Godoy Cruz","Defensa Y Justicia","Barracas Central"].map(nom => ({ nom })),
};
let STATS;
try { STATS = leer("./stats-liga.json"); if (!STATS || !STATS.promedios) throw 0; }
catch (e) { STATS = FOTO; console.log("  (sin stats-liga.json: uso la foto de prueba)"); }
const P = paginasMedido({ RAIZ, ligas: LIGAS, stats: STATS });
const por = a => P.find(p => p.archivo === a);

console.log("\n── las cinco ──");
caso("salen las cinco páginas", P.length === 5 && PAGINAS.every(x => por(x.archivo)),
     P.map(p => p.archivo).join(", "));
for (const p of P) {
  const t = texto(p.html);
  /* EL NÚMERO QUE LAS JUSTIFICA. La portada tenía 65 palabras. Desde el
     27/9 son más cortas a propósito —"parecía el prospecto de un
     medicamento"—, pero siguen siendo páginas de texto y no cascarones. */
  caso(p.archivo + ": más de 200 palabras de texto", t.split(" ").length > 200,
       t.split(" ").length + " palabras");
  /* Y cada una invita a usar la app: el que la lee tiene que salir con
     ganas de simular, y tiene que tener dónde tocar. */
  caso(p.archivo + ": tiene su botón al simulador", /class="ir" href="\/"/.test(p.html));
  caso(p.archivo + ": título, descripción y dirección canónica",
       /<title>[^<]{10,}<\/title>/.test(p.html) &&
       /<meta name="description" content="[^"]{60,}"/.test(p.html) &&
       p.html.includes('<link rel="canonical" href="' + RAIZ + "/" + p.archivo + '">'));
  caso(p.archivo + ": se deja indexar", p.html.includes('content="index,follow"'));
  caso(p.archivo + ": ni undefined, ni NaN, ni null en pantalla",
       !/\bundefined\b|\bNaN\b|\bnull\b/.test(t), (t.match(/.{30}(undefined|NaN|null).{30}/) || [""])[0]);
}

console.log("\n── lo que no se dice ──");
/* Las mismas de la marca, más las que traen a las casas de apuestas por la
   ventana. "Odds" y "betting" entran porque un título de un paper en inglés
   las mete sin que nadie lo note, y el clasificador de Meta no distingue. */
const PROHIBIDAS = ["cuota", "cuotas", "pick", "fija", "value", "acertá", "ganale a la casa",
  "eficacia", "el único", "casa de apuestas", "casas de apuestas", "betting", "odds", "apostá",
  /* 28/9: Apple leyó la app como relacionada con apuestas (2.3.6). Estas
     páginas viajan adentro del .ipa. Ni negada: "no tiene apuestas" también
     pone el tema sobre la mesa, como "sin cuotas" con Meta. */
  "apuesta", "apuestas", "apostar", "juego de azar", "juegos de azar"];
for (const p of P) {
  const t = texto(p.html).toLowerCase();
  const hay = PROHIBIDAS.filter(w => new RegExp("\\b" + w + "\\b", "i").test(t));
  caso(p.archivo + ": ninguna palabra prohibida", hay.length === 0, hay.join(", "));
}
/* Decisión de Fausto (27/9): el número de un partido por jugar vive en el
   simulador. Estas páginas no reciben fixtures, así que no pueden
   filtrarlo; esto mira que tampoco aparezca un equipo con un porcentaje. */
{
  /* Los nombres salen de la tabla, que está siempre en el repo. Con una
     lista vacía esta prueba pasaría sola, así que se exige que haya. */
  const equipos = (STATS.tabla || []).map(f => f.nom).filter(n => n && n.length >= 4);
  caso("hay equipos contra los cuales mirar", equipos.length >= 20, String(equipos.length));
  const todo = P.map(p => texto(p.html)).join(" ");
  const con = equipos.filter(e => new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".{0,40}\\d+ ?%").test(todo));
  caso("ningún equipo aparece con un porcentaje", con.length === 0, con.join(", "));
}

console.log("\n── los números, iguales en todos lados ──");
caso("ninguna cifra publicada en monedas pasa la cuenta exacta",
     MEDIDO.monedas.every(([, t, c]) => c <= carasDe(t)),
     MEDIDO.monedas.map(([n, t, c]) => n + " " + c + "/" + carasDe(t)).join(" · "));
/* La del carrete de Instagram. Si esto cambia, cambia en los dos lados. */
caso("Portugal se publica 90, igual que en el carrete", caras("Portugal") === 90);
caso("y Argentina 54", caras("Argentina") === 54);
caso("la página de la moneda dice 90 y no 91",
     /90 caras de 100/.test(por("es-suerte.html").html) && !/91 caras/.test(por("es-suerte.html").html));
caso("el acierto de la prueba limpia es el de siempre",
     por("el-techo-del-futbol.html").html.includes("52,9%") &&
     por("como-funciona.html").html.includes("52,9%"));

console.log("\n── las ligas, sin inventar puestos ──");
const G = gruposDeLigas(LIGAS);
const en = (grupo, pais) => G[grupo].some(l => l.pais === pais);
caso("Portugal e Italia arriba", en("mejor", "Portugal") && en("mejor", "Italia"));
caso("Argentina en la más brava", en("brava", "Argentina"));
/* 0,0538 contra 0,0531: menos que el margen de la medición. */
caso("Perú y Alemania en el mismo grupo: no hay un tercer puesto inventado",
     ["mejor", "peloton", "dificiles", "brava"].some(g => en(g, "Perú") && en(g, "Alemania")));
caso("las once ligas quedan en algún grupo",
     Object.values(G).reduce((a, g) => a + g.length, 0) === LIGAS.length);

console.log("\n── la liga argentina ──");
{
  const h = por("liga-argentina.html").html;
  caso("con los datos de la temporada, dice el porcentaje de empates",
       h.includes(String(STATS.promedios.empate).replace(".", ",") + "%"));
  const sin = paginasMedido({ RAIZ, ligas: LIGAS, stats: null })
    .find(p => p.archivo === "liga-argentina.html");
  const t = texto(sin.html);
  caso("sin los datos de la temporada, la página sale igual y sin agujeros",
       t.split(" ").length > 110 && !/undefined|NaN/.test(t), t.split(" ").length + " palabras");
  caso("nombra a los árbitros entre lo que el modelo no ve, no como causa",
       /no contempla el factor árbitros/i.test(texto(h)));
}

console.log("\n── los links ──");
{
  const existen = new Set(["", ...PAGINAS.map(p => p.archivo), "privacidad.html", "consulta/"]);
  const rotos = [];
  for (const p of P)
    for (const m of p.html.matchAll(/href="\/([^"#?]*)"/g))
      if (!existen.has(m[1])) rotos.push(p.archivo + " → /" + m[1]);
  caso("todos los links internos llevan a algo que existe", rotos.length === 0, rotos.join(" · "));
  /* Es por donde las encuentran el buscador y el empaquetador del iPhone,
     que arma el .ipa siguiendo los links desde la portada. */
  const tpl = readFileSync(aca("./app.tpl.html"), "utf8");
  const faltan = PAGINAS.filter(p => !tpl.includes('href="/' + p.archivo + '"'));
  caso("el pie de la app enlaza las cinco", faltan.length === 0, faltan.map(p => p.archivo).join(", "));
}

console.log("\n── el mapa y robots.txt ──");
{
  const m = mapaDelSitio(RAIZ, "2026-09-27");
  caso("el mapa tiene la portada y las cinco",
       m.includes("<loc>" + RAIZ + "/</loc>") && PAGINAS.every(p => m.includes(RAIZ + "/" + p.archivo)));
  /* Las páginas de club son el feed: titulares de otros medios. No se las
     ofrecemos al buscador como lo mejor del sitio. */
  caso("y no tiene páginas de club, ni el panel de control, ni el backtest",
       !/talleres|control\.html|backtest\.html|gracias\.html/.test(m));
  caso("sin dominio no hay mapa (sería de direcciones relativas)", mapaDelSitio("") === "");
  const r = robots(RAIZ);
  caso("robots.txt deja pasar y dice dónde está el mapa",
       /User-agent: \*/.test(r) && /Allow: \//.test(r) && r.includes("Sitemap: " + RAIZ + "/sitemap.xml") &&
       !/Disallow: \/\s*$/m.test(r));
}

console.log("\n" + "─".repeat(66));
console.log(mal ? `\n${mal} MAL de ${ok + mal}.` : `\n${ok} de ${ok}. Todo bien.`);
process.exit(mal ? 1 : 0);
