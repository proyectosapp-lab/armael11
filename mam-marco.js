// mam-marco.js — lo que una web (Armá el 11, Sacá vos, el Quinteto) necesita para vivir adentro de Mano a mano.
// Se carga en las tres. Si la página NO está adentro de la app (sin ?mam=1), no hace nada: window.MAM_MARCO queda
// en false y la web sigue siendo la web. Adentro, pone body.mam-marco (el CSS esconde cabecera, pie y cuenta) y
// habla con el cascarón por postMessage. Sin bundler, sin dependencias.
(function (raiz) {
  'use strict';
  const q = new URLSearchParams(location.search || '');
  // ?mam=1 lo pone el cascarón al cargar el marco; se guarda en sessionStorage para que sobreviva a las navegaciones
  // de adentro (en fútbol: elegir club → la página del club), que no llevan el parámetro.
  let adentro = q.get('mam') === '1';
  try { if (adentro) sessionStorage.setItem('mam.adentro', '1'); else if (raiz.parent !== raiz && sessionStorage.getItem('mam.adentro') === '1') adentro = true; } catch (e) {}
  raiz.MAM_MARCO = adentro;
  const deporte = document.documentElement.getAttribute('data-mam-deporte') || (/sacavos/i.test(location.href + document.title) ? 'tenis' : /quinteto|starting5|nba/i.test(location.href + document.title) ? 'nba' : 'futbol');
  const alPadre = (m) => { try { if (raiz.parent && raiz.parent !== raiz) raiz.parent.postMessage(m, '*'); } catch (e) {} };
  const escuchas = [];
  function alIr(fn) { escuchas.push(fn); }
  if (adentro) {
    document.documentElement.classList.add('mam-marco');
    const ponerBody = () => document.body && document.body.classList.add('mam-marco');
    if (document.body) ponerBody(); else document.addEventListener('DOMContentLoaded', ponerBody);
    raiz.addEventListener('message', (ev) => {
      const m = ev.data; if (!m || typeof m !== 'object' || m.mam !== 'ir') return;
      escuchas.forEach((fn) => { try { fn(m.a); } catch (e) {} });
      try { raiz.scrollTo(0, 0); } catch (e) {}
    });
    // botones marcados en el HTML: data-mam-pase (mostrá los planes) y data-mam-cuenta (llevame a Cuenta)
    document.addEventListener('click', (ev) => {
      const t = ev.target && ev.target.closest && ev.target.closest('[data-mam-pase],[data-mam-cuenta]'); if (!t) return;
      ev.preventDefault();
      if (t.hasAttribute('data-mam-pase')) alPadre({ mam: 'pase', deporte: t.getAttribute('data-mam-pase') || deporte });
      else alPadre({ mam: 'cuenta' });
    });
    // los links externos los abre el cascarón (afuera, en el navegador del teléfono)
    document.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest('a[href]'); if (!a) return;
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) && !a.hasAttribute('data-mam-adentro')) { ev.preventDefault(); alPadre({ mam: 'abrir', url: href }); }
    });
    // la sesión cambió desde este marco (entró / salió): que el cascarón se entere
    raiz.addEventListener('storage', (ev) => { if (ev.key === 'tste.sesion') alPadre({ mam: 'sesion' }); });
  }
  raiz.mamMarco = {
    adentro: () => adentro, deporte,
    listo: () => adentro && alPadre({ mam: 'listo', deporte }),
    pase: (d) => adentro && alPadre({ mam: 'pase', deporte: d || deporte }),
    cuenta: () => adentro && alPadre({ mam: 'cuenta' }),
    desafios: () => adentro && alPadre({ mam: 'desafios' }),
    sesion: () => adentro && alPadre({ mam: 'sesion' }),
    vibrar: (tipo) => adentro && alPadre({ mam: 'vibrar', tipo }),
    compartir: (texto, url, titulo) => adentro && alPadre({ mam: 'compartir', texto, url, titulo }),
    alIr,
    // el candado de cada web, adentro de la app: una tarjeta sola, sin formulario ni Mercado Pago. El plan se compra en Cuenta.
    candadoHTML: (o) => {
      o = o || {};
      return `<div class="${o.clase || 'mam-candado'}"><h2>${o.titulo || 'Esto es del plan'}</h2><p>${o.texto || 'Los juegos, los desafíos y los resultados son gratis siempre.'}</p><button type="button" class="${o.boton || 'mam-candado-boton'}" data-mam-pase="${o.deporte || deporte}">Ver los planes</button></div>`;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
