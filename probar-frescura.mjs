/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA FRESCURA
     node probar-frescura.mjs

   Lo que decide qué pasos se saltean. Es exactamente el tipo de código que
   falla sin avisar: si se saltea de más, el sitio se publica con datos
   viejos y todo parece normal; si se saltea de menos, volvemos a comernos
   los 7.500 pedidos del día. Ninguna de las dos cosas tira un error.

   Por eso la decisión es una función pura que recibe números: cada caso se
   prueba con un valor en vez de esperar seis horas.
   ══════════════════════════════════════════════════════════════════════════ */
import { hayQueCorrer, CADA_HORAS, leerSellos, sellar, listaVacia, firmaDe } from "./frescura.mjs";
import { writeFileSync, rmSync, existsSync } from "node:fs";

const casos = [];
const caso = (n, ok, d = "") => casos.push([n, ok, d]);

const AHORA = 1_700_000_000_000;
const haceHoras = h => AHORA - h * 36e5;
const q = o => hayQueCorrer({ ahora: AHORA, hayResultado: true, cada: 6, ...o });

/* ─── LO BÁSICO ──────────────────────────────────────────────────────────── */
caso("lo bajado hace 1 hora no se vuelve a bajar",
     q({ sello: haceHoras(1) }).correr === false);
caso("lo de hace 7 horas sí, porque vence a las 6",
     q({ sello: haceHoras(7) }).correr === true);
caso("justo en el límite se rehace",
     q({ sello: haceHoras(6) }).correr === true);

/* ─── LA REGLA QUE HACE QUE ESTO SEA SEGURO ──────────────────────────────
   El sello dice "se bajó hace dos horas". Si lo que produjo NO está, el
   sello miente y hay que bajar igual. Sin esto, un cache a medias publica
   un sitio sin los datos del juego y la app le pide la API key al usuario
   — que es el síntoma exacto que nos hizo encontrar todo esto. */
{
  const r = q({ sello: haceHoras(1), hayResultado: false });
  caso("si lo que produce NO está, se baja aunque el sello sea de recién",
       r.correr === true, r.porque);
  caso("y lo dice con esas palabras", /no está/.test(r.porque), r.porque);
}

/* ─── LOS CASOS RAROS, QUE SIEMPRE FALLAN HACIA BAJAR ────────────────────
   Fallar hacia bajar de más cuesta pedidos. Fallar hacia no bajar publica
   un sitio incompleto. Entre las dos, siempre la primera.              */
caso("sin sello previo, se baja", q({ sello: null }).correr === true);
caso("un sello del futuro no congela nada",
     q({ sello: AHORA + 36e5 * 5 }).correr === true);
caso("un sello ilegible tampoco",
     q({ sello: NaN }).correr === true);
caso("y 'traer todo' se lleva por delante cualquier sello",
     q({ sello: haceHoras(0.1), forzar: true }).correr === true);

/* ─── LOS NÚMEROS ELEGIDOS ──────────────────────────────────────────────
   No son caprichosos y conviene que estén fijados: son la velocidad a la
   que cambia cada dato, y el paso más caro tiene que ser el más espaciado.
   Si alguien pone `ligas` en 1 hora, volvemos al problema del 31 de agosto
   sin que nada falle. */
caso("las ligas se rehacen una vez por día: es el paso más caro",
     CADA_HORAS.ligas === 24, "cada " + CADA_HORAS.ligas + " h");
caso("y es el MÁS espaciado de todos",
     Object.entries(CADA_HORAS).every(([k, v]) => k === "ligas" || v <= CADA_HORAS.ligas),
     JSON.stringify(CADA_HORAS));
caso("el fantasy es el más seguido: es barato y sin fecha no hay pestaña",
     CADA_HORAS.fantasy === Math.min(...Object.values(CADA_HORAS)),
     "cada " + CADA_HORAS.fantasy + " h");
/* Con el reloj cada 3 horas son 8 corridas por día. Si todo se rehiciera en
   todas, son los ~1.200 pedidos por corrida que nos fundieron. */
{
  const corridasPorDia = 24 / 3;
  const veces = k => Math.min(corridasPorDia, Math.ceil(24 / CADA_HORAS[k]));
  const costo = veces("ligas") * 800 + veces("juego") * 400 +
                veces("tabla") * 60 + veces("fantasy") * 30 + veces("puntos") * 30;
  caso("con estos números, un día entero entra cómodo en la cuota de 7.500",
       costo < 5000, "~" + costo + " pedidos por día");
}

/* ─── LOS SELLOS EN DISCO ────────────────────────────────────────────────── */
{
  const tmp = new URL("./.sellos-prueba.json", import.meta.url);
  try {
    caso("un archivo que no existe se lee como vacío",
         JSON.stringify(leerSellos(tmp)) === "{}");
    writeFileSync(tmp, "esto no es json");
    caso("y uno roto también, en vez de tumbar la corrida",
         JSON.stringify(leerSellos(tmp)) === "{}");
    const s = sellar(tmp, {}, "juego", AHORA);
    caso("sellar guarda y devuelve lo guardado",
         s.juego === AHORA && leerSellos(tmp).juego === AHORA);
  } finally { if (existsSync(tmp)) rmSync(tmp); }
}

/* ─── LA LISTA VACIA NO ES UN TRABAJO HECHO ──────────────────────────────
   16/9/2026: el paso de las ligas publico la lista VACIA porque se acabo la
   cuota de la API, se sello igual, y como el sello dura un dia las rondas
   siguientes lo saltearon. La app quedo sin una sola liga para simular. */
{
  caso("una lista de ligas vacia se reconoce como vacia",
       listaVacia("window.LIGAS_DISPONIBLES=[];") &&
       listaVacia("window.LIGAS_DISPONIBLES = [ ];"));
  caso("y una con ligas adentro, no",
       !listaVacia('window.LIGAS_DISPONIBLES=["argentina","brasil"];'));
  caso("un archivo que no se pudo leer no cuenta como vacio por las dudas",
       !listaVacia(null) && !listaVacia(""));
  caso("con la lista vacia, el paso se rehace aunque el sello este fresco",
       hayQueCorrer({ sello: Date.now() - 36e5, ahora: Date.now(), cada: 24,
                      hayResultado: true }).correr === false &&
       hayQueCorrer({ sello: undefined, ahora: Date.now(), cada: 24,
                      hayResultado: true }).correr === true);
}

/* ── LA FIRMA DEL CÓDIGO ─────────────────────────────────────────────────
   El caso real: el arreglo de los dibujos estaba subido y probado el
   20/9/2026, y los partidos seguían saliendo 4-3-3 porque el sello de
   `ligas` dura un día y el paso se salteaba. El dato era fresco de reloj y
   viejo de código. */
{
  const tmp = new URL("./.probar-firma-" + process.pid, import.meta.url);
  const tmp2 = new URL("./.probar-firma2-" + process.pid, import.meta.url);
  writeFileSync(tmp, "uno");
  writeFileSync(tmp2, "dos");

  const f1 = firmaDe([tmp, tmp2]);
  caso("la firma es estable: los mismos archivos dan la misma firma",
       f1 === firmaDe([tmp, tmp2]));
  caso("y no depende del orden en que se los nombre",
       f1 === firmaDe([tmp2, tmp]));

  writeFileSync(tmp, "uno, con un arreglo");
  const f2 = firmaDe([tmp, tmp2]);
  caso("cambiar UN archivo cambia la firma", f1 !== f2);

  caso("un archivo que falta también cambia la firma",
       firmaDe([tmp, tmp2]) !== firmaDe([tmp, tmp2, new URL("./.no-existe", import.meta.url)]));

  /* El corazón del asunto: sello fresco, resultado en su lugar, y aun así
     hay que rehacerlo porque lo hizo otro programa. */
  const fresco = { sello: haceHoras(1), ahora: AHORA, cada: 24, hayResultado: true };
  caso("sello fresco y misma firma: se saltea",
       hayQueCorrer({ ...fresco, firma: f1, firmaVieja: f1 }).correr === false);
  caso("sello fresco pero OTRA firma: se rehace",
       hayQueCorrer({ ...fresco, firma: f2, firmaVieja: f1 }).correr === true);
  caso("y lo dice con todas las letras",
       hayQueCorrer({ ...fresco, firma: f2, firmaVieja: f1 }).porque ===
       "cambió el código que lo produce");
  caso("sello viejo sin firma guardada: se rehace una vez",
       hayQueCorrer({ ...fresco, firma: f1, firmaVieja: null }).correr === true);
  caso("sin firma en juego, todo sigue como antes",
       hayQueCorrer({ ...fresco }).correr === false);

  /* Que la firma viaje en el mismo archivo que el sello no es un detalle:
     si viajaran separados, un cache a medias reharía todo cada corrida. */
  const arch = new URL("./.probar-sellos-firma-" + process.pid, import.meta.url);
  const s = sellar(arch, {}, "ligas", AHORA, f1);
  caso("sellar guarda la firma al lado del sello",
       s.ligas === AHORA && s["firma:ligas"] === f1);
  caso("y se lee de vuelta del disco",
       leerSellos(arch)["firma:ligas"] === f1);
  caso("sellar sin firma no inventa ninguna",
       sellar(arch, {}, "tabla", AHORA)["firma:tabla"] === undefined);

  [tmp, tmp2, arch].forEach(u => rmSync(u, { force: true }));
}

/* Las listas de `publicar.mjs` tienen que nombrar archivos que existen: una
   ruta mal escrita ahí se firma como "falta", la firma nunca coincide y el
   paso más caro del día se rehace en CADA corrida. Eso son 1.200 pedidos
   cada quince minutos, y la cuota se acaba en una hora. */
{
  const CODIGO_DE = {
    ligas:   ["ligas-api.mjs", "juego.js", "fecha-de-liga.mjs", "ligas.json"],
    juego:   ["datos-juego.mjs", "juego.js", "formaciones.mjs", "clubes.json"],
    tabla:   ["stats-api.mjs"],
    fantasy: ["fantasy-api.mjs", "fantasy.mjs", "fases.mjs", "fases-reglas.mjs"],
    puntos:  ["puntos-api.mjs", "fantasy.mjs"],
  };
  const faltan = [];
  for (const [sello, archivos] of Object.entries(CODIGO_DE))
    for (const a of archivos)
      if (!existsSync(new URL("./" + a, import.meta.url))) faltan.push(sello + " → " + a);
  caso("los archivos que firman cada paso existen todos", !faltan.length, faltan.join(", "));
  caso("los pasos firmados son los que tienen vencimiento",
       Object.keys(CODIGO_DE).every(s => CADA_HORAS[s] > 0));
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n +
  (ok || !d ? "" : "   → " + d)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
