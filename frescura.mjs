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
import { createHash } from "node:crypto";

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

/* ─── LA FIRMA DEL CÓDIGO QUE PRODUJO EL DATO ────────────────────────────
   El 20/9/2026, un sábado, los partidos de las otras diez ligas seguían
   saliendo todos con 4-3-3 y los delanteros mal ubicados. El arreglo estaba
   escrito, probado y subido: `ligas-api.mjs` ya calculaba el dibujo de cada
   equipo y `juego.js` ya traducía "Attacker" a delantero.

   No servía de nada. El sello de `ligas` dura 24 horas, así que el paso se
   salteaba con toda prolijidad y el archivo publicado seguía siendo el que
   había hecho el código VIEJO. Un arreglo subido que no se ve hasta el día
   siguiente es, para el que abre la app, un arreglo que no existe — y para
   el que lo escribió, la peor clase de duda: no sabe si falló el arreglo o
   falló el reloj.

   El sello contestaba "esto se bajó hace poco". La pregunta que faltaba es
   "¿y lo bajó ESTE código?". La firma —un hash de los archivos que hacen el
   paso— la contesta. Si cambió cualquiera de ellos, lo guardado lo hizo otro
   programa y no cuenta como fresco.

   Vale una corrida completa cada vez que se toca uno de esos archivos, y
   solo esa vez. Es exactamente el precio que uno quiere pagar.          */
export function firmaDe(rutas) {
  const h = createHash("sha1");
  for (const r of [...(rutas || [])].sort())
    try { h.update(readFileSync(r)); } catch (e) { h.update("\0falta\0"); }
  return h.digest("hex").slice(0, 12);
}

/* ─── LA DECISIÓN, PURA Y PROBABLE ───────────────────────────────────────
   Sin fecha, sin archivos, sin nada: recibe los datos y contesta. Así se
   puede probar cada caso con un número en vez de esperar seis horas.     */
export function hayQueCorrer({ sello, ahora, cada, hayResultado, forzar = false,
                               firma = null, firmaVieja = null }) {
  if (forzar) return { correr: true, porque: "pediste traer todo" };
  if (!hayResultado) return { correr: true, porque: "no está lo que produce" };
  if (!sello) return { correr: true, porque: "nunca corrió" };
  /* Sin `firmaVieja` la respuesta es "no sé con qué código se hizo", y eso
     se resuelve hacia rehacer: pasa UNA vez, la primera corrida después de
     estrenar esto, y deja el sello con firma para siempre. */
  if (firma && firma !== firmaVieja)
    return { correr: true, porque: "cambió el código que lo produce" };
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

export function sellar(archivo, sellos, clave, cuando = Date.now(), firma = null) {
  sellos[clave] = cuando;
  /* La firma va en el MISMO archivo y con prefijo, y no en un archivo
     aparte: si viajaran separados, un cache a medias dejaría el sello sin su
     firma y todo se reharía cada corrida. */
  if (firma) sellos["firma:" + clave] = firma;
  try { writeFileSync(archivo, JSON.stringify(sellos, null, 1)); } catch (e) {}
  return sellos;
}

/* "¿Está lo que ese paso produce?" Alcanza con que exista UNO de los
   archivos que la lista nombra: si ligas-api publicó seis ligas y quedó
   una, algo se rompió, pero el selector va a andar y el próximo vencimiento
   lo arregla. */
export const hayAlguno = rutas => rutas.some(r => existsSync(r));

/* ── EL ARCHIVO ESTÁ, PERO ADENTRO NO HAY NADA ───────────────────────────
   `hayAlguno` mira que el archivo exista, y eso alcanzó hasta el 16/9/2026:
   ese día la lista de ligas se publicó vacía —se acabó la cuota de la API a
   mitad del paso—, el sello se puso igual, y como el sello dura un día las
   rondas siguientes saltearon el paso con toda prolijidad. La app estuvo
   sin una sola liga para simular hasta que alguien apretó un botón a mano.

   Un sello vale por lo que produjo. Con esto, la lista vacía se reconoce y
   el paso se rehace aunque el sello esté fresco.                        */
export const listaVacia = texto => /LIGAS_DISPONIBLES\s*=\s*\[\s*\]/.test(String(texto || ""));
