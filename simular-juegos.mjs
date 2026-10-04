// simular-juegos.mjs — jugadores simulados contra los juegos, sin pantalla: ¿están bien calibrados?
import { readFileSync } from "node:fs";
const g = globalThis; g.window = g; new Function(readFileSync(new URL("./mam/juegos.js", import.meta.url), "utf8"))();
let semilla = 7; const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const gauss = () => (azar() + azar() + azar() - 1.5) * 2;
function jugar(juego, perfil, partidas) {
  const res = [];
  for (let n = 0; n < partidas; n++) {
    let t = 0; const G = mamJuegos._crear(juego, { ahora: () => t, azar });
    const S = G.estado; let seguridad = 0;
    while (S.fase !== "final" && seguridad++ < 20000) {
      if (S.fase === "guia" || S.fase === "listo") G.soltar(perfil.gesto(S));
      if (S.fase === "vuelo-rival" && !S.arquero.vuelo && S.t > 0.12) G.soltar(perfil.atajar(S));
      G.avanzar(1 / 60); t += 1000 / 60;
    }
    res.push(S.fin);
  }
  return res;
}
const PERFILES = {
  bueno: { gesto: () => ({ toque: false, largo: 110 + gauss() * 18, vel: 1.7 + gauss() * 0.3, dy: -100, dx: 0, comba: gauss() * 0.15, angulo: (azar() < 0.5 ? -1 : 1) * (0.4 + gauss() * 0.08), x: 180, y: 420 }), atajar: (S) => { const real = Math.sign(S.pelota.vx) || 1; const lejos = Math.abs(S.pelota.vx) > 2.5 ? 130 : Math.abs(S.pelota.vx) > 1 ? 70 : 10; return { toque: true, x: 180 - (S.pista ? S.pista.dir : real) * lejos, y: S.pelota.vy > 5 ? 200 : 400, dx: 0, dy: 0, largo: 0 }; } },   // la pantalla está espejada: miro desde atrás del arco
  novato: { gesto: () => ({ toque: false, largo: 90 + gauss() * 45, vel: 1.2 + gauss() * 0.5, dy: -100, dx: 0, comba: gauss() * 0.3, angulo: gauss() * 0.5, x: 180, y: 420 }), atajar: () => ({ toque: true, x: 180 + (azar() < 0.5 ? -1 : 1) * 100, y: 400, dx: 0, dy: 0, largo: 0 }) },
  // el bueno mira dónde quedó el arco (gx) y de qué lado está la barrera: apunta al palo lejano y le pone comba hacia afuera
  libreBueno: { gesto: (S) => { const l = S.barrera.lado, gx = S.gx; const comba = -l * (0.5 + gauss() * 0.15); const tv = 0.98 * (S.dist / 20.8); const objetivo = gx - l * (2.9 + gauss() * 0.3); const ang = (objetivo - 0.5 * comba * 6 * tv * tv * 1.3) / (6.4 * 1.17); return { toque: false, largo: 115 + gauss() * 12, vel: 1.8 + gauss() * 0.3, dy: -100, dx: 0, comba, angulo: ang + gauss() * 0.04, x: 180, y: 420 }; } },
  libreNovato: { gesto: (S) => ({ toque: false, largo: 110 + gauss() * 40, vel: 1.3 + gauss() * 0.5, dy: -100, dx: 0, comba: gauss() * 0.4, angulo: S.gx / 6.4 + gauss() * 0.4, x: 180, y: 420 }) },
  triplesBueno: { gesto: () => ({ toque: false, largo: 190 + gauss() * 14, vel: 1.5, dy: -100, dx: 0, comba: 0, angulo: gauss() * 0.04, x: 180, y: 450 }) },
  triplesNovato: { gesto: () => ({ toque: false, largo: 190 + gauss() * 40, vel: 1.5, dy: -100, dx: 0, comba: 0, angulo: gauss() * 0.12, x: 180, y: 450 }) },
};
const media = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
for (const [nombre, perfil] of [["bueno", PERFILES.bueno], ["novato", PERFILES.novato]]) {
  const r = jugar("penales", perfil, 300);
  console.log(`penales · ${nombre}: goles míos ${media(r.map((x) => x.yo))} / 5 · goles de él ${media(r.map((x) => x.el))} / 5 · gano ${(100 * r.filter((x) => x.yo > x.el).length / r.length).toFixed(0)}% · empato ${(100 * r.filter((x) => x.yo === x.el).length / r.length).toFixed(0)}%`);
}
for (const [nombre, perfil] of [["bueno", PERFILES.libreBueno], ["novato", PERFILES.libreNovato]]) { const r = jugar("libre", perfil, 300); console.log(`tiro libre · ${nombre}: ${media(r.map((x) => x.goles))} de 5`); }
for (const [nombre, perfil] of [["bueno", PERFILES.triplesBueno], ["novato", PERFILES.triplesNovato]]) { const r = jugar("triples", perfil, 60); console.log(`triples · ${nombre}: ${media(r.map((x) => x.puntos))} pts en 60 s · ${media(r.map((x) => x.tiros))} tiros · racha ${media(r.map((x) => x.racha))}`); }
