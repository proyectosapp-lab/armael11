/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL PIPELINE contra datos reales guardados
     node probar.mjs
   No toca la red. Corre en un segundo. Se puede correr después de cada cambio.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { construirFeed } from "./pipeline.mjs";
import { deAPocas, esFallaDeRed } from "./traer.mjs";

/* ── LA BAJADA DE A POCAS ──────────────────────────────────────────────────
   Las 148 fuentes se pedían todas juntas y en la máquina de GitHub eso daba
   corridas con 94 "fetch failed": una ráfaga que el resolvedor de DNS no
   aguanta. Ahora van de a dieciséis, y las que fallan por red se vuelven a
   pedir de a seis después de esperar. Esto prueba la herramienta, que es lo
   que se puede probar sin red: que respeta el tope y devuelve en orden. */
let enVuelo = 0, tope = 0;
const bajada = await deAPocas([5, 4, 3, 2, 1, 0, 9, 8], 3, async (x) => {
  enVuelo++; tope = Math.max(tope, enVuelo);
  await new Promise(r => setTimeout(r, 5 + x * 2));   /* distintos tiempos, a propósito */
  enVuelo--; return x * 10;
});

const FIX  = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url)));
const PACK = JSON.parse(readFileSync(new URL("./desambiguacion.json", import.meta.url)));

/* Congelamos "ahora" en el momento de la captura: si no, el ranking cambia
   solo con el paso del tiempo y la prueba deja de ser comparable.           */
const AHORA = new Date(FIX.capturado).getTime();

const crudos = FIX.lotes.map(l => ({ fuente: l.fuente, items: l.items }));
const feed = construirFeed(crudos, PACK, { ahora: AHORA });

const linea = "─".repeat(74);
console.log("\nFEED DE " + feed.equipo.toUpperCase() + "  ·  " +
            crudos.reduce((a, l) => a + l.items.length, 0) + " ítems crudos  ->  " +
            feed.entraron + " del equipo  ->  " + feed.clusters.length + " historias\n" + linea);

feed.clusters.forEach((c, i) => {
  const marca = c.nFuentes > 1 ? "  ⧉ " + c.nFuentes + " fuentes ×" + c.mult : "";
  console.log("\n" + String(i + 1).padStart(2) + ". [" + c.score.toFixed(3) + "]" + marca);
  console.log("    " + c.principal.titulo.slice(0, 68));
  console.log("    " + c.principal.fuente + " · hace " + Math.round(c.horas) + "h · " +
              c.principal.porque);
  c.tambien.forEach(t => console.log("      ↳ " + t.fuente + ": " + t.titulo.slice(0, 56)));
});

console.log("\n" + linea + "\nDESCARTADOS (" + feed.descartados.length + ")\n");
const porMotivo = {};
feed.descartados.forEach(d => (porMotivo[d.porque] ??= []).push(d));
for (const [motivo, ds] of Object.entries(porMotivo).sort((a, b) => b[1].length - a[1].length)) {
  console.log("  " + motivo + "  (" + ds.length + ")");
  ds.slice(0, 3).forEach(d => console.log("     · " + d.titulo.slice(0, 62)));
}

/* ─── casos que TIENEN que dar bien ──────────────────────────────────────── */
const titulos = feed.clusters.flatMap(c => [c.principal, ...c.tambien]).map(x => x.titulo);
const hay = s => titulos.some(t => t.includes(s));
const casos = [
  ["entra la noticia de Talleres en un feed general de deportes", hay("Catalán y Juan Sforza se reincorporan")],
  ["NO entra Talleres de Remedios de Escalada",                   !hay("Remedios de Escalada")],
  ["NO entra Talleres de Perico",                                 !hay("Perico")],
  ["NO entran los talleres municipales",                          !hay("talleres municipales")],
  ["NO entra el Matador que es Tigre",                            !hay("El Matador goleó")],
  ["entra 'la T' + Kempes en una fuente general",                 hay("Sampaoli habló del clásico")],
  ["NO entra Belgrano",                                           !hay("Belgrano perdió")],
  ["NO entra Instituto",                                          !hay("Facundo Suárez")],
  ["NO entra el horóscopo",                                       !hay("Horóscopo")],
  ["Catalán/Sforza quedó agrupado en un solo clúster",
      feed.clusters.some(c => c.nFuentes >= 2 && c.principal.titulo.includes("Sforza"))],
  ["los ex jugadores en el CARD quedaron agrupados",
      feed.clusters.some(c => c.nFuentes >= 2 && /CARD|ex-?jugadores/i.test(c.principal.titulo))],
  ["de a pocas: nunca más de tres a la vez",                       tope === 3],
  ["de a pocas: devuelve en el orden de la lista aunque terminen desordenadas",
      bajada.join(",") === "50,40,30,20,10,0,90,80"],
  ["'fetch failed' es falla de red: se reintenta",                  esFallaDeRed("fetch failed")],
  ["un HTTP 404 es del medio: no se reintenta",                     !esFallaDeRed("HTTP 404")],
  ["un feed vacío tampoco",                                          !esFallaDeRed("feed vacío")],
];
console.log("\n" + linea);
let mal = 0;
casos.forEach(([q, ok]) => { if (!ok) mal++; console.log((ok ? "  ok   " : "  FALLA") + "  " + q); });
console.log(linea + "\n" + (mal ? mal + " caso(s) fallando\n" : "Todo bien.\n"));
process.exit(mal ? 1 : 0);
