/* ══════════════════════════════════════════════════════════════════════════
   PAGO-AVISADO — la función que escucha a Mercado Pago.

   ESTE ARCHIVO NO CORRE EN GITHUB. Vive acá para que quede versionado con
   el resto y para poder leerlo, pero se ejecuta en Supabase. Se copia y se
   pega en Edge Functions → Open Editor, con el nombre `pago-avisado`.

   ─── LA REGLA QUE ORDENA TODO ESTE ARCHIVO ───────────────────────────────

   NO SE LE CREE NADA AL AVISO. Mercado Pago manda un POST diciendo "pasó
   algo con el pago 123". Eso es lo único que se toma: el número. El estado,
   el monto y a quién corresponde se van a BUSCAR a la API de Mercado Pago
   con nuestro token.

   Por qué, en concreto: esta dirección es pública y no puede pedir
   contraseña —Mercado Pago no tiene ninguna que darle—. Si el cuerpo del
   aviso se creyera, cualquiera que la descubra manda
   `{"status":"approved","external_reference":"<mi id>"}` y se hace premium
   gratis, para siempre, desde la consola del navegador. Yendo a buscar el
   pago, ese mismo mensaje falso termina en "ese pago no existe" y no pasa
   nada.

   Es la misma regla que ya rige en `puntos-api.mjs`: los datos que valen
   plata los trae el servidor de la fuente, nunca del cliente.

   ─── QUÉ CONFIGURAR, UNA SOLA VEZ ────────────────────────────────────────

   1. En Supabase → Edge Functions → Secrets, crear:
        MP_ACCESS_TOKEN    el Access Token de PRODUCCIÓN de Mercado Pago.
      SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las pone Supabase sola: no
      hay que pegarlas en ningún lado, y ese es el punto.

   2. Al desplegar, DESTILDAR "Verify JWT". Es el único lugar del proyecto
      donde corresponde: Mercado Pago no tiene una sesión de Supabase para
      mostrar. La puerta queda abierta a propósito y por eso adentro no se
      le cree nada a nadie.

   3. En Mercado Pago → Tus integraciones → Arma el 11 → Notificaciones →
      Webhooks, poner la dirección de esta función y marcar el evento
      "Pagos".

   ─── POR QUÉ SIEMPRE CONTESTA 200 ────────────────────────────────────────

   Mercado Pago reintenta lo que no contesta 200, durante días. Un aviso que
   no entendemos —una notificación de otro tipo, un pago que no es nuestro—
   no mejora reintentándolo: se contesta 200 y se anota en el log. El único
   caso que SÍ conviene que reintente es cuando falla nuestra base, porque
   ahí el reintento es exactamente lo que hace falta.
   ══════════════════════════════════════════════════════════════════════════ */

const MP = Deno.env.get("MP_ACCESS_TOKEN") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const ok = (msg: string) => new Response(msg, { status: 200 });
const reintenta = (msg: string) => new Response(msg, { status: 500 });

/* El id del pago puede venir de tres formas según la antigüedad del aviso.
   Las tres se aceptan: no cuesta nada y evita el día que Mercado Pago mande
   la vieja y nadie entienda por qué no acredita.
     nuevo   POST con {type:"payment", data:{id}}
     viejo   ?topic=payment&id=123
     mixto   ?type=payment&data.id=123                                     */
function idDelAviso(url: URL, cuerpo: any): { tipo: string; id: string } {
  const q = url.searchParams;
  const tipo = String(cuerpo?.type || cuerpo?.topic || q.get("type") || q.get("topic") || "");
  const id = String(cuerpo?.data?.id || cuerpo?.id || q.get("data.id") || q.get("id") || "");
  return { tipo, id };
}

/* A quién y por cuántos meses. Va en `external_reference` con la forma
   "<uuid del perfil>:<meses>", que la arma `crear-pago`. Se valida la forma
   del uuid antes de mandárselo a la base: un external_reference cualquiera
   —los hay, si alguien cobra por un link suelto— tiene que terminar en un
   pago anotado sin perfil, no en un error de Postgres. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function leerReferencia(ref: string | null): { perfil: string | null; meses: number } {
  const [p, m] = String(ref || "").split(":");
  const meses = Math.min(24, Math.max(1, parseInt(m, 10) || 1));
  return { perfil: UUID.test(p || "") ? p.toLowerCase() : null, meses };
}

Deno.serve(async (req) => {
  if (req.method === "GET") return ok("pago-avisado, andando");
  if (req.method !== "POST") return ok("ignorado");

  let cuerpo: any = {};
  try { cuerpo = await req.json(); } catch (_e) { cuerpo = {}; }

  const { tipo, id } = idDelAviso(new URL(req.url), cuerpo);

  /* Mercado Pago también avisa de `merchant_order` y de otras cosas. No son
     un error: son avisos que no nos tocan. */
  if (!/payment/i.test(tipo) || !id) return ok("no es un aviso de pago");

  if (!MP || !SB_URL || !SB_KEY) {
    console.error("faltan los secretos: MP_ACCESS_TOKEN o las de Supabase");
    return reintenta("sin configurar");
  }

  /* ─── 1. IR A BUSCAR EL PAGO DE VERDAD ──────────────────────────────── */
  const r = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(id),
    { headers: { Authorization: "Bearer " + MP } });

  if (r.status === 404) return ok("ese pago no existe");          /* aviso falso */
  if (!r.ok) {
    console.error("mercadopago contestó " + r.status + " por el pago " + id);
    /* 401 es nuestro token vencido y 5xx es un problema de ellos: en los dos
       casos el reintento sirve. */
    return reintenta("no pude consultar el pago");
  }

  const pago = await r.json();
  const { perfil, meses } = leerReferencia(pago.external_reference);

  console.log("pago " + id + " · " + pago.status + " · " +
              (perfil ? "perfil " + perfil.slice(0, 8) + "… · " + meses + " mes(es)"
                      : "SIN perfil (external_reference: " + pago.external_reference + ")"));

  /* ─── 2. ANOTARLO Y ACREDITARLO, EN UN SOLO MOVIMIENTO ───────────────
     Toda la inteligencia está en `registrar_pago`, adentro de la base: es
     el único lugar donde "fijarse si ya lo cobré" y "cobrarlo" pasan juntos.
     Acá arriba serían dos pedidos, y dos avisos simultáneos entregarían dos
     meses por un mes pago. Esta función se limita a contar lo que vio.

     Se guarda un recorte del pago, no el pago entero: el objeto de Mercado
     Pago trae los datos de la tarjeta y del comprador, y nada de eso hace
     falta para nada. Lo que no se guarda no se filtra.                    */
  const w = await fetch(SB_URL + "/rest/v1/rpc/registrar_pago", {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY,
               "Content-Type": "application/json" },
    body: JSON.stringify({
      p_id: String(pago.id), p_perfil: perfil, p_meses: meses,
      p_estado: String(pago.status || "?"),
      p_monto: pago.transaction_amount ?? null,
      p_moneda: pago.currency_id ?? null,
      p_crudo: {
        estado: pago.status, detalle: pago.status_detail,
        medio: pago.payment_type_id, fecha: pago.date_approved || pago.date_created,
        referencia: pago.external_reference,
      },
    }),
  });

  if (!w.ok) {
    console.error("no pude registrar el pago " + id + ": HTTP " + w.status + " " +
                  (await w.text()).slice(0, 300));
    /* Acá SÍ conviene que reintente: el pago existe y está aprobado, y lo
       que falló es nuestro. */
    return reintenta("no pude registrar");
  }

  const hasta = await w.json();
  console.log(hasta ? "acreditado hasta " + hasta : "nada que acreditar (repetido o no aprobado)");
  return ok(hasta ? "acreditado" : "anotado");
});
