/* ══════════════════════════════════════════════════════════════════════════
   PRUEBAS DE LA CONSULTA — sin red, con partidos inventados.

     node probar-consulta.mjs

   Lo más importante está primero: que "lo que daba el modelo" no sepa nada
   del futuro. Si eso fallara, cada página de un partido jugado estaría
   diciendo que el modelo "lo decía" con el diario del lunes en la mano.
   ══════════════════════════════════════════════════════════════════════════ */
import { compactar, caminar, faltan, unir, sumarAnticipados, anticipar, estadisticasDe,
         puntoDe, aguja, numerosDeEquipos, esJugado, aSlug, urlPartido, PAREJO } from "./consulta-datos.mjs";
import { paginasConsulta, leerLigaJs, proximosDe } from "./consulta.mjs";
import { mapaDelSitio } from "./paginas-medido.mjs";
import { paginasRepaso, ultimoRepaso, fechasCompletas, notasHTML } from "./repaso-fecha.mjs";
import { readFileSync } from "node:fs";

let ok = 0, mal = 0;
const caso = (nombre, cond, detalle = "") => {
  if (cond) { ok++; console.log("  ok    " + nombre); }
  else { mal++; console.log("  MAL   " + nombre + (detalle ? "  →  " + detalle : "")); }
};
const texto = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

/* ── Una liga inventada: ocho equipos, todos contra todos, ida y vuelta ── */
const NOMBRES = ["Atlético Norte", "Deportivo Sur", "Unión del Este", "Sportivo Oeste",
                 "Racing del Valle", "Estudiantes Río", "Club Puerto", "Juventud Sierra"];
const IDS = NOMBRES.map((_, i) => 100 + i);
function liga(semilla = 1) {
  const ps = []; let id = 5000, dia = 0;
  let x = semilla;
  const azar = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (let vuelta = 0; vuelta < 2; vuelta++)
    for (let r = 0; r < 7; r++) {
      dia += 7;
      const f = new Date(Date.UTC(2026, 1, 1) + dia * 864e5).toISOString();
      for (let k = 0; k < 4; k++) {
        const a = (r + k) % 8, b = (r + 7 - k) % 8;
        if (a === b) continue;
        const [l, v] = vuelta ? [b, a] : [a, b];
        ps.push({ id: id++, fecha: f, ronda: "Regular Season - " + (vuelta * 7 + r + 1), estado: "FT",
                  local: IDS[l], visita: IDS[v], nl: NOMBRES[l], nv: NOMBRES[v],
                  gl: Math.floor(azar() * 4), gv: Math.floor(azar() * 3),
                  estadio: "Estadio " + NOMBRES[l], ciudad: "Ciudad", arbitro: "Árbitro " + (k + 1) });
      }
    }
  return ps;
}

console.log("\n── de la API a una fila ──");
{
  const f = compactar({
    fixture: { id: 7, date: "2026-10-03T20:00:00+00:00", status: { short: "FT" },
               venue: { name: "El Monumental", city: "Buenos Aires" }, referee: "F. Echenique, Argentina" },
    league: { round: "Clausura - 11" }, teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } },
    goals: { home: 3, away: 1 }, score: { fulltime: { home: 2, away: 1 } } });
  caso("guarda nombres, ronda, estadio y árbitro",
       f.nl === "A" && f.nv === "B" && f.ronda === "Clausura - 11" && f.estadio === "El Monumental");
  caso("el árbitro sin el país", f.arbitro === "F. Echenique", f.arbitro);
  caso("el resultado es el de los noventa, no el final con alargue", f.gl === 2 && f.gv === 1);
}

console.log("\n── LO QUE DABA EL MODELO NO SABE NADA DEL FUTURO ──");
{
  const previa = liga(3), actual = liga(7);
  const { daba } = caminar(previa, actual);
  caso("hay partidos con número", daba.size > 20, String(daba.size));
  /* Se cambian todos los resultados desde la mitad de la temporada. Lo que
     daba el modelo ANTES de la mitad no se puede mover ni un milésimo. */
  const orden = [...actual].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const corte = orden[Math.floor(orden.length / 2)].fecha;
  const otro = actual.map(p => p.fecha >= corte ? { ...p, gl: 5 - p.gl, gv: 4 - p.gv } : p);
  const { daba: daba2 } = caminar(previa, otro);
  const antes = actual.filter(p => p.fecha < corte && daba.has(p.id));
  caso("cambiar el futuro no mueve ni un número del pasado",
       antes.length > 5 && antes.every(p => JSON.stringify(daba.get(p.id)) === JSON.stringify(daba2.get(p.id))),
       antes.length + " partidos mirados");
  /* Y un partido no ve su propio resultado. */
  const uno = antes[antes.length - 1];
  const tocado = actual.map(p => p.id === uno.id ? { ...p, gl: 9, gv: 0 } : p);
  caso("un partido no ve su propio resultado",
       JSON.stringify(caminar(previa, tocado).daba.get(uno.id)) === JSON.stringify(daba.get(uno.id)));
  /* Ni el de otro que se jugó a la misma hora. */
  const mismaHora = actual.filter(p => p.fecha === uno.fecha && p.id !== uno.id && daba.has(p.id));
  if (mismaHora.length) {
    const vecino = mismaHora[0];
    const t2 = actual.map(p => p.id === uno.id ? { ...p, gl: 9, gv: 0 } : p);
    caso("ni el de otro partido a la misma hora",
         JSON.stringify(caminar(previa, t2).daba.get(vecino.id)) === JSON.stringify(daba.get(vecino.id)));
  }
  /* Sin temporada anterior, nadie tiene seis partidos previos al principio. */
  const { daba: sinPrevia } = caminar([], actual);
  const primeros = orden.slice(0, 8);
  caso("sin seis partidos previos no hay número (igual que en la medición)",
       primeros.every(p => !sinPrevia.has(p.id)));
  caso("las tres probabilidades suman 1",
       [...daba.values()].every(p => Math.abs(p.H + p.D + p.A - 1) < 0.003));
}

console.log("\n── una vez por partido ──");
{
  const ahora = Date.parse("2026-06-01T00:00:00Z");
  const ps = [
    { id: 1, fecha: "2026-05-01T20:00:00Z", estado: "FT", gl: 1, gv: 0 },
    { id: 2, fecha: "2026-05-02T20:00:00Z", estado: "FT", gl: 1, gv: 1, st: { tl: 5, tv: 3 } },
    { id: 3, fecha: "2026-05-03T20:00:00Z", estado: "FT", gl: 0, gv: 2, sti: 3 },
    { id: 4, fecha: "2026-05-31T23:00:00Z", estado: "FT", gl: 2, gv: 2 },
    { id: 5, fecha: "2026-06-05T20:00:00Z", estado: "NS", gl: null, gv: null },
    { id: 6, fecha: "2026-05-20T20:00:00Z", estado: "FT", gl: 3, gv: 1, sti: 1 },
  ];
  const f = faltan(ps, ahora);
  caso("lo que ya tiene estadísticas no se vuelve a pedir", !f.includes(2));
  caso("después de tres intentos vacíos, no se insiste más", !f.includes(3));
  caso("recién terminado se espera (la API las completa después)", !f.includes(4));
  caso("un partido por jugar no se pide", !f.includes(5));
  caso("los que faltan, primero los más nuevos", JSON.stringify(f) === "[6,1]", JSON.stringify(f));
  const u = unir([{ id: 2, st: { tl: 5, tv: 3 }, gl: 0, gv: 0 }, { id: 6, sti: 1 }],
                 [{ id: 2, gl: 1, gv: 1, estado: "FT" }, { id: 6, gl: 3, gv: 1, estado: "FT" }, { id: 9 }]);
  caso("al unir se conservan las estadísticas guardadas", u[0].st && u[0].st.tl === 5);
  caso("y los intentos", u[1].sti === 1);
  caso("pero el resultado es el que dice la API hoy", u[0].gl === 1 && u[0].gv === 1);
}

console.log("\n── lo anticipado no se pisa ──");
{
  const a = sumarAnticipados({ 10: { H: .5, D: .3, A: .2, cuando: "lunes" } },
                             { 10: { H: .1, D: .1, A: .8 }, 11: { H: .4, D: .3, A: .3 } }, "martes");
  caso("lo que dijo la primera vez queda", a[10].H === .5 && a[10].cuando === "lunes");
  caso("lo nuevo se suma con su fecha", a[11] && a[11].cuando === "martes");
  const { L } = caminar(liga(3), liga(7));
  const ant = anticipar(L, [{ id: 99, local: IDS[0], visita: IDS[1] }]);
  caso("anticipar calcula para los que faltan", ant[99] && ant[99].H > 0);
}

console.log("\n── las estadísticas de un partido ──");
{
  const r = [{ team: { id: 1 }, statistics: [{ type: "Total Shots", value: 14 }, { type: "Shots on Goal", value: 6 },
             { type: "Ball Possession", value: "58%" }, { type: "expected_goals", value: "1.84" }] },
             { team: { id: 2 }, statistics: [{ type: "Total Shots", value: 7 }, { type: "Shots on Goal", value: 2 },
             { type: "Ball Possession", value: "42%" }, { type: "expected_goals", value: "0.61" }] }];
  const st = estadisticasDe(r, 1, 2);
  caso("tiros, al arco, posesión y xG", st.tl === 14 && st.av === 2 && st.pl === 58 && st.xv === 0.61);
  const medio = JSON.parse(JSON.stringify(r)); medio[1].statistics.pop();
  caso("el xG a medias se descarta", estadisticasDe(medio, 1, 2).xl === null);
  caso("sin tiros no hay estadísticas", estadisticasDe([{ team: { id: 1 }, statistics: [] }], 1, 2) === null);
}

console.log("\n── el puntito y la aguja ──");
{
  caso("verde: ganó el que el modelo ponía arriba", puntoDe({ H: .6, D: .25, A: .15 }, 2, 0) === "verde");
  caso("naranja: el favorito claro no ganó", puntoDe({ H: .6, D: .25, A: .15 }, 0, 1) === "naranja");
  caso("gris: pasó otra cosa pero daba parejo", puntoDe({ H: .4, D: .3, A: .3 }, 0, 1) === "gris");
  caso("el umbral de parejo es 45%", PAREJO === 0.45);
  const base = { nl: "Local FC", nv: "Visita FC" };
  const casos = [
    aguja({ ...base, gl: 2, gv: 0, st: { tl: 18, tv: 6, xl: 2.1, xv: 0.6 } }),
    aguja({ ...base, gl: 1, gv: 0, st: { tl: 5, tv: 15, xl: null, xv: null } }),
    aguja({ ...base, gl: 1, gv: 1, st: { tl: 20, tv: 4, xl: null, xv: null } }),
    aguja({ ...base, gl: 2, gv: 1, p: { H: .62, D: .23, A: .15 } }),
    aguja({ ...base, gl: 2, gv: 1, p: { H: .38, D: .33, A: .29 } }),
    aguja({ ...base, gl: 0, gv: 1, p: { H: .62, D: .23, A: .15 } }),
  ];
  caso("con xG, el xG manda", /xG/.test(casos[0]) && /Local FC lo ganó en la cancha/.test(casos[0]), casos[0]);
  caso("ganar con menos tiros se dice", /ganó con menos/.test(casos[1]), casos[1]);
  caso("un empate con dueño se dice", /Empate con dueño: Local FC/.test(casos[2]), casos[2]);
  caso("sin estadísticas, lo que daba el modelo", /La barra lo decía: 62%/.test(casos[3]), casos[3]);
  caso("con 38% no se dice que la barra lo decía", !/lo decía/.test(casos[4]) && /arriba/.test(casos[4]), casos[4]);
  caso("una sorpresa se dice", /Sorpresa: el modelo le daba 62% a Local FC/.test(casos[5]), casos[5]);
  const prohibidas = /\b(eficacia|cuota|pick|fija|value|apost)/i;
  caso("la aguja no usa palabras prohibidas", casos.every(c => !prohibidas.test(c)));
}

console.log("\n── las páginas ──");
const LIGAS = [{ id: 1, slug: "inventada", nombre: "Liga Inventada", pais: "Ficticia", ventajaBacktest: 0.05 }];
const actual = liga(7);
const { daba } = caminar(liga(3), actual);
for (const p of actual) p.p = daba.get(p.id) || null;
actual[actual.length - 1].st = { tl: 12, tv: 4, al: 5, av: 1, pl: 61, pv: 39, xl: 1.9, xv: 0.4 };
const AHORA = Date.parse("2026-06-01T00:00:00Z");
const ligaJs = { equipos: Object.fromEntries(IDS.map((id, i) => [id, { n: NOMBRES[i] }])),
  partidos: [{ id: 8001, fecha: "2026-06-06T20:00:00Z", ronda: "Regular Season - 15", local: IDS[0], visita: IDS[1], estado: "NS" },
             { id: 8002, fecha: "2026-06-06T22:00:00Z", ronda: "Regular Season - 15", local: IDS[2], visita: IDS[3], estado: "NS" }] };
const P = paginasConsulta({ RAIZ: "https://armael11.com", ligas: LIGAS, ahora: AHORA,
  fuentes: [{ info: LIGAS[0], datos: { temporada: 2026, partidos: actual }, ligaJs }] });
const rutas = new Set(P.map(p => p.ruta));
const proximas = P.filter(p => /-800[12]\.html$/.test(p.ruta));
const jugadas = P.filter(p => /-5\d{3}\.html$/.test(p.ruta));
caso("sale la portada de consulta, la liga, cada partido y cada equipo",
     rutas.has("consulta/index.html") && rutas.has("consulta/inventada/index.html") &&
     jugadas.length === actual.length && proximas.length === 2 &&
     P.filter(p => p.ruta.includes("/equipos/")).length === 8,
     `${P.length} páginas · ${jugadas.length} jugadas · ${proximas.length} próximas`);

/* LA DECISIÓN DE FAUSTO: el número de un partido por jugar no se publica. */
caso("UN PARTIDO POR JUGAR NO LLEVA NI UN PORCENTAJE",
     proximas.every(p => !/\d\s*%/.test(texto(p.html))),
     proximas.map(p => (texto(p.html).match(/.{20}\d\s*%.{10}/) || [""])[0]).join(" | "));
caso("y manda a simularlo, derecho a ese partido",
     proximas.every(p => p.html.includes('href="/#simular=inventada:800')));
/* 8/10/2026: AdSense no tiene que ver el molde repetido. Lo fino va con
   noindex y fuera del sitemap; lo que tiene estadísticas y número, no. */
const conStYP = jugadas.filter(p => p.indexar);
caso("un partido por jugar va con noindex",
     proximas.every(p => p.indexar === false && /name="robots" content="noindex/.test(p.html)));
caso("un jugado sin estadísticas también", jugadas.some(p => p.indexar === false) &&
     jugadas.filter(p => p.indexar === false).every(p => /noindex/.test(p.html)));
caso("un jugado con estadísticas y número, sí se indexa",
     conStYP.length === 1 && /content="index,follow"/.test(conStYP[0].html), String(conStYP.length));
caso("la liga, la portada de consulta y los equipos siguen indexables",
     P.filter(p => !/-\d+\.html$/.test(p.ruta)).every(p => p.indexar !== false && /content="index,follow"/.test(p.html)));
const conP = jugadas.find(p => p.html.includes("Lo que daba el modelo"));
caso("un partido jugado sí dice lo que daba el modelo, y que era antes",
     conP && /con lo que se sabía antes del partido/i.test(texto(conP.html)));
const conSt = P.find(p => p.ruta.endsWith("-" + actual[actual.length - 1].id + ".html"));
caso("con estadísticas, la tabla del partido y la aguja con xG",
     conSt && /Goles esperados/.test(conSt.html) && /movió la aguja/.test(conSt.html) && /xG/.test(texto(conSt.html)));
caso("el estadio y el árbitro de cada partido", conSt && /Estadio/.test(conSt.html) && /Árbitro/.test(conSt.html));

const prohibidas = ["cuota", "cuotas", "pick", "fija", "value", "acertá", "ganale a la casa",
                    "eficacia", "el único", "casa de apuestas", "casas de apuestas", "apostá", "betting", "odds"];
const conProhibidas = P.filter(p => prohibidas.some(w => new RegExp("\\b" + w + "\\b", "i").test(texto(p.html))));
caso("ninguna página con palabras prohibidas", conProhibidas.length === 0, conProhibidas.map(p => p.ruta).slice(0, 3).join(", "));
const rotas = P.filter(p => /\bundefined\b|\bNaN\b|\bnull\b/.test(texto(p.html)));
caso("ni undefined, ni NaN, ni null en pantalla", rotas.length === 0,
     rotas.slice(0, 2).map(p => p.ruta + ": " + (texto(p.html).match(/.{25}(undefined|NaN|null).{15}/) || [""])[0]).join(" | "));

/* Cada página dice algo propio: nada de cien páginas iguales. */
const titulos = new Set(P.map(p => (p.html.match(/<title>([^<]+)<\/title>/) || [])[1]));
const descripciones = new Set(P.map(p => (p.html.match(/name="description" content="([^"]+)"/) || [])[1]));
caso("cada página tiene su propio título", titulos.size === P.length, titulos.size + " de " + P.length);
caso("y su propia descripción", descripciones.size === P.length, descripciones.size + " de " + P.length);
caso("cada una con su dirección canónica",
     P.every(p => p.html.includes('<link rel="canonical" href="https://armael11.com/' + p.ruta.replace(/index\.html$/, "") + '">')));

/* Todos los links internos llevan a algo que existe. */
const fijas = new Set(["", "consulta/", "como-funciona.html", "es-suerte.html", "ligas.html", "privacidad.html", "terminos.html", "contacto.html", "quienes-somos.html"]);
const rotos = [];
for (const p of P) for (const m of p.html.matchAll(/href="\/([^"#?]*)(#[^"]*)?"/g)) {
  const r = m[1];
  if (fijas.has(r)) continue;
  if (rutas.has(r) || rutas.has(r + "index.html")) continue;
  rotos.push(p.ruta + " → /" + r);
}
caso("todos los links internos llevan a algo que existe", rotos.length === 0, rotos.slice(0, 4).join(" · "));
caso("cada página tiene su botón para simular", P.every(p => /class="ir"/.test(p.html)));

caso("sin datos no sale ninguna página",
     paginasConsulta({ fuentes: [{ info: LIGAS[0], datos: null, ligaJs: null }], ligas: LIGAS }).length === 0);
caso("sin la liga del día, los próximos salen de la semanal (y sin enlace directo)",
     proximosDe({ partidos: [{ id: 1, fecha: "2026-06-06T20:00:00Z", estado: "NS", local: 1, visita: 2, nl: "A", nv: "B" }] },
                null, AHORA)[0].enApp === false);


console.log("\n── los repasos de cada fecha (8/10/2026) ──");
{
  const mezcla = actual.slice(); mezcla[3] = { ...mezcla[3], estado: "NS", gl: null, gv: null };   /* la fecha 1 queda a medias */
  const F = fechasCompletas(mezcla);
  caso("solo las fechas enteras se repasan", F.length === 13 && !F.some(f => f.n === 1), F.map(f => f.n).join(","));
  const notas = { "inventada-7": "La fecha del **cambio**.\n\nDos párrafos." };
  const R = paginasRepaso({ datos: { temporada: 2026, partidos: actual }, info: LIGAS[0], RAIZ: "https://armael11.com", notasDe: k => notas[k] || "" });
  caso("una página por fecha más el índice", R.length === 15 && R.some(p => p.esIndice) && R.every(p => p.indexar));
  const f7 = R.find(p => p.ruta === "repasos/inventada-fecha-7.html");
  caso("la ruta sin torneo cuando es 'Regular Season'", !!f7, R.map(p => p.ruta).slice(0, 3).join(","));
  const t = texto(f7.html);
  caso("tiene cuerpo: más de 250 palabras con solo cuatro partidos", t.split(" ").length > 250, t.split(" ").length + " palabras");
  caso("las notas de Fausto van arriba, como 'La mirada', con negrita", /La mirada/.test(f7.html) && /<b>cambio<\/b>/.test(f7.html) && /Dos párrafos/.test(f7.html));
  caso("sin notas no hay 'La mirada'", !/La mirada/.test(R.find(p => p.ruta === "repasos/inventada-fecha-8.html").html));
  caso("cada partido enlaza a su página de consulta", actual.filter(p => p.ronda === "Regular Season - 7").every(p => f7.html.includes("/consulta/inventada/") && f7.html.includes("-" + p.id + ".html")));
  caso("dice lo que el modelo dijo y que está medido, sin explicar la cuenta", /pasó lo que el modelo ponía arriba/.test(t) && /está medido/.test(t) && !/se calcula/.test(t));
  caso("con la tabla después de la fecha", /La tabla después de la fecha/.test(f7.html) && /<table>/.test(f7.html));
  caso("sin palabras prohibidas ni 'vos'", !prohibidas.some(w => new RegExp("\\b" + w + "\\b", "i").test(t)) && !/\bvos\b/.test(t));
  caso("el último repaso es el de la fecha más nueva", ultimoRepaso(R).n === 14);
  caso("el índice los lista del más nuevo al más viejo", (() => { const i = R.find(p => p.esIndice).html; return i.indexOf("fecha-14.html") < i.indexOf("fecha-13.html"); })());
  caso("sin datos no hay repasos", paginasRepaso({ datos: null, info: LIGAS[0] }).length === 0 && paginasRepaso({ datos: { partidos: [] }, info: LIGAS[0] }).length === 0);
  caso("el markdown chico: párrafos y negrita, escapado", notasHTML("a <b> **x**\n\nb") === "<p>a &lt;b&gt; <b>x</b></p>\n<p>b</p>");
}

console.log("\n── lo que viene de afuera ──");
{
  const js = 'window.LIGAS=window.LIGAS||{};window.LIGAS["argentina"]={"id":128,"partidos":[{"id":1,"local":2}],"equipos":{"2":{"n":"X"}}};';
  const l = leerLigaJs(js);
  caso("lee el archivo de la liga tal como lo escribe ligas-api", l && l.id === 128 && l.equipos["2"].n === "X");
  caso("un archivo raro no rompe nada", leerLigaJs("alert(1)") === null);
  caso("las direcciones no tienen tildes ni espacios",
       urlPartido("argentina", { nl: "Unión Santa Fe", nv: "Newell's Old Boys", id: 3 }) ===
       "consulta/argentina/union-santa-fe-newell-s-old-boys-3.html");
  const mapa = mapaDelSitio("https://armael11.com", "2026-09-27", ["consulta/index.html", "consulta/x/y-z-1.html"]);
  caso("el mapa del sitio suma las de consulta", mapa.includes("https://armael11.com/consulta/</loc>") &&
       mapa.includes("https://armael11.com/consulta/x/y-z-1.html"));
}

console.log("\n── el iPhone no se lleva la consulta ──");
{
  /* El .ipa se arma siguiendo links desde la portada. Si siguiera los de
     consulta, se llevaría miles de páginas adentro de la app. */
  const emp = readFileSync(new URL("./empaquetar-ios.mjs", import.meta.url), "utf8");
  caso("empaquetar-ios.mjs no sigue los links de /consulta/", /consulta\//.test(emp) && /noSeLleva|NO_SE_LLEVA/.test(emp));
}

console.log("\n" + "─".repeat(66));
console.log(mal ? `\n${mal} MAL de ${ok + mal}.` : `\n${ok} de ${ok}. Todo bien.`);
process.exit(mal ? 1 : 0);
