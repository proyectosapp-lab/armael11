/* ══════════════════════════════════════════════════════════════════════════
   FRESCURA — decide qué pasos vale la pena volver a correr.

   POR QUÉ EXISTE. El 31 de agosto de 2026 nos comimos los 7.500 pedidos
   diarios de la API en una tarde. No fue por usuarios: fue por publicar.
   Cada corrida baja TODO de nuevo —las seis ligas, los treinta clubes, la
   tabla— y eso son unos 1.200 pedidos. El workflow corre cada tres horas y
   además en cada push, así que seis versiones publicadas en una tarde más
   las ocho del reloj dieron catorce corridas: dieciséis mil pedidos.

   La solución no es publicar menos. Es no volver a bajar lo que ya bajamos
   hace un rato.

   ─── CÓMO FUNCIONA, Y POR QUÉ ASÍ ────────────────────────────────────────

   Cada paso deja un sello con la hora en que terminó bien. Antes de correr
   se mira el sello: si lo de la última vez todavía sirve, se saltea.

   Los sellos viven en un archivo que GitHub Actions guarda entre corridas
   (ver el bloque `cache` del workflow). Sin ese cache esto no serviría de
   nada: cada corrida arranca de cero y los sellos estarían siempre vacíos.

   ─── LA REGLA QUE HACE QUE ESTO SEA SEGURO ───────────────────────────────

   UN PASO SOLO SE SALTEA SI LO QUE PRODUJO SIGUE ESTANDO. El sello dice
   "esto se bajó hace dos horas"; si el archivo no está, el sello miente y
   hay que bajar igual. Sin esa condición, un cache a medias publicaría un
   sitio sin los datos del juego y la app le pediría la API key al usuario
   — que es exactamente el síntoma que nos hizo encontrar todo esto.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

/* Cada cuántas HORAS tiene sentido rehacer cada cosa. No son números
   caprichosos: son la velocidad a la que cambia el dato de verdad.

     ligas    El calendario de la próxima fecha de seis ligas y los ratings
              de sus jugadores. Cambia una vez por semana. Es además el paso
              más caro de todos —unos 800 pedidos—, así que es el que más
              rinde espaciar.
     juego    El próximo partido de cada club y los planteles. Cambia cuando
              se juega una fecha.
     tabla    Las posiciones. Cambian cuando termina un partido.
     fantasy  La próxima fecha del fantasy. Es barata y es lo que más
              molesta si falta: sin fecha no hay pestaña.
     puntos   Puntúa la fecha ya jugada. Barata, y una fecha sin puntuar se
              puntúa en la corrida siguiente sin que nadie se entere. */
export const CADA_HORAS = {
  ligas: 24,
  juego: 6,
  tabla: 6,
  fantasy: 3,
  puntos: 6,
};

/* ─── LA DECISIÓN, PURA Y PROBABLE ───────────────────────────────────────
   Sin fecha, sin archivos, sin nada: recibe los datos y contesta. Así se
   puede probar cada caso con un número en vez de esperar seis horas.     */
export function hayQueCorrer({ sello, ahora, cada, hayResultado, forzar = false }) {
  if (forzar) return { correr: true, porque: "pediste traer todo" };
  if (!hayResultado) return { correr: true, porque: "no está lo que produce" };
  if (!sello) return { correr: true, porque: "nunca corrió" };
  const horas = (ahora - sello) / 36e5;
  if (!isFinite(horas) || horas < 0) return { correr: true, porque: "el sello no se entiende" };
  if (horas >= cada) return { correr: true, porque: "lo de hace " + horas.toFixed(1) + " h ya venció" };
  return { correr: false,
           porque: "lo de hace " + horas.toFixed(1) + " h todavía sirve (se rehace cada " + cada + " h)" };
}

/* ─── LOS SELLOS EN DISCO ────────────────────────────────────────────────
   Un JSON chiquito. Si no se puede leer, se arranca vacío y se baja todo:
   fallar hacia bajar de más es caro; fallar hacia no bajar publica un sitio
   incompleto, que es peor.                                              */
export function leerSellos(archivo) {
  try { return JSON.parse(readFileSync(archivo, "utf8")); } catch (e) { return {}; }
}

export function sellar(archivo, sellos, clave, cuando = Date.now()) {
  sellos[clave] = cuando;
  try { writeFileSync(archivo, JSON.stringify(sellos, null, 1)); } catch (e) {}
  return sellos;
}

/* "¿Está lo que ese paso produce?" Alcanza con que exista UNO de los
   archivos que la lista nombra: si ligas-api publicó seis ligas y quedó
   una, algo se rompió, pero el selector va a andar y el próximo vencimiento
   lo arregla. */
export const hayAlguno = rutas => rutas.some(r => existsSync(r));
