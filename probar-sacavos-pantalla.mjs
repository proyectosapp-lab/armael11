// probar-sacavos-pantalla.mjs — prueba la puerta sin red: carga index.html con datos de mentira en un DOM mínimo.
// Uso: node probar-sacavos-pantalla.mjs   (necesita que docs/ tenga index.html, sacavos.js y tenis-motor.js)
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
// Los datos de prueba son una foto fija (probar-datos/tenis-hoy.fijo.js). Se corren en el tiempo para que "ahora" quede
// a la misma distancia de los partidos que cuando se sacó la foto: así las pruebas no se vencen con los días.
{
  const fijo = JSON.parse(readFileSync('probar-datos/tenis-hoy.fijo.js', 'utf8').replace(/^window\.SV_HOY = /, '').replace(/;\s*$/, ''));
  const delta = Math.round((Date.now() - Date.parse(fijo.generado)) / 60000) * 60000;
  const correr = (fecha, hora) => { const t = new Date(Date.parse(`${fecha}T${hora || '00:00'}:00Z`) + delta).toISOString(); return [t.slice(0, 10), hora ? t.slice(11, 16) : hora]; };
  for (const p of [...fijo.partidos, ...(fijo.jugados || [])]) [p.fecha, p.hora] = correr(p.fecha, p.hora);
  fijo.generado = new Date(Date.parse(fijo.generado) + delta).toISOString();
  writeFileSync('docs/datos/tenis-hoy.js', 'window.SV_HOY = ' + JSON.stringify(fijo) + ';\n');
}
let ok = 0, mal = 0;
const es = (n, c, extra) => { if (c) ok++; else { mal++; console.log('MAL:', n, extra ?? ''); } };
// los desplegables vienen cerrados: para mirar adentro, las pruebas los abren todos como haría una persona
const verTodo = (page) => page.evaluate(() => document.body.classList.remove('sv-pest-partidos', 'sv-pest-juegos', 'sv-pest-resultados'));
const abrirTodo = async (page) => { await verTodo(page); for (let i = 0; i < 6; i++) { const cerrados = page.locator('.sv-grupo-cab[aria-expanded="false"]'); if (!(await cerrados.count())) break; await cerrados.first().click(); await page.waitForTimeout(60); } };
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('https://')) return r.abort(); r.continue(); });
const errores = []; pg.on('pageerror', (e) => errores.push(String(e)));
await pg.goto('file://' + process.cwd() + '/docs/index.html'); await pg.waitForTimeout(400);
es('sin errores de JS', errores.length === 0);
// ── las pestañas de arriba ──
{
  const t = await pg.locator('#sv-pestanas [data-pestana]').allInnerTexts();
  es('arriba hay tres pestañas: Partidos, Juegos, Resultados', t.join('|') === 'Partidos|Juegos|Resultados');
  es('arranca en Partidos: se ve la puerta y la semana, no los juegos ni los jugados', await pg.locator('#sv-puerta').isVisible() && await pg.locator('#sv-lista').isVisible() && !(await pg.locator('#sv-juga').isVisible()) && !(await pg.locator('#sv-jugados').isVisible()));
  await pg.click('#sv-pestanas [data-pestana="juegos"]'); await pg.waitForTimeout(100);
  es('Juegos: se ven los juegos y nada más', await pg.locator('#sv-juga').isVisible() && !(await pg.locator('#sv-puerta').isVisible()) && !(await pg.locator('#sv-lista').isVisible()) && !(await pg.locator('#sv-jugados').isVisible()) && (await pg.getAttribute('#sv-pestanas [data-pestana="juegos"]', 'aria-selected')) === 'true');
  await pg.click('#sv-pestanas [data-pestana="resultados"]'); await pg.waitForTimeout(100);
  es('Resultados: los jugados y "Está medido", sin la semana', await pg.locator('#sv-jugados').isVisible() && await pg.locator('#sv-medido').isVisible() && !(await pg.locator('#sv-lista').isVisible()) && !(await pg.locator('#sv-juga').isVisible()));
  es('la cuenta está en todas las pestañas', await pg.locator('#sv-cuenta').isVisible());
  await pg.click('#sv-pestanas [data-pestana="partidos"]'); await pg.waitForTimeout(100);
  es('volver a Partidos', await pg.locator('#sv-lista').isVisible());
}
await verTodo(pg);
// ── la lista por día y torneo, cerrada ──
{
  const cabs = await pg.locator('#sv-lista .sv-grupo-cab').count(), abiertos = await pg.locator('#sv-lista .sv-grupo-cab[aria-expanded="true"]').count();
  es('la semana viene por torneo, con todo cerrado salvo el torneo del partido de la puerta', cabs >= 2 && abiertos === 1);
  es('la cabecera de cada torneo dice superficie, cuántos partidos y desde qué hora', /dura · \d+ partidos · desde las \d\d:\d\d/.test(await pg.innerText('#sv-lista')));
  es('los días dicen cuántos partidos traen', /(hoy|mañana|[a-zé]+ \d+) · \d+ partidos?/.test(await pg.innerText('#sv-lista .sv-dia')));
  es('los jugados vienen cerrados y la cabecera cuenta verdes, grises y naranjas', (await pg.locator('#sv-jugados .sv-grupo-cab[aria-expanded="true"]').count()) === 0 && (await pg.locator('#sv-jugados .sv-grupo-cab .sv-bola').count()) > 0 && (await pg.locator('#sv-jugados .sv-jugado').count()) === 0);
  const cerrado = pg.locator('#sv-jugados .sv-grupo-cab').first(); await cerrado.click(); await pg.waitForTimeout(100);
  es('tocar la cabecera abre el torneo', (await pg.locator('#sv-jugados .sv-jugado').count()) > 0);
  await cerrado.click(); await pg.waitForTimeout(100);
  es('tocar de nuevo lo cierra', (await pg.locator('#sv-jugados .sv-jugado').count()) === 0);
}
await abrirTodo(pg);
es('la puerta se ve', await pg.locator('#sv-puerta').isVisible());
const p1 = () => pg.innerText('#sv-p1').then((t) => Number(t.replace('%', '')));
const antes = await p1();
es('probabilidad entre 1 y 99', antes > 0 && antes < 100);
const lista = JSON.parse(readFileSync('docs/datos/tenis-hoy.js', 'utf8').replace(/^window\.SV_HOY = /, '').replace(/;\s*$/, ''));
const ahora = Date.now() - 3 * 3600000;
const primero = lista.partidos.filter((p) => !p.sinDatos && ahora - Date.parse(p.fecha + 'T' + p.hora + ':00Z') < (p.enJuego ? 8 : 3) * 3600000).sort((x, y) => (x.fecha + x.hora).localeCompare(y.fecha + y.hora))[0];
es('un partido que empezó hace más de 6 h sin resultado no se ofrece', !(await pg.locator('.sv-fila[data-k="' + lista.partidos[0].k + '"]').count()));
es('los jugados se ven con marcador y tie-break', /6-7\(3\)/.test(await pg.innerText('#sv-jugados')));
es('el saque esperado contra el real, con veredicto', /60% con su saque \(esperaba 65%\)/.test(await pg.innerText('#sv-jugados')) && /sacó peor de lo esperado y Basilashvili mejor/.test(await pg.innerText('#sv-jugados')) && /Duckworth perdió sacando 5 puntos peor/.test(await pg.innerText('#sv-jugados')) && /Los dos sacaron como se esperaba/.test(await pg.innerText('#sv-jugados')));
const filasJug = (await pg.locator('.sv-jugado').allInnerTexts()).join('\n');
es('un 52-48 que gana el 48 es parejo, no sorpresa', /Kecmanovic[\s\S]*?parejo/.test(filasJug) && !/sorpresa/.test(filasJug));
{
  const porques = await pg.locator('.sv-porque').allInnerTexts();
  const conP = (lista.jugados || []).filter((j) => j.p != null).length;
  es('cada jugado con pronóstico dice por qué tiene ese color', porques.length === conP && porques.every((x) => /El modelo le daba \d+% a /.test(x)));
  es('el 52-48 que ganó el de 48 lo explica: parejo, cualquiera podía ganar', porques.some((x) => /^Parejo\. El modelo le daba 52% a Kecmanovic y ganó Basilashvili/.test(x)));
  es('el favorito que ganó lo dice', porques.some((x) => /^Ganó el favorito\. El modelo le daba 60% a Shapovalov/.test(x)));
  es('el color del porqué es el mismo que el de la fila', await pg.evaluate(() => [...document.querySelectorAll('.sv-porque')].every((d) => { const f = d.previousElementSibling; const i = f && f.querySelector('.res i'); return i && ['pv', 'pg', 'pn'].some((c) => i.classList.contains(c) && d.querySelector('.sv-bola').classList.contains(c)); })));
}
{
  es('la leyenda viene plegada: solo los tres puntitos con su cuenta', !(await pg.locator('#sv-leyenda').evaluate((d) => d.open)) && /¿Qué son los colores\?/.test(await pg.innerText('#sv-leyenda')) && !/Verde:/.test(await pg.innerText('#sv-leyenda')));
  await pg.click('#sv-leyenda summary'); await pg.waitForTimeout(100);
  const ley = await pg.innerText('#sv-leyenda');
  es('abierta, explica los tres puntitos', /Verde:/.test(ley) && /Gris:/.test(ley) && /Naranja:/.test(ley));
  const verdes = await pg.locator('.sv-jugado i.pv').count(), grises = await pg.locator('.sv-jugado i.pg').count(), naranjas = await pg.locator('.sv-jugado i.pn').count();
  const m = ley.match(/En estos días: (\d+) verdes?, (\d+) gris(?:es)? y (\d+) naranjas?/);
  es('la leyenda cuenta lo mismo que muestran las filas', m && +m[1] === verdes && +m[2] === grises && +m[3] === naranjas, m && m[0]);
}
es('la puerta parte de lo publicado', Math.abs(antes - Math.round(primero.p * 100)) <= 1);
// ── el gancho de arriba: corto ──
{
  const pgg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pgg.route('**/*', (r) => (r.request().url().startsWith('https://') ? r.abort() : r.continue()));
  await pgg.goto('file://' + process.cwd() + '/docs/index.html'); await pgg.waitForTimeout(500);
  const g = await pgg.innerText('#sv-gancho');
  es('el gancho es corto: qué es y lo medido, en menos de 30 palabras', /Simulador de resultados/.test(g) && /Medido en [\d.]+ partidos/.test(g) && !/cada 100/.test(g) && g.split(/\s+/).length <= 30);
  es('el gancho no tiene números de partidos ni atajos', !/\d+%\s*[–-]\s*\d+%/.test(g) && (await pgg.locator('#sv-gancho [data-ir]').count()) === 0);
  es('las secciones están marcadas: Próximo partido, Esta semana, y en Resultados: Resultados y Está medido', (await pgg.locator('#sv-puerta .sv-seccion').count()) === 1 && /Próximo partido|El partido que viene|En juego/i.test(await pgg.innerText('#sv-puerta .sv-seccion')) && /Esta semana/i.test(await pgg.innerText('#sv-lista .sv-seccion')) && (await pgg.locator('#sv-jugados .sv-seccion, #sv-medido .sv-seccion, #sv-cuenta .sv-seccion').count()) === 3);
  await pgg.close();
}
// ── #simular=<id>: viene de una página de consulta con ese partido ──
{
  const validos = lista.partidos.filter((p) => !p.sinDatos && ahora - Date.parse(p.fecha + 'T' + p.hora + ':00Z') < (p.enJuego ? 8 : 3) * 3600000).sort((x, y) => (x.fecha + x.hora).localeCompare(y.fecha + y.hora));
  const otro = validos.find((p) => p.k !== primero.k);
  const pgs = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; pgs.on('pageerror', (e) => errs.push(e.message));
  await pgs.route('**/*', (r) => (r.request().url().startsWith('https://') ? r.abort() : r.continue()));
  if (otro) {
    await pgs.goto('file://' + process.cwd() + '/docs/index.html#simular=' + encodeURIComponent(otro.k)); await pgs.waitForTimeout(500);
    const ap = (n) => n.split(' ').filter((x) => !/^[A-Z]\.$/.test(x)).join(' ');
    es('#simular abre ese partido en la puerta', (await pgs.innerText('#sv-puerta')).includes(ap(otro.b.nombre)));
    es('#simular se borra de la barra', (await pgs.evaluate(() => location.hash)) === '');
  }
  await pgs.goto('file://' + process.cwd() + '/docs/index.html#simular=no-existe'); await pgs.waitForTimeout(500);
  es('#simular de un partido que ya no está: la portada de siempre, sin error', errs.length === 0 && await pgs.locator('#sv-puerta').isVisible());
  const txt = await pgs.innerText('body');
  es('la portada tiene el bloque para leer y links a las páginas', /Qué es Sacá vos/.test(txt) && (await pgs.locator('a[href$="esta-medido.html"]').count()) > 0);
  es('la portada no dice cuotas', !/cuota/i.test(txt));
  await pgs.close();
}
await pg.evaluate(() => { const s = document.getElementById('sv-s1'); s.value = Number(s.value) + 3; s.dispatchEvent(new Event('input')); });
const despues = await p1();
es('tres puntos de saque mueven el partido (entre 5 y 15)', despues - antes >= 5 && despues - antes <= 15);
es('"volver a lo medido" se habilita', !(await pg.locator('#sv-volver').isDisabled()));
await pg.click('#sv-volver');
es('volver vuelve exacto', (await p1()) === antes);
await pg.click('#sv-simular'); await pg.waitForTimeout(2500);   // los sets se revelan de a uno
es('la simulación aparece', await pg.locator('#sv-simulacion').isVisible());
const sets = await pg.locator('.sv-sets').first().innerText();
es('el marcador tiene sets', /\d/.test(sets));
const resumen = await pg.locator('.sv-sim-resumen b').first().innerText();
es('el resumen coincide con la puerta', Number(resumen.replace('%', '')) === antes);
await pg.evaluate(() => { const s = document.getElementById('sv-s2'); s.value = Number(s.value) + 1; s.dispatchEvent(new Event('input')); });
es('mover la perilla esconde la simulación vieja', !(await pg.locator('#sv-simulacion').isVisible()));
const sin = await pg.locator('.sv-fila[disabled]').count();
es('los partidos sin datos no se pueden abrir', sin === lista.partidos.filter((p) => p.sinDatos && ahora - Date.parse(p.fecha + 'T' + p.hora + ':00Z') < (p.enJuego ? 8 : 3) * 3600000).length);
await pg.locator('.sv-fila:not([disabled])').nth(2).click(); await pg.waitForTimeout(200);
es('tocar otro partido cambia la puerta', (await pg.locator('.sv-fila[aria-current="true"]').count()) === 1);
es('"Está medido" se ve si hay datos', await pg.locator('#sv-medido').isVisible());
const texto = await pg.innerText('body');
for (const palabra of ['cuota', 'pick', 'fija', 'value', 'acertá', 'ganale a la casa']) es(`no dice "${palabra}"`, !new RegExp('\\b' + palabra + '\\b', 'i').test(texto.replace(/No hay cuotas ni las va a haber/, '')));
es('dice que es independiente', /independiente/.test(texto));
// ── con el cobro prendido y sin sesión: candado ──
const pg2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg2.route('**/*', (r) => {
  const u = r.request().url();
  if (/rest\/v1\/ajuste/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"valor":"si"}]' });
  if (/functions\/v1\/crear-pago/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"planes":[{"id":"sacavos","precio":2990,"meses":1,"moneda":"ARS"},{"id":"todo","precio":5990,"meses":1,"moneda":"ARS"},{"id":"liga","precio":3000}]}' });
  if (u.startsWith('https://')) return r.abort();
  r.continue();
});
await pg2.evaluate(() => { try { localStorage.removeItem('tste.sesion'); } catch (e) {} }).catch(() => {});
await pg2.goto('file://' + process.cwd() + '/docs/index.html'); await pg2.waitForTimeout(600); await abrirTodo(pg2);
const puerta2 = await pg2.innerText('#sv-puerta');
es('con cobro y sin pase: la puerta muestra el candado', /El pronóstico es del pase/.test(puerta2));
/* 12/10: en la web el candado ofrece los DOS planes que se pueden comprar desde acá.
   El que llega por un posteo de tenis tiene que ver que existe Todo. Los precios siguen
   siendo del servidor: acá se stubean como los manda crear-pago. */
es('el candado ofrece Tenis y Todo, con los precios del servidor',
   /Tenis/.test(puerta2) && /\$2\.990/.test(puerta2) && /Todo/.test(puerta2) && /\$5\.990/.test(puerta2));
es('y dice qué trae cada uno, sin prometer nada', /el circuito ATP/.test(puerta2) && /tenis, fútbol y NBA/.test(puerta2));
es('el plan Todo pide el plan "todo" al servidor, no otro',
   (await pg2.locator('#sv-puerta [data-plan="todo"]').count()) === 1 && (await pg2.locator('#sv-puerta [data-plan="sacavos"]').count()) === 1);
es('sin pase no hay perilla ni botón de simular', !(await pg2.locator('#sv-s1').count()) && !(await pg2.locator('#sv-simular').count()));
es('sin pase la semana no muestra porcentajes', !/\d+% – \d+%/.test(await pg2.innerText('#sv-lista')) && /con el pase/.test(await pg2.innerText('#sv-lista')));
es('los jugados siguen gratis, con sus pronósticos', /dijo \d+% – \d+%/.test(await pg2.innerText('#sv-jugados')));
es('"Está medido" sigue gratis', await pg2.locator('#sv-medido').isVisible());
es('la cuenta ofrece entrar', /Entrar/.test(await pg2.innerText('#sv-cuenta')));
es('con el cobro prendido y sin cuenta, arriba dice Probar gratis', (await pg2.innerText('#sv-cuenta-boton')).trim() === 'Probar gratis');
es('el candado ofrece la prueba de 3 días', /Pruébalo 3 días gratis/.test(puerta2));
es('el candado no habla de cuotas', !/cuota/i.test(puerta2));
await pg2.fill('#sv-c1 input[name=clave]', 'secreta'); await pg2.click('#sv-c1 [data-ojo]');
const tipoVisto = await pg2.getAttribute('#sv-c1 input[name=clave]', 'type'); await pg2.click('#sv-c1 [data-ojo]');
es('el ojito muestra la contraseña y la vuelve a esconder', tipoVisto === 'text' && await pg2.getAttribute('#sv-c1 input[name=clave]', 'type') === 'password' && await pg2.inputValue('#sv-c1 input[name=clave]') === 'secreta');
es('sin "vos" en la pantalla', !/\bvos\b/.test((await pg2.innerText('body')).replace(/Sacá vos/g, '')));
es('sin cuenta: la barra de abajo está, con la prueba y el botón de comprar', await pg2.locator('#sv-barra-pase').isVisible() && /3 días gratis/.test(await pg2.innerText('#sv-barra-pase')) && /Sacar el pase/.test(await pg2.innerText('#sv-barra-pase')));
await pg2.click('#sv-comprar'); await pg2.waitForTimeout(300);
es('sin cuenta: tocar comprar pide entrar y recuerda que quería el pase', /Entra o crea tu cuenta/.test(await pg2.innerText('#sv-barra-pase')) && await pg2.evaluate(() => sessionStorage.getItem('sv.quiere-pase') === '1'));
/* 12/10: sin cuenta, tocar un plan recuerda CUÁL y manda al formulario. Al entrar,
   el que eligió Todo tiene que ir al pago de Todo, no al de tenis. */
await pg2.click('#sv-puerta [data-plan="todo"]'); await pg2.waitForTimeout(150);
es('sin cuenta: tocar el plan Todo lo recuerda y pide entrar',
   (await pg2.evaluate(() => sessionStorage.getItem('sv.quiere-pase'))) === 'todo' &&
   /Entra o crea tu cuenta/.test(await pg2.innerText('#sv-puerta')));
await pg2.evaluate(() => { try { sessionStorage.removeItem('sv.quiere-pase'); } catch (e) {} });
// ── con sesión y pase: abierto ──
const pg3 = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg3.route('**/*', (r) => {
  const u = r.request().url();
  if (/rest\/v1\/ajuste/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"valor":"si"}]' });
  if (/rest\/v1\/pase/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"hasta":"2099-01-01T00:00:00Z"}]' });
  if (u.startsWith('https://')) return r.abort();
  r.continue();
});
const token = 'x.' + Buffer.from(JSON.stringify({ sub: '11111111-2222-3333-4444-555555555555', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64').replace(/=+$/, '') + '.y';
await pg3.addInitScript((t) => { try { localStorage.setItem('tste.sesion', JSON.stringify({ token: t, refresh: 'r', uid: '11111111-2222-3333-4444-555555555555' })); } catch (e) {} }, token);
await pg3.goto('file://' + process.cwd() + '/docs/index.html'); await pg3.waitForTimeout(600);
es('con pase: la puerta muestra el número', /probabilidad de ganar/.test(await pg3.innerText('#sv-puerta')) && (await pg3.locator('#sv-s1').count()) === 1);
es('con pase: la cuenta dice hasta cuándo', /Tienes el pase hasta/.test(await pg3.innerText('#sv-cuenta')));
es('con pase: el botón de arriba dice Con el pase', /Con el pase/.test(await pg3.innerText('#sv-cuenta-boton')));
es('con pase: no hay barra de comprar', !(await pg3.locator('#sv-barra-pase').isVisible().catch(() => false)));
// ── con sesión, sin pase y con el cobro APAGADO: la oferta igual está en la cuenta ──
const pg4 = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg4.route('**/*', (r) => {
  const u = r.request().url();
  if (/rest\/v1\/ajuste/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"valor":"no"}]' });
  if (/rest\/v1\/pase/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (/functions\/v1\/crear-pago/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"planes":[{"id":"sacavos","precio":2990}]}' });
  if (u.startsWith('https://')) return r.abort();
  r.continue();
});
await pg4.addInitScript((t) => { try { localStorage.setItem('tste.sesion', JSON.stringify({ token: t, refresh: 'r', uid: '11111111-2222-3333-4444-555555555555' })); } catch (e) {} }, token);
await pg4.goto('file://' + process.cwd() + '/docs/index.html'); await pg4.waitForTimeout(600);
es('cobro apagado + cuenta sin pase: la puerta sigue abierta', (await pg4.locator('#sv-s1').count()) === 1);
es('cobro apagado: no hay barra (todo es gratis)', !(await pg4.locator('#sv-barra-pase').isVisible().catch(() => false)));
es('cobro apagado + cuenta sin pase: la cuenta ofrece sacar el pase con el precio', /Sacar el pase/.test(await pg4.innerText('#sv-cuenta')) && /\$2\.990/.test(await pg4.innerText('#sv-cuenta')));
// ── la prueba gratis: vigente abre todo con el contador; vencida cierra y lo dice ──
const conPrueba = async (hasta) => {
  const pgx = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pgx.route('**/*', (r) => {
    const u = r.request().url();
    if (/rest\/v1\/ajuste/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"valor":"si"}]' });
    if (/rest\/v1\/pase/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (/rpc\/mi_prueba_sacavos/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hasta) });
    if (/functions\/v1\/crear-pago/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"planes":[{"id":"sacavos","precio":2990}]}' });
    if (u.startsWith('https://')) return r.abort();
    r.continue();
  });
  await pgx.addInitScript((t) => { try { localStorage.setItem('tste.sesion', JSON.stringify({ token: t, refresh: 'r', uid: '11111111-2222-3333-4444-555555555555' })); } catch (e) {} }, token);
  await pgx.goto('file://' + process.cwd() + '/docs/index.html'); await pgx.waitForTimeout(700);
  return pgx;
};
const en = (h) => new Date(Date.now() + h * 3600000).toISOString();
const pv = await conPrueba(en(53));
es('prueba vigente: la puerta está abierta con perilla', (await pv.locator('#sv-s1').count()) === 1);
es('prueba vigente: la franja dice cuánto falta', /Prueba gratis · te quedan 2 días y [45] h/.test(await pv.innerText('#sv-barra-pase')));
es('prueba vigente: la barra ofrece comprar ya', /Sacar el pase/.test(await pv.innerText('#sv-barra-pase')));
es('prueba vigente: el botón de arriba muestra el contador', /Prueba: 2 días/.test(await pv.innerText('#sv-cuenta-boton')));
es('prueba vigente: la cuenta lo explica y ofrece el pase', /Estás en la prueba gratis/.test(await pv.innerText('#sv-cuenta')) && /Sacar el pase/.test(await pv.innerText('#sv-cuenta')));
const pve = await conPrueba(en(-1));
es('prueba vencida: la barra lo dice y ofrece comprar', /Terminó tu prueba gratis/.test(await pve.innerText('#sv-barra-pase')) && /Sacar el pase/.test(await pve.innerText('#sv-barra-pase')));
es('prueba vencida: candado que dice que terminó', /Terminó tu prueba gratis/.test(await pve.innerText('#sv-puerta')) && !(await pve.locator('#sv-s1').count()));
es('faltaTexto: horas y minutos, y null si ya pasó', await pve.evaluate(() => window.svFaltaTexto(new Date(Date.now() + 5 * 3600000 + 12 * 60000 + 5000).toISOString()) === '5 h y 12 min' && window.svFaltaTexto(new Date(Date.now() - 1000).toISOString()) === null));
// ── en juego y la ventana de 3 horas ──
const pj = await b.newPage({ viewport: { width: 390, height: 844 } });
await pj.route('**/*', (r) => (r.request().url().startsWith('https://') ? r.abort() : r.continue()));
await pj.addInitScript(() => {
  let h; const ar = (ms) => new Date(Date.now() - 3 * 3600000 - ms).toISOString();
  Object.defineProperty(window, 'SV_HOY', { configurable: true, get: () => h, set: (v) => {
    const ps = v.partidos.filter((p) => !p.sinDatos);
    const a = ps[0], c = ps[1];
    a.fecha = ar(3600000).slice(0, 10); a.hora = ar(3600000).slice(11, 16); a.enJuego = true; a.k = 'vivo1';
    c.fecha = ar(4 * 3600000).slice(0, 10); c.hora = ar(4 * 3600000).slice(11, 16); delete c.enJuego; c.k = 'viejo1';
    h = v; } });
});
await pj.goto('file://' + process.cwd() + '/docs/index.html'); await pj.waitForTimeout(600);
es('en juego: queda en la lista con la marca', /en juego/.test(await pj.innerText('.sv-fila[data-k="vivo1"]')));
es('hora pasada hace 4 horas sin resultado: sale de la lista', (await pj.locator('.sv-fila[data-k="viejo1"]').count()) === 0);
// iPhone chico (375) con la cuenta abierta: ningún campo por debajo de 16 px (iOS amplía la pantalla y no vuelve)
{
  const p375 = await b.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await p375.route('**/*', (r) => (r.request().url().startsWith('https://') ? r.abort() : r.continue()));
  await p375.goto('file://' + process.cwd() + '/docs/index.html'); await p375.waitForTimeout(500);
  const tam = await p375.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.type !== 'range' && i.type !== 'hidden').map((i) => parseFloat(getComputedStyle(i).fontSize)));
  es('a 375 de ancho, todos los campos de texto tienen 16 px o más', tam.length > 0 && tam.every((x) => x >= 16));
  es('a 375 de ancho, nada se sale de la pantalla', await p375.evaluate(() => document.documentElement.scrollWidth <= 375));
  await p375.close();
}
// ── borrar la cuenta desde adentro (Apple 5.1.1(v)) ──
{
  const pb = await b.newPage({ viewport: { width: 390, height: 844 } });
  let borro = null, cuerpo = null;
  await pb.route('**/*', (r) => {
    const u = r.request().url();
    if (/rpc\/borrar_mi_cuenta/.test(u)) { borro = r.request().headers()['authorization'] || ''; cuerpo = r.request().postData(); return r.fulfill({ status: 204, body: '' }); }
    if (/rest\/v1\/ajuste/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"valor":"si"}]' });
    if (/rest\/v1\/pase/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"hasta":"2099-01-01T00:00:00Z"}]' });
    if (u.startsWith('https://')) return r.abort();
    r.continue();
  });
  await pb.addInitScript((t) => { try { if (!sessionStorage.getItem('ya')) { sessionStorage.setItem('ya', '1'); localStorage.setItem('tste.sesion', JSON.stringify({ token: t, refresh: 'r', uid: '11111111-2222-3333-4444-555555555555' })); } } catch (e) {} }, token);
  await pb.goto('file://' + process.cwd() + '/docs/index.html'); await pb.waitForTimeout(600);
  es('borrar: con sesión la cuenta tiene "Borrar mi cuenta"', (await pb.locator('#sv-borrar').count()) === 1);
  await pb.click('#sv-borrar'); await pb.waitForTimeout(150);
  const conf = await pb.innerText('#sv-cuenta');
  es('borrar: pide confirmación y avisa que es la misma cuenta de Armá el 11', /¿Borrar tu cuenta para siempre\?/.test(conf) && /Armá el 11/.test(conf) && borro === null);
  await pb.click('#sv-no-borrar'); await pb.waitForTimeout(100);
  es('borrar: "Mejor no" vuelve atrás sin borrar', (await pb.locator('#sv-borrando').count()) === 0 && borro === null);
  await pb.click('#sv-borrar'); await pb.waitForTimeout(100); await pb.click('#sv-si-borrar'); await pb.waitForTimeout(600);
  es('borrar: llama a borrar_mi_cuenta con el token del que pidió y sin parámetros', /^Bearer x\./.test(borro || '') && (cuerpo === '{}' || cuerpo === null));
  es('borrar: cierra la sesión y lo dice', (await pb.evaluate(() => localStorage.getItem('tste.sesion'))) === 'null' || !(await pb.evaluate(() => { try { return JSON.parse(localStorage.getItem('tste.sesion')); } catch (e) { return null; } })));
  es('borrar: queda la cuenta sin entrar, con el aviso', /tu cuenta se borró/.test(await pb.innerText('#sv-cuenta')) && (await pb.locator('#sv-borrar').count()) === 0);
  await pb.close();
}
// ── la ficha del jugador (gratis) ──
{
  const pf = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pf.route('**/*', (r) => {
    const u = r.request().url();
    if (/rest\/v1\/ajuste/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"valor":"si"}]' });
    if (u.startsWith('https://')) return r.abort();
    r.continue();
  });
  await pf.goto('file://' + process.cwd() + '/docs/index.html#simular=12164722'); await pf.waitForTimeout(500);
  es('ficha: sin pase, las tarjetas de la puerta se tocan y dicen "ver ficha"', (await pf.locator('#sv-puerta button[data-ficha]').count()) === 2 && /ver ficha/.test(await pf.innerText('#sv-puerta')));
  es('ficha: la puerta muestra el cara a cara, gratis', /Se cruzaron 3 veces desde 2021: Duckworth 1 – Sonego 2/.test(await pf.innerText('#sv-puerta')));
  await pf.click('#sv-puerta button[data-ficha="1900"]'); await pf.waitForTimeout(150);
  const f = await pf.innerText('#sv-ficha');
  es('ficha: se abre con nombre, país, ranking y ganados del año', /J\. Duckworth/.test(f) && /AUS · 98 del ranking/.test(f) && /En 2026 ganó 14 de 31 partidos/.test(f));
  es('ficha: saque y devolución por superficie, últimos partidos y lo que viene', /dura\s+12 de 24\s+64%\s+36%/.test(f) && /le ganó a Fils 7-6\(4\) 6-3/.test(f) && /Lo que viene/.test(f) && /contra Sonego/.test(f));
  es('ficha: sin pronóstico adentro', !/probabilidad|\d+% – \d+%/.test(f));
  es('ficha: "Cómo juega" con los números de los últimos 12 meses', /Cómo juega/.test(f) && /aces por partido\s+7\.4/.test(f) && /break points salvados\s+62%/.test(f) && /errores no forzados\s+22\.8/.test(f));
  es('ficha: dice que esos números no los usa el modelo', /el modelo no los usa/.test(f) && !/va a ganar|probabilidad/i.test(f));
  await pf.click('#sv-ficha [data-ficha="2843"]'); await pf.waitForTimeout(150);
  es('ficha: sin esos datos, el bloque no aparece', !/Cómo juega/.test(await pf.innerText('#sv-ficha')));
  es('ficha: tocar un rival abre su ficha', /L\. Sonego/.test(await pf.innerText('#sv-ficha')) && /ITA · 44 del ranking/.test(await pf.innerText('#sv-ficha')));
  await pf.click('#sv-ficha [data-cerrar]'); await pf.waitForTimeout(100);
  es('ficha: Cerrar la cierra', await pf.locator('#sv-ficha').isHidden());
  await abrirTodo(pf);
  es('ficha: en los jugados los nombres con ficha se tocan, y sin ficha no', (await pf.locator('#sv-jugados [data-ficha="1250"]').count()) === 1 && (await pf.locator('#sv-jugados [data-ficha="7001"]').count()) === 0);
  await pf.click('#sv-jugados [data-ficha="1250"]'); await pf.waitForTimeout(150);
  es('ficha: desde los jugados también se abre', /M\. Kecmanovic/.test(await pf.innerText('#sv-ficha')));
  es('ficha: en un iPhone de 390 no se sale de la pantalla', await pf.evaluate(() => document.querySelector('#sv-ficha .sv-ficha').scrollWidth <= 390));
  await pf.goto('about:blank'); await pf.goto('file://' + process.cwd() + '/docs/index.html#simular=12164723'); await pf.waitForTimeout(500);
  es('ficha: primer cruce se dice así, y sin ficha la tarjeta no se toca', /Primer cruce entre Griekspoor y Shapovalov/.test(await pf.innerText('#sv-puerta')) && (await pf.locator('#sv-puerta button[data-ficha]').count()) === 0);
  await pf.close();
}
// ── Jugá: el Prode y el saque ──
{
  const pj = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; pj.on('pageerror', (e) => errs.push(e.message));
  await pj.route('**/*', (r) => (r.request().url().startsWith('https://') ? r.abort() : r.continue()));
  // dos elecciones de "ayer" ya guardadas: una acertada (Basilashvili, el modelo decía Kecmanovic) y una errada (Duckworth; el modelo decía Sonego)
  const ayer = lista.jugados.find((j) => j.k === 'j1').fecha;
  await pj.addInitScript((f) => { try { if (!sessionStorage.getItem('sv.ya')) { sessionStorage.setItem('sv.ya', '1'); localStorage.setItem('sv.prode', JSON.stringify({ elegidos: { j1: { g: 2, f: f, a: 'M. Kecmanovic', b: 'N. Basilashvili', t: 'Chengdu', m: 1 }, j3: { g: 1, f: f, a: 'J. Duckworth', b: 'L. Sonego', t: 'Chengdu', m: 2 } }, dias: {} })); } } catch (e) {} }, ayer);
  await pj.goto('file://' + process.cwd() + '/docs/index.html#juegos'); await pj.waitForTimeout(500);
  es('Jugá: #juegos abre la pestaña', await pj.evaluate(() => document.body.classList.contains('sv-pest-juegos')));
  es('Jugá: la sección está entre la semana y los jugados, con los dos juegos', await pj.locator('#sv-juga').isVisible() && (await pj.locator('#sv-prode').count()) === 1 && (await pj.locator('#sv-saque').count()) === 1 && await pj.evaluate(() => { const j = document.getElementById('sv-juga'); return j.previousElementSibling.id === 'sv-lista' && j.nextElementSibling.id === 'sv-jugados'; }));
  const pr = await pj.innerText('#sv-prode');
  es('Prode: liquida lo de ayer y compara con el modelo (tú 1 de 2, el modelo 1 de 2, empate)', /(ayer|hoy): tú 1 de 2 · el modelo 1 de 2\./.test(pr) && /Empate con el modelo/.test(pr));
  es('Prode: el total dice el porcentaje de los dos', /En total: tú 50% · el modelo 50% \(2 partidos\)/.test(pr));
  es('Prode: ofrece los partidos de hoy, sin ningún número', (await pj.locator('#sv-prode [data-prode]').count()) >= 4 && !/\d+%\s*[–-]\s*\d+%/.test(pr) && /0 de \d+ elegidos · (hoy|mañana)/.test(pr));
  es('Prode: lo liquidado ya no está entre los elegidos', await pj.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sv.prode')).elegidos).length === 0));
  await pj.click('#sv-prode [data-prode="12164722"][data-lado="2"]'); await pj.waitForTimeout(100);
  es('Prode: elegir marca el botón, cuenta 1 elegido y guarda el lado del modelo sin mostrarlo', (await pj.locator('#sv-prode [data-prode="12164722"][data-lado="2"].elegido').count()) === 1 && /1 de \d+ elegidos/.test(await pj.innerText('#sv-prode')) && await pj.evaluate(() => { const e = JSON.parse(localStorage.getItem('sv.prode')).elegidos['12164722']; return e && e.g === 2 && (e.m === 1 || e.m === 2); }) && !/modelo: /.test(await pj.innerText('#sv-prode')));
  await pj.click('#sv-prode [data-prode="12164722"][data-lado="1"]'); await pj.waitForTimeout(100);
  es('Prode: se puede cambiar de idea', await pj.evaluate(() => JSON.parse(localStorage.getItem('sv.prode')).elegidos['12164722'].g === 1));
  await pj.click('#sv-prode [data-prode-det]'); await pj.waitForTimeout(100);
  es('Prode: "Ver los partidos" muestra quién ganó, qué elegiste y qué decía el modelo (recién ahora)', /Basilashvili le ganó a Kecmanovic\s+· tú: Basilashvili · el modelo: Kecmanovic/.test(await pj.innerText('#sv-prode')));
  // el saque: un tie-break en la cancha
  const sq = await pj.innerText('#sv-saque');
  es('Saque: ofrece rivales de hoy y explica el juego', (await pj.locator('#sv-saque [data-saque]').count()) >= 4 && /tie-break a 7/.test(sq) && /potencia y dirección/.test(sq));
  await pj.click('#sv-saque [data-saque="12164722"][data-lado="2"]'); await pj.waitForTimeout(150);
  const G = (f) => pj.evaluate(f);
  // el resto lo juega un jugador perfecto: potencia en el verde, dirección a la línea y golpe a tiempo lejos del rival
  const perfecto = async (maxMs, hastaPunto) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const r = await pj.evaluate((hastaPunto) => { const g = window.svJuegos._estado(); const J = window.svJuegos; const C = J._C;
        if (g.fin) return 'fin';
        if (hastaPunto != null && g.punto >= hastaPunto && g.fase === 'listo') return 'fin';
        if (g.fase === 'listo') J._tocar();
        else if (g.fase === 'potencia') { g.potencia = 72; J._tocar(); }
        else if (g.fase === 'direccion') { g.cursor = (g.ladoSaque === 1 ? C.x1 : C.medio) + 6; J._tocar(); }
        else if (g.fase === 'viene' || g.fase === 'viene-saque') { const b = g.bola; const k = (performance.now() - b.t0) / b.dur; const restante = b.dur * (1 - k); if (restante <= g.ventana * 0.55) J._tocar(g.rivX > C.medio ? C.x1 + 12 : C.x2 - 12); }
        return g.fase; }, hastaPunto == null ? null : hastaPunto);
      if (r === 'fin') return true;
      await pj.waitForTimeout(15);
    }
    return false;
  };
  es('Saque: arranca contra Sonego en dura, con la cancha dibujada y sus números', /vs Sonego · dura/.test(await pj.innerText('#sv-saque')) && (await pj.locator('#sv-cancha').count()) === 1 && /Sonego saca el 66% y devuelve el 38%/.test(await pj.innerText('#sv-saque')) && await G(() => { const g = window.svJuegos._estado(); return g.fase === 'listo' && g.saco && Math.abs(g.saqueRival - 0.66) < 0.001; }));
  es('Saque: la cancha ocupa el ancho y tiene el alto de una cancha', await G(() => { const c = document.getElementById('sv-cancha'); return c.clientWidth >= 300 && c.clientHeight > c.clientWidth * 1.3; }));
  es('Saque: los botones Fuerte y Drop están, y apagados hasta que la pelota venga', (await pj.locator('#sv-saque [data-golpe="fuerte"]').count()) === 1 && (await pj.locator('#sv-saque [data-golpe="drop"]').count()) === 1 && await pj.locator('#sv-saque [data-golpe="drop"]').isDisabled());
  // un drop con buen timing, cuando viene la devolución: la pelota va cortita, pasando la red, y el rival corre hacia adelante
  { await G(() => { const g = window.svJuegos._estado(); const J = window.svJuegos; const C = J._C; g.fase = 'viene'; g.golpes = 1; g.ventana = 240; g.rivX = C.medio + 60; g.rivY = C.yArriba - 6; g.rivObjY = g.rivY; J._lanzar(g.rivX, C.yArriba + 10, C.medio - 20, C.yAbajo - 8, 700, 22); });
    await pj.waitForTimeout(80);
    const okBoton = await G(() => !document.querySelector('#sv-saque [data-golpe="drop"]').disabled);
    const r = await G(async () => { const g = window.svJuegos._estado(); const J = window.svJuegos; for (let i = 0; i < 200; i++) { const b = g.bola; const k = (performance.now() - b.t0) / b.dur; const restante = b.dur * (1 - k); if (restante <= g.ventana * 0.5) { J._tocar(null, 'drop'); break; } await new Promise((r) => setTimeout(r, 10)); } const C = J._C; return { fase: g.fase, esDrop: g.esDrop, y1: g.bola && g.bola.y1, red: C.red, rivObjY: g.rivObjY, msj: g.msj }; });
    es('Saque: el drop va cortito (pasa la red por poco) y el rival sale a buscarla', okBoton && (r.esDrop && r.fase === 'vuelo-mio' && r.y1 < r.red && r.y1 > r.red - 60 && r.rivObjY < r.red) || /Drop a la red/.test(r.msj || ''));
  }
  // y se vuelve a empezar limpio contra el mismo rival, para lo que sigue
  await pj.click('#sv-saque [data-saque-salir]'); await pj.waitForTimeout(150); await pj.click('#sv-saque [data-saque="12164722"][data-lado="2"]'); await pj.waitForTimeout(150);
  es('Saque: el orden del tie-break es 1, 2, 2, 2…', await G(() => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => window.svJuegos.sacoYo(i)).join('') === 'truefalsefalsetruetruefalsefalsetruetrue'));
  await G(() => window.svJuegos._tocar()); await pj.waitForTimeout(80);
  es('Saque: el primer toque arranca la potencia, que sube y baja', await G(async () => { const g = window.svJuegos._estado(); const a = g.potencia; await new Promise((r) => setTimeout(r, 80)); return g.fase === 'potencia' && g.potencia !== a; }));
  await G(() => { const g = window.svJuegos._estado(); g.potencia = 12; window.svJuegos._tocar(); });
  es('Saque: poca potencia: la pelota se ve ir a la red', await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; return g.segundo && g.bola && Math.abs(g.bola.y1 - C.red) < 10; }));
  await pj.waitForTimeout(600);
  es('Saque: …y después el aviso, y viene el segundo saque', await G(() => { const g = window.svJuegos._estado(); return /A la red/.test(g.msj) && g.segundo; }));
  await pj.waitForTimeout(1100);
  await G(() => { const g = window.svJuegos._estado(); g.potencia = 97; window.svJuegos._tocar(); });
  es('Saque: la segunda falta también se ve (larga) antes de anotarse', await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; return g.fase === 'desenlace' && g.bola && g.bola.y1 < C.sArriba && g.el === 0; }));
  await pj.waitForTimeout(600);
  es('Saque: dos faltas es doble falta y punto para él', await G(() => { const g = window.svJuegos._estado(); return /Doble falta/.test(g.msj) && g.el === 1 && g.yo === 0 && g.st.dobles === 1; }));
  await pj.waitForTimeout(1450);
  es('Saque: en el punto 2 saca él; hay que pedirla', await G(() => { const g = window.svJuegos._estado(); return g.fase === 'listo' && !g.saco && g.punto === 1; }));
  await G(() => window.svJuegos._tocar()); await pj.waitForTimeout(50);
  es('Saque: su saque viene con una ventana de tiempo chica', await G(() => { const g = window.svJuegos._estado(); return g.fase === 'viene-saque' && g.st.susSaques === 1 && g.ventana < 200 && !!g.bola; }));
  await pj.waitForTimeout(800);
  es('Saque: si no la tocás, la pelota sigue de largo (se ve pasar)', await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; return g.fase === 'desenlace' && g.bola.y1 > C.yAbajo; }));
  await pj.waitForTimeout(400);
  es('Saque: …y es saque ganador de él', await G(() => { const g = window.svJuegos._estado(); return g.el === 2 && /saque ganador/i.test(g.msj); }));
  await pj.waitForTimeout(1450);
  es('Saque: el punto 3 también lo saca él (1, 2, 2…)', await G(() => { const g = window.svJuegos._estado(); return g.punto === 2 && !g.saco; }));
  await perfecto(20000, 3);
  es('Saque: el punto 4 es tu saque', await G(() => { const g = window.svJuegos._estado(); return g.punto === 3 && g.saco && g.fase === 'listo'; }));
  // tu saque bien (verde y pegado a la línea): o ace, o la devuelve y viene el peloteo
  await G(() => window.svJuegos._tocar()); await pj.waitForTimeout(30);
  await G(() => { const g = window.svJuegos._estado(); g.potencia = 72; window.svJuegos._tocar(); });
  es('Saque: con potencia en el verde se pasa a la dirección, con el cursor barriendo el cuadro', await G(() => { const g = window.svJuegos._estado(); return g.fase === 'direccion' && g.calidadPot === 1; }));
  await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; g.cursor = (g.ladoSaque === 1 ? C.x1 : C.medio) + 6; window.svJuegos._tocar(); });
  es('Saque: adentro y pegado a la línea: la pelota vuela al cuadro cruzado', await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; return g.fase === 'vuelo-saque' && g.st.misSaques === 2 && g.calidadSaque === 1 && g.bola && g.bola.y1 > C.sArriba && g.bola.y1 < C.red; }));
  await pj.waitForTimeout(450);
  es('Saque: cuando llega, o fue ace (la pelota lo pasa) o él la devolvió y viene el peloteo', await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; return (g.st.aces === 1 && g.fase === 'desenlace' && g.bola.y1 < C.yArriba) || (g.fase === 'viene' && g.golpes === 1); }));
  const vino = await G(() => window.svJuegos._estado().fase === 'viene');
  if (vino) {
    const r = await G(() => { const g = window.svJuegos._estado(); const C = window.svJuegos._C; const b = g.bola; if (!b) return 'skip'; const restante = b.dur * (1 - (performance.now() - b.t0) / b.dur); if (restante <= g.ventana * 1.6) return 'skip'; window.svJuegos._tocar(180); return g.fase === 'desenlace' && Math.abs(g.bola.y1 - C.red) < 10 && /temprano/i.test(g.desenlace.msj) && g.st.errores >= 1; });
    if (r !== 'skip') es('Saque: tocar muy temprano: la pelota va a la red', r === true);
  }
  es('Saque: el tie-break termina (7 con dos de diferencia)', await perfecto(90000) && await G(() => { const g = window.svJuegos._estado(); return Math.max(g.yo, g.el) >= 7 && Math.abs(g.yo - g.el) >= 2; }));
  const fin = await pj.innerText('#sv-saque');
  es('Saque: al final, tu saque contra el suyo, aces, dobles, winners y errores', /tie-break \d+-\d+/.test(fin) && /Puntos ganados con tu saque\s+\d+ de \d+/.test(fin) && /Sonego con el suyo, en la realidad\s+66% en dura/.test(fin) && /Aces · dobles faltas\s+\d+ · 1/.test(fin));
  es('Saque: guarda la marca en el teléfono', await G(() => { const m = JSON.parse(localStorage.getItem('sv.saque')); return m && m.jugados === 1 && m.mejorSaque >= 0; }));
  await pj.click('#sv-saque [data-saque-salir]'); await pj.waitForTimeout(100);
  es('Saque: "Cambiar de rival" vuelve a la lista con la marca a la vista', (await pj.locator('#sv-saque [data-saque]').count()) >= 4 && /Tie-breaks: \d ganados de 1/.test(await pj.innerText('#sv-saque')));
  const cuerpo = await pj.innerText('body');
  for (const palabra of ['cuota', 'pick', 'fija', 'apuesta', 'acertá', 'premio']) es(`Jugá: no dice "${palabra}"`, !new RegExp('\\b' + palabra, 'i').test(cuerpo));
  es('Jugá: sin errores de JS', errs.length === 0, errs[0]);
  await pj.close();
}
await b.close();
console.log(`${ok} pruebas bien, ${mal} mal`);
if (mal) process.exit(1);
