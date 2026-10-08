// juegos.js — los juegos de Mano a mano: Penales, Tiro libre (fútbol) y Triples (NBA). Script clásico, expone
// window.mamJuegos. Un solo motor (gesto de deslizar → dirección, potencia y efecto; pelota en 3D con gravedad y
// comba; una cámara con perspectiva; dibujo en canvas sin imágenes; sonido sintetizado sin archivos) y tres pieles.
// El de tenis (el saque) vive en la web de Sacá vos, con el mismo espíritu: el punto se juega entero, a la vista.
//
//   mamJuegos.montar(el, 'penales' | 'libre' | 'triples', { ahora, vibrar, compartir, rival, alTerminar })
//   mamJuegos.desmontar()
//
// Reglas de diseño: todo es gratis; sin plata, sin premios; "vs el modelo" es el rival (un arquero o un defensor
// con número), nunca un jugador real con nombre y foto. Nada de acá toca la red.
//
// Determinismo: la física corre a paso fijo (1/120 s) y lo único al azar pasa por `azar()`, que el simulador
// reemplaza por una semilla. El dibujo (confeti, tribuna, estrellas) usa `hash(i)` y el reloj del juego, nunca
// `azar()`: así el simulador sin pantalla juega exactamente lo mismo que el teléfono.
(function (raiz) {
  'use strict';
  const W = 360, H = 540;                                   // el lienzo lógico: se escala al ancho que haya
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let O = {};                                               // opciones del cascarón
  const ahora = () => (O.ahora ? O.ahora() : (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const vibrar = (t) => { try { O.vibrar && O.vibrar(t); } catch (e) {} };
  const azar = () => (O.azar ? O.azar() : Math.random());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const hash = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const leer = (k, d) => { try { const v = raiz.localStorage && raiz.localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const guardar = (k, v) => { try { raiz.localStorage && raiz.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const reducido = () => { try { return !!(raiz.matchMedia && raiz.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  /* ─── el sonido: todo sintetizado con Web Audio (sin archivos, sin derechos de nadie). Se despierta con el
     primer toque, que es lo que piden los teléfonos. Se apaga con el botón, y queda guardado. ─── */
  const Sonido = (() => {
    let ctx = null, on = leer('mam.sonido', false) === true, ruidoBuf = null, amb = null;
    const ac = () => { if (!on) return null; try { const AC = raiz.AudioContext || raiz.webkitAudioContext; if (!AC) return null; ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch (e) { return null; } };
    const buf = (c) => { if (!ruidoBuf) { ruidoBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = ruidoBuf.getChannelData(0); let s = 1; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; } } return ruidoBuf; };
    function tono(f0, f1, dur, tipo, vol, retraso) {
      const c = ac(); if (!c) return; const t = c.currentTime + (retraso || 0);
      const o = c.createOscillator(), g = c.createGain(); o.type = tipo || 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 || f0), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function ruido(dur, vol, tipoFiltro, f0, f1, retraso) {
      const c = ac(); if (!c) return; const t = c.currentTime + (retraso || 0);
      const src = c.createBufferSource(); src.buffer = buf(c); src.loop = true;
      const f = c.createBiquadFilter(); f.type = tipoFiltro || 'lowpass'; f.frequency.setValueAtTime(f0 || 1000, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + 0.05);
    }
    const E = {
      patada: () => { tono(110, 45, 0.14, 'sine', 0.7); ruido(0.06, 0.25, 'lowpass', 900); },
      pique: () => { tono(160, 90, 0.09, 'sine', 0.35); },
      poste: () => { tono(1900, 1500, 0.35, 'triangle', 0.25); tono(2900, 2500, 0.22, 'sine', 0.12); ruido(0.04, 0.2, 'highpass', 3000); },
      red: () => { ruido(0.3, 0.3, 'bandpass', 2500, 900); },
      atajada: () => { ruido(0.1, 0.45, 'lowpass', 700); tono(200, 120, 0.08, 'sine', 0.3); },
      gol: () => { ruido(1.6, 0.55, 'lowpass', 500, 1400); ruido(1.2, 0.25, 'bandpass', 900, 1600, 0.1); },
      ohh: () => { ruido(0.7, 0.3, 'lowpass', 400, 250); },
      silbato: () => { tono(2300, 2300, 0.22, 'square', 0.07); tono(2300, 2300, 0.4, 'square', 0.07, 0.28); },
      swish: () => { ruido(0.22, 0.35, 'highpass', 3500); },
      aro: () => { tono(1400, 1300, 0.18, 'triangle', 0.22); },
      tablero: () => { tono(320, 200, 0.12, 'square', 0.1); ruido(0.05, 0.2, 'lowpass', 1500); },
      buzzer: () => { tono(230, 230, 0.7, 'sawtooth', 0.2); },
      tic: () => { tono(1100, 1100, 0.04, 'square', 0.07); },
      marca: () => { [523, 659, 784, 1047].forEach((f, i) => tono(f, f, 0.2, 'triangle', 0.16, i * 0.11)); },
    };
    // el murmullo de la tribuna: ruido grave, bajito, con una respiración lenta
    function murmurar(si) {
      if (!si) { if (amb) { try { amb.g.gain.exponentialRampToValueAtTime(0.0001, amb.c.currentTime + 0.4); amb.src.stop(amb.c.currentTime + 0.5); amb.lfo.stop(amb.c.currentTime + 0.5); } catch (e) {} amb = null; } return; }
      const c = ac(); if (!c || amb) return;
      try {
        const src = c.createBufferSource(); src.buffer = buf(c); src.loop = true;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 360;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.045, c.currentTime + 2);
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.02; lfo.connect(lg).connect(g.gain); lfo.start();
        src.connect(f).connect(g).connect(c.destination); src.start(); amb = { src, g, c, lfo };
      } catch (e) {}
    }
    return {
      tocar: (n) => { try { E[n] && E[n](); } catch (e) {} },
      despertar: () => { ac(); },
      activo: () => on,
      alternar: () => { on = !on; guardar('mam.sonido', on); if (!on) murmurar(false); else { ac(); murmurar(true); } return on; },
      murmurar,
    };
  })();
  const son = (n) => Sonido.tocar(n);
  // al irse a segundo plano, la tribuna se calla; vuelve con el próximo toque
  try { raiz.document && raiz.document.addEventListener('visibilitychange', () => { if (raiz.document.hidden) Sonido.murmurar(false); }); } catch (e) {}

  /* ─── la cámara: mundo (x a la derecha, y arriba, z adelante; metros) → pantalla ───
     La cámara está en (0, altura, 0) mirando a +z, con un poco de inclinación hacia abajo. */
  // Una cámara de verdad: está en (x0, alt, z0), mira hacia +z (dir 1) o −z (dir −1) e inclina la vista hacia abajo
  // `pitch` radianes. `cy` es dónde cae en pantalla la línea de la mirada; el horizonte queda más arriba, en cy − foco·tan(pitch).
  function camara(cfg) {
    const C = Object.assign({ x0: 0, alt: 1.5, z0: 0, dir: 1, pitch: 0, foco: 330, cy: 215 }, cfg);
    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    const cam = {
      alt: C.alt, foco: C.foco, z0: C.z0, dir: C.dir, pitch: C.pitch, cy: C.cy, x0: C.x0,
      hz: C.cy - C.foco * Math.tan(C.pitch),
      p: (x, y, z) => {
        const dx = C.dir * (x - C.x0), dz = C.dir * (z - C.z0), dy = y - C.alt;
        const d = Math.max(0.3, dz * cp - dy * sp), yv = dy * cp + dz * sp;
        return { x: W / 2 + (dx * C.foco) / d, y: C.cy - (yv * C.foco) / d, k: C.foco / d, d };
      },
      // la misma cámara, un poco más cerca: el "empujón" mientras la pelota vuela
      cerca: (push) => camara(Object.assign({}, C, { foco: C.foco * (1 + push) })),
    };
    return cam;
  }

  /* ─── el gesto: deslizar. Devuelve dirección (−1…1), largo (px), velocidad (px/ms) y comba (−1…1) ─── */
  function Gesto(cv, alSoltar, alMover) {
    let pts = null;
    const xy = (ev) => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H, t: ahora() }; };
    cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); try { cv.setPointerCapture(ev.pointerId); } catch (e) {} Sonido.despertar(); Sonido.murmurar(true); pts = [xy(ev)]; });
    cv.addEventListener('pointermove', (ev) => { if (!pts) return; pts.push(xy(ev)); if (pts.length > 60) pts.splice(1, 1); alMover && alMover(resumen(pts)); });
    const fin = (ev) => { if (!pts) return; pts.push(xy(ev)); const r = resumen(pts); pts = null; alSoltar(r); };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    function resumen(p) {
      const a = p[0], b = p[p.length - 1];
      const dx = b.x - a.x, dy = b.y - a.y, largo = Math.hypot(dx, dy), dt = Math.max(16, b.t - a.t);
      // comba: cuánto se aparta el camino de la cuerda (positivo = curva hacia la derecha mirando hacia arriba)
      let comba = 0;
      if (largo > 30 && p.length > 4) {
        const m = p[Math.floor(p.length / 2)];
        const cross = (dx * (m.y - a.y) - dy * (m.x - a.x)) / largo;   // distancia con signo a la cuerda
        comba = clamp(cross / (largo * 0.35), -1, 1);
      }
      return { dx, dy, largo, vel: largo / dt, comba, angulo: Math.atan2(dx, -dy), toque: largo < 12, x: a.x, y: a.y };
    }
    return { cancelar: () => { pts = null; } };
  }

  /* ─── el lienzo ─── */
  let CV = null, CTX = null, anim = null, G = null, gesto = null, RAIZ = null;
  function prepararLienzo(cv) {
    const ancho = Math.min(430, cv.parentElement.clientWidth || 360); const dpr = Math.min(2, (raiz.devicePixelRatio || 1));
    cv.style.width = ancho + 'px'; cv.style.height = Math.round(ancho * H / W) + 'px';
    cv.width = Math.round(ancho * dpr); cv.height = Math.round(ancho * H / W * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h, r) { this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
    return ctx;
  }
  // paso fijo (1/120 s): la física sale igual a 30, 60 o 120 cuadros por segundo, y si un cuadro se saltea no cambia el tiro
  const PASO = 1 / 120;
  function loop() { parar(); let ult = ahora(), acum = 0; const paso = () => { if (!G) return; const t = ahora(); acum += Math.min(0.1, Math.max(0, t - ult) / 1000); ult = t; while (acum >= PASO) { G.avanzar(PASO); acum -= PASO; } G.dibujar(); anim = requestAnimationFrame(paso); }; anim = requestAnimationFrame(paso); }
  function parar() { if (anim) cancelAnimationFrame(anim); anim = null; }

  /* ─── piezas de dibujo compartidas ─── */
  function sombra(ctx, p, r, a) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.3, r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function pelotaFutbol(ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#e6e9ee'); g.addColorStop(1, '#b9bec6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip(); ctx.rotate(rot); ctx.fillStyle = '#1b1b1f';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const cx = Math.cos(a) * r * 0.62, cy = Math.sin(a) * r * 0.62; ctx.beginPath(); for (let k = 0; k < 5; k++) { const b = a + k * Math.PI * 2 / 5; ctx.lineTo(cx + Math.cos(b) * r * 0.26, cy + Math.sin(b) * r * 0.26); } ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const b = rot + k * Math.PI * 2 / 5; ctx.lineTo(Math.cos(b) * r * 0.3, Math.sin(b) * r * 0.3); } ctx.closePath(); ctx.fill();
    ctx.restore();
    // el brillo de la luz
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function pelotaBasquet(ctx, x, y, r, rot, fuego) {
    ctx.save(); ctx.translate(x, y);
    if (fuego) { const f = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.2); f.addColorStop(0, 'rgba(255,200,60,.55)'); f.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = f; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill(); }
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, '#ffa75c'); g.addColorStop(0.75, '#e07a28'); g.addColorStop(1, '#a8480c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip(); ctx.rotate(rot);
    ctx.strokeStyle = '#2a1206'; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-r * 0.9, 0, r * 0.75, r * 1.05, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * 0.9, 0, r * 0.75, r * 1.05, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function texto(ctx, t, x, y, tam, color, peso, alin) { ctx.save(); ctx.font = (peso || 700) + ' ' + tam + 'px Poppins, system-ui, sans-serif'; ctx.fillStyle = color; ctx.textAlign = alin || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); ctx.restore(); }
  function cartel(ctx, t, sub, color, k) {
    // el golpe de texto: entra grande, rebota y se asienta
    const s = 1 + 0.6 * (1 - easeOut(k * 3)) + 0.05 * Math.sin(k * 40) * (1 - k); ctx.save(); ctx.translate(W / 2, H * 0.4); ctx.scale(s, s);
    ctx.globalAlpha = k > 0.8 ? clamp((1 - k) * 5, 0, 1) : 1;
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    const tam = Math.min(56, Math.floor(620 / Math.max(5, t.length)));
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.font = '800 ' + tam + 'px Poppins, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(t, 0, 0);
    texto(ctx, t, 0, 0, tam, color, 800); ctx.shadowBlur = 0; if (sub) texto(ctx, sub, 0, 44, 16, '#fff', 600); ctx.restore();
  }
  function flechaGuia(ctx, x, y, k, vertical) {
    // la insinuación del gesto: un dedo que desliza, en bucle
    const a = (k % 1.6) / 1.6; const al = a < 0.75 ? 1 : 1 - (a - 0.75) * 4; const d = easeOut(a / 0.75) * 90;
    ctx.save(); ctx.globalAlpha = 0.85 * al;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - d); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - d, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x, y - d, 18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // el marcador de arriba: vidrio oscuro con dos lados y, abajo, la consigna
  function hud(ctx, izq, der, abajo, color) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 8, 0, 50); g.addColorStop(0, 'rgba(10,12,28,.72)'); g.addColorStop(1, 'rgba(10,12,28,.5)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(10, 8, W - 20, 42, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(10.5, 8.5, W - 21, 41, 14); ctx.stroke();
    if (color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(W / 2 - 1.5, 16, 3, 26, 1.5); ctx.fill(); }
    texto(ctx, izq, 24, 29, 15, '#fff', 800, 'left'); texto(ctx, der, W - 24, 29, 15, '#fff', 800, 'right');
    if (abajo) { ctx.fillStyle = 'rgba(10,12,28,.6)'; ctx.beginPath(); ctx.roundRect(W / 2 - 128, H - 46, 256, 32, 11); ctx.fill(); texto(ctx, abajo, W / 2, H - 30, 13, '#fff', 600); }
    ctx.restore();
  }
  function tandas(ctx, lista, x, y, derecha) { const n = lista.length; for (let i = 0; i < n; i++) { const cx = derecha ? x - (n - 1 - i) * 15 : x + i * 15; ctx.beginPath(); ctx.arc(cx, y, 5.5, 0, Math.PI * 2); ctx.fillStyle = lista[i] === 1 ? '#3ED17A' : lista[i] === 0 ? '#E8473C' : 'rgba(255,255,255,.3)'; ctx.fill(); if (lista[i] == null) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke(); } } }
  // la lectura del gesto que acabás de hacer: dos barritas (fuerza y altura) que se apagan solas
  function lecturaGesto(ctx, L, t) {
    if (!L || t > 1.6) return; const al = t < 1.2 ? 1 : 1 - (t - 1.2) / 0.4;
    ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = 'rgba(10,12,28,.6)'; ctx.beginPath(); ctx.roundRect(12, 78, 118, 44, 10); ctx.fill();
    const barra = (y, nombre, v, c) => { texto(ctx, nombre, 20, y, 9.5, 'rgba(255,255,255,.75)', 700, 'left'); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.roundRect(62, y - 3.5, 60, 7, 3.5); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(62, y - 3.5, 60 * clamp(v, 0.04, 1), 7, 3.5); ctx.fill(); };
    barra(90, 'fuerza', L.fuerza, '#E8731C'); barra(110, 'altura', L.altura, '#8bb4ff'); ctx.restore();
  }
  // confeti: 70 papelitos que salen del centro y caen; todo sale de `hash`, así se ve igual en cada teléfono
  function confeti(ctx, e, colores) {
    if (e == null || e > 1.8) return; ctx.save();
    for (let i = 0; i < 70; i++) {
      const x0 = W / 2 + (hash(i) - 0.5) * 80, vx = (hash(i + 101) - 0.5) * 340, vy = -300 - hash(i + 202) * 220;
      const x = x0 + vx * e, y = H * 0.42 + vy * e + 300 * e * e; if (y > H + 10 || e < 0) continue;
      const rot = e * (hash(i + 303) - 0.5) * 14; const al = e < 1.3 ? 1 : 1 - (e - 1.3) / 0.5;
      ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = colores[i % colores.length]; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore();
    }
    ctx.restore();
  }
  // la estela de la pelota: fantasmas que se apagan; en llamas cuando hay racha
  function estela(ctx, cam, lista, rw, fuego) {
    if (!lista || lista.length < 2) return; ctx.save();
    for (let i = 0; i < lista.length; i++) { const q = cam.p(lista[i].x, lista[i].y, lista[i].z); const k = (i + 1) / lista.length; ctx.globalAlpha = (fuego ? 0.55 : 0.3) * k; ctx.fillStyle = fuego ? (i % 2 ? '#FFD23F' : '#FF7A1A') : '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.2, rw * q.k * (0.4 + 0.5 * k)), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  // la marca personal de cada juego, en el teléfono
  const marcaDe = (juego) => leer('mam.marca.' + juego, null);
  function anotarMarca(juego, fin, mejor) { const vieja = marcaDe(juego); const nueva = !vieja || mejor(fin, vieja); if (nueva) guardar('mam.marca.' + juego, fin); if (nueva && vieja && O.momento) { try { O.momento('marca'); } catch (e) {} } return nueva; }

  /* ═══════════════════════════════ FÚTBOL: el estadio, el arco, las figuras ═══════════════════════════════ */
  const ARCO = { ancho: 7.32, alto: 2.44, poste: 0.06 };
  // F: { euforia (0..1, la tribuna salta), gx (el arco corrido en x: tiro libre) }
  // La tribuna de fondo es un objeto en el mundo (filas que suben detrás del arco), no una franja pintada: se ve más
  // grande cuanto más cerca, y la gente de las primeras filas tiene tamaño de persona.
  function tribuna3D(cam, t, F, zPie, haciaCamara, opc) {
    const ctx = CTX; const dirF = haciaCamara ? -1 : 1;     // las filas suben alejándose de la cámara
    const O2 = Object.assign({ FILAS: 16, SUBE: 0.75, ATRAS: 0.85, X0: -34, X1: 34, valla: '#1F2440', fila: ['#2A2E4A', '#262A44'], escalon: '#1C1F36', techo: '#4A5078' }, opc || {});
    const FILAS = O2.FILAS, SUBE = O2.SUBE, ATRAS = O2.ATRAS, X0 = O2.X0, X1 = O2.X1;
    const eu = F.euforia || 0; const paleta = ['#4A4F6B', '#5B5F7A', '#E8E337', '#3C415C', '#DADADA', '#C2542E', '#4A4F6B', '#7D9BD9', '#3A9A62', '#2F3350', '#F0EFEA', '#6B4A3A'];
    // el muro del frente (la valla) y el fondo oscuro de la tribuna
    { const a = cam.p(X0, 0, zPie), b = cam.p(X1, 0, zPie), c = cam.p(X1, 1.1, zPie), d = cam.p(X0, 1.1, zPie); ctx.fillStyle = O2.valla; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
    // primero todos los escalones (de adelante hacia atrás), después toda la gente (de atrás hacia adelante):
    // así nadie queda tapado por el escalón de la fila de atrás
    for (let f = 0; f < FILAS; f++) {
      const z0 = zPie + dirF * f * ATRAS, z1 = z0 + dirF * ATRAS, y0 = 1.1 + f * SUBE, y1 = y0 + SUBE;
      const a = cam.p(X0, y0, z0), b = cam.p(X1, y0, z0), c = cam.p(X1, y0, z1), d = cam.p(X0, y0, z1);
      ctx.fillStyle = O2.fila[f % 2]; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
      const e = cam.p(X1, y1, z1), g = cam.p(X0, y1, z1); ctx.fillStyle = O2.escalon; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.lineTo(g.x, g.y); ctx.closePath(); ctx.fill();
    }
    for (let f = FILAS - 1; f >= 0; f--) {
      const z0 = zPie + dirF * f * ATRAS, y0 = 1.1 + f * SUBE;
      const n = 92; const zp = z0 + dirF * ATRAS * 0.5;
      for (let i = 0; i < n; i++) { const h = hash(f * 131 + i * 7); if (h < 0.07) continue; const x = X0 + 1 + (i + 0.5) * ((X1 - X0 - 2) / n) + (hash(f * 17 + i) - 0.5) * 0.35; const salto = eu > 0 ? Math.max(0, Math.sin(t * 9 + i * 1.7 + f)) * 0.45 * eu : 0; const q = cam.p(x, y0 + 0.5 + salto, zp); if (q.x < -6 || q.x > W + 6) continue; const s = Math.max(1, 0.36 * q.k); ctx.fillStyle = paleta[Math.floor(hash(f * 53 + i * 11) * paleta.length)]; ctx.globalAlpha = 0.75 + 0.25 * hash(f * 7 + i * 13); ctx.beginPath(); ctx.roundRect(q.x - s / 2, q.y - s * 1.1, s, s * 1.7, s * 0.3); ctx.fill(); ctx.fillStyle = ['#C68642', '#8D5524', '#E0B08A', '#5C3A21'][(i + f) % 4]; ctx.beginPath(); ctx.arc(q.x, q.y - s * 1.3, s * 0.36, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // flashes de las cámaras cuando hay gol
    if (eu > 0) { ctx.fillStyle = '#fff'; for (let i = 0; i < 12; i++) { const paso = Math.floor(t * 18); if (hash(paso * 7 + i * 13) < 0.35) { const f = Math.floor(hash(i + 900 + paso) * FILAS); const q = cam.p(X0 + hash(i + 950 + paso) * (X1 - X0), 1.1 + f * SUBE + 0.9, zPie + dirF * (f + 0.5) * ATRAS); ctx.globalAlpha = 0.9 * eu; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2); ctx.fill(); } } ctx.globalAlpha = 1; }
    // el techo de la tribuna, oscuro, y el borde iluminado
    { const f = FILAS; const zt = zPie + dirF * f * ATRAS, yt = 1.1 + f * SUBE; const a = cam.p(X0, yt, zt), b = cam.p(X1, yt, zt); ctx.strokeStyle = O2.techo; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }
  function escenaFutbol(cam, zArco, t, F) {
    const ctx = CTX; F = F || {}; const gx = F.gx || 0;
    const hz = cam.hz;
    // cielo de noche con estrellas
    const cielo = ctx.createLinearGradient(0, 0, 0, Math.max(40, hz)); cielo.addColorStop(0, '#05081A'); cielo.addColorStop(1, '#1B2A52'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
    ctx.save(); for (let i = 0; i < 28; i++) { const sx = hash(i) * W, sy = hash(i + 50) * Math.max(10, hz - 20); ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.1)); ctx.fillStyle = '#fff'; ctx.fillRect(sx, sy, 1.6, 1.6); } ctx.restore();
    // las luces: halos arriba de la tribuna
    for (const lx of [W * 0.12, W * 0.5, W * 0.88]) { const g = ctx.createRadialGradient(lx, 14, 0, lx, 14, 120); g.addColorStop(0, 'rgba(255,246,205,.45)'); g.addColorStop(0.3, 'rgba(255,246,205,.1)'); g.addColorStop(1, 'rgba(255,246,205,0)'); ctx.fillStyle = g; ctx.fillRect(lx - 120, -100, 240, 240); ctx.fillStyle = '#FFF4C8'; ctx.beginPath(); ctx.roundRect(lx - 16, 6, 32, 9, 3); ctx.fill(); }
    // césped en perspectiva, con franjas
    const suelo0 = cam.p(0, 0, cam.z0 + cam.dir * 400).y;
    const sueloG = ctx.createLinearGradient(0, suelo0, 0, H); sueloG.addColorStop(0, '#2A8A48'); sueloG.addColorStop(1, '#1E7A3E'); ctx.fillStyle = sueloG; ctx.fillRect(0, suelo0, W, H - suelo0);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 2; i < 80; i += 4) { const z = cam.z0 + cam.dir * i, z2 = cam.z0 + cam.dir * (i + 2); const a = cam.p(-60, 0, z), b = cam.p(60, 0, z), c = cam.p(60, 0, z2), d = cam.p(-60, 0, z2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
    // la tribuna de fondo: detrás del arco (vista del pateador) o detrás del pateador (vista del arquero)
    if (cam.dir > 0) tribuna3D(cam, t, F, zArco + 6.5, false); else tribuna3D(cam, t, F, -9, true);
    // el cartel del perímetro, al pie de la tribuna: la marca propia, nada ajeno
    { const zc = cam.dir > 0 ? zArco + 6.3 : -8.8; for (let x = -32; x < 32; x += 8) { const a = cam.p(x, 0, zc), b = cam.p(x + 8, 0, zc), c = cam.p(x + 8, 0.9, zc), d = cam.p(x, 0.9, zc); ctx.fillStyle = '#14110F'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); const m = cam.p(x + 4, 0.45, zc); if (m.x > -40 && m.x < W + 40) texto(ctx, 'MANO A MANO', m.x, m.y, Math.max(3, 0.33 * m.k), '#E8731C', 800); } }
    // líneas del área (corridas con el arco)
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const linea = (pts) => { ctx.beginPath(); pts.forEach((p, i) => { const q = cam.p(p[0] + gx, 0, p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke(); };
    linea([[-20.16, zArco], [-20.16, zArco - 16.5], [20.16, zArco - 16.5], [20.16, zArco]]);
    linea([[-9.16, zArco], [-9.16, zArco - 5.5], [9.16, zArco - 5.5], [9.16, zArco]]);
    linea([[-40, zArco], [40, zArco]]);
    // la medialuna
    ctx.beginPath(); let primero = true; for (let a = 0; a <= Math.PI; a += 0.06) { const x = Math.cos(a) * 9.15, z = zArco - 11 - Math.sin(a) * 9.15; if (z > zArco - 16.5) continue; const q = cam.p(x + gx, 0, z); if (primero) { ctx.moveTo(q.x, q.y); primero = false; } else ctx.lineTo(q.x, q.y); } ctx.stroke();
    { const q = cam.p(gx, 0, zArco - 11); ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(2, 0.12 * q.k), Math.max(1, 0.05 * q.k), 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); }
  }
  function arco(cam, zArco, red, gx) {
    const ctx = CTX; const w = ARCO.ancho / 2, h = ARCO.alto, prof = 2; gx = gx || 0; const tenue = cam.dir < 0;
    const A = cam.p(gx - w, 0, zArco), B = cam.p(gx - w, h, zArco), C = cam.p(gx + w, h, zArco), D = cam.p(gx + w, 0, zArco);
    const Bz = cam.p(gx - w, h, zArco + prof), Cz = cam.p(gx + w, h, zArco + prof), Az = cam.p(gx - w, 0, zArco + prof), Dz = cam.p(gx + w, 0, zArco + prof);
    // la sombra adentro del arco
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(Az.x, Az.y); ctx.lineTo(Dz.x, Dz.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill(); ctx.restore();
    // la red: fondo y laterales, con una ondulación desde donde pegó la pelota
    ctx.save(); ctx.strokeStyle = tenue ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    const onda = red ? Math.sin(red.k * Math.PI) * 12 * (1 - red.k) : 0;
    const n = 11;
    for (let i = 0; i <= n; i++) { const k = i / n; const x0 = lerp(Az.x, Dz.x, k), y0 = lerp(Az.y, Dz.y, k), x1 = lerp(Bz.x, Cz.x, k), y1 = lerp(Bz.y, Cz.y, k); const cerca = red ? Math.max(0, 1 - Math.abs(k - red.x) * 2.5) : 0; const ox = onda * cerca * (k > (red ? red.x : 0.5) ? 1 : -1); ctx.beginPath(); ctx.moveTo(x0 + ox * 0.4, y0); ctx.quadraticCurveTo(lerp(x0, x1, 0.5) + ox * 1.6, lerp(y0, y1, 0.5) + onda * 0.4 * cerca, x1 + ox * 0.4, y1); ctx.stroke(); }
    for (let i = 0; i <= 6; i++) { const k = i / 6; const cerca = red ? Math.max(0, 1 - Math.abs(k - (red.y || 0.3)) * 2) : 0; ctx.beginPath(); ctx.moveTo(lerp(Az.x, Bz.x, k), lerp(Az.y, Bz.y, k) + onda * k * 0.5); ctx.quadraticCurveTo(lerp(Az.x, Dz.x, 0.5), lerp(lerp(Az.y, Bz.y, k), lerp(Dz.y, Cz.y, k), 0.5) + onda * cerca, lerp(Dz.x, Cz.x, k), lerp(Dz.y, Cz.y, k) + onda * k * 0.5); ctx.stroke(); }
    for (let i = 0; i <= 5; i++) { const k = i / 5; ctx.beginPath(); ctx.moveTo(lerp(A.x, Az.x, k), lerp(A.y, Az.y, k)); ctx.lineTo(lerp(B.x, Bz.x, k), lerp(B.y, Bz.y, k)); ctx.moveTo(lerp(D.x, Dz.x, k), lerp(D.y, Dz.y, k)); ctx.lineTo(lerp(C.x, Cz.x, k), lerp(C.y, Cz.y, k)); ctx.stroke(); }
    ctx.restore();
    // los postes y el travesaño, con volumen
    ctx.save(); ctx.lineCap = 'round'; const gr = Math.max(2.5, Math.min(7, 0.12 * B.k));
    ctx.strokeStyle = '#c9ccd3'; ctx.lineWidth = gr; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = gr * 0.55; ctx.beginPath(); ctx.moveTo(A.x - gr * 0.2, A.y); ctx.lineTo(B.x - gr * 0.2, B.y - gr * 0.2); ctx.lineTo(C.x + gr * 0.2, C.y - gr * 0.2); ctx.lineTo(D.x + gr * 0.2, D.y); ctx.stroke();
    ctx.strokeStyle = '#d8dbe0'; ctx.lineWidth = Math.max(1.5, Math.min(4, 0.06 * B.k)); ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(Bz.x, Bz.y); ctx.moveTo(C.x, C.y); ctx.lineTo(Cz.x, Cz.y); ctx.stroke();
    ctx.restore();
  }
  // la figura: un jugador con cuerpo de jugador. Hombros anchos y cintura fina, camiseta con mangas y número, short,
  // muslos y gemelos de piel, medias y botines; brazos y piernas de dos tramos (codos y rodillas).
  // `pose`: {x, y (altura de la cadera), z, inclinacion, brazos: [angIzq, angDer], codos: [flex, flex],
  //          piernas: [angIzq, angDer] (o un número: apertura), rodillas: [flex, flex]}
  // Ángulos en el plano de la figura, 0 = hacia la derecha de la pantalla, π/2 = hacia abajo.
  // inclinacion > 0 = la cabeza se va hacia la derecha (x+). Un arquero que vuela a x+ se inclina positivo: cabeza adelante, pies atrás.
  function figura(cam, pose, colores, escala) {
    const ctx = CTX; const p = cam.p(pose.x, pose.y, pose.z); const k = p.k * (escala || 1);
    const A = 1.8 * k;                                                  // la altura del jugador en pantalla
    { const ps = cam.p(pose.x, 0, pose.z); sombra(ctx, ps, 0.22 * A * (1 + 1.2 * Math.abs(pose.inclinacion || 0)), 0.25); }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(pose.inclinacion || 0);
    const seg = (x0, y0, a, l) => ({ x: x0 + Math.cos(a) * l, y: y0 + Math.sin(a) * l });
    const trazo = (x0, y0, x1, y1, grosor, color) => { ctx.strokeStyle = color; ctx.lineWidth = grosor; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    const hombroY = -0.27 * A, hx = 0.13 * A, cx = 0.075 * A, cabezaR = 0.065 * A;
    const brazos = pose.brazos || [Math.PI * 0.78, Math.PI * 0.22];
    const codos = pose.codos || [0.3, -0.3];
    const piernas = Array.isArray(pose.piernas) ? pose.piernas : [Math.PI / 2 + 0.14 + (pose.piernas || 0) * 0.5, Math.PI / 2 - 0.14 - (pose.piernas || 0) * 0.5];
    const rodillas = pose.rodillas || [-0.12, 0.12];
    const lB = 0.17 * A, lA = 0.16 * A, lM = 0.25 * A, lP = 0.24 * A;
    const piel = colores.piel, medias = colores.medias || colores.pantalon, borde = 'rgba(0,0,0,.28)';
    // piernas: muslo de piel, gemelo con media, botín; detrás del cuerpo
    for (const [s, ang, rod] of [[-1, piernas[0], rodillas[0]], [1, piernas[1], rodillas[1]]]) {
      const h = { x: s * cx * 0.8, y: 0 }; const r = seg(h.x, h.y, ang, lM); const f = seg(r.x, r.y, ang + rod, lP);
      trazo(h.x, h.y, r.x, r.y, 0.085 * A + 1, borde); trazo(h.x, h.y, r.x, r.y, 0.085 * A, piel);
      trazo(r.x, r.y, f.x, f.y, 0.07 * A + 1, borde); trazo(r.x, r.y, f.x, f.y, 0.07 * A, piel);
      const m = seg(r.x, r.y, ang + rod, lP * 0.42); trazo(m.x, m.y, f.x, f.y, 0.072 * A, medias);
      ctx.fillStyle = colores.botin || '#15151a'; ctx.beginPath(); ctx.ellipse(f.x + Math.cos(ang + rod) * 0.02 * A, f.y + 0.02 * A, 0.055 * A, 0.032 * A, (ang + rod) - Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }
    // el short
    ctx.fillStyle = colores.pantalon; ctx.beginPath(); ctx.moveTo(-cx * 1.15, -0.03 * A); ctx.lineTo(cx * 1.15, -0.03 * A); ctx.lineTo(cx * 1.35, 0.17 * A); ctx.lineTo(cx * 0.2, 0.19 * A); ctx.lineTo(0, 0.14 * A); ctx.lineTo(-cx * 0.2, 0.19 * A); ctx.lineTo(-cx * 1.35, 0.17 * A); ctx.closePath(); ctx.fill();
    // el torso: hombros anchos, cintura fina, con un poco de luz de arriba
    const g = ctx.createLinearGradient(0, hombroY, 0, 0); g.addColorStop(0, colores.camisetaLuz || colores.camiseta); g.addColorStop(1, colores.camiseta);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-hx, hombroY); ctx.quadraticCurveTo(0, hombroY - 0.03 * A, hx, hombroY); ctx.quadraticCurveTo(hx * 1.05, hombroY * 0.4, cx * 1.15, 0); ctx.lineTo(-cx * 1.15, 0); ctx.quadraticCurveTo(-hx * 1.05, hombroY * 0.4, -hx, hombroY); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.stroke();
    if (colores.franja) { ctx.fillStyle = colores.franja; ctx.fillRect(-0.03 * A, hombroY, 0.06 * A, -hombroY); }
    if (colores.numero && A > 26) texto(ctx, colores.numero, 0, hombroY * 0.5, Math.max(6, 0.14 * A), colores.numeroColor || 'rgba(0,0,0,.5)', 800);
    // brazos: manga corta (camiseta) y antebrazo de piel; manos o guantes
    for (const [s, ang, codo] of [[-1, brazos[0], codos[0]], [1, brazos[1], codos[1]]]) {
      const h = { x: s * hx * 0.92, y: hombroY + 0.02 * A }; const c = seg(h.x, h.y, ang, lB); const m = seg(c.x, c.y, ang + codo, lA);
      trazo(h.x, h.y, c.x, c.y, 0.075 * A + 1, borde); trazo(h.x, h.y, c.x, c.y, 0.075 * A, colores.camiseta);
      trazo(c.x, c.y, m.x, m.y, 0.06 * A + 1, borde); trazo(c.x, c.y, m.x, m.y, 0.06 * A, piel);
      ctx.fillStyle = colores.guantes || piel; ctx.beginPath(); ctx.arc(m.x, m.y, colores.guantes ? 0.05 * A : 0.034 * A, 0, Math.PI * 2); ctx.fill();
      if (colores.guantes) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(m.x - 0.012 * A, m.y - 0.012 * A, 0.02 * A, 0, Math.PI * 2); ctx.fill(); }
    }
    // cuello y cabeza, con pelo
    const cabY = hombroY - 0.035 * A - cabezaR;
    trazo(0, hombroY, 0, cabY + cabezaR * 0.6, 0.05 * A, piel);
    ctx.fillStyle = piel; ctx.beginPath(); ctx.arc(0, cabY, cabezaR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colores.pelo || '#2b1d12'; ctx.beginPath(); ctx.arc(0, cabY - cabezaR * 0.12, cabezaR * 0.98, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(cabezaR * 0.3, cabY - cabezaR * 0.35, -cabezaR * 0.98, cabY - cabezaR * 0.1); ctx.closePath(); ctx.fill();
    if (A > 60) { ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(-cabezaR * 0.35, cabY + cabezaR * 0.1, cabezaR * 0.1, 0, Math.PI * 2); ctx.arc(cabezaR * 0.35, cabY + cabezaR * 0.1, cabezaR * 0.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  // las poses del arquero: quieto (se mece en puntas de pie) y en vuelo (los brazos adelante, las piernas atrás)
  function poseArqueroQuieto(t, amago) {
    const mece = Math.sin(t * 6.5); const lado = amago ? amago.dir * amago.k : 0;
    return { y: 0.86 + 0.03 * mece, brazos: [Math.PI * 0.92 + lado * 0.2, Math.PI * 0.08 + lado * 0.2], codos: [0.95, -0.95], piernas: [Math.PI / 2 + 0.3, Math.PI / 2 - 0.3], rodillas: [-0.4 - 0.1 * mece, 0.4 + 0.1 * mece], inclinacion: lado * 0.22 };
  }
  function poseArqueroVuelo(dir, k, alto) {
    const q = poseArqueroQuieto(0, null); const ext = easeOut(k * 1.4);
    const arriba = -Math.PI / 2; const d = dir || 1;
    return {
      brazos: [lerp(q.brazos[0], arriba - 0.35 * d, ext), lerp(q.brazos[1], arriba + 0.35 * d, ext)], codos: [lerp(0.95, 0.1, ext), lerp(-0.95, -0.1, ext)],
      piernas: [lerp(Math.PI / 2 + 0.3, Math.PI / 2 + 0.55 * d, ext), lerp(Math.PI / 2 - 0.3, Math.PI / 2 + 0.15 * d, ext)], rodillas: [lerp(-0.4, -0.5 * d, ext), lerp(0.4, -1.0 * d, ext)],
      inclinacion: d * k * (dir === 0 ? 0 : 1.15) * (alto ? 0.95 : 1.05),
    };
  }

  /* ─── la pelota en vuelo (3D): posición, velocidad, gravedad, comba (Magnus) ─── */
  function volar(b, dt) {
    const g = 9.81;
    b.vy -= g * dt;
    const freno = 1 - (b.freno || 0) * dt;          // el aire: el tiro pierde velocidad y cae más al final (el tiro libre "pica")
    b.vz *= freno; b.vy *= freno;
    b.vx += (b.comba || 0) * dt;                    // la comba: fuerza lateral constante mientras vuela
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.rot += (Math.hypot(b.vx, b.vz) * dt) / 0.11;
    if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * 0.45; b.vx *= 0.8; b.vz *= 0.8; b.piques = (b.piques || 0) + 1; b.pico = true; }
  }
  function anotarEstela(S, p) { S.paso = (S.paso || 0) + 1; if (S.paso % 3) return; S.estela = S.estela || []; S.estela.push({ x: p.x, y: p.y, z: p.z }); if (S.estela.length > 12) S.estela.shift(); }

  // dónde cruza la pelota el plano z = zFin, con el freno y la comba incluidos: se integra igual que en `volar`
  function destinoReal(p, zFin) {
    const b = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, r: p.r, rot: 0, freno: p.freno, comba: p.comba }; let k = 0, tt = 0;
    while (b.z < zFin && k++ < 600) { volar(b, 1 / 120); tt += 1 / 120; }
    return { x: b.x, y: b.y, t: tt };
  }
  // qué velocidad vertical hace falta para que la pelota llegue a `altura` en z = zFin (con el freno del aire): se prueba
  function vyPara(p, altura, zFin) {
    const prueba = (vy) => { const b = { x: 0, y: p.y, z: p.z, vx: 0, vy, vz: p.vz, r: p.r, rot: 0, freno: p.freno, comba: 0 }; let k = 0; while (b.z < zFin && k++ < 400) { const g = 9.81, dt = 1 / 120; b.vy -= g * dt; const f = 1 - (b.freno || 0) * dt; b.vz *= f; b.vy *= f; b.y += b.vy * dt; b.z += b.vz * dt; } return b.y; };
    let lo = -5, hi = 30; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (prueba(m) < altura) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // la pantalla final compartida: fondo, título, número grande, detalle, la marca personal y la invitación
  function pantallaFinal(ctx, F) {
    ctx.save(); ctx.fillStyle = F.fondo || 'rgba(11,16,38,.86)'; ctx.fillRect(0, 0, W, H);
    const k = clamp(F.k == null ? 1 : F.k, 0, 1); const s = 1 + 0.25 * (1 - easeOut(k * 2));
    ctx.save(); ctx.translate(W / 2, H * 0.3); ctx.scale(s, s); ctx.shadowColor = F.color; ctx.shadowBlur = 20; texto(ctx, F.titulo, 0, 0, 38, F.color, 800); ctx.restore();
    texto(ctx, F.grande, W / 2, H * 0.43, 64, '#fff', 800);
    texto(ctx, F.detalle, W / 2, H * 0.52, 14, 'rgba(255,255,255,.8)', 600);
    if (F.marca) { ctx.fillStyle = F.nueva ? 'rgba(232,115,28,.25)' : 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.roundRect(W / 2 - 120, H * 0.57, 240, 30, 10); ctx.fill(); texto(ctx, F.nueva ? '¡NUEVA MARCA PERSONAL!' : 'Tu mejor: ' + F.marca, W / 2, H * 0.57 + 15, 13, F.nueva ? '#FFB36B' : 'rgba(255,255,255,.85)', 800); }
    texto(ctx, 'Toca para jugar otra', W / 2, H * 0.68, 16, '#fff', 700);
    texto(ctx, 'y mandale el resultado a un amigo con Compartir', W / 2, H * 0.72, 11.5, 'rgba(255,255,255,.6)', 600);
    ctx.restore();
  }

  /* ═══════════════════════════════ PENALES ═══════════════════════════════ */
  function Penales() {
    const Z_ARCO = 14, Z_PELOTA = 3, DIST = Z_ARCO - Z_PELOTA;
    const camPateo = camara({ alt: 2.8, z0: -0.6, pitch: 0.244, foco: 430, cy: 250 });                         // detrás y por encima de la pelota, mirando al arco
    const camArco = camara({ alt: 3.4, z0: Z_ARCO + 5.2, dir: -1, pitch: 0.3, foco: 250, cy: 190 });           // detrás y por encima del arco, mirando al pateador: cuando el arquero soy yo
    const vistaArco = () => S.tanda === 'el' && S.fase !== 'final';
    const S = { fase: 'guia', t: 0, serie: [], serieRival: [], turno: 0, tanda: 'yo', pelota: null, arquero: null, mensaje: null, red: null, sacudida: 0, fin: null, racha: 0, amago: null, estela: [], euforia: 0, confeti: null, lectura: null, muerteSubita: false };
    const COL_YO = { camiseta: '#E8E337', camisetaLuz: '#F4F07A', pantalon: '#1b1b1f', medias: '#E8E337', piel: '#C68642', guantes: '#E8731C', numero: '1' };
    const COL_RIVAL = { camiseta: '#C2542E', camisetaLuz: '#DD7A5A', pantalon: '#1b1b1f', medias: '#C2542E', piel: '#8D5524', numero: '1', numeroColor: 'rgba(255,255,255,.6)' };
    const COL_PATEADOR = { camiseta: '#F3EEE6', camisetaLuz: '#FFFFFF', pantalon: '#14110F', medias: '#F3EEE6', piel: '#8D5524', numero: '9', numeroColor: 'rgba(0,0,0,.45)' };
    const nombreRival = (O.rival && O.rival.nombre) || 'el modelo';
    function reiniciarPelota() { S.pelota = { x: 0, y: 0.11, z: Z_PELOTA, vx: 0, vy: 0, vz: 0, r: 0.11, rot: 0, comba: 0, quieta: true }; S.estela = []; }
    function reiniciarArquero() { S.arquero = { x: 0, y: 0.9, z: Z_ARCO - 0.3, vuelo: null }; }
    // el amago: antes de mi penal, el arquero se mece hacia un lado. La mayoría de las veces es engaño.
    function amagar() { S.amago = { dir: azar() < 0.5 ? -1 : 1, engano: azar() < 0.65, k: 0 }; }
    reiniciarPelota(); reiniciarArquero(); amagar();

    // ── mi patada: el gesto dice a dónde y con cuánta fuerza ──
    function patear(g) {
      if (g.toque || g.largo < 25 || g.dy > -10) return;
      const p = S.pelota; const pot = clamp(g.vel / 2.2, 0.35, 1);          // potencia por velocidad del dedo
      const ang = clamp(g.angulo, -0.8, 0.8);                                 // izquierda / derecha: a 0.5 rad (≈30°) llega al palo
      const alturaDeseada = clamp(g.largo / 170, 0.08, 1.35) * ARCO.alto;    // más largo = más alto (pasado el travesaño, se va)
      const tVuelo = lerp(0.95, 0.45, pot);
      p.vz = DIST / tVuelo; p.vx = ((ang / 0.5) * 3.2) / tVuelo; p.comba = g.comba * 5;
      p.vy = (alturaDeseada - p.y + 0.5 * 9.81 * tVuelo * tVuelo) / tVuelo;
      p.quieta = false; S.fase = 'vuelo-mio'; S.t = 0; S.estela = []; S.lectura = { fuerza: pot, altura: alturaDeseada / ARCO.alto / 1.35 };
      vibrar('toque'); son('patada');
      // el arquero del modelo: lee la patada con una probabilidad que baja con la potencia y sube con lo central.
      // Cuando no la lee, va a donde dijo el amago (o al revés, si el amago era engaño).
      const dirReal = Math.sign(p.vx + p.comba * tVuelo * 0.5) || 0;
      const centro = Math.abs(ang) < 0.18;
      const pLee = clamp(0.62 - pot * 0.3 + (centro ? 0.15 : 0) - S.racha * 0.03, 0.2, 0.8);
      const a = S.amago || { dir: 1, engano: true };
      let dir = azar() < pLee ? dirReal : (a.engano ? -a.dir : a.dir);
      if (dir === 0 && !centro && azar() < 0.5) dir = azar() < 0.5 ? 1 : -1;
      const alto = alturaDeseada > ARCO.alto * 0.55 ? 1 : 0;
      S.arquero.vuelo = { dir, alto: azar() < 0.65 ? alto : 1 - alto, t0: S.t + lerp(0.25, 0.08, pot), dur: 0.55 };
    }
    // ── su patada: el rival patea y yo me tiro con el gesto (o un toque a un lado) ──
    function rivalPatea() {
      const p = S.pelota; const dir = [-0.9, -0.5, 0.15, 0.5, 0.9][Math.floor(azar() * 5)]; const alto = azar() < 0.5 ? 0.3 : 0.75;
      const tVuelo = lerp(0.8, 0.5, azar()); p.vz = DIST / tVuelo; p.vx = (dir * ARCO.ancho * 0.44) / tVuelo; p.comba = 0;
      p.vy = (alto * ARCO.alto - p.y + 0.5 * 9.81 * tVuelo * tVuelo) / tVuelo; p.quieta = false;
      S.fase = 'vuelo-rival'; S.t = 0; S.estela = []; S.pista = { dir: azar() < 0.75 ? Math.sign(dir) : -Math.sign(dir), hasta: 0.3 }; son('patada');
    }
    function atajar(g) {
      if (S.arquero.vuelo) return;
      // a dónde me tiro: tocá cerca del palo para volar hasta el palo, cerca del medio para quedarte; arriba o abajo
      // desde atrás del arco la pantalla está espejada: tocar a la derecha es volar hacia −x
      const dir = -(g.toque ? Math.sign(g.x - W / 2) : Math.sign(g.dx || (g.x - W / 2)));
      const alto = g.toque ? (g.y < H * 0.5 ? 1 : 0) : (g.dy < -40 ? 1 : 0);
      const lejos = g.toque ? clamp(Math.abs(g.x - W / 2) / 130, 0, 1) : clamp(g.largo / 130, 0, 1);
      S.arquero.vuelo = { dir: lejos < 0.15 ? 0 : (dir || 0), alto, dist: 0.5 + lejos * 2.4, t0: S.t, dur: 0.5 }; vibrar('toque');
    }
    function posArquero() {
      const a = S.arquero, v = a.vuelo;
      if (!v || S.t < v.t0) { const q = poseArqueroQuieto(S.t, S.tanda === 'yo' && S.fase === 'listo' ? S.amago : null); return Object.assign({ x: a.x, alcance: 0, mio: S.tanda === 'el' }, q); }
      const k = easeOut((S.t - v.t0) / v.dur);
      const x = a.x + v.dir * k * (v.dist || 2.9), y = 0.9 + (v.alto ? k * 0.9 : -k * 0.35);
      return Object.assign({ x, y, alcance: 1.05, mio: S.tanda === 'el' }, poseArqueroVuelo(v.dir, k, v.alto));
    }
    function cruzoLaLinea() {
      const p = S.pelota, A = posArquero();
      const enArco = Math.abs(p.x) < ARCO.ancho / 2 - 0.1 && p.y < ARCO.alto - 0.1 && p.y > 0;
      const poste = (Math.abs(Math.abs(p.x) - ARCO.ancho / 2) < 0.16 && p.y < ARCO.alto + 0.1) || (Math.abs(p.y - ARCO.alto) < 0.16 && Math.abs(p.x) < ARCO.ancho / 2 + 0.1);
      // las manos: una elipse alrededor del arquero (más ancha cuando se tira). El arquero que manejo yo llega un poco más.
      const ax = A.x + (S.arquero.vuelo ? S.arquero.vuelo.dir * 0.6 : 0), dx = Math.abs(p.x - ax), dy = Math.abs(p.y - A.y);
      const ancho = (A.alcance ? 1.15 : 0.7) * (A.mio ? 1.35 : 1), alto = (A.alcance ? 1.4 : 1.0) * (A.mio ? 1.3 : 1);
      const manos = (dx * dx) / (ancho * ancho) + (dy * dy) / (alto * alto) < 1;
      if (poste) return 'poste';
      if (enArco && manos) return 'atajada';
      if (enArco) return 'gol';
      return 'afuera';
    }
    function cerrarTiro(res, mio) {
      const p = S.pelota;
      if (res === 'gol') { S.red = { k: 0, x: (p.x / ARCO.ancho) + 0.5, y: p.y / ARCO.alto }; p.vz *= 0.15; p.vx *= 0.2; p.vy *= 0.2; S.sacudida = reducido() ? 0 : 0.5; vibrar(mio ? 'partido' : 'set'); son('red'); if (mio) { son('gol'); S.euforia = 1; S.confeti = 0; } else son('ohh'); }
      if (res === 'atajada') { p.vz = -1.5; p.vx = (azar() - 0.5) * 3; p.vy = 2; vibrar('set'); son('atajada'); if (!mio) { son('gol'); S.euforia = 0.7; } }
      if (res === 'poste') { p.vz = -4; p.vx = -Math.sign(p.x) * 2; vibrar('set'); son('poste'); }
      if (res === 'afuera') son('ohh');
      const gol = res === 'gol' ? 1 : 0;
      (mio ? S.serie : S.serieRival).push(gol);
      if (mio) S.racha = gol ? S.racha + 1 : 0;
      S.mensaje = { t: mio ? (gol ? '¡GOL!' : res === 'atajada' ? 'ATAJÓ' : res === 'poste' ? 'PALO' : 'AFUERA') : (gol ? 'GOL DE ÉL' : res === 'atajada' ? '¡LA SACASTE!' : res === 'poste' ? 'PALO' : 'LA TIRÓ AFUERA'),
        sub: mio ? (gol ? (S.racha >= 3 ? S.racha + ' seguidos' : '') : res === 'atajada' ? 'más fuerte o más al ángulo' : res === 'afuera' ? 'un poco menos de dedo' : '') : '', color: (gol === 1) === mio ? '#3ED17A' : '#FF6B5B', k: 0 };
      // el reloj vuelve a cero: el vuelo del arquero sigue desde donde estaba (si no, volvía a tirarse después del gol)
      if (S.arquero.vuelo) S.arquero.vuelo.t0 -= S.t;
      S.fase = 'fin-tiro'; S.t = 0;
    }
    // ¿se terminó? A cinco por lado; antes si el otro ya no alcanza; a muerte súbita si empatan en cinco.
    function terminado() {
      const yo = S.serie.length, el = S.serieRival.length, gy = S.serie.reduce((a, b) => a + b, 0), ge = S.serieRival.reduce((a, b) => a + b, 0);
      if (yo >= 5 && el >= 5) return yo === el && gy !== ge;
      const restoYo = Math.max(0, 5 - yo), restoEl = Math.max(0, 5 - el);
      return gy > ge + restoEl || ge > gy + restoYo;
    }
    function siguiente() {
      S.mensaje = null; S.red = null; S.confeti = null; reiniciarPelota(); reiniciarArquero(); S.pista = null; S.lectura = null;
      const yo = S.serie.length, el = S.serieRival.length;
      if (terminado()) {
        S.fase = 'final'; S.t = 0; const gy = S.serie.reduce((a, b) => a + b, 0), ge = S.serieRival.reduce((a, b) => a + b, 0);
        S.fin = { yo: gy, el: ge, penales: yo, muerteSubita: yo > 5 };
        S.fin.nueva = anotarMarca('penales', { yo: gy, el: ge }, (n, v) => (n.yo - n.el) > (v.yo - v.el) || ((n.yo - n.el) === (v.yo - v.el) && n.yo > v.yo));
        if (O.alTerminar) O.alTerminar({ juego: 'penales', yo: gy, el: ge });
        vibrar(gy > ge ? 'partido' : 'toque'); son('silbato'); if (S.fin.nueva) son('marca'); return;
      }
      S.muerteSubita = yo >= 5 && el >= 5;
      // alternados: yo, él, yo, él… (y la cámara cambia de lado: un corte)
      S.t = 0; S.corte = true;
      if (yo <= el) { S.tanda = 'yo'; S.fase = 'listo'; amagar(); } else { S.tanda = 'el'; S.fase = 'rival-prepara'; }
    }
    function soltar(g) {
      if (S.fase === 'guia') { S.fase = 'listo'; }
      if (S.fase === 'listo' && S.tanda === 'yo') return patear(g);
      if (S.fase === 'vuelo-rival') return atajar(g);
      if (S.fase === 'final') { if (g.toque) reiniciar(); }
    }
    function reiniciar() { S.serie = []; S.serieRival = []; S.fin = null; S.racha = 0; S.tanda = 'yo'; S.fase = 'listo'; S.mensaje = null; S.red = null; S.confeti = null; S.muerteSubita = false; S.lectura = null; reiniciarPelota(); reiniciarArquero(); amagar(); }
    function avanzar(dt) {
      S.t += dt; S.sacudida = Math.max(0, S.sacudida - dt); S.euforia = Math.max(0, S.euforia - dt * 0.5);
      if (S.amago) S.amago.k = Math.min(1, S.amago.k + dt * 2.2);
      if (S.red) S.red.k = Math.min(1, S.red.k + dt * 1.6);
      if (S.mensaje) S.mensaje.k = Math.min(1, S.mensaje.k + dt * 0.55);
      if (S.fase === 'rival-prepara' && S.t > 1.1) rivalPatea();
      if (S.fase === 'vuelo-mio' || S.fase === 'vuelo-rival') {
        const p = S.pelota; const antes = p.z; volar(p, dt); anotarEstela(S, p);
        if (antes < Z_ARCO && p.z >= Z_ARCO) { p.z = Z_ARCO; cerrarTiro(cruzoLaLinea(), S.fase === 'vuelo-mio'); }
        else if (S.fase === 'vuelo-rival' && S.t > 2.5) cerrarTiro('afuera', false);
      }
      if (S.fase === 'fin-tiro') { const p = S.pelota; p.pico = false; volar(p, dt); if (p.pico) son('pique'); if (S.t > 1.5) siguiente(); }
    }
    function dibujar() {
      const ctx = CTX; ctx.setTransform(CV.width / W, 0, 0, CV.height / H, 0, 0); ctx.save();
      if (S.sacudida > 0) ctx.translate(Math.sin(S.t * 91) * 4 * S.sacudida, Math.cos(S.t * 73) * 4 * S.sacudida);
      const vuela = S.fase === 'vuelo-mio' || S.fase === 'vuelo-rival';
      const push = vuela ? 0.1 * easeOut(S.t / 0.5) : S.fase === 'fin-tiro' ? 0.1 * (1 - easeOut(S.t / 0.7)) : 0;
      const atras = vistaArco(); const cam = (atras ? camArco : camPateo).cerca(push); const mult = atras ? 1.9 : 1.25;
      escenaFutbol(cam, Z_ARCO, S.t, { euforia: S.euforia });
      const p = S.pelota; const sp = cam.p(p.x, 0, p.z); const pp = cam.p(p.x, p.y, p.z); const r = Math.max(3, p.r * pp.k * mult);
      const dibujarPelota = () => { if (vuela) estela(ctx, cam, S.estela, p.r * mult, false); sombra(ctx, sp, r * (1 - clamp(p.y / 4, 0, 0.6)), 0.35 * (1 - clamp(p.y / 5, 0, 0.7))); pelotaFutbol(ctx, pp.x, pp.y, r, p.rot); };
      const dibujarArquero = () => { const A = posArquero(); figura(cam, Object.assign({ z: Z_ARCO - 0.3 }, A), S.tanda === 'yo' ? COL_RIVAL : COL_YO, 1); };
      const dibujarPateador = () => { if (S.tanda === 'el' && S.fase !== 'final' && (S.fase === 'rival-prepara' || S.fase === 'vuelo-rival')) { const k = S.fase === 'rival-prepara' ? easeOut(S.t / 1.1) : 1; const ph = S.t * 14; const patea = S.fase === 'vuelo-rival' ? easeOut(S.t / 0.25) : 0; figura(cam, { x: -2.1 + k * 1.1, y: 0.9, z: Z_PELOTA + 2.4 - k * 1.4, brazos: [Math.PI * 0.95 - 0.5 * Math.sin(ph), Math.PI * 0.05 + 0.5 * Math.sin(ph)], codos: [0.6, -0.6], piernas: k < 1 ? [Math.PI / 2 + 0.45 * Math.sin(ph), Math.PI / 2 - 0.45 * Math.sin(ph)] : [Math.PI / 2 + 0.2, Math.PI / 2 - 1.1 * patea], rodillas: k < 1 ? [0.5 * Math.max(0, Math.sin(ph)), -0.5 * Math.max(0, -Math.sin(ph))] : [0, -0.4 * (1 - patea)], inclinacion: 0.12 * k }, COL_PATEADOR, 0.8); } };
      if (atras) {
        // desde atrás del arco: lejos el pateador y la pelota, después yo, y la red por delante de todo
        dibujarPateador();
        if (S.pista && S.fase === 'vuelo-rival' && S.t < S.pista.hasta) { const q = cam.p(S.pista.dir * 2.2, 1.6, Z_ARCO - 2); ctx.save(); ctx.globalAlpha = 0.9; texto(ctx, S.pista.dir * cam.dir < 0 ? '◀' : '▶', q.x, q.y, 26, '#E8E337', 800); ctx.restore(); }
        if (S.fase === 'rival-prepara' || (S.fase === 'vuelo-rival' && !S.arquero.vuelo)) { ctx.save(); ctx.globalAlpha = 0.25 + 0.1 * Math.sin(S.t * 8); ctx.strokeStyle = '#E8E337'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]); for (const [x0, x1] of [[-3.5, -1.2], [1.2, 3.5]]) for (const [y0, y1] of [[0.05, 1.2], [1.25, 2.4]]) { const a = cam.p(x0, y0, Z_ARCO), b = cam.p(x1, y1, Z_ARCO); ctx.strokeRect(Math.min(a.x, b.x), b.y, Math.abs(b.x - a.x), a.y - b.y); } ctx.restore(); }
        if (p.z < Z_ARCO - 0.3) dibujarPelota();
        dibujarArquero();
        if (p.z >= Z_ARCO - 0.3) dibujarPelota();
        arco(cam, Z_ARCO, S.red);
      } else {
        arco(cam, Z_ARCO, S.red); dibujarArquero(); dibujarPateador(); dibujarPelota();
        if (S.fase === 'guia' || (S.fase === 'listo' && S.tanda === 'yo' && S.serie.length === 0)) flechaGuia(ctx, pp.x, pp.y - r - 6, S.t);
      }
      // HUD
      const yo = S.serie.reduce((a, b) => a + b, 0), el = S.serieRival.reduce((a, b) => a + b, 0);
      hud(ctx, 'TÚ ' + yo, el + ' ' + nombreRival.toUpperCase(), S.fase === 'guia' ? 'Desliza para patear' : S.tanda === 'yo' && S.fase === 'listo' ? (S.muerteSubita ? 'Muerte súbita: tu penal' : 'Tu penal: desliza hacia el arco') : S.fase === 'rival-prepara' ? 'Patea él: toca hacia dónde te tiras' : S.fase === 'vuelo-rival' ? '¡Tírate!' : '', '#177A40');
      const nPips = Math.max(5, S.serie.length, S.serieRival.length);
      ctx.save(); tandas(ctx, S.serie.concat(Array(Math.max(0, nPips - S.serie.length)).fill(null)), 24, 62); tandas(ctx, S.serieRival.concat(Array(Math.max(0, nPips - S.serieRival.length)).fill(null)), W - 24, 62, true); ctx.restore();
      if (S.racha >= 2 && S.tanda === 'yo' && S.fase === 'listo') texto(ctx, '🔥 ' + S.racha + ' seguidos', 24, 80, 11, '#FFB36B', 800, 'left');
      lecturaGesto(ctx, S.lectura, S.fase === 'vuelo-mio' ? S.t : S.fase === 'fin-tiro' && S.lectura ? S.t + 0.7 : 9);
      if (S.confeti != null) confeti(ctx, S.t - S.confeti, ['#E8E337', '#3ED17A', '#fff', '#E8731C']);
      if (S.mensaje) cartel(ctx, S.mensaje.t, S.mensaje.sub, S.mensaje.color, S.mensaje.k);
      if (S.corte && S.t < 0.3 && (S.fase === 'listo' || S.fase === 'rival-prepara')) { ctx.save(); ctx.globalAlpha = 1 - S.t / 0.3; ctx.fillStyle = '#05081A'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      if (S.fase === 'final') { const f = S.fin, gane = f.yo > f.el; const m = marcaDe('penales'); pantallaFinal(ctx, { k: S.t, titulo: gane ? '¡GANASTE!' : 'PERDISTE', color: gane ? '#3ED17A' : '#FF6B5B', grande: f.yo + ' – ' + f.el, detalle: 'tú · ' + nombreRival + (f.muerteSubita ? ' · muerte súbita' : ''), marca: m ? m.yo + ' – ' + m.el : null, nueva: f.nueva }); }
      ctx.restore();
    }
    return { avanzar, dibujar, soltar, mover: null, estado: S, reiniciar };
  }

  /* ═══════════════════════════════ TIRO LIBRE ═══════════════════════════════ */
  function TiroLibre() {
    const cam0 = camara({ alt: 3.2, z0: -1, pitch: 0.21, foco: 430, cy: 240 });
    const Z_PELOTA = 3.2; let Z_ARCO = 24, DIST = Z_ARCO - Z_PELOTA; const Z_BARRERA = Z_PELOTA + 9.15;
    const S = { fase: 'guia', t: 0, serie: [], pelota: null, arquero: null, barrera: null, mensaje: null, red: null, sacudida: 0, fin: null, racha: 0, salto: 0, gx: 0, escuadras: 0, estela: [], euforia: 0, confeti: null, lectura: null, rival: 0 };
    // lo que mete el modelo en su tanda de cinco: entre 2 y 4, para tener a quién ganarle
    const rivalMete = () => 2 + (azar() < 0.55 ? 1 : 0) + (azar() < 0.3 ? 1 : 0);
    const COL_RIVAL = { camiseta: '#C2542E', camisetaLuz: '#DD7A5A', pantalon: '#1b1b1f', medias: '#C2542E', piel: '#8D5524', numeroColor: 'rgba(255,255,255,.6)' }, COL_ARQ = { camiseta: '#E8E337', camisetaLuz: '#F4F07A', pantalon: '#1b1b1f', medias: '#E8E337', piel: '#C68642', guantes: '#E8731C', numero: '1' };
    const nombreRival = (O.rival && O.rival.nombre) || 'el modelo';
    // cada tiro, un lugar distinto: el arco queda corrido (gx) y más o menos lejos; la barrera tapa el palo cercano, el arquero el otro
    function armar() {
      S.pelota = { x: 0, y: 0.11, z: Z_PELOTA, vx: 0, vy: 0, vz: 0, r: 0.11, rot: 0, comba: 0 }; S.estela = [];
      const n = S.serie.length; const gxs = [0, 3.2, -3.8, 4.6, -2.6]; S.gx = gxs[n % gxs.length] + (azar() - 0.5) * 1.2;
      Z_ARCO = 21 + azar() * 7; DIST = Z_ARCO - Z_PELOTA;
      const lado = S.gx > 0.3 ? -1 : S.gx < -0.3 ? 1 : (azar() < 0.5 ? -1 : 1);     // de qué lado del arco está el palo cercano
      const palo = S.gx + lado * (ARCO.ancho / 2 - 0.9);                               // la barrera se para en la línea pelota → ese palo (un poco adentro)
      S.barrera = { x: palo * (9.15 / DIST), n: DIST < 23 ? 4 : 5, lado, salto: 0 };
      S.arquero = { x: S.gx - lado * 1.2, vuelo: null }; S.salto = 0; S.dist = DIST;
    }
    armar(); S.rival = rivalMete();
    function patear(g) {
      if (g.toque || g.largo < 25 || g.dy > -10) return;
      const p = S.pelota; const pot = clamp(g.vel / 2.0, 0.35, 1); const ang = clamp(g.angulo, -0.7, 0.7);
      const altura = clamp(g.largo / 150, 0.1, 1.5) * ARCO.alto; const tVuelo = lerp(1.25, 0.95, pot) * (DIST / 20.8);
      p.vz = DIST / tVuelo; p.vx = ((ang / 0.5) * 3.2) / tVuelo; p.comba = g.comba * 6; p.freno = 0.22;
      // el tiro libre pica: sale alto, el aire lo frena y cae. La altura de llegada es la que pide el gesto (150 px = el travesaño).
      p.vy = vyPara(p, altura, Z_ARCO);
      S.fase = 'vuelo'; S.t = 0; S.estela = []; S.lectura = { fuerza: pot, altura: altura / ARCO.alto / 1.5 }; vibrar('toque'); son('patada');
      S.barrera.saltoT = S.t + 0.12;
      // el arquero: si "lee" el tiro, vuela a donde va la pelota (x final estimado); si no, al otro lado
      const xFinal = clamp(destinoReal(p, Z_ARCO).x, S.gx - 3.3, S.gx + 3.3);
      const dirReal = Math.sign(xFinal - S.arquero.x) || 1;
      const pLee = clamp(0.55 - pot * 0.25 - Math.abs(g.comba) * 0.2, 0.15, 0.7);
      const lee = azar() < pLee;
      S.arquero.vuelo = { dir: lee ? dirReal : -dirReal, hasta: lee ? xFinal : S.arquero.x - dirReal * 2.2, alto: altura > ARCO.alto * 0.5 ? 1 : 0, t0: S.t + lerp(0.5, 0.25, pot), dur: 0.6 };
    }
    function posArquero() {
      const a = S.arquero, v = a.vuelo;
      if (!v || S.t < v.t0) return Object.assign({ x: a.x, alcance: 0 }, poseArqueroQuieto(S.t, null));
      const k = easeOut((S.t - v.t0) / v.dur); const destino = v.hasta != null ? v.hasta : a.x + v.dir * 2.6;
      const P = poseArqueroVuelo(v.dir, k, v.alto); P.inclinacion *= Math.min(1, Math.abs(destino - a.x) / 2.5);
      return Object.assign({ x: lerp(a.x, destino, k), y: 0.9 + (v.alto ? k * 0.8 : -k * 0.3), alcance: 0.95 }, P);
    }
    function cerrar(res, escuadra) {
      const p = S.pelota;
      if (res === 'gol') { S.red = { k: 0, x: ((p.x - S.gx) / ARCO.ancho) + 0.5, y: p.y / ARCO.alto }; p.vz *= 0.15; p.vx *= 0.2; p.vy *= 0.2; S.sacudida = reducido() ? 0 : 0.5; vibrar('partido'); son('red'); son('gol'); S.euforia = 1; S.confeti = 0; if (escuadra) S.escuadras++; }
      if (res === 'barrera') { p.vz = -3; p.vy = 2.5; p.vx = (azar() - 0.5) * 3; vibrar('set'); son('atajada'); }
      if (res === 'atajada') { p.vz = -1.5; p.vy = 2; vibrar('set'); son('atajada'); son('ohh'); }
      if (res === 'poste') { p.vz = -4; p.vx = -Math.sign(p.x - S.gx) * 2; vibrar('set'); son('poste'); }
      if (res === 'afuera') son('ohh');
      const gol = res === 'gol' ? 1 : 0; S.serie.push(gol); S.racha = gol ? S.racha + 1 : 0;
      S.mensaje = { t: gol ? (escuadra ? '¡A LA ESCUADRA!' : '¡GOLAZO!') : res === 'barrera' ? 'BARRERA' : res === 'atajada' ? 'ATAJÓ' : res === 'poste' ? 'PALO' : 'AFUERA', sub: gol ? (S.racha >= 2 ? S.racha + ' seguidos' : '') : res === 'barrera' ? 'por arriba, o con comba por el costado' : res === 'afuera' ? 'apunta al arco: está corrido' : res === 'atajada' ? 'más lejos del arquero' : '', color: gol ? '#3ED17A' : '#FF6B5B', k: 0 };
      if (S.arquero.vuelo) S.arquero.vuelo.t0 -= S.t;
      S.fase = 'fin-tiro'; S.t = 0;
    }
    function siguiente() {
      S.mensaje = null; S.red = null; S.confeti = null; S.lectura = null;
      if (S.serie.length >= 5) { S.fase = 'final'; S.t = 0; S.fin = { goles: S.serie.reduce((a, b) => a + b, 0), escuadras: S.escuadras, rival: S.rival }; S.fin.nueva = anotarMarca('libre', { goles: S.fin.goles, escuadras: S.escuadras }, (n, v) => n.goles > v.goles || (n.goles === v.goles && n.escuadras > (v.escuadras || 0))); if (O.alTerminar) O.alTerminar({ juego: 'libre', goles: S.fin.goles, escuadras: S.escuadras }); son('silbato'); if (S.fin.nueva) son('marca'); return; }
      armar(); S.fase = 'listo';
    }
    function reiniciar() { S.serie = []; S.fin = null; S.racha = 0; S.escuadras = 0; S.fase = 'listo'; S.mensaje = null; S.red = null; S.confeti = null; S.lectura = null; armar(); S.rival = rivalMete(); }
    function soltar(g) { if (S.fase === 'guia') S.fase = 'listo'; if (S.fase === 'listo') return patear(g); if (S.fase === 'final' && g.toque) reiniciar(); }
    function avanzar(dt) {
      S.t += dt; S.sacudida = Math.max(0, S.sacudida - dt); S.euforia = Math.max(0, S.euforia - dt * 0.5);
      if (S.red) S.red.k = Math.min(1, S.red.k + dt * 1.6);
      if (S.mensaje) S.mensaje.k = Math.min(1, S.mensaje.k + dt * 0.55);
      if (S.fase === 'vuelo') {
        const p = S.pelota; const antes = p.z; volar(p, dt); anotarEstela(S, p);
        const B = S.barrera; if (B.saltoT != null && S.t > B.saltoT) { const k = (S.t - B.saltoT) / 0.6; B.salto = k < 1 ? Math.sin(k * Math.PI) * 0.35 : 0; }
        if (antes < Z_BARRERA && p.z >= Z_BARRERA) { const topeBarrera = 1.8 + B.salto; const anchoB = B.n * 0.26; if (p.y < topeBarrera && Math.abs(p.x - B.x) < anchoB) { p.z = Z_BARRERA; return cerrar('barrera'); } }
        if (antes < Z_ARCO && p.z >= Z_ARCO) {
          p.z = Z_ARCO; const A = posArquero(); const rx = p.x - S.gx;
          const enArco = Math.abs(rx) < ARCO.ancho / 2 - 0.1 && p.y < ARCO.alto - 0.1 && p.y > 0;
          const poste = (Math.abs(Math.abs(rx) - ARCO.ancho / 2) < 0.16 && p.y < ARCO.alto + 0.1) || (Math.abs(p.y - ARCO.alto) < 0.16 && Math.abs(rx) < ARCO.ancho / 2 + 0.1);
          const manos = (Math.abs(p.x - A.x) < (A.alcance ? 1.0 : 0.7)) && (Math.abs(p.y - A.y) < (A.alcance ? 1.25 : 1.0));
          const escuadra = enArco && p.y > ARCO.alto - 0.75 && Math.abs(rx) > ARCO.ancho / 2 - 1.0;
          cerrar(poste ? 'poste' : enArco && manos ? 'atajada' : enArco ? 'gol' : 'afuera', escuadra);
        } else if (p.piques > 0 && p.z < Z_ARCO) cerrar('afuera');
      }
      if (S.fase === 'fin-tiro') { const p = S.pelota; p.pico = false; volar(p, dt); if (p.pico) son('pique'); if (S.t > 1.6) siguiente(); }
    }
    function dibujar() {
      const ctx = CTX; ctx.setTransform(CV.width / W, 0, 0, CV.height / H, 0, 0); ctx.save();
      if (S.sacudida > 0) ctx.translate(Math.sin(S.t * 91) * 4 * S.sacudida, Math.cos(S.t * 73) * 4 * S.sacudida);
      const push = S.fase === 'vuelo' ? 0.1 * easeOut(S.t / 0.6) : S.fase === 'fin-tiro' ? 0.1 * (1 - easeOut(S.t / 0.7)) : 0;
      const cam = cam0.cerca(push);
      escenaFutbol(cam, Z_ARCO, S.t, { euforia: S.euforia, gx: S.gx }); arco(cam, Z_ARCO, S.red, S.gx);
      const A = posArquero(); figura(cam, Object.assign({ z: Z_ARCO - 0.3 }, A), COL_ARQ, 1);
      // la barrera: saltan todos juntos, con las manos abajo
      const B = S.barrera; for (let i = 0; i < B.n; i++) { const x = B.x + (i - (B.n - 1) / 2) * 0.5; const s = B.salto; figura(cam, { x, y: 0.9 + s, z: Z_BARRERA, brazos: [Math.PI * 0.62, Math.PI * 0.38], codos: [-0.55, 0.55], piernas: [Math.PI / 2 + 0.1, Math.PI / 2 - 0.1], rodillas: [-s * 1.6, s * 1.6], inclinacion: 0 }, Object.assign({ numero: String(2 + i) }, COL_RIVAL), 1); }
      const p = S.pelota; const sp = cam.p(p.x, 0, p.z); const pp = cam.p(p.x, p.y, p.z); const r = Math.max(2.5, p.r * pp.k * 1.25);
      if (S.fase === 'vuelo') estela(ctx, cam, S.estela, p.r * 1.25, false);
      sombra(ctx, sp, r * (1 - clamp(p.y / 4, 0, 0.6)), 0.35 * (1 - clamp(p.y / 5, 0, 0.7))); pelotaFutbol(ctx, pp.x, pp.y, r, p.rot);
      if (S.fase === 'guia' || (S.fase === 'listo' && S.serie.length === 0)) flechaGuia(ctx, pp.x, pp.y - r - 6, S.t);
      hud(ctx, 'TÚ ' + S.serie.reduce((a, b) => a + b, 0), S.rival + ' ' + nombreRival.toUpperCase(), S.fase === 'guia' ? 'Desliza curvo para darle comba' : S.fase === 'listo' ? (Math.round(DIST) + ' m · ' + (S.gx > 1 ? 'el arco está a la derecha' : S.gx < -1 ? 'el arco está a la izquierda' : 'de frente')) : '', '#177A40');
      ctx.save(); tandas(ctx, S.serie.concat(Array(Math.max(0, 5 - S.serie.length)).fill(null)), 24, 62); ctx.restore();
      texto(ctx, 'tiro ' + Math.min(5, S.serie.length + 1) + ' de 5' + (S.escuadras ? ' · ◥ ' + S.escuadras : ''), W - 24, 62, 11, S.escuadras ? '#FFB36B' : 'rgba(255,255,255,.8)', 800, 'right');
      lecturaGesto(ctx, S.lectura, S.fase === 'vuelo' ? S.t : S.fase === 'fin-tiro' && S.lectura ? S.t + 1 : 9);
      if (S.confeti != null) confeti(ctx, S.t - S.confeti, ['#E8E337', '#3ED17A', '#fff', '#E8731C']);
      if (S.mensaje) cartel(ctx, S.mensaje.t, S.mensaje.sub, S.mensaje.color, S.mensaje.k);
      if (S.fase === 'final') { const g = S.fin.goles, rv = S.fin.rival; const m = marcaDe('libre'); pantallaFinal(ctx, { k: S.t, titulo: g > rv ? '¡LE GANASTE!' : g === rv ? 'EMPATE' : 'GANÓ EL MODELO', color: g > rv ? '#3ED17A' : g === rv ? '#E8E337' : '#FF6B5B', grande: g + ' – ' + rv, detalle: 'tú · ' + nombreRival + ', de 5 cada uno' + (S.escuadras ? ' · ' + S.escuadras + ' a la escuadra' : ''), marca: m ? m.goles + ' de 5' : null, nueva: S.fin.nueva }); }
      ctx.restore();
    }
    return { avanzar, dibujar, soltar, estado: S, reiniciar };
  }

  /* ═══════════════════════════════ TRIPLES ═══════════════════════════════ */
  function Triples() {
    const cam0 = camara({ alt: 2.2, z0: -1, pitch: 0.105, foco: 390, cy: 322 });   // un paso atrás de la pelota: el arco del tiro entra entero en pantalla
    const ARO = { z: 7.6, y: 3.05, r: 0.225, tablero: { ancho: 1.8, alto: 1.05, abajo: 2.9 } };
    const PUESTOS = [{ n: 'esquina izquierda', ang: -0.55 }, { n: 'ala izquierda', ang: -0.28 }, { n: 'frente', ang: 0 }, { n: 'ala derecha', ang: 0.28 }, { n: 'esquina derecha', ang: 0.55 }];
    const POR_PUESTO = 5;                                                     // cinco pelotas por puesto; la última es la dorada y vale doble
    const S = { fase: 'guia', t: 0, tiempo: 60, puntos: 0, tiros: 0, racha: 0, mejorRacha: 0, puesto: 0, enPuesto: 0, pelota: null, mensaje: null, red: null, fin: null, sacudida: 0, ultimo: null, estela: [], confeti: null, ticAnt: 99, flash: 0, rival: 0 };
    // lo que hace el modelo en su minuto: entre 27 y 51 puntos, de a tres
    const rivalHace = () => 27 + 3 * Math.floor(azar() * 9);
    function armar() { S.pelota = { x: 0, y: 1.8, z: 1.5, vx: 0, vy: 0, vz: 0, r: 0.12, rot: 0, comba: 0, toco: false, tablero: false }; S.estela = []; }
    armar(); S.rival = rivalHace();
    const nombreRival = (O.rival && O.rival.nombre) || 'el modelo';
    const dorada = () => S.enPuesto === POR_PUESTO - 1;
    function lanzar(g) {
      if (g.toque || g.largo < 25 || g.dy > -10) return;
      const p = S.pelota; const fuerza = clamp(0.5 + (g.largo / 238) * 0.5, 0.5, 1.3);   // el largo del gesto es la fuerza; la justa ronda los 190 px
      const ang = clamp(g.angulo, -0.45, 0.45);
      const tVuelo = 1.25; const dz = ARO.z - p.z;
      const vz = (dz / tVuelo) * fuerza; const vx = Math.tan(ang) * vz * 0.32 + g.comba * 0.4;
      const vy = ((ARO.y + 0.9 - p.y) + 0.5 * 9.81 * tVuelo * tVuelo) / tVuelo * (0.85 + fuerza * 0.15);
      Object.assign(p, { vx, vy, vz, toco: false, tablero: false, rot: 0, dorada: dorada() });
      S.fase = 'vuelo'; S.t = 0; S.estela = []; S.tiros++; vibrar('toque'); son('pique');
    }
    function encesto() {
      const vale = S.pelota.dorada ? 6 : 3; S.puntos += vale; S.racha++; S.mejorRacha = Math.max(S.mejorRacha, S.racha); S.red = { k: 0 }; S.sacudida = reducido() ? 0 : 0.3; S.flash = 1;
      S.mensaje = { t: S.pelota.dorada ? '¡DORADA! +6' : S.pelota.toco ? '¡ADENTRO!' : '¡SWISH!', sub: S.racha >= 3 ? 'en llamas · racha de ' + S.racha : '', color: S.pelota.dorada ? '#FFD23F' : '#3ED17A', k: 0 }; vibrar('set'); son(S.pelota.toco ? 'aro' : 'swish'); if (S.pelota.dorada) { son('gol'); S.confeti = 0; } S.ultimo = 'adentro';
    }
    function fallo(por) { S.racha = 0; S.mensaje = { t: por === 'corto' ? 'CORTO' : por === 'largo' ? 'LARGO' : 'AFUERA', sub: por === 'corto' ? 'más largo el gesto' : por === 'largo' ? 'más corto el gesto' : '', color: '#FF6B5B', k: 0 }; vibrar('toque'); S.ultimo = por; }
    function terminarTiro() { S.fase = 'fin-tiro'; S.t = 0; }
    function siguiente() {
      S.mensaje = null; S.red = null; S.confeti = null;
      S.enPuesto++; if (S.enPuesto >= POR_PUESTO) { S.enPuesto = 0; S.puesto = (S.puesto + 1) % PUESTOS.length; }
      armar();
      if (S.tiempo <= 0) { S.fase = 'final'; S.t = 0; S.fin = { puntos: S.puntos, tiros: S.tiros, racha: S.mejorRacha, rival: S.rival }; S.fin.nueva = anotarMarca('triples', { puntos: S.puntos, tiros: S.tiros, racha: S.mejorRacha }, (n, v) => n.puntos > v.puntos); if (O.alTerminar) O.alTerminar({ juego: 'triples', puntos: S.puntos, tiros: S.tiros, racha: S.mejorRacha }); son('buzzer'); if (S.fin.nueva) son('marca'); return; }
      S.fase = 'listo';
    }
    function reiniciar() { Object.assign(S, { tiempo: 60, puntos: 0, tiros: 0, racha: 0, mejorRacha: 0, puesto: 0, enPuesto: 0, fin: null, mensaje: null, red: null, confeti: null, fase: 'listo', ticAnt: 99, rival: rivalHace() }); armar(); }
    function soltar(g) { if (S.fase === 'guia') S.fase = 'listo'; if (S.fase === 'listo') return lanzar(g); if (S.fase === 'final' && g.toque) reiniciar(); }
    function avanzar(dt) {
      S.t += dt; S.sacudida = Math.max(0, S.sacudida - dt); S.flash = Math.max(0, S.flash - dt * 2);
      if (S.fase !== 'guia' && S.fase !== 'final') { S.tiempo = Math.max(0, S.tiempo - dt); const seg = Math.ceil(S.tiempo); if (seg <= 5 && seg !== S.ticAnt && seg > 0) { son('tic'); S.ticAnt = seg; } }
      if (S.red) S.red.k = Math.min(1, S.red.k + dt * 1.8);
      if (S.mensaje) S.mensaje.k = Math.min(1, S.mensaje.k + dt * 0.7);
      if (S.fase === 'vuelo') {
        const p = S.pelota; const yAntes = p.y, zAntes = p.z; volar(p, dt); anotarEstela(S, p);
        // el tablero: detrás del aro
        const zT = ARO.z + 0.4; if (zAntes < zT && p.z >= zT && p.y > ARO.tablero.abajo && p.y < ARO.tablero.abajo + ARO.tablero.alto && Math.abs(p.x) < ARO.tablero.ancho / 2) { p.z = zT; p.vz = -p.vz * 0.55; p.tablero = true; p.toco = true; vibrar('toque'); son('tablero'); }
        // el aro: un anillo en y = 3.05; cuando pasa por esa altura bajando
        if (yAntes > ARO.y && p.y <= ARO.y && p.vy < 0) {
          const d = Math.hypot(p.x, p.z - ARO.z);
          if (d < ARO.r - p.r * 0.3) { encesto(); terminarTiro(); p.vz *= 0.1; p.vx *= 0.1; p.vy = -1.5; }
          else if (d < ARO.r + p.r) {
            // pega en el hierro: rebota, con un poco de azar; si el centro cae adentro del aro casi siempre entra igual
            p.toco = true; vibrar('toque'); son('aro');
            const nx = p.x / (d || 1), nz = (p.z - ARO.z) / (d || 1);
            if (azar() < (d < ARO.r ? 0.75 : 0.2)) { encesto(); terminarTiro(); p.vy = -1.5; p.vx *= 0.1; p.vz *= 0.1; }
            else { p.vy = Math.abs(p.vy) * 0.5 + 1; p.vx = -nx * 1.6 + (azar() - 0.5); p.vz = -nz * 1.6 + (azar() - 0.5) * 0.6; p.y = ARO.y + 0.02; }
          }
        }
        if (p.y <= p.r + 0.01 && S.fase === 'vuelo') { fallo(p.z < ARO.z - 0.4 ? 'corto' : p.z > ARO.z + 0.2 || p.tablero ? 'largo' : 'afuera'); terminarTiro(); son('pique'); }
        if (S.t > 4) { fallo('afuera'); terminarTiro(); }
      }
      if (S.fase === 'fin-tiro') { const p = S.pelota; p.pico = false; volar(p, dt); if (p.pico) son('pique'); if (S.t > (S.ultimo === 'adentro' ? 0.75 : 0.95)) siguiente(); }
    }
    function dibujar() {
      const ctx = CTX; ctx.setTransform(CV.width / W, 0, 0, CV.height / H, 0, 0); ctx.save();
      if (S.sacudida > 0) ctx.translate(Math.sin(S.t * 91) * 3 * S.sacudida, Math.cos(S.t * 73) * 3 * S.sacudida);
      const push = S.fase === 'vuelo' ? 0.06 * easeOut(S.t / 0.6) : S.fase === 'fin-tiro' ? 0.06 * (1 - easeOut(S.t / 0.5)) : 0;
      const cam = cam0.cerca(push);
      // el estadio: la cancha en sombra, luces altas, banderines, y la tribuna de verdad detrás del tablero
      const hz = cam.hz;
      const cielo = ctx.createLinearGradient(0, 0, 0, Math.max(40, hz)); cielo.addColorStop(0, '#07060F'); cielo.addColorStop(0.6, '#1B1428'); cielo.addColorStop(1, '#2A1F35'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
      for (const lx of [W * 0.18, W * 0.5, W * 0.82]) { const g = ctx.createRadialGradient(lx, 10, 0, lx, 10, 150); g.addColorStop(0, 'rgba(255,240,210,.32)'); g.addColorStop(1, 'rgba(255,240,210,0)'); ctx.fillStyle = g; ctx.fillRect(lx - 150, -60, 300, 240); }
      // banderines colgados del techo: la marca propia
      for (const [bx, c] of [[W * 0.3, '#E8731C'], [W * 0.5, '#14110F'], [W * 0.7, '#E8731C']]) { ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, 64); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(bx - 15, 64); ctx.lineTo(bx + 15, 64); ctx.lineTo(bx + 15, 106); ctx.lineTo(bx, 116); ctx.lineTo(bx - 15, 106); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); texto(ctx, 'MANO', bx, 82, 6.5, 'rgba(255,255,255,.85)', 800); texto(ctx, 'A MANO', bx, 94, 6.5, 'rgba(255,255,255,.85)', 800); }
      // el piso: el parquet hasta la línea de fondo y, más allá, el pasillo oscuro hasta la tribuna
      { const s0 = cam.p(0, 0, 400).y; const piso = ctx.createLinearGradient(0, s0, 0, H); piso.addColorStop(0, '#D4A066'); piso.addColorStop(1, '#A6713B'); ctx.fillStyle = piso; ctx.fillRect(0, s0, W, H - s0); }
      { const zb = ARO.z + 1.2; const a = cam.p(-40, 0, zb), b = cam.p(40, 0, zb), c = cam.p(40, 0, zb + 60), d = cam.p(-40, 0, zb + 60); ctx.fillStyle = '#3A2E30'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
      // la tribuna detrás del aro (la referencia de "corto" o "largo"), con flashes si hay racha
      tribuna3D(cam, S.t, { euforia: S.racha >= 3 ? 0.35 : 0 }, ARO.z + 3.2, false, { FILAS: 14, SUBE: 0.62, ATRAS: 0.72, X0: -24, X1: 24, valla: '#2A2436', fila: ['#2E2838', '#2A2434'], escalon: '#1E1A26', techo: '#5A4E6A' });
      // el cartel al pie de la tribuna
      { const zc = ARO.z + 3.1; for (let x = -24; x < 24; x += 6) { const a = cam.p(x, 0, zc), b = cam.p(x + 6, 0, zc), c = cam.p(x + 6, 0.8, zc), d = cam.p(x, 0.8, zc); ctx.fillStyle = (x / 6) % 2 ? '#14110F' : '#E8731C'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); const m = cam.p(x + 3, 0.4, zc); if (m.x > -40 && m.x < W + 40) texto(ctx, 'MANO A MANO', m.x, m.y, Math.max(3, 0.3 * m.k), (x / 6) % 2 ? '#E8731C' : '#14110F', 800); } }
      // el parquet: tablas con vetas
      const piso = ctx.createLinearGradient(0, hz, 0, H); piso.addColorStop(0, '#D4A066'); piso.addColorStop(1, '#A6713B'); ctx.fillStyle = piso; ctx.fillRect(0, hz, W, H - hz);
      ctx.save(); { const zb = ARO.z + 1.2; for (let x = -14; x <= 14; x += 1) { const a = cam.p(x, 0, cam.z0 + 0.4), b = cam.p(x, 0, zb); ctx.strokeStyle = 'rgba(80,40,10,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); if (hash(x + 40) < 0.5) { const c = cam.p(x + 1, 0, cam.z0 + 0.4), d = cam.p(x + 1, 0, zb); ctx.fillStyle = 'rgba(255,230,190,.07)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill(); } } } ctx.restore();
      // las líneas de la cancha, giradas alrededor del aro según el puesto (la cámara siempre mira al aro)
      const giro = PUESTOS[S.puesto].ang;
      const gira = (x, z) => { const dz = z - ARO.z; return { x: x * Math.cos(giro) - dz * Math.sin(giro), z: ARO.z + x * Math.sin(giro) + dz * Math.cos(giro) }; };
      const traza = (pts, cerrar) => { ctx.beginPath(); let primero = true; for (const [x, z] of pts) { const g = gira(x, z); if (g.z < 0.9) { primero = true; continue; } const q = cam.p(g.x, 0, g.z); if (primero) { ctx.moveTo(q.x, q.y); primero = false; } else ctx.lineTo(q.x, q.y); } if (cerrar) ctx.closePath(); };
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      // la zona pintada y el tiro libre
      traza([[-2.45, ARO.z + 1.2], [-2.45, ARO.z - 4.6], [2.45, ARO.z - 4.6], [2.45, ARO.z + 1.2]], true); ctx.fillStyle = 'rgba(232,115,28,.4)'; ctx.fill(); ctx.stroke();
      { const c = []; for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.15) c.push([Math.cos(a) * 1.8, ARO.z - 4.6 - Math.sin(a) * 1.8]); traza(c, false); ctx.stroke(); }
      // la línea de fondo y la de tres
      traza([[-7.5, ARO.z + 1.2], [7.5, ARO.z + 1.2]], false); ctx.stroke();
      { const c = []; for (let a = -1.35; a <= 1.35; a += 0.05) c.push([Math.sin(a) * 7.24, ARO.z - Math.cos(a) * 7.24]); c.unshift([Math.sin(-1.35) * 7.24, ARO.z + 1.2]); c.push([Math.sin(1.35) * 7.24, ARO.z + 1.2]); traza(c, false); ctx.stroke(); }
      ctx.restore();
      // el logo del centro: la marca propia
      { const g = gira(0, ARO.z - 2.6); const q = cam.p(g.x, 0, g.z); texto(ctx, 'MANO A MANO', q.x, q.y, Math.max(5, q.k * 0.16), 'rgba(255,255,255,.35)', 800); }
      // el tablero con su vidrio, el cuadrado y el poste
      const zT = ARO.z + 0.4, tw = ARO.tablero.ancho / 2 * Math.cos(giro), tz = ARO.tablero.ancho / 2 * Math.sin(giro);
      const T1 = cam.p(-tw, ARO.tablero.abajo, zT + tz), T2 = cam.p(tw, ARO.tablero.abajo, zT - tz), T3 = cam.p(tw, ARO.tablero.abajo + ARO.tablero.alto, zT - tz), T4 = cam.p(-tw, ARO.tablero.abajo + ARO.tablero.alto, zT + tz);
      ctx.save();
      const b1 = cam.p(0, 0, zT + 0.9), b2 = cam.p(0, ARO.tablero.abajo + 0.3, zT + 0.9); ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = Math.max(3, 0.14 * b2.k); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(cam.p(0, ARO.tablero.abajo + 0.3, zT + 0.2).x, cam.p(0, ARO.tablero.abajo + 0.3, zT + 0.2).y); ctx.stroke();
      const vidrio = ctx.createLinearGradient(T4.x, T4.y, T2.x, T2.y); vidrio.addColorStop(0, 'rgba(255,255,255,.32)'); vidrio.addColorStop(0.5, 'rgba(255,255,255,.14)'); vidrio.addColorStop(1, 'rgba(255,255,255,.26)');
      ctx.fillStyle = vidrio; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(T1.x, T1.y); ctx.lineTo(T2.x, T2.y); ctx.lineTo(T3.x, T3.y); ctx.lineTo(T4.x, T4.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      const r1 = cam.p(-0.3, ARO.y, zT), r2 = cam.p(0.3, ARO.y, zT), r3 = cam.p(0.3, ARO.y + 0.45, zT), r4 = cam.p(-0.3, ARO.y + 0.45, zT); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.lineTo(r3.x, r3.y); ctx.lineTo(r4.x, r4.y); ctx.closePath(); ctx.stroke();
      ctx.restore();
      const p = S.pelota; const pp = cam.p(p.x, p.y, p.z); const r = Math.max(4, p.r * pp.k);
      const detras = p.z > ARO.z;        // la pelota atrás del aro se dibuja antes que el aro
      const fuego = S.racha >= 3;
      const dibujarPelota = () => { const sp = cam.p(p.x, 0, p.z); if (S.fase === 'vuelo') estela(ctx, cam, S.estela, p.r, fuego); sombra(ctx, sp, Math.max(3, p.r * sp.k) * (1 - clamp(p.y / 7, 0, 0.5)), 0.42); if (S.fase === 'vuelo' && p.y > 0.5) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(pp.x, pp.y + r); ctx.lineTo(sp.x, sp.y); ctx.stroke(); ctx.restore(); } pelotaBasquet(ctx, pp.x, pp.y, r, p.rot, fuego || p.dorada); if (p.dorada) { ctx.save(); ctx.strokeStyle = '#FFD23F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pp.x, pp.y, r + 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } };
      if (detras) dibujarPelota();
      // el aro y la red: dos aros de hilo y doce tiras que se mecen con la pelota
      const ac = cam.p(0, ARO.y, ARO.z); const ar = ARO.r * ac.k; const onda = S.red ? Math.sin(S.red.k * Math.PI) * 7 : 0;
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const x0 = ac.x + Math.cos(a) * ar, y0 = ac.y + Math.sin(a) * ar * 0.35; const x1 = ac.x + Math.cos(a + 0.4) * ar * 0.6, y1 = ac.y + ar * 1.2 + onda; const x2 = ac.x + Math.cos(a) * ar * 0.5, y2 = ac.y + ar * 1.75 + onda * 1.3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(ac.x, ac.y + ar * 1.2 + onda, ar * 0.6, ar * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(ac.x, ac.y + ar * 1.75 + onda * 1.3, ar * 0.5, ar * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#C94F0E'; ctx.lineWidth = Math.max(2.5, ar * 0.2); ctx.beginPath(); ctx.ellipse(ac.x, ac.y + 1, ar, ar * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#F0862E'; ctx.lineWidth = Math.max(2, ar * 0.16); ctx.beginPath(); ctx.ellipse(ac.x, ac.y, ar, ar * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (!detras) dibujarPelota();
      if (S.flash > 0) { ctx.save(); ctx.globalAlpha = 0.25 * S.flash; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      if (S.fase === 'guia' || (S.fase === 'listo' && S.tiros === 0)) flechaGuia(ctx, pp.x, pp.y - r - 6, S.t);
      const seg = Math.ceil(S.tiempo);
      hud(ctx, 'TÚ ' + S.puntos, seg + ' s', S.fase === 'guia' ? 'Desliza hacia arriba para tirar' : S.fase === 'listo' ? PUESTOS[S.puesto].n + (dorada() ? ' · la dorada vale doble' : '') : '', seg <= 10 ? '#FF6B5B' : '#E8731C');
      if (S.fase !== 'final') texto(ctx, nombreRival + ' hizo ' + S.rival, W / 2, 29, 10.5, 'rgba(255,255,255,.7)', 700);
      // las cinco pelotas del puesto: las tiradas, la que viene, y la dorada al final
      ctx.save(); for (let i = 0; i < POR_PUESTO; i++) { const cx = 24 + i * 15; ctx.beginPath(); ctx.arc(cx, 62, 5.5, 0, Math.PI * 2); ctx.fillStyle = i < S.enPuesto ? 'rgba(255,255,255,.3)' : i === POR_PUESTO - 1 ? '#FFD23F' : '#F0862E'; ctx.fill(); if (i === S.enPuesto) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); } } ctx.restore();
      if (S.racha >= 2) texto(ctx, (fuego ? '🔥 en llamas · ' : '') + 'racha ' + S.racha, W - 24, 62, 11, '#FFB36B', 800, 'right');
      if (seg <= 10 && S.fase !== 'final' && S.fase !== 'guia') { ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(S.t * 10); texto(ctx, String(seg), W / 2, 90, 44, '#FF6B5B', 800); ctx.restore(); }
      if (S.confeti != null) confeti(ctx, S.t - S.confeti, ['#FFD23F', '#F0862E', '#fff']);
      if (S.mensaje) cartel(ctx, S.mensaje.t, S.mensaje.sub, S.mensaje.color, S.mensaje.k);
      if (S.fase === 'final') { const f = S.fin; const m = marcaDe('triples'); pantallaFinal(ctx, { k: S.t, fondo: 'rgba(11,10,20,.88)', titulo: f.puntos > f.rival ? (f.puntos >= 45 ? '¡EN LLAMAS!' : '¡LE GANASTE!') : f.puntos === f.rival ? 'EMPATE' : 'GANÓ EL MODELO', color: f.puntos > f.rival ? (f.puntos >= 45 ? '#FFD23F' : '#3ED17A') : f.puntos === f.rival ? '#E8E337' : '#FF6B5B', grande: f.puntos + ' – ' + f.rival, detalle: 'tú · ' + nombreRival + ' · ' + f.tiros + ' tiros · mejor racha ' + f.racha, marca: m ? m.puntos + ' pts' : null, nueva: f.nueva }); }
      ctx.restore();
    }
    return { avanzar, dibujar, soltar, estado: S, reiniciar };
  }

  /* ═══════════════════════════════ montar / desmontar ═══════════════════════════════ */
  const JUEGOS = { penales: Penales, libre: TiroLibre, triples: Triples };
  const FICHA = {
    penales: { titulo: 'Penales', sub: 'Cinco y cinco contra el arquero del modelo, y muerte súbita si empatan. Desliza hacia el arco: la velocidad del dedo es la fuerza, el largo es la altura. Ojo al amago del arquero. Cuando patea él, toca hacia dónde te tiras.' },
    libre: { titulo: 'Tiro libre', sub: 'Cinco tiros contra los cinco del modelo, cada uno desde un lugar distinto: el arco queda corrido y la barrera tapa el palo cercano. Desliza curvo y la pelota toma comba: por arriba de la barrera o por el costado, lejos del arquero. A la escuadra vale el aplauso.' },
    triples: { titulo: 'Triples', sub: 'Sesenta segundos contra el minuto del modelo, cinco pelotas por puesto alrededor del arco. Desliza hacia arriba: el largo del gesto es la fuerza. Tres puntos cada uno; la dorada de cada puesto vale seis, y con tres seguidos la pelota se prende fuego.' },
  };
  function montar(el, juego, opciones) {
    desmontar(); O = opciones || {}; RAIZ = el;
    const f = FICHA[juego] || FICHA.penales;
    el.innerHTML = `<div class="mam-juego"><div class="mam-seccion"><span>${esc(f.titulo)}</span><small>gratis siempre</small></div>
      <p class="mam-nota">${esc(f.sub)}</p>
      <div class="mam-cancha-caja"><canvas class="mam-cancha" aria-label="${esc(f.titulo)}: desliza para jugar"></canvas></div>
      <div class="mam-fila" style="justify-content:space-between"><button type="button" class="mam-boton secundario chico" data-juego-otra>Otra vez</button><button type="button" class="mam-boton secundario chico" data-juego-sonido aria-pressed="${Sonido.activo() ? 'true' : 'false'}">${Sonido.activo() ? 'Sonido: sí' : 'Sonido: no'}</button><button type="button" class="mam-boton secundario chico" data-juego-compartir>Compartir</button></div></div>`;
    CV = el.querySelector('canvas'); CTX = prepararLienzo(CV);
    G = JUEGOS[juego] ? JUEGOS[juego]() : Penales(); G.nombre = juego;
    gesto = Gesto(CV, (g) => { if (G) G.soltar(g); }, null);
    CV.tabIndex = 0;
    CV.addEventListener('keydown', (ev) => { if (!G) return; if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); G.soltar({ toque: true, x: W / 2, y: H / 2, largo: 0, dx: 0, dy: 0, vel: 0, comba: 0, angulo: 0 }); } });
    el.querySelector('[data-juego-otra]').addEventListener('click', () => { if (G) G.reiniciar(); });
    const bs = el.querySelector('[data-juego-sonido]'); bs.addEventListener('click', () => { const on = Sonido.alternar(); bs.textContent = on ? 'Sonido: sí' : 'Sonido: no'; bs.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    el.querySelector('[data-juego-compartir]').addEventListener('click', () => { if (!G) return; const S = G.estado; const m = marcaDe(juego); const t = juego === 'penales' ? `Penales en Mano a mano: ${S.serie.reduce((a, b) => a + b, 0)}-${S.serieRival.reduce((a, b) => a + b, 0)} contra el modelo.` + (m ? ` Mi mejor: ${m.yo}-${m.el}.` : '') : juego === 'libre' ? `Tiros libres en Mano a mano: ${S.serie.reduce((a, b) => a + b, 0)}-${S.rival} contra el modelo` + (S.escuadras ? `, ${S.escuadras} a la escuadra.` : '.') : `Triples en Mano a mano: ${S.puntos}-${S.rival} contra el modelo en un minuto` + (m ? ` (mi mejor: ${m.puntos}).` : '.'); if (O.compartir) O.compartir(t + ' ¿Te animás?'); });
    loop();
    return G;
  }
  function desmontar() { parar(); G = null; CV = null; CTX = null; gesto = null; Sonido.murmurar(false); if (RAIZ) { RAIZ.innerHTML = ''; RAIZ = null; } }
  raiz.mamJuegos = { montar, desmontar, FICHA, _estado: () => G, _soltar: (g) => G && G.soltar(g), _W: W, _H: H, _sonido: Sonido,
    _crear: (juego, opciones) => { O = opciones || {}; return (JUEGOS[juego] || Penales)(); }, _destino: destinoReal };
})(typeof window !== 'undefined' ? window : globalThis);
