/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL COBRO
     node probar-pagos.mjs

   Las dos funciones que cobran no corren en GitHub: corren en Supabase, en
   Deno, y desde acá no se las puede ejecutar. Esto prueba otra cosa —la
   misma que prueba `probar-backend.mjs` sobre el SQL— y por la misma razón:
   las reglas que protegen la plata no fallan cuando se rompen, DEJAN PASAR.
   Nadie se entera de que el precio empezó a salir del navegador hasta que
   alguien paga un peso.

   Así que esto lee los dos archivos y verifica que las decisiones sigan
   escritas ahí. Si mañana alguien simplifica una de las dos funciones y se
   lleva puesta una, esto corta la publicación.

   Y hay un caso más, que no es de seguridad y también deja pasar: las dos
   funciones tienen que estar de acuerdo en CÓMO se escribe la referencia
   que las une. Una escribe "uuid:meses" y la otra la parte por los dos
   puntos. Si una cambia sola, nadie cobra nada y el log no dice nada raro.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

const leer = f => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const CREAR = leer("funcion-crear-pago.ts");
const AVISO = leer("funcion-pago-avisado.ts");
const CUENTAS = leer("cuentas.js");

const casos = [];
const caso = (nom, ok, det = "") => casos.push([nom, ok, det]);

/* ── EL AVISO NO SE CREE NADA ────────────────────────────────────────────
   La dirección del webhook es pública y no puede pedir contraseña: Mercado
   Pago no tiene ninguna que darle. Toda la defensa está en no creerle al
   cuerpo del mensaje y ir a buscar el pago a la API. Sin eso, cualquiera
   que descubra la dirección se hace premium mandando un JSON. */
caso("el webhook va a buscar el pago a la API de Mercado Pago",
     /fetch\("https:\/\/api\.mercadopago\.com\/v1\/payments\/"/.test(AVISO));
caso("y el estado que mira es el que devolvió esa consulta, no el del aviso",
     /p_estado: String\(pago\.status/.test(AVISO) &&
     !/cuerpo\.(status|data\.status|external_reference)/.test(AVISO));
caso("a quién acreditar también sale de ahí",
     /leerReferencia\(pago\.external_reference\)/.test(AVISO));
caso("un pago que no existe se contesta 200 y no se reintenta",
     /status === 404\) return ok/.test(AVISO));
caso("pero si falla NUESTRA base, se contesta 500 para que reintente",
     /no pude registrar[\s\S]{0,40}reintenta|reintenta\("no pude registrar"\)/.test(AVISO));

/* Acreditar es una sola operación en la base, no dos pedidos desde acá.
   Dos pedidos separados, con dos avisos llegando juntos, entregan dos meses
   por un mes pago. */
caso("anota y acredita llamando a una sola función de la base",
     /rpc\/registrar_pago/.test(AVISO) &&
     !/rpc\/acreditar_premium/.test(AVISO));

/* ── EL PRECIO LO PONE EL SERVIDOR ───────────────────────────────────────
   Es la regla que no se puede arreglar después: si el navegador manda el
   precio, alguien cambia 2500 por 1 en la consola, Mercado Pago confirma un
   pago legítimo de un peso y el webhook hace todo bien y acredita. */
caso("el precio que se le cobra sale de la tabla del servidor",
     /unit_price: plan\.precio/.test(CREAR));
caso("y del pedido solo se lee el NOMBRE del plan",
     /pedido\?\.plan/.test(CREAR) &&
     !/pedido\.(precio|monto|meses|amount)/.test(CREAR));
caso("quién compra lo dice el token, no el cuerpo del pedido",
     /auth\/v1\/user/.test(CREAR) && !/pedido\.(perfil|uid|usuario|id)\b/.test(CREAR));
caso("sin sesión válida no se arma ninguna preferencia",
     /if \(!u\.ok\) return json\([^)]*401\)/.test(CREAR));

/* Un solo precio en todo el proyecto. Si la app tuviera los suyos escritos,
   el día que cambie uno la pantalla va a mostrar un número y el checkout
   otro, y esa persona no vuelve a intentar. */
caso("la app pide los precios, no los tiene escritos",
     /functions\/v1\/crear-pago/.test(CUENTAS) &&
     !/precio\s*[:=]\s*\d{3,}/.test(CUENTAS));

/* Las funciones tienen una puerta ANTES del código: Supabase revisa el
   token y contesta "Missing authorization header" sin ejecutar nada. Con la
   clave pública puesta solo en `apikey`, esa puerta no se abre.

   Y el efecto habría sido invisible: `planesPremium` devuelve lista vacía
   cuando falla, y el panel sin planes no dibuja ningún botón. Un botón que
   no aparece no se parece a un error — nadie lo habría encontrado hasta
   preguntarse por qué no vendemos nada. */
{
  const pide = CUENTAS.match(/planesPremium[\s\S]*?\n}/);
  caso("y los pide con Authorization, que es lo que mira la puerta de la función",
       !!pide && /Authorization: "Bearer " \+ anon/.test(pide[0]),
       (pide?.[0].match(/headers:.*/) || ["no encontré el pedido"])[0]);
}

/* ── LAS DOS TIENEN QUE HABLAR EL MISMO IDIOMA ───────────────────────── */
caso("una escribe la referencia como uuid:meses:plan",
     /external_reference: perfil \+ ":" \+ plan\.meses \+ ":" \+ idPlan/.test(CREAR));
caso("y la otra la parte por los dos puntos",
     /String\(ref \|\| ""\)\.split\(":"\)/.test(AVISO));

/* ── LA REFERENCIA, CON CASOS DE VERDAD ──────────────────────────────────
   `leerReferencia` se exporta justo para poder correrla acá. El tercer campo
   es nuevo, y lo que hay que probar no es que funcione con datos lindos: es
   que aguante los pagos que ya están en vuelo, hechos cuando la referencia
   tenía dos campos. Un pago viejo que rompa el webhook deja a Mercado Pago
   reintentando para siempre algo que ya cobró. */
{
  /* Se corre LA FUNCIÓN DE VERDAD, la que está en el archivo que se pega en
     Supabase, no una copia. Como ese archivo es TypeScript y no se puede
     importar desde Node, se recorta el pedazo que importa y se le sacan las
     anotaciones de tipo. Copiarla acá sería más cómodo y probaría la copia. */
  const trozo = AVISO.slice(AVISO.indexOf("const UUID"),
                            AVISO.indexOf("Deno.serve"));
  const enJs = trozo
    .replace(/export function/g, "function")
    .replace(/\(ref: string \| null\):[\s\S]*?\{\s*\n/, "(ref) {\n");
  const leerReferencia = new Function(enJs + "\nreturn leerReferencia;")();
  const U = "a1b2c3d4-1111-2222-3333-444455556666";

  const nuevo = leerReferencia(U + ":1:libre");
  caso("lee el perfil, los meses y el plan",
       nuevo.perfil === U && nuevo.meses === 1 && nuevo.plan === "libre",
       JSON.stringify(nuevo));

  const viejo = leerReferencia(U + ":3");
  caso("un pago viejo, sin plan, se sigue acreditando",
       viejo.perfil === U && viejo.meses === 3 && viejo.plan === null,
       JSON.stringify(viejo));

  /* Un plan inventado no puede viajar a la base: la función de allá lo
     rechaza con una excepción, el webhook contesta 500 y Mercado Pago
     reintenta el mismo pago para siempre. Se descarta acá. */
  const raro = leerReferencia(U + ":1:platino");
  caso("un plan que no existe se descarta en vez de viajar a la base",
       raro.plan === null && raro.perfil === U, JSON.stringify(raro));

  const roto = leerReferencia("cualquier cosa");
  caso("una referencia rota no inventa un perfil",
       roto.perfil === null && roto.meses === 1, JSON.stringify(roto));
}

/* Los meses se recortan de los dos lados. El de arriba es por si algún día
   alguien arma una referencia a mano; el de abajo, porque `greatest(p_meses,
   1)` en la base es el último freno y conviene que no sea el único. */
caso("los meses se recortan a un rango razonable antes de acreditar",
     /Math\.min\(24, Math\.max\(1, parseInt/.test(AVISO));

/* ── NINGUNA CLAVE ADENTRO DE NINGÚN ARCHIVO ─────────────────────────────
   Los tokens viven en los secretos de Supabase. Estos archivos se leen
   enteros en GitHub, que es público. */
for (const [nom, txt] of [["crear-pago", CREAR], ["pago-avisado", AVISO]]) {
  caso("la función " + nom + " saca sus claves del entorno",
       /Deno\.env\.get\("MP_ACCESS_TOKEN"\)/.test(txt));
  /* Un Access Token de Mercado Pago arranca con APP_USR- o TEST-; una clave
     de servicio de Supabase es un JWT larguísimo. Ninguna de las dos formas
     puede aparecer escrita. */
  caso("y no tiene ninguna clave pegada adentro",
       !/APP_USR-|TEST-[0-9a-f]{8}|service_role/.test(txt),
       (txt.match(/APP_USR-\S{0,10}|service_role/) || [""])[0]);
}
caso("la clave de servicio de Supabase la pone Supabase sola",
     /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(AVISO) &&
     !/SUPABASE_SERVICE_ROLE_KEY\s*=\s*"/.test(AVISO));

/* La app NUNCA escribe la fecha del premium. La base ya lo impide con el
   permiso por columna; esto evita que alguien pierda una tarde escribiendo
   un update que Postgres va a rechazar. */
caso("la app lee el premium y no intenta escribirlo",
     /select=premium_hasta/.test(CUENTAS) &&
     !/premium_hasta\s*:/.test(CUENTAS));

/* ── EL CUPO NO SE PUEDE FALSEAR DESDE EL NAVEGADOR ──────────────────────
   Las dos columnas que deciden cuánto entra —`premium_hasta` y `plan`— viven
   en `perfil`, y la política de RLS de esa tabla deja que cada uno edite su
   propia fila: la necesita para elegir el nombre de usuario. Las políticas
   son por FILA, no por columna, así que sin un revoke por columna cualquiera
   se pone plan 'libre' desde la consola. Es la misma lección que costó
   descubrir con el premium; acá queda clavada para las dos. */
{
  const ESQUEMA = leer("esquema.sql");
  for (const col of ["premium_hasta", "plan"])
    caso("la columna " + col + " tiene el update revocado",
         new RegExp("revoke update \\(" + col + "\\) on perfil").test(ESQUEMA));

  /* El contador vive en su propia tabla, y esa tabla no tiene política de
     escritura: la única forma de moverlo es la función. Si hubiera una
     política de insert o de update, el tope sería una sugerencia. */
  caso("uso_ciclo tiene RLS encendido",
       /alter table uso_ciclo enable row level security/.test(ESQUEMA));
  caso("y ninguna política de escritura: el contador solo lo mueve la función",
       !/create policy[^;]*on uso_ciclo for (insert|update|delete)/i.test(ESQUEMA));
  caso("y cada uno ve solo el suyo",
       /create policy[\s\S]{0,80}on uso_ciclo for select using \(auth\.uid\(\) = perfil\)/.test(ESQUEMA));

  /* ── EL CICLO ARRANCA EL DÍA QUE SE PAGA ──────────────────────────────
     Se contaba por mes calendario, y el que compraba el 30 se llevaba
     cuarenta simulaciones por un día. El ancla es el día del pago, y el
     ciclo se calcula SIEMPRE desde el ancla sumando meses enteros: sumarle
     un mes al ciclo anterior deja clavado el 28 de febrero para siempre. */
  caso("pagar mueve el ancla del ciclo al día del pago",
       /update perfil set plan = nuevo, plan_desde = now\(\)/.test(ESQUEMA));
  caso("y el ciclo se cuenta desde el ancla, no desde el ciclo anterior",
       /ancla \+ \(\s*\n?\s*\(extract\(year\s+from age\(now\(\), ancla\)\)/.test(ESQUEMA));
  caso("el que nunca pagó ancla en el día que se hizo la cuenta",
       /coalesce\(p?\.?plan_desde, p?\.?creado\)/.test(ESQUEMA));

  /* El plan que llega desde el pago se valida en la base, no solo en el
     webhook: la validación del webhook es una comodidad, esta es la que
     queda si alguien llama a la función desde otro lado. */
  caso("la base rechaza un plan que no existe",
       /check \(plan in \('gratis','chico','medio','libre'\)\)/.test(ESQUEMA) &&
       /raise exception 'plan desconocido/.test(ESQUEMA));
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n +
  (ok || !d ? "" : "   → " + d)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
