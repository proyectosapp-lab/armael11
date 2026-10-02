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
          fútbol  armael11.com/datos/liga-<slug>.js     → partidos[].estado FT/AET/PEN + golL/golV
          NBA     armaelquinteto.com/datos/nba-jugados.js → partidos[].pl / pv
     3. Lo que encontró lo escribe con `resolver_partido` (solo servicio),
        que recalcula puntos y cierra el desafío si no queda nada pendiente.
        Un partido suspendido o cancelado se escribe con 0: se saca del
        desafío y nadie suma por él.

   No inventa nada: si un partido no aparece en el archivo, queda pendiente
   para la próxima vuelta. Y nunca lee ni escribe elecciones.

   PARA QUE CORRA SOLO (pegar en SQL Editor, una vez; requiere pg_cron y
   pg_net habilitadas en Database → Extensions):

     select cron.schedule('resolver-desafios', '17 * * * *', $$
       select net.http_post(
         url := 'https://wbqxmoerzofzierurxfb.supabase.co/functions/v1/resolver-desafios',
         headers := '{"Content-Type":"application/json","Authorization":"Bearer PEGÁ-ACÁ-LA-MISMA-FRASE"}'::jsonb,
         body := '{}'::jsonb);
     $$);
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

/* los archivos son `window.X = {...};` — se saca el JSON de adentro */
export function jsonDeArchivo(texto: string): any {
  const t = String(texto || "");
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j < i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch (_e) { return null; }
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
  const p = ((liga && liga.partidos) || []).find((x: any) => String(x.id) === String(partido));
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

  let resueltos = 0, anulados = 0; const sinResultado: string[] = [];
  for (const p of pendientes) {
    let r: number | null = null;
    try {
      if (p.deporte === "tenis") r = resolverTenis(await traer("tenis", SITIOS.tenis), p.fuente, p.partido);
      else if (p.deporte === "futbol") { const slug = String(p.fuente || ""); if (slug) r = resolverFutbol(await traer("futbol:" + slug, SITIOS.futbol(slug)), p.partido); }
      else if (p.deporte === "nba") r = resolverNba(await traer("nba", SITIOS.nba), p.partido);
      // un partido que lleva más de 3 días sin aparecer en ningún archivo se anula: no se puede dejar un desafío abierto para siempre
      if (r == null && Date.now() - Date.parse(p.empieza) > 3 * 86400000) r = 0;
    } catch (e) { console.error(e); }
    if (r == null) { sinResultado.push(p.deporte + ":" + p.partido); continue; }
    try { await rpc("resolver_partido", { p_deporte: p.deporte, p_partido: String(p.partido), p_resultado: r }); if (r === 0) anulados++; else resueltos++; }
    catch (e) { console.error(e); }
  }
  return json({ ok: true, pendientes: pendientes.length, resueltos, anulados, esperando: sinResultado });
});
