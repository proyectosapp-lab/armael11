/* ══════════════════════════════════════════════════════════════════════════
   RESOLVER-YOUTUBE — convierte @handles en channelIds, mide si el canal está
   vivo, y carga los que sirven en medios.json.

   Por qué existe: el feed de YouTube pide channel_id, no handle. Y desde
   donde se buscan los canales, YouTube no se deja leer. Así que quedaron
   cuarenta handles a medio confirmar.

   Qué hace, por candidato:
     1. baja la página del canal y le saca el "channelId":"UC..."
     2. pide el Atom del canal y mira la fecha del último video
     3. COMPARA EL NOMBRE DEL CANAL con el que esperábamos
     4. escribe medios.json y youtube-resueltos.json

   El paso 3 no estaba y hacía falta. Buscando "Muy Independiente" pusimos
   @MuyCAI, que era el handle correcto cuando alguien lo escribió y hoy es de
   una agencia de viajes. Resolvió perfecto, devolvió quince videos, y ninguno
   era de fútbol. Un handle se reasigna: el nombre es la única prueba.

   Un canal que no publica hace más de 90 días queda DORMIDO y no entra. No
   está muerto —un canal de hinchas de un club chico puede pasar el verano sin
   subir nada— pero tampoco alimenta un feed.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
const aca = p => new URL(p, import.meta.url);

const UA = { "user-agent":
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  "accept-language": "es-AR,es;q=0.9" };

const DORMIDO = 90;

async function bajar(url, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

const campo = (xml, tag) =>
  xml.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"))?.[1] || "";

const sacarId = html =>
     html.match(/"(?:channelId|externalId)"\s*:\s*"(UC[\w-]{22})"/)?.[1]
  || html.match(/channel_id=(UC[\w-]{22})/)?.[1]
  || html.match(/\/channel\/(UC[\w-]{22})/)?.[1]
  || null;

/* ¿El canal que abrimos es el que buscábamos? Se compara por palabras, sin
   acentos ni palabras vacías. No hace falta que coincida entero: alcanza con
   que compartan una palabra con peso —"racing", "huracan", "granate"—.     */
const VACIAS = new Set(["el","la","los","las","de","del","club","oficial","tv","canal","y","atletico"]);
const pelar = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !VACIAS.has(w));

function seParecen(esperado, real) {
  const a = pelar(esperado), b = pelar(real);
  if (!a.length || !b.length) return true;        // sin nada que comparar, no acusamos
  /* Palabra contra palabra, tolerando prefijos: "DEFENSAOFICIAL1935" empieza
     con "defensa". Y además pegado, porque muchos canales escriben el nombre
     sin espacios: "eltresTV" contiene "tres".                             */
  const juntas = [a.join(""), b.join("")];
  return b.some(w => a.some(x => x === w || x.startsWith(w) || w.startsWith(x)))
      || juntas[0].includes(juntas[1]) || juntas[1].includes(juntas[0]);
}

const CAND = JSON.parse(readFileSync(aca("./youtube-candidatos.json"))).candidatos;
const salida = [];

console.log("\nResolviendo " + CAND.length + " canales. Tarda un par de minutos.\n");

for (const c of CAND) {
  const quien = (c.club || c.ciudad || "?").padEnd(24) + c.nom;
  let id = c.channelId || null;
  let nota = "";

  if (!id) {
    const pagina = c.url || ("https://www.youtube.com/" + c.handle);
    try {
      id = sacarId(await bajar(pagina));
      if (!id) nota = "la página cargó pero no tiene channelId: el handle no existe";
    } catch (e) { nota = "no se pudo abrir el canal (" + e.message + ")"; }
  }

  if (!id) { console.log("  ✗ " + quien + " — " + nota); salida.push({ ...c, ok:false, porque:nota }); continue; }

  try {
    const xml = await bajar("https://www.youtube.com/feeds/videos.xml?channel_id=" + id);
    const entradas = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/gi)].map(m => m[0]);
    if (!entradas.length) throw new Error("el feed no tiene videos");

    const canal  = campo(xml, "title");
    const ultimo = entradas[0];
    const dias   = Math.round((Date.now() - +new Date(campo(ultimo, "published"))) / 864e5);

    const impostor = !seParecen(c.nom, canal);
    const estado = impostor ? "OTRO"
                 : dias > DORMIDO ? "DORMIDO" : "vivo";
    const marca  = { vivo:"✓", DORMIDO:"·", OTRO:"✗" }[estado];

    console.log("  " + marca + " " + quien + " — " + canal + " · " + entradas.length +
      " videos · último hace " + dias + "d" + (estado === "vivo" ? "" : "  (" + estado + ")"));
    if (impostor)
      console.log("      ¡OJO! esperábamos \"" + c.nom + "\" y el canal se llama \"" + canal +
                  "\". El handle debe haber cambiado de dueño.");
    else
      console.log("      " + campo(ultimo, "title").slice(0, 66));

    salida.push({ ...c, ok: estado === "vivo", channelId:id, canal, dias, estado,
                  ultimoVideo: campo(ultimo, "title") });
  } catch (e) {
    console.log("  ✗ " + quien + " — id " + id + " pero el feed falló: " + e.message);
    salida.push({ ...c, ok:false, channelId:id, porque:"feed: " + e.message });
  }
}

writeFileSync(aca("./youtube-resueltos.json"), JSON.stringify(salida, null, 1));

/* ─── carga en medios.json ───────────────────────────────────────────────
   Solo los vivos. Idempotente por channelId: correrlo diez veces deja lo
   mismo que correrlo una. Así el catálogo se arregla solo cada vez que
   alguien lo corre, sin que nadie tenga que copiar nada a mano.         */
const medios = JSON.parse(readFileSync(aca("./medios.json")));
const tengo = new Set(medios.fuentes.map(f => f.channelId).filter(Boolean));
let nuevas = 0;

for (const s of salida.filter(s => s.estado === "vivo")) {
  if (tengo.has(s.channelId)) continue;
  tengo.add(s.channelId);
  medios.fuentes.push(s.ciudad
    ? { nom: s.nom, alcance:"ciudad", ciudad:s.ciudad, tipo:"medio", peso:0.6,
        filtro:"texto", contexto:"deportes", channelId:s.channelId, verificado:true,
        nota: "canal de la ciudad: hay que filtrar por texto" }
    : { nom: s.nom, alcance:"propio", club:s.club, tipo:s.tipo || "medio",
        peso: s.tipo === "club" ? 1 : 0.8, filtro:"ninguno", contexto:"deportes",
        channelId: s.channelId, verificado:true });
  nuevas++;
}
if (nuevas) writeFileSync(aca("./medios.json"), JSON.stringify(medios, null, 1));

const cuenta = e => salida.filter(s => s.estado === e).length;
console.log("\n" + "─".repeat(70));
console.log(cuenta("vivo") + " vivos · " + cuenta("DORMIDO") + " dormidos · " +
            cuenta("OTRO") + " cambiaron de dueño · " +
            salida.filter(s => !s.estado).length + " no resueltos");
console.log(nuevas + " canales nuevos cargados en medios.json");
console.log("─".repeat(70) + "\n");
