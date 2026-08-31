/* ══════════════════════════════════════════════════════════════════════════
   LAS REGLAS DE LAS FASES — quién pasa y cómo se reparten las zonas.

   Está separado de `fases.mjs` por una razón concreta: ese archivo habla
   con la base y no se puede correr en una prueba. Estas dos funciones son
   las que deciden el torneo, no tocan nada, y se pueden probar con casos
   escritos a mano. Si alguna vez discutimos por qué alguien no clasificó,
   la respuesta está en estas treinta líneas.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── QUIÉNES PASAN ──────────────────────────────────────────────────────
   Los `pasan` primeros de cada grupo, Y TODOS LOS QUE EMPATEN con el
   último que entra.

   Los empates no se rompen a propósito. Cualquier desempate que
   inventemos —el mejor puntaje de una fecha, quién se anotó antes, el
   orden alfabético— es una regla arbitraria que le saca el lugar a alguien
   que hizo exactamente los mismos puntos. Que una zona tenga once en vez
   de diez no le molesta a nadie; que a uno lo eliminen por una regla que
   no sabía que existía, sí.                                              */
export function clasifican(grupos, puntosDe, pasan = 1) {
  const salen = [];
  for (const g of grupos) {
    const tabla = (g.gente || [])
      .map(p => ({ perfil: p, puntos: puntosDe(p) }))
      .sort((a, b) => b.puntos - a.puntos);
    if (!tabla.length) continue;
    const corte = tabla[Math.min(Math.max(1, pasan), tabla.length) - 1].puntos;
    for (const t of tabla.filter(t => t.puntos >= corte))
      salen.push({ ...t, viene_de: g.nombre });
  }
  return salen;
}

/* Alguien puede ganar dos grupos distintos: pasa una vez, con el nombre del
   primero. Dos lugares en la misma zona sería jugar contra uno mismo. */
export function sinRepetidos(clasificados) {
  const vistos = new Set();
  return clasificados
    .slice()
    .sort((a, b) => b.puntos - a.puntos)
    .filter(c => !vistos.has(c.perfil) && vistos.add(c.perfil));
}

/* ─── LAS ZONAS ──────────────────────────────────────────────────────────
   En serpentina, no cortando la lista.

   Si se cortara por puntaje, los diez mejores clasificados quedarían todos
   en la zona A: nueve de los diez mejores afuera en la ronda siguiente, y
   la última zona ganada por alguien que hizo la mitad de puntos. La
   serpentina reparte A B C D / D C B A / A B C D y las zonas quedan
   parejas.

   Recibe la lista YA ordenada de mejor a peor.                          */
export function serpentina(ordenados, porZona = 10) {
  const cuantas = Math.max(1, Math.round(ordenados.length / Math.max(2, porZona)));
  const zonas = Array.from({ length: cuantas }, () => []);
  ordenados.forEach((c, i) => {
    const vuelta = Math.floor(i / cuantas), col = i % cuantas;
    zonas[vuelta % 2 === 0 ? col : cuantas - 1 - col].push(c);
  });
  return zonas;
}
