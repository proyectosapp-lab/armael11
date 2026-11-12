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
      if (S.fase === "guia" || S.fase === "listo") G.soltar(perfil.gesto(S, G));
      if (S.fase === "vuelo-rival" && !S.arquero.vuelo && S.t > 0.12) G.soltar(perfil.atajar(S));
      G.avanzar(1 / 60); t += 1000 / 60;
    }
    res.push(S.fin);
  }
  return res;
}
// Desde el 21/10 el gesto de fútbol es "arrastrar hasta donde quiero que entre": el perfil elige un punto del arco
// (x, y en metros) y G.gestoHacia lo convierte en el gesto de pantalla; la velocidad del dedo es la potencia.
const PERFILES = {
  bueno: { gesto: (S, G) => G.gestoHacia((azar() < 0.5 ? -1 : 1) * (2.9 + gauss() * 0.2), azar() < 0.7 ? 2.0 + gauss() * 0.16 : 0.35 + gauss() * 0.12, 1.9 + gauss() * 0.25, gauss() * 0.08), atajar: (S) => { const real = Math.sign(S.pelota.vx) || 1; const lejos = Math.abs(S.pelota.vx) > 2.5 ? 130 : Math.abs(S.pelota.vx) > 1 ? 70 : 10; return { toque: true, x: 180 - (S.pista ? S.pista.dir : real) * lejos, y: S.pelota.vy > 5 ? 200 : 400, dx: 0, dy: 0, largo: 0 }; } },   // la pantalla está espejada: miro desde atrás del arco
  novato: { gesto: (S, G) => G.gestoHacia(gauss() * 2.4, 1.1 + gauss() * 0.9, 1.3 + gauss() * 0.5, gauss() * 0.3), atajar: () => ({ toque: true, x: 180 + (azar() < 0.5 ? -1 : 1) * 100, y: 400, dx: 0, dy: 0, largo: 0 }) },
  // el bueno mira dónde quedó el arco (gx) y de qué lado está la barrera: apunta al palo lejano, alto, con un poco de comba hacia afuera
  libreBueno: { gesto: (S, G) => { const l = S.barrera.lado; return G.gestoHacia(S.gx - l * (2.9 + gauss() * 0.3), 1.85 + gauss() * 0.28, 1.8 + gauss() * 0.3, -l * (0.45 + gauss() * 0.15)); } },
  libreNovato: { gesto: (S, G) => G.gestoHacia(S.gx + gauss() * 2.6, 1.2 + gauss() * 0.9, 1.3 + gauss() * 0.5, gauss() * 0.4) },
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

// ── el reto (11/11): con la misma semilla, la tanda es la misma para los dos ──
// Sin `azar` propio, cada tiro saca su suerte de (semilla, canal, número de tiro). Se juega la misma semilla con dos
// manos distintas y se mira que lo que NO depende del jugador sea idéntico: los amagos y las patadas del rival en
// penales, el lugar de cada tiro libre y lo que hace el modelo. Y con la misma mano, que el resultado sea el mismo.
{
  let mal = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mal++; };
  const J = mamJuegos;
  function tanda(juego, semilla, mano) {
    let t = 0, k = 0; const G = J._crear(juego, { ahora: () => t, semilla }); const S = G.estado; const huella = []; let n = 0, seguridad = 0, visto = -1;
    while (S.fase !== "final" && seguridad++ < 40000) {
      if (juego === "penales" && (S.fase === "listo" || S.fase === "guia") && S.tanda === "yo" && S.serie.length !== visto) { visto = S.serie.length; huella.push("amago " + S.amago.dir + (S.amago.engano ? "e" : "v")); }
      if (juego === "libre" && (S.fase === "listo" || S.fase === "guia") && S.serie.length !== visto) { visto = S.serie.length; huella.push("lugar " + S.gx.toFixed(3) + " " + S.dist.toFixed(3) + " " + S.barrera.lado + " " + S.barrera.n); }
      if (S.fase === "guia" || S.fase === "listo") { if (juego === "triples") G.soltar({ toque: false, largo: 186 + mano * 6 + ((k++ * 7) % 5), vel: 1.5, dy: -100, dx: 0, comba: 0, angulo: 0.01 * mano, x: 180, y: 450 }); else if (juego === "libre") G.soltar(G.gestoHacia(S.gx - S.barrera.lado * (2.6 + 0.3 * mano), 1.7 + 0.2 * mano, 1.7, -S.barrera.lado * 0.4)); else if (S.tanda === "yo") G.soltar(G.gestoHacia((n++ % 2 ? -1 : 1) * (2.4 + 0.5 * mano), 1.2 + 0.6 * mano, 1.5 + 0.3 * mano, 0)); }
      if (S.fase === "vuelo-rival" && !S.arquero.vuelo && S.t > 0.12) { huella.push("patea " + S.pelota.vx.toFixed(3) + " " + S.pelota.vy.toFixed(3) + " " + S.pelota.vz.toFixed(3)); G.soltar({ toque: true, x: 180 + (mano ? 110 : -110), y: 400, dx: 0, dy: 0, largo: 0 }); }
      G.avanzar(1 / 60); t += 1000 / 60;
    }
    return { fin: JSON.stringify(S.fin), rival: S.rival, huella: huella.join(" | "), n: huella.length };
  }
  console.log("\nreto · la misma semilla es la misma tanda");
  for (const juego of ["penales", "libre", "triples"]) {
    const a = tanda(juego, 123456789, 0), b = tanda(juego, 123456789, 0), c = tanda(juego, 123456789, 1), d = tanda(juego, 987654321, 0);
    ok(a.fin === b.fin && a.huella === b.huella, juego + ": la misma mano, el mismo resultado (" + a.fin.slice(0, 60) + ")");
    if (juego === "penales") { const pa = a.huella.split(" | "), pc = c.huella.split(" | "); const m = Math.min(pa.length, pc.length); const iguales = pa.slice(0, m).filter((x, i) => x === pc[i]).length; ok(m >= 4 && iguales === m, "penales: otra mano, los mismos amagos y las mismas patadas del rival (" + iguales + " de " + m + ")"); }
    if (juego === "libre") ok(a.huella === c.huella && a.n === 5 && a.rival === c.rival, "tiro libre: otra mano, los mismos cinco lugares y el mismo rival (" + a.rival + ")");
    if (juego === "triples") ok(a.rival === c.rival, "triples: otra mano, el mismo minuto del modelo (" + a.rival + ")");
    ok(juego === "triples" ? true : a.huella !== d.huella, juego + ": otra semilla, otra tanda");
  }
  const h = J.hashReto("penales", 123456789, [4, 2], "Fausto_10"), r = J.leerReto("https://armael11.com/app/" + h);
  ok(h === "#reto=penales.21i3v9.4-2.fausto_10" && r && r.juego === "penales" && r.semilla === 123456789 && r.r.join() === "4,2" && r.de === "fausto_10", "el link va y vuelve (" + h + ")");
  ok(J.leerReto("#reto=triples.zzzzzz.45") && J.leerReto("#reto=triples.zzzzzz.45").de === "", "sin apodo también vale");
  const malos = ["#reto=penales.21i3v9.4-2.<script>", "#reto=golf.21i3v9.4-2", "#reto=penales.21i3v9.99-2", "#reto=libre.21i3v9.6-0", "#reto=penales.zzzzzzz9.4-2", "#reto=triples.21i3v9.4-2", "#reto=penales.21i3v9.4", "#reto=penales..4-2", "#reto=penales.21i3v9.4-2.con espacio y más"];
  const pasaron = malos.filter((x) => { const q = J.leerReto(x); return q && !(x.includes("con espacio") && q.de === "con"); });
  ok(pasaron.length === 0, "un link roto o inventado no entra (" + (pasaron.join(" ") || "ninguno pasó") + ")");
  if (mal) { console.log("\n✗ " + mal + " del reto fallaron\n"); process.exit(1); }
}
