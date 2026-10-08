// mam-cuentas.js — la cuenta de Mano a mano. Script clásico, sin dependencias, expone window.mamCuentas.
// Es LA MISMA cuenta que Armá el 11, Sacá vos y el Quinteto: el mismo Supabase, la misma tabla `perfil`, la misma
// llave de sesión (`tste.sesion`) que las tres sub-apps leen adentro de sus marcos (mismo origen, mismo localStorage).
//
// Lo nuevo: la cuenta ANÓNIMA. Para jugar un desafío alcanza con un apodo: se crea una cuenta sin mail (Supabase →
// Authentication → "Allow anonymous sign-ins") y una fila en `perfil`. Después se le puede atar un mail para
// recuperarla en otro teléfono. Apple (5.1.1) no deja pedir el mail para algo que no lo necesita; un apodo sí.
(function (raiz) {
  'use strict';
  const LLAVE = 'tste.sesion';
  const cfg = () => (raiz.MAM_SITIO && raiz.MAM_SITIO.supabase) || {};
  const hayBackend = () => !!(cfg().url && cfg().anon);
  const guardado = {
    leer() { try { return JSON.parse(localStorage.getItem(LLAVE) || 'null'); } catch (e) { return null; } },
    poner(v) { try { v ? localStorage.setItem(LLAVE, JSON.stringify(v)) : localStorage.removeItem(LLAVE); } catch (e) {} return v; },
  };
  let sesion = guardado.leer();
  let PERFIL = null;   // { usuario } la última vez que se leyó
  const MAIL_OK = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const limpiarMail = (e) => String(e || '').trim().toLowerCase();
  function cuerpoDe(token) { try { const m = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(m)))); } catch (e) { return {}; } }
  const uidDe = (t) => cuerpoDe(t).sub || null;
  const leSobra = (t) => { const e = cuerpoDe(t).exp; return e ? e - Math.floor(Date.now() / 1000) : 0; };
  const esAnonima = () => !!(sesion && sesion.token && cuerpoDe(sesion.token).is_anonymous);
  function guardarSesionDe(d) {
    if (!d || !d.access_token) return null;
    sesion = guardado.poner({ token: d.access_token, refresh: d.refresh_token, uid: uidDe(d.access_token) });
    return sesion;
  }
  async function mensajeDe(r) {
    let d = {}; try { d = JSON.parse(await r.text()); } catch (e) {}
    const cru = d.message || d.error_description || d.msg || d.error || ('HTTP ' + r.status);
    if (/invalid login|invalid credentials/i.test(cru)) return 'Mail o contraseña incorrectos.';
    if (/rate limit|too many/i.test(cru)) return 'Demasiados intentos seguidos. Espera un minuto.';
    if (/anonymous sign-ins are disabled/i.test(cru)) return 'Falta prender las cuentas anónimas en Supabase (Authentication → Allow anonymous sign-ins).';
    if (/error sending|failed to send|smtp/i.test(cru)) return 'No pudimos mandar el mail. No es tu casilla: es nuestro correo. Prueba en un rato.';
    return cru;
  }
  let renovando = null;
  function renovar() {
    if (renovando) return renovando;
    if (!sesion || !sesion.refresh) return Promise.resolve(null);
    const antes = sesion;
    renovando = (async () => {
      try { return guardarSesionDe(await pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', sinToken: true, cuerpo: { refresh_token: antes.refresh } })); }
      catch (e) { if (/invalid|expired|revoked|not.?found|already used/i.test(e.message || '')) { salir(); return null; } sesion = antes; return null; }
      finally { renovando = null; }
    })();
    return renovando;
  }
  async function pedir(ruta, o) {
    o = o || {};
    const { url, anon } = cfg();
    if (!url || !anon) throw new Error('el backend no está configurado');
    const h = Object.assign({ apikey: anon, 'Content-Type': 'application/json' }, o.cabeceras || {});
    if (!o.sinToken && sesion && sesion.token) h.Authorization = 'Bearer ' + sesion.token;
    else if (o.sinToken) h.Authorization = 'Bearer ' + anon;
    const r = await fetch(url + ruta, { method: o.metodo || 'GET', headers: h, body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo) });
    if (r.status === 401 && !o.sinToken && sesion && sesion.refresh) { const n = await renovar(); if (n) return pedir(ruta, o); }
    if (!r.ok) throw new Error(await mensajeDe(r));
    if (r.status === 204) return null;
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const rpc = (nombre, args) => pedir('/rest/v1/rpc/' + nombre, { metodo: 'POST', cuerpo: args || {} });
  async function asegurarSesion() {
    sesion = guardado.leer() || sesion;   // otra parte de la app (un marco) pudo entrar o salir
    if (!sesion || !sesion.token) return null;
    if (leSobra(sesion.token) > 90) return sesion;
    return (await renovar()) || sesion;
  }
  function salir() { sesion = guardado.poner(null); PERFIL = null; }

  // ---------- el perfil: quién soy, con apodo ----------
  async function miPerfil() {
    if (!sesion) return null;
    const f = await pedir('/rest/v1/perfil?select=usuario&id=eq.' + sesion.uid);
    PERFIL = f && f[0] ? f[0] : null;
    return PERFIL;
  }
  // entrar con un apodo y nada más: cuenta anónima + perfil. Si ya hay sesión, solo pone (o cambia) el apodo.
  async function entrarConApodo(apodo) {
    const a = String(apodo || '').trim();
    if (a.replace(/[^a-z0-9_]/gi, '').length < 3) throw new Error('El apodo necesita al menos 3 letras o números.');
    if (!(await asegurarSesion())) {
      const d = await pedir('/auth/v1/signup', { metodo: 'POST', sinToken: true, cuerpo: {} });   // anónima
      if (!guardarSesionDe(d)) throw new Error('No pude crear la cuenta.');
    }
    const usuario = await rpc('ponerme_apodo', { p_apodo: a });
    PERFIL = { usuario };
    return usuario;
  }
  // atar un mail (y contraseña) a la cuenta anónima, para recuperarla en otro teléfono
  async function atarMail(email, clave) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    if (String(clave || '').length < 6) throw new Error('La contraseña necesita al menos 6 caracteres.');
    if (!(await asegurarSesion())) throw new Error('Primero elige un apodo.');
    await pedir('/auth/v1/user', { metodo: 'PUT', cuerpo: { email: e, password: clave } });
    return true;   // Supabase manda un mail para confirmar; hasta entonces la cuenta sigue andando igual
  }
  // las de siempre, para el que ya tiene cuenta con mail en cualquiera de las tres apps
  async function entrarConClave(email, clave) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    const d = await pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', sinToken: true, cuerpo: { email: e, password: clave } });
    if (!guardarSesionDe(d)) throw new Error('No pude entrar.');
    await asegurarPerfil(e);
    return sesion;
  }
  async function crearCuenta(email, clave) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    if (String(clave || '').length < 6) throw new Error('La contraseña necesita al menos 6 caracteres.');
    const d = await pedir('/auth/v1/signup', { metodo: 'POST', sinToken: true, cuerpo: { email: e, password: clave } });
    const s = guardarSesionDe(d);
    if (s) await asegurarPerfil(e);
    return { sesion: s, confirmar: !s };
  }
  // El link del mail: la vuelta va en la DIRECCIÓN (?redirect_to=), no en el cuerpo. Supabase ignora un `options` en el
  // cuerpo del pedido (eso lo traduce su librería, que acá no se usa) y manda a la Site URL: armael11.com, siempre.
  async function pedirLink(email, volverA) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    await pedir('/auth/v1/otp' + (volverA ? '?redirect_to=' + encodeURIComponent(volverA) : ''), { metodo: 'POST', sinToken: true, cuerpo: { email: e, create_user: true } });
    return true;
  }
  // Adentro de la app no sirve un link: el mail se abre en el navegador del teléfono y la sesión queda allá, no en la app.
  // Por eso la app pide un CÓDIGO: el mismo mail trae seis números ({{ .Token }} en la plantilla de Supabase) y se escriben acá.
  async function pedirCodigo(email) {
    const e = limpiarMail(email);
    if (!MAIL_OK(e)) throw new Error('Ese mail no parece un mail.');
    await pedir('/auth/v1/otp', { metodo: 'POST', sinToken: true, cuerpo: { email: e, create_user: true } });
    return e;
  }
  async function entrarConCodigo(email, codigo) {
    const e = limpiarMail(email); const t = String(codigo || '').replace(/\D/g, '');
    if (t.length < 6) throw new Error('El código son los números que llegaron al mail.');
    let d;
    try { d = await pedir('/auth/v1/verify', { metodo: 'POST', sinToken: true, cuerpo: { type: 'email', email: e, token: t } }); }
    catch (err) { throw new Error(/expired|invalid|otp/i.test(err.message || '') ? 'Ese código no sirve o ya venció. Pide uno nuevo.' : err.message); }
    if (!guardarSesionDe(d)) throw new Error('No pude entrar.');
    await asegurarPerfil(e);
    return sesion;
  }
  // el link del mail vuelve con #access_token=…: se captura y se guarda
  function capturarVuelta() {
    const m = /[#&]access_token=([^&]+)/.exec(location.hash || ''); if (!m) return false;
    const q = new URLSearchParams(location.hash.slice(1));
    guardarSesionDe({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') });
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return true;
  }
  // un perfil para la cuenta con mail que no lo tenía: el apodo sale del mail (lo mismo que hace Sacá vos)
  async function asegurarPerfil(email) {
    if (!sesion) return null;
    if (await miPerfil()) return PERFIL;
    const base = (limpiarMail(email || '').split('@')[0] || 'jugador').replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'jugador';
    try { PERFIL = { usuario: await rpc('ponerme_apodo', { p_apodo: base }) }; } catch (e) { PERFIL = null; }
    return PERFIL;
  }
  async function borrarMiCuenta() {
    if (!sesion || !sesion.uid) throw new Error('Hay que entrar primero.');
    await rpc('borrar_mi_cuenta', {});
    salir();
    return true;
  }
  // ---------- el pase: qué tengo, según el servidor ----------
  // Fútbol vive en perfil.plan + premium_hasta (Armá el 11); tenis y NBA en `pase` (sacavos / quinteto).
  async function misPases() {
    const out = { futbol: null, tenis: null, nba: null };
    if (!sesion) return out;
    try {
      const f = await pedir('/rest/v1/perfil?select=plan,premium_hasta&id=eq.' + sesion.uid);
      const p = f && f[0];
      if (p && p.premium_hasta && Date.parse(p.premium_hasta) > Date.now() && p.plan && p.plan !== 'gratis') out.futbol = p.premium_hasta;
    } catch (e) {}
    try {
      const ps = await pedir('/rest/v1/pase?select=producto,hasta&perfil=eq.' + sesion.uid);
      for (const x of ps || []) {
        if (Date.parse(x.hasta) <= Date.now()) continue;
        if (x.producto === 'sacavos') out.tenis = x.hasta;
        if (x.producto === 'quinteto') out.nba = x.hasta;
      }
    } catch (e) {}
    return out;
  }
  async function cobra() {
    try { const f = await pedir('/rest/v1/ajuste?select=clave,valor&clave=in.(cobra,cobra_sacavos,cobra_quinteto)', { sinToken: true }); const m = {}; for (const x of f || []) m[x.clave] = x.valor === 'si'; return { futbol: !!m.cobra, tenis: !!m.cobra_sacavos, nba: !!m.cobra_quinteto }; }
    catch (e) { return { futbol: true, tenis: true, nba: true }; }
  }
  // la compra en la web (Mercado Pago): el servidor arma el link; el plan es uno de mam.futbol / mam.tenis / mam.nba / mam.todo
  async function planesWeb() {
    const { url, anon } = cfg();
    const r = await fetch(url + '/functions/v1/crear-pago', { headers: { apikey: anon, Authorization: 'Bearer ' + anon } });
    if (!r.ok) throw new Error('No pude traer los planes.');
    return ((await r.json()) || {}).planes || [];
  }
  async function linkDePago(plan) {
    const { url, anon } = cfg();
    if (!sesion) throw new Error('Hay que entrar primero.');
    const r = await fetch(url + '/functions/v1/crear-pago', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + sesion.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !(d.link || d.url)) throw new Error(d.error || 'No pude armar el pago.');
    return d.link || d.url;
  }
  // después de comprar en la tienda: el servidor le pregunta a RevenueCat y acredita
  async function avisarPagoDeTienda() {
    const { url, anon } = cfg();
    if (!sesion) throw new Error('Hay que entrar primero.');
    const r = await fetch(url + '/functions/v1/pago-apple', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + sesion.token, 'Content-Type': 'application/json' }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No pude confirmar la compra.');
    return d;
  }
  raiz.mamCuentas = { hayBackend, pedir, rpc, quienSoy: () => sesion, asegurarSesion, salir, esAnonima, miPerfil, perfil: () => PERFIL,
    entrarConApodo, atarMail, entrarConClave, crearCuenta, pedirLink, pedirCodigo, entrarConCodigo, capturarVuelta, asegurarPerfil, borrarMiCuenta,
    misPases, cobra, planesWeb, linkDePago, avisarPagoDeTienda };
})(typeof window !== 'undefined' ? window : globalThis);
