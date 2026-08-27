/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL FANTASY
     node probar-fantasy.mjs
   No toca la red. Cada caso es una regla del reglamento puesta a prueba con
   una situación concreta, del tipo que va a pasar cualquier domingo.

   Esto es lo que hace que el reglamento sea discutible: si mañana cambiamos
   cuánto vale el gol de un defensor, acá se ve exactamente qué se movió.
   ══════════════════════════════════════════════════════════════════════════ */
import { puntosDeActuacion, masValiosos, aplicarSuplencias, puntosDeFecha,
         precioDe, ponerPrecios, revisarEquipo, actuacionDe,
         REGLAS, FORMATO, FORMACIONES, cupoDe } from "./fantasy.mjs";

const casos = [];
const caso = (nom, ok, det = "") => casos.push([nom, ok, det]);
const igual = (nom, a, b) => caso(nom, a === b, "dio " + a + ", esperaba " + b);

/* Una actuación con todo en cero, para ir encendiendo de a una cosa. */
const act = (x = {}) => ({ jugador: 1, nombre: "N", puesto: "M", minutos: 90, nota: 6.5,
  goles: 0, asistencias: 0, atajadas: 0, recibidos: 2, clavesPases: 0,
  quites: 0, intercepciones: 0, golEnContra: 0, penalAtajado: 0, penalErrado: 0,
  amarillas: 0, rojas: 0, ...x });

const pts = x => puntosDeActuacion(act(x)).puntos;

/* ── 1. PRESENCIA ───────────────────────────────────────────────────────── */
igual("el que no jugó no suma nada", pts({ minutos: 0 }), 0);
igual("entrar a la cancha vale 1", pts({ minutos: 20 }), 1);
igual("jugar 60 o más vale 2", pts({ minutos: 60 }), 2);
caso("y los escalones NO se suman: 60 minutos son 2, no 3",
     pts({ minutos: 90 }) === 2, "dio " + pts({ minutos: 90 }));

/* ── 2. EL GOL VALE SEGÚN EL PUESTO ─────────────────────────────────────── */
igual("gol de arquero",    pts({ puesto: "G", goles: 1, recibidos: 2 }) - pts({ puesto: "G", recibidos: 2 }), 10);
igual("gol de defensor",   pts({ puesto: "D", goles: 1 }) - pts({ puesto: "D" }), 6);
igual("gol de medio",      pts({ goles: 1 }) - pts({}), 5);
igual("gol de delantero",  pts({ puesto: "F", goles: 1 }) - pts({ puesto: "F" }), 4);
caso("un gol de defensor vale más que uno de delantero, porque es más raro",
     REGLAS.gol.D > REGLAS.gol.F);
igual("dos goles valen el doble", pts({ goles: 2 }) - pts({}), 10);

/* ── 3. GENERAR SIN QUE QUEDE EL GOL ────────────────────────────────────── */
igual("la asistencia vale igual en todos los puestos",
      pts({ asistencias: 1 }) - pts({}), REGLAS.asistencia);
igual("un pase clave suelto no suma", pts({ clavesPases: 1 }) - pts({}), 0);
igual("dos pases clave valen 1",      pts({ clavesPases: 2 }) - pts({}), 1);
igual("tres siguen valiendo 1",       pts({ clavesPases: 3 }) - pts({}), 1);

/* ── 4. DEFENSA ─────────────────────────────────────────────────────────── */
igual("valla invicta del arquero", pts({ puesto: "G", recibidos: 0 }) - 2, 5);
igual("valla invicta del defensor", pts({ puesto: "D", recibidos: 0 }) - 2, 4);
igual("al delantero la valla invicta no le da nada",
      pts({ puesto: "F", recibidos: 0 }) - 2, 0);
caso("el que entró a los 80 NO cobra valla invicta: pide 60 minutos",
     pts({ puesto: "D", recibidos: 0, minutos: 20 }) === 1,
     "dio " + pts({ puesto: "D", recibidos: 0, minutos: 20 }));
igual("dos goles recibidos le cuestan 1 al defensor",
      pts({ puesto: "D", recibidos: 2 }) - pts({ puesto: "D", recibidos: 0 }) + 4, -1);
igual("al medio los goles recibidos no le pesan",
      pts({ recibidos: 4 }) - pts({ recibidos: 1 }), 0);
igual("cada 3 atajadas, 1 punto", pts({ puesto: "G", atajadas: 6 }) - pts({ puesto: "G" }), 2);
caso("las atajadas son solo del arquero",
     pts({ puesto: "D", atajadas: 6 }) === pts({ puesto: "D" }));
igual("cada 4 quites e intercepciones, 1 punto",
      pts({ quites: 5, intercepciones: 3 }) - pts({}), 2);

/* ── 5. LOS MOMENTOS ────────────────────────────────────────────────────── */
igual("penal atajado",  pts({ puesto: "G", penalAtajado: 1 }) - pts({ puesto: "G" }), 5);
igual("penal errado",   pts({ penalErrado: 1 }) - pts({}), -2);
igual("gol en contra",  pts({ golEnContra: 1 }) - pts({}), -2);
igual("amarilla",       pts({ amarillas: 1 }) - pts({}), -1);
igual("roja",           pts({ rojas: 1 }) - pts({}), -3);
caso("el expulsado se queda con lo que sumó hasta ahí, no queda en cero",
     pts({ goles: 1, rojas: 1 }) > 0, "dio " + pts({ goles: 1, rojas: 1 }));

/* ── 6. EL DETALLE SE PUEDE LEER ────────────────────────────────────────── */
{
  const d = puntosDeActuacion(act({ puesto: "D", goles: 1, recibidos: 0, amarillas: 1 }));
  caso("la cuenta viene abierta, renglón por renglón", d.renglones.length >= 4,
       d.renglones.map(r => r.que).join(" | "));
  caso("y los renglones suman exactamente el total",
       d.renglones.reduce((s, r) => s + r.pts, 0) === d.puntos);
}

/* ── 7. EL MÁS VALIOSO DEL PARTIDO ──────────────────────────────────────── */
{
  const lote = [act({ jugador: 1, nota: 8.1 }), act({ jugador: 2, nota: 7.4 }),
                act({ jugador: 3, nota: 9.0, minutos: 20 })];
  const m = masValiosos(lote);
  caso("es el de puntaje más alto CON 60 minutos, no el que entró y brilló",
       m.length === 1 && m[0] === 1, m.join(","));

  caso("si el proveedor no publicó puntajes, ese partido no tiene más valioso",
       masValiosos([act({ nota: null }), act({ jugador: 2, nota: null })]).length === 0);

  const empate = masValiosos([act({ jugador: 1, nota: 8 }), act({ jugador: 2, nota: 8 })]);
  caso("si empatan, cobran los dos", empate.length === 2);
}

/* ── 8. LAS SUPLENCIAS ──────────────────────────────────────────────────── */
/* Cada uno de un club distinto: el equipo de prueba tiene que ser LEGAL,
   si no, cada caso arrastra el error del máximo por club y no se ve lo que
   se estaba probando. (Me pasó: los quince eran del mismo club.) */
const j = (id, puesto, club) => ({ id, puesto, club: club || ("Club" + id), nombre: "J" + id });
const equipoBase = {
  titulares: [j(1,"G"), j(2,"D"), j(3,"D"), j(4,"D"), j(5,"D"),
              j(6,"M"), j(7,"M"), j(8,"M"), j(9,"F"), j(10,"F"), j(11,"F")],
  suplentes: { G: j(21,"G"), D: j(22,"D"), M: j(23,"M"), F: j(24,"F") },
  capitan: 9, vice: 6, formacion: "4-3-3",
};
{
  /* El 3 (defensor) no jugó: entra el suplente de defensa. */
  const min = id => (id === 3 ? 0 : 90);
  const r = aplicarSuplencias(equipoBase, min);
  caso("si un titular no jugó, entra el suplente de su puesto",
       r.entraron.length === 1 && r.entraron[0].entra.id === 22);
  caso("y el que no jugó sale de la cancha",
       !r.enCancha.some(x => x.id === 3));

  /* Dos defensores afuera: hay UN suplente por puesto, no una lista. */
  const min2 = id => ([3, 4].includes(id) ? 0 : 90);
  const r2 = aplicarSuplencias(equipoBase, min2);
  caso("si faltan dos del mismo puesto, entra uno solo",
       r2.entraron.length === 1 && r2.afuera.length === 1, "afuera: " + r2.afuera.length);

  /* El suplente tampoco jugó: no se reemplaza al reemplazo. */
  const min3 = id => ([3, 22].includes(id) ? 0 : 90);
  const r3 = aplicarSuplencias(equipoBase, min3);
  caso("si el suplente tampoco jugó, el puesto queda en cero",
       r3.entraron.length === 0 && r3.afuera.length === 1);

  /* La suplencia es por MINUTOS, no por rendimiento. */
  const r4 = aplicarSuplencias(equipoBase, () => 90);
  caso("con todos en cancha no entra nadie", r4.entraron.length === 0);
}

/* ── 9. LA CINTA ────────────────────────────────────────────────────────── */
{
  const r = aplicarSuplencias(equipoBase, id => (id === 9 ? 0 : 90));
  caso("si el capitán no jugó, la cinta pasa al vice",
       r.capitan === 6 && r.cintaPasada, "capitán: " + r.capitan);

  const r2 = aplicarSuplencias(equipoBase, id => ([9, 6].includes(id) ? 0 : 90));
  caso("si el vice tampoco jugó, no se le regala la cinta a nadie más",
       r2.capitan === 9 && !r2.cintaPasada, "capitán: " + r2.capitan);
}

/* ── 10. LA FECHA COMPLETA ──────────────────────────────────────────────── */
{
  const A = new Map();
  for (const t of [...equipoBase.titulares, ...Object.values(equipoBase.suplentes)])
    A.set(t.id, act({ jugador: t.id, puesto: t.puesto, minutos: 90, recibidos: 1 }));

  /* El 9 es capitán y mete un gol. */
  A.set(9, act({ jugador: 9, puesto: "F", goles: 1, recibidos: 1 }));
  const base = puntosDeActuacion(A.get(9)).puntos;          // 2 + 4 = 6

  const sinBono = puntosDeFecha(equipoBase, A);
  const cap = sinBono.jugadores.find(x => x.id === 9);
  igual("el capitán duplica lo que hizo", cap.puntosFinales, base * 2);

  const conBono = puntosDeFecha(equipoBase, A, new Set([9]));
  const cap2 = conBono.jugadores.find(x => x.id === 9);
  igual("capitán y más valioso se apilan: ×3", cap2.puntosFinales, base * 3);

  const soloMVP = puntosDeFecha({ ...equipoBase, capitan: 10 }, A, new Set([9]));
  igual("el más valioso solo suma 50% más",
        soloMVP.jugadores.find(x => x.id === 9).puntosFinales, base * 1.5);

  caso("el total de la fecha es la suma de los once",
       conBono.puntos === conBono.jugadores.reduce((s, x) => s + x.puntosFinales, 0));
  caso("y son once, ni diez ni doce", conBono.jugadores.length === 11);

  /* Un bono que no se puede explicar se siente arreglado aunque sea correcto. */
  caso("cada jugador viene con su nota a la vista",
       conBono.jugadores.every(x => x.nota !== undefined));
}

/* ── 11. LOS PRECIOS ────────────────────────────────────────────────────── */
{
  igual("el mejor de la liga vale el techo", precioDe(10, 10), FORMATO.precio.techo);
  igual("el que no suma nada vale el piso",  precioDe(0, 10),  FORMATO.precio.piso);
  igual("y la mitad, la mitad de la escala", precioDe(5, 10), 7);
  caso("nadie puede valer más que el techo", precioDe(99, 10) === FORMATO.precio.techo);
  caso("ni menos que el piso",               precioDe(-5, 10) === FORMATO.precio.piso);
  caso("sin historia, todos al piso: no se inventa un precio",
       precioDe(3, 0) === FORMATO.precio.piso);

  const lista = ponerPrecios([
    { id: 1, puntosTotales: 100, partidos: 10 },   // 10 por partido: el mejor
    { id: 2, puntosTotales: 50,  partidos: 10 },   // 5
    { id: 3, puntosTotales: 0,   partidos: 0 },    // nunca jugó
  ]);
  igual("el mejor de la lista queda en el techo", lista[0].precio, 10);
  igual("el del medio, en el medio",              lista[1].precio, 7);
  igual("el que no jugó, en el piso",             lista[2].precio, 4);
  caso("los precios van de a medio punto, para que se puedan leer",
       lista.every(x => (x.precio * 2) % 1 === 0));
}

/* ── 12. QUE EL EQUIPO SEA LEGAL ────────────────────────────────────────── */
{
  const precios = new Map();
  for (let i = 1; i <= 30; i++) precios.set(i, 5);   // 15 × 5 = 75, justo
  const ok = revisarEquipo(equipoBase, precios);
  caso("un equipo bien armado pasa", ok.ok, ok.problemas.join(" | "));
  igual("y dice cuánto gastó", ok.gasto, 75);

  const caro = new Map(precios); caro.set(1, 6);
  caso("pasarse del presupuesto se avisa",
       /presupuesto/i.test(revisarEquipo(equipoBase, caro).problemas.join(" ")));

  const cuatroDelMismo = { ...equipoBase,
    titulares: equipoBase.titulares.map((x, i) => i < 4 ? { ...x, club: "Boca" } : x) };
  /* (los demás siguen siendo de clubes distintos) */
  caso("cuatro del mismo club, no",
       /Máximo 3/.test(revisarEquipo(cuatroDelMismo, precios).problemas.join(" ")));

  /* Cinco defensores es legal en 5-3-2 e ilegal en 4-3-3. La formación es
     la que decide, no una regla suelta. */
  const cinco = { ...equipoBase, titulares: [
    j(1,"G"), j(2,"D"), j(3,"D"), j(4,"D"), j(5,"D"), j(12,"D"),
    j(6,"M"), j(7,"M"), j(8,"M"), j(9,"F"), j(10,"F")] };
  caso("cinco defensores en 4-3-3 no va",
       /Defensores/.test(revisarEquipo({ ...cinco, formacion: "4-3-3" }, precios).problemas.join(" ")));
  caso("pero los mismos cinco en 5-3-2 sí",
       revisarEquipo({ ...cinco, formacion: "5-3-2", capitan: 9, vice: 6 }, precios).ok,
       revisarEquipo({ ...cinco, formacion: "5-3-2" }, precios).problemas.join(" | "));

  caso("las siete formaciones suman diez de campo más el arquero",
       Object.keys(FORMACIONES).every(f => {
         const c = cupoDe(f); return c.G + c.D + c.M + c.F === 11; }),
       Object.keys(FORMACIONES).join(", "));
  caso("una formación inventada cae en la de por defecto",
       cupoDe("9-1-1").D === 4);

  const sinArquero = { ...equipoBase, suplentes: { D: j(22,"D"), M: j(23,"M"), F: j(24,"F") } };
  caso("faltando el suplente del arco, se avisa",
       /arquero/i.test(revisarEquipo(sinArquero, precios).problemas.join(" ")));

  const repetido = { ...equipoBase, titulares: [...equipoBase.titulares.slice(0, 10), j(2,"F")] };
  caso("un jugador repetido se detecta",
       /repetido/.test(revisarEquipo(repetido, precios).problemas.join(" ")));

  const capEnBanco = { ...equipoBase, capitan: 21 };
  caso("el capitán no puede salir del banco",
       /titular/.test(revisarEquipo(capEnBanco, precios).problemas.join(" ")));

  const viceIgual = { ...equipoBase, vice: 9 };
  caso("el vice no puede ser el capitán",
       /no puede ser el mismo/.test(revisarEquipo(viceIgual, precios).problemas.join(" ")));
}

/* ── 13. LO QUE MANDA LA API ────────────────────────────────────────────── */
{
  /* Todo viene como string, y ese es justo el tipo de detalle que hace que
     una suma dé "23" en vez de 5. */
  const bruto = { player: { id: 77, name: "Girotti" }, statistics: [{
    games: { minutes: "90", position: "F", rating: "7.8" },
    goals: { total: "1", assists: null, saves: null },
    passes: { key: "3" }, tackles: { total: "2", interceptions: "2" },
    cards: { yellow: "1", red: null }, penalty: { saved: null, missed: null },
  }]};
  const a = actuacionDe(bruto, 1);
  igual("los minutos entran como número", a.minutos, 90);
  igual("los goles también", a.goles, 1);
  igual("lo que viene nulo queda en cero", a.asistencias, 0);
  igual("la nota es un decimal", a.nota, 7.8);
  igual("el puesto queda en una letra", a.puesto, "F");
  /* 2 (60') + 4 (gol) + 1 (3 claves) + 1 (4 quites) - 1 (amarilla) = 7 */
  igual("y la cuenta da lo que tiene que dar", puntosDeActuacion(a).puntos, 7);
}

/* ─── resultado ──────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n +
  (ok || !d ? "" : "   → " + d)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
