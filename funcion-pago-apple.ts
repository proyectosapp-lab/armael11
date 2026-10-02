/* ══════════════════════════════════════════════════════════════════════════
   PAGO-APPLE (v2, Mano a mano) — las suscripciones de la App Store Y de Play,
   las dos por RevenueCat.

   Se pega en Supabase → Edge Functions → `pago-apple` → Open Editor,
   REEMPLAZANDO lo que había. Mismo nombre a propósito: el webhook de
   RevenueCat y la app ya apuntan acá. "Verify JWT" sigue DESTILDADO.

   Qué cambia respecto de la versión anterior:
     · Siete productos en vez de tres: los tres viejos de Armá el 11
       (liga/tres/todas) y los cuatro de Mano a mano (futbol/tenis/nba/todo).
     · Una persona puede tener MÁS DE UNA suscripción activa a la vez
       (Tenis y Fútbol, por ejemplo). Antes se acreditaba la que vencía más
       tarde; ahora se acredita la mejor DE CADA FAMILIA (futbol, tenis,
       nba, todo). "Todo" es una familia propia y acredita las tres cosas.
     · El id del pago lleva la tienda: "apple:" o "play:". Son numeraciones
       distintas y no se pueden pisar.

   Las tres reglas de siempre siguen: no se le cree nada al que llama, el
   perfil sale del token (o del aviso firmado con el secreto), y el precio y
   el plan los pone la tienda. Acá no hay un solo número de plata.

   Secretos (ya existentes): REVENUECAT_CLAVE (sk_…), REVENUECAT_AVISO.
   Para Android: en RevenueCat la misma app tiene las dos plataformas; la
   clave pública goog_… va en sitio-mam.js (android.revenuecat), la secreta
   es la misma sk_ del proyecto.
   ══════════════════════════════════════════════════════════════════════════ */

const RC_CLAVE = Deno.env.get("REVENUECAT_CLAVE") || "";
const RC_AVISO = Deno.env.get("REVENUECAT_AVISO") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/* producto de la tienda → plan nuestro (el que entiende registrar_pago) y familia.
   TIENE QUE DECIR LO MISMO que PLANES en tienda-mam.js, IOS_PLANES en tienda-ios.js, App Store Connect y Play Console. */
export const PLANES: Record<string, { plan: string; meses: number; familia: string }> = {
  "com.armael11.app.todas.mensual":      { plan: "todas",   meses: 1, familia: "futbol" },
  "com.armael11.app.tres.mensual":       { plan: "tres",    meses: 1, familia: "futbol" },
  "com.armael11.app.liga.mensual":       { plan: "liga",    meses: 1, familia: "futbol" },
  "com.armael11.app.mam.futbol.mensual": { plan: "futbol",  meses: 1, familia: "futbol" },
  "com.armael11.app.mam.tenis.mensual":  { plan: "tenis",   meses: 1, familia: "tenis" },
  "com.armael11.app.mam.nba.mensual":    { plan: "nba",     meses: 1, familia: "nba" },
  "com.armael11.app.mam.todo.mensual":   { plan: "todo",    meses: 1, familia: "todo" },
};
/* dentro de la familia fútbol, cuál es más grande (si hay dos activas, se acredita la mayor) */
const RANGO: Record<string, number> = { liga: 1, tres: 2, todas: 3, futbol: 3, tenis: 1, nba: 1, todo: 9 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export function mismoSecreto(a: string, b: string): boolean {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
export function esPerfil(id: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
}

/* ─── QUÉ TIENE ACTIVO, POR FAMILIA ───────────────────────────────────────
   De `subscriptions` se toma cada producto que todavía no venció. Por familia
   se queda el de mayor rango y, a igual rango, el que vence más tarde. */
export function activosDe(sub: any, ahora = Date.now()) {
  const subs = (sub && sub.subscriptions) || {};
  const porFamilia: Record<string, any> = {};
  for (const id of Object.keys(subs)) {
    if (!PLANES[id]) continue;
    const def = PLANES[id];
    const s = subs[id] || {};
    const vence = Date.parse(String(s.expires_date || ""));
    if (!Number.isFinite(vence) || vence <= ahora) continue;
    const cand = { producto: id, plan: def.plan, meses: def.meses, familia: def.familia, vence,
                   venceTxt: String(s.expires_date), tienda: String(s.store || ""), rango: RANGO[def.plan] || 0 };
    const mejor = porFamilia[def.familia];
    if (!mejor || cand.rango > mejor.rango || (cand.rango === mejor.rango && cand.vence > mejor.vence)) porFamilia[def.familia] = cand;
  }
  return Object.values(porFamilia).sort((a: any, b: any) => b.rango - a.rango);
}
/* compatibilidad con la versión anterior y con probar-pagos.mjs */
export function activoDe(sub: any, ahora = Date.now()) { const l = activosDe(sub, ahora); return l.length ? l[0] : null; }

/* El id del pago lleva la tienda, el producto y el vencimiento: la renovación genera uno nuevo; el mismo aviso
   repetido, el mismo id (registrar_pago no acredita dos veces el mismo id). */
export function idDePago(activo: { producto: string; venceTxt: string; tienda?: string }): string {
  if (/play|google/i.test(String(activo.tienda || ""))) return "play:" + activo.producto + ":" + activo.venceTxt;
  return "apple:" + activo.producto + ":" + activo.venceTxt;
}

async function consultar(perfil: string) {
  const r = await fetch("https://api.revenuecat.com/v1/subscribers/" + encodeURIComponent(perfil),
    { headers: { Authorization: "Bearer " + RC_CLAVE, Accept: "application/json" } });
  if (!r.ok) throw new Error("revenuecat " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json())?.subscriber || null;
}

async function acreditar(perfil: string, activo: any, crudo: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/rpc/registrar_pago", {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_id: idDePago(activo), p_perfil: perfil, p_meses: activo.meses,
      p_estado: "approved", p_monto: 0, p_moneda: "USD",
      p_crudo: crudo, p_plan: activo.plan,
    }),
  });
  if (!r.ok) throw new Error("no pude acreditar: " + r.status + " " + (await r.text()).slice(0, 300));
  return activo.plan;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!RC_CLAVE) return json({ error: "falta configurar el cobro de las tiendas" }, 500);

  const auth = req.headers.get("Authorization") || "";
  let cuerpo: any = {};
  try { cuerpo = await req.json(); } catch (_e) { cuerpo = {}; }

  /* ─── 1. quién toca el timbre ─── */
  let perfil = "";
  let esAviso = false;
  if (cuerpo && cuerpo.event) {
    esAviso = true;
    if (!RC_AVISO || !mismoSecreto(auth, RC_AVISO)) return json({ error: "no" }, 401);
    const e = cuerpo.event || {};
    const id = esPerfil(e.app_user_id) ? String(e.app_user_id)
             : esPerfil(e.original_app_user_id) ? String(e.original_app_user_id) : "";
    if (!id) { console.error("aviso sin perfil: " + JSON.stringify(e).slice(0, 300)); return json({ ok: true }); }
    perfil = id;
  } else {
    const u = await fetch(SB_URL + "/auth/v1/user", { headers: { Authorization: auth, apikey: SB_ANON } });
    if (!u.ok) return json({ error: "Hay que entrar antes de comprar." }, 401);
    const id = (await u.json())?.id;
    if (!id) return json({ error: "Hay que entrar antes de comprar." }, 401);
    perfil = String(id);
  }

  /* ─── 2. qué dice RevenueCat ─── */
  let sub: any;
  try { sub = await consultar(perfil); }
  catch (e) { console.error(e); return json({ error: "No pude hablar con la tienda." }, esAviso ? 500 : 502); }

  const activos = activosDe(sub || {});
  if (!activos.length)
    return json(esAviso ? { ok: true } : { ok: false, planes: [], error: "No encontré ninguna suscripción activa en esta cuenta de la tienda." });

  /* ─── 3. acreditar cada familia ─── */
  const acreditados: string[] = [];
  const fallos: string[] = [];
  for (const a of activos) {
    try { acreditados.push(await acreditar(perfil, a, { activo: a, subscriber: sub })); }
    catch (e) { console.error(e); fallos.push(a.plan); }
  }
  if (fallos.length && !acreditados.length) {
    if (esAviso) return json({ error: "no pude acreditar" }, 500);
    return json({ error: "Apple cobró pero no pude activarlo (o Google, en Android). Escribinos y lo arreglamos." }, 500);
  }
  return json({ ok: true, plan: acreditados[0], planes: acreditados, fallos, hasta: activos[0].venceTxt });
});
