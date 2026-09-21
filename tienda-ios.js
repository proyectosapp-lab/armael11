/* ══════════════════════════════════════════════════════════════════════════
   TIENDA-IOS — las suscripciones adentro del iPhone, por StoreKit.

   ─── POR QUÉ ESTE ARCHIVO EXISTE APARTE ──────────────────────────────────
   En el y75 se cerró un agujero que habría volteado la app después de
   aprobada: adentro del webview de Capacitor no existe el referrer
   `android-app://`, así que `esDeLaTienda()` daba falso, la app se creía LA
   WEB, y la web ofrece Mercado Pago. La regla 3.1.1 de Apple dice que los
   bienes digitales se pagan por StoreKit y por nada más, y el castigo por
   ofrecer otra cosa no es un mail: es la baja.

   La defensa de entonces fue que el camino no existiera. Esta es la misma
   defensa, del otro lado: **este archivo viaja SOLO adentro del .ipa**, lo
   copia `empaquetar-ios.mjs` igual que `datos-ios.js`. En armael11.com no
   existe, así que `typeof iosPanelDePlanes` da "undefined" y el camino de
   siempre -Mercado Pago en la web, Play en Android- queda intacto. No hay
   ninguna condición que alguien pueda sacar sin querer: no hay código.

   Y al revés: en `tarjetasDePlan()`, si la app es nativa de iOS y esta
   función NO existe, se muestra el texto de que lo básico es gratis. Nunca
   se cae a Mercado Pago. El peor caso de este archivo es que no se pueda
   comprar, jamás que se ofrezca otra caja.

   ─── POR QUÉ REVENUECAT Y NO STOREKIT A MANO ─────────────────────────────
   Una suscripción auto-renovable no es una compra: es una compra por mes,
   para siempre, y alguien tiene que enterarse cuando el mes 4 se cobra, el
   mes 7 rebota la tarjeta y el mes 9 se cancela. Eso es un servidor
   escuchando a Apple, con certificados, JWS y reintentos. RevenueCat es ese
   servidor. Nosotros seguimos siendo dueños del derecho -quién tiene qué
   plan y hasta cuándo vive en NUESTRA base, igual que con Mercado Pago y
   con Play-: lo único que hace RevenueCat es avisarnos y responder cuándo
   le preguntamos.

   ─── LAS DOS REGLAS DE SIEMPRE ───────────────────────────────────────────
   1. AL TELÉFONO NO SE LE CREE NADA. Este archivo NO acredita el pase. La
      compra termina acá y después se le pregunta AL SERVIDOR, que le
      pregunta a RevenueCat con la clave secreta y recién ahí acredita. Si
      alguien parchea este archivo en un teléfono con jailbreak, lo único
      que consigue es mentirle a su propia pantalla por un rato.
   2. EL PRECIO LO PONE LA TIENDA. Acá no hay un solo número. Los precios
      salen de StoreKit —`priceString`, ya con el símbolo y el formato del
      país de la persona— porque Apple lo exige y porque es el único lugar
      donde el precio es cierto: un brasileño ve reales y un mexicano pesos
      mexicanos, y nosotros no tenemos esa tabla ni queremos tenerla.

   ─── SIN BUNDLER, COMO TODO ACÁ ──────────────────────────────────────────
   El sitio se publica como archivos sueltos y esa es la razón por la que se
   puede arreglar algo sin tener una máquina de desarrollo al lado. Así que
   el plugin se lee de `window.Capacitor.Plugins.Purchases` en el momento de
   usarlo, igual que hace `nativo.js` con Haptics y Share. No hay `import`,
   no hay `npm` en la página: `@revenuecat/purchases-capacitor` está en el
   package.json solo para que `npx cap sync` compile el lado nativo.

   Los nombres van todos con prefijo `ios`: estos archivos entran como
   `<script>` clásicos y comparten un único ámbito global con la app.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── LOS TRES PLANES ─────────────────────────────────────────────────────
   El id de producto es el que está dado de alta en App Store Connect y
   tiene que coincidir LETRA POR LETRA. Si una letra no coincide, StoreKit
   no devuelve el producto, el plan no aparece en la pantalla, y no hay
   ningún error en ningún lado: simplemente falta una fila. Por eso hay una
   prueba que compara esta lista contra la de la función del servidor.

   El nombre y el detalle son NUESTROS y viven acá, no vienen del servidor.
   Es a propósito: el revisor de Apple puede abrir la app con la red que se
   le ocurra, y una pantalla de compra que a veces está vacía es un rechazo
   por "contenido incompleto". Lo único que se espera de afuera es el
   precio, y sin precio el plan no se dibuja.

   El precio NO está acá. Ver arriba. */
export const IOS_PLANES = [
  { id: "todas", producto: "com.armael11.app.todas.mensual",
    nombre: "Todas las ligas", detalle: "las once ligas, sin límite" },
  { id: "tres",  producto: "com.armael11.app.tres.mensual",
    nombre: "3 ligas",         detalle: "tres ligas a elección, sin límite" },
  { id: "liga",  producto: "com.armael11.app.liga.mensual",
    nombre: "Tu liga",         detalle: "una liga, sin límite" },
];

/* El EULA estándar de Apple. Apple exige un link a los términos de uso en la
   misma pantalla donde se compra, y acepta el suyo: es el que usa la enorme
   mayoría de las apps y el que el revisor reconoce de una. Escribir uno
   propio sería inventar un documento legal para no ganar nada.

   La privacidad sí es nuestra y ya existe, con dirección propia desde el
   y40. Van las dos ABSOLUTAS: adentro del .ipa una dirección que empiece
   con barra apunta al paquete local, donde `privacidad.html` no está. */
export const IOS_TERMINOS = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const IOS_PRIVACIDAD = "https://armael11.com/privacidad.html";

/* ── EL PLUGIN, SI ESTÁ ──────────────────────────────────────────────────
   Igual que `nativo.js`: se pregunta en el momento, no se guarda. En un
   navegador no existe y todo lo de abajo se apaga solo. */
export function iosTienda(ventana) {
  try {
    const w = ventana || (typeof window !== "undefined" ? window : null);
    const P = (w && w.Capacitor && w.Capacitor.Plugins) || null;
    return (P && P.Purchases) || null;
  } catch (e) { return null; }
}

/* La clave PÚBLICA de RevenueCat, la que empieza con `appl_`. Es pública de
   verdad -viaja compilada adentro de cada copia de la app, como la `anon`
   de Supabase- y sola no autoriza nada: con ella se puede preguntar por
   productos y comprar, que es lo que hace el dueño del teléfono igual. La
   SECRETA, la que empieza con `sk_`, vive en Supabase y solo la usa el
   servidor para verificar. */
export function iosClave(ventana) {
  try {
    const w = ventana || (typeof window !== "undefined" ? window : null);
    return String((((w || {}).SITIO || {}).apple || {}).revenuecat || "");
  } catch (e) { return ""; }
}

/* ── FUNCIONES PURAS: LO QUE SE PUEDE PROBAR SIN UN IPHONE ───────────────
   Todo lo que sigue no toca el plugin. Son las que deciden, y las que se
   rompen en silencio si alguien las cambia, así que son las que tienen
   prueba. Lo que habla con StoreKit es abajo y es casi todo pasamanos. */

/* De qué plan nuestro es este producto de Apple. Devuelve null si no es
   ninguno: un producto que no conocemos no acredita nada. */
export function iosPlanDeProducto(idProducto) {
  const p = IOS_PLANES.find(x => x.producto === String(idProducto || ""));
  return p ? p.id : null;
}

/* Junta lo nuestro -nombre, detalle, orden- con lo de la tienda -precio-.
   Un plan sin precio NO SE DIBUJA: un botón de comprar sin número al lado
   es lo que Apple llama contenido incompleto, y además es una trampa para
   el que lo aprieta. Prefiero mostrar dos planes que tres mal. */
export function iosArmarPlanes(productos) {
  const porId = new Map();
  for (const p of productos || []) {
    const id = String((p && (p.identifier || p.productIdentifier)) || "");
    if (id) porId.set(id, p);
  }
  const salida = [];
  for (const plan of IOS_PLANES) {
    const p = porId.get(plan.producto);
    const precio = String((p && p.priceString) || "").trim();
    if (!precio) continue;
    salida.push({ id: plan.id, producto: plan.producto, nombre: plan.nombre,
                  detalle: plan.detalle, precio, crudo: p });
  }
  return salida;
}

/* ── CANCELAR NO ES FALLAR ───────────────────────────────────────────────
   El que abre la hoja de compra y la baja con el dedo no cometió ningún
   error, y mostrarle "No pude completar la compra" en rojo es maltratarlo
   por haber cambiado de idea. Apple además lo mide: una app que trata el
   cancelar como error se nota en la revisión.

   Tres señales porque el plugin cambió cuál manda entre versiones, y una
   sola que se caiga dejaría el cartel rojo prendido sin que nadie se
   entere. El código "1" es PURCHASE_CANCELLED_ERROR. */
export function iosCancelada(error) {
  if (!error) return false;
  if (error.userCancelled === true || error.userCancelled === "true") return true;
  if (String(error.code) === "1") return true;
  return /cancel/i.test(String(error.message || ""));
}

/* El error, dicho en cristiano. Nunca se muestra el texto crudo del plugin:
   está en inglés y habla de SKPaymentQueue. */
export function iosTextoDeError(error) {
  const m = String((error && error.message) || "");
  if (/network|conexión|connection|internet/i.test(m))
    return "No pude hablar con la App Store. Fijate la conexión y probá de nuevo.";
  if (/not allowed|restricted|permission/i.test(m))
    return "Este iPhone tiene las compras restringidas en Ajustes → Tiempo de uso.";
  if (/already|pending/i.test(m))
    return "Esa compra ya está en curso. Esperá unos segundos y probá otra vez.";
  return "No pude completar la compra. Si te llegó el cobro, tocá Restaurar compras.";
}

/* ── EL TEXTO QUE APPLE EXIGE, Y POR QUÉ ES ESTE ─────────────────────────
   En la pantalla donde se compra una suscripción auto-renovable tienen que
   estar, sin que haya que tocar nada: el nombre, cuánto dura, cuánto sale
   por ese período, que se renueva sola, cómo se cancela, y los links a los
   términos y a la privacidad. Falta uno y es rechazo por 3.1.2, que es el
   rechazo más común de todos y el más fácil de evitar.

   Está escrito como se lo diría a un hincha, no como una cláusula: "hasta
   que lo canceles desde Ajustes" es a la vez el requisito legal y la
   información que la persona de verdad quiere. */
export const IOS_LETRA_CHICA =
  "Se renueva sola todos los meses y se cobra a tu Apple ID hasta que la " +
  "canceles. Se cancela desde Ajustes → tu nombre → Suscripciones, cuando " +
  "quieras, y seguís teniendo el plan hasta que termine el mes pagado.";

const escIos = s => String(s == null ? "" : s)
  .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ── EL PANEL, EN HTML ───────────────────────────────────────────────────
   Se le pasa todo: es pura, así que la prueba puede leer el HTML que sale y
   verificar que estén las seis cosas que Apple pide. Esa prueba es la que
   evita el rechazo por 3.1.2, y es una que sí se puede correr sin una Mac.

   Usa las mismas clases que la pantalla de la web -`plan`, `plan-txt`,
   `plan-btn`, `acc`-: el CSS ya está y la compra tiene que verse igual que
   el resto de la app, no como un formulario pegado.

   `data-plan` es el mismo enganche que ya existe en `engancharPremium()`.
   Lo que cambia es adónde va ese click, no cómo se ve el botón. */
export function iosPanelHTML({ planes, estado = "listo", comprando = false } = {}) {
  const linea = p => `<div class="plan">
      <div class="plan-txt">
        <b>${escIos(p.nombre)}</b>
        <span><b class="plan-precio">${escIos(p.precio)}</b> por mes · ${escIos(p.detalle)}</span>
      </div>
      <button class="acc plan-btn" data-plan="${escIos(p.id)}"${comprando ? " disabled" : ""}
        >Suscribirme</button>
    </div>`;

  /* Los dos casos en que no hay nada que comprar. Ninguno ofrece otra caja
     ni dice "próximamente": se dice lo que hay, que es que lo básico es
     gratis y funciona. */
  if (estado === "pidiendo")
    return `<p class="aviso" style="margin-top:8px">Buscando los planes en la App Store…</p>`;
  if (!planes || !planes.length)
    return `<p class="aviso" style="margin-top:8px"><b>Lo básico es gratis.</b>
      Simulás en una liga y el cupo se renueva solo todos los meses.</p>
      ${botonesDeAbajo(comprando)}`;

  return `<div class="planes">${planes.map(linea).join("")}</div>
    <p class="aviso" style="margin-top:8px">${escIos(IOS_LETRA_CHICA)}</p>
    ${botonesDeAbajo(comprando)}`;
}

/* Restaurar tiene que ser un BOTÓN y tiene que estar a la vista. Apple lo
   revisa a mano: el revisor instala, compra, borra la app, la vuelve a
   instalar y busca cómo recuperar lo que pagó. Si no lo encuentra en la
   pantalla de compra, rechaza. Y afuera de la revisión sirve igual: el que
   cambia de iPhone lo necesita. */
function botonesDeAbajo(comprando) {
  return `<p class="aviso" style="margin-top:10px">
      <button class="boton flaco" data-ios-restaurar${comprando ? " disabled" : ""}
        >Restaurar compras</button></p>
    <p class="aviso" style="margin-top:6px">
      <a href="#" data-ios-link="terminos">Términos de uso</a> ·
      <a href="#" data-ios-link="privacidad">Privacidad</a></p>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   DE ACÁ PARA ABAJO SE HABLA CON STOREKIT. Todo devuelve algo razonable
   cuando el plugin no está, que es lo que pasa en el navegador y lo que
   pasaría en un iPhone si `cap sync` no hubiera compilado el plugin.
   ══════════════════════════════════════════════════════════════════════════ */

/* null = todavía no se preguntó · [] = se preguntó y no hay · [...] = hay */
export let IOS_LISTA = null;
export let IOS_ESTADO = "nuevo";     /* nuevo · pidiendo · listo · sin-tienda */

/* ── LA CARRERA QUE ESTE PEDAZO EVITA ────────────────────────────────────
   `configure` tarda. Y la portada, mientras tanto, dibuja el panel de
   planes, que pide los precios. Si el pedido de precios sale ANTES de que
   `configure` haya terminado, RevenueCat contesta "SDK not configured", la
   lista queda vacía, y la pantalla dice que lo básico es gratis.

   Y el síntoma es de los peores que hay: depende de qué tan rápido estuvo
   la red ese día. En un iPhone nuevo con buena señal anda; en el iPhone del
   revisor de Apple, un martes, no. No hay forma de reproducirlo a pedido y
   no deja ningún error a la vista.

   Así que el arranque se guarda COMO PROMESA, una sola para toda la vida de
   la app, y todo lo que habla con la tienda la espera antes de hablar. No
   importa quién llegue primero: el segundo espera al primero.            */
let arranque = null;
let iosConfigurada = false;

/* Se llama una vez al arrancar, desde la app. Devuelve la promesa, así que
   llamarla diez veces no configura diez veces. */
export function iosArrancarTienda(perfil) {
  if (!arranque) arranque = configurarUnaVez(perfil);
  return arranque;
}

async function configurarUnaVez(perfil) {
  const T = iosTienda();
  const clave = iosClave();
  if (!T || !clave) { IOS_ESTADO = "sin-tienda"; return false; }
  try {
    await T.configure(perfil ? { apiKey: clave, appUserID: String(perfil) }
                             : { apiKey: clave });
    iosConfigurada = true;
    return true;
  } catch (e) { IOS_ESTADO = "sin-tienda"; return false; }
}

/* La puerta por la que pasa todo lo que habla con StoreKit. Devuelve el
   plugin listo para usar, o null. Si nadie arrancó la tienda todavía -no
   debería pasar, pero es gratis contemplarlo-, la arranca. */
async function tiendaLista() {
  const T = iosTienda();
  if (!T) return null;
  if (!arranque) iosArrancarTienda(null);
  try { await arranque; } catch (e) {}
  return iosConfigurada ? T : null;
}

/* ── QUIÉN ES EL QUE COMPRA ──────────────────────────────────────────────
   Esto es la pieza que une las dos mitades y la más fácil de olvidar. El
   `appUserID` que se le pasa a RevenueCat es EL UUID DE NUESTRO PERFIL, y
   es el mismo que después llega en el webhook como `app_user_id`. Si acá
   fuera cualquier otra cosa -el mail, un id anónimo de RevenueCat-, la
   compra se cobraría perfecto, el webhook llegaría perfecto, y el servidor
   no tendría a quién acreditarle: quedaría un pago anotado sin dueño.

   Se llama al entrar y al salir, desde `pintarCuenta`. */
export async function iosQuienCompra(perfil) {
  const T = await tiendaLista();
  if (!T) return false;
  try {
    if (perfil) await T.logIn({ appUserID: String(perfil) });
    else await T.logOut();
    return true;
  } catch (e) { return false; }
}

/* Los productos, con su precio. Se piden por id y no por "offering" a
   propósito: una offering es una tabla más que hay que mantener en el panel
   de RevenueCat, y el día que alguien la renombre la pantalla queda vacía
   sin un solo error. Los tres ids ya los sabemos y no cambian nunca: están
   atados a App Store Connect, donde un id de producto no se puede editar. */
export async function iosTraerPlanes() {
  IOS_ESTADO = "pidiendo";
  const T = await tiendaLista();
  if (!T) { IOS_ESTADO = "sin-tienda"; IOS_LISTA = []; return []; }
  try {
    const r = await T.getProducts({
      productIdentifiers: IOS_PLANES.map(p => p.producto), type: "subs" });
    IOS_LISTA = iosArmarPlanes((r && r.products) || []);
  } catch (e) { IOS_LISTA = []; }
  IOS_ESTADO = "listo";
  IOS_CUANDO = Date.now();
  return IOS_LISTA;
}

/* Cuándo fue la última vez que se preguntó. Sirve para volver a preguntar
   si la primera vez no había red: sin esto, el que abre la app en el subte
   y después sale, se queda con la pantalla vacía hasta que cierre la app
   del todo. */
export let IOS_CUANDO = 0;

/* La compra. Devuelve el producto comprado; el que llamó tiene que ir a
   confirmarlo CONTRA EL SERVIDOR antes de darle nada a nadie. Acá no se
   acredita. */
export async function iosComprar(idPlan) {
  const T = await tiendaLista();
  if (!T) throw new Error("La compra no está disponible en este iPhone.");
  const fila = (IOS_LISTA || []).find(p => p.id === idPlan);
  if (!fila || !fila.crudo)
    throw new Error("Ese plan todavía no está disponible en la App Store.");
  const r = await T.purchaseStoreProduct({ product: fila.crudo });
  return (r && r.productIdentifier) || fila.producto;
}

/* Restaurar. Le dice a Apple que vuelva a mandar lo que esta cuenta ya
   compró. No acredita nada por su cuenta: como en la compra, lo que
   acredita es el servidor cuando se le pregunta después. */
export async function iosRestaurar() {
  const T = await tiendaLista();
  if (!T) throw new Error("La restauración no está disponible en este iPhone.");
  await T.restorePurchases();
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   EL PEGAMENTO CON LA PANTALLA

   `tarjetasDePlan()`, en app.tpl.html, llama a `iosPanelDePlanes()` y no
   sabe nada más. Si este archivo no viajó -o sea, en la web-, esa función
   no existe, el `typeof` da "undefined" y la app muestra el texto de que lo
   básico es gratis. Nunca cae a Mercado Pago.
   ══════════════════════════════════════════════════════════════════════════ */

/* La primera vez que la pantalla pide el panel, todavía no se le preguntó
   nada a StoreKit. En vez de dejar el hueco vacío, se muestra "buscando", se
   pide, y cuando vuelve se redibuja. Es el mismo baile que hace `mirarPlay`
   y por la misma razón: preguntar tarda y la portada no puede esperar. */
/* ── ¿HAY QUE IR A PREGUNTAR LOS PRECIOS? ────────────────────────────────
   Pura, para poder probarla. Tres respuestas y cada una tiene su motivo:

     · Nunca se preguntó (`lista` en null) → sí, obvio.
     · Ya se preguntó y vinieron los tres → no, no se pregunta de nuevo en
       cada dibujo de pantalla: serían diez pedidos por minuto.
     · Ya se preguntó y vino VACÍO → sí, pero cada medio minuto. Ese caso es
       casi siempre "no había red en ese momento", y el que abre la app en
       el subte y después sale no tiene por qué quedarse con la pantalla
       vacía hasta que cierre la app del todo.

   Y nunca mientras hay una consulta en curso. */
export function iosHayQuePreguntar(lista, estado, cuando, ahora = Date.now()) {
  if (estado === "pidiendo") return false;
  if (lista === null) return true;
  return lista.length === 0 && (ahora - (cuando || 0)) > 30000;
}

export function iosPanelDePlanes(comprando) {
  if (iosHayQuePreguntar(IOS_LISTA, IOS_ESTADO, IOS_CUANDO)) {
    const primeraVez = IOS_LISTA === null;
    iosTraerPlanes().then(() => {
      try { if (typeof pintarCuenta === "function") pintarCuenta(); } catch (e) {}
      try { if (typeof pintar === "function") pintar(); } catch (e) {}
    });
    /* Si es la primera vez no hay nada que mostrar todavía y se dice que se
       está buscando. Si ya hubo una respuesta —vacía—, se deja la pantalla
       como está mientras se reintenta por atrás: parpadear entre "buscando"
       y "lo básico es gratis" cada medio minuto sería peor que no
       reintentar. */
    if (primeraVez) return iosPanelHTML({ planes: null, estado: "pidiendo" });
  }
  if (IOS_LISTA === null) return iosPanelHTML({ planes: null, estado: "pidiendo" });
  return iosPanelHTML({ planes: IOS_LISTA, estado: "listo",
                        comprando: !!comprando });
}

/* Restaurar y los dos links. Los botones de plan los engancha
   `engancharPremium()`, que es el que sabe si hay cuenta y el que después
   va a confirmar contra el servidor; acá solo va lo que es de esta pantalla
   y de nadie más.

   Los links NO navegan: adentro de una app, un webview que se va a otro
   sitio y se queda ahí es la definición del rechazo por 4.2. Se abren con
   la hoja del sistema, igual que los del feed desde el y54. */
export function iosEngancharExtras(alRestaurar) {
  if (typeof document === "undefined") return 0;
  let n = 0;
  document.querySelectorAll("[data-ios-restaurar]").forEach(b => {
    b.onclick = () => { if (typeof alRestaurar === "function") alRestaurar(); };
    n++;
  });
  document.querySelectorAll("[data-ios-link]").forEach(a => {
    a.onclick = ev => {
      ev.preventDefault();
      const url = a.dataset.iosLink === "terminos" ? IOS_TERMINOS : IOS_PRIVACIDAD;
      try {
        if (typeof abrirAfuera === "function") abrirAfuera(url);
        else window.open(url, "_blank");
      } catch (e) {}
    };
    n++;
  });
  return n;
}
