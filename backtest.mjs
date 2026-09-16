/* ══════════════════════════════════════════════════════════════════════════
   BACKTEST — ¿el modelo le gana a la vara en ESTA liga?

   Es la prueba que se le hizo a las nueve ligas de `claude/modelo-backtest.md`,
   reescrita para correr sola desde GitHub, sin terminal: la pantalla es el
   formulario "Run workflow" de Actions, y el informe sale en el resumen de
   la corrida. Antes de vender una liga, se corre esto.

   EL MODELO (v3.1, el que quedó cerrado el 2026-08-22):
     · fuerza de ataque y de defensa desde GOLES, normalizados contra la
       media de su liga
     · regresión a la media con k = 6 partidos
     · arrastre entre temporadas 0,55
     · Dixon-Coles con rho = -0,10 en los marcadores bajos
     · no se evalúa un partido hasta que los dos tengan 6 partidos previos
     · cada liga corre sola, con su propio padrón y sus promedios

   CÓMO SE MIDE. Se camina la temporada en orden de fecha: para cada partido
   se pronostica con lo jugado ANTES, después se lo suma. La primera
   temporada pedida es de precalentamiento: entrena y no cuenta. La vara es
   la frecuencia histórica de local / empate / visita de esa liga; la
   ventaja es cuánto menor es el Brier del modelo que el de la vara, y la t
   dice si eso es señal o ruido (t > 2 ya es difícil que sea azar; las
   ligas buenas dan 5 a 10).

   Todo lo que calcula es puro y está probado sin red en probar-backtest.mjs.
   Lo único que toca la API es `traerTemporada` y `hayRatings`.

     node backtest.mjs --ligas 94,262 --temporadas 2023,2024,2025
     node backtest.mjs --ligas buscar:Mexico          (lista ligas de un país)
     node backtest.mjs --ligas 262 --sumar             (y la agrega a ligas.json)
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";

const aca = p => new URL(p, import.meta.url);

/* ─── el modelo ─────────────────────────────────────────────────────────── */
export const MODELO = { k: 6, arrastre: 0.55, rho: -0.10, minimoPrevios: 6, topeGoles: 10 };

const poisson = (l, x) => { let p = Math.exp(-l); for (let i = 1; i <= x; i++) p *= l / i; return p; };

/* La corrección de Dixon-Coles: los 0-0, 1-0, 0-1 y 1-1 no salen como
   dice Poisson, y rho lo acomoda. Después se normaliza la grilla. */
export function probabilidades(lh, la, rho = MODELO.rho, tope = MODELO.topeGoles) {
  let H = 0, D = 0, A = 0, total = 0;
  for (let x = 0; x <= tope; x++) for (let y = 0; y <= tope; y++) {
    let p = poisson(lh, x) * poisson(la, y);
    if (x === 0 && y === 0) p *= 1 - lh * la * rho;
    else if (x === 1 && y === 0) p *= 1 + la * rho;
    else if (x === 0 && y === 1) p *= 1 + lh * rho;
    else if (x === 1 && y === 1) p *= 1 - rho;
    if (p < 0) p = 0;
    total += p;
    if (x > y) H += p; else if (x === y) D += p; else A += p;
  }
  return { H: H / total, D: D / total, A: A / total };
}

/* Brier de tres clases: suma de (p - resultado)². Vale 0 si acertás seguro
   y 2 si te equivocás seguro. */
export const brier = (p, r) =>
  (p.H - (r === "H")) ** 2 + (p.D - (r === "D")) ** 2 + (p.A - (r === "A")) ** 2;

export const resultadoDe = (gl, gv) => gl > gv ? "H" : gl < gv ? "A" : "D";

/* ─── el estado de una liga, que camina partido a partido ────────────────
   Cada equipo guarda goles a favor, en contra y partidos de ESTA temporada,
   más el prior con el que arrancó (el arrastre de la anterior). La liga
   guarda sus medias de local y visita y la frecuencia de resultados. */
export function ligaNueva(m = MODELO) {
  return { m, eq: new Map(), gl: 0, gv: 0, n: 0, H: 0, D: 0, A: 0, temporada: null };
}

function equipo(L, id) {
  let e = L.eq.get(id);
  if (!e) { e = { gf: 0, ga: 0, n: 0, priorA: 1, priorD: 1, total: 0 }; L.eq.set(id, e); }
  return e;
}

/* Media de goles por equipo y partido, de local y de visitante. Sin
   historia todavía, se usa un respaldo razonable (2,6 goles por partido). */
const medias = L => L.n ? { local: L.gl / L.n, visita: L.gv / L.n } : { local: 1.40, visita: 1.15 };

/* Fuerza de ataque y defensa con la regresión a la media: (goles/µ +
   k·prior) / (n + k). Con cero partidos es el prior; con muchos, el dato. */
export function fuerzas(L, id) {
  const e = equipo(L, id), { local, visita } = medias(L), mu = (local + visita) / 2, k = L.m.k;
  return {
    A: (e.gf / mu + k * e.priorA) / (e.n + k),
    D: (e.ga / mu + k * e.priorD) / (e.n + k),
    previos: e.total,
  };
}

export function pronosticar(L, localId, visitaId) {
  const h = fuerzas(L, localId), a = fuerzas(L, visitaId), { local, visita } = medias(L);
  const lh = local * h.A * a.D, la = visita * a.A * h.D;
  return { ...probabilidades(lh, la, L.m.rho, L.m.topeGoles), lh, la,
           evaluable: h.previos >= L.m.minimoPrevios && a.previos >= L.m.minimoPrevios };
}

export const vara = L => L.n
  ? { H: L.H / L.n, D: L.D / L.n, A: L.A / L.n }
  : { H: 0.45, D: 0.27, A: 0.28 };

/* Sumar un partido jugado. */
export function sumar(L, localId, visitaId, gl, gv) {
  const h = equipo(L, localId), a = equipo(L, visitaId);
  h.gf += gl; h.ga += gv; h.n++; h.total++;
  a.gf += gv; a.ga += gl; a.n++; a.total++;
  L.gl += gl; L.gv += gv; L.n++;
  L[resultadoDe(gl, gv)]++;
}

/* Cambio de temporada: lo jugado pasa a ser prior, encogido hacia 1 con
   el arrastre, y el conteo de la temporada vuelve a cero. Los partidos
   totales se conservan: son los "previos" del mínimo. */
export function nuevaTemporada(L, temporada) {
  if (L.temporada !== null) {
    for (const e of L.eq.values()) {
      if (e.n) {
        const f = fuerzasFinales(L, e);
        e.priorA = 1 + L.m.arrastre * (f.A - 1);
        e.priorD = 1 + L.m.arrastre * (f.D - 1);
      }
      e.gf = 0; e.ga = 0; e.n = 0;
    }
  }
  L.temporada = temporada;
}
function fuerzasFinales(L, e) {
  const { local, visita } = medias(L), mu = (local + visita) / 2, k = L.m.k;
  return { A: (e.gf / mu + k * e.priorA) / (e.n + k), D: (e.ga / mu + k * e.priorD) / (e.n + k) };
}

/* ─── correr temporadas enteras ───────────────────────────────────────────
   `temporadas` es [{ temporada, partidos:[{fecha, local, visita, gl, gv}] }]
   en orden. La primera precalienta; el resto se evalúa. Devuelve el
   informe. Puro: se prueba con partidos inventados. */
export function correr(temporadas, m = MODELO) {
  const L = ligaNueva(m);
  const filas = [];
  temporadas.forEach((T, i) => {
    nuevaTemporada(L, T.temporada);
    const orden = [...T.partidos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    for (const p of orden) {
      if (i > 0) {
        const pr = pronosticar(L, p.local, p.visita);
        if (pr.evaluable) {
          const r = resultadoDe(p.gl, p.gv), v = vara(L);
          const mejor = ["H", "D", "A"].reduce((x, y) => pr[y] > pr[x] ? y : x);
          filas.push({ temporada: T.temporada, bm: brier(pr, r), bv: brier(v, r), acierta: mejor === r });
        }
      }
      sumar(L, p.local, p.visita, p.gl, p.gv);
    }
  });
  return resumen(filas, L);
}

export function resumen(filas, L) {
  const n = filas.length;
  if (!n) return { n: 0 };
  const d = filas.map(f => f.bv - f.bm);
  const media = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - media) ** 2, 0) / Math.max(1, n - 1));
  const t = sd ? media / (sd / Math.sqrt(n)) : 0;
  const porTemporada = {};
  for (const f of filas) {
    const s = porTemporada[f.temporada] ||= { n: 0, bm: 0, bv: 0, ac: 0 };
    s.n++; s.bm += f.bm; s.bv += f.bv; s.ac += f.acierta;
  }
  for (const s of Object.values(porTemporada)) { s.bm /= s.n; s.bv /= s.n; s.ac /= s.n; s.ventaja = s.bv - s.bm; }
  return {
    n, acierta: filas.filter(f => f.acierta).length / n,
    brier: filas.reduce((a, f) => a + f.bm, 0) / n,
    vara: filas.reduce((a, f) => a + f.bv, 0) / n,
    ventaja: media, t, porTemporada,
    equipos: L ? L.eq.size : undefined,
    goles: L && L.n ? +((L.gl + L.gv) / L.n).toFixed(2) : undefined,
  };
}

/* El veredicto, en una palabra. Los umbrales salen de las nueve ligas ya
   medidas: las europeas dan t entre 5 y 10; Brasil 3,2; Argentina 0,9. */
export function veredicto(r) {
  if (!r.n) return { ok: false, texto: "sin partidos evaluables" };
  if (r.n < 200) return { ok: false, texto: "pocos partidos para decir algo (" + r.n + ")" };
  if (r.t >= 3) return { ok: true, texto: "el modelo le gana claro a la vara" };
  if (r.t >= 2) return { ok: true, texto: "le gana, con poco margen" };
  if (r.t >= 0) return { ok: false, texto: "no se distingue de la vara: se puede simular, no prometer" };
  return { ok: false, texto: "peor que la vara" };
}

/* ─── la API ─────────────────────────────────────────────────────────────── */
const BASE = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY || "";
let pedidos = 0;
async function api(path, params, fetchFn = fetch) {
  const r = await fetchFn(BASE + path + "?" + new URLSearchParams(params), { headers: { "x-apisports-key": KEY } });
  pedidos++;
  if (!r.ok) throw new Error("HTTP " + r.status + " en " + path);
  const j = await r.json();
  if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length)
    throw new Error(Object.values(j.errors).join(" · "));
  return j.response || [];
}

/* Una temporada entera en UN pedido. Solo los partidos terminados en los
   noventa (AET y penales son copas; en liga casi no existen). */
export function partidosDe(respuesta) {
  return respuesta
    .filter(f => ["FT", "AET", "PEN"].includes(f.fixture?.status?.short))
    .map(f => ({ fecha: f.fixture.date, id: f.fixture.id,
                 local: f.teams.home.id, visita: f.teams.away.id,
                 gl: f.score?.fulltime?.home ?? f.goals.home, gv: f.score?.fulltime?.away ?? f.goals.away }))
    .filter(p => Number.isFinite(p.gl) && Number.isFinite(p.gv));
}
const traerTemporada = async (liga, temporada, fetchFn) =>
  partidosDe(await api("/fixtures", { league: liga, season: temporada }, fetchFn));

/* ¿La API trae rating por jugador en esta liga? Sin eso el motor de
   plantel no arma el once: se puede simular con fuerza de equipo pero no
   tocar jugadores. Un pedido, sobre el último partido jugado. */
async function hayRatings(fixtureId, fetchFn) {
  const r = await api("/fixtures/players", { fixture: fixtureId }, fetchFn);
  const jugadores = r.flatMap(e => e.players || []);
  const con = jugadores.filter(j => parseFloat(j.statistics?.[0]?.games?.rating) > 0).length;
  return { jugadores: jugadores.length, conRating: con };
}

async function buscarLigas(pais, fetchFn) {
  const r = await api("/leagues", { country: pais, type: "league" }, fetchFn);
  return r.map(x => ({ id: x.league.id, nombre: x.league.name, pais: x.country.name,
    temporadas: (x.seasons || []).map(s => s.year).filter(y => y >= 2021).join(", ") }));
}

/* ─── el informe, en markdown (va al resumen del run) ─────────────────── */
const f3 = x => x.toFixed(3), pct = x => (x * 100).toFixed(1) + "%", signo = x => (x >= 0 ? "+" : "") + f3(x);
export function informe(nombre, r, extra = {}) {
  const v = veredicto(r);
  let md = `## ${nombre}\n\n`;
  if (!r.n) return md + "Sin partidos evaluables. ¿Las temporadas existen en la API para esta liga?\n";
  md += `**${v.ok ? "✅" : "⚠️"} ${v.texto}.**\n\n`;
  md += `| partidos | acierta | Brier | vara | ventaja | t |\n|---|---|---|---|---|---|\n`;
  md += `| ${r.n} | ${pct(r.acierta)} | ${f3(r.brier)} | ${f3(r.vara)} | **${signo(r.ventaja)}** | **${r.t.toFixed(1)}** |\n\n`;
  md += `Por temporada: ` + Object.entries(r.porTemporada).map(([t, s]) =>
    `${t}: ${s.n} partidos, ventaja ${signo(s.ventaja)}`).join(" · ") + `\n\n`;
  if (extra.ratings) md += extra.ratings.conRating > 0
    ? `Jugadores con rating en el último partido: ${extra.ratings.conRating} de ${extra.ratings.jugadores} → **se puede armar el once**.\n\n`
    : `**Sin rating por jugador** en el último partido (${extra.ratings.jugadores} jugadores): se puede simular por fuerza de equipo, pero no tocar el once. No conviene venderla como las demás.\n\n`;
  if (r.goles) md += `Goles por partido: ${r.goles} · equipos vistos: ${r.equipos}\n\n`;
  return md;
}

/* ─── sumar a ligas.json ─────────────────────────────────────────────── */
export function filaDeLiga(info, r) {
  const slug = (info.pais + "-" + info.nombre).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { id: info.id, slug, nombre: info.nombre, pais: info.pais, ventajaBacktest: +r.ventaja.toFixed(4) };
}
export function agregarALigas(cfg, fila) {
  if (cfg.ligas.some(l => l.id === fila.id)) return { cfg, agregada: false };
  return { cfg: { ...cfg, ligas: [...cfg.ligas, fila] }, agregada: true };
}

/* ─── correr una liga, de punta a punta ──────────────────────────────── */
async function correrLiga(id, temporadas, log = console.log) {
  const info = (await api("/leagues", { id }))[0];
  const nombreLiga = info ? info.league.name : "liga " + id, pais = info ? info.country.name : "";
  const nombre = info ? `${nombreLiga} (${pais}) · id ${id}` : `liga ${id}`;
  log("\n" + nombre);
  const T = [];
  for (const t of temporadas) {
    const partidos = await traerTemporada(id, t);
    log(`  ${t}: ${partidos.length} partidos`);
    T.push({ temporada: t, partidos });
  }
  const r = correr(T);
  let ratings = null;
  const ultimo = T.flatMap(x => x.partidos).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  if (ultimo) { try { ratings = await hayRatings(ultimo.id); } catch (e) { log("  ratings: " + e.message); } }
  const texto = informe(nombre, r, { ratings });
  log(texto.replace(/[#*|]/g, "").replace(/\n{2,}/g, "\n"));
  return { id, nombreLiga, pais, nombre, temporadas, r, ratings, texto, v: veredicto(r) };
}

/* ─── la base: pedidos que entran desde la pantalla, resultados que salen ─
   La pantalla (un HTML en claude.ai) no tiene la API key ni puede tenerla.
   Lo que hace es dejar un PEDIDO en Supabase con una clave de
   administrador; esto, que corre en GitHub cada quince minutos con las
   claves de verdad, lo levanta, corre el backtest y deja el RESULTADO en
   la base, que la pantalla lee. Un pedido con la clave equivocada se marca
   rechazado y no gasta un pedido a la API. */
function base() {
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) return null;
  const cab = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  return {
    async leer(ruta) { const r = await fetch(url + "/rest/v1/" + ruta, { headers: cab }); if (!r.ok) throw new Error("base " + r.status + " " + ruta); return r.json(); },
    async escribir(ruta, cuerpo, metodo = "POST") {
      const r = await fetch(url + "/rest/v1/" + ruta, { method: metodo, headers: { ...cab, Prefer: "return=minimal" }, body: JSON.stringify(cuerpo) });
      if (!r.ok) throw new Error("base " + r.status + " " + ruta + " " + (await r.text()).slice(0, 120));
    },
  };
}

/* Puro: qué hacer con un pedido. Se prueba sin base. */
export function clasificarPedido(p, clave) {
  if (!clave || p.clave !== clave) return { accion: "rechazar", nota: "clave equivocada" };
  if (p.sumar_liga) return { accion: "sumar", liga: +p.sumar_liga };
  const partes = String(p.ligas || "").split(",").map(s => s.trim()).filter(Boolean);
  const ids = partes.filter(s => /^\d{1,6}$/.test(s)).map(Number).slice(0, 6);
  const busquedas = partes.filter(s => /^buscar:[\p{L} .'-]{2,40}$/u.test(s)).map(s => s.slice(7)).slice(0, 3);
  const temporadas = String(p.temporadas || "2023,2024,2025").split(",").map(s => +s.trim()).filter(y => y >= 2015 && y <= 2030).slice(0, 5);
  if (!ids.length && !busquedas.length) return { accion: "rechazar", nota: "sin ligas válidas" };
  if (ids.length && temporadas.length < 2) return { accion: "rechazar", nota: "hacen falta dos temporadas por lo menos" };
  return { accion: "correr", ids, busquedas, temporadas };
}

export function filaResultado(x) {
  return { liga_id: x.id, tipo: "liga", nombre: x.nombreLiga, pais: x.pais, temporadas: x.temporadas.join(","),
    n: x.r.n || 0, acierta: x.r.n ? +x.r.acierta.toFixed(4) : null, brier: x.r.n ? +x.r.brier.toFixed(4) : null,
    vara: x.r.n ? +x.r.vara.toFixed(4) : null, ventaja: x.r.n ? +x.r.ventaja.toFixed(4) : null,
    t: x.r.n ? +x.r.t.toFixed(2) : null, veredicto: x.v.texto, ok: !!x.v.ok,
    ratings_con: x.ratings ? x.ratings.conRating : null, ratings_total: x.ratings ? x.ratings.jugadores : null,
    informe: x.texto };
}

async function desdeBase() {
  const B = base();
  if (!B) { console.log("Falta SUPABASE_URL o SUPABASE_SERVICE_KEY."); process.exit(1); }
  const CLAVE = process.env.BACKTEST_CLAVE || "";
  const pedidos = await B.leer("backtest_pedido?estado=eq.pendiente&order=creado.asc&limit=5");
  console.log(pedidos.length + " pedido(s) pendiente(s).");
  const CFG = JSON.parse(readFileSync(aca("./ligas.json")));
  let cfg = CFG, algunaSumada = false;
  for (const p of pedidos) {
    const c = clasificarPedido(p, CLAVE);
    const marcar = (estado, nota = "") => B.escribir("backtest_pedido?id=eq." + p.id, { estado, nota }, "PATCH");
    try {
      if (c.accion === "rechazar") { await marcar("rechazado", c.nota); console.log("  pedido " + p.id + ": rechazado (" + c.nota + ")"); continue; }
      if (c.accion === "sumar") {
        const [res] = await B.leer("backtest_resultado?liga_id=eq." + c.liga + "&tipo=eq.liga&order=corrido.desc&limit=1");
        if (!res) { await marcar("rechazado", "esa liga no tiene backtest"); continue; }
        if (!res.ok) { await marcar("rechazado", "no pasó el backtest: " + res.veredicto); continue; }
        const fila = filaDeLiga({ id: res.liga_id, nombre: res.nombre, pais: res.pais }, { ventaja: +res.ventaja });
        const { cfg: cfg2, agregada } = agregarALigas(cfg, fila);
        cfg = cfg2; algunaSumada ||= agregada;
        await B.escribir("backtest_resultado?id=eq." + res.id, { sumada: true }, "PATCH");
        await marcar("hecho", agregada ? "sumada como " + fila.slug : "ya estaba en ligas.json");
        console.log("  pedido " + p.id + ": " + (agregada ? "sumada " + fila.slug : "ya estaba"));
        continue;
      }
      for (const pais of c.busquedas) {
        const lista = await buscarLigas(pais);
        await B.escribir("backtest_resultado", { tipo: "busqueda", nombre: pais, pais, lista, n: lista.length,
          informe: lista.map(l => `${l.id} · ${l.nombre} (${l.temporadas})`).join("\n") });
      }
      for (const id of c.ids) {
        const x = await correrLiga(id, c.temporadas);
        await B.escribir("backtest_resultado", filaResultado(x));
        mkdirSync(aca("./backtests/"), { recursive: true });
        writeFileSync(aca(`./backtests/${id}.json`), JSON.stringify({ id, nombre: x.nombre, temporadas: c.temporadas, corrido: new Date().toISOString(), resultado: x.r, ratings: x.ratings }, null, 1));
      }
      await marcar("hecho", `${c.ids.length} liga(s), ${c.busquedas.length} búsqueda(s)`);
    } catch (e) {
      console.log("  pedido " + p.id + " falló: " + e.message);
      try { await marcar("error", String(e.message).slice(0, 200)); } catch (x) {}
    }
  }
  if (algunaSumada) writeFileSync(aca("./ligas.json"), JSON.stringify(cfg, null, 2) + "\n");
  salidaWorkflow("sumada", algunaSumada ? "si" : "no");
  console.log(`${pedidos} pedidos a la API.`);
}

/* ─── main ────────────────────────────────────────────────────────────── */
function arg(nombre, def) { const i = process.argv.indexOf("--" + nombre); return i > 0 ? process.argv[i + 1] : def; }
const resumenDelRun = md => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md); };
const salidaWorkflow = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

async function main() {
  if (!KEY) { console.log("Falta API_FOOTBALL_KEY."); process.exit(1); }
  if (process.argv.includes("--desde-base")) return desdeBase();

  const ligas = (arg("ligas", "") || "").split(",").map(s => s.trim()).filter(Boolean);
  const temporadas = (arg("temporadas", "2023,2024,2025")).split(",").map(s => +s.trim()).filter(Boolean);
  const sumarSi = process.argv.includes("--sumar");
  if (!ligas.length) { console.log("Falta --ligas (ids separados por coma, o buscar:Pais)."); process.exit(1); }

  let md = `# Backtest · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n\n`;
  for (const b of ligas.filter(l => l.startsWith("buscar:"))) {
    const pais = b.slice(7);
    const lista = await buscarLigas(pais);
    md += `## Ligas de "${pais}" en API-Football\n\n| id | liga | temporadas |\n|---|---|---|\n` +
      lista.map(l => `| **${l.id}** | ${l.nombre} | ${l.temporadas} |`).join("\n") + "\n\n";
    console.log(lista.map(l => `  ${String(l.id).padStart(5)}  ${l.nombre}  (${l.temporadas})`).join("\n"));
  }
  const ids = ligas.filter(l => /^\d+$/.test(l)).map(Number);
  let cfg = JSON.parse(readFileSync(aca("./ligas.json"))), algunaSumada = false;
  mkdirSync(aca("./backtests/"), { recursive: true });
  const B = base();
  for (const id of ids) {
    const x = await correrLiga(id, temporadas);
    md += x.texto;
    writeFileSync(aca(`./backtests/${id}.json`), JSON.stringify({ id, nombre: x.nombre, temporadas, corrido: new Date().toISOString(), resultado: x.r, ratings: x.ratings }, null, 1));
    /* si hay base, el resultado tambien va a la pantalla */
    if (B) { try { await B.escribir("backtest_resultado", filaResultado(x)); } catch (e) { console.log("  base: " + e.message); } }
    if (sumarSi && x.r.n) {
      const fila = filaDeLiga({ id, nombre: x.nombreLiga, pais: x.pais }, x.r);
      if (!x.v.ok) md += `No se suma **${fila.nombre}** a ligas.json: ${x.v.texto}.\n\n`;
      else { const a = agregarALigas(cfg, fila); cfg = a.cfg; algunaSumada ||= a.agregada;
        md += a.agregada ? `Sumada a ligas.json como \`${fila.slug}\`.\n\n` : `Ya estaba en ligas.json.\n\n`; }
    }
  }
  if (algunaSumada) writeFileSync(aca("./ligas.json"), JSON.stringify(cfg, null, 2) + "\n");
  md += `\n${pedidos} pedidos a la API.\n`;
  resumenDelRun(md);
  salidaWorkflow("sumada", algunaSumada ? "si" : "no");
  console.log(`\n${pedidos} pedidos a la API.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) await main();
