/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL ONCE AUTOMÁTICO
     node probar-once.mjs
   No toca la red.

   Nace de una queja concreta mirando el sitio publicado: "el 11 que trae está
   todo desajustado, casi todos los jugadores fuera de su puesto". Tenía razón,
   y la causa no era el modelo sino esta función.
   ══════════════════════════════════════════════════════════════════════════ */
import { autoXI, slotsDe, fuerza, penalPuesto,
         usarLiga, ligaActual, LIGA_POR_DEFECTO, constantesDeLiga, MINIMO_PARTIDOS,
         simDesde, aplicarIndicaciones, lineas, INDICACIONES,
         INDICACIONES_POR_DEFECTO, PLANTEOS, planteoDe, planteo,
         planteoSugerido, tacticas, KNOBS,
         formaDe, formacionDeSalida, formacionHabitual, FORMS,
         azarDe, semillaDe, simular } from "./juego.js";

const casos = [];
const caso = (n, ok, extra = "") => casos.push([n, ok, extra]);

/* ── EL AZAR CON SEMILLA ─────────────────────────────────────────────────
   Mismos ajustes → misma semilla → mismos porcentajes. Y sin semilla, todo
   sigue como antes: el backtest y las pruebas viejas no cambian.         */
{
  const a = simular(1.3, 1.1, 6000, azarDe(semillaDe("misma firma")));
  const b = simular(1.3, 1.1, 6000, azarDe(semillaDe("misma firma")));
  const c = simular(1.3, 1.1, 6000, azarDe(semillaDe("otra firma")));
  caso("la misma semilla da exactamente los mismos porcentajes",
       a.win === b.win && a.draw === b.draw && a.marcador === b.marcador);
  caso("y otra semilla da otros, aunque parecidos",
       a.win !== c.win && Math.abs(a.win - c.win) < 3, a.win.toFixed(2) + " vs " + c.win.toFixed(2));
  const d1 = simDesde({ xgA:1.3, xgB:1.1, minuto:60, golesA:1, rnd: azarDe(7) });
  const d2 = simDesde({ xgA:1.3, xgB:1.1, minuto:60, golesA:1, rnd: azarDe(7) });
  caso("simDesde también acepta la semilla", d1.win === d2.win && d1.marcador === d2.marcador);
  caso("la semilla de un texto es estable", semillaDe("hola") === semillaDe("hola") && semillaDe("hola") !== semillaDe("holb"));
  const r = azarDe(123); const xs = Array.from({length:1000}, r);
  caso("el generador da números en [0,1)", xs.every(x => x >= 0 && x < 1));
  caso("y no se queda pegado", new Set(xs).size > 990);
}

/* ── EL DIBUJO SALE DE LA CANCHA ──────────────────────────────────────────
   "Toma todas las formaciones como 4-3-3, no las adapta al equipo." Era
   literal: el simulador arrancaba con esa cadena escrita a mano para los dos
   equipos. El dato para deducirlo ya venía bajado en cada partido.       */
{
  caso("tres atrás, cuatro en el medio y tres arriba es 3-4-3",
       formaDe(3, 4, 3) === "3-4-3", formaDe(3, 4, 3));
  caso("cinco defensores no se confunden con cuatro",
       formaDe(5, 3, 2) === "5-3-2", formaDe(5, 3, 2));
  caso("un reparto que no existe en la lista cae en el más parecido",
       FORMS.includes(formaDe(3, 3, 4)), formaDe(3, 3, 4));

  /* Los tres dibujos de cuatro-cinco-uno son el MISMO equipo para el modelo:
     cambia dónde se paran en la pantalla, no cuántos hay por línea. Que el
     desempate sea el orden de la lista es una decisión, no un descuido. */
  caso("cuatro, cinco y uno da un dibujo de esa familia",
       ["4-2-3-1", "4-5-1", "4-1-4-1"].includes(formaDe(4, 5, 1)), formaDe(4, 5, 1));

  const salida = (posiciones, id = 7) => ([{ team: { id }, players: posiciones.map((p, i) =>
    ({ player: { id: i }, statistics: [{ games: { position: p, substitute: false } }] })) }]);
  caso("un once titular se lee entero",
       formacionDeSalida(salida(["G","D","D","D","D","M","M","M","M","F","F"]), 7) === "4-4-2");
  caso("los suplentes no cuentan",
       formacionDeSalida([{ team:{id:7}, players:
         [...salida(["G","D","D","D","D","M","M","M","M","F","F"])[0].players,
          { player:{id:99}, statistics:[{ games:{ position:"F", substitute:true } }] }] }], 7) === "4-4-2");
  caso("con menos de diez titulares no se inventa nada",
       formacionDeSalida(salida(["G","D","D","M","M"]), 7) === null);
  caso("un equipo que no está en la respuesta tampoco",
       formacionDeSalida(salida(["G","D","D","D","D","M","M","M","M","F","F"]), 999) === null);

  caso("la habitual es la que más se repite, no la última",
       formacionHabitual(["4-4-2", "4-4-2", "3-4-3"]) === "4-4-2");
  caso("y si empatan gana la más reciente",
       formacionHabitual(["4-4-2", "3-4-3"]) === "3-4-3");
  caso("sin datos no hay habitual", formacionHabitual([null, null]) === null);
}

/* Un plantel como los de verdad: dos arqueros, seis defensores, siete
   volantes y cinco delanteros, con niveles despatarrados a propósito.  */
let id = 0;
const j = (pos, rating) => ({ id: ++id, nombre: pos + rating, pos,
  ratings: [rating], mins: 270, apar: 3 });

const plantel = [
  j("G", 6.4), j("G", 6.1),
  j("D", 6.3), j("D", 6.2), j("D", 6.0), j("D", 5.9), j("D", 5.8), j("D", 5.7),
  j("M", 7.6), j("M", 7.4), j("M", 7.2), j("M", 6.9), j("M", 6.8), j("M", 6.6), j("M", 6.5),
  j("F", 8.1), j("F", 7.9), j("F", 7.5), j("F", 6.7), j("F", 6.4),
];

const cuenta = xi => xi.reduce((a, p) => (a[p ? p.slotCat : "?"] = (a[p ? p.slotCat : "?"] || 0) + 1, a), {});
const fuera = xi => xi.filter(p => p && p.pos !== p.slotCat);

/* ── 1. con plantel completo, NADIE fuera de puesto ─────────────────────── */
for (const form of ["4-4-2", "4-3-3", "3-5-2", "4-2-3-1", "5-3-2"]) {
  const xi = autoXI(plantel, form);
  const mal = fuera(xi);
  caso("con plantel completo, " + form + " sale sin nadie fuera de puesto",
       mal.length === 0,
       mal.length ? mal.map(p => p.nombre + " de " + p.slotCat).join(", ") : "");
  caso("  y con once jugadores", xi.filter(Boolean).length === 11);
}

/* ── 2. el mejor de cada puesto entra ───────────────────────────────────
   El delantero de 8.1 tiene que jugar de delantero, no de volante. Eso es
   exactamente lo que fallaba: el castigo F↔M es 0.15 y la diferencia de
   nivel contra el mejor volante es 0.5, así que ganaba el delantero.     */
{
  const xi = autoXI(plantel, "4-4-2");
  const delanteros = xi.filter(p => p && p.slotCat === "F").map(p => p.nombre);
  caso("el mejor delantero juega de delantero", delanteros.includes("F8.1"),
       "delanteros elegidos: " + delanteros.join(", "));
  const arquero = xi.find(p => p && p.slotCat === "G");
  caso("el arquero es arquero y es el mejor de los dos", arquero?.nombre === "G6.4");
  const volantes = xi.filter(p => p && p.slotCat === "M").map(p => p.nombre);
  caso("los volantes son los cuatro mejores volantes",
       ["M7.6", "M7.4", "M7.2", "M6.9"].every(n => volantes.includes(n)),
       volantes.join(", "));
}

/* ── 3. si falta gente, improvisa, pero lo mínimo ───────────────────────
   Un plantel sin delanteros tiene que improvisar los dos de arriba y nada
   más. Y para eso elige volantes, que es el cambio más barato.          */
{
  const sinF = plantel.filter(p => p.pos !== "F");
  const xi = autoXI(sinF, "4-4-2");
  const mal = fuera(xi);
  caso("sin delanteros, improvisa exactamente los 2 de arriba", mal.length === 2,
       mal.map(p => p.pos + " de " + p.slotCat).join(", "));
  caso("y los improvisados son volantes, no defensores",
       mal.every(p => p.pos === "M"), mal.map(p => p.pos).join(""));
  caso("igual son once", xi.filter(Boolean).length === 11);
}

/* ── 4. plantel escaso: no se cuelga y respeta el dibujo ───────────────── */
{
  const flaco = [j("G", 6.5), j("D", 6.5), j("D", 6.4), j("M", 6.6), j("F", 6.7)];
  const xi = autoXI(flaco, "4-4-2");
  caso("con cinco jugadores devuelve once lugares", xi.length === 11);
  caso("y no repite a nadie",
       new Set(xi.filter(Boolean).map(p => p.id)).size === xi.filter(Boolean).length);
  caso("el arquero sigue siendo el arquero",
       xi.find(p => p && p.slotCat === "G")?.pos === "G");
}

/* ── 5. los que no vienen jugando no entran de arranque ─────────────────
   Al plantel se le suman los de la lista oficial que no sumaron minutos,
   para que aparezcan y se puedan elegir a mano. Pero de esos no sabemos
   nada: no pueden desplazar a uno que viene jugando.                    */
{
  const sinMinutos = { id: 999, nombre: "Recién llegado", pos: "F",
                       ratings: [], mins: 0, apar: 0 };
  const xi = autoXI([...plantel, sinMinutos], "4-4-2");
  caso("el que no jugó nunca no entra de titular",
       !xi.some(p => p && p.id === 999),
       "delanteros: " + xi.filter(p => p && p.slotCat === "F").map(p => p.nombre).join(", "));
  const soloEl = autoXI([{ ...sinMinutos }, j("G", 6.5)], "4-4-2");
  caso("pero si no hay otro, juega", soloEl.some(p => p && p.id === 999));
}

/* ── 6. el dibujo se respeta siempre ────────────────────────────────────── */
{
  const xi = autoXI(plantel, "3-4-3");
  const c = cuenta(xi);
  caso("3-4-3 da 1 arquero, 3 defensores, 4 volantes y 3 delanteros",
       c.G === 1 && c.D === 3 && c.M === 4 && c.F === 3, JSON.stringify(c));
}

/* ─── LOS NÚMEROS DE CADA LIGA ────────────────────────────────────────────
   Estuvieron fijos con forma argentina hasta el 2026-08-29. El documento del
   backtest decía que cada liga corre con sus propios promedios; el motor no
   lo hacía, y por eso la Premier daba marcadores bajos. */
{
  usarLiga(null);
  caso("sin decir nada, se usa la liga de respaldo",
       ligaActual().media === LIGA_POR_DEFECTO.media &&
       ligaActual().local === LIGA_POR_DEFECTO.local);

  usarLiga({ id: 39, nombre: "Premier", media: 6.83, local: 1.62, visita: 1.28 });
  caso("una liga con sus propios números se aplica",
       ligaActual().media === 6.83 && ligaActual().local === 1.62);

  /* La media de la liga es el ancla del que jugó poco. Al que ya tiene tres
     partidos completos casi no lo toca: la confianza llega a uno y la media
     se cancela sola. Escribí este caso esperando lo contrario y me corrigió
     el comentario que había puesto en el motor. */
  const nuevo = { ratings: [8.0], mins: 45 };
  const enPremier = fuerza(nuevo).v;
  usarLiga(null);
  const enArgentina = fuerza(nuevo).v;
  caso("al que jugó poco, la media de su liga lo mueve",
       Math.abs(enPremier - enArgentina) > 0.1,
       "premier " + enPremier.toFixed(2) + " vs argentina " + enArgentina.toFixed(2));

  const rodado = { ratings: [8.0, 8.0, 8.0], mins: 270 };
  const rA = fuerza(rodado).v;
  usarLiga({ media: 6.83, local: 1.62, visita: 1.28 });
  const rP = fuerza(rodado).v;
  caso("y al que ya jugó tres partidos, no: ahí manda lo que hizo él",
       Math.abs(rP - rA) < 0.001, rA.toFixed(2) + " vs " + rP.toFixed(2));

  usarLiga({ media: "cualquier cosa", local: -3, visita: 0 });
  caso("un número inventado no reemplaza al respaldo",
       ligaActual().media === LIGA_POR_DEFECTO.media &&
       ligaActual().local === LIGA_POR_DEFECTO.local &&
       ligaActual().visita === LIGA_POR_DEFECTO.visita);
  usarLiga(null);

  const fx = (n, h, a) => Array.from({ length: n }, () => ({ goals: { home: h, away: a } }));
  caso("con pocos partidos NO se calibra: mejor el respaldo que un número inventado",
       constantesDeLiga(fx(MINIMO_PARTIDOS - 1, 2, 1)).suficientes === false);
  const K = constantesDeLiga(fx(200, 2, 1), Array.from({ length: 300 }, () => 6.9));
  caso("con partidos de sobra, los goles salen de la liga",
       K.suficientes && K.local === 2 && K.visita === 1);
  caso("y la media de rating también", K.media === 6.9);
  caso("pero si hay pocos ratings, la media se deja en blanco",
       constantesDeLiga(fx(200, 2, 1), [6.9, 7.0]).media === undefined);
}

/* ─── SIMULAR DESDE UN PARTIDO EMPEZADO ─────────────────────────────────── */
{
  const g = s => s.win + s.draw + s.loss;
  const a = simDesde({ xgA: 1.4, xgB: 1.1, minuto: 0 });
  caso("desde el minuto cero las tres puntas suman cien", Math.abs(g(a) - 100) < 0.001);

  const b = simDesde({ xgA: 1.4, xgB: 1.1, minuto: 60, golesA: 1, golesB: 0 });
  caso("ganando 1-0 a los 60 se gana bastante más que desde el arranque",
       b.win > a.win + 20, a.win.toFixed(0) + "% → " + b.win.toFixed(0) + "%");
  caso("y el gol esperado que queda es el del tiempo que queda",
       Math.abs(b.xgA - 1.4 / 3) < 0.001, "" + b.xgA);

  const fin = simDesde({ xgA: 1.4, xgB: 1.1, minuto: 90, golesA: 2, golesB: 1 });
  caso("en el minuto 90 el partido ya está: no queda nada por simular",
       fin.win === 100 && fin.marcador === "2-1");

  const roja = simDesde({ xgA: 1.4, xgB: 1.1, minuto: 60, golesA: 1, golesB: 0, rojasB: 1 });
  caso("con el rival con uno menos, se gana todavía más",
       roja.win > b.win, b.win.toFixed(0) + "% → " + roja.win.toFixed(0) + "%");
  const miRoja = simDesde({ xgA: 1.4, xgB: 1.1, minuto: 60, golesA: 1, golesB: 0, rojasA: 1 });
  caso("y con el expulsado propio, menos", miRoja.win < b.win);

  caso("un minuto fuera de la cancha no rompe nada",
       simDesde({ xgA: 1, xgB: 1, minuto: 500 }).xgA === 0 &&
       simDesde({ xgA: 1, xgB: 1, minuto: -20 }).xgA === 1);
}

/* ─── LAS INDICACIONES DEL PLANTEO ───────────────────────────────────────
   Son del planteo y no por jugador porque el motor compara LÍNEAS: no hay
   aporte individual al que restarle una marca. Cada una publica su efecto y
   cada una cobra su precio — ninguna puede ser una mejora gratis. */
{
  usarLiga(null);
  const p = (id, pos, cat, r) => ({ id, nombre: "J" + id, pos, slotCat: cat,
                                    ratings: [r], mins: 450 });
  const once = (cat, rs, pos) => rs.map((r, i) => p(cat + i, pos || cat, cat, r));
  const mio  = [...once("G", [6.5]), ...once("D", [6.5, 6.5, 6.5, 7.4]),
                ...once("M", [6.5, 6.5, 6.5]), ...once("F", [6.5, 6.5, 6.5])];
  const suyo = [...once("G", [6.5]), ...once("D", [6.5, 6.5, 6.5, 6.5]),
                ...once("M", [6.5, 6.5, 6.5]), ...once("F", [8.2, 6.5, 6.5])];

  const base = aplicarIndicaciones(lineas(mio), lineas(suyo), INDICACIONES_POR_DEFECTO, mio, suyo);
  caso("por zona no cambia nada: es lo normal y no cuesta",
       base.A.ATA === lineas(mio).ATA && base.B.ATA === lineas(suyo).ATA);
  caso("y no inventa notas cuando no hay nada que contar", base.notas.length === 0);

  const marca = aplicarIndicaciones(lineas(mio), lineas(suyo),
    { ...INDICACIONES_POR_DEFECTO, marca: "personal" }, mio, suyo);
  caso("marcando personal, el rival ataca menos", marca.B.ATA < base.B.ATA);
  caso("pero tu defensa se resiente: el que marca deja de hacer lo otro",
       marca.A.DEF < base.A.DEF);
  caso("y se dice a quién marcás y con quién",
       marca.notas.some(n => /Marcás personal/.test(n)), marca.notas.join(" | "));

  const flojo = aplicarIndicaciones(lineas(mio), lineas(suyo),
    { ...INDICACIONES_POR_DEFECTO, ataque: "flojo" }, mio, suyo);
  caso("atacar el lado flojo no sirve contra una defensa pareja",
       Math.abs(flojo.A.ATA - base.A.ATA) < 0.001,
       "cambió " + (flojo.A.ATA - base.A.ATA).toFixed(3));

  const desparejo = [...once("G", [6.5]), ...once("D", [5.2, 7.4, 7.4, 7.4]),
                     ...once("M", [6.5, 6.5, 6.5]), ...once("F", [6.5, 6.5, 6.5])];
  const contraDesparejo = aplicarIndicaciones(lineas(mio), lineas(desparejo),
    { ...INDICACIONES_POR_DEFECTO, ataque: "flojo" }, mio, desparejo);
  caso("contra una defensa con un punto flojo, sí",
       contraDesparejo.A.ATA > lineas(mio).ATA + 0.15,
       "ganó " + (contraDesparejo.A.ATA - lineas(mio).ATA).toFixed(2));

  const pelotazo = aplicarIndicaciones(lineas(mio), lineas(suyo),
    { ...INDICACIONES_POR_DEFECTO, salida: "pelotazo" }, mio, suyo);
  caso("el pelotazo le regala gol esperado al rival", pelotazo.regalo > 0);
  const conVolantes = [...once("G", [6.5]), ...once("D", [6.5, 6.5, 6.5, 6.5]),
                       ...once("M", [8.0, 8.0, 8.0]), ...once("F", [6.0, 6.0, 6.0])];
  const desperdicio = aplicarIndicaciones(lineas(conVolantes), lineas(suyo),
    { ...INDICACIONES_POR_DEFECTO, salida: "pelotazo" }, conVolantes, suyo);
  caso("con buenos volantes, saltearlos es tirar plata",
       desperdicio.A.ATA < lineas(conVolantes).ATA,
       "" + desperdicio.A.ATA.toFixed(2) + " vs " + lineas(conVolantes).ATA.toFixed(2));
  caso("y se avisa que es un desperdicio",
       desperdicio.notas.some(n => /tirar plata/.test(n)), desperdicio.notas.join(" | "));

  caso("son tres indicaciones, no once jugadores con dos cada uno",
       INDICACIONES.length === 3);
  caso("y cada opción dice qué hace, en castellano",
       INDICACIONES.every(g => g.opciones.every(o => o.dice && o.dice.length > 20)));
}

/* ─── LOS PLANTEOS ARMADOS ────────────────────────────────────────────────
   Un planteo es un atajo que escribe las mismas perillas. Cuál está activo
   NO se guarda en ningún lado: se deduce. Un botón encendido sobre valores
   que ya no son los suyos es un botón que miente. */
{
  caso("cada planteo escribe las cuatro perillas",
       PLANTEOS.every(p => KNOBS.every(k => typeof p.K[k.id] === "number")));
  caso("y cada uno dice qué hace",
       PLANTEOS.every(p => p.dice && p.dice.length > 30));
  caso("de las perillas se deduce el planteo",
       PLANTEOS.every(p => planteoDe(p.K) === p.id));
  caso("y movida una a mano, ya no es ninguno",
       planteoDe({ ...planteo("atras"), ritmo: 5 }) === null);
  caso("hay un planteo neutro y es el que no toca nada",
       planteoDe({ linea:0, presion:0, ancho:0, ritmo:0 }) === "normal");

  /* Cada planteo tiene que MOVER algo, y en la dirección de su nombre. */
  const t = id => tacticas(planteo(id));
  caso("pararse atrás genera menos que ir a buscarlo",
       t("atras").mine < t("buscarlo").mine,
       t("atras").mine.toFixed(2) + " vs " + t("buscarlo").mine.toFixed(2));
  caso("pero también concede menos",
       t("atras").theirs < t("buscarlo").theirs,
       t("atras").theirs.toFixed(2) + " vs " + t("buscarlo").theirs.toFixed(2));
  caso("jugarse la vida es el que más genera y más concede",
       t("lavida").mine === Math.max(...PLANTEOS.map(p => t(p.id).mine)) &&
       t("lavida").theirs === Math.max(...PLANTEOS.map(p => t(p.id).theirs)));
  caso("salir de contra genera más que meterse atrás sin salir",
       t("contra").mine > t("atras").mine);
  caso("ninguno es una mejora gratis: el que más genera también concede más",
       PLANTEOS.every(p => {
         const x = t(p.id);
         return !(x.mine > t("normal").mine && x.theirs < t("normal").theirs);
       }));

  caso("con uno menos y ganando, se sugiere pararse atrás",
       planteoSugerido({ conUnoMenos:true, ganando:true }) === "atras");
  caso("con uno menos y perdiendo, salir de contra",
       planteoSugerido({ conUnoMenos:true, ganando:false }) === "contra");
  caso("y con once, no se sugiere nada",
       planteoSugerido({ conUnoMenos:false, ganando:true }) === null);
}

/* ─── resultado ──────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, extra]) => {
  console.log("  " + (ok ? "ok    " : "MAL   ") + n);
  if (!ok && extra) console.log("        " + extra);
});
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
