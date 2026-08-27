/* ══════════════════════════════════════════════════════════════════════════
   FANTASY — el reglamento hecho código. NO toca la red ni la base.

   Todo lo que decide cuántos puntos vale algo vive acá y en ningún otro
   lado. Es a propósito: el día que discutamos si el gol de un defensor vale
   6 o 7, se cambia UN número en UNA tabla y las pruebas dicen qué se movió.

   La regla que ordena el archivo: cada punto se puede rastrear a algo que
   pasó en la cancha. El puntaje del proveedor —ese 1 a 10 que no se puede
   reconstruir— entra en un solo lugar, como bono topado, y nunca como
   castigo. Si mañana cambian su fórmula, mueve el margen, no el ganador.

   El reglamento completo, con el porqué de cada número:
   claude/fantasy-reglamento.md
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── LA TABLA ────────────────────────────────────────────────────────────
   Por puesto: G arquero, D defensor, M medio, F delantero.               */
export const REGLAS = {
  presencia:      { entro: 1, sesenta: 2 },     // escalones, no se suman
  gol:            { G: 10, D: 6, M: 5, F: 4 },
  asistencia:     3,
  clavesPorPunto: 2,                            // cada 2 pases clave, 1
  vallaInvicta:   { G: 5, D: 4, M: 1, F: 0 },   // pide 60 minutos
  recibidosCada:  2,                            // cada 2 goles recibidos…
  recibidosPena:  { G: -1, D: -1, M: 0, F: 0 }, // …esto
  atajadasCada:   3,
  quitesCada:     4,                            // quites + intercepciones
  penalAtajado:   5,
  penalErrado:   -2,
  golEnContra:   -2,
  amarilla:      -1,
  roja:          -3,
  bonoMasValioso: 0.5,                          // +50%
  capitan:        2,                            // duplica
  minutosParaValla: 60,
  minutosParaMVP:   60,
};

/* ─── LAS FORMACIONES ─────────────────────────────────────────────────────
   Antes esto era "entre 3 y 5 defensores", que es lenguaje de reglamento.
   Nadie piensa así: se piensa en 4-3-3. Elegir la formación primero y que
   ella diga cuántos van en cada línea es cómo funciona la cabeza de un
   hincha, y de paso hace imposible armar un equipo ilegal.

   Son las siete que se juegan de verdad. Con once jugadores y un arquero
   fijo hay más combinaciones posibles, pero nadie sale con 2-6-2.        */
export const FORMACIONES = {
  "4-3-3": { D: 4, M: 3, F: 3 },
  "4-4-2": { D: 4, M: 4, F: 2 },
  "3-5-2": { D: 3, M: 5, F: 2 },
  "3-4-3": { D: 3, M: 4, F: 3 },
  "4-5-1": { D: 4, M: 5, F: 1 },
  "5-3-2": { D: 5, M: 3, F: 2 },
  "5-4-1": { D: 5, M: 4, F: 1 },
};
export const FORMACION_POR_DEFECTO = "4-3-3";

/* Cuántos van en cada línea, con el arquero incluido. */
export const cupoDe = (formacion) => {
  const f = FORMACIONES[formacion] || FORMACIONES[FORMACION_POR_DEFECTO];
  return { G: 1, ...f };
};

/* El formato del presupuesto. Los números finos se calibran contra una
   fecha real: 75 es la cuenta, no la respuesta. */
export const FORMATO = {
  titulares: 11, suplentes: 4, presupuesto: 75, maxPorClub: 3,
  precio: { piso: 4, techo: 10 },
};

const PUESTOS = ["G", "D", "M", "F"];
const cada = (n, cuantos) => Math.floor((n || 0) / cuantos);

/* ─── 1. LO QUE HIZO UN JUGADOR EN UN PARTIDO ─────────────────────────────
   `a` es una actuación ya normalizada (ver `actuacionDe` más abajo).
   Devuelve el detalle abierto, no solo el total: "te dieron 47" es un
   número que hay que creer; el detalle es un número que se puede revisar. */
export function puntosDeActuacion(a) {
  const p = a.puesto, R = REGLAS, renglones = [];
  const sumar = (que, pts) => { if (pts) renglones.push({ que, pts }); };

  if (!a.minutos) return { puntos: 0, renglones: [], jugo: false };

  sumar(a.minutos >= 60 ? "Jugó 60 minutos o más" : "Entró a la cancha",
        a.minutos >= 60 ? R.presencia.sesenta : R.presencia.entro);

  if (a.goles)      sumar(a.goles + (a.goles > 1 ? " goles" : " gol"), a.goles * R.gol[p]);
  if (a.asistencias) sumar(a.asistencias + " asistencia" + (a.asistencias > 1 ? "s" : ""),
                           a.asistencias * R.asistencia);

  const porClaves = cada(a.clavesPases, R.clavesPorPunto);
  if (porClaves) sumar(a.clavesPases + " pases clave", porClaves);

  /* Defensa. La valla invicta es del EQUIPO, no del jugador: se le pasa
     cuántos goles recibió su equipo en ese partido. */
  if (a.minutos >= R.minutosParaValla && a.recibidos === 0 && R.vallaInvicta[p])
    sumar("Valla invicta", R.vallaInvicta[p]);
  const porRecibidos = cada(a.recibidos, R.recibidosCada) * R.recibidosPena[p];
  if (porRecibidos) sumar(a.recibidos + " goles recibidos", porRecibidos);

  if (p === "G") {
    const porAtajadas = cada(a.atajadas, R.atajadasCada);
    if (porAtajadas) sumar(a.atajadas + " atajadas", porAtajadas);
  }
  const porQuites = cada((a.quites || 0) + (a.intercepciones || 0), R.quitesCada);
  if (porQuites) sumar(((a.quites || 0) + (a.intercepciones || 0)) + " quites e intercepciones", porQuites);

  if (a.penalAtajado) sumar("Penal atajado", a.penalAtajado * R.penalAtajado);
  if (a.penalErrado)  sumar("Penal errado",  a.penalErrado  * R.penalErrado);
  if (a.golEnContra)  sumar("Gol en contra", a.golEnContra  * R.golEnContra);
  if (a.amarillas)    sumar("Amarilla",      a.amarillas    * R.amarilla);
  if (a.rojas)        sumar("Roja",          a.rojas        * R.roja);

  const base = renglones.reduce((s, r) => s + r.pts, 0);
  return { puntos: base, renglones, jugo: true };
}

/* ─── 2. EL MÁS VALIOSO DEL PARTIDO ───────────────────────────────────────
   El puntaje del proveedor decide una sola cosa: quién de ese partido suma
   50% más. Es bono, nunca castigo, y está topado a la mitad, así que un
   número raro mueve el margen y no el resultado de la fecha.

   Tres reglas finas para que no haya discusión el lunes:
     · pide 60 minutos — el que entró a los 85 no fue el más valioso de nada
     · si el proveedor no publicó puntajes de ese partido, NO HAY más valioso
     · empate: los dos cobran                                              */
export function masValiosos(actuaciones) {
  const elegibles = actuaciones.filter(a =>
    a.minutos >= REGLAS.minutosParaMVP && typeof a.nota === "number" && !isNaN(a.nota));
  if (!elegibles.length) return [];
  const techo = Math.max(...elegibles.map(a => a.nota));
  return elegibles.filter(a => a.nota === techo).map(a => a.jugador);
}

/* ─── 3. LAS SUPLENCIAS ───────────────────────────────────────────────────
   Entra el suplente de su MISMO puesto, y solo si el titular jugó CERO
   minutos. No por bajo rendimiento: eso sería otro juego.

   Si en un puesto faltan dos, entra uno solo. Hay un suplente por puesto,
   no una lista de espera — y decirlo en la pantalla vale más que resolverlo
   en silencio.                                                            */
export function aplicarSuplencias(equipo, minutosDe) {
  const jugo = id => (minutosDe(id) || 0) > 0;
  const entraron = [], afuera = [];
  const banco = { ...equipo.suplentes };          // { G, D, M, F }
  const usados = {};

  const enCancha = equipo.titulares.map(t => {
    if (jugo(t.id)) return t;
    const s = banco[t.puesto];
    if (s && !usados[t.puesto] && jugo(s.id)) {
      usados[t.puesto] = true;
      entraron.push({ sale: t, entra: s });
      return { ...s, porSuplencia: t };
    }
    afuera.push(t);
    return t;                                     // queda, y suma cero
  });

  /* La cinta. Duplicar cero es cero, y perder la mejor decisión de la fecha
     por una suplencia que no podías saber es la clase de injusticia que
     hace que la gente deje de jugar. */
  let capitan = equipo.capitan;
  let cintaPasada = false;
  if (!jugo(capitan) && equipo.vice && jugo(equipo.vice)) {
    capitan = equipo.vice;
    cintaPasada = true;
  }
  return { enCancha, entraron, afuera, capitan, cintaPasada };
}

/* ─── 4. LA FECHA DE UN EQUIPO ────────────────────────────────────────────
   `actuaciones` es un Map de idJugador -> actuación normalizada.
   `mvps` es el conjunto de ids que fueron los más valiosos de su partido. */
export function puntosDeFecha(equipo, actuaciones, mvps = new Set()) {
  const min = id => actuaciones.get(id)?.minutos || 0;
  const { enCancha, entraron, afuera, capitan, cintaPasada } = aplicarSuplencias(equipo, min);

  const jugadores = enCancha.map(j => {
    const a = actuaciones.get(j.id);
    const base = a ? puntosDeActuacion(a) : { puntos: 0, renglones: [], jugo: false };
    const esMVP = mvps.has(j.id);
    const esCap = j.id === capitan;

    /* El orden importa y es el que dice el reglamento: primero el bono del
       más valioso, después la capitanía. Capitán + más valioso da ×3. Pasa
       poco y cuando pasa es la fecha que se cuenta. */
    let puntos = base.puntos;
    if (esMVP) puntos = puntos * (1 + REGLAS.bonoMasValioso);
    if (esCap) puntos = puntos * REGLAS.capitan;

    return { ...j, ...base, esMVP, esCapitan: esCap,
             nota: a?.nota ?? null,
             puntosFinales: redondear(puntos) };
  });

  return {
    puntos: redondear(jugadores.reduce((s, j) => s + j.puntosFinales, 0)),
    jugadores, entraron, afuera, capitan, cintaPasada,
  };
}

/* Medio punto es el grano más chico que puede aparecer: solo lo produce el
   bono del más valioso. Redondear a un decimal deja 47.5 y evita que un
   0.30000000000000004 aparezca en una tabla. */
const redondear = n => Math.round(n * 10) / 10;

/* ─── 5. LOS PRECIOS ──────────────────────────────────────────────────────
   Una FÓRMULA publicada, no un número que ponemos nosotros. Si alguien
   pregunta por qué un jugador vale lo que vale, la respuesta tiene que
   estar en la app y tiene que poder rehacerla cualquiera.                 */
export function precioDe(puntosPorPartido, mejorDeLaLiga, f = FORMATO.precio) {
  if (!(mejorDeLaLiga > 0)) return f.piso;
  const crudo = f.piso + (f.techo - f.piso) * (puntosPorPartido / mejorDeLaLiga);
  return Math.round(Math.min(f.techo, Math.max(f.piso, crudo)) * 2) / 2;   // pasos de 0,5
}

export function ponerPrecios(jugadores, f = FORMATO.precio) {
  const pxp = j => (j.partidos > 0 ? j.puntosTotales / j.partidos : 0);
  const mejor = Math.max(0, ...jugadores.map(pxp));
  return jugadores.map(j => ({ ...j, ppp: redondear(pxp(j)), precio: precioDe(pxp(j), mejor, f) }));
}

/* ─── 6. ¿ESTE EQUIPO ES LEGAL? ───────────────────────────────────────────
   Lo revisa la app para no dejar guardar cualquier cosa, y lo revisa DE
   NUEVO el servidor antes de puntuar. No es desconfianza: la app corre en
   el teléfono de otro, y ahí no manda nadie.

   Devuelve la lista de problemas en castellano, vacía si está bien.      */
export function revisarEquipo(equipo, precios, F = FORMATO) {
  const problemas = [];
  const T = equipo.titulares || [], S = Object.values(equipo.suplentes || {});

  if (T.length !== F.titulares) problemas.push("Faltan titulares: son " + F.titulares + ".");
  if (S.length !== F.suplentes) problemas.push("Faltan suplentes: son " + F.suplentes +
    ", uno por puesto (arquero, defensa, medio y ataque).");

  /* Con formación elegida no hay rangos: cada línea tiene su número exacto,
     y eso hace imposible guardar un equipo que no sea una formación real. */
  const cupo = cupoDe(equipo.formacion);
  for (const p of PUESTOS) {
    const n = T.filter(j => j.puesto === p).length;
    if (n !== cupo[p]) problemas.push(nombrePuesto(p, cupo[p]) + ": en " +
      (equipo.formacion || FORMACION_POR_DEFECTO) + " van " + cupo[p] + ", y hay " + n + ".");
    if (equipo.suplentes && !equipo.suplentes[p])
      problemas.push("Falta el suplente de " + nombrePuesto(p, 2).toLowerCase() + ".");
  }

  const todos = [...T, ...S];
  const ids = new Set(todos.map(j => j.id));
  if (ids.size !== todos.length) problemas.push("Hay un jugador repetido.");

  const porClub = {};
  for (const j of todos) porClub[j.club] = (porClub[j.club] || 0) + 1;
  for (const [club, n] of Object.entries(porClub))
    if (n > F.maxPorClub) problemas.push("Máximo " + F.maxPorClub + " por club, y hay " +
      n + " de " + club + ".");

  const gasto = todos.reduce((s, j) => s + (precios.get(j.id) ?? 0), 0);
  if (gasto > F.presupuesto)
    problemas.push("Te pasaste del presupuesto: " + redondear(gasto) + " de " + F.presupuesto + ".");

  if (!ids.has(equipo.capitan)) problemas.push("El capitán tiene que ser uno de los tuyos.");
  if (equipo.vice && !ids.has(equipo.vice)) problemas.push("El vice tiene que ser uno de los tuyos.");
  if (equipo.vice && equipo.vice === equipo.capitan)
    problemas.push("El vice no puede ser el mismo que el capitán.");
  /* El capitán y el vice salen de los ONCE: si el vice estuviera en el
     banco, la cinta podría terminar en alguien que no jugó. */
  const once = new Set(T.map(j => j.id));
  if (!once.has(equipo.capitan)) problemas.push("El capitán tiene que ser titular.");
  if (equipo.vice && !once.has(equipo.vice)) problemas.push("El vice tiene que ser titular.");

  return { ok: problemas.length === 0, problemas, gasto: redondear(gasto) };
}

const nombrePuesto = (p, n) => ({
  G: n === 1 ? "Arquero" : "Arqueros", D: n === 1 ? "Defensor" : "Defensores",
  M: n === 1 ? "Medio" : "Medios",     F: n === 1 ? "Delantero" : "Delanteros" }[p]);

/* ─── 7. DE LO QUE MANDA LA API A LO QUE USAMOS ───────────────────────────
   Todo viene como string y con nombres en inglés. Esto lo traduce una vez
   y en un solo lugar, así el resto del archivo no sabe que existe una API.

   `recibidos` NO viene por jugador: son los goles que recibió su equipo en
   ese partido, y se lo pasa quien arma el lote.                          */
export function actuacionDe(bruto, recibidosDelEquipo) {
  const e = bruto.statistics?.[0] || {};
  const num = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
  const nota = parseFloat(e.games?.rating);
  return {
    jugador: bruto.player?.id,
    nombre:  bruto.player?.name || "?",
    puesto:  (e.games?.position || "M").toUpperCase().slice(0, 1),
    minutos: num(e.games?.minutes),
    nota:    isNaN(nota) ? null : nota,
    goles:   num(e.goals?.total),
    asistencias: num(e.goals?.assists),
    atajadas:    num(e.goals?.saves),
    recibidos:   recibidosDelEquipo,
    clavesPases: num(e.passes?.key),
    quites:        num(e.tackles?.total),
    intercepciones: num(e.tackles?.interceptions),
    golEnContra:  num(e.penalty?.own) || num(e.goals?.own),
    penalAtajado: num(e.penalty?.saved),
    penalErrado:  num(e.penalty?.missed),
    amarillas: num(e.cards?.yellow),
    rojas:     num(e.cards?.red),
  };
}
