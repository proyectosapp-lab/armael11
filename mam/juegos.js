// juegos.js — los juegos de Mano a mano: Penales, Tiro libre (fútbol) y Triples (NBA). Script clásico, expone
// window.mamJuegos. Un solo motor (gesto de deslizar → dirección, potencia y efecto; pelota en 3D con gravedad y
// comba; una cámara con perspectiva; dibujo en canvas sin imágenes) y tres pieles. El de tenis (el saque) vive en
// la web de Sacá vos, con el mismo espíritu: el punto se juega entero, se gana o se pierde a la vista.
//
//   mamJuegos.montar(el, 'penales' | 'libre' | 'triples', { ahora, vibrar, compartir, rival })
//   mamJuegos.desmontar()
//
// Reglas de diseño: todo es gratis; sin plata, sin premios; "vs el modelo" es el rival (un arquero o un defensor
// con número), nunca un jugador real con nombre y foto. Nada de acá toca la red.
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

  /* ─── la cámara: mundo (x a la derecha, y arriba, z adelante; metros) → pantalla ───
     La cámara está en (0, altura, 0) mirando a +z, con un poco de inclinación hacia abajo. */
  function camara(alt, foco, horizonte) {
    return {
      p: (x, y, z) => { const d = Math.max(0.3, z); return { x: W / 2 + (x * foco) / d, y: horizonte - ((y - alt) * foco) / d, k: foco / d }; },
    };
  }

  /* ─── el gesto: deslizar. Devuelve dirección (−1…1), largo (px), velocidad (px/ms) y comba (−1…1) ─── */
  function Gesto(cv, alSoltar, alMover) {
    let pts = null;
    const xy = (ev) => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H, t: ahora() }; };
    cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); try { cv.setPointerCapture(ev.pointerId); } catch (e) {} pts = [xy(ev)]; });
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
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfd3d8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip(); ctx.rotate(rot); ctx.fillStyle = '#1b1b1f';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const cx = Math.cos(a) * r * 0.62, cy = Math.sin(a) * r * 0.62; ctx.beginPath(); for (let k = 0; k < 5; k++) { const b = a + k * Math.PI * 2 / 5; ctx.lineTo(cx + Math.cos(b) * r * 0.26, cy + Math.sin(b) * r * 0.26); } ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const b = rot + k * Math.PI * 2 / 5; ctx.lineTo(Math.cos(b) * r * 0.3, Math.sin(b) * r * 0.3); } ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function pelotaBasquet(ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, '#ff9a4a'); g.addColorStop(1, '#c75a12');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip(); ctx.rotate(rot);
    ctx.strokeStyle = '#2a1206'; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-r * 0.9, 0, r * 0.75, r * 1.05, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * 0.9, 0, r * 0.75, r * 1.05, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.restore(); ctx.restore();
  }
  function texto(ctx, t, x, y, tam, color, peso, alin) { ctx.save(); ctx.font = (peso || 700) + ' ' + tam + 'px Poppins, system-ui, sans-serif'; ctx.fillStyle = color; ctx.textAlign = alin || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); ctx.restore(); }
  function cartel(ctx, t, sub, color, k) {
    // el golpe de texto: entra grande y se asienta
    const s = 1 + 0.5 * (1 - easeOut(k * 3)); ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.scale(s, s);
    ctx.globalAlpha = k > 0.8 ? clamp((1 - k) * 5, 0, 1) : 1;
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 18;
    const tam = Math.min(54, Math.floor(600 / Math.max(5, t.length))); texto(ctx, t, 0, 0, tam, color, 800); if (sub) texto(ctx, sub, 0, 44, 17, '#fff', 600); ctx.restore();
  }
  function flechaGuia(ctx, x, y, k, vertical) {
    // la insinuación del gesto: un dedo que desliza, en bucle
    const a = (k % 1.6) / 1.6; const al = a < 0.75 ? 1 : 1 - (a - 0.75) * 4; const d = easeOut(a / 0.75) * 90;
    ctx.save(); ctx.globalAlpha = 0.85 * al;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - d); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - d, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x, y - d, 18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function hud(ctx, izq, der, abajo) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.roundRect(10, 10, W - 20, 36, 12); ctx.fill();
    texto(ctx, izq, 22, 28, 14, '#fff', 700, 'left'); texto(ctx, der, W - 22, 28, 14, '#fff', 700, 'right');
    if (abajo) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.roundRect(W / 2 - 110, H - 44, 220, 30, 10); ctx.fill(); texto(ctx, abajo, W / 2, H - 29, 13, '#fff', 600); }
    ctx.restore();
  }
  function tandas(ctx, lista, x, y) { for (let i = 0; i < lista.length; i++) { ctx.beginPath(); ctx.arc(x + i * 16, y, 5.5, 0, Math.PI * 2); ctx.fillStyle = lista[i] === 1 ? '#3ED17A' : lista[i] === 0 ? '#E8473C' : 'rgba(255,255,255,.35)'; ctx.fill(); } }

  /* ═══════════════════════════════ FÚTBOL: el estadio, el arco, el arquero ═══════════════════════════════ */
  const ARCO = { ancho: 7.32, alto: 2.44, poste: 0.06 };
  function escenaFutbol(cam, zArco, t) {
    const ctx = CTX;
    // cielo de noche y tribuna
    const cielo = ctx.createLinearGradient(0, 0, 0, H * 0.4); cielo.addColorStop(0, '#0B1026'); cielo.addColorStop(1, '#1B2A52'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
    const hz = cam.p(0, 0, 400).y;
    // luces
    for (const lx of [W * 0.12, W * 0.88]) { const g = ctx.createRadialGradient(lx, hz - 90, 0, lx, hz - 90, 110); g.addColorStop(0, 'rgba(255,240,190,.22)'); g.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = g; ctx.fillRect(lx - 120, hz - 200, 240, 220); }
    // tribuna: franjas con puntos (la gente)
    const tribAlto = 54; const tg = ctx.createLinearGradient(0, hz - tribAlto, 0, hz); tg.addColorStop(0, '#2C2F45'); tg.addColorStop(1, '#3B3F5C'); ctx.fillStyle = tg; ctx.fillRect(0, hz - tribAlto, W, tribAlto);
    ctx.save(); ctx.globalAlpha = 0.5; for (let i = 0; i < 160; i++) { const sx = (i * 37) % W, sy = hz - tribAlto + 6 + ((i * 53) % (tribAlto - 10)); ctx.fillStyle = ['#E8E337', '#fff', '#C2542E', '#8bb4ff'][i % 4]; ctx.fillRect(sx, sy, 2.2, 2.2); } ctx.restore();
    // césped en perspectiva, con franjas
    const sueloG = ctx.createLinearGradient(0, hz, 0, H); sueloG.addColorStop(0, '#2E8F4C'); sueloG.addColorStop(1, '#1E7A3E'); ctx.fillStyle = sueloG; ctx.fillRect(0, hz, W, H - hz);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let z = 2; z < 60; z += 4) { const a = cam.p(-40, 0, z), b = cam.p(40, 0, z), c = cam.p(40, 0, z + 2), d = cam.p(-40, 0, z + 2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
    // líneas del área
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const linea = (pts) => { ctx.beginPath(); pts.forEach((p, i) => { const q = cam.p(p[0], 0, p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke(); };
    linea([[-20.16, zArco], [-20.16, zArco - 16.5], [20.16, zArco - 16.5], [20.16, zArco]]);
    linea([[-9.16, zArco], [-9.16, zArco - 5.5], [9.16, zArco - 5.5], [9.16, zArco]]);
    linea([[-40, zArco], [40, zArco]]);
    { const q = cam.p(0, 0, zArco - 11); ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(2, 0.12 * q.k), Math.max(1, 0.05 * q.k), 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill(); }
  }
  function arco(cam, zArco, red) {
    const ctx = CTX; const w = ARCO.ancho / 2, h = ARCO.alto, prof = 2;
    const A = cam.p(-w, 0, zArco), B = cam.p(-w, h, zArco), C = cam.p(w, h, zArco), D = cam.p(w, 0, zArco);
    const Bz = cam.p(-w, h, zArco + prof), Cz = cam.p(w, h, zArco + prof), Az = cam.p(-w, 0, zArco + prof), Dz = cam.p(w, 0, zArco + prof);
    // la red: fondo y laterales, con una ondulación cuando entra la pelota
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
    const onda = red ? Math.sin(red.k * Math.PI) * 10 * (1 - red.k) : 0;
    const n = 9;
    for (let i = 0; i <= n; i++) { const k = i / n; const x0 = lerp(Az.x, Dz.x, k), y0 = lerp(Az.y, Dz.y, k), x1 = lerp(Bz.x, Cz.x, k), y1 = lerp(Bz.y, Cz.y, k); const ox = red ? onda * Math.sin(k * Math.PI) * (k > red.x ? 1 : -1) : 0; ctx.beginPath(); ctx.moveTo(x0 + ox, y0); ctx.lineTo(x1 + ox, y1 + onda * 0.3); ctx.stroke(); }
    for (let i = 0; i <= 5; i++) { const k = i / 5; ctx.beginPath(); ctx.moveTo(lerp(Az.x, Bz.x, k), lerp(Az.y, Bz.y, k) + onda * k); ctx.lineTo(lerp(Dz.x, Cz.x, k), lerp(Dz.y, Cz.y, k) + onda * k); ctx.stroke(); }
    for (let i = 0; i <= 5; i++) { const k = i / 5; ctx.beginPath(); ctx.moveTo(lerp(A.x, Az.x, k), lerp(A.y, Az.y, k)); ctx.lineTo(lerp(B.x, Bz.x, k), lerp(B.y, Bz.y, k)); ctx.moveTo(lerp(D.x, Dz.x, k), lerp(D.y, Dz.y, k)); ctx.lineTo(lerp(C.x, Cz.x, k), lerp(C.y, Cz.y, k)); ctx.stroke(); }
    ctx.restore();
    // los postes y el travesaño
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2.5, Math.min(7, 0.12 * B.k));
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, Math.min(4, 0.06 * B.k)); ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(Bz.x, Bz.y); ctx.moveTo(C.x, C.y); ctx.lineTo(Cz.x, Cz.y); ctx.stroke();
    ctx.restore();
  }
  // un jugador estilizado: cuerpo, cabeza, brazos. `pose`: {x, y (altura del centro del cuerpo), z, brazos: [ang izq, ang der], inclinacion}
  // inclinacion > 0 = la cabeza se va hacia la derecha de la pantalla (x+). Un arquero que vuela a x+ se inclina positivo: cabeza adelante, pies atrás.
  function figura(cam, pose, colores, escala) {
    const ctx = CTX; const p = cam.p(pose.x, pose.y, pose.z); const k = p.k * (escala || 1);
    const alto = 1.75 * k, ancho = 0.5 * k;
    { const ps = cam.p(pose.x, 0, pose.z); sombra(ctx, ps, ancho * 0.9, 0.25); }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(pose.inclinacion || 0);
    // piernas
    ctx.strokeStyle = colores.pantalon; ctx.lineWidth = ancho * 0.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-ancho * 0.3, alto * 0.05); ctx.lineTo(-ancho * 0.45 + (pose.piernas || 0) * ancho, alto * 0.5); ctx.moveTo(ancho * 0.3, alto * 0.05); ctx.lineTo(ancho * 0.45 + (pose.piernas || 0) * ancho, alto * 0.5); ctx.stroke();
    // cuerpo
    ctx.fillStyle = colores.camiseta; ctx.beginPath(); ctx.roundRect(-ancho * 0.6, -alto * 0.42, ancho * 1.2, alto * 0.5, ancho * 0.3); ctx.fill();
    // brazos
    ctx.strokeStyle = colores.camiseta; ctx.lineWidth = ancho * 0.42;
    const br = pose.brazos || [Math.PI * 0.8, Math.PI * 0.2];
    ctx.beginPath(); ctx.moveTo(-ancho * 0.55, -alto * 0.35); ctx.lineTo(-ancho * 0.55 + Math.cos(br[0]) * alto * 0.45, -alto * 0.35 + Math.sin(br[0]) * alto * 0.45);
    ctx.moveTo(ancho * 0.55, -alto * 0.35); ctx.lineTo(ancho * 0.55 + Math.cos(br[1]) * alto * 0.45, -alto * 0.35 + Math.sin(br[1]) * alto * 0.45); ctx.stroke();
    // guantes
    if (colores.guantes) { ctx.fillStyle = colores.guantes; for (const [i, s] of [[0, -1], [1, 1]]) { ctx.beginPath(); ctx.arc(s * ancho * 0.55 + Math.cos(br[i]) * alto * 0.45, -alto * 0.35 + Math.sin(br[i]) * alto * 0.45, ancho * 0.3, 0, Math.PI * 2); ctx.fill(); } }
    // cabeza
    ctx.fillStyle = colores.piel; ctx.beginPath(); ctx.arc(0, -alto * 0.55, ancho * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colores.pelo || '#2b1d12'; ctx.beginPath(); ctx.arc(0, -alto * 0.6, ancho * 0.4, Math.PI, Math.PI * 2); ctx.fill();
    ctx.restore();
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
    if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * 0.45; b.vx *= 0.8; b.vz *= 0.8; b.piques = (b.piques || 0) + 1; }
  }

  // qué velocidad vertical hace falta para que la pelota llegue a `altura` en z = zFin (con el freno del aire): se prueba
  function vyPara(p, altura, zFin) {
    const prueba = (vy) => { const b = { x: 0, y: p.y, z: p.z, vx: 0, vy, vz: p.vz, r: p.r, rot: 0, freno: p.freno, comba: 0 }; let k = 0; while (b.z < zFin && k++ < 400) { const g = 9.81, dt = 1 / 120; b.vy -= g * dt; const f = 1 - (b.freno || 0) * dt; b.vz *= f; b.vy *= f; b.y += b.vy * dt; b.z += b.vz * dt; } return b.y; };
    let lo = -5, hi = 30; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (prueba(m) < altura) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /* ═══════════════════════════════ PENALES ═══════════════════════════════ */
  function Penales() {
    const cam = camara(1.5, 330, 215);
    const Z_ARCO = 14, Z_PELOTA = 3, DIST = Z_ARCO - Z_PELOTA;
    const S = { fase: 'guia', t: 0, serie: [], serieRival: [], turno: 0, tanda: 'yo', pelota: null, arquero: null, mensaje: null, red: null, sacudida: 0, fin: null, racha: 0 };
    const COL_YO = { camiseta: '#E8E337', pantalon: '#1b1b1f', piel: '#C68642', guantes: '#E8731C' };
    const COL_RIVAL = { camiseta: '#C2542E', pantalon: '#1b1b1f', piel: '#8D5524' };
    const nombreRival = (O.rival && O.rival.nombre) || 'el modelo';
    function reiniciarPelota() { S.pelota = { x: 0, y: 0.11, z: Z_PELOTA, vx: 0, vy: 0, vz: 0, r: 0.11, rot: 0, comba: 0, quieta: true }; }
    function reiniciarArquero() { S.arquero = { x: 0, y: 0.9, z: Z_ARCO - 0.3, vuelo: null }; }
    reiniciarPelota(); reiniciarArquero();

    // ── mi patada: el gesto dice a dónde y con cuánta fuerza ──
    function patear(g) {
      if (g.toque || g.largo < 25 || g.dy > -10) return;
      const p = S.pelota; const pot = clamp(g.vel / 2.2, 0.35, 1);          // potencia por velocidad del dedo
      const ang = clamp(g.angulo, -0.8, 0.8);                                 // izquierda / derecha: a 0.5 rad (≈30°) llega al palo
      const alturaDeseada = clamp(g.largo / 170, 0.08, 1.35) * ARCO.alto;    // más largo = más alto (pasado el travesaño, se va)
      const tVuelo = lerp(0.95, 0.45, pot);
      p.vz = DIST / tVuelo; p.vx = ((ang / 0.5) * 3.2) / tVuelo; p.comba = g.comba * 5;
      p.vy = (alturaDeseada - p.y + 0.5 * 9.81 * tVuelo * tVuelo) / tVuelo;
      p.quieta = false; S.fase = 'vuelo-mio'; S.t = 0;
      vibrar('toque');
      // el arquero del modelo: lee la patada con una probabilidad que baja con la potencia y sube con lo central
      const dirReal = Math.sign(p.vx + p.comba * tVuelo * 0.5) || 0;
      const centro = Math.abs(ang) < 0.18;
      const pLee = clamp(0.62 - pot * 0.3 + (centro ? 0.15 : 0) - S.racha * 0.03, 0.2, 0.8);
      let dir = azar() < pLee ? dirReal : (azar() < 0.5 ? -dirReal : 0);
      if (dir === 0 && !centro && azar() < 0.5) dir = azar() < 0.5 ? 1 : -1;
      const alto = alturaDeseada > ARCO.alto * 0.55 ? 1 : 0;
      S.arquero.vuelo = { dir, alto: azar() < 0.65 ? alto : 1 - alto, t0: S.t + lerp(0.25, 0.08, pot), dur: 0.55 };
    }
    // ── su patada: el rival patea y yo me tiro con el gesto (o un toque a un lado) ──
    function rivalPatea() {
      const p = S.pelota; const dir = [-0.9, -0.5, 0.15, 0.5, 0.9][Math.floor(azar() * 5)]; const alto = azar() < 0.5 ? 0.3 : 0.75;
      const tVuelo = lerp(0.8, 0.5, azar()); p.vz = DIST / tVuelo; p.vx = (dir * ARCO.ancho * 0.44) / tVuelo; p.comba = 0;
      p.vy = (alto * ARCO.alto - p.y + 0.5 * 9.81 * tVuelo * tVuelo) / tVuelo; p.quieta = false;
      S.fase = 'vuelo-rival'; S.t = 0; S.pista = { dir: azar() < 0.75 ? Math.sign(dir) : -Math.sign(dir), hasta: 0.3 };
    }
    function atajar(g) {
      if (S.arquero.vuelo) return;
      // a dónde me tiro: tocá cerca del palo para volar hasta el palo, cerca del medio para quedarte; arriba o abajo
      const dir = g.toque ? Math.sign(g.x - W / 2) : Math.sign(g.dx || (g.x - W / 2));
      const alto = g.toque ? (g.y < H * 0.5 ? 1 : 0) : (g.dy < -40 ? 1 : 0);
      const lejos = g.toque ? clamp(Math.abs(g.x - W / 2) / 130, 0, 1) : clamp(g.largo / 130, 0, 1);
      S.arquero.vuelo = { dir: lejos < 0.15 ? 0 : (dir || 0), alto, dist: 0.5 + lejos * 2.4, t0: S.t, dur: 0.5 }; vibrar('toque');
    }
    function posArquero() {
      const a = S.arquero, v = a.vuelo; if (!v || S.t < v.t0) return { x: a.x, y: 0.9, brazos: [Math.PI * 0.75, Math.PI * 0.25], inclinacion: 0 };
      const k = easeOut((S.t - v.t0) / v.dur);
      const x = a.x + v.dir * k * (v.dist || 2.9), y = 0.9 + (v.alto ? k * 0.9 : -k * 0.35);
      return { x, y, brazos: v.dir < 0 ? [Math.PI * 1.1, Math.PI * 0.9] : v.dir > 0 ? [Math.PI * 0.1, -Math.PI * 0.1] : [Math.PI * 1.35, -Math.PI * 0.35], inclinacion: v.dir * k * 1.1, alcance: 1.05, mio: S.tanda === 'el' };
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
      if (res === 'gol') { S.red = { k: 0, x: (p.x / ARCO.ancho) + 0.5 }; p.vz *= 0.15; p.vx *= 0.2; p.vy *= 0.2; S.sacudida = 0.5; vibrar(mio ? 'partido' : 'set'); }
      if (res === 'atajada') { p.vz = -1.5; p.vx = (azar() - 0.5) * 3; p.vy = 2; vibrar('set'); }
      if (res === 'poste') { p.vz = -4; p.vx = -Math.sign(p.x) * 2; vibrar('set'); }
      const gol = res === 'gol' ? 1 : 0;
      (mio ? S.serie : S.serieRival).push(gol);
      if (mio) S.racha = gol ? S.racha + 1 : 0;
      S.mensaje = { t: mio ? (gol ? '¡GOL!' : res === 'atajada' ? 'ATAJÓ' : res === 'poste' ? 'PALO' : 'AFUERA') : (gol ? 'GOL DE ÉL' : res === 'atajada' ? '¡LA SACASTE!' : res === 'poste' ? 'PALO' : 'LA TIRÓ AFUERA'),
        sub: mio ? (gol ? '' : res === 'atajada' ? 'más fuerte o más al ángulo' : res === 'afuera' ? 'un poco menos de dedo' : '') : '', color: (gol === 1) === mio ? '#3ED17A' : '#FF6B5B', k: 0 };
      S.fase = 'fin-tiro'; S.t = 0;
    }
    function siguiente() {
      S.mensaje = null; S.red = null; reiniciarPelota(); reiniciarArquero(); S.pista = null;
      const yo = S.serie.length, el = S.serieRival.length;
      if (yo >= 5 && el >= 5) { S.fase = 'final'; S.fin = { yo: S.serie.reduce((a, b) => a + b, 0), el: S.serieRival.reduce((a, b) => a + b, 0) }; if (O.alTerminar) O.alTerminar({ juego: 'penales', ...S.fin }); vibrar(S.fin.yo > S.fin.el ? 'partido' : 'toque'); return; }
      // alternados: yo, él, yo, él…
      if (yo <= el && yo < 5) { S.tanda = 'yo'; S.fase = 'listo'; } else { S.tanda = 'el'; S.fase = 'rival-prepara'; S.t = 0; }
    }
    function soltar(g) {
      if (S.fase === 'guia') { S.fase = 'listo'; }
      if (S.fase === 'listo' && S.tanda === 'yo') return patear(g);
      if (S.fase === 'vuelo-rival') return atajar(g);
      if (S.fase === 'final') { if (g.toque) reiniciar(); }
    }
    function reiniciar() { S.serie = []; S.serieRival = []; S.fin = null; S.racha = 0; S.tanda = 'yo'; S.fase = 'listo'; S.mensaje = null; S.red = null; reiniciarPelota(); reiniciarArquero(); }
    function avanzar(dt) {
      S.t += dt; S.sacudida = Math.max(0, S.sacudida - dt);
      if (S.red) S.red.k = Math.min(1, S.red.k + dt * 1.6);
      if (S.mensaje) S.mensaje.k = Math.min(1, S.mensaje.k + dt * 0.55);
      if (S.fase === 'rival-prepara' && S.t > 1.1) rivalPatea();
      if (S.fase === 'vuelo-mio' || S.fase === 'vuelo-rival') {
        const p = S.pelota; const antes = p.z; volar(p, dt);
        if (antes < Z_ARCO && p.z >= Z_ARCO) { p.z = Z_ARCO; cerrarTiro(cruzoLaLinea(), S.fase === 'vuelo-mio'); }
        else if (S.fase === 'vuelo-rival' && S.t > 2.5) cerrarTiro('afuera', false);
      }
      if (S.fase === 'fin-tiro') { volar(S.pelota, dt); if (S.t > 1.5) siguiente(); }
    }
    function dibujar() {
      const ctx = CTX; ctx.setTransform(CV.width / W, 0, 0, CV.height / H, 0, 0); ctx.save();
      if (S.sacudida > 0) ctx.translate(Math.sin(S.t * 91) * 4 * S.sacudida, Math.cos(S.t * 73) * 4 * S.sacudida);
      escenaFutbol(cam, Z_ARCO, S.t); arco(cam, Z_ARCO, S.red);
      // el arquero (yo o el del modelo)
      const A = posArquero(); figura(cam, { x: A.x, y: A.y, z: Z_ARCO - 0.3, brazos: A.brazos, inclinacion: A.inclinacion }, S.tanda === 'yo' ? COL_RIVAL : COL_YO, 1);
      if (S.tanda === 'el' && S.fase !== 'final') { if (S.fase === 'rival-prepara' || S.fase === 'vuelo-rival') { const k = S.fase === 'rival-prepara' ? easeOut(S.t / 1.1) : 1; figura(cam, { x: -2.1 + k * 0.9, y: 0.9, z: Z_PELOTA + 2.4 - k * 1.3, brazos: [Math.PI * 0.9, Math.PI * 0.1], piernas: k * 0.6, inclinacion: 0.15 * k }, COL_RIVAL, 0.8); } }
      // la pista de hacia dónde patea (su cuerpo "mira" a un lado un instante)
      if (S.pista && S.fase === 'vuelo-rival' && S.t < S.pista.hasta) { const q = cam.p(S.pista.dir * 2.2, 1.6, Z_ARCO - 1); ctx.save(); ctx.globalAlpha = 0.9; texto(ctx, S.pista.dir < 0 ? '◀' : '▶', q.x, q.y, 22, '#E8E337', 800); ctx.restore(); }
      // la pelota con sombra
      const p = S.pelota; const sp = cam.p(p.x, 0, p.z); const pp = cam.p(p.x, p.y, p.z); const r = Math.max(3, p.r * pp.k * 1.25);
      sombra(ctx, sp, r, 0.35); pelotaFutbol(ctx, pp.x, pp.y, r, p.rot);
      // guía
      if (S.fase === 'guia' || (S.fase === 'listo' && S.tanda === 'yo' && S.serie.length === 0)) flechaGuia(ctx, pp.x, pp.y - r - 6, S.t);
      // HUD
      const yo = S.serie.reduce((a, b) => a + b, 0), el = S.serieRival.reduce((a, b) => a + b, 0);
      hud(ctx, 'Vos ' + yo, nombreRival + ' ' + el, S.fase === 'guia' ? 'Deslizá para patear' : S.tanda === 'yo' && S.fase === 'listo' ? 'Tu penal: deslizá hacia el arco' : S.fase === 'rival-prepara' ? 'Patea él: tocá a dónde te tirás' : S.fase === 'vuelo-rival' ? '¡Tirate!' : '');
      ctx.save(); tandas(ctx, S.serie.concat(Array(Math.max(0, 5 - S.serie.length)).fill(null)), 22, 62); tandas(ctx, S.serieRival.concat(Array(Math.max(0, 5 - S.serieRival.length)).fill(null)), W - 22 - 64, 62); ctx.restore();
      if (S.mensaje) cartel(ctx, S.mensaje.t, S.mensaje.sub, S.mensaje.color, S.mensaje.k);
      if (S.fase === 'final') finalFutbol(ctx, S.fin.yo, S.fin.el, nombreRival);
      ctx.restore();
    }
    return { avanzar, dibujar, soltar, mover: null, estado: S, reiniciar };
  }
  function finalFutbol(ctx, yo, el, rival) {
    ctx.save(); ctx.fillStyle = 'rgba(11,16,38,.82)'; ctx.fillRect(0, 0, W, H);
    const gane = yo > el, empate = yo === el;
    texto(ctx, gane ? '¡GANASTE!' : empate ? 'EMPATE' : 'PERDISTE', W / 2, H * 0.33, 40, gane ? '#3ED17A' : empate ? '#E8E337' : '#FF6B5B', 800);
    texto(ctx, yo + ' – ' + el, W / 2, H * 0.44, 64, '#fff', 800);
    texto(ctx, 'vos · ' + rival, W / 2, H * 0.52, 15, 'rgba(255,255,255,.75)', 600);
    texto(ctx, 'Tocá para jugar otra', W / 2, H * 0.64, 16, '#fff', 700);
    ctx.restore();
  }

  /* ═══════════════════════════════ TIRO LIBRE ═══════════════════════════════ */
  function TiroLibre() {
    const cam = camara(1.7, 330, 210);
    const Z_PELOTA = 3.2, Z_ARCO = 24, DIST = Z_ARCO - Z_PELOTA, Z_BARRERA = Z_PELOTA + 9.15;
    const S = { fase: 'guia', t: 0, serie: [], pelota: null, arquero: null, barrera: null, mensaje: null, red: null, sacudida: 0, fin: null, racha: 0, salto: 0 };
    const COL_RIVAL = { camiseta: '#C2542E', pantalon: '#1b1b1f', piel: '#8D5524' }, COL_ARQ = { camiseta: '#E8E337', pantalon: '#1b1b1f', piel: '#C68642', guantes: '#E8731C' };
    const nombreRival = (O.rival && O.rival.nombre) || 'el modelo';
    function armar() {
      S.pelota = { x: 0, y: 0.11, z: Z_PELOTA, vx: 0, vy: 0, vz: 0, r: 0.11, rot: 0, comba: 0 };
      const lado = azar() < 0.5 ? -1 : 1;                         // la barrera tapa un palo; el arquero cubre el otro
      S.barrera = { x: lado * 1.6, n: 4, lado, salto: 0 }; S.arquero = { x: -lado * 1.4, vuelo: null }; S.salto = 0;
    }
    armar();
    function patear(g) {
      if (g.toque || g.largo < 25 || g.dy > -10) return;
      const p = S.pelota; const pot = clamp(g.vel / 2.0, 0.35, 1); const ang = clamp(g.angulo, -0.7, 0.7);
      const altura = clamp(g.largo / 150, 0.1, 1.5) * ARCO.alto; const tVuelo = lerp(1.25, 0.95, pot);
      p.vz = DIST / tVuelo; p.vx = ((ang / 0.5) * 3.2) / tVuelo; p.comba = g.comba * 6; p.freno = 0.22;
      // el tiro libre pica: sale alto, el aire lo frena y cae. La altura de llegada es la que pide el gesto (150 px = el travesaño).
      p.vy = vyPara(p, altura, Z_ARCO);
      S.fase = 'vuelo'; S.t = 0; vibrar('toque');
      S.barrera.saltoT = S.t + 0.12;
      // el arquero: si "lee" el tiro, vuela a donde va la pelota (x final estimado); si no, al otro lado
      const xFinal = clamp(p.vx * tVuelo + 0.5 * p.comba * tVuelo * tVuelo, -3.3, 3.3);
      const dirReal = Math.sign(xFinal) || 1;
      const pLee = clamp(0.55 - pot * 0.25 - Math.abs(g.comba) * 0.2, 0.15, 0.7);
      const lee = azar() < pLee;
      S.arquero.vuelo = { dir: lee ? dirReal : -dirReal, hasta: lee ? xFinal : -dirReal * 2.2, alto: altura > ARCO.alto * 0.5 ? 1 : 0, t0: S.t + lerp(0.5, 0.25, pot), dur: 0.6 };
    }
    function posArquero() { const a = S.arquero, v = a.vuelo; if (!v || S.t < v.t0) return { x: a.x, y: 0.9, brazos: [Math.PI * 0.75, Math.PI * 0.25], inclinacion: 0 }; const k = easeOut((S.t - v.t0) / v.dur); const destino = v.hasta != null ? v.hasta : a.x + v.dir * 2.6; return { x: lerp(a.x, destino, k), y: 0.9 + (v.alto ? k * 0.8 : -k * 0.3), brazos: v.dir < 0 ? [Math.PI * 1.1, Math.PI * 0.9] : [Math.PI * 0.1, -Math.PI * 0.1], inclinacion: v.dir * k * Math.min(1, Math.abs(destino - a.x) / 2.5), alcance: 0.95 }; }
    function cerrar(res) {
      const p = S.pelota;
      if (res === 'gol') { S.red = { k: 0, x: (p.x / ARCO.ancho) + 0.5 }; p.vz *= 0.15; p.vx *= 0.2; p.vy *= 0.2; S.sacudida = 0.5; vibrar('partido'); }
      if (res === 'barrera') { p.vz = -3; p.vy = 2.5; p.vx = (azar() - 0.5) * 3; vibrar('set'); }
      if (res === 'atajada') { p.vz = -1.5; p.vy = 2; vibrar('set'); }
      if (res === 'poste') { p.vz = -4; p.vx = -Math.sign(p.x) * 2; vibrar('set'); }
      const gol = res === 'gol' ? 1 : 0; S.serie.push(gol); S.racha = gol ? S.racha + 1 : 0;
      S.mensaje = { t: gol ? '¡GOLAZO!' : res === 'barrera' ? 'BARRERA' : res === 'atajada' ? 'ATAJÓ' : res === 'poste' ? 'PALO' : 'AFUERA', sub: gol ? '' : res === 'barrera' ? 'por arriba, o con comba por el costado' : res === 'afuera' ? 'menos dedo: la tiraste alta' : '', color: gol ? '#3ED17A' : '#FF6B5B', k: 0 };
      S.fase = 'fin-tiro'; S.t = 0;
    }
    function siguiente() {
      S.mensaje = null; S.red = null; armar();
      if (S.serie.length >= 5) { S.fase = 'final'; S.fin = { goles: S.serie.reduce((a, b) => a + b, 0) }; if (O.alTerminar) O.alTerminar({ juego: 'libre', ...S.fin }); return; }
      S.fase = 'listo';
    }
    function reiniciar() { S.serie = []; S.fin = null; S.racha = 0; S.fase = 'listo'; S.mensaje = null; S.red = null; armar(); }
    function soltar(g) { if (S.fase === 'guia') S.fase = 'listo'; if (S.fase === 'listo') return patear(g); if (S.fase === 'final' && g.toque) reiniciar(); }
    function avanzar(dt) {
      S.t += dt; S.sacudida = Math.max(0, S.sacudida - dt);
      if (S.red) S.red.k = Math.min(1, S.red.k + dt * 1.6);
      if (S.mensaje) S.mensaje.k = Math.min(1, S.mensaje.k + dt * 0.55);
      if (S.fase === 'vuelo') {
        const p = S.pelota; const antes = p.z; volar(p, dt);
        const B = S.barrera; if (B.saltoT != null && S.t > B.saltoT) { const k = (S.t - B.saltoT) / 0.6; B.salto = k < 1 ? Math.sin(k * Math.PI) * 0.35 : 0; }
        if (antes < Z_BARRERA && p.z >= Z_BARRERA) { const topeBarrera = 1.8 + B.salto; const anchoB = B.n * 0.42; if (p.y < topeBarrera && Math.abs(p.x - B.x) < anchoB) { p.z = Z_BARRERA; return cerrar('barrera'); } }
        if (antes < Z_ARCO && p.z >= Z_ARCO) {
          p.z = Z_ARCO; const A = posArquero();
          const enArco = Math.abs(p.x) < ARCO.ancho / 2 - 0.1 && p.y < ARCO.alto - 0.1 && p.y > 0;
          const poste = (Math.abs(Math.abs(p.x) - ARCO.ancho / 2) < 0.16 && p.y < ARCO.alto + 0.1) || (Math.abs(p.y - ARCO.alto) < 0.16 && Math.abs(p.x) < ARCO.ancho / 2 + 0.1);
          const manos = (Math.abs(p.x - A.x) < (A.alcance ? 1.0 : 0.7)) && (Math.abs(p.y - A.y) < (A.alcance ? 1.25 : 1.0));
          cerrar(poste ? 'poste' : enArco && manos ? 'atajada' : enArco ? 'gol' : 'afuera');
        } else if (p.piques > 0 && p.z < Z_ARCO) cerrar('afuera');
      }
      if (S.fase === 'fin-tiro') { volar(S.pelota, dt); if (S.t > 1.6) siguiente(); }
    }
    function dibujar() {
      const ctx = CTX; ctx.setTransform(CV.width / W, 0, 0, CV.height / H, 0, 0); ctx.save();
      if (S.sacudida > 0) ctx.translate(Math.sin(S.t * 91) * 4 * S.sacudida, Math.cos(S.t * 73) * 4 * S.sacudida);
      escenaFutbol(cam, Z_ARCO, S.t); arco(cam, Z_ARCO, S.red);
      const A = posArquero(); figura(cam, { x: A.x, y: A.y, z: Z_ARCO - 0.3, brazos: A.brazos, inclinacion: A.inclinacion }, COL_ARQ, 1);
      // la barrera: cuatro, saltan
      const B = S.barrera; for (let i = 0; i < B.n; i++) { const x = B.x + (i - (B.n - 1) / 2) * 0.5; figura(cam, { x, y: 0.9 + B.salto, z: Z_BARRERA, brazos: [Math.PI * 0.55, Math.PI * 0.45], inclinacion: 0 }, COL_RIVAL, 1); }
      const p = S.pelota; const sp = cam.p(p.x, 0, p.z); const pp = cam.p(p.x, p.y, p.z); const r = Math.max(2.5, p.r * pp.k * 1.25);
      sombra(ctx, sp, r, 0.35); pelotaFutbol(ctx, pp.x, pp.y, r, p.rot);
      if (S.fase === 'guia' || (S.fase === 'listo' && S.serie.length === 0)) flechaGuia(ctx, pp.x, pp.y - r - 6, S.t);
      hud(ctx, 'Goles ' + S.serie.reduce((a, b) => a + b, 0), 'Tiro ' + Math.min(5, S.serie.length + 1) + ' de 5', S.fase === 'guia' ? 'Deslizá curvo para darle comba' : S.fase === 'listo' ? 'Por arriba de la barrera, o con comba' : '');
      ctx.save(); tandas(ctx, S.serie.concat(Array(Math.max(0, 5 - S.serie.length)).fill(null)), 22, 62); ctx.restore();
      if (S.mensaje) cartel(ctx, S.mensaje.t, S.mensaje.sub, S.mensaje.color, S.mensaje.k);
      if (S.fase === 'final') { ctx.save(); ctx.fillStyle = 'rgba(11,16,38,.82)'; ctx.fillRect(0, 0, W, H); const g = S.fin.goles; texto(ctx, g >= 4 ? '¡CRACK!' : g >= 2 ? 'BIEN AHÍ' : 'A PRACTICAR', W / 2, H * 0.33, 40, g >= 4 ? '#3ED17A' : g >= 2 ? '#E8E337' : '#FF6B5B', 800); texto(ctx, g + ' de 5', W / 2, H * 0.44, 64, '#fff', 800); texto(ctx, 'tiros libres', W / 2, H * 0.52, 15, 'rgba(255,255,255,.75)', 600); texto(ctx, 'Tocá para jugar otra', W / 2, H * 0.64, 16, '#fff', 700); ctx.restore(); }
      ctx.restore();
    }
    return { avanzar, dibujar, soltar, estado: S, reiniciar };
  }

  /* ═══════════════════════════════ TRIPLES ═══════════════════════════════ */
  function Triples() {
    const cam = camara(1.9, 420, 250);
    const ARO = { z: 7.6, y: 3.05, r: 0.225, tablero: { ancho: 1.8, alto: 1.05, abajo: 2.9 } };
    const PUESTOS = [{ n: 'esquina izquierda', ang: -0.55 }, { n: 'ala izquierda', ang: -0.28 }, { n: 'frente', ang: 0 }, { n: 'ala derecha', ang: 0.28 }, { n: 'esquina derecha', ang: 0.55 }];
    const S = { fase: 'guia', t: 0, tiempo: 60, puntos: 0, tiros: 0, racha: 0, mejorRacha: 0, puesto: 2, pelota: null, mensaje: null, red: null, fin: null, sacudida: 0, ultimo: null };
    function armar() { S.pelota = { x: 0, y: 1.8, z: 1.5, vx: 0, vy: 0, vz: 0, r: 0.12, rot: 0, comba: 0, toco: false, tablero: false }; }
    armar();
    const nombreRival = (O.rival && O.rival.nombre) || 'el modelo';
    function lanzar(g) {
      if (g.toque || g.largo < 25 || g.dy > -10) return;
      const p = S.pelota; const fuerza = clamp(0.5 + (g.largo / 238) * 0.5, 0.5, 1.3);   // el largo del gesto es la fuerza; la justa ronda los 190 px
      const ang = clamp(g.angulo, -0.45, 0.45);
      const tVuelo = 1.25; const dz = ARO.z - p.z;
      const vz = (dz / tVuelo) * fuerza; const vx = Math.tan(ang) * vz * 0.32 + g.comba * 0.4;
      const vy = ((ARO.y + 0.9 - p.y) + 0.5 * 9.81 * tVuelo * tVuelo) / tVuelo * (0.85 + fuerza * 0.15);
      Object.assign(p, { vx, vy, vz, toco: false, tablero: false, rot: 0 });
      S.fase = 'vuelo'; S.t = 0; S.tiros++; vibrar('toque');
    }
    function encesto() {
      S.puntos += 3; S.racha++; S.mejorRacha = Math.max(S.mejorRacha, S.racha); S.red = { k: 0 }; S.sacudida = 0.3;
      S.mensaje = { t: S.pelota.toco ? '¡ADENTRO!' : '¡SWISH!', sub: S.racha >= 3 ? 'racha de ' + S.racha : '', color: '#3ED17A', k: 0 }; vibrar('set'); S.ultimo = 'adentro';
    }
    function fallo(por) { S.racha = 0; S.mensaje = { t: por === 'corto' ? 'CORTO' : por === 'largo' ? 'LARGO' : 'AFUERA', sub: por === 'corto' ? 'más largo el gesto' : por === 'largo' ? 'más corto el gesto' : '', color: '#FF6B5B', k: 0 }; vibrar('toque'); S.ultimo = por; }
    function terminarTiro() { S.fase = 'fin-tiro'; S.t = 0; }
    function siguiente() { S.mensaje = null; S.red = null; S.puesto = (S.puesto + 1) % PUESTOS.length; armar(); if (S.tiempo <= 0) { S.fase = 'final'; S.fin = { puntos: S.puntos, tiros: S.tiros, racha: S.mejorRacha }; if (O.alTerminar) O.alTerminar({ juego: 'triples', ...S.fin }); return; } S.fase = 'listo'; }
    function reiniciar() { Object.assign(S, { tiempo: 60, puntos: 0, tiros: 0, racha: 0, mejorRacha: 0, puesto: 2, fin: null, mensaje: null, red: null, fase: 'listo' }); armar(); }
    function soltar(g) { if (S.fase === 'guia') S.fase = 'listo'; if (S.fase === 'listo') return lanzar(g); if (S.fase === 'final' && g.toque) reiniciar(); }
    function avanzar(dt) {
      S.t += dt; S.sacudida = Math.max(0, S.sacudida - dt);
      if (S.fase !== 'guia' && S.fase !== 'final') S.tiempo = Math.max(0, S.tiempo - dt);
      if (S.red) S.red.k = Math.min(1, S.red.k + dt * 1.8);
      if (S.mensaje) S.mensaje.k = Math.min(1, S.mensaje.k + dt * 0.6);
      if (S.fase === 'vuelo') {
        const p = S.pelota; const yAntes = p.y, zAntes = p.z; volar(p, dt);
        // el tablero: detrás del aro
        const zT = ARO.z + 0.4; if (zAntes < zT && p.z >= zT && p.y > ARO.tablero.abajo && p.y < ARO.tablero.abajo + ARO.tablero.alto && Math.abs(p.x) < ARO.tablero.ancho / 2) { p.z = zT; p.vz = -p.vz * 0.55; p.tablero = true; p.toco = true; vibrar('toque'); }
        // el aro: un anillo en y = 3.05; cuando pasa por esa altura bajando
        if (yAntes > ARO.y && p.y <= ARO.y && p.vy < 0) {
          const d = Math.hypot(p.x, p.z - ARO.z);
          if (d < ARO.r - p.r * 0.3) { encesto(); terminarTiro(); p.vz *= 0.1; p.vx *= 0.1; p.vy = -1.5; }
          else if (d < ARO.r + p.r) {
            // pega en el hierro: rebota, con un poco de azar; si el centro cae adentro del aro casi siempre entra igual
            p.toco = true; vibrar('toque');
            const nx = p.x / (d || 1), nz = (p.z - ARO.z) / (d || 1);
            if (azar() < (d < ARO.r ? 0.75 : 0.2)) { encesto(); terminarTiro(); p.vy = -1.5; p.vx *= 0.1; p.vz *= 0.1; }
            else { p.vy = Math.abs(p.vy) * 0.5 + 1; p.vx = -nx * 1.6 + (azar() - 0.5); p.vz = -nz * 1.6 + (azar() - 0.5) * 0.6; p.y = ARO.y + 0.02; }
          }
        }
        if (p.y <= p.r + 0.01 && S.fase === 'vuelo') { fallo(p.z < ARO.z - 0.4 ? 'corto' : p.z > ARO.z + 0.2 || p.tablero ? 'largo' : 'afuera'); terminarTiro(); }
        if (S.t > 4) { fallo('afuera'); terminarTiro(); }
      }
      if (S.fase === 'fin-tiro') { volar(S.pelota, dt); if (S.t > 1.2) siguiente(); }
    }
    function dibujar() {
      const ctx = CTX; ctx.setTransform(CV.width / W, 0, 0, CV.height / H, 0, 0); ctx.save();
      if (S.sacudida > 0) ctx.translate(Math.sin(S.t * 91) * 3 * S.sacudida, Math.cos(S.t * 73) * 3 * S.sacudida);
      // el estadio: oscuro, luces, parquet
      const cielo = ctx.createLinearGradient(0, 0, 0, H * 0.45); cielo.addColorStop(0, '#0B0A14'); cielo.addColorStop(1, '#2A1F35'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
      const hz = cam.p(0, 0, 400).y;
      ctx.save(); ctx.globalAlpha = 0.6; for (let i = 0; i < 220; i++) { const sx = (i * 41) % W, sy = hz - 70 + ((i * 29) % 64); ctx.fillStyle = ['#E8731C', '#fff', '#E8E337', '#8bb4ff'][i % 4]; ctx.fillRect(sx, sy, 2, 2); } ctx.restore();
      const piso = ctx.createLinearGradient(0, hz, 0, H); piso.addColorStop(0, '#C9955A'); piso.addColorStop(1, '#A6713B'); ctx.fillStyle = piso; ctx.fillRect(0, hz, W, H - hz);
      ctx.strokeStyle = 'rgba(80,40,10,.25)'; ctx.lineWidth = 1; for (let x = -12; x <= 12; x += 1) { const a = cam.p(x, 0, 1), b = cam.p(x, 0, 60); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      // la línea de tres y la zona pintada (la cámara gira con el puesto: se mueve el dibujo del piso)
      const giro = PUESTOS[S.puesto].ang;
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let a = -1.2; a <= 1.2; a += 0.08) { const q = cam.p(Math.sin(a - giro) * 7.24 * 0.6, 0, ARO.z - Math.cos(a - giro) * 7.24 * 0.35 + 2.6); if (a === -1.2) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); } ctx.stroke();
      ctx.fillStyle = 'rgba(232,115,28,.35)'; { const a = cam.p(-2.45, 0, ARO.z + 0.6), b = cam.p(2.45, 0, ARO.z + 0.6), c = cam.p(2.45, 0, ARO.z - 4.5), d = cam.p(-2.45, 0, ARO.z - 4.5); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
      // el tablero, visto desde el puesto (gira un poco)
      const zT = ARO.z + 0.4, tw = ARO.tablero.ancho / 2 * Math.cos(giro), tz = ARO.tablero.ancho / 2 * Math.sin(giro);
      const T1 = cam.p(-tw, ARO.tablero.abajo, zT + tz), T2 = cam.p(tw, ARO.tablero.abajo, zT - tz), T3 = cam.p(tw, ARO.tablero.abajo + ARO.tablero.alto, zT - tz), T4 = cam.p(-tw, ARO.tablero.abajo + ARO.tablero.alto, zT + tz);
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(T1.x, T1.y); ctx.lineTo(T2.x, T2.y); ctx.lineTo(T3.x, T3.y); ctx.lineTo(T4.x, T4.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      const r1 = cam.p(-0.3, ARO.y, zT), r2 = cam.p(0.3, ARO.y, zT), r3 = cam.p(0.3, ARO.y + 0.45, zT), r4 = cam.p(-0.3, ARO.y + 0.45, zT); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.lineTo(r3.x, r3.y); ctx.lineTo(r4.x, r4.y); ctx.closePath(); ctx.stroke();
      // el poste
      const b1 = cam.p(0, 0, zT + 0.6), b2 = cam.p(0, ARO.tablero.abajo + 0.3, zT + 0.6); ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = Math.max(3, 0.12 * b2.k); ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      ctx.restore();
      const p = S.pelota; const pp = cam.p(p.x, p.y, p.z); const r = Math.max(4, p.r * pp.k);
      const detras = p.z > ARO.z;        // la pelota atrás del aro se dibuja antes que el aro
      const dibujarPelota = () => { const sp = cam.p(p.x, 0, p.z); sombra(ctx, sp, r, 0.3); pelotaBasquet(ctx, pp.x, pp.y, r, p.rot); };
      if (detras) dibujarPelota();
      // el aro y la red
      const ac = cam.p(0, ARO.y, ARO.z); const ar = ARO.r * ac.k; const onda = S.red ? Math.sin(S.red.k * Math.PI) * 6 : 0;
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const x0 = ac.x + Math.cos(a) * ar, y0 = ac.y + Math.sin(a) * ar * 0.35; const x1 = ac.x + Math.cos(a) * ar * 0.55, y1 = ac.y + ar * 1.5 + onda; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(ac.x, ac.y + ar * 0.8 + onda * 0.5, ar * 0.75, ar * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#E8731C'; ctx.lineWidth = Math.max(2, ar * 0.16); ctx.beginPath(); ctx.ellipse(ac.x, ac.y, ar, ar * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (!detras) dibujarPelota();
      if (S.fase === 'guia' || (S.fase === 'listo' && S.tiros === 0)) flechaGuia(ctx, pp.x, pp.y - r - 6, S.t);
      hud(ctx, S.puntos + ' pts', Math.ceil(S.tiempo) + ' s', S.fase === 'guia' ? 'Deslizá hacia arriba para tirar' : S.fase === 'listo' ? PUESTOS[S.puesto].n + (S.racha >= 2 ? ' · racha ' + S.racha : '') : '');
      if (S.mensaje) cartel(ctx, S.mensaje.t, S.mensaje.sub, S.mensaje.color, S.mensaje.k);
      if (S.fase === 'final') { ctx.save(); ctx.fillStyle = 'rgba(11,10,20,.85)'; ctx.fillRect(0, 0, W, H); const f = S.fin; texto(ctx, f.puntos >= 24 ? '¡ON FIRE!' : f.puntos >= 12 ? 'BIEN AHÍ' : 'A PRACTICAR', W / 2, H * 0.3, 40, f.puntos >= 24 ? '#3ED17A' : f.puntos >= 12 ? '#E8E337' : '#FF6B5B', 800); texto(ctx, f.puntos + ' pts', W / 2, H * 0.42, 64, '#fff', 800); texto(ctx, (f.puntos / 3) + ' de ' + f.tiros + ' triples · mejor racha ' + f.racha, W / 2, H * 0.51, 14, 'rgba(255,255,255,.75)', 600); texto(ctx, 'Tocá para jugar otra', W / 2, H * 0.64, 16, '#fff', 700); ctx.restore(); }
      ctx.restore();
    }
    return { avanzar, dibujar, soltar, estado: S, reiniciar };
  }

  /* ═══════════════════════════════ montar / desmontar ═══════════════════════════════ */
  const JUEGOS = { penales: Penales, libre: TiroLibre, triples: Triples };
  const FICHA = {
    penales: { titulo: 'Penales', sub: 'Cinco y cinco contra el arquero del modelo. Deslizá hacia el arco: la velocidad del dedo es la fuerza, el largo es la altura. Cuando patea él, tocá a dónde te tirás.' },
    libre: { titulo: 'Tiro libre', sub: 'Cinco tiros con barrera. Deslizá curvo y la pelota toma comba: por arriba de la barrera o por el costado, lejos del arquero.' },
    triples: { titulo: 'Triples', sub: 'Sesenta segundos, cinco puestos alrededor del arco. Deslizá hacia arriba: el largo del gesto es la fuerza. Tres puntos cada uno, y la racha suma.' },
  };
  function montar(el, juego, opciones) {
    desmontar(); O = opciones || {}; RAIZ = el;
    const f = FICHA[juego] || FICHA.penales;
    el.innerHTML = `<div class="mam-juego"><div class="mam-seccion"><span>${esc(f.titulo)}</span><small>gratis siempre</small></div>
      <p class="mam-nota">${esc(f.sub)}</p>
      <div class="mam-cancha-caja"><canvas class="mam-cancha" aria-label="${esc(f.titulo)}: deslizá para jugar"></canvas></div>
      <div class="mam-fila" style="justify-content:space-between"><button type="button" class="mam-boton secundario chico" data-juego-otra>Otra vez</button><button type="button" class="mam-boton secundario chico" data-juego-compartir>Compartir</button></div></div>`;
    CV = el.querySelector('canvas'); CTX = prepararLienzo(CV);
    G = JUEGOS[juego] ? JUEGOS[juego]() : Penales(); G.nombre = juego;
    gesto = Gesto(CV, (g) => { if (G) G.soltar(g); }, null);
    CV.tabIndex = 0;
    CV.addEventListener('keydown', (ev) => { if (!G) return; if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); G.soltar({ toque: true, x: W / 2, y: H / 2, largo: 0, dx: 0, dy: 0, vel: 0, comba: 0, angulo: 0 }); } });
    el.querySelector('[data-juego-otra]').addEventListener('click', () => { if (G) G.reiniciar(); });
    el.querySelector('[data-juego-compartir]').addEventListener('click', () => { if (!G) return; const S = G.estado; const t = juego === 'penales' ? `Penales en Mano a mano: ${S.serie.reduce((a, b) => a + b, 0)}-${S.serieRival.reduce((a, b) => a + b, 0)} contra el modelo.` : juego === 'libre' ? `Tiros libres en Mano a mano: ${S.serie.reduce((a, b) => a + b, 0)} de 5.` : `Triples en Mano a mano: ${S.puntos} puntos en un minuto.`; if (O.compartir) O.compartir(t + ' ¿Te animás?'); });
    loop();
    return G;
  }
  function desmontar() { parar(); G = null; CV = null; CTX = null; gesto = null; if (RAIZ) { RAIZ.innerHTML = ''; RAIZ = null; } }
  raiz.mamJuegos = { montar, desmontar, FICHA, _estado: () => G, _soltar: (g) => G && G.soltar(g), _W: W, _H: H,
    _crear: (juego, opciones) => { O = opciones || {}; return (JUEGOS[juego] || Penales)(); } };
})(typeof window !== 'undefined' ? window : globalThis);
