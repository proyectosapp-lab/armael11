/* ══════════════════════════════════════════════════════════════════════════
   PORTADA-TEXTO — lo que la portada dice sin JavaScript.

   8/10/2026. AdSense rechazó armael11.com dos veces por "contenido de bajo
   valor", y la portada —la página que mira primero— tenía 83 palabras en
   el HTML: el resto lo dibuja la app. Esto es texto de verdad, en HTML
   común, debajo del simulador: qué es, cómo se usa, qué está medido, la
   próxima fecha de la Liga Profesional con sus enlaces, y dónde bajar la
   app. Unas 500 palabras que cambian con los datos.

   LAS REGLAS DEL TEXTO (las de siempre):
   - El modelo está MEDIDO: lo que dijo y lo que pasó. Nunca cómo se calcula.
   - Ni una palabra de apuestas. Es un simulador y un juego entre amigos.
   - "App independiente", siempre.
   - Tuteo neutro: nada de "vos", botones en infinitivo.

   ADENTRO DE LA APP NO VA. El empaquetador (empaquetar-mam.mjs) saca todo
   lo que hay entre <!-- portada:inicio --> y <!-- portada:fin -->, y por si
   acaso el CSS lo esconde con body.mam-marco. Cuatrocientas palabras
   arriba del simulador en la app de las tiendas no son contenido, son
   estorbo.
   ══════════════════════════════════════════════════════════════════════════ */
import { urlPartido } from "./consulta-datos.mjs";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const ZONA = "America/Argentina/Buenos_Aires";
const dia = iso => new Date(iso).toLocaleDateString("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
const hora = iso => new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const rondaLegible = r => {
  const t = String(r || "").trim(), m = t.match(/^(.*?)\s*-\s*(\d+)$/);
  if (!m) return t;
  return /regular season/i.test(m[1]) ? "Fecha " + m[2] : m[1] + ", fecha " + m[2];
};

export const MARCA_INICIO = "<!-- portada:inicio -->";
export const MARCA_FIN = "<!-- portada:fin -->";

/* Los botones de descarga. Sin logos ajenos: son botones de texto con el
   nombre de cada tienda, que es lo que Apple y Google piden como mínimo.
   Si el repo tiene las insignias oficiales (app-store-badge.svg y
   google-play-badge.png, bajadas de las páginas de marketing de cada uno),
   construir-sitio las pasa en `insignias` y van esas. */
export function botonesDeTiendas({ apple = "", play = "", insignias = {} } = {}) {
  const b = [];
  if (apple) b.push(insignias.apple
    ? `<a class="tienda" href="${esc(apple)}" rel="noopener"><img src="${esc(insignias.apple)}" alt="Descargar en el App Store" height="44"></a>`
    : `<a class="tienda" href="${esc(apple)}" rel="noopener"><small>Descargar en el</small><b>App Store</b></a>`);
  if (play) b.push(insignias.play
    ? `<a class="tienda" href="${esc(play)}" rel="noopener"><img src="${esc(insignias.play)}" alt="Disponible en Google Play" height="44"></a>`
    : `<a class="tienda" href="${esc(play)}" rel="noopener"><small>Disponible en</small><b>Google Play</b></a>`);
  return b.length ? `<div class="tiendas">${b.join("")}</div>` : "";
}

/* La próxima fecha: los partidos de la primera ronda que falta jugar. */
export function proximaFecha(proximos = [], { liga = "argentina", max = 15 } = {}) {
  const lista = (proximos || []).filter(p => p && p.id && p.nl && p.nv && p.fecha);
  if (!lista.length) return null;
  const ronda = lista[0].ronda || "";
  const deLaRonda = lista.filter(p => (p.ronda || "") === ronda).slice(0, max);
  return { ronda: rondaLegible(ronda), partidos: deLaRonda.map(p => ({
    id: p.id, nl: p.nl, nv: p.nv, fecha: p.fecha, ruta: "/" + urlPartido(liga, p) })) };
}

export function textoPortada({ proximos = [], tiendas = {}, statsArgentina = null, numeroDeLigas = 11, repaso = null, hoy = new Date() } = {}) {
  const fecha = proximaFecha(proximos);
  const st = statsArgentina && statsArgentina.promedios ? statsArgentina : null;
  const partidos = fecha ? fecha.partidos.map(p =>
    `<li><a href="${esc(p.ruta)}">${esc(p.nl)} – ${esc(p.nv)}</a> <span class="cuando">${esc(dia(p.fecha))}, ${esc(hora(p.fecha))}</span></li>`).join("") : "";
  const bloqueFecha = fecha ? `
  <h2>La próxima fecha de la Liga Profesional</h2>
  <p>${esc(fecha.ronda)}. Cada partido tiene su página con cómo llega cada equipo; el número vive en el simulador.</p>
  <ul class="fecha">${partidos}</ul>
  <p><a href="/consulta/argentina/">Todos los partidos y equipos de la Liga Profesional</a> · <a href="/consulta/">Las ${numeroDeLigas} ligas</a></p>` : `
  <h2>Partidos y equipos</h2>
  <p>Cada partido jugado de las ${numeroDeLigas} ligas tiene su página: el resultado, los números y lo que el modelo decía antes. <a href="/consulta/">Entrar a la consulta</a>.</p>`;
  const bloqueNumeros = st ? `
  <p>En lo que va de ${esc(String(st.temporada || hoy.getFullYear()))}, la Liga Profesional lleva ${st.partidosJugados} partidos con ${esc(String(st.promedios.golesPorPartido).replace(".", ","))} goles por partido: el local ganó el ${esc(String(st.promedios.local).replace(".", ","))}% y hubo empate en el ${esc(String(st.promedios.empate).replace(".", ","))}%. Son los números que el simulador usa como punto de partida, y están en la pestaña Números, liga por liga.</p>` : "";

  return `${MARCA_INICIO}
<section class="portada-texto" id="que-es">
  <h2>Qué es Armá el 11</h2>
  <p>Armá el 11 es un simulador de partidos de fútbol. Eliges un partido de cualquiera de las ${numeroDeLigas} ligas disponibles, armas los dos equipos como quieras —el once, la formación, cuánto presiona cada uno, qué tan arriba se para la línea— y el partido se juega 6.000 veces con los goles reales de esa liga. Lo que sale es lo que pasa, en promedio, con el planteo que elegiste. Cambia una perilla y se mueve el resultado.</p>
  <p>Es una app independiente, sin relación con ningún club, con ninguna liga ni con ningún medio. No tiene contenido de juego con dinero: es un simulador y un juego entre amigos.</p>

  <h2>Cómo se usa</h2>
  <p>Elige tu club y la portada te muestra su próximo partido con el once probable. Toca un jugador para cambiarlo, elige la formación y mueve las perillas del planteo. Simular lleva un segundo, y el resultado viene con cuán raro fue: un 3-0 que sale una vez cada veinte simulaciones se dice así. En la pestaña <a href="/#numeros">Números</a> está la tabla, las rachas y los récords de cada liga, con un desplegable para elegir cuál.</p>
  <p>Con una cuenta puedes guardar tus equipos y desafiar a tus amigos: eliges unos partidos, les mandas el link y gana el que mejor lee los partidos. Los desafíos, los juegos y los resultados son gratis siempre; el simulador sin tope es del plan Fútbol.</p>

  <h2>Está medido</h2>
  <p>Cada vez que el modelo da un número antes de un partido, ese número queda guardado y después se compara con lo que pasó. Esa comparación es pública: <a href="/como-funciona.html">cómo funciona</a>, <a href="/el-techo-del-futbol.html">el techo del fútbol</a> (cuánto se puede anticipar, como mucho, en este deporte), <a href="/es-suerte.html">¿es suerte?</a> y <a href="/ligas.html">qué pasa liga por liga</a>. En Argentina el modelo le gana poco a la vara; en Portugal, bastante. Las dos cosas se dicen.</p>${bloqueNumeros}${repaso ? `
  <p>Cada fecha de la Liga Profesional tiene su repaso, escrito con los datos: los resultados, la estadística que movió la aguja de cada partido, lo que el modelo había dicho y la tabla después. El último: <a href="/${esc(repaso.ruta)}">${esc(repaso.titulo)}</a>. <a href="/repasos/">Todos los repasos</a>.</p>` : ""}
${bloqueFecha}

  <h2>La app: Mano a mano</h2>
  <p>El simulador también vive en <b>Mano a mano</b>, la app para iPhone y Android que junta fútbol, tenis y NBA en un solo lugar: el partido de cada deporte, los desafíos entre amigos y tres juegos para el rato muerto. Se baja gratis.</p>
  ${botonesDeTiendas(tiendas)}
  <p class="chico">O sigue en la web: funciona igual desde el navegador del teléfono, y se puede agregar a la pantalla de inicio.</p>
</section>
${MARCA_FIN}
`;
}

/* El CSS del bloque, para pegar en la hoja de la app. Pensado para leerse,
   no para competir con el simulador: va debajo, en el ancho de la columna. */
export const CSS_PORTADA = `
.portada-texto{max-width:680px;margin:28px auto 8px;padding:0 4px;font-size:16px;line-height:1.65;color:var(--tinta,inherit)}
.portada-texto h2{font-size:17px;letter-spacing:.02em;margin:26px 0 8px}
.portada-texto p{margin:0 0 12px}
.portada-texto a{color:inherit}
.portada-texto ul.fecha{list-style:none;padding:0;margin:0 0 12px}
.portada-texto ul.fecha li{padding:7px 0;border-bottom:1px solid var(--linea,rgba(0,0,0,.1));display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.portada-texto .cuando{font-size:14px;opacity:.75}
.portada-texto .chico{font-size:14px;opacity:.8}
.tiendas{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 10px}
.tiendas .tienda{display:inline-flex;flex-direction:column;justify-content:center;min-height:44px;padding:6px 16px;border-radius:10px;background:#101418;color:#fff;text-decoration:none;line-height:1.15}
.tiendas .tienda small{font-size:11px;opacity:.85}.tiendas .tienda b{font-size:17px}
.tiendas .tienda img{display:block;height:44px;width:auto}
body.mam-marco .portada-texto{display:none!important}
`;
