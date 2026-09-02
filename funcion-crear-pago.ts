/* ══════════════════════════════════════════════════════════════════════════
   CREAR-PAGO — arma el link de Mercado Pago para una persona concreta.

   Como la otra, ESTE ARCHIVO NO CORRE EN GITHUB: se copia y se pega en
   Supabase → Edge Functions → Open Editor, con el nombre `crear-pago`.
   Acá vive para quedar versionado y para poder leerlo.

   ─── LAS DOS REGLAS ──────────────────────────────────────────────────────

   1. EL PRECIO LO PONE EL SERVIDOR. El navegador manda un nombre de plan
      —"chico", "libre"— y nada más. Si mandara el precio, alguien abre la
      consola, cambia 5500 por 1, paga un peso y Mercado Pago confirma un
      pago legítimo de un peso: el webhook haría todo bien y acreditaría. No
      hay forma de arreglar eso más adelante; hay que no dejarlo entrar.

   2. QUIÉN COMPRA LO DICE EL TOKEN, NO EL CUERPO DEL PEDIDO. El id del
      perfil se saca preguntándole a Supabase por el token que vino en la
      cabecera. Si viniera en el cuerpo, cualquiera podría comprarle premium
      a otro —lo cual suena inofensivo— o, al revés, hacer que el pago de
      otro lo acredite a él, que no lo es.

   El id del perfil viaja a Mercado Pago en `external_reference` con la
   forma "<uuid>:<meses>:<plan>", que es lo que `pago-avisado` lee al volver.
   Es el único hilo que une el pago con la persona, y por eso lo escribe el
   servidor de los dos lados.

   ─── QUÉ CONFIGURAR ──────────────────────────────────────────────────────
   El mismo secreto MP_ACCESS_TOKEN que la otra función. Al desplegar, esta
   SÍ puede quedar con "Verify JWT" tildado: la llama la app con la sesión
   de la persona. Igual adentro se vuelve a verificar, porque una función
   que depende de una tilde en un panel es una función que un día se
   despliega sin la tilde.
   ══════════════════════════════════════════════════════════════════════════ */

const MP = Deno.env.get("MP_ACCESS_TOKEN") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SITIO = Deno.env.get("SITIO_URL") || "https://armael11.com";

/* ─── LOS PLANES ─────────────────────────────────────────────────────────
   EL ÚNICO LUGAR DEL PROYECTO DONDE VIVE EL PRECIO. Está acá y no en la app
   por la regla 1: la app dibuja lo que le decimos, el cobro sale de esto.

   `precio` va en PESOS ARGENTINOS. Cambiar un número acá y volver a
   desplegar cambia el precio en todos lados: la app pide esta misma lista
   para dibujar los botones, así que no hay dos precios que puedan quedar
   distintos.                                                             */
const PLANES: Record<string, {
  meses: number; precio: number; cupo: number | null; titulo: string; nombre: string;
}> = {
  chico: { meses: 1, precio: 5500,  cupo: 40,
           nombre: "40 simulaciones",  titulo: "Armá el 11 · 40 simulaciones por mes" },
  medio: { meses: 1, precio: 12000, cupo: 100,
           nombre: "100 simulaciones", titulo: "Armá el 11 · 100 simulaciones por mes" },
  libre: { meses: 1, precio: 20000, cupo: null,
           nombre: "Sin límite",       titulo: "Armá el 11 · simulaciones sin límite" },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status,
    headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  /* La app pide la lista para dibujar los botones con el precio de verdad.
     Sin sesión, porque los precios no son un secreto: lo que no se puede es
     elegirlos. */
  if (req.method === "GET")
    return json({ planes: Object.entries(PLANES).map(([id, p]) =>
      ({ id, meses: p.meses, precio: p.precio, cupo: p.cupo,
         nombre: p.nombre, moneda: "ARS" })) });

  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!MP) return json({ error: "falta configurar el cobro" }, 500);

  /* ─── 1. QUIÉN ES ─────────────────────────────────────────────────────
     Se le pregunta a Supabase por el token. No se abre el token acá: leerlo
     sin verificar la firma es leer lo que el que lo mandó quiso escribir. */
  const auth = req.headers.get("Authorization") || "";
  const u = await fetch(SB_URL + "/auth/v1/user",
    { headers: { Authorization: auth, apikey: SB_ANON } });
  if (!u.ok) return json({ error: "Hay que entrar antes de comprar." }, 401);
  const usuario = await u.json();
  const perfil = usuario?.id;
  if (!perfil) return json({ error: "Hay que entrar antes de comprar." }, 401);

  /* ─── 2. QUÉ PLAN ────────────────────────────────────────────────────── */
  let pedido: any = {};
  try { pedido = await req.json(); } catch (_e) { pedido = {}; }
  const idPlan = String(pedido?.plan || "chico");
  const plan = PLANES[idPlan];
  if (!plan) return json({ error: "Ese plan no existe." }, 400);

  /* ─── 3. LA PREFERENCIA ──────────────────────────────────────────────
     `notification_url` va acá y no solo en el panel de Mercado Pago a
     propósito: así el aviso está atado a ESTA preferencia y no a que alguien
     haya dejado bien configurada una pantalla que nadie vuelve a mirar. */
  const pref = {
    items: [{
      id: "premium", title: plan.titulo, quantity: 1,
      unit_price: plan.precio, currency_id: "ARS",
    }],
    /* "<uuid>:<meses>:<plan>". El tercer campo es nuevo: sin el, el webhook
       acredita el pase pero no sabe QUE cupo comprar la persona. Se agrega
       al final a proposito, para que un aviso viejo de dos campos siga
       leyendose bien. */
    external_reference: perfil + ":" + plan.meses + ":" + idPlan,
    notification_url: SB_URL + "/functions/v1/pago-avisado",
    back_urls: {
      success: SITIO + "/gracias.html",
      pending: SITIO + "/gracias.html?estado=pendiente",
      failure: SITIO + "/gracias.html?estado=falló",
    },
    auto_return: "approved",
    statement_descriptor: "ARMAEL11",
    /* Sin `payer`: no le mandamos a Mercado Pago el mail de nadie. Se lo
       pide él, que ya lo tiene. */
  };

  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: "Bearer " + MP, "Content-Type": "application/json" },
    body: JSON.stringify(pref),
  });

  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 400);
    console.error("mercadopago rechazó la preferencia: " + r.status + " " + detalle);
    return json({ error: "No pude armar el pago. Probá de nuevo en un rato." }, 502);
  }

  const p = await r.json();
  console.log("preferencia " + p.id + " para " + String(perfil).slice(0, 8) + "… · " +
              plan.meses + " mes(es) · $" + plan.precio);

  /* `init_point` es producción; `sandbox_init_point` es la de prueba. Se
     devuelven las dos y la app usa la de producción: así probar con las
     credenciales de prueba no obliga a tocar código. */
  return json({ link: p.init_point, prueba: p.sandbox_init_point,
                meses: plan.meses, precio: plan.precio, cupo: plan.cupo });
});
