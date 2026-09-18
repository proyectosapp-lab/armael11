/* ══════════════════════════════════════════════════════════════════════════
   PAGO-PLAY — confirma con Google una compra hecha adentro de la app.

   Como las otras dos, ESTE ARCHIVO NO CORRE EN GITHUB: se copia y se pega en
   Supabase → Edge Functions → Open Editor, con el nombre `pago-play`.

   ─── POR QUÉ EXISTE ──────────────────────────────────────────────────────
   Google exige que todo bien digital vendido ADENTRO de una app publicada en
   Play se cobre con su facturación, y prohíbe mandar al usuario a pagar
   afuera. Así que en la app de la tienda el cobro lo hace Play, y en la web
   lo sigue haciendo Mercado Pago. El derecho -qué plan tiene cada uno y
   hasta cuándo- vive en NUESTRA base en los dos casos: lo único que cambia
   es por dónde entra la plata.

   ─── LAS DOS REGLAS, QUE SON LAS MISMAS DE SIEMPRE ───────────────────────

   1. AL TELÉFONO NO SE LE CREE NADA. Lo que manda es un comprobante
      (`purchaseToken`). El estado de la compra se va a buscar a la API de
      Google con nuestra clave. Sin esto, cualquiera manda un JSON con un
      texto inventado y se hace premium.

   2. QUIÉN COMPRA LO DICE EL TOKEN, NO EL CUERPO DEL PEDIDO. El perfil sale
      de preguntarle a Supabase por el token de la sesión.

   Y una tercera que es de Google: UNA COMPRA HAY QUE RECONOCERLA. Si no se
   la reconoce (`acknowledge`) dentro de tres días, Google la devuelve sola.
   Como estos son productos de una sola vez que se vuelven a comprar el mes
   siguiente, en vez de reconocerla se la CONSUME, que reconoce y además
   habilita volver a comprar el mismo producto.

   ─── QUÉ CONFIGURAR ──────────────────────────────────────────────────────
   Un secreto nuevo en Supabase → Edge Functions → Secrets:

     PLAY_CUENTA   el JSON entero de una cuenta de servicio de Google Cloud
                   con acceso a la API de Google Play Developer, y esa cuenta
                   invitada en la Play Console con permiso para ver pedidos y
                   suscripciones. Se pega tal cual viene el archivo.

   Al desplegar, "Verify JWT" puede quedar TILDADO: la llama la app con la
   sesión de la persona.
   ══════════════════════════════════════════════════════════════════════════ */

const CUENTA = Deno.env.get("PLAY_CUENTA") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PAQUETE = Deno.env.get("PLAY_PAQUETE") || "com.armael11.app";

/* Los planes que existen. El precio NO está acá: en Play lo pone Play, que
   es donde está cargado el producto. Lo que sí vive acá es cuántos meses da
   cada uno, que es lo que se acredita. */
const PLANES: Record<string, { meses: number }> = {
  liga:  { meses: 1 },
  tres:  { meses: 1 },
  todas: { meses: 1 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status,
    headers: { ...CORS, "Content-Type": "application/json" } });

/* ─── EL TOKEN DE GOOGLE ────────────────────────────────────────────────
   Google no da una clave fija: se firma un JWT con la clave privada de la
   cuenta de servicio y se lo cambia por un token que dura una hora. Es
   RS256; Deno lo hace con WebCrypto y la clave viene en PKCS#8 adentro del
   JSON, así que no hace falta ninguna librería. */
const base64url = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function tokenDeGoogle(): Promise<string> {
  const cuenta = JSON.parse(CUENTA);
  const pem = String(cuenta.private_key || "")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const cruda = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey("pkcs8", cruda,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);

  const ahora = Math.floor(Date.now() / 1000);
  const cabeza = base64url(new TextEncoder().encode(
    JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const cuerpo = base64url(new TextEncoder().encode(JSON.stringify({
    iss: cuenta.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora, exp: ahora + 3600,
  })));
  const firma = base64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave,
    new TextEncoder().encode(cabeza + "." + cuerpo)));

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: cabeza + "." + cuerpo + "." + firma,
    }),
  });
  if (!r.ok) throw new Error("google no dio token: " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).access_token;
}

/* ─── LA COMPRA, SEGÚN GOOGLE ───────────────────────────────────────────
   `purchaseState` 0 es comprada; 1 cancelada; 2 pendiente (el que paga en
   efectivo en un kiosco, que en Play existe). Solo la 0 acredita, y la 2 no
   es un error: es "todavía no", igual que en Mercado Pago. */
export function estaPaga(compra: { purchaseState?: number }): boolean {
  return Number(compra?.purchaseState) === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!CUENTA) return json({ error: "falta configurar el cobro de Play" }, 500);

  /* ─── 1. QUIÉN ES ───────────────────────────────────────────────────── */
  const auth = req.headers.get("Authorization") || "";
  const u = await fetch(SB_URL + "/auth/v1/user",
    { headers: { Authorization: auth, apikey: SB_ANON } });
  if (!u.ok) return json({ error: "Hay que entrar antes de comprar." }, 401);
  const perfil = (await u.json())?.id;
  if (!perfil) return json({ error: "Hay que entrar antes de comprar." }, 401);

  /* ─── 2. QUÉ DICE QUE COMPRÓ ────────────────────────────────────────── */
  let pedido: any = {};
  try { pedido = await req.json(); } catch (_e) { pedido = {}; }
  const idPlan = String(pedido?.plan || "");
  const comprobante = String(pedido?.comprobante || "");
  const plan = PLANES[idPlan];
  if (!plan) return json({ error: "Ese plan no existe." }, 400);
  if (comprobante.length < 20) return json({ error: "Falta el comprobante." }, 400);

  /* ─── 3. QUÉ DICE GOOGLE ────────────────────────────────────────────── */
  let token: string;
  try { token = await tokenDeGoogle(); }
  catch (e) { console.error(e); return json({ error: "No pude hablar con Google." }, 502); }

  const api = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
              encodeURIComponent(PAQUETE) + "/purchases/products/" +
              encodeURIComponent(idPlan) + "/tokens/" + encodeURIComponent(comprobante);
  const g = await fetch(api, { headers: { Authorization: "Bearer " + token } });
  if (!g.ok) {
    console.error("play rechazó el comprobante: " + g.status + " " + (await g.text()).slice(0, 300));
    return json({ error: "Google no reconoce esa compra." }, 400);
  }
  const compra = await g.json();
  if (!estaPaga(compra))
    return json({ error: "La compra todavía no está confirmada por Google.", pendiente: true }, 202);

  /* ─── 4. ACREDITAR ──────────────────────────────────────────────────────
     El mismo `registrar_pago` que usa Mercado Pago. El id del pago es el de
     Google con un prefijo: así los dos medios no se pueden pisar y un aviso
     repetido no acredita dos veces -esa defensa ya está adentro-. */
  const r = await fetch(SB_URL + "/rest/v1/rpc/registrar_pago", {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE,
               "Content-Type": "application/json" },
    body: JSON.stringify({
      p_id: "play:" + (compra.orderId || comprobante.slice(0, 60)),
      p_perfil: perfil, p_meses: plan.meses, p_estado: "approved",
      p_monto: 0, p_moneda: "ARS", p_crudo: compra, p_plan: idPlan,
    }),
  });
  if (!r.ok) {
    console.error("no pude acreditar: " + r.status + " " + (await r.text()).slice(0, 300));
    return json({ error: "Cobramos pero no pude activarlo. Escribinos y lo arreglamos." }, 500);
  }

  /* ─── 5. CONSUMIR, QUE ES RECONOCER Y ADEMÁS DEJAR VOLVER A COMPRAR ────
     Si esto falla, la compra ya quedó acreditada de nuestro lado: se avisa
     en el log y se contesta que sí. Google, si nunca se la reconoce, la
     devuelve a los tres días, y ese caso se arregla mirando -no dejando a la
     persona sin lo que pagó-. */
  const consumo = await fetch(api + ":consume", {
    method: "POST", headers: { Authorization: "Bearer " + token },
  });
  if (!consumo.ok)
    console.error("no pude consumir la compra: " + consumo.status + " " +
                  (await consumo.text()).slice(0, 200));

  return json({ ok: true, plan: idPlan });
});
