/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LAS CUENTAS
     node probar-cuentas.mjs
   No toca la red: se reemplaza `fetch` por uno de mentira que anota lo que
   se le pidió y devuelve lo que le digamos. Lo que se verifica no es que
   Supabase conteste —eso no depende de nosotros— sino que le pidamos lo
   correcto: la ruta, el método, las cabeceras y, sobre todo, que nunca se
   mande algo que no corresponda.
   ══════════════════════════════════════════════════════════════════════════ */

/* El módulo mira `window`, así que hay que haberlo armado ANTES de
   importarlo: la configuración se lee al llamar, pero `localStorage` no. */
const almacen = new Map();
globalThis.window = {
  SITIO: { supabase: { url: "https://base.supabase.co", anon: "eyJ-anon" } },
  location: { hash: "", pathname: "/talleres-cba.html", search: "" },
  history: { replaceState() {} },
};
globalThis.localStorage = {
  getItem: k => almacen.get(k) ?? null,
  setItem: (k, v) => almacen.set(k, v),
  removeItem: k => almacen.delete(k),
};
globalThis.atob = s => Buffer.from(s, "base64").toString("binary");

const C = await import("./cuentas.js");

const casos = [];
const caso = (nom, ok, det = "") => casos.push([nom, ok, det]);

/* ─── un fetch de mentira ────────────────────────────────────────────────── */
let pedidos = [];
let respuestas = [];
const responder = (cuerpo, ok = true, status = 200) => respuestas.push({ cuerpo, ok, status });
globalThis.fetch = async (url, o = {}) => {
  pedidos.push({ url, metodo: o.method || "GET", cabeceras: o.headers || {},
                 cuerpo: o.body ? JSON.parse(o.body) : null });
  const r = respuestas.shift() || { cuerpo: [], ok: true, status: 200 };
  return { ok: r.ok, status: r.status,
           text: async () => r.cuerpo === null ? "" : JSON.stringify(r.cuerpo) };
};
const limpiar = () => { pedidos = []; respuestas = []; };

/* Un token igual a los de verdad: tres partes, y el uid en el medio. */
const tokenCon = uid => "x." +
  Buffer.from(JSON.stringify({ sub: uid })).toString("base64").replace(/=+$/, "") + ".y";

/* ─── 1. SIN CONFIGURAR, LA APP SIGUE ANDANDO ────────────────────────────── */
{
  const antes = window.SITIO.supabase;
  window.SITIO.supabase = {};
  caso("sin backend configurado, hayBackend() dice que no", C.hayBackend() === false);
  let tiro = false;
  try { await C.miUsuario(); } catch (e) { tiro = true; }
  caso("y nada explota por preguntar", tiro === false);
  window.SITIO.supabase = antes;
  caso("con las claves puestas, hayBackend() dice que sí", C.hayBackend() === true);
}

/* ─── 2. ENTRAR ──────────────────────────────────────────────────────────── */
{
  limpiar(); responder({});
  await C.pedirLink("  Fausto@Ejemplo.COM ", "https://tste/talleres-cba.html");
  const p = pedidos[0];
  caso("pide el link al endpoint de OTP", /\/auth\/v1\/otp$/.test(p.url) && p.metodo === "POST");
  caso("el mail va limpio y en minúscula", p.cuerpo.email === "fausto@ejemplo.com", p.cuerpo.email);
  caso("y dice a dónde volver",
       p.cuerpo.options.email_redirect_to === "https://tste/talleres-cba.html");
  caso("nunca manda una contraseña", !JSON.stringify(p.cuerpo).toLowerCase().includes("password"));

  limpiar();
  let err = "";
  try { await C.pedirLink("no-es-un-mail"); } catch (e) { err = e.message; }
  caso("un mail mal escrito ni sale a la red", pedidos.length === 0 && /mail/i.test(err), err);
}

/* ─── 3. LA VUELTA DEL MAIL ──────────────────────────────────────────────── */
{
  const uid = "11111111-2222-3333-4444-555555555555";
  let limpio = null;
  const loc = { hash: "#access_token=" + tokenCon(uid) + "&refresh_token=RRR&type=magiclink",
                pathname: "/talleres-cba.html", search: "" };
  const s = C.capturarVuelta(loc, { replaceState: (a, b, u) => { limpio = u; } });
  caso("saca la sesión del hash", s && s.token && s.refresh === "RRR");
  caso("y le encuentra el uid adentro del token", s.uid === uid, s && s.uid);
  caso("BORRA el hash de la dirección (si no, viaja en el próximo reenvío)",
       limpio === "/talleres-cba.html", limpio);
  caso("la sesión queda guardada para la próxima visita",
       JSON.parse(almacen.get("tste.sesion")).uid === uid);

  /* Y el hash del pronóstico, que vive en el mismo lugar, no se toca. */
  let tocado = false;
  const otro = { hash: "#p=eyJhIjoxfQ", pathname: "/x.html", search: "" };
  const r = C.capturarVuelta(otro, { replaceState: () => { tocado = true; } });
  caso("un hash que no es de sesión queda intacto", r === null && tocado === false);
}

/* ─── 4. EL PERFIL ───────────────────────────────────────────────────────── */
{
  limpiar(); responder([{ usuario: "fausto" }]);
  const u = await C.miUsuario();
  caso("lee el usuario propio", u === "fausto");
  caso("y lo pide con el token puesto",
       /Bearer /.test(pedidos[0].cabeceras.Authorization || ""));
  caso("con la clave pública en la cabecera", pedidos[0].cabeceras.apikey === "eyJ-anon");

  caso("un usuario con acentos o espacios no vale",
       !C.usuarioValido("Fáusto") && !C.usuarioValido("fa usto") && !C.usuarioValido("ab"));
  caso("uno normal sí", C.usuarioValido("fausto_10"));

  limpiar(); responder(null, false, 409);
  respuestas[0].cuerpo = { message: 'duplicate key value violates unique constraint "perfil_usuario_key"' };
  let err = "";
  try { await C.elegirUsuario("tomado"); } catch (e) { err = e.message; }
  caso("si el usuario está tomado, lo dice en castellano",
       /ya está tomado/i.test(err), err);

  /* Los dos frenos del mail dicen cosas distintas. Cuando decían lo mismo,
     Fausto estuvo probando contra un tope de una hora creyendo que era de
     un minuto.                                                          */
  limpiar();
  respuestas.push({ cuerpo: { message: "For security purposes, you can only request this after 47 seconds." },
                    ok: false, status: 429 });
  err = "";
  try { await C.pedirLink("f@ejemplo.com"); } catch (e) { err = e.message; }
  caso("la espera corta dice cuántos segundos", /47 segundos/.test(err), err);

  limpiar();
  respuestas.push({ cuerpo: { message: "email rate limit exceeded" }, ok: false, status: 429 });
  err = "";
  try { await C.pedirLink("f@ejemplo.com"); } catch (e) { err = e.message; }
  caso("y el tope por hora avisa que insistir no sirve",
       /por hora/.test(err) && !/segundos/.test(err), err);
}

/* ─── 5. EL EQUIPO ───────────────────────────────────────────────────────── */
{
  limpiar(); responder(null);
  await C.guardarEquipo(8, { titulares: Array.from({ length: 11 }, (_, i) => i + 1),
                             suplentes: [90, 91, 92, 93], capitan: 3, vice: 5, gasto: 74.5 });
  const p = pedidos[0];
  caso("guarda el equipo en su tabla", /\/rest\/v1\/equipo$/.test(p.url) && p.metodo === "POST");
  caso("pisando el anterior de esa fecha, no agregando otro",
       /merge-duplicates/.test(p.cabeceras.Prefer || ""));
  caso("van once titulares y cuatro suplentes",
       p.cuerpo.titulares.length === 11 && p.cuerpo.suplentes.length === 4);
  caso("NUNCA manda puntos: los escribe el servidor",
       !("puntos" in p.cuerpo) && !/puntaje/i.test(p.url));

  /* Después del cierre la base rechaza por política. El mensaje crudo habla
     de "row-level security" y no le dice nada a nadie. Se usa el texto
     COMPLETO que manda Postgres, con el nombre de la tabla incluido: la
     traducción se decide justamente por ahí. */
  limpiar();
  responder({ message: 'new row violates row-level security policy for table "equipo"' },
            false, 403);
  let err = "";
  try { await C.guardarEquipo(8, { titulares: [], suplentes: [], capitan: 1, vice: 2, gasto: 0 }); }
  catch (e) { err = e.message; }
  caso("después del cierre avisa que la fecha cerró", /cerr/i.test(err), err);

  /* Y EL MISMO ERROR EN OTRA TABLA NO PUEDE DECIR LO MISMO. Esta línea
     agarraba cualquier violación de política y contestaba "la fecha ya
     cerró": un error al crear un torneo mandaba a mirar el fantasy, que no
     tenía nada que ver. Un mensaje amable y falso hace perder más tiempo
     que uno feo y cierto. */
  limpiar();
  responder({ message: 'new row violates row-level security policy for table "liga"' },
            false, 403);
  let otro = "";
  try { await C.crearLiga("Los del bar"); } catch (e) { otro = e.message; }
  caso("pero un error de otra tabla NO dice que la fecha cerró",
       !/cerr/i.test(otro) && /liga/i.test(otro), otro);
}

/* ─── 6. EL TOKEN VENCIDO ────────────────────────────────────────────────── */
{
  limpiar();
  responder({ message: "JWT expired" }, false, 401);          // el pedido original
  responder({ access_token: tokenCon("otro-uid"), refresh_token: "R2" });  // la renovación
  responder([{ usuario: "fausto" }]);                          // el reintento
  const u = await C.miUsuario();
  caso("si el token venció, lo renueva y reintenta solo", u === "fausto", "" + u);
  caso("y son tres pedidos, no un bucle", pedidos.length === 3, pedidos.length + " pedidos");
  caso("el del medio es el de renovar", /grant_type=refresh_token/.test(pedidos[1].url));

  limpiar();
  responder({ message: "JWT expired" }, false, 401);
  responder({ message: "invalid refresh token" }, false, 401);
  let err = "";
  try { await C.miUsuario(); } catch (e) { err = e.message; }
  caso("si la renovación también falla, corta y cierra la sesión",
       C.quienSoy() === null && pedidos.length === 2, pedidos.length + " pedidos");
}

/* ─── 6bis. POR QUÉ SE CAÍA LA SESIÓN AL RATO ────────────────────────────
   Fausto: "entrás y la sesión se cae al rato". No se caía: la cerrábamos
   nosotros, por dos motivos distintos. Un caso para cada uno.            */
{
  const entrar = () => C.capturarVuelta(
    { hash: "#access_token=" + tokenCon("uid-1") + "&refresh_token=R", pathname:"/x.html", search:"" },
    { replaceState() {} });

  /* UNO: el refresh token de Supabase es de UN SOLO USO. La pantalla
     dispara varios pedidos juntos; al vencer el token todos daban 401 a la
     vez y todos intentaban renovar con el mismo refresh. El primero
     funcionaba y los demás recibían "ya usado" — y con eso cerrábamos la
     sesión de alguien que estaba perfectamente adentro. */
  entrar(); limpiar();
  responder({ message: "JWT expired" }, false, 401);         /* pedido A */
  responder({ message: "JWT expired" }, false, 401);         /* pedido B */
  responder({ access_token: tokenCon("uid-1"), refresh_token: "R2" });  /* UNA renovación */
  responder([{ usuario: "fausto" }]);
  responder([{ premium_hasta: null }]);
  const [a, b] = await Promise.all([C.miUsuario(), C.miPremium()]);
  const renovaciones = pedidos.filter(p => /grant_type=refresh_token/.test(p.url)).length;
  caso("dos pedidos que vencen juntos renuevan UNA sola vez", renovaciones === 1,
       renovaciones + " renovaciones en " + pedidos.length + " pedidos");
  caso("y los dos terminan bien, sin echar a nadie",
       a === "fausto" && b !== null && C.quienSoy() !== null, a + " / " + JSON.stringify(b));

  /* DOS: un error de red no es una sesión vencida. Antes, cualquier
     excepción —el subte, un timeout— borraba el token del teléfono, y eso
     no se recupera: hay que volver a pedir el mail. */
  entrar(); limpiar();
  const fetchBueno = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (...args) => {
    n++;
    if (n === 1) return { ok:false, status:401, text: async () => JSON.stringify({ message:"JWT expired" }) };
    throw new Error("Failed to fetch");                       /* se cayó la red */
  };
  let murio = "";
  try { await C.miUsuario(); } catch (e) { murio = e.message; }
  globalThis.fetch = fetchBueno;
  caso("si la red se cae mientras renueva, la sesión NO se borra",
       C.quienSoy() !== null, "quedó: " + JSON.stringify(C.quienSoy()));
  /* El pedido sí falla —no hay forma de contestarlo— pero falla con el
     error del pedido original. Eso está bien: lo que no puede pasar es que
     además se lleve puesta la sesión, que es lo que se mide arriba. */
  caso("el pedido falla, pero solo ese pedido", !!murio, murio);

  /* Y la renovación anticipada: un token que ya venció se renueva ANTES de
     disparar la tanda, no después de que seis pedidos den 401. */
  entrar(); limpiar();
  responder({ access_token: tokenCon("uid-1"), refresh_token: "R3" });
  await C.asegurarSesion();
  caso("un token sin vencimiento se renueva por las dudas antes de usarlo",
       pedidos.length === 1 && /grant_type=refresh_token/.test(pedidos[0].url),
       pedidos.length + " pedidos");
}

/* ─── 7. LAS LIGAS ───────────────────────────────────────────────────────── */
{
  /* Volver a entrar, que el caso anterior cerró la sesión a propósito. */
  C.capturarVuelta({ hash: "#access_token=" + tokenCon("uid-1") + "&refresh_token=R",
                     pathname: "/x.html", search: "" }, { replaceState() {} });

  const cod = C.codigoAlAzar(6, () => 0.5);
  caso("el código de liga tiene 6 caracteres", cod.length === 6, cod);
  caso("y no tiene vocales ni ceros ni unos",
       !/[AEIOU01]/.test(C.codigoAlAzar(200, Math.random)));

  /* ── CREAR UN TORNEO VA POR FUNCIÓN, COMO ENTRAR ──────────────────────
     Eran dos inserts y estaba ROTO en la base de verdad, sin que ninguna
     prueba lo viera: el primero pedía `return=representation`, y para
     devolver la fila Postgres tiene que poder leerla — pero la política de
     lectura de `liga` es "soy miembro", y la fila de miembro se insertaba
     recién en el segundo pedido. El insert entraba y la lectura lo rebotaba.
     Un solo pedido, una sola transacción, y el problema no puede volver. */
  limpiar();
  responder([{ id: "liga-1", nombre: "Los del bar", codigo: "XYZ123" }]);
  const l = await C.crearLiga("Los del bar");
  caso("crear un torneo es UN solo pedido, no dos",
       pedidos.length === 1, pedidos.length + " pedidos");
  caso("y va por función, igual que entrar",
       /rpc\/crear_liga$/.test(pedidos[0].url), pedidos[0].url);
  caso("no manda el código: lo sortea el servidor",
       !("codigo" in (pedidos[0].cuerpo || {})) && !("dueno" in (pedidos[0].cuerpo || {})),
       JSON.stringify(pedidos[0].cuerpo));
  caso("y devuelve el torneo con su código",
       l.id === "liga-1" && l.codigo === "XYZ123", JSON.stringify(l));

  /* El nombre se revisa acá también, para no gastar un viaje a la red en
     algo que se ve sin salir del teléfono. */
  limpiar();
  let corto = null;
  try { await C.crearLiga("ab"); } catch (e) { corto = e.message; }
  caso("un nombre de dos letras no llega ni a viajar",
       pedidos.length === 0 && /3 y 40/.test(corto || ""), corto);

  limpiar(); responder("liga-1");
  await C.entrarALiga("  xyz123 ");
  caso("se entra por función, no leyendo la tabla de ligas",
       /rpc\/entrar_a_liga$/.test(pedidos[0].url));
  caso("y el código va en mayúsculas y sin espacios", pedidos[0].cuerpo.cod === "XYZ123");

  limpiar(); responder([{ usuario: "fausto", puntos: 47 }]);
  await C.tablaDeLiga("liga-1", 8);
  caso("la tabla se pide de una sola vez, no armando el join acá",
       /rpc\/tabla_liga$/.test(pedidos[0].url) && pedidos.length === 1);
}

/* ─── 8. SALIR ───────────────────────────────────────────────────────────── */
{
  C.salir();
  caso("salir borra la sesión de este teléfono",
       C.quienSoy() === null && !almacen.has("tste.sesion"));
  limpiar();
  caso("y sin sesión no se pide nada al servidor",
       (await C.misPuntos()).length === 0 && pedidos.length === 0);
}

/* ─── resultado ──────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n +
  (ok || !d ? "" : "   → " + d)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
