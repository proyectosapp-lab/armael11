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
    caso('y el feed se pintó igual', await pg.locator('.tarjeta.portada').count() === 1);
    caso('sin haberle pedido nada al backend todavía', llamados.length === 0, llamados.join(' | '));

    /* ── 2. pedir el link ───────────────────────────────────────────────── */
    await pg.click('#bcuenta');
    caso('el panel se abre y pide un mail', await pg.locator('#cmail').count() === 1);
    await pg.fill('#cmail', 'Fausto@Ejemplo.com');
    await pg.click('#cenviar');
    await pg.waitForTimeout(300);
    caso('pide el link al backend', llamados.some(l => /POST \/auth\/v1\/otp/.test(l)),
         llamados.join(' | '));
    caso('y avisa que revise el mail',
         /Listo/i.test(await pg.locator('#cuenta h4').innerText()));

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
