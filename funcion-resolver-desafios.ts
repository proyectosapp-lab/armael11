/* ══════════════════════════════════════════════════════════════════════════
   RESOLVER-DESAFIOS — carga los resultados de los partidos de los desafíos.

   Se pega en Supabase → Edge Functions → New function → `resolver-desafios`.
   "Verify JWT" DESTILDADO: la llama un reloj (pg_cron) o el workflow de cada
   motor, no una persona con sesión. La puerta es un secreto propio:

     RESOLVER_CLAVE   una frase larga inventada por vos (Edge Functions →
                      Secrets). El que llama la manda como
                      `Authorization: Bearer <esa frase>`.

   Qué hace, cada vez que la llaman (alcanza con una vez por hora):
     1. Le pide a la base los partidos sin resultado que empezaron hace más
        de 90 minutos (`desafios_pendientes`).
     2. Para cada deporte baja el archivo PÚBLICO de resultados del sitio
        correspondiente —los mismos que usan las webs— y busca el partido:
          tenis   sacavos.com/datos/tenis-hoy.js        → jugados[].gano (1 = ganó a, 2 = ganó b)
          fútbol  armael11.com/datos/liga-<slug>.js     → partidos[] y recientes[]: estado FT/AET/PEN + golL/golV
          NBA     armaelquinteto.com/datos/nba-jugados.js → partidos[].pl / pv
     3. Lo que encontró lo escribe con `resolver_partido` (solo servicio), junto
        con el número que el modelo había publicado antes del partido (para
        los partidos que entraron al desafío sin número: NBA y tenis lejanos),
        que recalcula puntos y cierra el desafío si no queda nada pendiente.
        Un partido suspendido o cancelado se escribe con 0: se saca del
        desafío y nadie suma por él.

   No inventa nada: si un partido no aparece en el archivo, queda pendiente
   para la próxima vuelta. Y nunca lee ni escribe elecciones.

   v4 (18/10/2026): los archivos de fútbol empiezan con
   `window.LIGAS=window.LIGAS||{};window.LIGAS["x"]={...}` y la versión
   anterior agarraba la primera llave (la del `||{}`): no leía nunca un
   resultado de fútbol. Ahora se busca el objeto que viene después de un `=`
   y se lee entero, contando llaves fuera de los textos.

   v5 (23/10/2026): el archivo de cada liga trae solo la fecha en curso.
   Cuando termina el último partido de una fecha, la corrida siguiente ya
   publica la que viene y esos partidos desaparecen: los cinco de Champions
   del 21/10 (los últimos de la fecha 3) no se resolvieron nunca. Ahora el
   motor de armael11 (ligas-api.mjs) agrega `recientes`, los terminados de
   los últimos 5 días, y acá se busca en `partidos` y después en `recientes`.
   ══════════════════════════════════════════════════════════════════════════ */

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLAVE = Deno.env.get("RESOLVER_CLAVE") || "";

const SITIOS = {
  tenis: "https://sacavos.com/datos/tenis-hoy.js",
  futbol: (slug: string) => "https://armael11.com/datos/liga-" + slug.replace(/[^a-z0-9-]/g, "") + ".js",
  nba: "https://armaelquinteto.com/datos/nba-jugados.js",
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });

function mismoSecreto(a: string, b: string): boolean {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0;
}

/* los archivos son `window.X = {...};` (a veces con otras sentencias antes y después): se saca el objeto principal */
export function jsonDeArchivo(texto: string): any {
  const t = String(texto || "");
  const candidatos: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "{") { let k = i - 1; while (k >= 0 && /\s/.test(t[k])) k--; if (t[k] === "=") candidatos.push(i); }
  if (!candidatos.length) { const i = t.indexOf("{"); if (i >= 0) candidatos.push(i); }
  for (let c = candidatos.length - 1; c >= 0; c--) {
    const i = candidatos[c]; let prof = 0, enTexto = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (enTexto) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') enTexto = false; continue; }
      if (ch === '"') enTexto = true;
      else if (ch === "{") prof++;
      else if (ch === "}") { prof--; if (prof === 0) { try { const o = JSON.parse(t.slice(i, j + 1)); if (o && Object.keys(o).length) return o; } catch (_e) { /* sigue */ } break; } }
    }
  }
  return null;
}
async function bajar(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error(url + " → " + r.status);
  return jsonDeArchivo(await r.text());
}

/* ─── cada deporte: devuelve 1 | 2 | 3 (resultado), 0 (anulado) o null (todavía no) ─── */
export function resolverTenis(hoy: any, fuente: string, partido: string): number | null {
  const m = /^tenis:([^:]*):([^:]*):(\d{4}-\d{2}-\d{2})?/.exec(String(fuente || ""));
  const aK = m ? m[1] : "", bK = m ? m[2] : "", fecha = m ? m[3] || "" : "";
  const jugados = (hoy && hoy.jugados) || [];
  const cerca = (f: string) => !fecha || !f || Math.abs(Date.parse(f) - Date.parse(fecha)) <= 2 * 86400000;
  for (const j of jugados) {
    if (!j || !j.a || !j.b) continue;
    const mismo = String(j.k) === String(partido) && String(j.k) !== "";
    const directo = aK && bK && String(j.a.k) === aK && String(j.b.k) === bK;
    const dado = aK && bK && String(j.a.k) === bK && String(j.b.k) === aK;
    if (!(mismo || ((directo || dado) && cerca(j.fecha)))) continue;
    const g = Number(j.gano);
    if (g !== 1 && g !== 2) return null;
    if (dado && !directo) return g === 1 ? 2 : 1;
    return g;
  }
  // ¿sigue en la lista de partidos con un resultado? (por si el motor lo deja ahí)
  for (const p of (hoy && hoy.partidos) || []) {
    if (String(p.k) !== String(partido)) continue;
    if (p.gano === 1 || p.gano === 2) return p.gano;
    if (p.cancelado || p.wo) return 0;
  }
  return null;
}
export function resolverFutbol(liga: any, partido: string): number | null {
  const igual = (x: any) => String(x.id) === String(partido);
  const p = ((liga && liga.partidos) || []).find(igual) || ((liga && liga.recientes) || []).find(igual);
  if (!p) return null;
  const est = String(p.estado || "").toUpperCase();
  if (/^(CANC|ABD|AWD|WO|PST|POSTP)/.test(est)) return 0;
  if (!/^(FT|AET|PEN)$/.test(est)) return null;
  if (p.golL == null || p.golV == null) return null;
  const l = Number(p.golL), v = Number(p.golV);
  return l > v ? 1 : l === v ? 2 : 3;
}
export function resolverNba(jugados: any, partido: string): number | null {
  const p = ((jugados && jugados.partidos) || []).find((x: any) => String(x.id) === String(partido));
  if (!p || p.pl == null || p.pv == null) return null;
  const l = Number(p.pl), v = Number(p.pv);
  if (!Number.isFinite(l) || !Number.isFinite(v) || l === v) return null;
  return l > v ? 1 : 2;
}

/* ─── el número que el modelo publicó ANTES del partido, para los desafíos que lo agregaron sin número ───
   NBA: jugados.partidos[].p es la probabilidad del local, guardada en el registro cuando se publicó (48 h antes).
   Tenis: jugados[].p es la del jugador a (en la fuente del desafío, "tenis:aK:bK:fecha", a es el local).
   Fútbol no hace falta: el número lo simula la app al armar el desafío. Devuelve {modelo, p} o null. */
export function modeloNba(jugados: any, partido: string): { modelo: number; p: number } | null {
  const x = ((jugados && jugados.partidos) || []).find((y: any) => String(y.id) === String(partido));
  const p = x ? Number(x.p) : NaN;
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  return p >= 0.5 ? { modelo: 1, p } : { modelo: 2, p: 1 - p };
}
export function modeloTenis(hoy: any, fuente: string, partido: string): { modelo: number; p: number } | null {
  const m = /^tenis:([^:]*):([^:]*):/.exec(String(fuente || ""));
  const aK = m ? m[1] : "", bK = m ? m[2] : "";
  for (const j of (hoy && hoy.jugados) || []) {
    if (!j || !j.a || !j.b) continue;
    const mismo = String(j.k) === String(partido) && String(j.k) !== "";
    const directo = aK && bK && String(j.a.k) === aK && String(j.b.k) === bK;
    const dado = aK && bK && String(j.a.k) === bK && String(j.b.k) === aK;
    if (!(mismo || directo || dado)) continue;
    let p = Number(j.p); if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
    if (dado && !directo) p = 1 - p;
    return p >= 0.5 ? { modelo: 1, p } : { modelo: 2, p: 1 - p };
  }
  return null;
}

async function rpc(nombre: string, args: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/rpc/" + nombre, {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error(nombre + " → " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "método" }, 405);
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!mismoSecreto(auth, CLAVE) && !mismoSecreto(auth, SB_SERVICE)) return json({ error: "no" }, 401);

  let pendientes: any[] = [];
  try { pendientes = (await rpc("desafios_pendientes", {})) || []; }
  catch (e) { console.error(e); return json({ error: "no pude leer los pendientes" }, 500); }
  if (!pendientes.length) return json({ ok: true, pendientes: 0, resueltos: 0 });

  const cache: Record<string, any> = {};
  const traer = async (clave: string, url: string) => { if (!(clave in cache)) { try { cache[clave] = await bajar(url); } catch (e) { console.error(e); cache[clave] = null; } } return cache[clave]; };

  let resueltos = 0, anulados = 0; const sinResultado: string[] = []; const sinArchivo: string[] = [];
  for (const p of pendientes) {
    let r: number | null = null, m: { modelo: number; p: number } | null = null;
    try {
      if (p.deporte === "tenis") { const T = await traer("tenis", SITIOS.tenis); r = resolverTenis(T, p.fuente, p.partido); m = modeloTenis(T, p.fuente, p.partido); if (!T) sinArchivo.push("tenis"); }
      else if (p.deporte === "futbol") { const slug = String(p.fuente || ""); if (slug) { const L = await traer("futbol:" + slug, SITIOS.futbol(slug)); if (!L) sinArchivo.push("futbol:" + slug); r = resolverFutbol(L, p.partido); } }
      else if (p.deporte === "nba") { const N = await traer("nba", SITIOS.nba); r = resolverNba(N, p.partido); m = modeloNba(N, p.partido); if (!N) sinArchivo.push("nba"); }
      // un partido que lleva más de 3 días sin aparecer en ningún archivo se anula: no se puede dejar un desafío abierto para siempre
      if (r == null && Date.now() - Date.parse(p.empieza) > 3 * 86400000) r = 0;
    } catch (e) { console.error(e); }
    if (r == null) { sinResultado.push(p.deporte + ":" + p.partido); continue; }
    // el número del modelo va junto con el resultado: el servidor lo anota solo si ese partido no lo tenía (3-modelo-tardio.sql)
    try { await rpc("resolver_partido", { p_deporte: p.deporte, p_partido: String(p.partido), p_resultado: r, p_modelo: m ? m.modelo : null, p_modelo_p: m ? Math.round(m.p * 1000) / 1000 : null }); if (r === 0) anulados++; else resueltos++; }
    catch (e) { console.error(e); }
  }
  return json({ ok: true, pendientes: pendientes.length, resueltos, anulados, esperando: sinResultado, sin_archivo: [...new Set(sinArchivo)] });
});
