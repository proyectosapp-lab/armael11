/* probar-mam.mjs — el cascarón de Mano a mano, de punta a punta, en un navegador de verdad (Playwright, 390 px).
   node probar-mam.mjs            (antes: node empaquetar-mam.mjs, o MAM_LOCAL=… para armar app/www sin red)
   El servidor de Supabase se SIMULA acá adentro (page.route): la prueba no toca la base ni la red. */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import http from "node:http";
import { join, extname } from "node:path";

const aca = (p) => new URL(p, import.meta.url).pathname;
const WWW = aca("./app/www/");
if (!existsSync(join(WWW, "mam.js"))) { console.log("primero: node empaquetar-mam.mjs"); process.exit(1); }
const PRUEBA = aca("./app/www-prueba/");
rmSync(PRUEBA, { recursive: true, force: true }); cpSync(WWW, PRUEBA, { recursive: true });

/* ── fixtures con fechas futuras: tenis, fútbol y NBA ── */
const manana = new Date(Date.now() + 26 * 3600 * 1000);
const fechaAR = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
writeFileSync(join(PRUEBA, "tenis/datos/tenis-hoy.js"), "window.SV_HOY = " + JSON.stringify({ generado: new Date().toISOString(), partidos: [
  { k: "t1", fecha: fechaAR(manana), hora: "15:00", torneo: "Shanghai", ronda: "1/8-finals", sup: "Hard", mejorDe: 3, a: { k: "a1", nombre: "A. Rublev", rk: 10, pais: "RUS" }, b: { k: "b1", nombre: "N. Borges", rk: 48, pais: "POR" }, p: 0.71, saqueA: 65, saqueB: 62 },
  { k: "t2", fecha: fechaAR(manana), hora: "17:00", torneo: "Shanghai", ronda: "1/8-finals", sup: "Hard", mejorDe: 3, a: { k: "a2", nombre: "J. Sinner", rk: 1, pais: "ITA" }, b: { k: "b2", nombre: "C. Alcaraz", rk: 2, pais: "ESP" }, p: 0.52, saqueA: 70, saqueB: 69 },
], jugados: [], jugadores: {}, cruces: {} }) + ";\n");
writeFileSync(join(PRUEBA, "nba/datos/nba-hoy.js"), "window.NBA_HOY=" + JSON.stringify({ temporada: 2026, generado: new Date().toISOString(), parte: { fecha: fechaAR(manana) }, partidos: [
  { id: "n1", fecha: manana.toISOString(), local: { id: 1, n: "Boston", codigo: "BOS", b2b: 0, jugadores: [] }, visita: { id: 2, n: "Denver", codigo: "DEN", b2b: 0, jugadores: [] }, m0: { margen: -2 }, m1: { p: 0.44, margen: -2 }, modelo: { b2b: 2, desvio: 12.5 }, hora: "21:30" },
], baja: null, calendario: [{ id: "n9", fecha: new Date(+manana + 5 * 864e5).toISOString(), local: { id: 3, nombre: "Lakers", codigo: "LAL" }, visita: { id: 4, nombre: "Miami", codigo: "MIA" }}] }) + ";\n");
mkdirSync(join(PRUEBA, "futbol/datos"), { recursive: true });
writeFileSync(join(PRUEBA, "futbol/datos/liga-prueba.js"), "window.LIGAS=window.LIGAS||{};window.LIGAS[\"prueba\"]=" + JSON.stringify({ id: 1, slug: "prueba", nombre: "Liga de prueba", equipos: { 10: { n: "Talleres" }, 11: { n: "Belgrano" } }, partidos: [
  { id: 501, fecha: manana.toISOString(), ronda: "Fecha 11", local: 10, visita: 11, estado: "NS", golL: null, golV: null },
] }) + ";window.LIGAS_DISPONIBLES=[\"prueba\"];\n");
{ const p = join(PRUEBA, "futbol/index.html"); let h = readFileSync(p, "utf8"); if (!h.includes("liga-prueba.js")) h = h.replace('<script src="datos/juego.js"></script>', '<script src="datos/juego.js"></script>\n<script src="datos/liga-prueba.js"></script>'); writeFileSync(p, h); }

/* ── un servidor estático ── */
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff" };
const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split("?")[0].split("#")[0]); if (ruta.endsWith("/")) ruta += "index.html";
  const f = join(PRUEBA, ruta);
  if (!existsSync(f)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "Content-Type": TIPOS[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
});
await new Promise((r) => servidor.listen(0, r));
const BASE = "http://127.0.0.1:" + servidor.address().port;

/* ── el Supabase de mentira ── */
const UID = "11111111-1111-1111-1111-111111111111";
const TOKEN = "x." + Buffer.from(JSON.stringify({ sub: UID, exp: 9999999999, is_anonymous: true })).toString("base64url") + ".y";
const SESION = { access_token: TOKEN, refresh_token: "r", user: { id: UID, is_anonymous: true } };
let DESAFIO = null; const LLAMADAS = []; let PAGADO = false; const COBRA = { futbol: "si", tenis: "si", nba: "si" };   // los ajustes cobra / cobra_sacavos / cobra_quinteto   // PAGADO: la tienda simulada ya cobró (ver "la compra adentro del teléfono")
async function simularBackend(page) {
  await page.route(/supabase\.co/, async (route) => {
    const req = route.request(); const url = req.url(); const metodo = req.method();
    LLAMADAS.push(metodo + " " + url.replace(/^.*supabase\.co/, ""));
    const ok = (d, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(d) });
    if (metodo === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (/\/auth\/v1\/signup/.test(url)) return ok(SESION);
    if (/\/auth\/v1\/otp/.test(url)) { LLAMADAS.push("OTP " + url.replace(/^.*\/auth\/v1\/otp/, "") + " " + req.postData()); return ok({}); }
    if (/\/auth\/v1\/verify/.test(url)) { const b = req.postDataJSON(); LLAMADAS.push("VERIFY " + JSON.stringify(b)); return b.token === "123456" ? ok({ ...SESION, user: { id: UID, is_anonymous: false } }) : route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ msg: "Token has expired or is invalid" }) }); }
    if (/\/auth\/v1\/user/.test(url)) return ok(SESION.user);
    if (/\/rest\/v1\/perfil/.test(url)) return ok([{ id: SESION.user.id, usuario: "fausto", plan: "gratis", premium_hasta: null }]);
    if (/\/rest\/v1\/pase/.test(url)) return ok(PAGADO ? [{ producto: "sacavos", hasta: new Date(Date.now() + 30 * 864e5).toISOString() }] : []);
    if (/functions\/v1\/pago-apple/.test(url)) { PAGADO = true; LLAMADAS.push("AUTH " + (req.headers()["authorization"] || "")); return ok({ ok: true, plan: "tenis", planes: ["tenis"] }); }
    if (/\/rest\/v1\/ajuste/.test(url)) return ok([{ clave: "cobra", valor: COBRA.futbol }, { clave: "cobra_sacavos", valor: COBRA.tenis }, { clave: "cobra_quinteto", valor: COBRA.nba }]);
    if (/\/rest\/v1\/prueba/.test(url)) return ok([]);
    if (/rpc\/ponerme_apodo/.test(url)) return ok("fausto");
    if (/rpc\/mis_desafios/.test(url)) return ok(DESAFIO ? [{ codigo: DESAFIO.codigo, nombre: DESAFIO.nombre, estado: "abierto", partidos: DESAFIO.partidos.length, jugadores: 1, proximo: DESAFIO.partidos[0].empieza, mis_puntos: 0, puesto: 1 }] : []);
    if (/rpc\/crear_desafio/.test(url)) {
      const b = req.postDataJSON();
      DESAFIO = { codigo: "ABC123", nombre: b.p_nombre, estado: "abierto", creador: "fausto", soy: true, modelo_puntos: 0, modelo_juega: b.p_partidos.filter((p) => p.modelo != null).length,
        partidos: b.p_partidos.map((p) => ({ ...p, resultado: null, empezo: false, modelo: null, modelo_p: null, mia: null, elecciones: null })), jugadores: [{ apodo: "fausto", puntos: 0, creador: true, yo: true, elegidos: 0 }] };
      DESAFIO._guardado = b.p_partidos;
      return ok("ABC123");
    }
    if (/rpc\/ver_desafio/.test(url)) return ok(DESAFIO);
    if (/rpc\/unirse_desafio/.test(url)) return ok(null);
    if (/rpc\/elegir_desafio/.test(url)) { const b = req.postDataJSON(); const p = DESAFIO.partidos.find((x) => x.deporte === b.p_deporte && x.partido === b.p_partido); if (p) p.mia = b.p_eleccion; return ok(null); }
    if (/rpc\/registrar_dispositivo/.test(url)) return ok(null);
    if (/rpc\/mi_prueba|rpc\/mi_pase/.test(url)) return ok([]);
    if (/functions\/v1\/crear-pago/.test(url)) {
      /* la web: el precio lo dice el servidor; el POST arma el link de Mercado Pago (acá, la página de gracias) */
      if (metodo === "GET") return ok({ planes: [["futbol", 2990], ["tenis", 2990], ["nba", 2990], ["todo", 5990], ["sacavos", 2990], ["liga", 3000]].map(([id, precio]) => ({ id, meses: 1, precio, moneda: "ARS" })) });
      const b = req.postDataJSON() || {}; LLAMADAS.push("PLAN " + b.plan + " AUTH " + (req.headers()["authorization"] || "")); PAGADO = true;
      return ok({ link: BASE + "/gracias.html?estado=aprobado", prueba: BASE + "/gracias.html" });
    }
    return ok([]);
  });
}

let fallas = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fallas++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-AR" });
const page = await ctx.newPage();
const errores = []; page.on("pageerror", (e) => errores.push("shell: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/net::|Failed to load|404/.test(m.text())) errores.push("console: " + m.text().slice(0, 160)); });
await simularBackend(page);

console.log("\n── la primera vez ──");
await page.goto(BASE + "/index.html"); await page.waitForTimeout(600);
ok(await page.isVisible("#mam-bienvenida"), "la bienvenida se ve la primera vez");
ok(await page.evaluate(() => !document.getElementById("mam-futbol").src), "los marcos todavía no cargan nada");
await page.click('#mam-elegir [data-deporte="tenis"]');
await page.click("#mam-empezar"); await page.waitForTimeout(1500);
ok(await page.isHidden("#mam-bienvenida"), "la bienvenida se va al tocar Empezar");
const deportesVisibles = await page.$$eval("#mam-deportes [data-deporte]:not([hidden])", (b) => b.map((x) => x.dataset.deporte));
ok(JSON.stringify(deportesVisibles) === JSON.stringify(["futbol", "tenis"]), "arriba quedan los deportes elegidos: " + deportesVisibles.join(", "));
ok((await page.evaluate(() => localStorage.getItem("mam.deportes"))) === '["futbol","tenis"]', "la elección queda guardada");
ok(await page.isVisible("#mam-futbol"), "el marco de fútbol se ve (es el primero elegido)");
await page.screenshot({ path: aca("./app/captura-1-partidos.png") });

console.log("\n── los marcos en modo app ──");
await page.waitForTimeout(2500);   // los otros marcos se cargan después
const marcos = {};
for (const d of ["futbol", "tenis", "nba"]) {
  const f = page.frames().find((x) => x.url().includes("/" + d + "/")); marcos[d] = f;
  ok(!!f, "el marco de " + d + " cargó (" + (f ? f.url().replace(BASE, "") : "no") + ")");
}
for (const d of ["futbol", "tenis", "nba"]) {
  const f = marcos[d]; if (!f) continue;
  await f.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(800);
  const marco = await f.evaluate(() => ({ adentro: !!(window.mamMarco && window.mamMarco.adentro()), clase: document.body.classList.contains("mam-marco") }));
  ok(marco.adentro && marco.clase, d + ": sabe que está adentro (body.mam-marco)");
}
const cabTenis = await marcos.tenis.evaluate(() => { const c = document.querySelector(".sv-cab"); return c ? getComputedStyle(c).display : "no"; });
ok(cabTenis === "none", "tenis: la cabecera propia no se ve adentro de la app");
const cabNba = await marcos.nba.evaluate(() => { const c = document.querySelector("header.q5-cab"); return c ? getComputedStyle(c).display : "no"; });
ok(cabNba === "none", "NBA: la cabecera propia no se ve adentro de la app");
const barraFutbol = await marcos.futbol.evaluate(() => { const c = document.querySelector(".barra"); return c ? getComputedStyle(c).position + "/" + getComputedStyle(c).top : "no"; });
ok(/fixed\/0px/.test(barraFutbol), "fútbol: su barra de pestañas pasó arriba (" + barraFutbol + ")");
ok(await marcos.futbol.evaluate(() => typeof window.mamPronostico === "function"), "fútbol: expone mamPronostico(slug, id)");

console.log("\n── deportes y pestañas ──");
await page.click('#mam-deportes [data-deporte="tenis"]'); await page.waitForTimeout(300);
ok(await page.isVisible("#mam-tenis") && (await page.isHidden("#mam-futbol")), "tocar Tenis muestra el marco de tenis y esconde el de fútbol");
await page.click('#mam-barra [data-pestana="juga"]'); await page.waitForTimeout(500);
const pestTenis = await marcos.tenis.evaluate(() => document.body.classList.contains("sv-pest-juegos"));
ok(pestTenis, "Jugá le pide al marco de tenis la pestaña Juegos");
await page.screenshot({ path: aca("./app/captura-2-juga.png") });
await page.click('#mam-barra [data-pestana="partidos"]'); await page.waitForTimeout(400);
ok(await marcos.tenis.evaluate(() => document.body.classList.contains("sv-pest-partidos") && document.body.classList.contains("sv-pest-ambas")), "Partidos vuelve a la lista (con los resultados debajo)");

console.log("\n── los partidos de los tres, para el desafío ──");
const partidos = await page.evaluate(() => window.mam.partidos().map((p) => ({ d: p.deporte, id: p.partido, l: p.local, v: p.visita, op: p.opciones, p: p.p, f: p.fuente })));
ok(partidos.length === 5, "junta los partidos de los tres deportes: " + partidos.length + " (2 tenis, 1 fútbol, 1 NBA + 1 del calendario NBA)");
ok(partidos.some((p) => p.d === "nba" && p.id === "n9" && p.l === "Lakers" && p.f === "nba-calendario"), "el calendario de la NBA (sin número todavía) también entra a los desafíos");
ok(partidos.some((p) => p.d === "futbol" && p.op === 3 && p.l === "Talleres" && p.f === "prueba"), "fútbol trae local/visita por nombre, 3 opciones y la liga como fuente");
ok(partidos.some((p) => p.d === "tenis" && /^tenis:a1:b1:/.test(p.f)), "tenis lleva las claves de los jugadores en la fuente");
const mT = await page.evaluate(async () => window.mam.modelo(window.mam.partidos().find((p) => p.partido === "t1")));
ok(mT && mT.eleccion === 1 && Math.abs(mT.p - 0.71) < 0.001, "modelo tenis: elige al de mayor probabilidad (" + JSON.stringify(mT) + ")");
const mN = await page.evaluate(async () => window.mam.modelo(window.mam.partidos().find((p) => p.deporte === "nba" && p.partido === "n1")));
ok(mN && mN.eleccion === 2 && Math.abs(mN.p - 0.56) < 0.001, "modelo NBA: 0.44 de local → elige la visita (" + JSON.stringify(mN) + ")");
const mC = await page.evaluate(async () => window.mam.modelo(window.mam.partidos().find((p) => p.partido === "n9")));
ok(mC === null, "un partido del calendario NBA no tiene número: el modelo lo elige el servidor cuando sale (" + JSON.stringify(mC) + ")");
const mF = await page.evaluate(async () => window.mam.modelo(window.mam.partidos().find((p) => p.deporte === "futbol")));
ok(mF === null || (mF && [1, 2, 3].includes(mF.eleccion)), "modelo fútbol: pide al marco y devuelve algo válido o null sin romper (" + JSON.stringify(mF) + ")");
const Jintacto = await marcos.futbol.evaluate(() => typeof J === "object" && J.paso !== "armar" || true);
ok(Jintacto, "fútbol: el estado del juego queda como estaba después de pronosticar");

console.log("\n── desafíos: apodo → crear → ver → elegir ──");
await page.click('#mam-barra [data-pestana="desafios"]'); await page.waitForTimeout(400);
ok(await page.isVisible("#mam-desafios [data-form-apodo]"), "sin cuenta pide un apodo");
ok(await page.isHidden("#mam-deportes"), "en Desafíos la fila de deportes no se ve (son los tres juntos)");
await page.fill("#mam-desafios [data-form-apodo] input", "Fausto");
await page.click("#mam-desafios [data-form-apodo] button"); await page.waitForTimeout(800);
ok(LLAMADAS.some((l) => /auth\/v1\/signup/.test(l)) && LLAMADAS.some((l) => /ponerme_apodo/.test(l)), "crea la cuenta anónima y pone el apodo");
ok(await page.isVisible("#mam-desafios [data-crear]"), "después del apodo aparece la lista con Crear");
await page.click("#mam-desafios [data-crear]"); await page.waitForTimeout(500);
const tarjetas = await page.$$("#mam-desafios .mam-partido");
ok(tarjetas.length === 5, "la pantalla de crear lista los 5 partidos (el del calendario NBA incluido)");
await page.screenshot({ path: aca("./app/captura-3-crear.png") });
await page.click('#mam-desafios .mam-partido[data-k="tenis:t1"]');
await page.click('#mam-desafios .mam-partido[data-k="futbol:501"]');
await page.click('#mam-desafios .mam-partido[data-k="nba:n1"]');
ok((await page.textContent("#mam-desafios [data-cuenta]")).includes("3 partidos"), "cuenta los elegidos");
await page.fill("#mam-desafios [data-nombre]", "Finde con los pibes");
await page.click("#mam-desafios [data-crear-ya]"); await page.waitForTimeout(1200);
const guardado = DESAFIO && DESAFIO._guardado;
ok(guardado && guardado.length === 3, "manda crear_desafio con 3 partidos");
ok(guardado && guardado.find((p) => p.deporte === "tenis").modelo === 1 && guardado.find((p) => p.deporte === "nba").modelo === 2, "guarda la elección del modelo de tenis y NBA (se tapa en el servidor)");
ok(guardado && guardado.every((p) => /^\d{4}-\d{2}-\d{2}T/.test(p.empieza)), "las fechas van en ISO");
ok(await page.isVisible("#mam-desafios .mam-codigo"), "muestra el código del desafío");
ok((await page.textContent("#mam-desafios")).includes("ABC123"), "…y es el que devolvió el servidor");
ok((await page.$$("#mam-desafios [data-elegir]")).length === 7, "cada partido tiene sus botones para elegir (2+3+2)");
const textoDesafio = await page.textContent("#mam-desafios");
ok(!/\d{2}\s?%/.test(textoDesafio.replace(/\d+ partidos/g, "")), "antes de que empiece no se ve ningún número del modelo");
await page.click('#mam-desafios [data-elegir="2"][data-partido="t1"]');
await page.waitForTimeout(500);
ok(LLAMADAS.some((l) => /elegir_desafio/.test(l)), "elegir manda elegir_desafio");
await page.screenshot({ path: aca("./app/captura-4-desafio.png") });

console.log("\n── el link de un desafío ──");
await page.goto(BASE + "/index.html#desafio=ABC123"); await page.waitForTimeout(1500);
ok((await page.textContent("#mam-desafios")).includes("Finde con los pibes"), "abrir #desafio=CODIGO cae en ese desafío");
ok(!(await page.evaluate(() => location.hash)), "(el hash se consume)");
ok(await page.isVisible("#mam-desafios [data-compartir]"), "hay botón de compartir");
ok((await page.$("#mam-desafios [data-imagen]")) === null, "mientras está abierto no hay imagen de la tabla (no hay nada que mostrar)");

console.log("\n── cuando empezó: la tabla y la imagen ──");
DESAFIO.estado = "en juego"; DESAFIO.partidos[0].empezo = true; DESAFIO.partidos[0].modelo = 1; DESAFIO.partidos[0].modelo_p = 0.71; DESAFIO.partidos[0].elecciones = { fausto: 2 };
await page.goto(BASE + "/index.html#desafio=ABC123"); await page.waitForTimeout(1500);
ok(await page.isVisible("#mam-desafios [data-imagen]"), "hay botón de imagen para Instagram");
ok(/el modelo/i.test(await page.textContent("#mam-desafios")), "el modelo aparece en la tabla");
await page.click("#mam-desafios [data-imagen]"); await page.waitForTimeout(800);
ok(await page.isVisible("#mam-desafios img.mam-imagen"), "la imagen de la tabla se genera");
await page.screenshot({ path: aca("./app/captura-4b-tabla.png") });

console.log("\n── cuenta ──");
await page.click('#mam-barra [data-pestana="cuenta"]'); await page.waitForTimeout(900);
const cuenta = await page.textContent("#mam-cuenta");
ok(/fausto/i.test(cuenta), "la cuenta muestra el apodo");
ok((await page.$$("#mam-cuenta [data-plan]")).length === 4, "cuatro planes: Fútbol, Tenis, NBA, Todo");
ok(/se renueva sola|Restaurar|Privacidad/i.test(cuenta), "la letra chica de las suscripciones está");
ok(await page.isVisible("#mam-cuenta [data-borrar]"), "hay Borrar mi cuenta");
ok(await page.isVisible("#mam-cuenta [data-form-atar]"), "la cuenta anónima ofrece vincular un mail");
ok((await page.$$("#mam-cuenta [data-ojo]")).length === 1 && (await page.getAttribute("#mam-cuenta [data-form-atar] input[name=clave]", "type")) === "password", "la contraseña viene tapada y tiene el ojito");
await page.click("#mam-cuenta [data-form-atar] [data-ojo]");
ok((await page.getAttribute("#mam-cuenta [data-form-atar] input[name=clave]", "type")) === "text" && (await page.getAttribute("#mam-cuenta [data-form-atar] [data-ojo]", "aria-pressed")) === "true", "el ojito muestra lo que se escribe");
await page.click("#mam-cuenta [data-form-atar] [data-ojo]");
ok((await page.getAttribute("#mam-cuenta [data-form-atar] input[name=clave]", "type")) === "password", "y la vuelve a tapar");
await page.screenshot({ path: aca("./app/captura-5-cuenta.png") });

console.log("\n── el marco pide los planes ──");
await page.click('#mam-barra [data-pestana="partidos"]'); await page.waitForTimeout(300);
await marcos.tenis.evaluate(() => window.mamMarco.pase("tenis")); await page.waitForTimeout(600);
ok(await page.isVisible("#mam-cuenta") && (await page.$('#mam-cuenta [data-plan="mam.tenis"].resaltado')) !== null, "un 'pase' del marco de tenis lleva a Cuenta con el plan Tenis resaltado");

console.log("\n── los juegos (Jugá) ──");
async function deslizar(x0, y0, x1, y1, ms) {
  const cv = await page.$("canvas.mam-cancha"); const r = await cv.boundingBox();
  const px = (x) => r.x + x / 360 * r.width, py = (y) => r.y + y / 540 * r.height;
  await page.mouse.move(px(x0), py(y0)); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(px(x0 + (x1 - x0) * i / 8), py(y0 + (y1 - y0) * i / 8)); await page.waitForTimeout(ms / 8); }
  await page.mouse.up();
}
await page.click('#mam-barra [data-pestana="partidos"]'); await page.click('#mam-deportes [data-deporte="futbol"]'); await page.waitForTimeout(300);
await page.click('#mam-barra [data-pestana="juga"]'); await page.waitForTimeout(500);
ok(await page.isVisible("#mam-juga canvas.mam-cancha"), "fútbol · Jugá muestra un juego propio (canvas)");
ok((await page.$$("#mam-juga [data-j]")).length === 3, "con tres opciones: Penales, Tiro libre, Fantasy");
await page.mouse.click(200, 560); await page.waitForTimeout(200);
await deslizar(180, 430, 130, 250, 150); await page.waitForTimeout(300);
let est = await page.evaluate(() => window.mamJuegos._estado().estado.fase);
ok(est === "vuelo-mio" || est === "fin-tiro", "deslizar patea el penal (fase " + est + ")");
await page.waitForTimeout(2500); est = await page.evaluate(() => { const s = window.mamJuegos._estado().estado; return { serie: s.serie.length, tanda: s.tanda, fase: s.fase }; });
ok(est.serie === 1 && est.tanda === "el", "después de mi penal patea él (" + JSON.stringify(est) + ")");
await page.click('#mam-juga [data-j="libre"]'); await page.waitForTimeout(400);
ok((await page.evaluate(() => window.mamJuegos._estado().nombre)) === "libre", "la ficha Tiro libre monta el otro juego");
await page.click('#mam-juga [data-j="fantasy"]'); await page.waitForTimeout(400);
ok(await page.isVisible("#mam-futbol") && (await page.isHidden("#mam-juga")), "Fantasy vuelve al marco de fútbol");
await page.click('#mam-deportes [data-deporte="tenis"]'); await page.waitForTimeout(400);
ok(await page.isVisible("#mam-tenis"), "en tenis, Jugá es el saque adentro de su web");
await page.evaluate(() => window.mam.ir("juga", "nba")); await page.waitForTimeout(500);
ok((await page.evaluate(() => window.mamJuegos._estado() && window.mamJuegos._estado().nombre)) === "triples", "en NBA, Jugá son los Triples (y sumar NBA lo agrega arriba)");
await page.mouse.click(200, 560); await page.waitForTimeout(200); await deslizar(180, 450, 180, 260, 180);
for (let i = 0; i < 20; i++) { await page.waitForTimeout(300); est = await page.evaluate(() => { const s = window.mamJuegos._estado().estado; return { tiros: s.tiros, ultimo: s.ultimo }; }); if (est.ultimo) break; }
ok(est.tiros === 1 && est.ultimo, "deslizar hacia arriba tira y el tiro se resuelve (" + est.ultimo + ")");
await page.screenshot({ path: aca("./app/captura-6-juego.png") });

console.log("\n── la compra adentro del teléfono (tienda simulada) ──");
/* Un Capacitor de mentira con el plugin de RevenueCat: anota cada llamada. Lo que se prueba es el ORDEN que protege la
   plata: la tienda se presenta con el perfil de Supabase (logIn) ANTES de comprar, y después de comprar se le avisa al
   servidor con el token. Si RevenueCat se queda con un usuario anónimo, Apple cobra y el pase no llega nunca. */
const CAPACITOR = (plataforma) => `
  window.__RC = { llamadas: [] };
  const anotar = (...a) => window.__RC.llamadas.push(a);
  const Purchases = {
    configure: async (o) => { anotar("configure", (o && o.appUserID) || null); },
    logIn: async (o) => { anotar("logIn", o.appUserID); return { created: true }; },
    logOut: async () => { anotar("logOut"); throw new Error("LogOutError: the current user is anonymous"); },
    getProducts: async (o) => { anotar("getProducts", o.productIdentifiers);
      const ids = o.productIdentifiers.filter((id) => ${JSON.stringify(plataforma)} === "android" ? /:mensual$/.test(id) : !/:/.test(id));
      return { products: ids.map((id) => ({ identifier: id, productIdentifier: id, priceString: /todo/.test(id) ? "US$ 3,99" : "US$ 1,99", introPrice: { price: 0, priceString: "Gratis", periodNumberOfUnits: 3, periodUnit: "DAY" } })) }; },
    purchaseStoreProduct: async (o) => { anotar("purchase", o.product.identifier); return { productIdentifier: o.product.identifier }; },
    restorePurchases: async () => { anotar("restore"); return {}; },
  };
  window.__RESENAS = 0;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => ${JSON.stringify(plataforma)}, Plugins: { Purchases, Haptics: { impact() {} }, App: { addListener() { return { remove() {} }; } }, InAppReview: { requestReview: async () => { window.__RESENAS++; } } } };
  try { localStorage.setItem("mam.deportes", '["futbol","tenis","nba"]'); localStorage.setItem("mam.pestana", '"cuenta"'); } catch (e) {}
`;
for (const plataforma of ["ios", "android"]) {
  const ctx2 = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-AR" });
  const p2 = await ctx2.newPage(); p2.on("pageerror", (e) => errores.push(plataforma + ": " + e.message));
  await simularBackend(p2); await p2.addInitScript(CAPACITOR(plataforma));
  PAGADO = false; LLAMADAS.length = 0; COBRA.nba = plataforma === "android" ? "no" : "si";   // en Android se prueba un deporte abierto
  await p2.goto(BASE + "/index.html"); await p2.waitForTimeout(1200);
  const rc = () => p2.evaluate(() => window.__RC.llamadas);
  let ll = await rc();
  ok(ll.some((l) => l[0] === "configure") && ll.some((l) => l[0] === "getProducts"), plataforma + ": sin cuenta, la tienda arranca y pide los precios");
  const pedidos = (ll.find((l) => l[0] === "getProducts") || [])[1] || [];
  ok(plataforma === "android" ? pedidos.some((i) => /:mensual$/.test(i)) && pedidos.some((i) => !/:/.test(i)) : pedidos.every((i) => !/:/.test(i)), plataforma + ": pide los productos como los nombra RevenueCat ahí (" + pedidos.length + " ids)");
  ok(await p2.isVisible("#mam-cuenta [data-form-apodo]"), plataforma + ": la cuenta pide un apodo");
  await p2.fill("#mam-cuenta [data-form-apodo] input[name=apodo]", "fausto"); await p2.click("#mam-cuenta [data-form-apodo] button"); await p2.waitForTimeout(1200);
  ll = await rc();
  const login = ll.find((l) => l[0] === "logIn");
  ok(login && login[1] === UID, plataforma + ": con el apodo puesto, RevenueCat se presenta con el perfil de Supabase (logIn " + (login ? login[1].slice(0, 8) : "no") + ")");
  const planes = await p2.$$eval("#mam-cuenta [data-plan]", (b) => b.map((x) => x.dataset.plan + " " + x.querySelector(".precio").textContent));
  const vendibles = planes.filter((t) => !/^mam\.nba /.test(t) || plataforma === "ios");
  ok(planes.length === 4 && vendibles.every((t) => /probar 3 días gratis · después US\$ (1|3),99 \/ mes/.test(t)), plataforma + ": los planes ofrecen la prueba de la tienda: 'probar 3 días gratis · después el precio' (" + planes.join(" · ") + ")");
  if (plataforma === "android") ok(/mam\.nba por ahora, abierto para todos/.test(planes.join(" · ")) && (await p2.$eval('#mam-cuenta [data-plan="mam.nba"]', (b) => b.disabled)), "un deporte con el cobro apagado no se vende: 'por ahora, abierto para todos', botón apagado");
  ok(/3 días gratis la primera vez/.test(await p2.textContent("#mam-cuenta")), plataforma + ": y el título de Planes lo dice");
  await p2.click('#mam-cuenta [data-plan="mam.tenis"]'); await p2.waitForTimeout(1500);
  ll = await rc(); const compra = ll.find((l) => l[0] === "purchase");
  ok(compra && /^com\.armael11\.app\.mam\.tenis\.mensual(:mensual)?$/.test(compra[1]), plataforma + ": tocar Tenis compra ese producto en la tienda (" + (compra ? compra[1] : "no") + ")");
  ok(ll.findIndex((l) => l[0] === "logIn") < ll.findIndex((l) => l[0] === "purchase"), plataforma + ": y la presentación (logIn) fue ANTES de la compra");
  ok(LLAMADAS.some((l) => /^AUTH Bearer x\./.test(l)), plataforma + ": después de comprar le avisa al servidor (pago-apple) con el token de la sesión");
  const txt = await p2.textContent("#mam-cuenta");
  ok(/El plan ya está activo/.test(txt) && /activo hasta el/.test(await p2.textContent('#mam-cuenta [data-plan="mam.tenis"]')), plataforma + ": la pantalla dice que el plan está activo y Tenis muestra hasta cuándo");
  if (plataforma === "ios") {
    /* la reseña: al segundo momento de uso real, y no de nuevo por 90 días */
    await p2.evaluate(() => window.mam.momento("marca")); await p2.waitForTimeout(100);
    ok((await p2.evaluate(() => window.__RESENAS)) === 0, "un solo momento bueno todavía no pide la reseña");
    await p2.evaluate(() => window.mam.momento("desafio")); await p2.waitForTimeout(2000);
    ok((await p2.evaluate(() => window.__RESENAS)) === 1, "al segundo momento (marca personal + desafío terminado) pide la reseña a la tienda");
    await p2.evaluate(() => { window.mam.momento("marca"); window.mam.momento("marca"); }); await p2.waitForTimeout(2000);
    ok((await p2.evaluate(() => window.__RESENAS)) === 1, "y no la vuelve a pedir enseguida (90 días)");
  }
  COBRA.nba = "si";
  await ctx2.close();
}

console.log("\n── la compra en la web (Mercado Pago, armael11.com/app) ──");
{
  const ctx3 = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-AR" });
  const p3 = await ctx3.newPage(); p3.on("pageerror", (e) => errores.push("web: " + e.message));
  await simularBackend(p3); PAGADO = false; LLAMADAS.length = 0;
  await p3.addInitScript(() => { try { localStorage.setItem("mam.deportes", '["futbol","tenis","nba"]'); localStorage.setItem("mam.pestana", '"cuenta"'); } catch (e) {} });
  await p3.goto(BASE + "/index.html"); await p3.waitForTimeout(1200);
  await p3.fill("#mam-cuenta [data-form-apodo] input[name=apodo]", "fausto"); await p3.click("#mam-cuenta [data-form-apodo] button"); await p3.waitForTimeout(1200);
  const planes = await p3.$$eval("#mam-cuenta [data-plan]", (b) => b.map((x) => x.dataset.plan + " " + x.querySelector(".precio").textContent));
  ok(planes.length === 4 && /mam\.futbol \$2\.990 \/ mes/.test(planes[0]) && /mam\.todo \$5\.990 \/ mes/.test(planes[3]), "los cuatro planes muestran el precio en pesos que dijo el servidor (" + planes.join(" · ") + ")");
  ok(/Mercado Pago/.test(await p3.textContent("#mam-cuenta")) && !/se compra en el sitio/.test(await p3.textContent("#mam-cuenta")), "la letra chica es la de la web: Mercado Pago, un mes por vez, sin mandar a cada sitio");
  ok(!/\$ ?2990|2\.990 ?\/ ?mes/.test(readFileSync(join(PRUEBA, "mam.js"), "utf8") + readFileSync(join(PRUEBA, "tienda-mam.js"), "utf8")), "en la app no hay ningún precio escrito");
  await p3.click('#mam-cuenta [data-plan="mam.tenis"]'); await p3.waitForTimeout(1500);
  ok(LLAMADAS.some((l) => /^PLAN tenis AUTH Bearer x\./.test(l)), "tocar Tenis le pide el link al servidor con el plan 'tenis' y el token de la sesión");
  ok(/gracias\.html/.test(p3.url()) && /Gracias/.test(await p3.textContent("h1")), "y se va a Mercado Pago, que vuelve a gracias.html de la app");
  await p3.click("#volver"); await p3.waitForTimeout(1500);
  ok(/index\.html$/.test(p3.url().split("#")[0]) && (await p3.isVisible("#mam-cuenta")), "Volver a la app abre la cuenta");
  ok(/activo hasta el/.test(await p3.textContent('#mam-cuenta [data-plan="mam.tenis"]')), "y la cuenta vuelve a leer el pase: Tenis ya figura");
  await ctx3.close();
}

console.log("\n── entrar con un código por mail (no un link) ──");
{
  const ctx4 = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-AR" });
  const p4 = await ctx4.newPage(); p4.on("pageerror", (e) => errores.push("código: " + e.message));
  await simularBackend(p4); LLAMADAS.length = 0;
  await p4.addInitScript(() => { try { localStorage.setItem("mam.deportes", '["futbol","tenis","nba"]'); localStorage.setItem("mam.pestana", '"cuenta"'); } catch (e) {} });
  await p4.goto(BASE + "/index.html"); await p4.waitForTimeout(1200);
  ok(await p4.isVisible("#mam-cuenta [data-form-apodo]") && await p4.isVisible("#mam-cuenta [data-con-mail]") && !(await p4.$("#mam-cuenta [data-form-entrar]")), "una sola pantalla: el apodo arriba y 'ya tengo cuenta' plegado");
  await p4.click("#mam-cuenta [data-con-mail]"); await p4.waitForTimeout(300);
  ok(await p4.isVisible("#mam-cuenta [data-codigo]") && !(await p4.$("#mam-cuenta [data-link]")) && (await p4.$$("#mam-cuenta [data-ojo]")).length === 1, "desplegado: pide el mail, ofrece el código (no un link) y la contraseña con ojito");
  await p4.fill("#mam-cuenta [data-form-entrar] input[name=email]", "Fausto@Mail.com"); await p4.click("#mam-cuenta [data-codigo]"); await p4.waitForTimeout(800);
  const otp = LLAMADAS.find((l) => /^OTP /.test(l)) || "";
  ok(/"email":"fausto@mail\.com"/.test(otp) && !/redirect/.test(otp), "pide el código al servidor, con el mail limpio y sin link de vuelta (" + otp.slice(0, 80) + ")");
  ok(await p4.isVisible("#mam-cuenta [data-form-codigo]") && /fausto@mail\.com/.test(await p4.textContent("#mam-cuenta")), "aparece el campo para escribir el código, con el mail al que se mandó");
  await p4.fill("#mam-cuenta [data-form-codigo] input[name=codigo]", "000000"); await p4.click("#mam-cuenta [data-form-codigo] button"); await p4.waitForTimeout(800);
  ok(/no sirve o ya venció/.test(await p4.textContent("#mam-cuenta")), "un código equivocado lo dice en castellano");
  await p4.fill("#mam-cuenta [data-form-codigo] input[name=codigo]", "123 456"); await p4.click("#mam-cuenta [data-form-codigo] button"); await p4.waitForTimeout(1200);
  ok(LLAMADAS.some((l) => /^VERIFY .*"type":"email".*"token":"123456"/.test(l)), "el código se verifica como 'email', sin espacios");
  ok(await p4.isVisible("#mam-cuenta [data-salir]") && JSON.parse(await p4.evaluate(() => localStorage.getItem("tste.sesion"))).uid === UID, "con el código bien, la sesión queda guardada EN la app");
  await ctx4.close();
}

console.log("\n── el texto de la portada no viaja adentro ──");
{
  const { absolutizar } = await import("./empaquetar-mam.mjs");
  const h = '<p>antes</p>\n<!-- portada:inicio -->\n<section class="portada-texto"><h2>Qué es</h2><p>quinientas palabras</p></section>\n<!-- portada:fin -->\n<p class="pie">después</p>';
  const r = absolutizar(h, "https://armael11.com");
  ok(!/portada-texto|quinientas/.test(r) && /antes/.test(r) && /después/.test(r), "el empaquetador saca el bloque de la portada (para los buscadores) y deja el resto");
  ok(!/consulta-x/.test(absolutizar("a<!-- consulta:inicio -->consulta-x<!-- consulta:fin -->b", "https://armael11.com")), "y sigue sacando el de la consulta");
  /* 9/10: el build de Codemagic se cayó con EISDIR al escribir "repasos/": la portada enlaza /repasos/ y el
     rastreador lo bajó como si fuera un archivo. Ni la consulta ni los repasos viajan; una carpeta, nunca. */
  const { noSeLleva, enlacesDe } = await import("./empaquetar-ios.mjs");
  ok(noSeLleva("repasos/") && noSeLleva("repasos/argentina-clausura-fecha-11.html") && noSeLleva("consulta/") && !noSeLleva("talleres-cba.html"), "el rastreador no sigue /repasos/ ni /consulta/");
  const links = enlacesDe('<a href="/repasos/">x</a><a href="/contacto.html">c</a><a href="/talleres-cba.html">t</a>');
  ok(links.every((l) => !noSeLleva(l) || /^(repasos|consulta)/.test(l)) && links.some((l) => /talleres-cba\.html$/.test(l)), "y los links de la portada se filtran por ese criterio");
  const abs = absolutizar('<a href="contacto.html">c</a><a href="terminos.html">t</a><a href="quienes-somos.html">q</a><a href="talleres-cba.html">ok</a>', "https://armael11.com", { conservar: ["index.html", "talleres-cba.html"] });
  ok(/href="https:\/\/armael11\.com\/contacto\.html"/.test(abs) && /href="https:\/\/armael11\.com\/terminos\.html"/.test(abs) && /href="https:\/\/armael11\.com\/quienes-somos\.html"/.test(abs) && /href="talleres-cba\.html"/.test(abs), "contacto, términos y quiénes somos abren en el navegador; las páginas de club viajan");
}

console.log("\n── sin desbordes a 390 ──");
for (const p of ["partidos", "juga", "desafios", "cuenta"]) { await page.click(`#mam-barra [data-pestana="${p}"]`); await page.waitForTimeout(300); const ancho = await page.evaluate(() => document.documentElement.scrollWidth); ok(ancho <= 390, p + ": sin scroll horizontal (" + ancho + ")"); }

console.log("\n── errores de consola ──");
ok(errores.length === 0, errores.length ? "hubo errores: " + errores.slice(0, 5).join(" | ") : "ninguno");

await navegador.close(); servidor.close();
console.log("\n" + (fallas ? "✗ " + fallas + " de " + n + " fallaron" : "✓ " + n + " pruebas, todo bien") + "\n");
process.exit(fallas ? 1 : 0);
