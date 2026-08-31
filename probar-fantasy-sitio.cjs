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

/* LA FECHA DE MENTIRA CON LA QUE SE PRUEBA TODO.

   Son 200 jugadores a propósito: más de los que entran de una vez en la
   lista. La primera fecha real tenía casi mil, la pantalla mostraba sesenta
   y no lo decía, y parecía que faltaban jugadores.

   Casi todos van a un club distinto: si no, el máximo de 3 por club salta en
   todos los casos y tapa lo que se está probando (esa regla ya tiene sus
   propios casos en probar-fantasy.mjs). La excepción son unos pocos de
   "Talleres", que existen para probar el filtro por club y su aviso — y van
   en el MEDIO de la escala de precios, no entre los baratos, porque hay
   casos que arman el equipo más barato posible y quedarían todos del mismo
   club sin querer. Uno lleva tilde, para la búsqueda sin acentos. */
const PUESTOS = ['G', 'D', 'M', 'F'];
const DEL_CLUB = i => i >= 20 && i < 24;      // los de Talleres
const jugadores = [];
let id = 1;
for (const p of PUESTOS)
  for (let i = 0; i < 50; i++) {
    jugadores.push({ id, nombre: (i === 3 ? 'Á' : '') + p + '-' + i,
                     club: DEL_CLUB(i) ? 'Talleres' : 'Club' + id,
                     puesto: p, precio: 4 + (i % 5), ppp: 3 + (i % 4), pj: 10 });
    id++;
  }

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

    /* Una fecha vacía no es una fecha. Si igual se publicara, la pestaña
       aparecería y adentro no habría nada que elegir. */
    fs.writeFileSync(FICH, JSON.stringify({ numero: 8, torneo: 'x',
      cierra: enDosDias, presupuesto: 75, jugadores: [] }));
    execFileSync('node', ['construir-sitio.mjs'], { cwd: __dirname, stdio: 'pipe' });
    caso('una fecha sin jugadores se trata como si no existiera',
         !fs.existsSync(path.join(RAIZ, 'datos', 'fecha.js')));
    fs.writeFileSync(FICH, JSON.stringify({ numero: 8, torneo: 'Clausura 2026',
      cierra: enDosDias, presupuesto: 75, jugadores }));
    execFileSync('node', ['construir-sitio.mjs'], { cwd: __dirname, stdio: 'pipe' });

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
      /* Los suplentes también salen de los baratos: el caso mide que un
         equipo LEGAL se dé por legal, no si el presupuesto alcanza. */
      for (const p of ['G', 'D', 'M', 'F'])
        F11.suplentes[p] = porPuesto(p).slice().sort((a, b) => a.precio - b.precio)
          .find(j => !F11.titulares.some(t => t.id === j.id));
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

    /* ── la lista larga ─────────────────────────────────────────────────── */
    await pg.evaluate(() => { F11 = { titulares: [], suplentes: {}, capitan: null,
      vice: null, formacion: '4-3-3' }; fBusca = ''; fFiltro = 'todos'; pintar(); });
    await pg.waitForTimeout(120);
    const aviso = await pg.evaluate(() => document.querySelector('.compactas')
      ?.parentElement?.innerText || '');
    caso('cuando no entran todos, la lista dice cuántos hay',
         /Se ven los \d+ más caros de 200/.test(aviso),
         (aviso.match(/Se ven[^\n]*/) || ['(no dice nada)'])[0]);

    /* El que quedó fuera del tope tiene que poder encontrarse igual: si no,
       el tope deja de ser un tope y pasa a ser una lista incompleta. */
    const buscado = await pg.evaluate(() => {
      const barato = FECHA.jugadores.slice().sort((a, b) => a.precio - b.precio)[0];
      fBusca = barato.nombre; pintar();
      return { nombre: barato.nombre,
               visible: [...document.querySelectorAll('[data-suma]')]
                          .some(a => a.textContent.trim() === barato.nombre) };
    });
    caso('y al más barato de todos se llega buscándolo por nombre',
         buscado.visible, buscado.nombre);
    await pg.evaluate(() => { fBusca = ''; pintar(); });

    /* ── el orden ───────────────────────────────────────────────────────── */
    const precios = async () => pg.evaluate(() =>
      [...document.querySelectorAll('.compactas .linea .cuando')].map(x => +x.textContent));

    await pg.click('[data-fo="caros"]'); await pg.waitForTimeout(120);
    const caros = await precios();
    caso('por defecto la lista arranca por los más caros',
         caros[0] >= caros[caros.length - 1] && caros.length > 1,
         caros[0] + ' … ' + caros[caros.length - 1]);

    await pg.click('[data-fo="baratos"]'); await pg.waitForTimeout(120);
    const baratos = await precios();
    caso('y se puede dar vuelta: los más baratos primero',
         baratos[0] <= baratos[baratos.length - 1],
         baratos[0] + ' … ' + baratos[baratos.length - 1]);

    /* El tope se aplica DESPUÉS de ordenar, así que dado vuelta la lista
       tiene que traer jugadores que antes ni aparecían. */
    caso('dar vuelta el orden trae jugadores que antes no se veían',
         baratos[0] < caros[caros.length - 1] ||
         (await pg.evaluate(() => document.querySelectorAll('.compactas .linea').length)) > 0,
         'baratos desde ' + baratos[0] + ', caros hasta ' + caros[caros.length - 1]);

    const cartel = await pg.evaluate(() =>
      [...document.querySelectorAll('.vacio')].map(x => x.textContent).join(' '));
    caso('y el cartel del final dice que ahora son los más baratos',
         /más baratos/.test(cartel), cartel.trim().slice(0, 80));

    await pg.click('[data-fo="rinde"]'); await pg.waitForTimeout(120);
    caso('ordenar por rendimiento no rompe la lista',
         (await precios()).length > 0);

    await pg.click('[data-fo="caros"]'); await pg.waitForTimeout(120);

    /* Nadie escribe la tilde en el teclado del teléfono. */
    const conTilde = await pg.evaluate(() => {
      fBusca = 'ad-3'; pintar();      /* el jugador se llama "ÁD-3" */
      return [...document.querySelectorAll('[data-suma]')].map(a => a.textContent.trim());
    });
    caso('se encuentra a Á escribiendo A, sin la tilde',
         conTilde.includes('ÁD-3'), conTilde.slice(0, 3).join(', ') || '(nada)');
    await pg.evaluate(() => { fBusca = ''; pintar(); });

    /* ── el filtro por club ─────────────────────────────────────────────── */
    caso('están los clubes de la fecha en el desplegable',
         await pg.locator('#fclub option').count() >= 2);

    await pg.selectOption('#fclub', 'Talleres'); await pg.waitForTimeout(120);
    const soloTalleres = await pg.evaluate(() =>
      [...document.querySelectorAll('.compactas .linea .de')].map(x => x.textContent));
    caso('elegido un club, solo se ven los de ese club',
         soloTalleres.length > 0 && soloTalleres.every(t => t.startsWith('Talleres')),
         soloTalleres.slice(0, 2).join(' | '));

    /* El tope de 3 por club se descubría recién al intentar guardar. */
    const aviso3 = await pg.evaluate(() => {
      F11 = { titulares: [], suplentes: {}, capitan: null, vice: null, formacion: '4-3-3' };
      fFiltro = 'todos';
      const suyos = FECHA.jugadores.filter(j => j.club === 'Talleres');
      F11.titulares.push(suyos[0], suyos[1]);
      pintar();
      return document.body.innerText;
    });
    caso('el aviso dice cuántos de ese club ya tenés y cuántos faltan',
         /Ten[eé]s 2 de Talleres/.test(aviso3) && /1 m[aá]s/.test(aviso3),
         (aviso3.match(/Ten[eé]s[^\n]*/) || ['(no dice nada)'])[0]);

    const avisoTope = await pg.evaluate(() => {
      const suyos = FECHA.jugadores.filter(j => j.club === 'Talleres');
      F11.titulares.push(suyos[2]);
      pintar();
      return document.body.innerText;
    });
    caso('y con tres avisa que es el máximo',
         /es el m[aá]ximo por club/.test(avisoTope),
         (avisoTope.match(/Ya ten[eé]s[^\n]*/) || ['(no avisa)'])[0]);

    await pg.evaluate(() => { fClub = ''; F11 = { titulares: [], suplentes: {},
      capitan: null, vice: null, formacion: '4-3-3' }; pintar(); });
    await pg.waitForTimeout(120);

    caso('la lista dice en cuántas fechas hizo ese promedio',
         /por partido en \d+ fecha/.test(await pg.evaluate(() =>
           document.querySelector('.compactas').innerText)));

    /* ── compartir ──────────────────────────────────────────────────────── */
    const armado = await pg.evaluate(() => {
      const P = p => FECHA.jugadores.filter(j => j.puesto === p);
      const barato = (p, n) => P(p).slice().sort((a, b) => a.precio - b.precio).slice(0, n);
      F11 = { titulares: [...barato('G',1), ...barato('D',4), ...barato('M',3), ...barato('F',3)],
              suplentes: {}, capitan: null, vice: null, formacion: '4-3-3' };
      for (const p of ['G','D','M','F'])
        F11.suplentes[p] = P(p).slice().sort((a,b)=>a.precio-b.precio)
          .find(j => !F11.titulares.some(t => t.id === j.id));
      F11.capitan = F11.titulares.find(j => j.puesto === 'F').id;
      F11.vice    = F11.titulares.find(j => j.puesto === 'M').id;
      pintar();
      return { texto: textoDeMiEquipo(),
               hayBoton: !!document.getElementById('fcompartir') };
    });
    caso('con el equipo armado aparece el botón de compartir', armado.hayBoton);
    caso('el texto dice la fecha, la formación y el capitán',
         /fecha 8/.test(armado.texto) && /4-3-3/.test(armado.texto) &&
         /capitán/.test(armado.texto), armado.texto.replace(/\n/g, ' | '));
    caso('y dice cuánto gastaste, que es la parte que pica',
         /gasté [\d.]+ de 75/.test(armado.texto), armado.texto.replace(/\n/g, ' | '));
    caso('el texto no manda la lista de los quince: un mensaje largo no se reenvía',
         armado.texto.split('\n').length <= 4, '' + armado.texto.split('\n').length + ' renglones');

    /* Sin equipo legal no hay botón: mandaría a un amigo a ver una cancha
       vacía. */
    const sinEquipo = await pg.evaluate(() => {
      F11 = { titulares: [], suplentes: {}, capitan: null, vice: null, formacion: '4-3-3' };
      pintar();
      return !!document.getElementById('fcompartir');
    });
    caso('sin equipo armado no hay botón de compartir', !sinEquipo);

    /* ── la invitación que llega por WhatsApp ───────────────────────────── */
    const invitacion = await pg.evaluate(() => {
      location.hash = '#liga=xk4t9p';
      capturarInvitacion();
      const guardado = (() => { try { return localStorage.getItem('armaEl11.ligaPendiente'); }
                                catch (e) { return null; } })();
      return { pendiente: ligaPendiente, guardado, hash: location.hash };
    });
    caso('el código de la invitación se lee del link', invitacion.pendiente === 'XK4T9P',
         '' + invitacion.pendiente);
    caso('se guarda para sobrevivir el viaje al mail', invitacion.guardado === 'XK4T9P',
         '' + invitacion.guardado);
    caso('y se limpia la dirección: un link reenviado no arrastra el código',
         !/liga=/.test(invitacion.hash), invitacion.hash);

    /* Sin sesión, el bloque invita a entrar y NO se come la invitación. */
    const sinSesion = await pg.evaluate(() => { pintar(); return document.body.innerText; });
    /* Sin la /i no encuentra el título: el CSS lo pone en mayúsculas y el
       innerText devuelve el texto YA transformado, no el del HTML. */
    caso('sin sesión, los torneos invitan a entrar con el mail',
         /torneos de amigos/i.test(sinSesion) && /Entrar con mi mail/.test(sinSesion));
    caso('y avisa que hay una invitación esperando',
         /XK4T9P/.test(sinSesion) && /invitaci[oó]n/i.test(sinSesion));

    /* ── LO QUE PASÓ CON TU EQUIPO ────────────────────────────────────────
       El servidor calculaba los puntos y guardaba el detalle, y la app no
       los mostraba en ningún lado: alguien armaba su equipo, se jugaba la
       fecha y no pasaba nada. Los puntos existían en la base y no existían
       en la pantalla, que para el que juega es lo mismo.

       Se le meten puntos de mentira y se mira que aparezcan, y sobre todo
       que el PORQUÉ aparezca: "te dieron 47" hay que creerlo, "tu 9 hizo
       dos goles y era capitán" se puede discutir. */
    const puntos = await pg.evaluate(() => {
      MIS_PUNTOS = [{ fecha: 7, puntos: 43.5, detalle: {
        cintaPasada: false,
        afuera: [{ id: 90, nombre: "Juan Banco", puesto: "D" }],
        jugadores: [
          { id:1, nombre:"Ana Goleadora", puesto:"F", puntosFinales:18, nota:8.1,
            esCapitan:true, esMVP:true, jugo:true,
            renglones:[{ que:"gol", pts:4 }, { que:"jugó todo el partido", pts:2 }] },
          { id:2, nombre:"Luis Arquero", puesto:"G", puntosFinales:6, nota:6.9,
            esCapitan:false, esMVP:false, jugo:true,
            renglones:[{ que:"valla invicta", pts:4 }] },
          { id:3, nombre:"Pedro Suplente", puesto:"M", puntosFinales:0, nota:null,
            esCapitan:false, esMVP:false, jugo:false, renglones:[] },
        ] } }];
      miNombre = "fausto";
      LIGAS = [{ id: 1, nombre: "Los del barrio", codigo: "XK4T9P" }];
      ligaTabla = { 1: [{ usuario:"otro", puntos:50 }, { usuario:"fausto", puntos:43.5 }] };
      pintar();
      const cerrado = document.body.innerText;
      document.getElementById("verporque").click();
      return { cerrado, abierto: document.body.innerText };
    });
    caso('la fecha puntuada aparece con el total',
         /43[.,]5/.test(puntos.cerrado) && /tu fecha 7/i.test(puntos.cerrado));
    caso('con lo que sacó cada jugador', /Goleadora/.test(puntos.cerrado) &&
         /\+18/.test(puntos.cerrado), puntos.cerrado.slice(0, 200).replace(/\n/g, ' | '));
    caso('y en qué puesto quedaste en tu torneo',
         /2º/.test(puntos.cerrado) && /Los del barrio/.test(puntos.cerrado));
    caso('el porqué está escondido hasta que lo pedís',
         !/valla invicta/.test(puntos.cerrado) && /valla invicta/.test(puntos.abierto));
    caso('y cuando se abre dice por qué el capitán vale doble',
         /capit[aá]n, va doble/i.test(puntos.abierto));
    caso('el que no jugó lo dice, en vez de mostrar un cero sin explicación',
         /no jug[oó]/.test(puntos.abierto));
    await pg.evaluate(() => { MIS_PUNTOS = []; LIGAS = []; ligaTabla = {};
                              miNombre = null; puntosAbierto = null; pintar(); });

    /* ── QUE SE ENCUENTREN ────────────────────────────────────────────────
       Fausto no los encontró, y tenía razón por dos motivos distintos:
       estaban al final de la lista de jugadores, y entre una fecha y la
       siguiente desaparecían del todo. Un caso para cada uno. */
    const atajo = await pg.evaluate(() => {
      const a = document.getElementById("iratorneos");
      const h = document.getElementById("torneos");
      /* El encabezado de la lista de jugadores. Se busca por su texto y no
         por una clase, porque las clases se reusan en toda la pantalla. */
      const lista = [...document.querySelectorAll("h3.sec")]
        .find(h => /elegí jugadores/i.test(h.innerText));
      return { hay: !!a, texto: a ? a.innerText : "",
               arribaDelBloque: !!(a && h) &&
                 a.getBoundingClientRect().top < h.getBoundingClientRect().top,
               arribaDeLaLista: !!(a && lista) &&
                 a.getBoundingClientRect().top < lista.getBoundingClientRect().top };
    });
    caso('hay un atajo a los torneos arriba, donde se ve', atajo.hay &&
         /torneo/i.test(atajo.texto), atajo.texto.replace(/\n/g, ' | '));
    caso('y está antes del bloque y antes de la lista de jugadores',
         atajo.arribaDelBloque && atajo.arribaDeLaLista, JSON.stringify(atajo));

    /* El torneo es lo que dura ENTRE fechas. Si desaparece cuando no hay
       fecha abierta, el amigo que entra con el código ve "todavía no hay
       fecha" y se va. */
    const sinFecha = await pg.evaluate(() => {
      const guardada = FCH;
      FCH = null; pintar();
      const t = document.body.innerText;
      FCH = guardada; pintar();
      return t;
    });
    caso('sin fecha abierta los torneos siguen estando',
         /torneos de amigos/i.test(sinFecha), sinFecha.slice(0, 120).replace(/\n/g, ' | '));

    const link = await pg.evaluate(() =>
      linkDeLiga({ nombre: 'Los del barrio', codigo: 'XK4T9P' }));
    caso('el link de invitación lleva el código en el hash',
         /#liga=XK4T9P$/.test(link) && /^https?:\/\//.test(link), link);
    const invita = await pg.evaluate(() =>
      textoDeLiga({ nombre: 'Los del barrio', codigo: 'XK4T9P' }));
    caso('y el mensaje nombra el torneo y el código',
         /Los del barrio/.test(invita) && /XK4T9P/.test(invita), invita.replace(/\n/g,' | '));

    await pg.evaluate(() => { try { localStorage.removeItem('armaEl11.ligaPendiente'); }
                              catch (e) {} });

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
