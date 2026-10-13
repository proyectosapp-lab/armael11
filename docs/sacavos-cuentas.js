// sacavos-cuentas.js — la cuenta y el pase de Sacá vos. Script clásico, sin dependencias, expone window.svCuentas.
// Es la misma cuenta que Armá el 11: el mismo Supabase (window.SV_SITIO.supabase), la misma tabla `perfil`, las mismas
// funciones de cobro (crear-pago / pago-avisado). Lo que es de Sacá vos es una fila en `pase` con producto 'sacavos'.
// Reglas heredadas: el precio lo pone el servidor; el pase lo acredita el servidor; acá se lee, nunca se decide.
(function (raiz) {
  'use strict';
  const LLAVE = 'tste.sesion';                   // la misma llave que Armá el 11: entrar en una es entrar en las dos
  const PRODUCTO = 'sacavos';
  const cfg = () => (raiz.SV_SITIO && raiz.SV_SITIO.supabase) || {};
  const hayBackend = () => !!(cfg().url && cfg().anon);
  const guardado = {
    leer() { try { return JSON.parse(localStorage.getItem(LLAVE) || 'null'); } catch (e) { return null; } },
    poner(v) { try { v ? localStorage.setItem(LLAVE, JSON.stringify(v)) : localStorage.removeItem(LLAVE); } catch (e) {} return v; },
  };
  let sesion = guardado.leer();
  const MAIL_OK = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const limpiarMail = (e) => String(e || '').trim().toLowerCase();
  function uidDe(token) {
    try { const medio = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(medio)))).sub || null; } catch (e) { return null; }
  }
  function leSobra(token) {
    try { const medio = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const exp = JSON.parse(decodeURIComponent(escape(atob(medio)))).exp; return exp ? exp - Math.floor(Date.now() / 1000) : 0; } catch (e) { return 0; }
  }
  function guardarSesionDe(d) {
    if (!d || !d.access_token) return null;
    sesion = guardado.poner({ token: d.access_token, refresh: d.refresh_token, uid: uidDe(d.access_token) });
    return sesion;
  }
  async function mensajeDe(r) {
    let d = {}; try { d = JSON.parse(await r.text()); } catch (e) {}
    const cru = d.message || d.error_description || d.msg || d.error || ('HTTP ' + r.status);
    if (/invalid login|invalid credentials/i.test(cru)) return 'Mail o contraseña incorrectos.';
    if (/rate limit|too many/i.test(cru)) return 'Demasiados intentos seguidos. Esperá un minuto.';
    if (/error sending|failed to send|smtp/i.test(cru)) return 'No pudimos mandarte el mail. No es tu casilla: es nuestro correo. Prueba en un rato.';
    return cru;
  }
  let renovando = null;
  function renovar() {
    if (renovando) return renovando;
    if (!sesion || !sesion.refresh) return Promise.resolve(null);
    const antes = sesion;
    renovando = (async () => {
      try {
        const d = await pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', sinToken: true, cuerpo: { refresh_token: antes.refresh } });
        return guardarSesionDe(d);
      } catch (e) {
        if (/invalid|expired|revoked|not.?found|already used/i.test(e.message || '')) { salir(); return null; }
        sesion = antes; return null;
      } finally { renovando = null; }
    })();
    return renovando;
  }
  async function pedir(ruta, o) {
    o = o || {};
    const { url, anon } = cfg();
    if (!url || !anon) throw new Error('el backend no está configurado');
    const h = Object.assign({ apikey: anon, 'Content-Type': 'application/json' }, o.cabeceras || {});
    if (!o.sinToken && sesion && sesion.token) h.Authorization = 'Bearer ' + sesion.token;
    const r = await fetch(url + ruta, { method: o.metodo || 'GET', headers: h, body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo) });
    if (r.status === 401 && !o.sinToken && sesion && sesion.refresh) { const n = await renovar(); if (n) return pedir(ruta, o); }
    if (!r.ok) throw new Error(await mensajeDe(r));
    if (r.status === 204) return null;
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  async function asegurarSesion() {
    if (!sesion || !sesion.token) return null;
    if (leSobra(sesion.token) > 90) return sesion;
    return (await renovar()) || sesion;
  }
  function salir() { sesion = guardado.poner(null); }

  // ---------- entrar ----------
  async function crearCuenta(email, clave) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    if (String(clave || '').length < 6) throw new Error('La contraseña necesita al menos 6 caracteres.');
    const d = await pedir('/auth/v1/signup', { metodo: 'POST', sinToken: true, cuerpo: { email: e, password: clave } });
    const s = guardarSesionDe(d);
    if (s) await asegurarPerfil();
    return { sesion: s, confirmar: !s };
  }
  async function entrarConClave(email, clave) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    const d = await pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', sinToken: true, cuerpo: { email: e, password: clave } });
    const s = guardarSesionDe(d);
    if (!s) throw new Error('Mail o contraseña incorrectos.');
    await asegurarPerfil();
    return s;
  }
  async function pedirLink(email, volverA) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    // la vuelta va en la dirección: un `options` en el cuerpo Supabase lo ignora y manda a la Site URL (armael11.com)
    await pedir('/auth/v1/otp' + (volverA ? '?redirect_to=' + encodeURIComponent(volverA) : ''), { metodo: 'POST', sinToken: true, cuerpo: { email: e, create_user: true } });
    return e;
  }
  // Al volver del mail, los tokens vienen en el hash. Se consumen y se limpian.
  function capturarVuelta() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h || !/access_token=/.test(h)) return null;
    const p = new URLSearchParams(h);
    const token = p.get('access_token'), refresh = p.get('refresh_token');
    if (!token) return null;
    sesion = guardado.poner({ token, refresh, uid: uidDe(token) });
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return sesion;
  }
  // La fila de `perfil` tiene que existir para que el pago se acredite. Sacá vos no usa nombre de usuario, así que se
  // inventa uno con el uid; si la persona ya tiene perfil por Armá el 11, `ignore-duplicates` lo deja como está.
  async function asegurarPerfil() {
    if (!sesion || !sesion.uid) return;
    try {
      await pedir('/rest/v1/perfil', { metodo: 'POST', cabeceras: { Prefer: 'resolution=ignore-duplicates' },
        cuerpo: { id: sesion.uid, usuario: 'sv_' + sesion.uid.replace(/-/g, '').slice(0, 10) } });
    } catch (e) { /* ya existe o no hay red: el pago igual lo reintenta el servidor */ }
  }

  // ---------- el pase ----------
  // ¿Cobra de verdad? Vive en la base (`ajuste.cobra`). Mientras diga 'no', el pronóstico se muestra a todos.
  async function cobraDeVerdad() {
    try { const f = await pedir('/rest/v1/ajuste?select=valor&clave=eq.cobra_sacavos', { sinToken: true }); return (f && f[0] && f[0].valor) === 'si'; }
    catch (e) { return false; }   // sin red no se frena a nadie: el dato es del servidor y sin servidor no hay cobro
  }
  async function miPase() {
    if (!sesion || !sesion.uid) return { hasta: null, activo: false };
    const f = await pedir('/rest/v1/pase?select=hasta&producto=eq.' + PRODUCTO + '&perfil=eq.' + sesion.uid);
    const hasta = (f && f[0] && f[0].hasta) || null;
    return { hasta, activo: !!hasta && new Date(hasta) > new Date() };
  }
  /* LOS DOS PLANES QUE SE PUEDEN COMPRAR DESDE ACÁ (12/10/2026).
     Hasta hoy sacavos.com ofrecía solo el suyo: el que llegaba por un posteo
     de tenis nunca se enteraba de que por $3.000 más tenía los tres deportes.
     `todo` ya existía en el servidor y acredita las tres cosas de una
     (registrar_pago: pase de tenis + pase de NBA + premium de fútbol), así
     que `miPase()` lo ve sin cambiar nada. Los precios siguen siendo del
     servidor: acá solo se nombran los dos planes. */
  const COMPRABLES = [PRODUCTO, 'todo'];
  async function planes() {
    const { url, anon } = cfg(); if (!url) return [];
    const r = await fetch(url + '/functions/v1/crear-pago', { headers: { apikey: anon, Authorization: 'Bearer ' + anon } });
    if (!r.ok) return [];
    const todos = (await r.json()).planes || [];
    return COMPRABLES.map((id) => todos.find((p) => p.id === id)).filter(Boolean);
  }
  /* La vuelta se pide explícita. Sin esto, el que compra `todo` desde
     sacavos.com vuelve a armael11.com/app, que es la vuelta propia de ese
     plan: la compra sale bien y la persona termina en otro sitio. */
  async function linkDePago(plan) {
    if (!sesion || !sesion.uid) throw new Error('Hay que entrar primero.');
    const cual = COMPRABLES.includes(plan) ? plan : PRODUCTO;
    await asegurarSesion();
    const { url, anon } = cfg();
    const vuelta = (raiz.location && raiz.location.origin ? raiz.location.origin : 'https://sacavos.com') + '/gracias.html';
    const r = await fetch(url + '/functions/v1/crear-pago', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + sesion.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: cual, vuelta }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.link) throw new Error(d.error || 'No pude armar el pago.');
    return d.link;
  }

  // iPhone: la compra terminó en StoreKit; se le pide al servidor que verifique con RevenueCat y acredite. No se manda
  // qué se compró ni hasta cuándo: eso lo averigua el servidor. Solo la sesión.
  async function avisarPagoDeApple() {
    if (!sesion || !sesion.uid) throw new Error('Hay que entrar primero.');
    await asegurarSesion();
    const { url, anon } = cfg();
    const r = await fetch(url + '/functions/v1/pago-apple', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + sesion.token, 'Content-Type': 'application/json' }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No pude confirmar la compra con Apple.');
    if (!d.ok) throw new Error(d.error || 'No encontré ninguna suscripción activa.');
    return d;
  }
  // La prueba gratis: la base la empieza la primera vez y devuelve hasta cuándo. Sin sesión, null.
  async function miPrueba() {
    if (!sesion || !sesion.uid) return { hasta: null, activa: false };
    const h = await pedir('/rest/v1/rpc/mi_prueba_sacavos', { metodo: 'POST', cuerpo: {} });
    const hasta = typeof h === 'string' ? h : null;
    return { hasta, activa: !!hasta && new Date(hasta) > new Date() };
  }
  // Borrar la cuenta desde adentro (Apple 5.1.1(v), Google lo mismo). Usa borrar_mi_cuenta() del Supabase compartido:
  // no recibe parámetros, borra a auth.uid() y el resto (perfil, pase, prueba) cae por cascada. Después se cierra la sesión.
  async function borrarMiCuenta() {
    if (!sesion || !sesion.uid) throw new Error('Hay que entrar primero.');
    await pedir('/rest/v1/rpc/borrar_mi_cuenta', { metodo: 'POST', cuerpo: {} });
    salir();
    return true;
  }
  raiz.svCuentas = { borrarMiCuenta, asegurarPerfil, avisarPagoDeApple, miPrueba, hayBackend, quienSoy: () => sesion, asegurarSesion, salir, crearCuenta, entrarConClave, pedirLink, capturarVuelta, cobraDeVerdad, miPase, planes, linkDePago, PRODUCTO, COMPRABLES };
})(typeof window !== 'undefined' ? window : globalThis);
