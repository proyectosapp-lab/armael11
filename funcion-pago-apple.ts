/* ══════════════════════════════════════════════════════════════════════════
   PAGO-APPLE — las suscripciones del iPhone.

   Como las otras tres, ESTE ARCHIVO NO CORRE EN GITHUB: se copia y se pega
   en Supabase → Edge Functions → Open Editor, con el nombre `pago-apple`.

   ─── POR QUÉ ES UNA SOLA FUNCIÓN Y NO DOS ────────────────────────────────
   Hay dos momentos en que hay que acreditar una suscripción de Apple:

     A. LA PERSONA ACABA DE COMPRAR (o de tocar "Restaurar compras"). La app
        pregunta, con la sesión de esa persona, y quiere una respuesta YA
        porque hay alguien mirando la pantalla.
     B. APPLE COBRÓ EL MES 4 A LAS TRES DE LA MAÑANA. No hay nadie mirando
        nada. RevenueCat manda un aviso y hay que acreditarlo igual.

   Las dos hacen EXACTAMENTE lo mismo: preguntarle a RevenueCat qué tiene
   esa persona y acreditarlo. Lo único que cambia es quién toca el timbre y
   cómo se prueba que tiene derecho a tocarlo. Partirlo en dos funciones
   sería copiar la parte que importa en dos archivos, y la próxima vez que
   se toque una de las dos, la otra queda vieja y nadie se entera hasta que
   alguien no recibe el mes que pagó.

   ─── LAS TRES REGLAS, QUE SON LAS DE SIEMPRE ─────────────────────────────

   1. NO SE LE CREE NADA AL QUE LLAMA. Ni al teléfono ni al webhook. El
      cuerpo del pedido se usa para saber DE QUIÉN estamos hablando y para
      nada más: qué compró, si está paga y hasta cuándo se le va a preguntar
      a RevenueCat con la clave secreta. Un webhook es una dirección pública
      y este archivo está escrito como si cualquiera lo conociera.

   2. QUIÉN COMPRA LO DICE EL TOKEN. En el caso A, el perfil sale de
      preguntarle a Supabase por el token de la sesión, nunca del cuerpo.
      En el caso B sale del aviso, pero ese camino exige el secreto
      compartido y además vuelve a consultar a RevenueCat con ese id: si el
      id fuera inventado, la consulta devuelve una cuenta sin nada y no se
      acredita nada.

   3. EL PRECIO Y EL PLAN LOS PONE LA TIENDA. Acá no hay un solo número de
      plata. Cuánto salió lo cobró Apple y a nosotros no nos cambia nada;
      lo que sí importa es CUÁL de los tres productos está activo, y eso
      sale de la respuesta de RevenueCat.

   ─── QUÉ CONFIGURAR ──────────────────────────────────────────────────────
   Dos secretos nuevos en Supabase → Edge Functions → Secrets:

     REVENUECAT_CLAVE   la clave SECRETA de RevenueCat, la que empieza con
                        `sk_`. RevenueCat → Project settings → API keys →
                        "Secret API keys" (NO la `appl_`, que es la pública
                        y va adentro de la app).

     REVENUECAT_AVISO   una frase larga inventada por vos. La misma se pega
                        en RevenueCat → Integrations → Webhooks, en el campo
                        "Authorization header value". Es la que prueba que
                        el aviso lo mandó RevenueCat y no cualquiera.

   Y al desplegar, **"Verify JWT" TIENE QUE QUEDAR DESTILDADO**. Es lo único
   distinto de las otras funciones y tiene una razón: RevenueCat no tiene
   ningún token de Supabase que ofrecer, así que con la puerta de Supabase
   prendida el aviso rebota con "Missing authorization header" antes de
   llegar a una sola línea de esto, y el rebote se ve en el panel de
   RevenueCat como un 401 sin explicación.

   Destildarla NO abre nada: las dos puertas de verdad están acá abajo y son
   las de los puntos 1 y 2. Un pedido sin sesión válida y sin el secreto se
   va con un 401 sin haber tocado la base.
   ══════════════════════════════════════════════════════════════════════════ */

const RC_CLAVE = Deno.env.get("REVENUECAT_CLAVE") || "";
const RC_AVISO = Deno.env.get("REVENUECAT_AVISO") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/* Los tres productos, con el plan nuestro al que corresponde cada uno. Esta
   tabla tiene que decir lo mismo que `IOS_PLANES` en `tienda-ios.js` y que
   los ids cargados en App Store Connect. Si una letra no coincide, la
   compra se cobra igual y acá no se acredita nada: el peor de los errores
   posibles, porque la plata entró y la persona no tiene lo que pagó. Hay
   una prueba, en `probar-pagos.mjs`, que compara las dos listas. */
const PLANES: Record<string, { plan: string; meses: number }> = {
  "com.armael11.app.todas.mensual": { plan: "todas", meses: 1 },
  "com.armael11.app.tres.mensual":  { plan: "tres",  meses: 1 },
  "com.armael11.app.liga.mensual":  { plan: "liga",  meses: 1 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status,
    headers: { ...CORS, "Content-Type": "application/json" } });

/* Comparar el secreto sin apurarse. Un `===` sobre textos corta apenas
   encuentra la primera letra distinta, y ese tiempo -microsegundos, pero
   medibles desde afuera- deja adivinar el secreto letra por letra. Es
   barato hacerlo bien y no hay motivo para no hacerlo. */
export function mismoSecreto(a: string, b: string): boolean {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

/* Un uuid y nada más. El id que viene en el aviso se usa para consultar y
   para acreditar, así que antes se mira que tenga la forma que tiene que
   tener. Un id anónimo de RevenueCat -los que empiezan con `$RCAnonymous`-
   no pasa por acá, y está bien: esa compra no tiene perfil nuestro al que
   acreditarle y se resuelve a mano, que es mejor que acreditarle a
   cualquiera. */
export function esPerfil(id: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(String(id || ""));
}

/* ─── QUÉ TIENE ACTIVO, SEGÚN REVENUECAT ────────────────────────────────
   De todo lo que devuelve la consulta, lo único que se mira es
   `subscriptions`: cada producto con su fecha de vencimiento. Está activo
   el que todavía no venció.

   `expires_date` viene en UTC y con una Z al final, así que `Date` lo
   entiende sin ayuda. Se compara contra `ahora` y no contra `Date.now()`
   directamente para poder probar esta función con fechas fijas.

   Si hay más de uno activo -pasa cuando alguien mejora de plan y el mes
   viejo todavía no venció- gana EL QUE VENCE MÁS TARDE, que es el que
   acaba de comprar. Elegir el otro le daría el plan chico al que pagó el
   grande, que es la clase de error que termina en un mail enojado. */
export function activoDe(sub: any, ahora = Date.now()) {
  const subs = (sub && sub.subscriptions) || {};
  let mejor: any = null;
  for (const id of Object.keys(subs)) {
    if (!PLANES[id]) continue;
    const s = subs[id] || {};
    const vence = Date.parse(String(s.expires_date || ""));
    if (!Number.isFinite(vence) || vence <= ahora) continue;
    if (!mejor || vence > mejor.vence)
      mejor = { producto: id, vence, venceTxt: String(s.expires_date),
                tienda: String(s.store || "") };
  }
  return mejor;
}

/* ─── EL NÚMERO DE PAGO ─────────────────────────────────────────────────
   `registrar_pago` no acredita dos veces el mismo id: ese candado ya está
   adentro y es el que hace que un aviso repetido no regale un mes. Así que
   lo único que hay que hacer es elegir bien el id.

   Lleva la FECHA DE VENCIMIENTO adentro, y esa es toda la idea: cada
   renovación mensual corre el vencimiento un mes, o sea que genera un id
   nuevo y acredita un mes más; pero el mismo aviso llegando dos veces, o la
   app preguntando cinco veces mientras la persona mira la pantalla, traen
   el mismo vencimiento y por lo tanto el mismo id, y acreditan una sola
   vez. Sin nada que contar y sin ninguna tabla extra.

   El prefijo `apple:` separa este medio de `play:` y de Mercado Pago: tres
   numeraciones distintas no se pueden pisar aunque se repita un número. */
export function idDePago(activo: { producto: string; venceTxt: string }): string {
  return "apple:" + activo.producto + ":" + activo.venceTxt;
}

async function consultar(perfil: string) {
  const r = await fetch("https://api.revenuecat.com/v1/subscribers/" +
                        encodeURIComponent(perfil),
    { headers: { Authorization: "Bearer " + RC_CLAVE, Accept: "application/json" } });
  if (!r.ok)
    throw new Error("revenuecat " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json())?.subscriber || null;
}

/* Acreditar. Es una sola llamada a la base, la misma que usan Mercado Pago
   y Play, y es una sola A PROPÓSITO: dos pedidos separados -anotar y
   después acreditar- con dos avisos llegando juntos entregan dos meses por
   un mes pago. El candado vive adentro de esa función. */
async function acreditar(perfil: string, activo: any, crudo: unknown) {
  const plan = PLANES[activo.producto];
  const r = await fetch(SB_URL + "/rest/v1/rpc/registrar_pago", {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE,
               "Content-Type": "application/json" },
    body: JSON.stringify({
      p_id: idDePago(activo), p_perfil: perfil, p_meses: plan.meses,
      p_estado: "approved", p_monto: 0, p_moneda: "USD",
      p_crudo: crudo, p_plan: plan.plan,
    }),
  });
  if (!r.ok)
    throw new Error("no pude acreditar: " + r.status + " " + (await r.text()).slice(0, 300));
  return plan.plan;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método" }, 405);
  if (!RC_CLAVE) return json({ error: "falta configurar el cobro de Apple" }, 500);

  const auth = req.headers.get("Authorization") || "";
  let cuerpo: any = {};
  try { cuerpo = await req.json(); } catch (_e) { cuerpo = {}; }

  /* ─── 1. ¿QUIÉN TOCA EL TIMBRE, Y DE QUIÉN HABLA? ───────────────────────
     Dos caminos y ninguno cae en el otro. El del webhook se reconoce porque
     el cuerpo trae un `event`; el de la app, porque trae una sesión. Si no
     se puede probar ninguno de los dos, se corta acá sin tocar nada. */
  let perfil = "";
  let esAviso = false;

  if (cuerpo && cuerpo.event) {
    /* EL AVISO DE REVENUECAT. El secreto no es opcional: sin él configurado,
       esta puerta queda cerrada en vez de abierta. Un secreto vacío que
       dejara pasar todo sería exactamente el agujero que esto viene a
       tapar, y no avisaría nunca. */
    esAviso = true;
    if (!RC_AVISO || !mismoSecreto(auth, RC_AVISO))
      return json({ error: "no" }, 401);

    const e = cuerpo.event || {};
    const id = esPerfil(e.app_user_id) ? String(e.app_user_id)
             : esPerfil(e.original_app_user_id) ? String(e.original_app_user_id)
             : "";
    /* Sin perfil nuestro no hay a quién acreditarle. Se contesta 200 a
       propósito: con un 500, RevenueCat reintenta el mismo aviso durante
       días y no va a cambiar nada. Queda en el log, que es donde se mira. */
    if (!id) { console.error("aviso sin perfil: " + JSON.stringify(e).slice(0, 300)); return json({ ok: true }); }
    perfil = id;
  } else {
    /* LA APP PREGUNTANDO POR SÍ MISMA. El perfil sale del token y de ningún
       otro lado: si saliera del cuerpo, cualquiera con una sesión podría
       pedir que se le acredite a otro -o peor, pedir que se le acredite a
       él lo que compró otro-. */
    const u = await fetch(SB_URL + "/auth/v1/user",
      { headers: { Authorization: auth, apikey: SB_ANON } });
    if (!u.ok) return json({ error: "Hay que entrar antes de comprar." }, 401);
    const id = (await u.json())?.id;
    if (!id) return json({ error: "Hay que entrar antes de comprar." }, 401);
    perfil = String(id);
  }

  /* ─── 2. QUÉ DICE REVENUECAT ─────────────────────────────────────────── */
  let sub: any;
  try { sub = await consultar(perfil); }
  catch (e) {
    console.error(e);
    /* Al aviso se le contesta 500 para que reintente: si RevenueCat estaba
       caído un segundo, el reintento lo arregla solo. A la app se le
       contesta 502 y ella vuelve a preguntar sola un rato después. */
    return json({ error: "No pude hablar con la App Store." }, esAviso ? 500 : 502);
  }

  const activo = activoDe(sub || {});
  if (!activo) {
    /* No hay nada activo. Para el aviso es normal -una cancelación o un
       vencimiento también avisan- y no es un error. Para la app es la
       respuesta honesta a "restaurar" cuando no hay nada que restaurar. */
    return json(esAviso ? { ok: true }
                        : { ok: false, plan: null,
                            error: "No encontré ninguna suscripción activa en esta cuenta de Apple." },
                esAviso ? 200 : 200);
  }

  /* ─── 3. ACREDITAR ───────────────────────────────────────────────────── */
  try {
    const plan = await acreditar(perfil, activo, { activo, subscriber: sub });
    return json({ ok: true, plan, hasta: activo.venceTxt });
  } catch (e) {
    console.error(e);
    /* La plata ya entró. Con un 500 el aviso se reintenta y lo más probable
       es que la segunda vez entre; a la persona que está mirando la
       pantalla se le dice la verdad y a quién escribirle. */
    if (esAviso) return json({ error: "no pude acreditar" }, 500);
    return json({ error: "Apple cobró pero no pude activarlo. Escribinos y lo arreglamos." }, 500);
  }
});
