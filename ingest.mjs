/* ══════════════════════════════════════════════════════════════════════════
   INGEST — arma el feed de un club.
     node ingest.mjs                 -> talleres-cba
     node ingest.mjs belgrano-cba
     node ingest.mjs aldosivi

   Las fuentes ya no viven en un archivo por club: salen de medios.json, que
   es un catálogo único donde cada fuente declara a quién alcanza. Un club
   hereda las de su ciudad y las nacionales, y suma las propias. El segundo
   club de una ciudad arranca con siete fuentes gratis.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
import { traerTodas } from "./traer.mjs";
import { construirFeed } from "./pipeline.mjs";

const aca  = p => new URL(p, import.meta.url);
const leer = p => JSON.parse(readFileSync(aca(p)));

const CLUBES = leer("./clubes.json");
const MEDIOS = leer("./medios.json").fuentes;
const id = process.argv[2] || "talleres-cba";
const club = CLUBES.find(c => c.id === id);
if(!club){
  console.log("No conozco el club \"" + id + "\". Los que hay:");
  console.log("  " + CLUBES.map(c=>c.id).join("  "));
  process.exit(1);
}

const fuentes = MEDIOS.filter(f =>
     f.alcance === "nacional"
  || (f.alcance === "ciudad" && f.ciudad === club.ciudad)
  || (f.alcance === "propio" && f.club === id));

const PACK = { nombre: club.nom, desambiguacion: {
  fuertes: [club.nombreCompleto, club.nom + " de " + (club.ciudad||""), club.nom + " " + (club.ciudad||"")]
    .filter(x => x && x.trim().length > 4),
  debiles: club.debiles || [club.nom, ...club.apodos],
  corroboradores: [club.ciudad, "Liga Profesional", "Torneo Clausura"].filter(Boolean),
  bloqueadores: club.bloqueadores,
}};

console.log("\n" + club.nom.toUpperCase() + "  ·  " + (club.ciudad||"sin ciudad"));
console.log(fuentes.filter(f=>f.activo!==false).length + " fuentes: " +
  fuentes.filter(f=>f.alcance==="propio"&&f.activo!==false).length + " propias, " +
  fuentes.filter(f=>f.alcance!=="propio"&&f.activo!==false).length + " heredadas\n");

const crudos = await traerTodas(fuentes, console.log);
const ok = crudos.filter(c => !c.error);
const total = ok.reduce((a,c)=>a+c.items.length,0);
if(!total){ console.log("\nNo entró ni un ítem. Revisá la conexión.\n"); process.exit(1); }

const feed = construirFeed(ok, PACK);
console.log("\n" + "─".repeat(70));
console.log(total + " ítems crudos  ->  " + feed.entraron + " de " + club.nom +
            "  ->  " + feed.clusters.length + " historias" +
            "   ·   " + feed.clusters.filter(c=>c.nFuentes>1).length + " con más de una fuente");
console.log("─".repeat(70) + "\n");
feed.clusters.slice(0,10).forEach((c,i)=>{
  console.log(String(i+1).padStart(2)+". "+c.principal.titulo.slice(0,62)+(c.nFuentes>1?" ⧉"+c.nFuentes:""));
  console.log("    "+c.principal.fuente+" · hace "+Math.round(c.horas)+"h");
});

const { descartados, ...limpio } = feed;
limpio.club = { id: club.id, nom: club.nom, ini: club.ini, apiId: club.apiId,
                color: club.color, color2: club.color2, patron: club.patron,
                estrellas: club.estrellas };
writeFileSync(aca("./feed-"+id+".json"), JSON.stringify(limpio,null,1));
writeFileSync(aca("./feed-"+id+".js"), "window.FEED = "+JSON.stringify(limpio)+";\n"
  + "window.CLUB = "+JSON.stringify(limpio.club)+";");
writeFileSync(aca("./descartados-"+id+".json"), JSON.stringify(descartados,null,1));
console.log("\nListo: feed-"+id+".js\n");
