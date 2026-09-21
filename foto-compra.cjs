/* ══════════════════════════════════════════════════════════════════════════
   FOTO DE LA PANTALLA DE COMPRA, PARA LA REVISIÓN DE APPLE
     node foto-compra.cjs

   Apple pide, por cada suscripción, UNA CAPTURA de la pantalla donde se
   compra. Sin esa captura la suscripción se queda en "Falta metadata", y una
   suscripción en ese estado NO la devuelve StoreKit ni siquiera en sandbox:
   o sea que sin esto no se puede ni probar la compra.

   Y acá está el huevo y la gallina: la captura se pide antes de que exista
   una compilación con la pantalla adentro.

   Se resuelve dibujando la pantalla DE VERDAD. Esto abre el sitio ya armado,
   le enchufa `tienda-ios.js` tal cual viaja en el .ipa, le pone un plugin de
   Capacitor falso que devuelve los tres productos con sus precios, y saca la
   foto. No es una maqueta hecha aparte: es el mismo HTML, el mismo CSS y la
   misma función que va a correr en el iPhone. Si mañana cambia el panel,
   cambia la foto.

   Sale a 1284 × 2778, que es la medida que pide App Store Connect.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, 'sitio');
const SALIDA = process.argv[2] || path.join(__dirname, 'apple-pantalla-compra.png');

/* Los precios que se dibujan en la foto son los que están cargados en App
   Store Connect. No salen de ningún lado del proyecto -en la app los pone
   StoreKit- así que acá van escritos, y es el único lugar donde pasa: una
   foto es una foto, no una pantalla que cobre. */
const PRECIOS = {
  "com.armael11.app.todas.mensual": "US$7.99",
  "com.armael11.app.tres.mensual":  "US$4.99",
  "com.armael11.app.liga.mensual":  "US$1.99",
};

const TIPOS = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
                ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml",
                ".woff":"font/woff", ".ico":"image/x-icon" };

(async () => {
  if (!fs.existsSync(RAIZ)) {
    console.log("  No está sitio/. Corré antes: node construir-sitio.mjs");
    process.exit(1);
  }

  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(RAIZ, p);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end("no");
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => servidor.listen(0, r));
  const puerto = servidor.address().port;

  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({
    viewport: { width: 428, height: 926 },   /* iPhone 14 Pro Max en puntos */
    deviceScaleFactor: 3,                     /* × 3 = 1284 × 2778 */
    isMobile: true, hasTouch: true,
  });

  /* Nada de red de terceros: ni AdSense ni Supabase. La foto tiene que
     mostrar lo que ve alguien que abre la app, no un error de red. */
  await ctx.route("**", r => {
    const u = r.request().url();
    if (u.includes("localhost") || u.startsWith("data:")) return r.continue();
    return r.abort();
  });

  /* El iPhone falso: `esNativaIos` en true y un plugin de Capacitor que
     contesta lo mismo que contestaría StoreKit. */
  await ctx.addInitScript(({ precios }) => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Purchases: {
          configure: async () => ({}),
          logIn: async () => ({}),
          logOut: async () => ({}),
          getProducts: async ({ productIdentifiers }) => ({
            products: (productIdentifiers || []).map(id => ({
              identifier: id, priceString: precios[id] || "" })) }),
        },
      },
    };
    window.esNativaIos = () => true;
  }, { precios: PRECIOS });

  const pg = await ctx.newPage();
  await pg.goto("http://localhost:" + puerto + "/index.html", { waitUntil: "domcontentloaded" });

  /* `tienda-ios.js` tal cual lo copia `empaquetar-ios.mjs`: mismo archivo,
     sin los `export`. Si esta foto sale bien, ese archivo dibuja bien. */
  await pg.addScriptTag({
    content: fs.readFileSync(path.join(__dirname, "tienda-ios.js"), "utf8")
               .replace(/^export\s+/gm, "") });

  /* Y ahora que existe, se vuelve a dibujar. */
  await pg.evaluate(() => { try { pintar(); } catch (e) {} });
  await pg.waitForFunction(() => document.querySelector("[data-ios-restaurar]") !== null,
                           null, { timeout: 15000 });
  await pg.evaluate(() => { try { pintar(); } catch (e) {} });

  /* La pantalla se lleva hasta los planes: la captura tiene que mostrar los
     precios y el botón, que es lo que el revisor busca. */
  await pg.evaluate(() => {
    const b = document.querySelector("[data-plan]");
    if (b) b.closest(".planes").scrollIntoView({ block: "center" });
  });
  await pg.waitForTimeout(600);

  await pg.screenshot({ path: SALIDA });

  const visto = await pg.evaluate(() => {
    const d = document.querySelector(".planes");
    return d ? d.textContent.replace(/\s+/g, " ").trim() : "(no hay panel)";
  });

  await navegador.close();
  servidor.close();
  console.log("  ✓ " + path.basename(SALIDA) + "  ·  1284 × 2778");
  console.log("    lo que se ve: " + visto.slice(0, 160));
})();
