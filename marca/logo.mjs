// logo.mjs — la marca de Mano a mano en todos los tamaños, desde un solo dibujo.
// La M de dos trazos (dos lados que se encuentran) y la pelota donde se cruzan. Blanco, verde pelota y naranja
// sobre tinta. Genera: el svg del sitio, los íconos de la app (Apple sin alfa, Play, Capacitor con foreground y
// background), el splash, la versión transparente para el kit de redes, el OG y el gráfico de Play.
//   node marca/logo.mjs
import sharp from 'sharp'; import { writeFileSync, mkdirSync } from 'node:fs'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
const AQUI = dirname(fileURLToPath(import.meta.url)); const RAIZ = join(AQUI, '..');
const TINTA = '#14110F', PAPEL = '#F6F1EA', PELOTA = '#DFF140', NARANJA = '#E8731C';
// la marca, en un cuadrado de 100: `escala` achica el dibujo dentro del cuadro (para el foreground adaptable de Android)
const marca = (escala = 1, conPelotaBorde = true) => { const s = escala, o = 50 - 50 * s; const T = (v) => (o + v * s).toFixed(2);
  return `<g><path d="M${T(17)} ${T(78)} L${T(17)} ${T(26)} L${T(50)} ${T(58)}" fill="none" stroke="#fff" stroke-width="${(13 * s).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M${T(83)} ${T(78)} L${T(83)} ${T(26)} L${T(50)} ${T(58)}" fill="none" stroke="${PELOTA}" stroke-width="${(13 * s).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${T(50)}" cy="${T(60)}" r="${(11 * s).toFixed(2)}" fill="${NARANJA}"/>${conPelotaBorde ? `<circle cx="${T(50)}" cy="${T(60)}" r="${(11 * s).toFixed(2)}" fill="none" stroke="${TINTA}" stroke-width="${(2.5 * s).toFixed(2)}"/>` : ''}</g>`; };
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
const loseta = (rx = 22) => svg(100, 100, `<rect width="100" height="100" rx="${rx}" fill="${TINTA}"/>${marca()}`);
const sinFondo = () => svg(100, 100, marca());
const png = async (s, tam, salida, opc = {}) => { let im = sharp(Buffer.from(s), { density: 300 }).resize(tam.w || tam, tam.h || tam); if (opc.sinAlfa) im = im.flatten({ background: TINTA }).removeAlpha(); await im.png().toFile(salida); };
const out = (p) => join(RAIZ, p);
mkdirSync(out('assets'), { recursive: true }); mkdirSync(out('mam'), { recursive: true });

// 1. el svg del sitio (favicon) y los íconos de la app web
writeFileSync(out('mam/icono.svg'), loseta());
await png(loseta(), 192, out('mam/icono-192.png')); await png(loseta(), 180, out('mam/icono-180.png'));
await png(loseta(), 192, out('marca/icono-192.png')); await png(loseta(), 180, out('marca/icono-180.png'));
// 2. las tiendas: Apple 1024 sin alfa (Apple le redondea las esquinas: va cuadrado lleno), Play 512 con esquinas
await png(svg(100, 100, `<rect width="100" height="100" fill="${TINTA}"/>${marca()}`), 1024, out('marca/apple-icono-1024.png'), { sinAlfa: true });
await png(loseta(), 512, out('marca/play-icono-512.png'));
// 3. Capacitor assets: icon-only (cuadrado lleno), foreground (la marca al 60% sobre transparente: la zona segura del
//    ícono adaptable es el 66% del centro), background (tinta), splash claro y oscuro (la marca chica en el centro)
await png(svg(100, 100, `<rect width="100" height="100" fill="${TINTA}"/>${marca()}`), 1024, out('assets/icon-only.png'), { sinAlfa: true });
await png(svg(100, 100, marca(0.62)), 1024, out('assets/icon-foreground.png'));
await png(svg(100, 100, `<rect width="100" height="100" fill="${TINTA}"/>`), 1024, out('assets/icon-background.png'), { sinAlfa: true });
const splash = svg(2732, 2732, `<rect width="2732" height="2732" fill="${TINTA}"/><g transform="translate(1066 1066) scale(6)">${marca()}</g>`);
await png(splash, 2732, out('assets/splash.png'), { sinAlfa: true }); await png(splash, 2732, out('assets/splash-dark.png'), { sinAlfa: true }); await png(splash, 2732, out('marca/splash-2732.png'), { sinAlfa: true });
// 4. la versión transparente (para el kit de redes, sobre fondos oscuros) y la loseta en 1024
await png(sinFondo(), 1024, out('marca/icono-transparente-1024.png'));
await png(loseta(), 1024, out('marca/loseta-1024.png'));
// 5. el OG (1200×630) y el gráfico de funciones de Play (1024×500): loseta + nombre
const wordmark = (x, y, tam, color) => `<text x="${x}" y="${y}" font-family="Poppins" font-weight="800" font-size="${tam}" fill="${color}">Mano a mano</text>`;
const og = svg(1200, 630, `<rect width="1200" height="630" fill="${TINTA}"/><g transform="translate(120 165) scale(3)">${marca()}</g><g transform="translate(120 165) scale(3)"><rect width="100" height="100" rx="22" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/></g>${wordmark(470, 310, 92, '#fff')}<text x="474" y="380" font-family="Poppins" font-weight="600" font-size="36" fill="${PELOTA}">Desafiá a tus amigos: fútbol, tenis y NBA</text><text x="474" y="432" font-family="Poppins" font-weight="500" font-size="28" fill="rgba(255,255,255,.6)">Contra el modelo. Gratis.</text>`);
await png(og, { w: 1200, h: 630 }, out('mano-a-mano-og.png'), { sinAlfa: true });
await png(loseta(), 192, out('mano-a-mano-192.png'));
const feature = svg(1024, 500, `<rect width="1024" height="500" fill="${TINTA}"/><g transform="translate(90 110) scale(2.8)"><rect width="100" height="100" rx="22" fill="#1F1A17"/>${marca()}</g>${wordmark(420, 250, 84, '#fff')}<text x="424" y="312" font-family="Poppins" font-weight="600" font-size="33" fill="${PELOTA}">Desafiá a tus amigos: fútbol, tenis y NBA</text><text x="424" y="360" font-family="Poppins" font-weight="500" font-size="26" fill="rgba(255,255,255,.6)">Jugá contra el modelo. Gratis, sin cuenta.</text>`);
await png(feature, { w: 1024, h: 500 }, out('marca/play-feature-1024x500.png'), { sinAlfa: true });
// la tira para mirar
const tira = svg(1000, 220, `<rect width="1000" height="220" fill="${PAPEL}"/><g transform="translate(20 20) scale(1.8)">${loseta().replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(230 20) scale(1.8)"><rect width="100" height="100" fill="${TINTA}"/>${marca()}</g><g transform="translate(440 60) scale(1)">${loseta().replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(560 100) scale(0.48)">${loseta().replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(620 120) scale(0.32)">${loseta().replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(660 125) scale(0.2)">${loseta().replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(700 20) scale(0.6)"><rect width="300" height="300" fill="${TINTA}"/><g transform="translate(100 100)">${marca(0.62).replace(/<\/?svg[^>]*>/g, '')}</g><circle cx="150" cy="150" r="100" fill="none" stroke="rgba(255,255,255,.3)" stroke-dasharray="4 4"/></g>`);
await png(tira, { w: 1000, h: 220 }, out('marca/tira-logo.png'));
console.log('listo: svg, íconos, apple, play, assets de Capacitor, splash, transparente, og, feature');
