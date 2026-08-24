/* ══════════════════════════════════════════════════════════════════════════
   TODOS — arma el feed de los treinta clubes de una pasada.

   La diferencia con correr ingest.mjs treinta veces no es cosmética: las
   fuentes nacionales las comparten los treinta clubes y las de ciudad, dos
   o tres. Pidiéndolas una vez por club serían más de seiscientos pedidos
   para bajar ciento diecisiete archivos. Acá se baja cada fuente UNA vez y
   después cada club se arma con lo que ya está en memoria.

   Esta es también la forma que va a tener la ingesta cuando corra sola.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
import { traerTodas } from "./traer.mjs";
import { construirFeed } from "./pipeline.mjs";

const aca  = p => new URL(p, import.meta.url);
const leer = p => JSON.parse(readFileSync(aca(p)));

const CLUBES = leer("./clubes.json");
const MEDIOS = leer("./medios.json").fuentes;
const soloEste = process.argv[2];
const lista = soloEste ? CLUBES.filter(c => c.id === soloEste) : CLUBES;
if (!lista.length) { console.log("No conozco el club \"" + soloEste + "\"."); process.exit(1); }

const activas = MEDIOS.filter(f => f.activo !== false);
console.log("\n" + "═".repeat(74));
console.log("  BAJANDO " + activas.length + " FUENTES  (una sola vez cada una)");
console.log("═".repeat(74) + "\n");

const t0 = Date.now();
const crudos = await traerTodas(activas, console.log);
const seg = Math.round((Date.now() - t0) / 1000);

const vivas   = crudos.filter(c => !c.error && c.items.length);
const caidas  = crudos.filter(c => c.error);
const items   = vivas.reduce((a, c) => a + c.items.length, 0);

console.log("\n" + "─".repeat(74));
console.log("  " + vivas.length + " fuentes respondieron con " + items + " ítems  ·  " +
            caidas.length + " fallaron  ·  " + seg + "s");
console.log("─".repeat(74));

if (caidas.length) {
  console.log("\n  LAS QUE FALLARON — esto es lo que hay que arreglar:");
  for (const c of caidas)
    console.log("    " + (c.fuente.nom || "?").padEnd(38) + c.error);
}

/* ─── un feed por club, sin volver a tocar la red ───────────────────────── */
const paraElClub = (c, club) => {
  const f = c.fuente;
  return f.alcance === "nacional"
      || (f.alcance === "ciudad" && f.ciudad === club.ciudad)
      || (f.alcance === "propio" && f.club === club.id);
};

console.log("\n" + "═".repeat(74));
console.log("  " + "CLUB".padEnd(24) + "FUENTES".padEnd(9) + "ÍTEMS".padEnd(8) +
            "SUYOS".padEnd(8) + "HISTORIAS".padEnd(11) + "CRUZADAS");
console.log("═".repeat(74));

const resumen = [];
for (const club of lista) {
  const mias = vivas.filter(c => paraElClub(c, club));
  const PACK = { nombre: club.nom, desambiguacion: {
    fuertes: [club.nombreCompleto, club.nom + " de " + (club.ciudad || ""), club.nom + " " + (club.ciudad || "")]
      .filter(x => x && x.trim().length > 4),
    /* Casi siempre el nombre corto y los apodos alcanzan. Pero hay clubes
       cuyo nombre corto es una palabra del idioma —Argentinos, Unión,
       Instituto— y ahí la señal débil hay que escribirla a mano.        */
    debiles: club.debiles || [club.nom, ...club.apodos],
    corroboradores: [club.ciudad, "Liga Profesional", "Torneo Clausura"].filter(Boolean),
    bloqueadores: club.bloqueadores,
  }};

  const crudosDelClub = mias.reduce((a, c) => a + c.items.length, 0);
  const feed = construirFeed(mias, PACK);
  const cruzadas = feed.clusters.filter(c => c.nFuentes > 1).length;

  console.log("  " + club.nom.padEnd(24) +
    String(mias.length).padEnd(9) + String(crudosDelClub).padEnd(8) +
    String(feed.entraron).padEnd(8) + String(feed.clusters.length).padEnd(11) + cruzadas);

  /* Las tres primeras de cada club. Los números dicen cuánto entró; esto
     dice QUÉ entró, que es lo único que se puede juzgar de verdad. Si acá
     aparece una nota de otro equipo o un horóscopo, el problema no está en
     las fuentes sino en la desambiguación.                               */
  for (const c of feed.clusters.slice(0, 3))
    console.log("      · " + c.principal.titulo.slice(0, 58) +
                (c.nFuentes > 1 ? " ⧉" + c.nFuentes : "") +
                "   [" + c.principal.fuente + "]");

  resumen.push({ id: club.id, nom: club.nom, fuentes: mias.length,
                 crudos: crudosDelClub, entraron: feed.entraron,
                 historias: feed.clusters.length, cruzadas });

  const { descartados, ...limpio } = feed;
  limpio.club = { id: club.id, nom: club.nom, ini: club.ini, apiId: club.apiId,
                  color: club.color, color2: club.color2, patron: club.patron,
                  estrellas: club.estrellas };
  writeFileSync(aca("./feed-" + club.id + ".json"), JSON.stringify(limpio, null, 1));
  writeFileSync(aca("./feed-" + club.id + ".js"),
    "window.FEED = " + JSON.stringify(limpio) + ";\nwindow.CLUB = " + JSON.stringify(limpio.club) + ";");
}

console.log("═".repeat(74));

/* En qué sección cae lo que entró. Importa desde que los canales oficiales
   son fuente: un club sube muchísimo juvenil y femenino por YouTube, y sin
   etiquetas todo eso caía junto con la primera.                          */
const secciones = {};
for (const club of lista) {
  const f = JSON.parse(readFileSync(aca("./feed-" + club.id + ".json")));
  for (const c of f.clusters)
    secciones[c.principal.seccion] = (secciones[c.principal.seccion] || 0) + 1;
}
console.log("\n  POR SECCIÓN: " + Object.entries(secciones)
  .sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n).join("  ·  "));

/* Los que quedaron flacos son la lista de trabajo del próximo día. */
const flacos = resumen.filter(r => r.historias < 5).sort((a, b) => a.historias - b.historias);
if (flacos.length) {
  console.log("\n  CLUBES FLACOS (menos de 5 historias) — les falta curaduría:");
  for (const f of flacos)
    console.log("    " + f.nom.padEnd(24) + f.historias + " historias de " + f.fuentes + " fuentes");
}

writeFileSync(aca("./resumen.json"), JSON.stringify({
  cuando: new Date().toISOString(), segundos: seg,
  fuentes: { activas: activas.length, vivas: vivas.length, caidas: caidas.length },
  caidas: caidas.map(c => ({ nom: c.fuente.nom, url: c.fuente.url, error: c.error })),
  clubes: resumen,
}, null, 1));

console.log("\n  El detalle quedó en resumen.json\n");
