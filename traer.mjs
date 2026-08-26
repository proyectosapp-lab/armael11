/* ══════════════════════════════════════════════════════════════════════════
   TRAER — la capa de red. Lo único de todo esto que puede fallar por causas
   ajenas, así que está aislado: si un medio se cae, el resto del feed sale igual.

   Entiende cuatro formatos, que son los cuatro que nos encontramos de verdad:
     rss            RSS 2.0 clásico (WordPress y casi todo lo demás)
     atom           Atom (El Doce lo llama "google-news-feed", es RSS igual)
     news-sitemap   XML de Google News: los que no exponen RSS
     youtube        el Atom de YouTube — GRATIS y SIN API KEY
   ══════════════════════════════════════════════════════════════════════════ */

/* Nos presentamos como lo que somos. Pero algunos sitios tienen un portero
   que rechaza cualquier user-agent que no parezca un navegador —Infocielo nos
   devolvió 403 con el honesto y 200 con el otro—, así que si el primero
   rebota se reintenta una vez. Un feed es público: el 403 es del portero,
   no una decisión del medio.                                              */
const UA_PROPIO  = "Mozilla/5.0 (compatible; tste/0.1; +feed reader)";
const UA_NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                     "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/* 25s y no 15: dos fuentes se caían por timeout y no por estar rotas.
   Un índice de sitemaps son dos pedidos encadenados y no entraba.       */
export async function bajar(url, ms = 25000, ua = UA_PROPIO) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "user-agent": ua, "accept-language": "es-AR,es;q=0.9" },
                                 signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) {
      if ((r.status === 403 || r.status === 429) && ua === UA_PROPIO) {
        clearTimeout(t);
        return bajar(url, ms, UA_NAVEGADOR);
      }
      throw new Error("HTTP " + r.status);
    }
    return await r.text();
  } finally { clearTimeout(t); }
}

/* ─── XML a mano ──────────────────────────────────────────────────────────
   Sin librerías. Los feeds son XML simple y regular; un parser completo
   sería traer 200 kB de dependencias para leer diez títulos.               */

const limpiar = s => (s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();

const bloques = (xml, tag) =>
  [...xml.matchAll(new RegExp("<" + tag + "[\\s>][\\s\\S]*?</" + tag + ">", "gi"))].map(m => m[0]);

const campo = (xml, ...tags) => {
  for (const tag of tags) {
    const m = xml.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
    if (m) return limpiar(m[1]);
  }
  return "";
};

/* <category>Femenino</category> repetido N veces por ítem */
const etiquetas = xml =>
  [...xml.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
    .map(m => limpiar(m[1])).filter(Boolean);

/* <enclosure url="...mp4" type="video/mp4" /> */
function multimedia(xml){
  const m = xml.match(/<enclosure[^>]*>/i);
  if(!m) return null;
  const url = m[0].match(/url\s*=\s*["']([^"']+)/i)?.[1];
  const tipo = m[0].match(/type\s*=\s*["']([^"']+)/i)?.[1] || "";
  if(!url) return null;
  return { url, tipo, esVideo: /^video\//.test(tipo) };
}

/* ── LA IMAGEN QUE EL MEDIO YA DECLARA ────────────────────────────────────
   No hay que ir a buscarla a ningún lado: los feeds la traen. RSS moderno
   la manda en <media:thumbnail>, en <media:content type="image/…"> o en un
   <enclosure> de imagen. Es la misma que usa WhatsApp cuando pegás el link.

   Dos reglas y ninguna más:
     · Solo se toma la que el feed declara. No se abre la nota a buscarla.
     · Se enlaza a su servidor, no se copia. La imagen es del medio y sigue
       siendo del medio; nosotros ponemos el link a su nota al lado.

   Devuelve null cuando no hay, que es la mitad de los casos: la tarjeta
   tiene que verse bien igual, no acomodarse alrededor de la foto.       */
export const soloHttps = u => (typeof u === "string" && /^https:\/\//i.test(u)) ? u : null;

export function imagenDe(xml) {
  const cand =
       atributo(xml, "media:thumbnail", "url")
    || xml.match(/<media:content[^>]*\btype\s*=\s*["']image\/[^"']*["'][^>]*\burl\s*=\s*["']([^"']+)/i)?.[1]
    || xml.match(/<media:content[^>]*\burl\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)?.[1]
    || xml.match(/<enclosure[^>]*\btype\s*=\s*["']image\/[^"']*["'][^>]*\burl\s*=\s*["']([^"']+)/i)?.[1]
    || atributo(xml, "image", "href")
    || "";
  return soloHttps(cand);
}

/* La miniatura de un video de YouTube no hay ni que buscarla: se arma con
   el id. `hqdefault` pesa unos 20 kB y existe para todos los videos.    */
export const miniaturaYT = id => id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : null;

/* De /2026/08/23/aldosivi-no-pudo-ganar/ a "Aldosivi no pudo ganar" */
export function tituloDesdeSlug(url){
  try{
    const partes = new URL(url).pathname.split("/").filter(Boolean);
    let slug = partes[partes.length-1] || "";
    if(/^\d+$/.test(slug) && partes.length>1) slug = partes[partes.length-2];  // /nota/12345
    slug = slug.replace(/\.(html?|php)$/i,"").replace(/[-_]+/g," ").trim();
    /* Si el slug no da un titular legible (ids numéricos, rutas cortas) se
       devuelve vacío y el ítem se descarta arriba. Mejor perderlo que
       mostrar una URL cruda donde va el título.                         */
    if(slug.length < 12 || slug.split(" ").length < 3) return "";
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  }catch(e){ return ""; }
}

const atributo = (xml, tag, attr) =>
  xml.match(new RegExp("<" + tag + "[^>]*\\b" + attr + "\\s*=\\s*[\"']([^\"']+)", "i"))?.[1] || "";

/* ─── un parser por formato ──────────────────────────────────────────────── */

const PARSERS = {
  rss: xml => bloques(xml, "item").map(b => ({
    titulo: campo(b, "title"),
    url: campo(b, "link") || atributo(b, "link", "href"),
    fecha: campo(b, "pubDate", "dc:date", "published"),
    resumen: campo(b, "description", "content:encoded").slice(0, 400),
    /* Las etiquetas del propio medio. Estaba tirándolas y son oro: el club
       ya clasificó la nota por nosotros — Femenino, Socios, Copa Argentina.
       Sale gratis y es más confiable que adivinar leyendo el título.      */
    categorias: etiquetas(b),
    /* Y el video, cuando el medio lo adjunta. El feed oficial de Belgrano
       manda el gol en mp4 como enclosure. No lo alojamos: se enlaza.      */
    media: multimedia(b),
    imagen: imagenDe(b),
  })),

  atom: xml => bloques(xml, "entry").map(b => ({
    titulo: campo(b, "title"),
    url: atributo(b, "link", "href") || campo(b, "id"),
    fecha: campo(b, "published", "updated"),
    resumen: campo(b, "summary", "content").slice(0, 400),
    imagen: imagenDe(b),
  })),

  /* ── SITEMAP SIN TÍTULOS ──────────────────────────────────────────────
     Algunos sitios apagaron el RSS pero publican sitemaps de posts. Esos
     traen la URL y la fecha, no el título — pero en WordPress el slug ES
     el titular: "aldosivi-no-pudo-ganar-ni-con-un-gol-de-mitad-de-cancha".
     Se reconstruye de ahí.

     Ojo con lo que se pierde: el slug viene sin acentos, sin signos y sin
     mayúsculas de nombres propios. El título queda legible pero no exacto,
     así que cada ítem sale marcado como aproximado — y quien lo muestre
     tiene que saberlo. Esto NO es scraping: un sitemap es un archivo que
     el sitio publica para máquinas, igual que un RSS.                    */
  "sitemap-slug": xml => bloques(xml, "url").map(b => {
    const url = campo(b, "loc");
    return {
      titulo: tituloDesdeSlug(url),
      url,
      fecha: campo(b, "lastmod") || campo(b, "news:publication_date"),
      resumen: "",
      tituloAproximado: true,
    };
  }),

  "news-sitemap": xml => bloques(xml, "url").map(b => ({
    titulo: campo(b, "news:title") || campo(b, "title"),
    url: campo(b, "loc"),
    fecha: campo(b, "news:publication_date") || campo(b, "lastmod"),
    resumen: campo(b, "news:keywords"),
    imagen: imagenDe(b),
  })),

  /* ── WORDPRESS SIN FEED ────────────────────────────────────────────────
     Estudiantes de La Plata tiene WordPress y tiene el /feed/ roto: pedirlo
     devuelve el HTML del home. Pero la REST API que viene con WordPress
     responde igual, y devuelve lo mismo que devolvería el RSS.

     No es scraping ni es una puerta de atrás: /wp-json/wp/v2/posts es una
     API pública documentada, la misma que usa el panel del sitio. Sale JSON
     en vez de XML, nada más. Vale para cualquier club que apague el feed y
     se olvide de apagar esto —que son casi todos.

     Lo que se pierde: las categorías vienen como números, no como palabras,
     así que la clasificación por etiquetas del medio no funciona acá.     */
  "wp-json": txt => {
    const posts = JSON.parse(txt);
    if (!Array.isArray(posts)) throw new Error("wp-json: no devolvió una lista");
    return posts.map(p => ({
      titulo: limpiar(p.title?.rendered || ""),
      url: p.link || "",
      fecha: p.date_gmt ? p.date_gmt + "Z" : p.date,
      resumen: limpiar(p.excerpt?.rendered || "").slice(0, 400),
      /* WordPress la publica en el mismo JSON cuando el sitio tiene Jetpack
         o cuando se pidió con `_embed`. Si no está, no está.            */
      imagen: soloHttps(p.jetpack_featured_media_url
                     || p._embedded?.["wp:featuredmedia"]?.[0]?.source_url),
    }));
  },

  youtube: xml => bloques(xml, "entry").map(b => ({
    titulo: campo(b, "title", "media:title"),
    url: atributo(b, "link", "href"),
    fecha: campo(b, "published"),
    resumen: campo(b, "media:description").slice(0, 400),
    videoId: campo(b, "yt:videoId"),
  })),
};

/* Si no viene declarado, se deduce mirando el XML. */
export function detectar(xml) {
  const cabeza = xml.slice(0, 1200).toLowerCase();
  if (cabeza.includes("<urlset")) return "news-sitemap";
  if (cabeza.includes("yt:") || cabeza.includes("youtube.com/xml")) return "youtube";
  if (cabeza.includes("<rss") || cabeza.includes("<rdf:rdf")) return "rss";
  if (cabeza.includes("<feed")) return "atom";
  return null;
}

/* ─── URL de una fuente ──────────────────────────────────────────────────── */

export function urlDe(f) {
  if (f.url) return f.url;
  if (f.playlistId) return "https://www.youtube.com/feeds/videos.xml?playlist_id=" + f.playlistId;
  if (f.channelId)  return "https://www.youtube.com/feeds/videos.xml?channel_id="  + f.channelId;
  return null;
}

/* ─── traer todas ────────────────────────────────────────────────────────────
   En paralelo, y una que falle no voltea a las demás: cada fuente devuelve
   sus ítems o su error, nunca revienta el proceso entero.                   */

export async function traerTodas(fuentes, log = () => {}) {
  const activas = fuentes.filter(f => f.activo !== false && urlDe(f));
  return Promise.all(activas.map(async f => {
    const url = urlDe(f);
    try {
      let xml = await bajar(url);

      /* Un índice de sitemaps no tiene notas: tiene la lista de archivos.
         Se toma el más reciente y se baja ese. Dos pedidos en vez de uno,
         y solo para las fuentes que lo necesitan.                        */
      if(/<sitemapindex/i.test(xml.slice(0,600))){
        const hijos = [...xml.matchAll(/<sitemap>[\s\S]*?<\/sitemap>/gi)].map(m => ({
          loc: campo(m[0],"loc"), mod: +new Date(campo(m[0],"lastmod")) || 0 }));
        /* Ordena del más nuevo al más viejo, así que el que queremos es el
           PRIMERO. Estuvo con .pop() —el último— y por eso El Litoral, que
           tiene un sitemap por mes desde 2004, bajaba noviembre de 2004 y
           devolvía "feed vacío". Un bug así no se ve leyendo el código:
           se ve cuando el log dice qué archivo bajó.                     */
        const elegido = hijos.filter(h => !f.patronHijo || new RegExp(f.patronHijo,"i").test(h.loc))
                             .sort((a,b) => b.mod - a.mod || b.loc.localeCompare(a.loc))[0];
        if(!elegido) throw new Error("índice de sitemaps sin hijos usables");
        log("    (índice: bajo " + elegido.loc.split("/").pop() + ")");
        xml = await bajar(elegido.loc);
      }

      const formato = f.formato || detectar(xml);
      if (!formato) throw new Error("no parece un feed");
      const items = PARSERS[formato](xml).filter(i => i.titulo && i.url);
      if (!items.length) throw new Error("feed vacío");

      /* Un feed no se valida por responder: se valida por su última fecha.
         Cadena 3 nos enseñó esto — responde 200 y su última nota es de 2018. */
      const fechas = items.map(i => +new Date(i.fecha)).filter(n => !isNaN(n) && n > 0);
      const dias = fechas.length ? (Date.now() - Math.max(...fechas)) / 864e5 : null;
      if (dias != null && dias > 45) {
        log("  ✗ " + f.nom + " — MUERTO: última nota hace " + Math.round(dias) + " días");
        return { fuente: f, items: [], error: "muerto hace " + Math.round(dias) + " días" };
      }

      log("  ✓ " + f.nom + " — " + items.length + " ítems" +
          (dias != null ? " · más nuevo hace " + (dias < 1 ? Math.round(dias * 24) + "h"
                                                           : Math.round(dias) + "d") : ""));
      return { fuente: f, items };
    } catch (e) {
      log("  ✗ " + f.nom + " — " + e.message);
      return { fuente: f, items: [], error: e.message };
    }
  }));
}
