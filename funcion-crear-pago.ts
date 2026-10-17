/* ══════════════════════════════════════════════════════════════════════════
   CREAR-PAGO — arma el link de Mercado Pago para una persona concreta.

   Como la otra, ESTE ARCHIVO NO CORRE EN GITHUB: se copia y se pega en
   Supabase → Edge Functions → Open Editor, con el nombre `crear-pago`.
   Acá vive para quedar versionado y para poder leerlo.

   ─── LAS DOS REGLAS ──────────────────────────────────────────────────────

   1. EL PRECIO LO PONE EL SERVIDOR. El navegador manda un nombre de plan
      —"liga", "todas"— y nada más. Si mandara el precio, alguien abre la
      consola, cambia 3000 por 1, paga un peso y Mercado Pago confirma un
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

   ─── v3, 5/10/2026: UNA SOLA FUNCIÓN PARA TODOS LOS PRODUCTOS ───────
   Los cuatro planes de Mano a mano (la app, en armael11.com/app: Fútbol,
   Tenis, NBA, Todo), el pase de Sacá vos, el pase del Quinteto (nuevo acá:
   la web de NBA pedía `quinteto` y esta función no lo conocía). Los tres
   de Armá el 11 por cantidad de ligas ya no se venden. Cada plan sabe a qué sitio vuelve la persona y
   qué dice el resumen de la tarjeta. `registrar_pago` v3 (2-pagos.sql)
   entiende todos estos nombres; `pago-avisado` tiene que tenerlos en su
   lista (PLANES_VALIDOS), si no acredita el premium de fútbol por defecto.

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
/* Historia: hasta el 18/9 se vendía cantidad de simulaciones; del 18/9 al
   5/10, cantidad de ligas (Tu liga, 3 ligas, Todas). Desde el 5/10 se vende
   un plan por deporte y Todo, en la web y en las tiendas por igual.      */
const PLANES: Record<string, {
  meses: number; precio: number; ligas: number; titulo: string; nombre: string; detalle: string;
  sitio?: string; descriptor?: string;
}> = {
  /* ── LOS CUATRO PLANES, Y NADA MÁS (definido el 2/10, cerrado el 5/10) ──
     Un plan por deporte y Todo. Son los mismos que en las tiendas (US$ 1,99
     por deporte, US$ 3,99 Todo); en pesos, $2.990 y $5.990 al dólar de hoy.
     Los planes por cantidad de ligas (liga/tres/todas) CADUCARON: no se
     venden más en ningún lado. `registrar_pago` los sigue entendiendo para
     los pagos ya hechos, y `pago-avisado` también, pero acá no están: un
     POST con uno de esos nombres recibe "Ese plan no existe".
     Vuelven a la página de gracias de la app web (armael11.com/app); los
     sitios de tenis y NBA piden por su nombre viejo (abajo) y vuelven a su
     propia página.                                                       */
  futbol: { meses: 1, precio: 2990, ligas: 99,
            nombre: "Fútbol", detalle: "el simulador en las once ligas, sin tope",
            titulo: "Mano a mano · Fútbol, un mes",
            sitio: "https://armael11.com/app", descriptor: "MANOAMANO" },
  tenis:  { meses: 1, precio: 2990, ligas: 0,
            nombre: "Tenis", detalle: "el número, la perilla y la simulación de cada partido ATP",
            titulo: "Mano a mano · Tenis, un mes",
            sitio: "https://armael11.com/app", descriptor: "MANOAMANO" },
  nba:    { meses: 1, precio: 2990, ligas: 0,
            nombre: "NBA", detalle: "el número y la rotación de cada partido",
            titulo: "Mano a mano · NBA, un mes",
            sitio: "https://armael11.com/app", descriptor: "MANOAMANO" },
  todo:   { meses: 1, precio: 5990, ligas: 99,
            nombre: "Todo", detalle: "fútbol, tenis y NBA",
            titulo: "Mano a mano · Todo, un mes",
            sitio: "https://armael11.com/app", descriptor: "MANOAMANO" },
};
/* ── LOS NOMBRES VIEJOS DE LOS SITIOS DE TENIS Y NBA ─────────────────────
   sacavos.com pide `sacavos` y armaelquinteto.com pide `quinteto`: es el
   mismo pase que Tenis y NBA (la misma fila de `pase`), al mismo precio.
   Se les contesta con su nombre, se cobra el plan de verdad, y la persona
   vuelve a su sitio con el resumen de tarjeta de su sitio.               */
const NOMBRES_VIEJOS: Record<string, { plan: string; sitio: string; descriptor: string }> = {
  sacavos:  { plan: "tenis", sitio: "https://sacavos.com",         descriptor: "SACAVOS" },
  quinteto: { plan: "nba",   sitio: "https://armaelquinteto.com",  descriptor: "QUINTETO" },
};
/* lo que se ofrece: los cuatro, y los dos nombres viejos con el precio del plan que son */
function ofrecidos() {
  const lista = Object.entries(PLANES).map(([id, p]) => ({ id, plan: id, meses: p.meses, precio: p.precio, ligas: p.ligas, nombre: p.nombre, detalle: p.detalle, moneda: "ARS" }));
  for (const [id, v] of Object.entries(NOMBRES_VIEJOS)) { const p = PLANES[v.plan]; lista.push({ id, plan: v.plan, meses: p.meses, precio: p.precio, ligas: p.ligas, nombre: p.nombre, detalle: p.detalle, moneda: "ARS" }); }
  return lista;
}
/* el plan que se cobra, a partir de lo que pidió el sitio */
function planDe(pedido: string) {
  const viejo = NOMBRES_VIEJOS[pedido];
  const id = viejo ? viejo.plan : pedido;
  const p = PLANES[id];
  if (!p) return null;
  return { id, ...p, sitio: viejo ? viejo.sitio : p.sitio, descriptor: viejo ? viejo.descriptor : p.descriptor };
}
/* a dónde puede volver la persona si el sitio lo pide (`vuelta`): solo a nuestros dominios */
const VUELTAS = ["https://armael11.com", "https://sacavos.com", "https://armaelquinteto.com"];
function vueltaDe(pedida: unknown, plan: { sitio?: string }): string {
  const v = String(pedida || "");
  if (VUELTAS.some((d) => v === d + "/gracias.html" || v.startsWith(d + "/") && v.endsWith("/gracias.html"))) return v;
  return (plan.sitio || SITIO) + "/gracias.html";
}

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
  if (req.method === "GET") {
    const pedido = new URL(req.url).searchParams.get("plan") || "";   // ?plan=quinteto → solo ese
    return json({ planes: ofrecidos().filter((p) => !pedido || p.id === pedido) });
  }

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
  const plan = planDe(String(pedido?.plan || ""));
  if (!plan) return json({ error: "Ese plan no existe." }, 400);
  const idPlan = plan.id;   // el nombre de verdad (tenis, no sacavos): es lo que lee pago-avisado

  /* ─── 3. LA PREFERENCIA ──────────────────────────────────────────────
     `notification_url` va acá y no solo en el panel de Mercado Pago a
     propósito: así el aviso está atado a ESTA preferencia y no a que alguien
     haya dejado bien configurada una pantalla que nadie vuelve a mirar. */
  const pref = {
    items: [{
      id: idPlan, title: plan.titulo, quantity: 1,
      unit_price: plan.precio, currency_id: "ARS",
    }],
    /* "<uuid>:<meses>:<plan>". El tercer campo es nuevo: sin el, el webhook
       acredita el pase pero no sabe QUE cupo comprar la persona. Se agrega
       al final a proposito, para que un aviso viejo de dos campos siga
       leyendose bien. */
    external_reference: perfil + ":" + plan.meses + ":" + idPlan,
    notification_url: SB_URL + "/functions/v1/pago-avisado",
    back_urls: {
      success: vueltaDe(pedido?.vuelta, plan),
      pending: vueltaDe(pedido?.vuelta, plan) + "?estado=pendiente",
      failure: vueltaDe(pedido?.vuelta, plan) + "?estado=falló",
    },
    auto_return: "approved",
    statement_descriptor: plan.descriptor || "ARMAEL11",
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
    return json({ error: "No se pudo armar el pago. Prueba de nuevo en un rato." }, 502);
  }

  const p = await r.json();
  console.log("preferencia " + p.id + " para " + String(perfil).slice(0, 8) + "… · " +
              plan.meses + " mes(es) · $" + plan.precio);

  /* `init_point` es producción; `sandbox_init_point` es la de prueba. Se
     devuelven las dos y la app usa la de producción: así probar con las
     credenciales de prueba no obliga a tocar código. */
  return json({ link: p.init_point, prueba: p.sandbox_init_point,
                meses: plan.meses, precio: plan.precio, ligas: plan.ligas });
});
