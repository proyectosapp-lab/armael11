/* ══════════════════════════════════════════════════════════════════════════
   LIGAS-API — baja lo que hace falta para simular CUALQUIER partido de las
   ligas de `ligas.json`, y calcula los números propios de cada una.

     node ligas-api.mjs            usa API_FOOTBALL_KEY del entorno
     node ligas-api.mjs TU_KEY

   POR QUÉ NO ALCANZABA CON `datos-juego.mjs`. Ese guarda las respuestas
   crudas de la API, una por club argentino, y sirve para lo que hace: el
   próximo partido de tu club y el último jugado, con la revelación del once
   del DT. Para seis ligas enteras eso serían decenas de megas de JSON crudo
   por un dato que el motor usa en tres líneas.

   Acá se guarda lo COCINADO: por jugador, su promedio de rating y sus
   minutos, que es literalmente todo lo que mira `fuerza()`. Una liga entera
   entra en unas decenas de kilobytes.

   Y se guardan los tres números de la liga —goles de local, de visitante y
   media de rating—, que hasta el 2026-08-29 estaban fijos con forma
   argentina. El documento del backtest ya decía que cada liga corre con sus
   propios promedios; el motor no lo hacía.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { constantesDeLiga, MINIMO_PARTIDOS } from "./juego.js";

import { partidosDeLaFecha } from "./fecha-de-liga.mjs";
import { puestoDe, formacionDeSalida, formacionHabitual } from "./juego.js";

const aca  = p => new URL(p, import.meta.url);
const KEY  = process.env.API_FOOTBALL_KEY || process.argv[2] || "";
const BASE = "https://v3.football.api-sports.io";

const CFG = JSON.parse(readFileSync(aca("./ligas.json")));
const TEMPORADA = +(process.env.TEMPORADA || CFG.temporada || 2026);
/* El techo de partidos que se publican por liga. NO es la forma de elegir
   cuáles —eso lo hace la fecha, más abajo—: es el freno de gasto para que
   una liga rara con una fecha enorme no se coma la cuota de la API.

   Quince porque la fecha más grande de las once ligas es la argentina, con
   treinta equipos, o sea quince partidos. El nombre viejo del ajuste
   —`equiposPorRonda`— se sigue leyendo para no romper un `ligas.json` que
   venga de antes, pero contaba PARTIDOS, no equipos. */
const TOPE_PARTIDOS = CFG.porLiga?.partidosPorFecha || CFG.porLiga?.equiposPorRonda || 15;
const MINIMO_FECHA  = CFG.porLiga?.minimoPorFecha || 4;
const ULTIMOS       = CFG.porLiga?.partidosParaRatings || 5;

const SALIDA = new URL("./sitio/datos/", import.meta.url);
mkdirSync(SALIDA, { recursive: true });

const linea = "═".repeat(70);

/* Sin key no se baja nada, pero tampoco se rompe la corrida: el resto del
   sitio sale igual y el simulador se queda con el club propio. */
if (!KEY) {
  console.log("\n  Sin API_FOOTBALL_KEY: no bajo las ligas para simular.\n");
  process.exit(0);
}

let pedidos = 0, fallos = 0;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const memoria = new Map();

async function api(path, params = {}) {
  const url = path + "?" + new URLSearchParams(params);
  if (memoria.has(url)) return memoria.get(url);
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(BASE + url, { headers: { "x-apisports-key": KEY } });
      pedidos++;
      if (r.status === 429) { await dormir(2000 * i); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length)
        throw new Error(Object.values(j.errors).join(" · "));
      const datos = j.response || [];
      memoria.set(url, datos);
      await dormir(120);
      return datos;
    } catch (e) {
      if (i === 3) { fallos++; console.log("      ✗ " + url + " — " + e.message);
                     memoria.set(url, []); return []; }
      await dormir(800 * i);
    }
  }
}

const JUGADO = f => ["FT", "AET", "PEN"].includes(f?.fixture?.status?.short);
const POR_JUGAR = f => ["NS", "TBD"].includes(f?.fixture?.status?.short);
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

console.log("\n" + linea);
console.log("  LIGAS PARA SIMULAR · temporada " + TEMPORADA);
console.log(linea);

/* ── NO SE BORRA NADA HASTA TENER CON QUÉ REEMPLAZARLO ────────────────────
   Acá decía: borrar todos los `liga-*.js` y después bajar los nuevos. Es
   cómodo y es una bomba. El 16/9/2026 explotó: se sumaron cuatro ligas de
   una, cada una disparó una publicación que bajaba TODO de nuevo, se acabó
   la cuota diaria de la API, y este paso llegó con los archivos ya borrados
   y sin poder bajar uno solo. La app publicó `LIGAS_DISPONIBLES=[]` y se
   quedó sin ninguna liga para simular —incluidas las seis que venían
   andando bien hacía semanas—.

   La regla, que vale para cualquier paso que reemplace algo publicado:
   **primero se consigue lo nuevo, después se tira lo viejo.** Si una liga no
   se pudo bajar esta vuelta, se queda la de la corrida anterior: datos de
   ayer es infinitamente mejor que una app sin simulador. Lo único que se
   borra de entrada es lo que ya no está en ligas.json, que no depende de
   que la API conteste.                                                   */
const SLUGS = CFG.ligas.map(L => L.slug);
for (const f of readdirSync(SALIDA)) {
  /* También los onces del DT que deja la ronda corta: si la liga se va, su
     archivo de formaciones se va con ella. */
  const m = /^(?:liga|onces)-(.*)\.js$/.exec(f);
  if (m && !SLUGS.includes(m[1])) { rmSync(new URL(f, SALIDA)); console.log("  (saco " + f + ", ya no está en ligas.json)"); }
}

const publicadas = [];

for (const L of CFG.ligas) {
  console.log("\n  " + L.nombre + " (" + L.pais + ")");

  /* ─── 1. el calendario ───────────────────────────────────────────────── */
  let fixtures = await api("/fixtures", { league: L.id, season: TEMPORADA });
  let jugados  = fixtures.filter(JUGADO);
  let deQue    = TEMPORADA;

  /* En agosto, una liga europea recién arranca: con cuatro fechas los
     promedios son ruido. Se cae a la temporada anterior SOLO para los
     números de la liga; los partidos por jugar salen de la actual. */
  let paraNumeros = jugados;
  if (paraNumeros.length < MINIMO_PARTIDOS) {
    const viejos = (await api("/fixtures", { league: L.id, season: TEMPORADA - 1 })).filter(JUGADO);
    if (viejos.length > paraNumeros.length) { paraNumeros = viejos; deQue = TEMPORADA - 1; }
  }

  /* ─── 2. el próximo partido de cada equipo ───────────────────────────── */
  /* La fecha entera, no "los doce que vengan". El porqué, largo y con el
     caso real que lo destapó, está en `fecha-de-liga.mjs`. */
  const proximos = fixtures.filter(POR_JUGAR)
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
  const porJugar = partidosDeLaFecha(proximos, { minimo: MINIMO_FECHA, tope: TOPE_PARTIDOS });

  if (!porJugar.length) {
    console.log("    sin partidos por jugar: no la publico");
    continue;
  }

  const equiposIds = [...new Set(porJugar.flatMap(f => [f.teams.home.id, f.teams.away.id]))];

  /* ─── 3. los ratings, de los últimos partidos de cada equipo ─────────── */
  const aBajar = new Set();
  for (const id of equiposIds) {
    const suyos = (jugados.length ? jugados : paraNumeros)
      .filter(f => f.teams.home.id === id || f.teams.away.id === id)
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
      .slice(-ULTIMOS);
    suyos.forEach(f => aBajar.add(f.fixture.id));
  }

  const acum = new Map();                       /* jugador -> {suma, n, mins, equipo} */
  const todosLosRatings = [];
  /* ── EL DIBUJO HABITUAL DE CADA EQUIPO ────────────────────────────────
     Hasta el 20/9 los partidos de las otras diez ligas se simulaban SIEMPRE
     con 4-3-3, porque el archivo de liga no traía el dibujo y la pantalla
     caía en el de respaldo. Es la misma queja que los testers hicieron en
     agosto para los clubes argentinos —"toma todas las formaciones como
     4-3-3, no las adapta al equipo"— y que ahí ya estaba arreglada.

     El dato no cuesta un pedido más: cada `/fixtures/players` que se baja
     para los ratings dice, por jugador, si fue titular y en qué categoría
     jugó. Contar los titulares da el dibujo de ESE partido; la moda de los
     últimos cinco da el habitual. Es exactamente lo que ya hace la página
     de un club, con la misma función. */
  const dibujos = new Map();                    /* equipo -> [formaciones] */
  for (const fid of aBajar) {
    const resp = await api("/fixtures/players", { fixture: fid });
    for (const eq of resp) {
      const tid = eq.team?.id;
      if (tid) {
        const f = formacionDeSalida(resp, tid);
        if (f) dibujos.set(tid, [...(dibujos.get(tid) || []), f]);
      }
      for (const j of (eq.players || [])) {
        const e = (j.statistics || [])[0]; if (!e) continue;
        const r = parseFloat(e.games?.rating), mins = num(e.games?.minutes);
        if (isFinite(r) && r > 0) todosLosRatings.push(r);
        const id = j.player?.id; if (!id) continue;
        const a = acum.get(id) || { suma:0, n:0, mins:0, nombre:j.player?.name || "?",
                                    equipo: eq.team?.id, pos: e.games?.position || "M" };
        if (isFinite(r) && r > 0) { a.suma += r; a.n++; }
        a.mins += mins;
        a.equipo = eq.team?.id || a.equipo;
        acum.set(id, a);
      }
    }
  }


  /* La lista oficial del plantel manda para el PUESTO: sin esto, un lateral
     que tapó un hueco en el medio queda de volante para siempre. */
  const puestoOficial = new Map();
  for (const id of equiposIds)
    for (const g of (await api("/players/squads", { team: id })))
      for (const j of (g.players || []))
        /* `puestoDe` y no la primera letra: `/players/squads` contesta
           "Attacker", cuya inicial es A y la categoría del juego es F.
           Ese bug dejaba a TODOS los delanteros de las otras diez ligas sin
           un puesto válido: `autoXI` no los podía ubicar y salían
           improvisados por toda la cancha. Ver `puestoDe` en juego.js. */
        puestoOficial.set(j.id, puestoDe(j.position));

  /* ─── 4. los números de la liga ──────────────────────────────────────── */
  const K = constantesDeLiga(paraNumeros, todosLosRatings);
  if (K.suficientes) {
    console.log("    " + K.partidos + " partidos de " + deQue + " · " +
      K.local.toFixed(2) + " goles de local, " + K.visita.toFixed(2) + " de visitante" +
      (K.media ? " · rating medio " + K.media.toFixed(2) : " · sin rating medio, uso el respaldo"));
  } else {
    console.log("    solo " + K.partidos + " partidos jugados: uso los números de respaldo");
  }

  /* ─── 5. a guardar, cocinado ─────────────────────────────────────────── */
  const equipos = {};
  for (const f of porJugar)
    for (const t of [f.teams.home, f.teams.away])
      equipos[t.id] = equipos[t.id] || {
        n: t.name, j: [],
        /* `f` es el dibujo habitual, sacado de los últimos partidos. Si no
           alcanzaron los datos queda null y la pantalla usa el de respaldo:
           `formacionHabitual` nunca inventa uno. */
        f: formacionHabitual(dibujos.get(t.id) || []) };

  for (const [id, a] of acum) {
    const e = equipos[a.equipo]; if (!e) continue;
    /* Los dos orígenes pasan por el MISMO traductor. El de los partidos ya
       viene en letra, pero se normaliza igual: una letra rara acá es un
       jugador que no entra en ninguna formación. */
    e.j.push({ i:id, n:a.nombre, p:(puestoOficial.get(id) || puestoDe(a.pos)),
               r: a.n ? Math.round(a.suma / a.n * 100) / 100 : null, m: a.mins });
  }

  const flacos = Object.entries(equipos).filter(([, e]) => e.j.length < 11).map(([, e]) => e.n);
  const salida = {
    id: L.id, slug: L.slug, nombre: L.nombre, pais: L.pais, propia: !!L.propia,
    /* La zona ordena el selector, y la ventaja medida en el backtest es lo
       que la app le dice al usuario sobre ESTA liga. Viajan con la liga para
       que la pantalla no tenga que conocer ninguna tabla aparte. */
    zona: L.zona || "", ventajaBacktest: L.ventajaBacktest ?? null,
    temporada: TEMPORADA,
    media:  K.media  ?? null,
    local:  K.suficientes ? K.local  : null,
    visita: K.suficientes ? K.visita : null,
    calibrada: K.suficientes ? { partidos: K.partidos, temporada: deQue } : null,
    equipos,
    partidos: porJugar.map(f => ({
      id: f.fixture.id, fecha: f.fixture.date, ronda: f.league?.round || "",
      local: f.teams.home.id, visita: f.teams.away.id,
    })),
    generado: new Date().toISOString(),
  };

  writeFileSync(new URL("liga-" + L.slug + ".js", SALIDA),
    "window.LIGAS=window.LIGAS||{};window.LIGAS[" + JSON.stringify(L.slug) + "]=" +
    JSON.stringify(salida) + ";\n");
  publicadas.push(L.slug);
  console.log("    ✓ " + Object.keys(equipos).length + " equipos · " + acum.size +
    " jugadores · " + porJugar.length + " partidos" +
    (flacos.length ? "  ⚠ con menos de 11: " + flacos.join(", ") : ""));
}

/* La lista que ve la app son las ligas de ligas.json QUE TIENEN ARCHIVO,
   bajado recién o de una corrida anterior. Así el selector nunca ofrece una
   liga sin datos ni pierde una que ya andaba. */
const conArchivo = SLUGS.filter(s => existsSync(new URL("liga-" + s + ".js", SALIDA)));
writeFileSync(new URL("ligas.js", SALIDA),
  "window.LIGAS_DISPONIBLES=" + JSON.stringify(conArchivo) + ";\n");

const viejas = conArchivo.filter(s => !publicadas.includes(s));
console.log("\n" + "─".repeat(70));
console.log("  " + conArchivo.length + " liga(s) en la app · " + publicadas.length +
            " bajada(s) esta vuelta · " + pedidos + " pedidos a la API · " + fallos + " fallaron");
if (viejas.length)
  console.log("  ⚠ con los datos de la corrida anterior: " + viejas.join(", "));
console.log("─".repeat(70) + "\n");

/* Cero ligas es catástrofe, no "no había nada nuevo": se corta con error
   para NO sellar el paso, y la próxima ronda lo vuelve a intentar en vez de
   esperar un día entero con el simulador vacío. */
if (!conArchivo.length) {
  console.log("  ✗ Ninguna liga quedó publicada. No sello este paso: se reintenta.\n");
  process.exit(1);
}
