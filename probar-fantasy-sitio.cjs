/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA PANTALLA DEL FANTASY
     node probar-fantasy-sitio.cjs

   `probar-fantasy.mjs` prueba el reglamento. Esto prueba lo otro: que una
   persona pueda armar un equipo con el dedo. Se publica una fecha de mentira
   —con jugadores y precios inventados— y se hace el recorrido completo en un
   navegador de verdad.

   Deja `fecha-actual.json` como estaba, pase lo que pase.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, 'sitio');
const CLUB = 'talleres-cba';
const FICH = path.join(__dirname, 'fecha-actual.json');
const habia = fs.existsSync(FICH) ? fs.readFileSync(FICH, 'utf8') : null;

const casos = [];
const caso = (n, ok, d = '') => casos.push([n, ok, d]);

/* Una fecha con jugadores de sobra en cada puesto y de clubes distintos,
   para que el máximo por club no tape lo que se está probando. */
const PUESTOS = ['G', 'D', 'M', 'F'];
const jugadores = [];
let id = 1;
for (const p of PUESTOS)
  for (let i = 0; i < 12; i++)
    /* Cada uno de un club distinto: si no, el máximo de 3 por club salta en
       todos los casos y tapa lo que se está probando. Esa regla ya tiene sus
       propios casos en probar-fantasy.mjs. */
    jugadores.push({ id, nombre: p + '-' + i, club: 'Club' + (id++),
                     puesto: p, precio: 4 + (i % 5), ppp: 3 + (i % 4), pj: 10 });

const enDosDias = new Date(Date.now() + 2 * 864e5).toISOString();

const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
                '.webmanifest':'application/manifest+json' };
const srv = http.createServer((q, s) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(s);
}).listen(8094);

const uno = (pg, sel) => pg.locator(sel).first();

(async () => {
  let nav;
  try {
    fs.writeFileSync(FICH, JSON.stringify({ numero: 8, torneo: 'Clausura 2026',
      cierra: enDosDias, presupuesto: 75, jugadores }));
    execFileSync('node', ['construir-sitio.mjs'], { cwd: __dirname, stdio: 'pipe' });

    caso('con una fecha publicada, el sitio incluye el reglamento',
         fs.existsSync(path.join(RAIZ, 'datos', 'fantasy.js')));

    nav = await chromium.launch();
    const pg = await nav.newPage({ viewport: { width: 430, height: 950 } });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.route('**/base.supabase.co/**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await pg.route('**/*.supabase.co/**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    await pg.goto('http://localhost:8094/' + CLUB + '.html', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(300);

    caso('aparece la pestaña del fantasy', await pg.locator('#btfantasy').isVisible());
    await pg.click('#btfantasy');
    await pg.waitForTimeout(250);

    /* ── el presupuesto ─────────────────────────────────────────────────── */
    const plataInicial = (await uno(pg, '.fplata b').innerText()).trim();
    caso('arranca con el presupuesto entero', plataInicial === '75', plataInicial);
    caso('y dice cuándo cierra',
         /cierra en/.test(await uno(pg, '.fcab .fsub').innerText()));

    /* ── sumar jugadores ────────────────────────────────────────────────── */
    const sumarUno = async () => { await uno(pg, '[data-suma]').click(); await pg.waitForTimeout(60); };
    await sumarUno();
    caso('al tocar un jugador entra a la cancha', await pg.locator('.fjug').count() === 1);
    const plata1 = parseFloat(await uno(pg, '.fplata b').innerText());
    caso('y el presupuesto baja', plata1 < 75, "quedó " + plata1);

    caso('el primero que entra queda de capitán',
         (await uno(pg, '.fjug .fcam').innerText()).trim().startsWith('C'));

    /* ── la formación ───────────────────────────────────────────────────── */
    caso('están las siete formaciones para elegir',
         await pg.locator('[data-form]').count() === 7);
    const huecosEn = async f => {
      await pg.click(`[data-form="${f}"]`); await pg.waitForTimeout(120);
      return pg.evaluate(() => {
        const n = {};
        for (const b of document.querySelectorAll('.fvacio'))
          n[b.dataset.puesto] = (n[b.dataset.puesto] || 0) + 1;
        return n;
      });
    };
    const h433 = await huecosEn('4-3-3');
    caso('en 4-3-3 la cancha pide 4 defensores, 3 medios y 3 delanteros',
         h433.D === 4 && h433.M === 3 && h433.F === 3, JSON.stringify(h433));
    const h352 = await huecosEn('3-5-2');
    caso('y en 3-5-2 pide 3, 5 y 2',
         h352.D === 3 && h352.M === 5 && h352.F === 2, JSON.stringify(h352));

    /* Cambiar de formación no puede borrar el equipo sin avisar. */
    const bump = await pg.evaluate(() => {
      const P = p => FECHA.jugadores.filter(j => j.puesto === p);
      F11 = { titulares: [...P('G').slice(0,1), ...P('D').slice(0,5), ...P('M').slice(0,3),
                          ...P('F').slice(0,2)],
              suplentes: {}, capitan: P('F')[0].id, vice: null, formacion: '5-3-2' };
      pintar();
      const antes = F11.titulares.filter(j => j.puesto === 'D').length;
      cambiarFormacion('4-3-3');
      return { antes, despues: F11.titulares.filter(j => j.puesto === 'D').length, aviso: fAviso };
    });
    caso('al pasar de 5-3-2 a 4-3-3, el defensor que sobra sale',
         bump.antes === 5 && bump.despues === 4, JSON.stringify(bump));
    caso('y se avisa quién salió, no desaparece en silencio',
         /no entran/i.test(bump.aviso || ''), bump.aviso);

    /* ── armar los quince ───────────────────────────────────────────────── */
    const armar = await pg.evaluate(() => {
      /* Se arma desde adentro para no depender de sesenta toques: lo que
         importa es que las MISMAS funciones de la pantalla acepten un
         equipo legal. */
      F11 = { titulares: [], suplentes: {}, capitan: null, vice: null, formacion: '4-4-2' };
      const porPuesto = p => FECHA.jugadores.filter(j => j.puesto === p);
      const barato = (p, n) => porPuesto(p).slice().sort((a, b) => a.precio - b.precio).slice(0, n);
      F11.formacion = '4-4-2';
      for (const j of [...barato('G', 1), ...barato('D', 4), ...barato('M', 4), ...barato('F', 2)])
        F11.titulares.push(j);
      for (const p of ['G', 'D', 'M', 'F']) F11.suplentes[p] = porPuesto(p).slice(-1)[0];
      F11.capitan = F11.titulares.find(j => j.puesto === 'F').id;
      F11.vice = F11.titulares.find(j => j.puesto === 'M').id;
      pintar();
      return { fichas: F11.titulares.length + Object.keys(F11.suplentes).length };
    });
    caso('quince fichas: once y cuatro', armar.fichas === 15, "" + armar.fichas);

    const rev = await pg.evaluate(() => revisarEquipo(
      { titulares: F11.titulares, suplentes: F11.suplentes, capitan: F11.capitan,
        vice: F11.vice, formacion: F11.formacion },
      new Map(FECHA.jugadores.map(j => [j.id, j.precio]))));
    caso('la pantalla lo da por legal', rev.ok, rev.problemas.join(' | '));
    caso('y el botón de guardar se habilita',
         await pg.locator('#fguardar:not([disabled])').count() === 1);

    /* ── lo que NO debe dejar pasar ─────────────────────────────────────── */
    const caro = await pg.evaluate(() => {
      const caros = FECHA.jugadores.slice().sort((a, b) => b.precio - a.precio);
      F11.titulares = F11.titulares.map((j, i) =>
        caros.find(c => c.puesto === j.puesto && !F11.titulares.some(t => t.id === c.id)) || j);
      pintar();
      return revisarEquipo({ titulares: F11.titulares, suplentes: F11.suplentes,
        capitan: F11.capitan, vice: F11.vice, formacion: F11.formacion },
        new Map(FECHA.jugadores.map(j => [j.id, j.precio])));
    });
    caso('pasarse de presupuesto no deja guardar',
         !caro.ok || (await pg.locator('#fguardar[disabled]').count() === 1),
         caro.problemas.join(' | '));

    /* ── la fecha cerrada ───────────────────────────────────────────────── */
    await pg.evaluate(() => { FECHA.cierra = "2020-01-01T00:00:00Z"; pintar(); });
    caso('con la fecha cerrada, el botón lo dice y no deja guardar',
         /cerr/i.test(await uno(pg, '#fguardar').innerText()) &&
         await pg.locator('#fguardar[disabled]').count() === 1,
         await uno(pg, '#fguardar').innerText());

    caso('sin errores de JavaScript en todo el recorrido', errs.length === 0, errs.join(' | '));

  } catch (e) {
    caso('la prueba llegó hasta el final', false, e.message);
  } finally {
    if (habia === null) { try { fs.unlinkSync(FICH); } catch (e) {} }
    else fs.writeFileSync(FICH, habia);
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
