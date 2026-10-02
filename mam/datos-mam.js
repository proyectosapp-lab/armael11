// datos-mam.js — la foto de datos que viaja adentro del paquete, y cómo se pone al día. Script clásico, genérico.
// Lo usa cada sub-app (tenis, NBA) adentro de Mano a mano. El empaquetador saca de la página los <script> de datos y
// el de la app, y pone en su lugar un bloque `window.MAM_DATOS = {...}` seguido de este archivo. Acá:
//   1. se cargan los archivos de datos empaquetados (la foto: siempre están, siempre instantáneos),
//   2. se mira si en IndexedDB quedó algo más nuevo de la última vez,
//   3. se intenta bajar lo más nuevo de la web COMO DATOS (se recorta el "window.X = " y se lee con JSON.parse,
//      nunca se ejecuta: regla 2.5.2 de Apple), con un tope de espera para no frenar la pantalla,
//   4. se deja en window lo más nuevo de las tres cosas y recién entonces se carga la app.
// Regla: nada de acá puede frenar la pantalla. Todo error se traga; sin red, la app queda con la foto.
(function (raiz) {
  'use strict';
  const C = raiz.MAM_DATOS || {};
  const ORIGEN = String(C.origen || '').replace(/\/$/, '');
  const ARCHIVOS = C.archivos || [];          // [[global, ruta], ...]
  const DESPUES = C.despues || [];            // scripts de la app, en orden
  const ESPERA_MS = C.espera || 4000;
  const DB = 'mam-datos-' + (C.nombre || ORIGEN.replace(/[^a-z0-9]/gi, '')), ALMACEN = 'archivos';

  function parsear(texto) { const t = String(texto || ''); const i = t.indexOf('{'), f = t.lastIndexOf('}'); if (i < 0 || f <= i) return null; try { return JSON.parse(t.slice(i, f + 1)); } catch (e) { return null; } }
  function cargarScript(src) { return new Promise((res) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); }); }
  function abrirDB() { return new Promise((res) => { try { const p = indexedDB.open(DB, 1); p.onupgradeneeded = () => { try { p.result.createObjectStore(ALMACEN); } catch (e) {} }; p.onsuccess = () => res(p.result); p.onerror = () => res(null); p.onblocked = () => res(null); } catch (e) { res(null); } }); }
  function leer(db, k) { return new Promise((res) => { try { const t = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(k); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); } catch (e) { res(null); } }); }
  function guardar(db, k, v) { return new Promise((res) => { try { const t = db.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).put(v, k); t.onsuccess = () => res(true); t.onerror = () => res(false); } catch (e) { res(false); } }); }
  const generadoDe = (d) => String((d && (d.generado || d.fecha)) || '');
  const masNuevo = (a, b) => !b ? a : !a ? b : (generadoDe(a) >= generadoDe(b) ? a : b);
  const valido = (d) => d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length > 0;
  async function traer(ruta) {
    if (!ORIGEN) return null;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), ESPERA_MS);
    try { const r = await fetch(ORIGEN + '/' + ruta + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }); if (!r.ok) return null; return parsear(await r.text()); }
    catch (e) { return null; } finally { if (timer) clearTimeout(timer); }
  }
  raiz.mamDatosListos = (async () => {
    for (const [, ruta] of ARCHIVOS) await cargarScript(ruta);           // 1. la foto
    const db = await abrirDB();
    const red = await Promise.all(ARCHIVOS.map(([, ruta]) => traer(ruta)));   // 3. la web, todo junto
    for (let i = 0; i < ARCHIVOS.length; i++) {
      const [clave] = ARCHIVOS[i];
      let mejor = raiz[clave] || null;
      if (db) { const g = await leer(db, clave); if (valido(g)) mejor = masNuevo(mejor, g); }   // 2. lo guardado
      if (valido(red[i])) { mejor = masNuevo(mejor, red[i]); if (db) guardar(db, clave, red[i]); }
      if (mejor) raiz[clave] = mejor;
    }
    raiz.MAM_DATOS_ORIGEN = 'app';
    for (const src of DESPUES) await cargarScript(src);                      // 4. la app
    return true;
  })();
})(typeof window !== 'undefined' ? window : globalThis);
