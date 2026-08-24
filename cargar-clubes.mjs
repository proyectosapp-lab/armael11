/* ══════════════════════════════════════════════════════════════════════════
   De la planilla de Fausto a los datos que come la app.
   Traduce colores en palabras a hex, normaliza y DERIVA los bloqueadores
   a partir del propio padrón: si dos clubes de la liga comparten una palabra
   del nombre, cada uno es trampa del otro. Eso no hay que cargarlo a mano.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
const F = JSON.parse(readFileSync("./clubes-crudo.json"));

/* Un hex por palabra. TODOS son aproximados a propósito: sirven para arrancar
   y para que Fausto los corrija mirando la hoja de aprobación, que es mil
   veces más rápido que pedirle 30 códigos de color por escrito.            */
const COLOR = {
  verde:"#0B7A3B", amarillo:"#FFC72C", rojo:"#D3202A", blanco:"#FFFFFF",
  celeste:"#5FB3E4", azul:"#123C8C", negro:"#1A1A1A", "bordó":"#7A1F2B",
  bordo:"#7A1F2B", marron:"#6B4A2F", "marrón":"#6B4A2F", naranja:"#F26722",
  violeta:"#5B2C8D", gris:"#8B94A3",
};
/* Donde el club tiene un tono propio muy reconocible, se usa ese. */
const PROPIO = {
  boca:"#0A2A5E", river:"#E4002B", racing:"#6CACE4", "belgrano-cba":"#4AA5DC",
  independiente:"#D6001C", "san-lorenzo":"#7A1F2B", "rosario-central":"#FFD200",
  velez:"#FFFFFF", newells:"#1A1A1A", "talleres-cba":"#0A3D91",
};
const aHex = (txt, id, cual) => {
  if(!txt) return null;
  const s = String(txt).trim();
  if(s.startsWith("#")) return s.toUpperCase();
  if(cual===1 && PROPIO[id]) return PROPIO[id];
  return COLOR[s.toLowerCase()] || null;
};

const plano = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"")
  .toLowerCase().replace(/[^a-z0-9ñ\s]/g," ").replace(/\s+/g," ").trim();

/* Palabras del nombre que no distinguen a nadie */
const VACIAS = new Set(["club","atletico","atlético","de","del","la","el","los","juniors",
  "asociacion","asociación","social","y","fc","ca"]);

const clubes = F.map(f => ({
  id: f.id, nom: f.nombre, nombreCompleto: f.nombre_completo, ciudad: f.ciudad || null,
  ini: (f.nombre||"?").trim()[0].toUpperCase(),
  apiId: f.apiFootballTeamId,
  color:  aHex(f.color_1, f.id, 1),
  color2: aHex(f.color_2, f.id, 2) || "#FFFFFF",
  patron: String(f.patron||"liso").trim().toLowerCase() === "v" ? "uve"
        : String(f.patron||"liso").trim().toLowerCase(),
  estrellas: f.estrellas == null ? 0 : Number(f.estrellas),
  apodos: (f.apodos||"").split(/\s*,\s*/).filter(Boolean),
  bloqueadores: (f.bloqueadores||"").split(/\s*,\s*/).filter(Boolean),
  _colorCrudo: f.color_1, _color2Crudo: f.color_2,
}));

/* ── bloqueadores derivados del padrón ──────────────────────────────────────
   Si dos clubes de la liga comparten una palabra del nombre, cada uno es la
   trampa del otro. Lo que los distingue casi siempre es la CIUDAD: hay un
   Estudiantes de La Plata y uno de Río Cuarto, una Gimnasia de La Plata y una
   de Mendoza. Entonces para un par que choca, la ciudad del otro va de
   bloqueadora — y sólo para ese par, no para todos.                        */
const tokens = c => new Set(plano(c.nom).split(" ").filter(w => w.length>2 && !VACIAS.has(w)));
const tk = new Map(clubes.map(c => [c.id, tokens(c)]));
const sumar = (c, txt) => {
  if(!txt) return 0;
  if(c.bloqueadores.some(x => plano(x)===plano(txt))) return 0;
  c.bloqueadores.push(txt); return 1;
};
let derivados = 0;
const choca = [];
for(const a of clubes) for(const b of clubes){
  if(a.id===b.id) continue;
  const comun = [...tk.get(a.id)].filter(w => tk.get(b.id).has(w));
  if(!comun.length) continue;
  choca.push([a.id, b.id, comun.join("/")]);
  derivados += sumar(a, b.ciudad);
  if(b.nombreCompleto && plano(b.nombreCompleto)!==plano(a.nombreCompleto))
    derivados += sumar(a, b.nombreCompleto);
}

/* Choques de APODO, que no se derivan del nombre. Los aportó Fausto en la
   planilla, en prosa: "lepra también le dicen a Newell's". Traducido.     */
const APODOS_CHOCADOS = [["newells","Independiente Rivadavia"],
                         ["independiente-rivadavia","Newell's"]];
for(const [id,bloq] of APODOS_CHOCADOS){
  const c = clubes.find(x=>x.id===id); if(c) derivados += sumar(c, bloq);
}
/* Y se limpian las anotaciones en prosa: no son frases que vayan a aparecer
   en una nota, así que como bloqueadores no hacen nada. */
const esProsa = t => /\btambien\b|\btambién\b|\ble dicen\b/i.test(t);
let prosa = 0;
clubes.forEach(c => {
  const antes = c.bloqueadores.length;
  c.bloqueadores = c.bloqueadores.filter(t => !esProsa(t));
  prosa += antes - c.bloqueadores.length;
});

clubes.forEach(c => { const {_colorCrudo,_color2Crudo,...r}=c; Object.assign(c,{},r); });
writeFileSync("./clubes.json", JSON.stringify(clubes,null,1));

/* ── informe ── */
const sinHex = clubes.filter(c => !c.color);
const raros  = clubes.filter(c => c.estrellas > 12);
const choques = clubes.filter(c => c.bloqueadores.length);
console.log(clubes.length + " clubes normalizados · " + derivados + " bloqueadores derivados · " + prosa + " anotaciones en prosa descartadas\n");
console.log("choques de nombre entre clubes de la misma liga:");
const vistos=new Set();
choca.forEach(([a,b,w])=>{ const k=[a,b].sort().join("|"); if(vistos.has(k))return; vistos.add(k);
  console.log("  " + a.padEnd(24) + " vs " + b.padEnd(24) + " comparten \"" + w + "\"");});
console.log("\nbloqueadores finales de los que chocan:");
[...new Set(choca.map(c=>c[0]))].forEach(id=>{ const c=clubes.find(x=>x.id===id);
  console.log("  " + id.padEnd(24) + c.bloqueadores.join(" · "));});
const sinCiudad = [...new Set(choca.map(c=>c[0]))].filter(id=>!clubes.find(x=>x.id===id).ciudad);
if(sinCiudad.length) console.log("\n⚠ chocan y NO tienen ciudad cargada: " + sinCiudad.join(", ") +
  "\n  sin ciudad, el otro club no puede usarla para distinguirlos.");
if(sinHex.length) console.log("\nsin color reconocido: " + sinHex.map(c=>c.id+" ("+c._colorCrudo+")").join(", "));
if(raros.length) console.log("\nrevisar cantidad de estrellas: " + raros.map(c=>c.id+" = "+c.estrellas).join(", "));
