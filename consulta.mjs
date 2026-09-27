/* ══════════════════════════════════════════════════════════════════════════
   CONSULTA — las páginas de partidos, equipos y ligas.

     /consulta/                             las once ligas
     /consulta/<liga>/                      la liga: próxima fecha, lo que
                                            pasó, los equipos
     /consulta/<liga>/<local>-<visita>-<id>.html   un partido
     /consulta/<liga>/equipos/<equipo>.html        un equipo

   27/9/2026, fase 2 de `claude/sitio-de-consulta.md`. Las arma
   `construir-sitio.mjs` con dos cosas que ya existen: `estadisticas/*.json`
   (la corrida semanal) y `sitio/datos/liga-*.js` (la próxima fecha, que se
   baja todos los días).

   LAS REGLAS:

   1. **Un partido por jugar NO lleva número.** Decisión de Fausto (27/9):
      el número vive adentro del simulador. La página de un próximo cuenta
      cómo llegan los dos y manda a simularlo. Una prueba mira que en esas
      páginas no haya ni un porcentaje.
   2. **Un partido jugado SÍ lleva lo que daba el modelo**, con su puntito
      y la estadística que movió la aguja. Ya es historia, y es lo único
      que se puede verificar: el mejor argumento que tiene la app.
   3. **Cada página dice cosas que la de al lado no dice**: su resultado,
      su estadio, su árbitro, sus estadísticas, cómo llegaba cada uno. Cien
      páginas iguales con el nombre cambiado es lo que Google castiga.
   4. **Tono de venta**, como las de "está medido": el número adelante, lo
      justo, y siempre un botón para simular.
   ══════════════════════════════════════════════════════════════════════════ */
import { CSS } from "./paginas-medido.mjs";
import { esJugado, puntoDe, aguja, numerosDeEquipos, caraACara,
         urlLiga, urlPartido, urlEquipo } from "./consulta-datos.mjs";
import { gruposDeLigas } from "./paginas-medido.mjs";

const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const pct = x => Math.round(x * 100) + "%";
const dec = x => Number(x).toFixed(1).replace(".", ",");
const ZONA = "America/Argentina/Buenos_Aires";
const dia = iso => new Date(iso).toLocaleDateString("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
const diaCorto = iso => new Date(iso).toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "short" });
const hora = iso => new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const n = (k, uno, varios) => k + " " + (k === 1 ? uno : varios);
/* Los pedazos de una bajada, sin "·" colgando cuando falta alguno. */
const juntar = (...xs) => xs.filter(Boolean).join(" · ");
/* "Regular Season - 7" → "Fecha 7"; "Clausura - 11" → "Clausura, fecha 11". */
const ronda = r => {
  const t = String(r || "").trim(), m = t.match(/^(.*?)\s*-\s*(\d+)$/);
  if (!m) return t;
  return /regular season/i.test(m[1]) ? "Fecha " + m[2] : m[1] + ", fecha " + m[2];
};

/* ── LEER LA PRÓXIMA FECHA DE `sitio/datos/liga-<slug>.js` ──────────────── */
export function leerLigaJs(texto) {
  const m = String(texto || "").match(/window\.LIGAS\["([^"]+)"\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!m) return null;
  try { return JSON.parse(m[2]); } catch (e) { return null; }
}

/* Los próximos: de la liga del día (la hora buena) si está; si no, de la
   corrida semanal. Estadio y árbitro, de la semanal, que los trae. */
export function proximosDe(datos, ligaJs, ahora = Date.now()) {
  const porId = new Map((datos?.partidos || []).map(p => [p.id, p]));
  const futuros = p => !esJugado(p) && new Date(p.fecha).getTime() > ahora - 3 * 3600e3 &&
                       !["PST", "CANC", "ABD", "AWD", "WO"].includes(p.estado);
  let lista;
  if (ligaJs && Array.isArray(ligaJs.partidos) && ligaJs.partidos.length) {
    const nom = id => (ligaJs.equipos?.[id]?.n) || "";
    lista = ligaJs.partidos.map(p => {
      const s = porId.get(p.id) || {};
      return { id: p.id, fecha: p.fecha, ronda: p.ronda || s.ronda || "", estado: p.estado || "NS",
               local: p.local, visita: p.visita,
               nl: s.nl || nom(p.local), nv: s.nv || nom(p.visita),
               gl: p.golL ?? null, gv: p.golV ?? null,
               estadio: s.estadio || null, ciudad: s.ciudad || null, arbitro: s.arbitro || null,
               enApp: true };
    });
  } else lista = (datos?.partidos || []).map(p => ({ ...p, enApp: false }));
  return lista.filter(futuros).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

/* ── EL ARMAZÓN ─────────────────────────────────────────────────────────── */
const CSS_EXTRA = `
  .miga{font-size:14px;color:var(--suave);margin:4px 0 22px}
  .miga a{color:var(--suave)}
  .lista{list-style:none;padding:0;margin:0 0 14px}
  .lista li{border-bottom:1px solid var(--borde);padding:11px 0;margin:0}
  .lista a{text-decoration:none}
  .lista .q{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
  .lista .s{font-size:14px;color:var(--suave);margin-top:2px}
  .res{font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
  .pt{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:1px}
  .pt.verde{background:#1E8A4A} .pt.gris{background:#9AA3AF} .pt.naranja{background:#E07A1F}
  .barra3{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:10px 0 8px}
  .barra3 i{display:block;height:100%}
  .leyenda{font-size:14px;color:var(--suave);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .aguja{font-size:21px;font-weight:700;line-height:1.35;margin:4px 0 0}
  .dos{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media (max-width:520px){ .dos{grid-template-columns:1fr} }
  .forma span{display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;
    border-radius:6px;font-size:13px;font-weight:800;margin-right:4px;color:#fff}
  .forma .G{background:#1E8A4A} .forma .E{background:#9AA3AF} .forma .P{background:#C2410C}
  .chico{font-size:14px;color:var(--suave)}
  .grilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin:10px 0 18px}
  .grilla a{display:block;background:var(--papel);border:1px solid var(--borde);border-radius:14px;
    padding:14px 16px;text-decoration:none}
  .grilla b{display:block;font-size:18px} .grilla span{font-size:14px;color:var(--suave)}
`;

function pagina({ RAIZ, ruta, titulo, descripcion, miga, cuerpo }) {
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
<div class="miga">${miga}</div>
${cuerpo}
<footer>
  Armá el 11 es una app independiente, sin relación con ningún club ni con
  ninguna liga. No tiene apuestas ni contenido de juego con dinero.<br>
  <a href="/">Inicio</a> · <a href="/consulta/">Partidos y equipos</a> ·
  <a href="/como-funciona.html">Cómo funciona</a> · <a href="/privacidad.html">Privacidad</a>
</footer>
</div></body></html>
`;
}

const boton = (texto, href = "/") =>
  `<p style="margin:22px 0 6px"><a class="ir" href="${esc(href)}">${esc(texto)}</a></p>`;
const enlace = (liga, p) => "/#simular=" + liga + ":" + p.id;
const aLiga = liga => "/" + urlLiga(liga);
const aPartido = (liga, p) => "/" + urlPartido(liga, p);
const aEquipo = (liga, nombre) => "/" + urlEquipo(liga, nombre);
const puntito = c => c ? `<span class="pt ${c}" title="${c === "verde" ? "la barra lo decía" :
  c === "gris" ? "daba parejo" : "sorpresa"}"></span>` : "";

/* Los últimos cinco de un equipo ANTES de una fecha: cómo llegaba. */
function formaAntes(eq, fecha, n = 5) {
  if (!eq) return [];
  const t = fecha ? new Date(fecha).getTime() : Infinity;
  return eq.historia.filter(h => new Date(h.fecha).getTime() < t).slice(-n);
}
const pintarForma = f => f.length
  ? `<div class="forma">${f.map(h => `<span class="${h.r}" title="${esc(h.rival)} ${h.gf}-${h.gc}">${h.r}</span>`).join("")}</div>`
  : `<p class="chico">Todavía sin partidos esta temporada.</p>`;

function bloqueLlegada(liga, eq, fecha, deLocal) {
  if (!eq) return "";
  const f = formaAntes(eq, fecha);
  const antes = eq.historia.filter(h => !fecha || new Date(h.fecha) < new Date(fecha));
  const pj = antes.length, gf = antes.reduce((a, h) => a + h.gf, 0), gc = antes.reduce((a, h) => a + h.gc, 0);
  const lado = antes.filter(h => h.deLocal === deLocal);
  const g = lado.filter(h => h.r === "G").length, e = lado.filter(h => h.r === "E").length;
  return `
<div class="dato">
  <p><b><a href="${aEquipo(liga, eq.nombre)}">${esc(eq.nombre)}</a></b></p>
  ${pintarForma(f)}
  <p class="chico" style="margin-top:8px">${pj ? `${pj} partidos · ${dec(gf / pj)} goles a favor y ${dec(gc / pj)} en contra por partido.<br>
     ${deLocal ? "De local" : "De visitante"}: ${n(g, "ganado", "ganados")}, ${n(e, "empatado", "empatados")} y ${n(lado.length - g - e, "perdido", "perdidos")}.` :
     "Primer partido de la temporada."}</p>
</div>`;
}

function bloqueCaraACara(liga, partidos, a, b, sinId) {
  const cc = caraACara(partidos, a, b).filter(m => m.id !== sinId);
  if (!cc.length) return "";
  return `<h2>Esta temporada ya se cruzaron</h2>
<ul class="lista">${cc.map(m => `<li><a href="${aPartido(liga, m)}"><div class="q"><span>${esc(m.nl)} - ${esc(m.nv)}</span>
  <span class="res">${m.gl}-${m.gv}</span></div><div class="s">${esc(dia(m.fecha))}</div></a></li>`).join("")}</ul>`;
}

/* ── UN PARTIDO JUGADO ──────────────────────────────────────────────────── */
function paginaJugado({ RAIZ, liga, nombreLiga, p, partidos, equipos }) {
  const punto = puntoDe(p.p, p.gl, p.gv);
  const lineaAguja = aguja(p);
  const donde = [p.estadio, p.ciudad].filter(Boolean).join(", ");
  const veredicto = { verde: "La barra lo decía.", gris: "Partido abierto: el modelo daba parejo.",
                      naranja: "Sorpresa." }[punto] || "";
  const barra = p.p ? `
<h2>Lo que daba el modelo</h2>
<div class="barra3"><i style="width:${p.p.H * 100}%;background:#1E8A4A"></i><i style="width:${p.p.D * 100}%;background:#9AA3AF"></i><i style="width:${p.p.A * 100}%;background:#2B5CAB"></i></div>
<div class="leyenda"><span>${esc(p.nl)} ${pct(p.p.H)}</span><span>Empate ${pct(p.p.D)}</span><span>${esc(p.nv)} ${pct(p.p.A)}</span></div>
<p style="margin-top:12px">${puntito(punto)}<b>${esc(veredicto)}</b></p>
<p class="chico">Con lo que se sabía antes del partido, con el mismo método de
   <a href="/es-suerte.html">está medido</a>.</p>` : "";
  const st = p.st ? `
<h2>Los números del partido</h2>
<table>
  <tr><th></th><th class="n">${esc(p.nl)}</th><th class="n">${esc(p.nv)}</th></tr>
  <tr><td>Tiros</td><td class="n">${p.st.tl}</td><td class="n">${p.st.tv}</td></tr>
  ${p.st.al != null && p.st.av != null ? `<tr><td>Al arco</td><td class="n">${p.st.al}</td><td class="n">${p.st.av}</td></tr>` : ""}
  ${p.st.pl != null && p.st.pv != null ? `<tr><td>Posesión</td><td class="n">${p.st.pl}%</td><td class="n">${p.st.pv}%</td></tr>` : ""}
  ${p.st.xl != null ? `<tr><td>Goles esperados (xG)</td><td class="n">${dec(p.st.xl)}</td><td class="n">${dec(p.st.xv)}</td></tr>` : ""}
</table>` : "";
  const res = `${p.nl} ${p.gl}-${p.gv} ${p.nv}`;
  return {
    ruta: urlPartido(liga, p),
    html: pagina({
      RAIZ, ruta: urlPartido(liga, p),
      titulo: `${res} · ${ronda(p.ronda)}`,
      descripcion: `${res} · ${ronda(p.ronda)} · ${nombreLiga}. ${lineaAguja || ""} Lo que daba el modelo antes del partido y los números.`.replace(/\s+/g, " "),
      miga: `<a href="/consulta/">Partidos y equipos</a> · <a href="${aLiga(liga)}">${esc(nombreLiga)}</a>`,
      cuerpo: `
<h1>${esc(p.nl)} ${p.gl}-${p.gv} ${esc(p.nv)}</h1>
<p class="bajada">${esc(juntar(ronda(p.ronda), dia(p.fecha), donde))}${p.arbitro ? "<br>Árbitro: " + esc(p.arbitro) : ""}</p>
${lineaAguja ? `<div class="dato"><p class="chico" style="margin:0 0 4px">La estadística que movió la aguja</p><p class="aguja">${esc(lineaAguja)}</p></div>` : ""}
${barra}
${st}
<h2>Cómo llegaba cada uno</h2>
<div class="dos">${bloqueLlegada(liga, equipos.get(p.local), p.fecha, true)}${bloqueLlegada(liga, equipos.get(p.visita), p.fecha, false)}</div>
${bloqueCaraACara(liga, partidos, p.local, p.visita, p.id)}
<h2>¿Y con otro once?</h2>
<p>Armá los dos equipos, cambiá el planteo y jugalo 6.000 veces.</p>
${boton("Simulá la próxima fecha", aLiga(liga))}
`,
    }),
  };
}

/* ── UN PARTIDO POR JUGAR: SIN NÚMERO ───────────────────────────────────── */
function paginaProximo({ RAIZ, liga, nombreLiga, p, partidos, equipos }) {
  const donde = [p.estadio, p.ciudad].filter(Boolean).join(", ");
  const destino = p.enApp ? enlace(liga, p) : "/";
  return {
    ruta: urlPartido(liga, p),
    html: pagina({
      RAIZ, ruta: urlPartido(liga, p),
      titulo: `${p.nl} vs ${p.nv} · ${ronda(p.ronda)}`,
      descripcion: `${p.nl} contra ${p.nv} · ${ronda(p.ronda)} · ${nombreLiga}, ${dia(p.fecha)}. Cómo llegan los dos y dónde simularlo.`,
      miga: `<a href="/consulta/">Partidos y equipos</a> · <a href="${aLiga(liga)}">${esc(nombreLiga)}</a>`,
      cuerpo: `
<h1>${esc(p.nl)} vs ${esc(p.nv)}</h1>
<p class="bajada">${esc(juntar(ronda(p.ronda), dia(p.fecha) + ", " + hora(p.fecha) + " (hora argentina)", donde))}${p.arbitro ? "<br>Árbitro: " + esc(p.arbitro) : ""}</p>
<div class="dato">
  <p><b>¿Quién gana?</b> Armá los dos onces, elegí cómo juega cada uno y
     mirá en qué termina después de 6.000 partidos.</p>
  <a class="ir" href="${esc(destino)}">Simulá este partido</a>
</div>
<h2>Cómo llegan</h2>
<div class="dos">${bloqueLlegada(liga, equipos.get(p.local), p.fecha, true)}${bloqueLlegada(liga, equipos.get(p.visita), p.fecha, false)}</div>
${bloqueCaraACara(liga, partidos, p.local, p.visita, p.id)}
`,
    }),
  };
}

/* ── UN EQUIPO ──────────────────────────────────────────────────────────── */
function paginaEquipo({ RAIZ, liga, nombreLiga, eq, partidos, proximos }) {
  const prox = proximos.find(p => p.local === eq.id || p.visita === eq.id);
  const ult = [...eq.historia].reverse();
  const porId = new Map(partidos.map(m => [m.id, m]));
  const dg = eq.gf - eq.gc;
  return {
    ruta: urlEquipo(liga, eq.nombre),
    html: pagina({
      RAIZ, ruta: urlEquipo(liga, eq.nombre),
      titulo: `${eq.nombre}: la temporada en números`,
      descripcion: `${eq.nombre} · ${nombreLiga}: ${eq.pj} partidos, ${eq.g} ganados, ${eq.gf} goles a favor y ${eq.gc} en contra. Su forma, su próximo partido y cada resultado.`,
      miga: `<a href="/consulta/">Partidos y equipos</a> · <a href="${aLiga(liga)}">${esc(nombreLiga)}</a>`,
      cuerpo: `
<h1>${esc(eq.nombre)}</h1>
<p class="bajada">${eq.pj ? `${eq.pts} puntos en ${eq.pj} partidos. ${eq.gf} goles a favor, ${eq.gc} en contra${dg ? ` (${dg > 0 ? "+" : ""}${dg})` : ""}.` : "Todavía no jugó esta temporada."}</p>
${pintarForma(formaAntes(eq, null))}
${prox ? `
<div class="dato">
  <p class="chico" style="margin:0 0 4px">Próximo partido</p>
  <p><b><a href="${aPartido(liga, prox)}">${esc(prox.nl)} vs ${esc(prox.nv)}</a></b><br>
     <span class="chico">${esc(dia(prox.fecha))}, ${esc(hora(prox.fecha))}</span></p>
  <a class="ir" href="${esc(prox.enApp ? enlace(liga, prox) : "/")}">Simulalo</a>
</div>` : ""}
${eq.pj ? `
<h2>La temporada</h2>
<table>
  <tr><th></th><th class="n">PJ</th><th class="n">G</th><th class="n">E</th><th class="n">P</th></tr>
  <tr><td>Total</td><td class="n">${eq.pj}</td><td class="n">${eq.g}</td><td class="n">${eq.e}</td><td class="n">${eq.p}</td></tr>
  <tr><td>De local</td><td class="n">${eq.local.pj}</td><td class="n">${eq.local.g}</td><td class="n">${eq.local.e}</td><td class="n">${eq.local.p}</td></tr>
  <tr><td>De visitante</td><td class="n">${eq.visita.pj}</td><td class="n">${eq.visita.g}</td><td class="n">${eq.visita.e}</td><td class="n">${eq.visita.p}</td></tr>
</table>
<p class="chico">${dec(eq.gf / eq.pj)} goles a favor y ${dec(eq.gc / eq.pj)} en contra por partido · ${eq.invictas} con el arco en cero${eq.tirosPJ ? ` · ${dec(eq.tiros / eq.tirosPJ)} tiros por partido` : ""}.</p>
<h2>Partido por partido</h2>
<ul class="lista">${ult.map(h => {
  const m = porId.get(h.id), pu = m ? puntoDe(m.p, m.gl, m.gv) : null;
  return `<li><a href="${m ? aPartido(liga, m) : "#"}"><div class="q"><span>${puntito(pu)}${h.deLocal ? "vs " : "en cancha de "}${esc(h.rival)}</span>
  <span class="res">${h.gf}-${h.gc}</span></div><div class="s">${esc(dia(h.fecha))}</div></a></li>`;
}).join("")}</ul>
<p class="chico">${puntito("verde")}la barra lo decía · ${puntito("gris")}daba parejo · ${puntito("naranja")}sorpresa</p>` : ""}
${boton("Armá el once de " + eq.nombre)}
`,
    }),
  };
}

/* ── LA LIGA ────────────────────────────────────────────────────────────── */
const CARTEL = { mejor: "Una de las que mejor lee el modelo", peloton: "El modelo le gana al promedio",
                 dificiles: "Una de las más difíciles", brava: "La más impredecible de las once" };

function paginaLiga({ RAIZ, liga, info, datos, partidos, proximos, equipos, grupo }) {
  const nombreLiga = `${info.pais} · ${info.nombre}`;
  const jug = partidos.filter(esJugado).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const recientes = jug.slice(0, 20);
  const conP = recientes.filter(m => m.p);
  const cuenta = c => conP.filter(m => puntoDe(m.p, m.gl, m.gv) === c).length;
  const tabla = [...equipos.values()].filter(e => e.pj)
    .sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
  return {
    ruta: urlLiga(liga) + "index.html",
    html: pagina({
      RAIZ, ruta: urlLiga(liga) + "index.html",
      titulo: `${info.nombre} (${info.pais}): partidos, equipos y resultados`,
      descripcion: `${info.nombre} de ${info.pais}: la próxima fecha, cada resultado con lo que daba el modelo, y los números de cada equipo.`,
      miga: `<a href="/consulta/">Partidos y equipos</a>`,
      cuerpo: `
<h1>${esc(info.nombre)}</h1>
<p class="bajada">${esc(info.pais)} · ${jug.length} partidos jugados, ${equipos.size} equipos.
   ${grupo ? `<a href="/ligas.html">${esc(CARTEL[grupo])}</a>.` : ""}</p>
${proximos.length ? `
<h2>La próxima fecha</h2>
<ul class="lista">${proximos.slice(0, 20).map(p => `<li><a href="${aPartido(liga, p)}"><div class="q"><span>${esc(p.nl)} vs ${esc(p.nv)}</span>
  <span class="chico">${esc(diaCorto(p.fecha))} ${esc(hora(p.fecha))}</span></div></a></li>`).join("")}</ul>
${boton("Simulá cualquiera de estos")}` : ""}
${recientes.length ? `
<h2>Lo que pasó</h2>
${conP.length ? `<p>En los últimos ${conP.length} con número: ${puntito("verde")}<b>${cuenta("verde")}</b> la barra lo decía ·
   ${puntito("gris")}<b>${cuenta("gris")}</b> daba parejo · ${puntito("naranja")}<b>${cuenta("naranja")}</b> sorpresas.</p>` : ""}
<ul class="lista">${recientes.map(m => `<li><a href="${aPartido(liga, m)}"><div class="q"><span>${puntito(puntoDe(m.p, m.gl, m.gv))}${esc(m.nl)} - ${esc(m.nv)}</span>
  <span class="res">${m.gl}-${m.gv}</span></div><div class="s">${esc(aguja(m) || dia(m.fecha))}</div></a></li>`).join("")}</ul>` : ""}
${tabla.length ? `
<h2>Los equipos</h2>
<table>
  <tr><th>Equipo</th><th class="n">PJ</th><th class="n">Pts</th><th class="n">Goles</th></tr>
  ${tabla.map(e => `<tr><td><a href="${aEquipo(liga, e.nombre)}">${esc(e.nombre)}</a></td><td class="n">${e.pj}</td><td class="n"><b>${e.pts}</b></td><td class="n">${e.gf}:${e.gc}</td></tr>`).join("\n  ")}
</table>
<p class="chico">Con todos los partidos de la temporada ${esc(datos?.temporada || "")}.</p>` : ""}
`,
    }),
  };
}

/* ── LA PORTADA DE CONSULTA ─────────────────────────────────────────────── */
function paginaIndice({ RAIZ, resumenes }) {
  return {
    ruta: "consulta/index.html",
    html: pagina({
      RAIZ, ruta: "consulta/index.html",
      titulo: "Partidos, equipos y resultados de once ligas",
      descripcion: "La próxima fecha, cada resultado con lo que daba el modelo y la estadística que movió la aguja, y los números de cada equipo. Once ligas.",
      miga: `<a href="/como-funciona.html">Cómo funciona</a>`,
      cuerpo: `
<h1>Once ligas. Cada partido, con sus números.</h1>
<p class="bajada">La próxima fecha, lo que pasó en cada partido y lo que daba
   el modelo antes. Elegí tu liga.</p>
<div class="grilla">${resumenes.map(r => `<a href="${aLiga(r.slug)}"><b>${esc(r.pais)}</b>
  <span>${esc(r.nombre)}<br>${r.jugados} jugados · ${r.proximos} por jugar</span></a>`).join("")}</div>
<p>Cada partido jugado dice qué daba el modelo con lo que se sabía antes, y
   si acertó. Los que faltan jugar, se simulan: armá tu once y jugalo 6.000
   veces.</p>
${boton("Ir al simulador")}
`,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════
   TODO JUNTO. Devuelve [{ ruta, html }] y las rutas para el mapa.
   `fuentes` = [{ info (fila de ligas.json), datos (estadisticas/<slug>.json
   o null), ligaJs (lo de sitio/datos/liga-<slug>.js o null) }]
   ══════════════════════════════════════════════════════════════════════ */
export function paginasConsulta({ RAIZ = "", fuentes = [], ligas = [], ahora = Date.now() } = {}) {
  const G = gruposDeLigas(ligas);
  const grupoDe = slug => Object.keys(G).find(k => G[k].some(l => l.slug === slug)) || null;
  const out = [], resumenes = [];
  for (const { info, datos, ligaJs } of fuentes) {
    const liga = info.slug;
    const partidos = (datos?.partidos || []).filter(p => p.id && p.local && p.visita);
    const proximos = proximosDe(datos, ligaJs, ahora);
    if (!partidos.length && !proximos.length) continue;
    /* Los números de los equipos incluyen a los del próximo, aunque no
       estén en la semanal (un recién ascendido, por ejemplo). */
    const equipos = numerosDeEquipos([...partidos, ...proximos.filter(p => !partidos.some(q => q.id === p.id))]);
    const nombreLiga = `${info.nombre} (${info.pais})`;
    out.push(paginaLiga({ RAIZ, liga, info, datos, partidos, proximos, equipos, grupo: grupoDe(liga) }));
    for (const p of partidos.filter(esJugado))
      out.push(paginaJugado({ RAIZ, liga, nombreLiga, p, partidos, equipos }));
    for (const p of proximos)
      out.push(paginaProximo({ RAIZ, liga, nombreLiga, p, partidos, equipos }));
    for (const eq of equipos.values())
      if (eq.nombre) out.push(paginaEquipo({ RAIZ, liga, nombreLiga, eq, partidos, proximos }));
    resumenes.push({ slug: liga, pais: info.pais, nombre: info.nombre,
                     jugados: partidos.filter(esJugado).length, proximos: proximos.length });
  }
  if (resumenes.length) out.unshift(paginaIndice({ RAIZ, resumenes }));
  return out;
}
