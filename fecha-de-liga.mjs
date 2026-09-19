/* ══════════════════════════════════════════════════════════════════════════
   QUÉ PARTIDOS SON "LA PRÓXIMA FECHA"

   Vive en su propio archivo por una razón: `ligas-api.mjs` no se puede
   importar desde una prueba —arranca solo, y sin la clave de la API se
   apaga con `process.exit`—, así que la regla que estaba adentro se probaba
   copiándola. Una regla copiada en la prueba es una regla que tarde o
   temprano deja de ser la misma que corre de verdad, y esta ya se equivocó
   una vez.

   ─── EL ERROR QUE ARREGLA ────────────────────────────────────────────────
   Antes esto era `.slice(0, 12)` sobre todos los partidos por jugar
   ordenados por fecha, mientras la app decía "la próxima fecha". No es lo
   mismo, y el 19/9/2026 se vio: la Premier mostraba cinco partidos de la
   fecha 5 —los de ese fin de semana que todavía no habían empezado— y siete
   de la fecha 6, que se juega tres semanas después. Uno al lado del otro,
   sin nada que los distinguiera.

   El error de fondo es contar en vez de agrupar. Una fecha de la Premier
   tiene diez partidos y el tope era doce: sobraban dos, y ese sobrante se
   llenaba con la fecha siguiente. A medida que el sábado avanza y los
   partidos arrancan, la fecha en curso se achica y el relleno crece.
   ══════════════════════════════════════════════════════════════════════════ */

export const rondaDe = f => (f && f.league && f.league.round) || "";

/* `proximos` viene ORDENADO POR FECHA y ya filtrado a los que no empezaron.

   `minimo` es el piso por el que se acepta mezclar: el domingo a la noche
   la fecha está casi jugada y quedarían uno o dos partidos. Una lista de un
   partido es peor que una lista que mezcla, siempre que se diga cuál es
   cuál —y la app escribe la fecha de cada partido al lado de la hora—.

   `tope` no elige nada: es el freno de gasto, para que una liga con una
   fecha enorme no se coma la cuota de la API. Quince es la fecha más grande
   de las once ligas, la argentina, con treinta equipos.

   Si la liga no trae ronda —alguna copa, algún torneo raro— todos los
   partidos caen en la misma cadena vacía y esto es el `slice` de antes.
   No es lo ideal, pero es exactamente lo que había: ninguna liga queda peor
   que como estaba. */
export function partidosDeLaFecha(proximos, { minimo = 4, tope = 15 } = {}) {
  const l = proximos || [];
  if (!l.length) return [];
  const laFecha = rondaDe(l[0]);
  let out = l.filter(f => rondaDe(f) === laFecha);
  if (out.length < minimo) {
    const siguiente = rondaDe(l.find(f => rondaDe(f) !== laFecha));
    if (siguiente) out = out.concat(l.filter(f => rondaDe(f) === siguiente));
  }
  return out.slice(0, tope);
}
