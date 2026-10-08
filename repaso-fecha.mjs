/* ══════════════════════════════════════════════════════════════════════════
   REPASO-FECHA — "Fecha N: lo que pasó", una página por fecha jugada de la
   Liga Profesional, escrita con los datos.

   8/10/2026, parte del plan contra el segundo rechazo de AdSense
   (claude/adsense-segundo-rechazo.md, punto 3): el sitio necesitaba texto
   con valor propio, no solo páginas automáticas de 170 palabras. Esto son
   500-800 palabras por fecha: los quince resultados con la estadística que
   movió la aguja de cada uno, el partido de la fecha, cuántas sorpresas
   hubo y qué dijo el modelo, y la tabla después de la fecha.

   Sale de `estadisticas/argentina.json` (la corrida semanal) y se arma en
   cada publicación, sin red: `construir-sitio.mjs` escribe
   `repasos/<liga>-<torneo>-fecha-<n>.html` y `repasos/index.html`, y la
   portada enlaza el último.

   LO QUE PONE FAUSTO: si existe `repasos/notas/<liga>-<torneo>-<n>.md`
   (por ejemplo `argentina-clausura-11.md`), su texto va arriba del repaso
   como "La mirada", párrafo por párrafo. Es lo que un revisor llama valor y
   lo que un hincha lee primero; los datos son el piso, no el techo.

   REGLAS: el modelo está medido (lo que dijo / lo que pasó), nunca cómo se
   calcula; ni una palabra de apuestas; app independiente. Tuteo neutro.
   ══════════════════════════════════════════════════════════════════════════ */
import { CSS } from "./paginas-medido.mjs";
import { esJugado, puntoDe, aguja, urlPartido, aSlug } from "./consulta-datos.mjs";
import { calcular, torneoDe } from "./stats-calc.mjs";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const pct = x => Math.round(x * 100) + "%";
const ZONA = "America/Argentina/Buenos_Aires";
const dia = iso => new Date(iso).toLocaleDateString("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
const coma = x => String(x).replace(".", ",");

/* "Clausura - 11" → { torneo: "Clausura", n: 11 }; "Regular Season - 7" → { torneo: "Regular Season", n: 7 } */
export const rondaDe = r => { const m = String(r || "").match(/^(.*?)\s*-\s*(\d+)$/); return m ? { torneo: m[1].trim(), n: +m[2] } : null; };
const nombreTorneo = t => /regular season/i.test(t) ? "" : t;
export const rutaRepaso = (liga, torneo, n) => "repasos/" + aSlug(liga) + "-" + (nombreTorneo(torneo) ? aSlug(nombreTorneo(torneo)) + "-" : "") + "fecha-" + n + ".html";
export const claveNotas = (liga, torneo, n) => aSlug(liga) + "-" + (nombreTorneo(torneo) ? aSlug(nombreTorneo(torneo)) + "-" : "") + n;

/* Las fechas enteras: todas las de un torneo con TODOS sus partidos
   jugados. Una fecha a medias no se repasa (saldría con tres partidos). */
export function fechasCompletas(partidos) {
  const porRonda = new Map();
  for (const p of partidos) { const r = rondaDe(p.ronda); if (!r) continue; const k = r.torneo + "|" + r.n; (porRonda.get(k) || porRonda.set(k, { ...r, partidos: [] }).get(k)).partidos.push(p); }
  return [...porRonda.values()].filter(f => f.partidos.length >= 4 && f.partidos.every(esJugado))
    .sort((a, b) => a.torneo.localeCompare(b.torneo) || a.n - b.n);
}

/* Notas de Fausto en markdown chico: párrafos, **negrita**, *cursiva*. */
export function notasHTML(md) {
  if (!md || !md.trim()) return "";
  return md.trim().split(/\n\s*\n/).map(p => "<p>" + esc(p.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n/g, "<br>") + "</p>").join("\n");
}

/* ─── el texto de una fecha ─────────────────────────────────────────────── */
export function repasoDe({ liga, nombreLiga, fecha, partidosTorneo, RAIZ = "", notas = "", temporada }) {
  const P = fecha.partidos.slice().sort((a, b) => +new Date(a.fecha) - +new Date(b.fecha));
  const goles = P.reduce((a, m) => a + m.gl + m.gv, 0);
  const locales = P.filter(m => m.gl > m.gv).length, empates = P.filter(m => m.gl === m.gv).length, visitas = P.length - locales - empates;
  const conModelo = P.filter(m => m.p);
  const puntos = conModelo.map(m => puntoDe(m.p, m.gl, m.gv));
  const verdes = puntos.filter(x => x === "verde").length, naranjas = puntos.filter(x => x === "naranja").length, grises = puntos.filter(x => x === "gris").length;
  const titulo = (nombreTorneo(fecha.torneo) ? nombreTorneo(fecha.torneo) + " " + temporada + ", fecha " + fecha.n : "Fecha " + fecha.n) + ": lo que pasó";

  /* el partido de la fecha: la sorpresa más grande; si no hubo, la goleada */
  const sorpresas = conModelo.filter(m => puntoDe(m.p, m.gl, m.gv) === "naranja").sort((a, b) => Math.max(b.p.H, b.p.A) - Math.max(a.p.H, a.p.A));
  const goleadas = P.slice().sort((a, b) => Math.abs(b.gl - b.gv) - Math.abs(a.gl - a.gv) || (b.gl + b.gv) - (a.gl + a.gv));
  const destacado = sorpresas[0] || goleadas[0];
  const esSorpresa = !!sorpresas[0];
  const fav = destacado.p ? (destacado.p.H >= destacado.p.A ? destacado.nl : destacado.nv) : "";
  const pfav = destacado.p ? Math.max(destacado.p.H, destacado.p.A) : 0;
  const frase = esSorpresa
    ? `${esc(destacado.nl)} ${destacado.gl}-${destacado.gv} ${esc(destacado.nv)}. El modelo le daba ${pct(pfav)} a ${esc(fav)} y pasó otra cosa. ${esc(aguja(destacado))}`
    : `${esc(destacado.nl)} ${destacado.gl}-${destacado.gv} ${esc(destacado.nv)}, la diferencia más grande de la fecha. ${esc(aguja(destacado))}`;

  /* la tabla después de la fecha: solo los partidos del torneo hasta acá */
  const hasta = partidosTorneo.filter(m => { const r = rondaDe(m.ronda); return r && r.n <= fecha.n && esJugado(m); })
    .map(m => ({ id: m.id, fecha: m.fecha, ronda: m.ronda, h: m.local, hn: m.nl, a: m.visita, an: m.nv, gh: m.gl, ga: m.gv, th: m.st && m.st.tl, ta: m.st && m.st.tv, xh: m.st && m.st.xl != null ? m.st.xl : null, xa: m.st && m.st.xv != null ? m.st.xv : null }));
  let tabla = [];
  try { const st = calcular(hasta); const t = st.tablas.find(x => x.nombre === fecha.torneo) || st.tablas[0]; tabla = t ? t.filas : []; } catch (e) { tabla = []; }
  const arriba = tabla.slice(0, 6), abajo = tabla.slice(-3);
  const lider = tabla[0];
  const filaTabla = f => `<tr><td>${f.pos}</td><td class="l">${esc(f.nom)}</td><td>${f.pj}</td><td><b>${f.pts}</b></td><td>${f.dg > 0 ? "+" : ""}${f.dg}</td></tr>`;

  const lista = P.map(m => {
    const punto = m.p ? puntoDe(m.p, m.gl, m.gv) : null;
    const linea = aguja(m);
    return `<li><a href="/${esc(urlPartido(liga, m))}"><b>${esc(m.nl)} ${m.gl}-${m.gv} ${esc(m.nv)}</b></a>${punto ? ` <span class="pt ${punto}" title="${punto === "verde" ? "lo que decía el modelo" : punto === "gris" ? "daba parejo" : "sorpresa"}"></span>` : ""}${linea ? `<br><span class="chico">${esc(linea)}</span>` : ""}</li>`;
  }).join("\n");

  const modeloTexto = conModelo.length
    ? `<p>De los ${conModelo.length} partidos con número, en <b>${verdes}</b> pasó lo que el modelo ponía arriba, <b>${grises}</b> ${grises === 1 ? "era" : "eran"} parejo${grises === 1 ? "" : "s"} y salió otra cosa, y ${naranjas ? `hubo <b>${naranjas}</b> sorpresa${naranjas === 1 ? "" : "s"}` : "no hubo sorpresas"}: ${naranjas ? "un favorito claro que no ganó" : "ningún favorito claro se cayó"}. ${verdes / conModelo.length >= 0.6 ? "Una fecha lógica." : verdes / conModelo.length <= 0.35 ? "Una fecha de las que dan vuelta la tabla." : "Una fecha normal: el fútbol argentino es la liga donde el modelo le gana menos a la vara, y esto es lo que eso quiere decir en la cancha."} Cada número se publicó antes del partido y <a href="/es-suerte.html">está medido</a>.</p>`
    : "";

  const cuerpo = `
<h1>${esc(titulo)}</h1>
<p class="bajada">${esc(nombreLiga)} · se jugó entre el ${esc(dia(P[0].fecha))} y el ${esc(dia(P[P.length - 1].fecha))}.</p>
${notas ? `<h2>La mirada</h2>\n${notasHTML(notas)}` : ""}
<h2>La fecha en números</h2>
<p>${P.length} partidos y <b>${goles} goles</b>, ${coma((goles / P.length).toFixed(2))} por partido. Ganó el local en ${locales}, hubo ${empates} empate${empates === 1 ? "" : "s"} y ${visitas} visitante${visitas === 1 ? "" : "s"} se ${visitas === 1 ? "llevó" : "llevaron"} los tres puntos.${lider ? ` Después de la fecha, arriba está <b>${esc(lider.nom)}</b> con ${lider.pts} puntos en ${lider.pj} partidos.` : ""}</p>
${modeloTexto}
<h2>El partido de la fecha</h2>
<p>${frase}</p>
<h2>Partido por partido</h2>
<p class="chico">El punto de cada uno: verde, pasó lo que el modelo ponía arriba; gris, daba parejo; naranja, sorpresa. Cada partido tiene su página con los números.</p>
<ul class="lista">
${lista}
</ul>
${tabla.length ? `<h2>La tabla después de la fecha</h2>
<table><tr><th>#</th><th class="l">Equipo</th><th>PJ</th><th>Pts</th><th>DG</th></tr>${arriba.map(filaTabla).join("")}${tabla.length > 9 ? `<tr><td colspan="5" class="chico">…</td></tr>${abajo.map(filaTabla).join("")}` : tabla.slice(6).map(filaTabla).join("")}</table>
<p class="chico">Calculada por la app sobre los partidos jugados del ${esc(nombreTorneo(fecha.torneo) || "torneo")}. La tabla completa, con rachas y récords, está en la pestaña Números.</p>` : ""}
<h2>¿Y con otro once?</h2>
<p>Cada partido de la próxima fecha se puede armar y simular: el once, la formación y el planteo de los dos, 6.000 veces.</p>
<p><a class="ir" href="/">Simular la próxima fecha</a></p>
`;
  return { ruta: rutaRepaso(liga, fecha.torneo, fecha.n), titulo, torneo: fecha.torneo, n: fecha.n, fecha: P[P.length - 1].fecha, indexar: true,
    html: pagina({ RAIZ, ruta: rutaRepaso(liga, fecha.torneo, fecha.n), titulo: titulo + " · " + nombreLiga,
      descripcion: `${titulo}. ${P.length} partidos, ${goles} goles, ${naranjas} sorpresa${naranjas === 1 ? "" : "s"}. Resultado por resultado, con la estadística que movió la aguja y la tabla después de la fecha.`,
      cuerpo }) };
}

const CSS_EXTRA = `
  .bajada{color:var(--suave);font-size:15px;margin:0 0 18px}
  .lista{list-style:none;padding:0;margin:0 0 14px}
  .lista li{border-bottom:1px solid var(--borde);padding:10px 0;margin:0}
  .lista a{text-decoration:none}
  .pt{display:inline-block;width:10px;height:10px;border-radius:50%;margin-left:7px;vertical-align:1px}
  .pt.verde{background:#1E8A4A} .pt.gris{background:#9AA3AF} .pt.naranja{background:#E07A1F}
  .chico{font-size:14px;color:var(--suave)}
  table{width:100%;border-collapse:collapse;background:var(--papel);border:1px solid var(--borde);border-radius:12px;overflow:hidden;font-size:14px;margin:8px 0 6px}
  th,td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--borde)} th{color:var(--suave);font-size:12px;text-transform:uppercase;letter-spacing:.4px}
  td.l,th.l{text-align:left} tr:last-child td{border-bottom:0}
  .ir{display:inline-block;background:#0B4F3A;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700}
  .miga{font-size:14px;color:var(--suave);margin:4px 0 22px}.miga a{color:var(--suave)}
  .marca{display:inline-block;font-weight:800;text-decoration:none;color:inherit;margin-bottom:6px}
  .indice li{margin:8px 0}
`;
function pagina({ RAIZ, ruta, titulo, descripcion, cuerpo }) {
  const canon = RAIZ ? RAIZ + "/" + ruta.replace(/index\.html$/, "") : "";
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titulo)} · Armá el 11</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="index,follow">
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ""}
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<style>
${CSS}${CSS_EXTRA}</style></head><body><div class="caja">
<a class="marca" href="/">Armá el 11</a>
<div class="miga"><a href="/repasos/">Repasos</a> · <a href="/consulta/argentina/">Liga Profesional</a></div>
${cuerpo}
<footer>
  Armá el 11 es una app independiente, sin relación con ningún club ni con
  ninguna liga. Es un simulador: lo que se cobra son más simulaciones.<br>
  <a href="/">Inicio</a> · <a href="/consulta/">Partidos y equipos</a> ·
  <a href="/como-funciona.html">Cómo funciona</a> · <a href="/privacidad.html">Privacidad</a> ·
  <a href="/terminos.html">Términos</a> · <a href="/contacto.html">Contacto</a>
</footer>
</div></body></html>
`;
}

/* ─── todas las páginas de repaso de una liga, más el índice ────────────── */
export function paginasRepaso({ datos, info, RAIZ = "", notasDe = () => "" }) {
  if (!datos || !Array.isArray(datos.partidos) || !info) return [];
  const liga = info.slug, nombreLiga = `${info.nombre} (${info.pais})`;
  const partidos = datos.partidos.filter(p => p.id && p.local && p.visita);
  const fechas = fechasCompletas(partidos);
  if (!fechas.length) return [];
  const temporada = datos.temporada || new Date().getFullYear();
  const out = fechas.map(f => repasoDe({ liga, nombreLiga, fecha: f, temporada, RAIZ,
    partidosTorneo: partidos.filter(m => rondaDe(m.ronda) && rondaDe(m.ronda).torneo === f.torneo),
    notas: notasDe(claveNotas(liga, f.torneo, f.n)) }));
  /* el índice: del más nuevo al más viejo */
  const orden = out.slice().sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
  const items = orden.map(p => `<li><a href="/${esc(p.ruta)}"><b>${esc(p.titulo)}</b></a><br><span class="chico">${esc(dia(p.fecha))}</span></li>`).join("\n");
  out.push({ ruta: "repasos/index.html", titulo: "Repasos de cada fecha", indexar: true, fecha: orden[0].fecha, esIndice: true,
    html: pagina({ RAIZ, ruta: "repasos/index.html", titulo: "Repasos de cada fecha · " + nombreLiga,
      descripcion: "Fecha por fecha de la Liga Profesional: los resultados, la estadística que movió la aguja de cada partido, lo que el modelo dijo antes y la tabla después.",
      cuerpo: `<h1>Repasos de cada fecha</h1><p class="bajada">${esc(nombreLiga)}. Lo que pasó, partido por partido, con lo que el modelo había dicho antes.</p><ul class="lista indice">${items}</ul>` }) });
  return out;
}
export const ultimoRepaso = paginas => paginas.filter(p => !p.esIndice).sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha))[0] || null;
