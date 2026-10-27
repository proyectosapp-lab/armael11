// hitos.js — contar qué pasa adentro de Mano a mano, sin seguir a nadie (27/10/2026).
// Es el campana.js de la app, en chico. Una fila por código, día e hito, con un número al lado (tabla campana_hito,
// función sumar_hito). Sin identificador de persona, sin IP, sin hora. El "esto ya lo conté" vive en el teléfono.
//
//   El código de uso:  mam-app (instalada) o mam-web (armael11.com/app)
//   Los hitos:         abrio    una vez por día por teléfono
//                      desafio  abrió un desafío (una vez por teléfono)
//                      eligio   tocó un partido en un desafío (una vez)
//                      guardo   guardó sus elecciones (una vez)
//                      cuenta   se puso un apodo o entró (una vez)
//                      planes   miró los planes (una vez)
//   Si la persona llegó con ?c=CODIGO (un anuncio), los mismos hitos se cuentan también bajo ese código, 30 días.
//
// REGLA: esto no puede romper ni frenar nada. Cada llamada es sin await, cada error se traga. Sin backend, no hace nada.
(function (raiz) {
  'use strict';
  const S = () => raiz.MAM_SITIO || {};
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const hoyAR = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const DIAS_CAMPANA = 30;

  function mandar(codigo, hito) {
    try {
      const sb = S().supabase || {}; if (!sb.url || !sb.anon) return false;
      fetch(sb.url + '/rest/v1/rpc/sumar_hito', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: sb.anon, Authorization: 'Bearer ' + sb.anon }, body: JSON.stringify({ p_codigo: codigo, p_hito: hito }), keepalive: true }).catch(() => {});
      return true;
    } catch (e) { return false; }
  }
  const enApp = () => { try { const n = raiz.mamNativo; return !!(n && n.hayNativo && n.hayNativo()); } catch (e) { return false; } };
  const codigoUso = () => (enApp() ? 'mam-app' : 'mam-web');

  // ── la campaña: ?c=CODIGO en la dirección. Se guarda, se saca de la barra (un link compartido no arrastra el anuncio) ──
  function campana() {
    const c = leer('mam.campana', null);
    if (!c || !c.codigo || !c.desde) return null;
    if (Date.now() - c.desde > DIAS_CAMPANA * 864e5) return null;
    return c.codigo;
  }
  function leerCampana() {
    try {
      const u = new URL(location.href); const c = (u.searchParams.get('c') || '').trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,24}$/.test(c)) return null;
      u.searchParams.delete('c');
      try { history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash); } catch (e) {}
      guardar('mam.campana', { codigo: c, desde: Date.now() });
      const ya = leer('mam.hitos', {}); if (!ya[c + ':llego']) { ya[c + ':llego'] = 1; guardar('mam.hitos', ya); mandar(c, 'llego'); }
      return c;
    } catch (e) { return null; }
  }

  // ── un hito: una vez por teléfono (y, si vino de un anuncio, también bajo ese código) ──
  function hito(nombre) {
    try {
      if (!/^[a-z]{1,16}$/.test(nombre)) return false;
      const ya = leer('mam.hitos', {}); let alguno = false;
      for (const codigo of [codigoUso(), campana()].filter(Boolean)) {
        const k = codigo + ':' + nombre; if (ya[k]) continue;
        ya[k] = 1; alguno = true; mandar(codigo, nombre);
      }
      if (alguno) guardar('mam.hitos', ya);
      return alguno;
    } catch (e) { return false; }
  }
  // ── abrió: una vez por día ──
  function abrio() {
    try {
      const hoy = hoyAR(); const d = leer('mam.hitosDia', {});
      if (d.abrio === hoy) return false;
      guardar('mam.hitosDia', { abrio: hoy });
      return mandar(codigoUso(), 'abrio');
    } catch (e) { return false; }
  }
  function arrancar() { leerCampana(); abrio(); }
  raiz.mamHitos = { hito, abrio, campana, arrancar, _codigo: codigoUso };
})(typeof window !== 'undefined' ? window : globalThis);
