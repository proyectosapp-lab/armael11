/* ══════════════════════════════════════════════════════════════════════════
   STATS — los números de la liga desde el archivo histórico guardado.

   Este es el camino SIN RED, para trabajar con las temporadas viejas. El que
   alimenta la app publicada es `stats-api.mjs`, que pide los datos frescos y
   además usa la tabla que publica la liga.

   Cuidado con lo que sale de acá: el archivo histórico no dice a qué ronda
   pertenece cada partido, así que la fase regular y los playoffs quedan
   sumados. Para 2026 eso da 25 partidos al que llegó a la final y 21 al que
   quedó afuera temprano, y una tabla que no coincide con ninguna. Sirve para
   promedios y récords; para la tabla, no.

     node stats.mjs            2026
     node stats.mjs 2024
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
import { calcular } from "./stats-calc.mjs";

const TEMP = process.argv[2] || "2026";
const D = JSON.parse(readFileSync("/home/claude/full.json"));
const P = (D.temporadas[TEMP]?.partidos || [])
  .filter(p => p.gh != null && p.ga != null)
  .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

if (!P.length) { console.log("No hay partidos de " + TEMP + " en el archivo."); process.exit(1); }

const out = calcular(P, {
  notaXG: "El xG existe solo en una parte de los partidos. Las columnas de xG comparan únicamente esos, y van por partido, no acumuladas.",
  nota: "Calculado sobre TODOS los partidos guardados de " + TEMP + ", sin separar fase regular de playoffs. **No es la tabla oficial.** La tabla buena sale de stats-api.mjs, que la pide a /standings.",
});

writeFileSync(new URL("./stats-liga.js", import.meta.url), "window.STATS = " + JSON.stringify(out) + ";");
writeFileSync(new URL("./stats-liga.json", import.meta.url), JSON.stringify(out, null, 1));

console.log(P.length + " partidos · " + out.tabla.length + " equipos · hasta " + out.generado.slice(0, 10));
const pj = [...new Set(out.tabla.map(t => t.pj))].sort((a, b) => a - b);
console.log("partidos jugados por equipo: " + pj.join(", "));
if (pj.length > 2) console.log("  ⚠ ese abanico es la mezcla de fase regular y playoffs. Para la tabla usá stats-api.mjs.");
console.log("\nTop 5:");
out.tabla.slice(0, 5).forEach(t => console.log("  " + t.pos + ". " + t.nom.padEnd(22) +
  t.pts + " pts  " + t.pj + " pj  DG " + (t.dg > 0 ? "+" : "") + t.dg + "  forma " + t.forma.join("")));
