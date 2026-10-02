// tienda-mam.js — los planes de Mano a mano: cuatro productos, un solo grupo de suscripciones. Script clásico, expone
// window.mamTienda. Adentro del iPhone y de Android compra por RevenueCat (StoreKit / Play Billing); en la web, por
// Mercado Pago (crear-pago). LAS DOS REGLAS DE SIEMPRE: al teléfono no se le cree nada (el pase lo acredita el
// servidor, pago-apple, preguntándole a RevenueCat con la clave secreta) y el precio lo pone la tienda (acá no hay un
// solo número: sale de priceString, con el símbolo del país).
(function (raiz) {
  'use strict';
  // Los ids tienen que coincidir LETRA POR LETRA con App Store Connect, Play Console, RevenueCat y pago-tiendas.ts.
  const PLANES = [
    { id: 'mam.futbol', producto: 'com.armael11.app.mam.futbol.mensual', nombre: 'Fútbol', detalle: 'el simulador en las once ligas, sin tope', da: ['futbol'] },
    { id: 'mam.tenis',  producto: 'com.armael11.app.mam.tenis.mensual',  nombre: 'Tenis',  detalle: 'el número, la perilla y la simulación de cada partido ATP', da: ['tenis'] },
    { id: 'mam.nba',    producto: 'com.armael11.app.mam.nba.mensual',    nombre: 'NBA',    detalle: 'el número y la rotación de cada partido', da: ['nba'] },
    { id: 'mam.todo',   producto: 'com.armael11.app.mam.todo.mensual',   nombre: 'Todo',   detalle: 'fútbol, tenis y NBA', da: ['futbol', 'tenis', 'nba'], todo: true },
  ];
  const LETRA_CHICA = 'Se renueva sola todos los meses hasta que la canceles. Se cancela cuando quieras desde los ajustes de tu teléfono (Suscripciones), y seguís teniendo el plan hasta el final del mes pago. Los desafíos, los juegos y los resultados son gratis siempre.';
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
  // de la tienda: precio y, si lo hay, la prueba gratis que configuraste en App Store Connect / Play (introPrice)
  function armar(productos) {
    const out = {};
    for (const p of productos || []) {
      const id = String((p && (p.identifier || p.productIdentifier)) || '');
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
    try { const r = await T.getProducts({ productIdentifiers: PLANES.map((p) => p.producto), type: 'subs' }); PRECIOS = armar((r && r.products) || []); if (!PRECIOS) MOTIVO = 'la tienda no devolvió los productos (¿están creados y en revisión?)'; }
    catch (e) { PRECIOS = null; MOTIVO = 'no pude pedir los precios: ' + String((e && e.message) || e); }
    ESTADO = 'listo'; return PRECIOS;
  }
  function cancelada(e) { if (!e) return false; if (e.userCancelled === true || e.userCancelled === 'true') return true; if (String(e.code) === '1') return true; return /cancel/i.test(String(e.message || '')); }
  function textoDeError(e) {
    const m = String((e && e.message) || '');
    if (/network|conexión|connection|internet/i.test(m)) return 'No pude hablar con la tienda. Fijate la conexión y probá de nuevo.';
    if (/not allowed|restricted|permission/i.test(m)) return 'Este teléfono tiene las compras restringidas.';
    if (/already|pending/i.test(m)) return 'Esa compra ya está en curso. Esperá unos segundos y probá otra vez.';
    return 'No pude completar la compra. Si te llegó el cobro, tocá Restaurar compras.';
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
    const tiene = (plan) => plan.da.every((d) => pases[d]);
    const filas = PLANES.map((plan) => {
      const activo = tiene(plan);
      const pr = nativo ? (precios && precios[plan.id]) : null;
      const precio = nativo ? (pr ? pr.precio + ' / mes' : '…') : (web[plan.id] ? '$' + Number(web[plan.id]).toLocaleString('es-AR') + ' / mes' : 'se compra en el sitio');
      const prueba = nativo && pr && pr.prueba ? ` · ${pr.prueba} días gratis la primera vez` : '';
      return `<button type="button" class="mam-plan${plan.todo ? ' todo' : ''}${activo ? ' activo' : ''}" data-plan="${plan.id}" ${o.comprando ? 'disabled' : ''}>
        <b>${esc(plan.nombre)}${plan.todo ? ' · los tres deportes' : ''}</b><small>${esc(plan.detalle)}${esc(prueba)}</small>
        <span class="precio">${activo ? 'tenés hasta el ' + esc(fechaCorta(pases[plan.da[0]])) : esc(precio)}</span></button>`;
    }).join('');
    const s = S();
    return `<div class="mam-planes">${filas}</div>
      <p class="mam-letra">${esc(LETRA_CHICA)}${!nativo ? ' En la web cada deporte se compra en su sitio, con Mercado Pago y sin renovación automática.' : ''}</p>
      ${!nativo || (precios) ? '' : `<p class="mam-letra">Buscando los precios en la tienda…${MOTIVO ? ' (' + esc(MOTIVO) + ')' : ''}</p>`}
      <div class="mam-fila" style="justify-content:space-between;flex-wrap:wrap;gap:6px 12px">
        ${nativo ? '<button type="button" class="mam-boton secundario chico" data-restaurar>Restaurar compras</button>' : '<span></span>'}
        <small class="mam-letra"><a href="${esc(s.terminos || '#')}" data-abrir>Términos de uso</a> · <a href="${esc(s.privacidad || '#')}" data-abrir>Privacidad</a></small>
      </div>`;
  }
  function fechaCorta(iso) { try { return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } }
  raiz.mamTienda = { PLANES, LETRA_CHICA, arrancar, quienCompra, traerPrecios, comprar, restaurar, cancelada, textoDeError, panelHTML, armar,
    estado: () => ({ precios: PRECIOS, estado: ESTADO, motivo: MOTIVO }) };
})(typeof window !== 'undefined' ? window : globalThis);
