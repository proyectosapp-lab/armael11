// nativo-mam.js — lo que Mano a mano hace adentro del teléfono y un navegador no. Script clásico, expone window.mamNativo.
// Los plugins se leen de window.Capacitor.Plugins en el momento de usarlos: sin import, sin bundler. Cada función
// pregunta si hay plugin y, si no, devuelve false y el que llamó sigue con el camino de la web.
(function (raiz) {
  'use strict';
  const P = () => (raiz.Capacitor && raiz.Capacitor.Plugins) || null;
  const hayNativo = () => !!(raiz.Capacitor && raiz.Capacitor.isNativePlatform && raiz.Capacitor.isNativePlatform());
  const plataforma = () => (hayNativo() && raiz.Capacitor.getPlatform) ? raiz.Capacitor.getPlatform() : 'web';
  const esIos = () => plataforma() === 'ios';
  const esAndroid = () => plataforma() === 'android';
  function vibrar(tipo) {
    const p = P();
    if (!p || !p.Haptics) { if (navigator.vibrate) { try { navigator.vibrate(tipo === 'partido' ? 60 : tipo === 'set' ? 30 : 12); } catch (e) {} } return false; }
    try { p.Haptics.impact({ style: tipo === 'partido' ? 'HEAVY' : tipo === 'set' ? 'MEDIUM' : 'LIGHT' }); return true; } catch (e) { return false; }
  }
  async function compartir(texto, url, titulo) {
    const p = P();
    if (p && p.Share) { try { await p.Share.share({ text: texto, url, dialogTitle: titulo || 'Compartir' }); return true; } catch (e) { return /cancel/i.test(String((e && e.message) || '')); } }
    try { if (navigator.share) { await navigator.share({ text: texto, url }); return true; } } catch (e) { return true; }
    return false;
  }
  // compartir una imagen (dataURL png): adentro del teléfono se guarda en el cache y se comparte como archivo;
  // en la web se baja.
  async function compartirImagen(dataUrl, nombre, texto) {
    const p = P();
    if (p && p.Filesystem && p.Share) {
      try {
        const base64 = String(dataUrl).split(',')[1];
        const w = await p.Filesystem.writeFile({ path: nombre, data: base64, directory: 'CACHE' });
        await p.Share.share({ text: texto, files: [w.uri], dialogTitle: 'Compartir' });
        return true;
      } catch (e) { if (/cancel/i.test(String((e && e.message) || ''))) return true; }
    }
    try { const a = document.createElement('a'); a.href = dataUrl; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); return true; } catch (e) { return false; }
  }
  async function abrir(url) {
    const p = P(); if (!p || !p.Browser) return false;
    try { await p.Browser.open({ url, presentationStyle: 'popover' }); return true; } catch (e) { return false; }
  }
  function engancharLinks(doc) {
    doc = doc || document; if (!hayNativo()) return false;
    doc.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest('a[href]'); if (!a) return;
      const href = a.getAttribute('href') || ''; if (!/^https?:\/\//i.test(href)) return;
      ev.preventDefault(); abrir(href);
    });
    return true;
  }
  async function hayRed() {
    const p = P(); if (!p || !p.Network) return navigator.onLine !== false;
    try { const e = await p.Network.getStatus(); return !!e.connected; } catch (e) { return true; }
  }
  function alCambiarRed(fn) {
    const p = P();
    if (p && p.Network) { try { p.Network.addListener('networkStatusChange', (e) => fn(!!e.connected)); return true; } catch (e) {} }
    window.addEventListener('online', () => fn(true)); window.addEventListener('offline', () => fn(false));
    return false;
  }
  // ── los avisos ──
  // Se pide permiso recién cuando hay un motivo (al crear o unirse a un desafío), nunca al abrir la app: pedirlo
  // de entrada es lo que la gente rechaza. El token va al servidor (registrar_dispositivo) atado al perfil.
  let alToken = null;
  async function pedirAvisos(cuandoHayToken) {
    const p = P(); if (!p || !p.PushNotifications) return false;
    if (!((raiz.MAM_SITIO || {}).avisos)) return false;   // todavía sin servidor de avisos: no se pide permiso al pedo
    alToken = cuandoHayToken;
    try {
      let s = await p.PushNotifications.checkPermissions();
      if (s.receive === 'prompt' || s.receive === 'prompt-with-rationale') s = await p.PushNotifications.requestPermissions();
      if (s.receive !== 'granted') return false;
      p.PushNotifications.addListener('registration', (t) => { if (alToken && t && t.value) alToken(t.value, plataforma()); });
      p.PushNotifications.addListener('registrationError', (e) => console.error('push', e));
      p.PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        const d = (a && a.notification && a.notification.data) || {};
        if (d.desafio) { try { location.hash = '#desafio=' + d.desafio; } catch (e) {} window.dispatchEvent(new CustomEvent('mam-aviso', { detail: d })); }
      });
      await p.PushNotifications.register();
      return true;
    } catch (e) { console.error('push', e); return false; }
  }
  // la reseña en la tienda (App Store / Play): la hoja nativa, que el sistema muestra o no (Apple: hasta 3 veces al año).
  // Nunca a cambio de nada: Apple lo prohíbe. Cuándo pedirla lo decide el cascarón (momentos de uso real).
  async function pedirResena() {
    const p = P(); if (!p || !p.InAppReview) return false;
    try { await p.InAppReview.requestReview(); return true; } catch (e) { return false; }
  }
  // el link universal (armael11.com/desafio.html#CODIGO) con la app ya instalada: Capacitor avisa por appUrlOpen
  function alAbrirLink(fn) {
    const p = P(); if (!p || !p.App) return false;
    try { p.App.addListener('appUrlOpen', (e) => fn(String((e && e.url) || ''))); return true; } catch (e) { return false; }
  }
  function bajarDeLaHora() {
    try {
      if (!esIos()) return;
      const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
      document.body.appendChild(d); const alto = parseFloat(getComputedStyle(d).paddingTop) || 0; d.remove();
      if (alto < 1) document.documentElement.style.setProperty('--arriba', (Math.max(screen.height, screen.width) >= 812 ? 50 : 20) + 'px');
    } catch (e) {}
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bajarDeLaHora); else bajarDeLaHora(); }
  raiz.mamNativo = { hayNativo, plataforma, esIos, esAndroid, vibrar, compartir, compartirImagen, abrir, engancharLinks, hayRed, alCambiarRed, pedirAvisos, alAbrirLink, pedirResena };
})(typeof window !== 'undefined' ? window : globalThis);
