// tienda-mam.js — los planes de Mano a mano: cuatro productos, un solo grupo de suscripciones. Script clásico, expone
// window.mamTienda. Adentro del iPhone y de Android compra por RevenueCat (StoreKit / Play Billing); en la web, por
// Mercado Pago (crear-pago). LAS DOS REGLAS DE SIEMPRE: al teléfono no se le cree nada (el pase lo acredita el
// servidor, pago-apple, preguntándole a RevenueCat con la clave secreta) y el precio lo pone la tienda (acá no hay un
// solo número: sale de priceString, con el símbolo del país).
(function (raiz) {
  'use strict';
  // Los ids tienen que coincidir LETRA POR LETRA con App Store Connect, Play Console, RevenueCat y pago-tiendas.ts.
  // `web` es el nombre del mismo plan en crear-pago (Mercado Pago, para armael11.com/app): el precio en pesos vive allá.
  const PLANES = [
    { id: 'mam.futbol', producto: 'com.armael11.app.mam.futbol.mensual', web: 'futbol', nombre: 'Fútbol', detalle: 'el simulador en las once ligas, sin tope', da: ['futbol'] },
    { id: 'mam.tenis',  producto: 'com.armael11.app.mam.tenis.mensual',  web: 'tenis',  nombre: 'Tenis',  detalle: 'el número, la perilla y la simulación de cada partido ATP', da: ['tenis'] },
    { id: 'mam.nba',    producto: 'com.armael11.app.mam.nba.mensual',    web: 'nba',    nombre: 'NBA',    detalle: 'el número y la rotación de cada partido', da: ['nba'] },
    { id: 'mam.todo',   producto: 'com.armael11.app.mam.todo.mensual',   web: 'todo',   nombre: 'Todo',   detalle: 'fútbol, tenis y NBA', da: ['futbol', 'tenis', 'nba'], todo: true },
  ];
  const LETRA_CHICA = 'Se renueva sola todos los meses hasta que se cancele. Se cancela cuando quieras desde los ajustes del teléfono (Suscripciones), y el plan sigue activo hasta el final del mes pago. Los desafíos, los juegos y los resultados son gratis siempre.';
  const LETRA_WEB = 'En la web se paga con Mercado Pago, un mes por vez y sin renovación automática: el mes se suma a lo que te quede. Los desafíos, los juegos y los resultados son gratis siempre.';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = () => raiz.MAM_SITIO || {};
  const N = () => raiz.mamNativo || null;
  const plugin = () => { try { const P = raiz.Capacitor && raiz.Capacitor.Plugins; return (P && P.Purchases) || null; } catch (e) { return null; } };
  const clave = () => { const n = N(); const s = S(); return n && n.esAndroid() ? String((s.android || {}).revenuecat || '') : String((s.apple || {}).revenuecat || ''); };

  let arranque = null, configurada = false, MOTIVO = '';
  function arrancar(perfil) { if (!arranque) arranque = (async () => {
    const T = plugin(); const k = clave();
    if (!T) { MOTIVO = 'sin el módulo de compras'; return false; }
    if (!k) { MOTIVO = 'sin la clave de RevenueCat'; return false; }
    try { await T.configure(perfil ? { apiKey: k, appUserID: String(perfil) } : { apiKey: k }); configurada = true; return true; }
    catch (e) { MOTIVO = 'RevenueCat no arrancó: ' + String((e && e.message) || e); return false; }
  })(); return arranque; }
  async function lista() { const T = plugin(); if (!T) return null; if (!arranque) arrancar(null); try { await arranque; } catch (e) {} return configurada ? T : null; }
  async function quienCompra(perfil) { const T = await lista(); if (!T) return false; try { if (perfil) await T.logIn({ appUserID: String(perfil) }); else await T.logOut(); return true; } catch (e) { return false; } }

  let PRECIOS = null, ESTADO = 'nuevo';
  // En Play, RevenueCat nombra la suscripción con su plan base: "com….futbol.mensual:mensual". Para encontrar el plan se
  // mira lo que hay antes de los dos puntos; en la App Store no hay dos puntos y queda igual.
  const base = (id) => String(id || '').split(':')[0];
  // de la tienda: precio y, si lo hay, la prueba gratis que configuraste en App Store Connect / Play (introPrice)
  function armar(productos) {
    const out = {};
    for (const p of productos || []) {
      const id = base((p && (p.identifier || p.productIdentifier)) || '');
      const precio = String((p && p.priceString) || '').trim();
      const plan = PLANES.find((x) => x.producto === id);
      if (!plan || !precio) continue;
      const intro = p.introPrice || p.introductoryPrice || null;
      out[plan.id] = { precio, crudo: p, prueba: intro && (intro.price === 0 || intro.priceString === '' || /free|gratis|0/.test(String(intro.priceString || '0'))) ? (intro.periodNumberOfUnits || intro.periodUnits || 3) : null };
    }
    return Object.keys(out).length ? out : null;
  }
  async function traerPrecios() {
    ESTADO = 'pidiendo'; const T = await lista();
    if (!T) { ESTADO = 'sin-tienda'; PRECIOS = null; return null; }
    // en Android se piden las dos formas (con y sin ":mensual"): la que exista, vuelve
    const ids = PLANES.map((p) => p.producto); const n = N();
    const pedidos = n && n.esAndroid() ? ids.concat(ids.map((i) => i + ':mensual')) : ids;
    try { const r = await T.getProducts({ productIdentifiers: pedidos, type: 'subs' }); PRECIOS = armar((r && r.products) || []); if (!PRECIOS) MOTIVO = 'la tienda no devolvió los productos (¿están creados y en revisión?)'; }
    catch (e) { PRECIOS = null; MOTIVO = 'no pude pedir los precios: ' + String((e && e.message) || e); }
    ESTADO = 'listo'; return PRECIOS;
  }
  function cancelada(e) { if (!e) return false; if (e.userCancelled === true || e.userCancelled === 'true') return true; if (String(e.code) === '1') return true; return /cancel/i.test(String(e.message || '')); }
  function textoDeError(e) {
    const m = String((e && e.message) || '');
    if (/network|conexión|connection|internet/i.test(m)) return 'No pudimos hablar con la tienda. Revisa la conexión y prueba de nuevo.';
    if (/not allowed|restricted|permission/i.test(m)) return 'Este teléfono tiene las compras restringidas.';
    if (/already|pending/i.test(m)) return 'Esa compra ya está en curso. Espera unos segundos y prueba otra vez.';
    return 'No pudimos completar la compra. Si llegó el cobro, toca Restaurar compras.';
  }
  async function comprar(planId) {
    const T = await lista(); if (!T) throw new Error('La compra no está disponible en este teléfono.');
    const p = PRECIOS && PRECIOS[planId];
    if (!p || !p.crudo) throw new Error('Ese plan todavía no está disponible en la tienda.');
    const r = await T.purchaseStoreProduct({ product: p.crudo });
    return (r && r.productIdentifier) || planId;
  }
  async function restaurar() { const T = await lista(); if (!T) throw new Error('La restauración no está disponible en este teléfono.'); await T.restorePurchases(); return true; }

  // La pantalla que Apple revisa a mano (3.1.2): nombre · precio · mensual · se renueva sola · cómo se cancela ·
  // Restaurar compras · Términos · Privacidad. `pases` = { futbol: hasta|null, tenis, nba } según el servidor.
  function panelHTML(o) {
    o = o || {}; const pases = o.pases || {}; const nativo = !!o.nativo; const precios = o.precios || PRECIOS; const web = o.preciosWeb || {};
    const cobra = o.cobra || null;   // { futbol, tenis, nba }: false = ese deporte hoy es abierto para todos, no se vende
    const tiene = (plan) => plan.da.every((d) => pases[d]);
    const filas = PLANES.map((plan) => {
      const activo = tiene(plan);
      const abierto = !!cobra && plan.da.every((d) => cobra[d] === false);
      const pr = nativo ? (precios && precios[plan.id]) : null;
      const precio = nativo ? (pr ? pr.precio + ' / mes' : '…') : (web[plan.id] ? '$' + Number(web[plan.id]).toLocaleString('es-AR') + ' / mes' : '…');
      /* la prueba gratis la pone la tienda (oferta introductoria): se muestra como lo que es, y el botón dice qué hace */
      const prueba = nativo && pr && pr.prueba ? pr.prueba : 0;
      const accion = activo ? 'activo hasta el ' + esc(fechaCorta(pases[plan.da[0]])) : abierto ? 'por ahora, abierto para todos' : prueba ? `probar ${prueba} días gratis · después ${esc(precio)}` : esc(precio);
      return `<button type="button" class="mam-plan${plan.todo ? ' todo' : ''}${activo ? ' activo' : ''}${abierto ? ' abierto' : ''}" data-plan="${plan.id}" ${o.comprando || abierto ? 'disabled' : ''}>
        <b>${esc(plan.nombre)}${plan.todo ? ' · los tres deportes' : ''}</b><small>${esc(plan.detalle)}</small>
        <span class="precio">${accion}</span></button>`;
    }).join('');
    const s = S();
    return `<div class="mam-planes">${filas}</div>
      <p class="mam-letra">${esc(nativo ? LETRA_CHICA : LETRA_WEB)}</p>
      ${!nativo || (precios) ? '' : `<p class="mam-letra">Buscando los precios en la tienda…${MOTIVO ? ' (' + esc(MOTIVO) + ')' : ''}</p>`}
      <div class="mam-fila" style="justify-content:space-between;flex-wrap:wrap;gap:6px 12px">
        ${nativo ? '<button type="button" class="mam-boton secundario chico" data-restaurar>Restaurar compras</button>' : '<span></span>'}
        <small class="mam-letra"><a href="${esc(s.terminos || '#')}" data-abrir>Términos de uso</a> · <a href="${esc(s.privacidad || '#')}" data-abrir>Privacidad</a></small>
      </div>`;
  }
  function fechaCorta(iso) { try { return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } }
  raiz.mamTienda = { PLANES, LETRA_CHICA, LETRA_WEB, arrancar, quienCompra, traerPrecios, comprar, restaurar, cancelada, textoDeError, panelHTML, armar,
    estado: () => ({ precios: PRECIOS, estado: ESTADO, motivo: MOTIVO }) };
})(typeof window !== 'undefined' ? window : globalThis);
