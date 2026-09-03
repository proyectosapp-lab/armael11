/* ══════════════════════════════════════════════════════════════════════════
   ARMÁ EL 11 — motor
   ──────────────────────────────────────────────────────────────────────────
   Portado tal cual del prototipo validado. No cambió un número: los que
   están acá son los que pasaron el backtest sobre 8 ligas.

   La regla que ordena todo: NUNCA se mira el partido que se está simulando.
   Los planteles y las fuerzas salen de los partidos ANTERIORES. Si mirara el
   partido, la simulación sería una profecía autocumplida y el juego no
   tendría gracia.
   ══════════════════════════════════════════════════════════════════════════ */

export const BASE = "https://v3.football.api-sports.io", LEAGUE = 128;
export const FORMS = ["4-4-2","4-3-3","4-2-3-1","3-5-2","5-3-2","4-5-1","3-4-3","4-1-4-1"];

/* ─── LOS NÚMEROS DE CADA LIGA ────────────────────────────────────────────
   Estos tres estuvieron fijos hasta el 2026-08-29, y con forma argentina:
   media de rating 6,5 y 2,48 goles por partido entre los dos equipos. Para
   Argentina están bien. Para la Premier o la Bundesliga, no: se juegan más
   goles, así que todos los marcadores salían bajos.

   Los dos que de verdad mueven el marcador son `local` y `visita`: son el
   punto de partida del gol esperado, así que si una liga se juega a 2,8
   goles y acá dice 2,48, TODOS los partidos de esa liga salen bajos.

   `media` pesa menos de lo que parece, y conviene decirlo bien: es el ancla
   hacia la que se corre el que jugó poco, y la referencia de las
   indicaciones. Al que ya jugó tres partidos completos casi no lo toca,
   porque la confianza llega a uno y la media se cancela sola en la cuenta
   de `fuerza`. Lo comprobó una prueba que escribí esperando lo contrario.

   El documento del backtest ya lo decía —"cada liga corre por separado, con
   su propio padrón y sus propios promedios"— pero el motor no lo hacía. Los
   valores de acá abajo son solo el respaldo para cuando no hay datos; los
   de verdad los calcula `ligas-api.mjs` con los partidos ya jugados de cada
   liga y viajan en el archivo de la liga.                                */
export const LIGA_POR_DEFECTO = Object.freeze({
  id: 128, nombre: "Liga Profesional", media: 6.5, local: 1.36, visita: 1.12,
});
let LIGA = { ...LIGA_POR_DEFECTO };
export const ligaActual = () => LIGA;
export function usarLiga(l){
  const n = { ...LIGA_POR_DEFECTO, ...(l || {}) };
  /* Un número inventado es peor que el respaldo: si viene basura, se
     ignora en silencio y se sigue con lo conocido. */
  for(const k of ["media","local","visita"])
    if(!(typeof n[k] === "number" && isFinite(n[k]) && n[k] > 0)) n[k] = LIGA_POR_DEFECTO[k];
  LIGA = n;
  return LIGA;
}

/* Sigue exportado porque hay pantallas que lo muestran, pero ahora es la
   media de la liga que se está simulando, no una constante. */
export const mediaLiga = () => LIGA.media;

/* Fuerza de un jugador = promedio de sus ratings en los partidos previos.
   6.5 es el rating medio de la liga: por debajo resta, por encima suma.
   La confianza sube con los minutos — a quien jugó poco se le cree menos. */
export function fuerza(p){
  const M = LIGA.media;
  if(!p.ratings.length) return { v: M, conf: 0 };
  const v = p.ratings.reduce((a,b)=>a+b,0) / p.ratings.length;
  const conf = Math.min(1, p.mins/180);            // 2 partidos completos = confianza plena
  return { v: M + (v-M)*(.45+.55*conf), conf };
}

/* Castigo por jugar fuera de puesto, en puntos de rating.
   La API sólo distingue G/D/M/F, así que un extremo figura como M aunque
   juegue de F: mover a alguien entre medio y ataque casi no cuesta. Poner a
   un defensor de nueve sí. Y al arco, cualquiera que no sea arquero es un
   desastre. Las claves van en orden alfabético, que es como las arma la
   función — ese detalle me costó un bug entero.                           */
const PENAL = { DG:1.6, GM:2.2, FG:2.6, DM:0.40, DF:0.85, FM:0.15 };
export function penalPuesto(real, slot){
  if(!real || real===slot) return 0;
  return PENAL[[real,slot].sort().join("")] ?? 0.5;
}

export function slotsDe(f){
  const l = f.split("-").map(Number).filter(n=>n>0), s = [{cat:"G",n:1}];
  s.push({cat:"D", n:l[0]});
  if(l.length===2){ s.push({cat:"M", n:l[1]}); }
  else {
    for(let i=1;i<l.length-1;i++) s.push({cat:"M", n:l[i]});
    s.push({cat:"F", n:l[l.length-1]});
  }
  return s;
}

/* ── DE CUÁNTOS SALIERON, AL DIBUJO ──────────────────────────────────────
   Segunda queja de los testers: "toma todas las formaciones como 4-3-3, no
   las adapta al equipo". Tenían razón y era literal: el simulador arrancaba
   con "4-3-3" clavado para los dos lados.

   El dato para arreglarlo ya estaba bajado. Cada `/fixtures/players` trae,
   por jugador, si fue titular y en qué categoría jugó (G/D/M/F). Contar los
   titulares de cada categoría da el dibujo sin pedir nada nuevo: mirando el
   cache real de Talleres, el último partido fue 3 defensores, 4 volantes y 3
   delanteros. O sea 3-4-3, no 4-3-3.

   ELEGIR ENTRE 4-2-3-1, 4-5-1 y 4-1-4-1 NO CAMBIA LA SIMULACIÓN. Los tres
   son cuatro defensores, cinco volantes y un delantero, y el modelo agrupa
   por categoría: lo único que cambia es cómo se dibuja en la cancha. Por eso
   el desempate es el orden de FORMS y no hace falta discutirlo.        */
export function formaDe(d, m, f){
  let mejor = FORMS[0], dist = Infinity;
  for(const F of FORMS){
    const c = { D:0, M:0, F:0 };
    for(const l of slotsDe(F)) if(l.cat !== "G") c[l.cat] += l.n;
    const dd = Math.abs(c.D-d) + Math.abs(c.M-m) + Math.abs(c.F-f);
    if(dd < dist){ dist = dd; mejor = F; }
  }
  return mejor;
}

/* El dibujo de un equipo en UN partido, leído de la respuesta que ya
   bajamos. Devuelve null si el dato no alcanza -menos de diez titulares, o
   ninguna categoría-, y ahí el que llama decide qué hacer. Nunca inventa. */
export function formacionDeSalida(resp, teamId){
  const t = (resp || []).find(x => x.team?.id === teamId);
  if(!t) return null;
  const tit = (t.players || []).filter(p => p.statistics?.[0]?.games?.substitute === false);
  if(tit.length < 10) return null;
  const c = { D:0, M:0, F:0 };
  for(const p of tit){ const pos = p.statistics[0].games.position; if(pos in c) c[pos]++; }
  if(!c.D || !c.M) return null;
  return formaDe(c.D, c.M, c.F);
}

/* La de los últimos partidos: la que MÁS se repite, no la del último. Un
   equipo que juega 4-4-2 todo el año y una vez se paró con tres atrás
   porque iba perdiendo no cambió de dibujo. Empate: gana la más reciente,
   que por eso se recorre al revés. */
export function formacionHabitual(formas){
  const buenas = (formas || []).filter(Boolean);
  if(!buenas.length) return null;
  const cuenta = new Map();
  for(const f of buenas) cuenta.set(f, (cuenta.get(f) || 0) + 1);
  let mejor = null, max = 0;
  for(const f of [...buenas].reverse())
    if(cuenta.get(f) > max){ max = cuenta.get(f); mejor = f; }
  return mejor;
}

export function lineas(xi){
  const g = x => xi.filter(p=>p&&p.slotCat===x).map(p => fuerza(p).v - penalPuesto(p.pos,p.slotCat));
  const m = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : LIGA.media;
  const arq=m(g("G")), def=m(g("D")), med=m(g("M")), ata=m(g("F"));
  return { arq, def, med, ata,
    DEF: def*.72 + arq*.28,
    MED: med,
    ATA: ata*.68 + med*.32 };
}

/* Perillas. Ninguna puede ser una mejora gratis — cada una cobra su precio:
   LINEA   riesgo simétrico: sube o baja las chances de los dos lados
   PRESION le corta la salida al rival pero le regala contras. El castigo es
           ADITIVO, así que pesa mucho más cuando el rival es flojo:
           presionar a un equipo chico es mal negocio, a uno grande es barato
   RITMO   escala el partido entero: más goles de los dos lados
   ANCHO   depende de con qué jugadores contás (se resuelve en bonusAncho)  */
export const KNOBS = [
  { id:"linea",   n:"Línea defensiva", izq:"Baja",        der:"Alta" },
  { id:"presion", n:"Presión",         izq:"Repliegue",   der:"Alta" },
  { id:"ancho",   n:"Ancho de juego",  izq:"Por adentro", der:"Por afuera" },
  { id:"ritmo",   n:"Ritmo",           izq:"Controlado",  der:"Alto" },
];

/* ─── DE DÓNDE SALEN LOS NÚMEROS DE UNA LIGA ──────────────────────────────
   De sus propios partidos jugados, que ya están bajados. Dos cosas:

   · goles de local y de visitante por partido → `local` y `visita`. Son el
     punto de partida del gol esperado y traen adentro la ventaja de local,
     que en Argentina es grande y en otras ligas no tanto.
   · la media de rating del proveedor → `media`. Es el cero del motor: por
     encima un jugador suma, por debajo resta.

   Se pide un mínimo de partidos porque con cuatro fechas cualquier promedio
   es ruido, y en ese caso es mejor el respaldo conocido que un número
   inventado con autoridad de dato.                                       */
export const MINIMO_PARTIDOS = 40;

export function constantesDeLiga(fixturesJugados, ratings = []){
  const fx = (fixturesJugados || []).filter(f =>
    f && f.goals && typeof f.goals.home === "number" && typeof f.goals.away === "number");
  const out = { partidos: fx.length, suficientes: fx.length >= MINIMO_PARTIDOS };
  if(!out.suficientes) return out;

  out.local  = redondeo(fx.reduce((a,f)=>a+f.goals.home,0) / fx.length);
  out.visita = redondeo(fx.reduce((a,f)=>a+f.goals.away,0) / fx.length);

  const rs = (ratings || []).map(Number).filter(n => isFinite(n) && n > 0);
  /* La media de rating se calcula aparte y puede faltar: si falta, se usa el
     respaldo y los goles igual sirven. Una cosa no arrastra a la otra. */
  if(rs.length >= 200) out.media = redondeo(rs.reduce((a,b)=>a+b,0) / rs.length);
  out.jugadoresMedidos = rs.length;
  return out;
}
const redondeo = n => Math.round(n * 1000) / 1000;

/* ─── LAS INDICACIONES ────────────────────────────────────────────────────
   Fausto pidió indicaciones por jugador: marca personal, seguir la diagonal,
   cubrir la zona. La idea es buena y la forma no se puede: el xG de este
   motor sale de una resta entre LÍNEAS (`A.ATA - B.DEF`), no hay aporte por
   jugador en ningún lado, así que "marcá al 10" no tendría a qué agarrarse.
   Inventarle un efecto rompería lo único que hace discutible a este juego —
   que el número se pueda revisar—, y ponerle un efecto simbólico se nota en
   tres simulaciones.

   Entonces son indicaciones DEL PLANTEO, no por jugador, y son tres: las
   tres que se pueden calcular con números que el motor ya tiene. Cada una
   cobra su precio, como las perillas, y cada una publica su efecto.

   Un jugador "se neutraliza" corriéndolo hacia la media de la liga, no
   borrándolo: marcar bien a alguien lo hace menos determinante, no lo saca
   de la cancha.                                                          */
export const NEUTRALIZA = 0.55;      /* cuánto se corre a la media al marcarlo */
export const CUESTA_MARCAR = 0.45;   /* cuánto pierde el que se dedica a marcar */
export const PELOTAZO = { medio: 0.32, directo: 0.15, regalo: 0.10 };

export const INDICACIONES = [
  { id:"marca", n:"La marca", opciones:[
    { v:"zona",     n:"Por zona",
      dice:"Cada uno cubre su sector. Es lo normal y no cuesta nada." },
    { v:"personal", n:"Personal al mejor",
      dice:"Tu mejor defensor se dedica al jugador más peligroso del rival: " +
           "lo corre un 55% hacia la media, y tu defensor pierde un 45% de lo " +
           "que aportaba al resto." },
  ]},
  { id:"ataque", n:"Por dónde atacar", opciones:[
    { v:"parejo", n:"Repartido",
      dice:"Se ataca por donde se pueda. Sin ventaja y sin costo." },
    { v:"flojo",  n:"Por el lado flojo",
      dice:"Se carga sobre el defensor más débil del rival. Ganás la mitad de " +
           "la diferencia entre ese defensor y el promedio de su defensa — " +
           "mucho si tienen un punto flojo, nada si son parejos." },
  ]},
  { id:"salida", n:"La salida", opciones:[
    { v:"elaborada", n:"Jugada",
      dice:"Sale desde el fondo por el medio. Es la que usa el motor por defecto." },
    { v:"pelotazo",  n:"Directa",
      dice:"Se saltea el mediocampo: tu ataque depende menos de tus volantes y " +
           "más de tus delanteros. Conviene con volantes flojos y delanteros " +
           "buenos, y al revés es un desperdicio. Y regalás más la pelota: " +
           "el rival suma 0,10 de gol esperado." },
  ]},
];

export const INDICACIONES_POR_DEFECTO = { marca:"zona", ataque:"parejo", salida:"elaborada" };

/* Aplica las indicaciones a las dos líneas ya calculadas. Devuelve las
   líneas corregidas y las notas para mostrar, que es lo que hace que se
   pueda discutir. `misXI` y `susXI` son los onces, para poder mirar
   jugador por jugador lo que las líneas ya promediaron.                  */
export function aplicarIndicaciones(A, B, ind, misXI, susXI){
  const I = { ...INDICACIONES_POR_DEFECTO, ...(ind || {}) };
  const M = LIGA.media;
  const a = { ...A }, b = { ...B }, notas = [];
  const val = p => fuerza(p).v - penalPuesto(p.pos, p.slotCat);
  const suyos = (xi, cat) => (xi || []).filter(p => p && p.slotCat === cat);

  if(I.marca === "personal"){
    /* El más peligroso de ellos: el de mayor valor entre ataque y medio. */
    const peligro = [...suyos(susXI,"F"), ...suyos(susXI,"M")]
      .sort((x,y)=>val(y)-val(x))[0];
    const miMejorD = suyos(misXI,"D").sort((x,y)=>val(y)-val(x))[0];
    if(peligro && miMejorD){
      const nF = suyos(susXI,"F").length || 1;
      /* Lo que ese jugador aportaba de más sobre la media, repartido en su
         línea, es lo que se neutraliza. */
      const deMas = Math.max(0, val(peligro) - M);
      b.ATA -= deMas * NEUTRALIZA * 0.68 / nF;
      const nD = suyos(misXI,"D").length || 1;
      a.DEF -= Math.max(0, val(miMejorD) - M) * CUESTA_MARCAR * 0.72 / nD;
      notas.push("Marcás personal a " + (peligro.nombre || "su mejor jugador") +
                 ", y para eso ocupás a " + (miMejorD.nombre || "tu mejor defensor") + ".");
    } else {
      notas.push("No hay a quién marcar personal con este once: se juega por zona.");
    }
  }

  if(I.ataque === "flojo"){
    const sus = suyos(susXI,"D").map(val);
    if(sus.length >= 2){
      const flojo = Math.min(...sus), prom = sus.reduce((x,y)=>x+y,0)/sus.length;
      const gana = (prom - flojo) / 2;
      a.ATA += gana;
      notas.push(gana > 0.12
        ? "Cargás sobre su lado más flojo, y ahí hay diferencia."
        : "Cargás sobre su lado más flojo, pero su defensa es pareja: casi no cambia nada.");
    }
  }

  if(I.salida === "pelotazo"){
    /* ATA venía siendo ata*.68 + med*.32. El pelotazo saltea el medio. */
    const ata = A.ata, med = A.med;
    a.ATA = ata*(0.68 + PELOTAZO.medio - PELOTAZO.directo) + med*(0.32 - PELOTAZO.medio) +
            A.def*PELOTAZO.directo;
    notas.push(med > ata
      ? "Con pelotazo salteás a tus volantes, que son lo mejor que tenés. Es tirar plata."
      : "El pelotazo te saltea el mediocampo, que no es tu fuerte.");
  }

  return { A:a, B:b, notas, regalo: I.salida === "pelotazo" ? PELOTAZO.regalo : 0 };
}

/* ─── LOS PLANTEOS ARMADOS ────────────────────────────────────────────────
   Un planteo NO es otro modo de juego: es un atajo que escribe las mismas
   perillas. Se elige uno y las cuatro se acomodan; después se puede mover
   cualquiera a mano y el planteo deja de estar marcado, porque un botón
   encendido sobre valores que ya no son los suyos es un botón que miente.

   Por eso no hay un estado "planteo elegido" en ningún lado: cuál está
   activo se DEDUCE de las perillas con `planteoDe`. Un solo lugar de verdad.

   Los números no son un gusto: son las mismas perillas que ya existían,
   puestas en la combinación que describe cada nombre. Cualquiera puede
   mirarlos, moverlos y ver qué cambia.                                    */
export const PLANTEOS = [
  { id:"atras", n:"Se para atrás",
    K:{ linea:-70, presion:-60, ancho:-20, ritmo:-45 },
    dice:"Bloque bajo, repliegue y partido cerrado. Concede bastante menos y " +
         "crea bastante menos: es el planteo del que quiere que se termine." },
  { id:"normal", n:"Normal",
    K:{ linea:0, presion:0, ancho:0, ritmo:0 },
    dice:"Sin nada cargado para ningún lado. Es de donde parte el modelo." },
  { id:"contra", n:"Espera y sale de contra",
    K:{ linea:-45, presion:-25, ancho:35, ritmo:55 },
    dice:"Se para atrás pero sale rápido y abierto. Cede el balón y busca el " +
         "espacio: rinde cuando tenés gente veloz por afuera." },
  { id:"buscarlo", n:"Va a buscarlo",
    K:{ linea:45, presion:55, ancho:25, ritmo:40 },
    dice:"Línea alta y presión. Genera más y deja la espalda: cada pelota que " +
         "te ganan es una contra franca." },
  { id:"lavida", n:"Se juega la vida",
    K:{ linea:95, presion:90, ancho:55, ritmo:85 },
    dice:"Todo adelante. Los últimos minutos del que necesita el gol sí o sí, " +
         "con todo lo que eso cuesta atrás." },
];

const MISMO = (a, b) => KNOBS.every(k => (a?.[k.id] || 0) === (b?.[k.id] || 0));

/* Qué planteo describe estas perillas, o null si están movidas a mano. */
export const planteoDe = K => (PLANTEOS.find(p => MISMO(p.K, K)) || {}).id || null;
export const planteo = id => (PLANTEOS.find(p => p.id === id) || {}).K;

/* Cuando hay un expulsado, el que se quedó con uno menos suele meterse
   atrás. Esto lo SUGIERE; no lo aplica solo. Cambiarle el planteo a alguien
   sin que lo pida es decidir por él en su propio juego.                   */
export function planteoSugerido({ conUnoMenos, ganando }){
  if(!conUnoMenos) return null;
  return ganando ? "atras" : "contra";
}

export function tacticas(k){
  let mine=1, theirs=1, theirsFlat=0; const notas=[];
  const lin=k.linea/100;
  mine *= 1+0.13*lin; theirs *= 1+0.20*lin;
  if(lin> .35) notas.push("Con la línea alta generás más, pero le dejás la espalda al rival.");
  if(lin<-.35) notas.push("Con la línea baja te exponés menos, pero también creás menos.");

  const pre=k.presion/100;
  mine *= 1+0.14*pre;
  if(pre>0){ theirsFlat += 0.26*pre;
    if(pre>.35) notas.push("Presionando alto le cortás la salida, pero cada pelota que te ganan es una contra franca.");
  } else { theirs *= 1+0.12*pre;
    if(pre<-.35) notas.push("Replegado le cedés el balón: te llegan menos, pero vos también llegás menos.");
  }

  const rit=k.ritmo/100;
  mine *= 1+0.11*rit; theirs *= 1+0.11*rit;
  if(rit> .35) notas.push("Ritmo alto: partido de ida y vuelta, más goles de los dos lados.");
  if(rit<-.35) notas.push("Ritmo controlado: partido cerrado, pocos goles.");

  return { mine, theirs, theirsFlat, notas, ancho:k.ancho/100 };
}

export function bonusAncho(xi, anchoVal){
  const lat = xi.filter(p=>p&&p.slotCat==="D").slice(1,-1);
  const ext = xi.filter(p=>p&&p.slotCat==="F");
  const afuera = [...lat,...ext].map(p=>fuerza(p).v);
  const med = xi.filter(p=>p&&p.slotCat==="M").map(p=>fuerza(p).v);
  const prom = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : LIGA.media;
  const dif = (prom(afuera)-prom(med))*anchoVal;
  return 1 + Math.max(-.12, Math.min(.12, dif*0.10));
}

export function xgDe(A,B,esLocal,mult,anchoA){
  const base = esLocal ? LIGA.local : LIGA.visita;
  /* z = diferencia de rating en desvíos, topada: en el fútbol real ni el
     mejor equipo contra el peor pasa de ~3 goles esperados.               */
  const z = Math.max(-2.2, Math.min(2.2, (A.ATA-B.DEF)/0.62));
  return Math.max(.18, Math.min(3.4, base*Math.exp(0.30*z)*mult*anchoA));
}

/* ── EL AZAR CON SEMILLA ─────────────────────────────────────────────────
   Un tester grabó un video: apretaba "Simular" doce veces seguidas sin tocar
   nada y el marcador grande salía 4-4, 1-1, 0-3, 4-1, 0-0... Los porcentajes
   casi no se movían -eso ES el modelo- pero el número grande cambiaba cada
   vez, y el número grande es lo que se mira. Conclusión del que mira: "es un
   dado". Justo lo que la portada promete que no es.

   Dos arreglos, y este es el primero: las 6.000 simulaciones se sortean con
   un generador CON SEMILLA, y la semilla sale de los datos de entrada -el
   once, la formacion, las perillas, las indicaciones, el partido-. Mismos
   datos, misma semilla, mismo resultado, hasta el ultimo decimal. Cambias
   una perilla y cambia. Es lo que convierte "simular" en una cuenta que se
   puede repetir, en vez de una tirada.

   El partido que se MIRA sigue siendo al azar a proposito: es uno de los
   6.000, y ver otro distinto con las mismas probabilidades es exactamente lo
   que significa "uno de los 6.000". El segundo arreglo esta en la pantalla:
   en el modo sin animacion el numero grande es el marcador MAS PROBABLE, que
   es el que no se mueve, y no una realizacion suelta.

   mulberry32: chico, rapido y suficiente para esto. No es criptografia. */
export function azarDe(semilla){
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* De un texto -la firma de los ajustes- a un entero. FNV-1a de 32 bits. */
export function semillaDe(texto){
  let h = 0x811C9DC5;
  for(let i = 0; i < texto.length; i++){ h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const poissonUno = (l, rnd = Math.random) => { const L=Math.exp(-l); let k=0,p=1;
  do { k++; p*=rnd(); } while(p>L); return k-1; };
const poisson = poissonUno;

export function simular(xgA, xgB, n=6000, rnd=Math.random){
  let w=0,d=0,l=0; const marc={};
  for(let i=0;i<n;i++){
    const a=poisson(xgA, rnd), b=poisson(xgB, rnd);
    if(a>b)w++; else if(a===b)d++; else l++;
    const k=a+"-"+b; marc[k]=(marc[k]||0)+1;
  }
  const top=Object.entries(marc).sort((x,y)=>y[1]-x[1])[0];
  return { win:w/n*100, draw:d/n*100, loss:l/n*100,
           marcador:top[0], probMarcador:top[1]/n*100, xgA, xgB };
}

/* Re-simulación condicionada por expulsión: el equipo con uno menos pierde
   ataque y concede más, pero solo por el tiempo que quedaba por jugar.    */
export function simExpulsion(xgA, xgB, rojas){
  let a=xgA, b=xgB;
  rojas.forEach(r=>{
    const resto=Math.max(0,(90-r.min))/90, jugado=1-resto;
    if(r.esMio){ a=a*(jugado+resto*0.68); b=b*(jugado+resto*1.42); }
    else       { b=b*(jugado+resto*0.68); a=a*(jugado+resto*1.42); }
  });
  return simular(a,b);
}

/* ─── SIMULAR DESDE UN PARTIDO EMPEZADO ───────────────────────────────────
   Elegís el minuto, cómo va y qué pasó, y se simula LO QUE FALTA. Después se
   le suman los goles que ya están.

   La cuenta es honesta y chiquita: el gol esperado de noventa minutos se
   reparte proporcional al tiempo, así que a los 60' queda un tercio. Las
   expulsiones se aplican solo sobre ese resto, con los mismos números que ya
   usaba `simExpulsion` — el que queda con diez ataca un 32% menos y concede
   un 42% más.

   OJO CON CÓMO SE CUENTA ESTO. Durante un rato acá decía "no ajusta por cómo
   va el partido". Está mal dicho y confunde: el `xgA`/`xgB` que llega a esta
   función YA trae las perillas y las indicaciones, así que si vas ganando
   con uno menos y te parás atrás, la cuenta lo toma. El modelo no ADIVINA el
   planteo; lo pone el que juega, que es justamente la gracia.

   Los dos límites de verdad son otros:

   1. LAS PERILLAS SON DE UN SOLO EQUIPO. No hay forma de plantear al rival:
      si el que se mete atrás con diez es él, eso no se puede expresar. Lo
      único que se le aplica es el promedio de abajo.

   2. `ROJA` ES UN PROMEDIO Y YA TRAE ADENTRO EL REPLIEGUE. Ese 0,68 / 1,42
      se midió sobre equipos con uno menos, y el equipo promedio con uno
      menos ya se para atrás. Así que si además ponés bloque bajo a mano,
      una parte se cuenta dos veces. Es chico y es hacia el lado
      conservador, pero conviene saberlo antes de calibrarlo.             */
export const ROJA = { ataca: 0.68, concede: 1.42 };

export function simDesde({ xgA, xgB, minuto = 0, golesA = 0, golesB = 0,
                           rojasA = 0, rojasB = 0, n = 6000, rnd = Math.random }){
  const min = Math.max(0, Math.min(90, Math.round(minuto)));
  const resto = (90 - min) / 90;
  let a = xgA * resto, b = xgB * resto;

  /* Cada expulsión pesa por el tiempo que le queda de vigencia, que es
     justamente el resto. */
  for(let i = 0; i < rojasA; i++){ a *= ROJA.ataca; b *= ROJA.concede; }
  for(let i = 0; i < rojasB; i++){ b *= ROJA.ataca; a *= ROJA.concede; }

  let w = 0, d = 0, l = 0; const marc = {};
  for(let i = 0; i < n; i++){
    const ga = golesA + poissonUno(a, rnd), gb = golesB + poissonUno(b, rnd);
    if(ga > gb) w++; else if(ga === gb) d++; else l++;
    const k = ga + "-" + gb; marc[k] = (marc[k] || 0) + 1;
  }
  const top = Object.entries(marc).sort((x,y)=>y[1]-x[1])[0];
  return { win:w/n*100, draw:d/n*100, loss:l/n*100,
           marcador:top[0], probMarcador:top[1]/n*100,
           xgA:a, xgB:b, desde:{ minuto:min, golesA, golesB, rojasA, rojasB } };
}

/* Arma el once más fuerte disponible respetando la formación. */
export function autoXI(pool, form){
  /* Antes esto llenaba puesto por puesto con el mejor "nivel menos castigo".
     Suena razonable y sale mal: el castigo por jugar de volante siendo
     delantero es 0.15, y la diferencia de nivel entre dos jugadores es
     tranquilamente 1.0. Así que el mejor delantero terminaba de volante, y
     cuando le tocaba el turno a la delantera ya no quedaba ninguno. El once
     salía entero fuera de puesto.

     Los castigos no se tocan: pasaron el backtest y son del MODELO. Lo que
     estaba mal era esta función, que es comodidad de pantalla: el puesto no
     es una preferencia con precio, es una restricción. Primero cada uno en
     el suyo; recién después, si falta gente, se improvisa.                */
  const slots = slotsDe(form).flatMap(l => Array.from({length:l.n}, () => l.cat));
  const xi = new Array(slots.length).fill(null);
  const usados = new Set();
  const libres = () => pool.filter(p => !usados.has(p.id));

  /* El orden lo decide la escasez, no el dibujo. Si hay un solo arquero y
     seis volantes para tres lugares, el arquero se reparte primero.      */
  const demanda = {}; slots.forEach(c => demanda[c] = (demanda[c] || 0) + 1);
  const oferta  = {}; pool.forEach(p => oferta[p.pos] = (oferta[p.pos] || 0) + 1);
  const orden = [...new Set(slots)]
    .sort((a, b) => (oferta[a] || 0) / demanda[a] - (oferta[b] || 0) / demanda[b]);

  for (const cat of orden)
    slots.forEach((c, i) => {
      if (c !== cat || xi[i]) return;
      /* Entre los del puesto, primero los que vienen jugando. Al plantel se
         le suman los que no sumaron minutos —para que estén en la lista y se
         puedan elegir a mano— pero de esos no sabemos nada, así que no
         pueden entrar de arranque por delante de uno que sí jugó.       */
      const cand = libres().filter(p => p.pos === cat)
        .sort((a, b) => (b.mins > 0) - (a.mins > 0) || fuerza(b).v - fuerza(a).v)[0];
      if (cand) { usados.add(cand.id); xi[i] = { ...cand, slotCat: cat }; }
    });

  /* Lo que quedó vacío se improvisa, y ahí sí paga el castigo. */
  slots.forEach((c, i) => {
    if (xi[i]) return;
    const cand = libres().map(p => ({ p, v: fuerza(p).v - penalPuesto(p.pos, c) }))
      .sort((a, b) => b.v - a.v)[0];
    if (cand) { usados.add(cand.p.id); xi[i] = { ...cand.p, slotCat: c }; }
  });
  return xi;
}
