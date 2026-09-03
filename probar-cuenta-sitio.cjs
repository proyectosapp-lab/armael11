/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA CUENTA, EN EL NAVEGADOR
     node probar-cuenta-sitio.cjs

   `probar-cuentas.mjs` prueba que le pidamos lo correcto al servidor.
   Esto prueba lo otro: que una persona pueda entrar. Arma el sitio con un
   backend de mentira, abre la página en un navegador de verdad y hace el
   recorrido completo —mail, link, nombre de usuario— con la red interceptada.

   Es el único camino de la app donde alguien pone algo suyo. Si se rompe, no
   se rompe una pantalla: se rompe la puerta.

   Toca `sitio.json` para la prueba y lo deja como estaba, pase lo que pase.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, 'sitio');
const CLUB = 'talleres-cba';
const CFG  = path.join(__dirname, 'sitio.json');
const original = fs.readFileSync(CFG, 'utf8');

const casos = [];
const caso = (nom, ok, det = '') => casos.push([nom, ok, det]);

/* Un token como los de verdad: tres partes y el uid en el medio. */
const UID = '11111111-2222-3333-4444-555555555555';
const TOKEN = 'x.' + Buffer.from(JSON.stringify({ sub: UID }))
  .toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.y';

const TIPOS = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
                '.webmanifest':'application/manifest+json' };
const srv = http.createServer((q, s) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(s);
}).listen(8097);

(async () => {
  let nav;
  try {
    const cfg = JSON.parse(original);
    cfg.supabase = { url: 'https://base.supabase.co', anon: 'eyJ-de-mentira' };
    fs.writeFileSync(CFG, JSON.stringify(cfg, null, 1));
    execFileSync('node', ['construir-sitio.mjs'], { cwd: __dirname, stdio: 'pipe' });

    caso('con el backend configurado, el sitio incluye las cuentas',
         fs.existsSync(path.join(RAIZ, 'datos', 'cuentas.js')));
    caso('y la clave de servidor no aparece en ninguna página',
         !fs.readFileSync(path.join(RAIZ, CLUB + '.html'), 'utf8').includes('service_role'));

    nav = await chromium.launch();
    const pg = await nav.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));

    /* La red del backend, interceptada. Cada pedido queda anotado. */
    const llamados = [];
    let tieneUsuario = false;
    await pg.route('**/base.supabase.co/**', r => {
      const u = r.request().url(), m = r.request().method();
      llamados.push(m + ' ' + u.replace('https://base.supabase.co', ''));
      let cuerpo = [];
      if (/\/auth\/v1\/otp/.test(u)) cuerpo = {};
      else if (/\/rest\/v1\/perfil/.test(u) && m === 'GET')
        cuerpo = tieneUsuario ? [{ usuario: 'fausto_10' }] : [];
      else if (/\/rest\/v1\/perfil/.test(u) && m === 'POST') { tieneUsuario = true; cuerpo = {}; }
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) });
    });

    /* ── 1. sin entrar ──────────────────────────────────────────────────── */
    await pg.goto('http://localhost:8097/' + CLUB + '.html', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(250);
    caso('el botón de la cuenta aparece', await pg.locator('#bcuenta').isVisible());
    caso('pero el panel arranca cerrado: nadie vino a registrarse',
         await pg.locator('#cuenta').isHidden());
    /* La app abre en el simulador; el feed está a una pestaña de distancia.
       Lo que importa acá es que la cuenta no rompió nada del resto. */
    await pg.click('#barra button[data-tab="feed"]');
    await pg.waitForTimeout(250);
    caso('y el feed se pintó igual', await pg.locator('.tarjeta.portada').count() === 1);
    await pg.click('#barra button[data-tab="juego"]');
    await pg.waitForTimeout(150);
    /* ── QUÉ SE LE PUEDE PEDIR AL BACKEND ANTES DE QUE ALGUIEN TOQUE NADA ──
       Antes acá decía "nada", y estaba bien mientras los precios solo se
       veían con la cuenta abierta. Cambió a propósito: el que prueba la app
       tiene que ver los precios ANTES de registrarse -un precio que aparece
       recién el día que empieza a cobrarse se lee como una trampa-, así que
       la lista de planes se pide al abrir.

       Esa lista es pública y no dice nada de nadie: va con la clave pública,
       no lleva sesión y solo devuelve nombres y precios. Lo que se sigue
       exigiendo es lo que de verdad importaba: que no se pida NADA SOBRE LA
       PERSONA -su perfil, su equipo, su cupo, su premium- ni se escriba nada
       antes de que la persona haga algo. */
    const sobreLaPersona = llamados.filter(x => !/GET \/functions\/v1\/crear-pago/.test(x));
    caso('sin pedirle al backend nada sobre la persona todavía',
         sobreLaPersona.length === 0, sobreLaPersona.join(' | '));
    caso('lo único que se pide al abrir es la lista pública de precios',
         llamados.every(x => /GET \/functions\/v1\/crear-pago/.test(x)), llamados.join(' | '));

    /* ── 2. CREAR CUENTA Y ENTRAR ───────────────────────────────────────
       El link por mail dejó de ser el camino principal, y no fue un
       capricho: falla de dos maneras que no dependen de nosotros. Supabase
       solo redirige a las direcciones de su lista blanca —si la de destino
       no está, manda a otra página sin sesión y sin error— y en el teléfono
       el link abre el navegador INTERNO del correo, donde la sesión queda
       encerrada. La contraseña no sale de esta pantalla. */
    await pg.click('#bcuenta');
    caso('el panel arranca ofreciendo crear la cuenta',
         await pg.locator('#cmail').count() === 1 &&
         await pg.locator('#cclave').count() === 1 &&
         /cre[aá]/i.test(await pg.locator('#cuenta h4').innerText()),
         await pg.locator('#cuenta h4').innerText());

    /* Una contraseña corta la rechaza la pantalla, sin ir al servidor: el
       viaje de ida y vuelta para escuchar lo mismo es tiempo regalado. */
    await pg.fill('#cmail', 'Fausto@Ejemplo.com');
    await pg.fill('#cclave', '123');
    await pg.click('#centrar');
    await pg.waitForTimeout(200);
    caso('una contraseña corta se rechaza sin molestar al servidor',
         !llamados.some(l => /signup/.test(l)) &&
         /caracteres/i.test(await pg.locator('#cuenta .aviso.mal').first().innerText()),
         llamados.join(' | '));

    caso('se puede cambiar a "ya tengo cuenta" sin volver a escribir el mail',
         await pg.evaluate(() => {
           document.getElementById('cotro').click();
           return (document.getElementById('cmail') || {}).value;
         }) === 'Fausto@Ejemplo.com');
    await pg.evaluate(() => document.getElementById('cotro').click());

    llamados.length = 0;
    await pg.fill('#cclave', 'unaclavelarga');
    await pg.click('#centrar');
    await pg.waitForTimeout(300);
    caso('con una contraseña válida se crea la cuenta contra el backend',
         llamados.some(l => /POST \/auth\/v1\/signup/.test(l)), llamados.join(' | '));

    /* El link por mail sigue estando, para el que se olvidó la contraseña.
       Y antes de pedirlo se anota de dónde salió: si Supabase manda a la
       persona a la portada, el rescate de allá la devuelve a su club. */
    llamados.length = 0;
    await pg.evaluate(() => { salir(); miNombre = null; creandoCuenta = false;
                              cuentaAbierta = true; pintarCuenta(); });
    await pg.fill('#cmail', 'Fausto@Ejemplo.com');
    await pg.click('#clink');
    await pg.waitForTimeout(300);
    caso('el link por mail sigue disponible', llamados.some(l => /POST \/auth\/v1\/otp/.test(l)),
         llamados.join(' | '));
    caso('y deja anotado de qué página salió, para volver ahí',
         await pg.evaluate(() => { try { return localStorage.getItem('armaEl11.volviendoDe'); }
                                   catch (e) { return null; } }) === '/' + CLUB + '.html',
         await pg.evaluate(() => { try { return localStorage.getItem('armaEl11.volviendoDe'); }
                                   catch (e) { return 'no pude leer'; } }));
    caso('y avisa que revise el mail',
         /Listo/i.test(await pg.locator('#cuenta h4').innerText()));

    /* ── EL RESCATE DE LA PORTADA ───────────────────────────────────────
       El caso que nos costó un día: Supabase solo redirige a las
       direcciones de su lista blanca. Si la de destino no está, manda a la
       Site URL, que es la portada — y la portada no leía el token. Llegaba
       la sesión, no la agarraba nadie, y la persona terminaba en la lista
       de clubes sin sesión y sin ningún error. "El link no anda."

       Ahora la portada lo rescata y devuelve a la persona a su club. */
    {
      const p2 = await nav.newPage({ viewport: { width: 420, height: 900 } });
      await p2.route('**/base.supabase.co/**', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await p2.goto('http://localhost:8097/index.html');
      await p2.evaluate(c => { try { localStorage.clear();
        localStorage.setItem('armaEl11.volviendoDe', '/' + c + '.html'); } catch (e) {} }, CLUB);
      /* Hay que salir de la página primero: navegar a la MISMA dirección
         cambiando solo el `#` no recarga nada, y el rescate no correría.
         Es la misma trampa que está anotada más abajo, y caí igual. */
      await p2.goto('about:blank');
      await p2.goto('http://localhost:8097/index.html#access_token=' + TOKEN +
                    '&refresh_token=RRR&type=magiclink', { waitUntil: 'networkidle' });
      await p2.waitForTimeout(600);
      const donde = new URL(p2.url()).pathname;
      const ses = await p2.evaluate(() => { try { return localStorage.getItem('tste.sesion'); }
                                            catch (e) { return null; } });
      caso('si el link cae en la portada, la sesión se rescata igual',
           !!ses && JSON.parse(ses).uid === UID, ses ? ses.slice(0, 60) : 'sin sesión');
      caso('y devuelve a la persona a la página de su club',
           donde === '/' + CLUB + '.html', donde);
      await p2.close();
    }

    /* ── 3. volver del mail ─────────────────────────────────────────────── */
    /* Hay que salir de la página primero. Si se navega a la MISMA dirección
       cambiando solo el `#`, el navegador no recarga: cambia el hash y ya,
       así que el arranque de la cuenta no vuelve a correr y la prueba mide
       otra cosa. En la vida real se llega desde el mail, que sí es una carga
       entera. Esto imita eso.                                             */
    await pg.goto('about:blank');
    await pg.goto('http://localhost:8097/' + CLUB + '.html#access_token=' + TOKEN +
                  '&refresh_token=RRR&type=magiclink', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);
    caso('al volver, la sesión se toma del link',
         await pg.locator('#cuenta').isVisible());
    caso('y el hash se BORRA (si no, la sesión viaja en el próximo reenvío)',
         await pg.evaluate(() => location.hash) === '',
         await pg.evaluate(() => location.hash));
    caso('la primera vez pide elegir un nombre de usuario',
         await pg.locator('#cuser').count() === 1);

    /* ── 4. elegir usuario ──────────────────────────────────────────────── */
    await pg.fill('#cuser', 'fausto_10');
    await pg.click('#cguardar');
    await pg.waitForTimeout(300);
    caso('el usuario se guarda en el backend',
         llamados.some(l => /POST \/rest\/v1\/perfil/.test(l)), llamados.join(' | '));
    caso('el panel se cierra solo: ya está, a jugar',
         await pg.locator('#cuenta').isHidden());
    caso('y el botón queda con su inicial',
         (await pg.locator('#bcuenta').innerText()).trim() === 'F');

    /* ── 5. la sesión sobrevive a recargar ──────────────────────────────── */
    await pg.goto('http://localhost:8097/' + CLUB + '.html', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);
    caso('al volver a abrir sigue reconociéndolo',
         (await pg.locator('#bcuenta').innerText()).trim() === 'F');

    /* ── BORRAR LA CUENTA ────────────────────────────────────────────────
       Play lo exige, pero antes que eso es lo mínimo decente: el que entregó
       su mail tiene que poder retirarlo sin escribirle a nadie. Va en dos
       toques porque no hay deshacer. */
    const borrado = await pg.evaluate(() => {
      miNombre = "fulano"; cuentaAbierta = true; borrando = false;
      pintarCuenta();
      const uno = !!document.getElementById("cborrar");
      if (uno) document.getElementById("cborrar").click();
      const dos = { confirma: !!document.getElementById("csiborrar"),
                    vuelta:   !!document.getElementById("cnoborrar"),
                    texto: document.getElementById("cuenta").innerText };
      if (dos.vuelta) document.getElementById("cnoborrar").click();
      const r = { uno, dos, cancelado: !!document.getElementById("cborrar") };
      /* Se deja el panel como estaba: los casos que siguen lo abren ellos. */
      cuentaAbierta = false; pintarCuenta();
      return r;
    });
    caso('hay un botón para borrar la cuenta', borrado.uno);
    caso('pero pide confirmación: no hay deshacer',
         borrado.dos.confirma && borrado.dos.vuelta);
    caso('y dice exactamente qué se borra',
         /mail|correo/i.test(borrado.dos.texto) && /puntajes/i.test(borrado.dos.texto),
         borrado.dos.texto.replace(/\n/g, ' | ').slice(0, 150));
    caso('y que los torneos creados siguen para los demás',
         /siguen para los dem/i.test(borrado.dos.texto));
    caso('se puede volver atrás', borrado.cancelado);

    /* ── LO QUE SE VENDE ─────────────────────────────────────────────────
       El panel dibuja los precios que le dio el servidor. Se le pasan a
       mano dos planes inventados y se mira que salgan ESOS números: si
       alguna vez alguien escribe un precio en la app, esta prueba lo
       encuentra mostrando uno que no vino de ningún lado.

       Y no se toca la red: el botón no se aprieta. Apretarlo mandaría a
       Mercado Pago, que no es algo que una prueba tenga que hacer. */
    const venta = await pg.evaluate(() => {
      const foto = { p: PLANES, pr: PREMIUM, n: miNombre, a: cuentaAbierta };
      PLANES = [{ id:"mes", meses:1, precio:1234 }, { id:"ano", meses:12, precio:9876 }];
      PREMIUM = { activo:false, hasta:null };
      miNombre = "fulano"; cuentaAbierta = true; pintarCuenta();
      const t1 = document.getElementById("cuenta").innerText;
      const botones = [...document.querySelectorAll("#cuenta [data-plan]")]
        .map(b => b.dataset.plan);

      PREMIUM = { activo:true, hasta:new Date(Date.now() + 40 * 864e5).toISOString() };
      pintarCuenta();
      const t2 = document.getElementById("cuenta").innerText;
      const sigueOfreciendo = !!document.querySelector("#cuenta [data-plan]");

      PLANES = foto.p; PREMIUM = foto.pr; miNombre = foto.n;
      cuentaAbierta = foto.a; pintarCuenta();
      return { t1, botones, t2, sigueOfreciendo };
    });
    caso('el panel ofrece los planes que dio el servidor',
         venta.botones.join(",") === "mes,ano", venta.botones.join(","));
    caso('con los precios que dio el servidor, no con unos escritos en la app',
         /1\.234/.test(venta.t1) && /9\.876/.test(venta.t1),
         venta.t1.replace(/\n/g, ' | ').slice(0, 160));
    /* Un precio sin una frase que diga qué se lleva es una lista de números.
       No importa con qué palabras esté escrito -cambió cuando entraron los
       tres planes-, importa que estén las dos cosas que se compran: más
       simulaciones y ningún aviso. */
    caso('y dice qué se compra: más simulaciones y sin avisos',
         /simulaci/i.test(venta.t1) && /aviso/i.test(venta.t1),
         venta.t1.replace(/\n/g, ' | ').slice(0, 200));
    caso('al que ya lo tiene no se le vuelve a ofrecer',
         !venta.sigueOfreciendo && /39 días|40 días/.test(venta.t2),
         venta.t2.replace(/\n/g, ' | ').slice(0, 120));

    /* ── 6. salir ───────────────────────────────────────────────────────── */
    await pg.click('#bcuenta');
    await pg.click('#csalir');
    await pg.waitForTimeout(200);
    caso('salir deja el teléfono limpio',
         await pg.evaluate(() => { try { return localStorage.getItem('tste.sesion'); }
                                   catch (e) { return 'no pude leer'; } }) === null);

    caso('sin errores de JavaScript en todo el recorrido', errs.length === 0, errs.join(' | '));

  } catch (e) {
    caso('la prueba llegó hasta el final', false, e.message);
  } finally {
    /* Pase lo que pase, sitio.json vuelve a ser el de Fausto. */
    fs.writeFileSync(CFG, original);
    try { execFileSync('node', ['construir-sitio.mjs'], { cwd: __dirname, stdio: 'pipe' }); } catch (e) {}
    if (nav) await nav.close();
    srv.close();
  }

  const linea = '─'.repeat(70);
  console.log('\n' + linea);
  casos.forEach(([n, ok, d]) => console.log('  ' + (ok ? 'ok    ' : 'MAL   ') + n +
    (ok || !d ? '' : '   → ' + d)));
  console.log(linea);
  const mal = casos.filter(c => !c[1]).length;
  console.log(mal ? '\n' + mal + ' de ' + casos.length + ' casos MAL\n'
                  : '\n' + casos.length + ' de ' + casos.length + '. Todo bien.\n');
  process.exit(mal ? 1 : 0);
})();
