/* ══════════════════════════════════════════════════════════════════════════
   PIPELINE — de ítems sueltos a feed rankeado
   ──────────────────────────────────────────────────────────────────────────
   Acá no hay red. Entra un array de ítems crudos, sale el feed.
   Eso es a propósito: se puede probar entero, sin internet y sin esperar,
   contra datos reales guardados. La red vive en traer.mjs.

   Cuatro pasos:
     1. normalizar    todo a la misma forma
     2. desambiguar   ¿este ítem es de MI equipo?
     3. agrupar       la misma noticia contada por varias fuentes = un clúster
     4. rankear       qué va arriba
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── texto ──────────────────────────────────────────────────────────────── */

export const plano = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")   // saca acentos
  .toLowerCase()
  .replace(/[^a-z0-9ñ\s]/g, " ")
  .replace(/\s+/g, " ").trim();

/* Palabras que no distinguen nada. No hace falta que la lista sea exhaustiva:
   el filtro por frecuencia de más abajo se come el resto solo.              */
const VACIAS = new Set(("de la el los las un una y o que en con por para al del " +
  "se su sus lo le les es son fue era ante tras sobre como mas pero si no ya " +
  "este esta esto ese esa aquel dos tres cuatro cinco hoy ayer manana dia " +
  "anos ano hora horas vez veces todo toda todos todas otro otra sin desde " +
  "hasta entre cuando donde quien cual porque muy tambien solo asi").split(" "));

export const tokens = s => plano(s).split(" ")
  .filter(t => t.length >= 3 && !VACIAS.has(t));

/* ─── 1. normalizar ──────────────────────────────────────────────────────── */

let contador = 0;
export function normalizar(crudo, fuente) {
  const fecha = crudo.fecha ? new Date(crudo.fecha) : null;
  return {
    id: crudo.url || ("sin-url-" + (++contador)),
    titulo: (crudo.titulo || "").trim(),
    url: crudo.url || null,
    resumen: (crudo.resumen || "").trim(),
    fecha: fecha && !isNaN(fecha) ? fecha.toISOString() : null,
    ts: fecha && !isNaN(fecha) ? fecha.getTime() : 0,
    videoId: crudo.videoId || null,
    media: crudo.media || null,
    categorias: crudo.categorias || [],
    seccion: seccionDe(crudo.categorias || [], (crudo.titulo || "") + " " + (crudo.resumen || "")),
    competencia: competenciaDe(crudo.categorias || [], (crudo.titulo || "") + " " + (crudo.resumen || "")),
    tipo: crudo.videoId || crudo.media?.esVideo ? "video" : "nota",
    fuente: fuente.nom,
    fuenteTipo: fuente.tipo || "medio",
    fuenteFiltro: fuente.filtro || "texto",
    fuenteContexto: fuente.contexto || "general",
    fuenteAlcance: fuente.alcance || null,
    peso: fuente.peso ?? 0.5,
  };
}

/* ── LAS ETIQUETAS DEL MEDIO ────────────────────────────────────────────────
   El club ya clasificó cada nota y yo lo estaba tirando. Pero el primer
   intento —una lista de expresiones y gana la primera que matchea— falló
   en 3 de 10, y el motivo es interesante: NO ES UNA SOLA DIMENSIÓN.

   Una nota tiene un EQUIPO (primera, femenino, reserva) y una COMPETENCIA
   (liga, copa), y además puede no ser de fútbol en absoluto. Mezclar todo
   en una lista hace que una etiqueta suelta secuestre la clasificación:
   "Nuevos valores de cuota social" caía en femenino porque entre sus tags
   estaba "Piratas", que es el apodo del club entero y no el del equipo
   femenino. Y "Fiesta de Piratitas" caía en reserva por la etiqueta
   "infantil", que ahí quiere decir chicos, no inferiores.

   Entonces: primero se pregunta si la nota es de un partido —si trae alguna
   etiqueta de competencia—; si no lo es, es institucional. Y recién después
   se decide de qué equipo, donde femenino y reserva pisan a primera.       */
const ETIQ = {
  competencia: /liga profesional|primera divisi|copa argentina|libertadores|sudamericana|torneo proyecci|lpf\b|afa\b|clausura|apertura/i,
  femenino:    /femenin|las piratas|las matadoras/i,
  reserva:     /reserva|proyecci[oó]n|juvenil|cantera|inferiores|sub ?\d/i,
  copa:        /copa argentina|libertadores|sudamericana/i,
};
/* ── CUANDO NO HAY ETIQUETAS ────────────────────────────────────────────────
   Los feeds de YouTube no traen categorías, y desde que entraron los canales
   oficiales son más de treinta fuentes así. Un club sube muchísimo juvenil,
   femenino y futsal por ahí: el canal de Central Córdoba encabezaba su feed
   con la 4ª, la 5ª y la 6ª división del mismo partido. Sin etiquetas todo eso
   caía junto en institucional y tapaba a la primera.

   Así que si no hay etiquetas se mira el texto. Con cuidado en dos puntos:
   "División" sola NO es reserva —"Primera División" es lo contrario—, y
   "Piratas" es el club entero mientras que "las Piratas" es el femenino.   */
const TXT = {
  femenino:    /\bfemenin|las matadoras|las piratas|\blobas\b|\bchicas\b/i,
  reserva:     /juvenil|reserva|proyecci[oó]n|formativas|inferiores|cantera|\bsub[ -]?\d|\b[2-9]\s*[ª°]?\s*divisi[oó]n|(cuarta|quinta|sexta|septima|s[eé]ptima)\s+divisi[oó]n/i,
  otros:       /futsal|hockey|b[aá]squet|v[oó]ley|handball|nataci[oó]n|rugby|e ?sports/i,
  competencia: /torneo clausura|torneo apertura|liga profesional|copa argentina|libertadores|sudamericana|\bfecha \d|resumen del partido|conferencia de prensa|\blpf\b/i,
};

export function seccionDe(cats, texto = ""){
  const tags = cats || [];
  const alguno = re => tags.some(t => re.test(t));

  if(tags.length){
    if(!alguno(ETIQ.competencia) && !alguno(ETIQ.femenino) && !alguno(ETIQ.reserva))
      return "institucional";
    if(alguno(ETIQ.femenino)) return "femenino";
    if(alguno(ETIQ.reserva))  return "reserva";
    return "primera";
  }

  if(TXT.otros.test(texto))    return "institucional";   // no es fútbol de este equipo
  if(TXT.femenino.test(texto)) return "femenino";
  if(TXT.reserva.test(texto))  return "reserva";
  /* Sin señal de partido tampoco podemos afirmar que sea de primera: en la
     duda queda institucional, que es donde estaba antes.                  */
  return TXT.competencia.test(texto) ? "primera" : "institucional";
}

export const competenciaDe = (cats, texto = "") =>
  ((cats || []).some(t => ETIQ.copa.test(t)) || (!cats?.length && ETIQ.copa.test(texto)))
    ? "copa" : "liga";

/* ─── 2. desambiguar ─────────────────────────────────────────────────────────
   La regla de oro, que ya habíamos escrito y que los datos confirmaron:
   LA DESAMBIGUACIÓN PRINCIPAL ES LA FUENTE, NO EL TEXTO.

   Y un hallazgo nuevo, que salió de mirar los ítems de verdad:
   el CONTEXTO de la fuente cambia cuánto pesa una señal débil.
   En un feed que es solo de deportes, "Talleres" prácticamente nunca es un
   taller mecánico. La única ambigüedad que sobrevive es club contra club,
   y para eso están los bloqueadores. En un feed general (El Doce publica
   policiales, horóscopos y cuarteto en el mismo caño) la señal débil sola
   no alcanza y hace falta un corroborador.                                   */

/* Buscar por substring es una trampa con las señales cortas: "la t" aparece
   dentro de "la temporada". Va con límite de palabra, siempre.              */
const cache = new Map();
const rx = frase => {
  if (!cache.has(frase))
    cache.set(frase, new RegExp("\\b" + plano(frase).replace(/\s+/g, "\\s+") + "\\b"));
  return cache.get(frase);
};

export function desambiguar(item, D) {
  if (item.fuenteFiltro === "ninguno")
    return { entra: true, confianza: 1.0, motivo: "fuente monotemática" };

  /* filtro "titulo": el canal titula siempre nombrando al equipo, así que
     alcanza con mirar el título. Mirar el cuerpo solo agregaría falsos
     positivos (menciones de pasada a otros clubes).                        */
  const ambito = item.fuenteFiltro === "titulo"
    ? item.titulo
    : item.titulo + " " + item.resumen + " " + (item.url || "");
  const txt = plano(ambito);
  const hay = frase => rx(frase).test(txt);

  /* La señal fuerte va ANTES que el bloqueador: "Talleres de Córdoba visita
     a Tigre" tiene un bloqueador adentro y aun así es nuestro equipo.       */
  const fuerte = (D.fuertes || []).find(hay);
  if (fuerte) return { entra: true, confianza: 1.0, motivo: "señal fuerte: " + fuerte };

  const bloq = (D.bloqueadores || []).find(hay);
  if (bloq) return { entra: false, motivo: "bloqueador: " + bloq };

  const debil = (D.debiles || []).find(hay);
  if (!debil) return { entra: false, motivo: "no nombra al equipo" };

  if (item.fuenteContexto === "deportes")
    return { entra: true, confianza: 0.8,
             motivo: "señal débil (" + debil + ") en fuente deportiva" };

  const corro = (D.corroboradores || []).find(hay);
  if (corro) return { entra: true, confianza: 0.7,
                      motivo: "débil (" + debil + ") + corroborador (" + corro + ")" };

  return { entra: false, motivo: "señal débil sola en fuente general: " + debil };
}

/* ─── 3. agrupar ─────────────────────────────────────────────────────────────
   "La redundancia es señal, no ruido": si tres fuentes independientes cuentan
   lo mismo en pocas horas, ESO es la noticia. No se deduplica tirando: se
   agrupa y el grupo sube.

   Para comparar dos títulos no sirve contar palabras iguales, porque
   "Talleres" aparece en todos. Entonces primero se tiran las palabras
   FRECUENTES del propio lote: si una palabra sale en más de un cuarto de los
   ítems, no distingue nada. Es un IDF de pobre, en cuatro líneas, y funciona:
   "talleres" se descarta solo y quedan "sforza", "catalan", "sampaoli".     */

export function palabrasComunes(items, umbral = 0.25, minimo = 8) {
  /* Con pocos ítems esto no es un IDF, es una guillotina: entre tres títulos
     casi iguales TODA palabra compartida aparece en el 100% y se descarta,
     así que los tres quedan sin nada en común y no se agrupan. Estimar
     frecuencias pide un corpus; abajo de ocho no hay corpus. La lista de
     palabras vacías de arriba sigue haciendo lo suyo igual.              */
  if (items.length < minimo) return new Set();
  const df = new Map();
  items.forEach(it => new Set(tokens(it.titulo + " " + it.resumen))
    .forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  const tope = Math.max(2, items.length * umbral);
  return new Set([...df].filter(([, n]) => n > tope).map(([t]) => t));
}

const solapamiento = (A, B) => {
  if (!A.size || !B.size) return { ov: 0, comunes: [] };
  const comunes = [...A].filter(t => B.has(t));
  return { ov: comunes.length / Math.min(A.size, B.size), comunes };
};

/* El umbral de parecido NO es fijo: baja cuanto más cerca están en el tiempo.
   Dos medios distintos que publican con 37 minutos de diferencia y comparten
   "visitaron" y "CARD" están contando lo mismo, aunque los títulos se parezcan
   poco. Los mismos dos títulos separados por un día ya no prueban nada.
   La cercanía temporal es evidencia, y acá se usa como tal.                 */
export const UMBRAL = [
  { horas: 3,  solape: 0.20 },
  { horas: 12, solape: 0.35 },
  { horas: 24, solape: 0.50 },
];
const umbralPara = h => UMBRAL.find(u => h <= u.horas)?.solape ?? Infinity;

export function agrupar(items, opc = {}) {
  const { minComunes = 2 } = opc;
  const comunes = palabrasComunes(items);
  const raros = items.map(it =>
    new Set(tokens(it.titulo + " " + it.resumen).filter(t => !comunes.has(t))));

  const de = items.map((_, i) => i);                 // union-find sin ceremonia
  const raiz = i => de[i] === i ? i : (de[i] = raiz(de[i]));

  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const horas = Math.abs(items[i].ts - items[j].ts) / 36e5;
      const { ov, comunes: c } = solapamiento(raros[i], raros[j]);
      if (c.length < minComunes) continue;

      /* Un medio no se corrobora a sí mismo: dos notas del mismo lugar no
         son dos fuentes. Pero sí puede repetirse casi textual, y entonces
         hay que juntarlas igual. El canal de Central Córdoba subió el mismo
         partido de juveniles en seis videos —4ª, 5ª, 6ª división— y los seis
         encabezaban el feed. No inflan nada: nFuentes cuenta nombres únicos,
         así que un grupo de una sola fuente sigue valiendo por una.
         El umbral es mucho más alto (0.75) y la ventana mucho más corta. */
      const mismoMedio = items[i].fuente === items[j].fuente;
      const pasa = mismoMedio ? (ov >= 0.75 && horas <= 6)
                              : (ov >= umbralPara(horas));
      if (pasa) de[raiz(i)] = raiz(j);
    }

  const porRaiz = new Map();
  items.forEach((it, i) => {
    const r = raiz(i);
    if (!porRaiz.has(r)) porRaiz.set(r, []);
    porRaiz.get(r).push(it);
  });

  return [...porRaiz.values()].map(grupo => {
    /* Quién representa al grupo. Si el club y un medio nacional contaron lo
       mismo, muestra el del club: es el que escribió para este hincha.   */
    const cerca = { propio: 2, ciudad: 1 };
    grupo.sort((a, b) => (cerca[b.fuenteAlcance] ?? 0) - (cerca[a.fuenteAlcance] ?? 0)
                      || b.peso - a.peso || b.ts - a.ts);
    const fuentes = [...new Set(grupo.map(g => g.fuente))];
    return {
      principal: grupo[0],
      tambien: grupo.slice(1),
      fuentes,
      nFuentes: fuentes.length,
      ts: Math.max(...grupo.map(g => g.ts)),
    };
  });
}

/* ─── 4. rankear ─────────────────────────────────────────────────────────────
   score = peso de la fuente × frescura × multiplicador del clúster
   La frescura cae a la mitad cada 18 horas: al día y medio una nota vale
   un cuarto de lo que valía. En fútbol eso es más o menos la vida útil real
   de una noticia que no sea un partido.                                     */

export const MULT = { 1: 1.0, 2: 1.2, 3: 1.5 };        // 4 o más -> 2.0

/* Una nota escrita PARA este club vale más que una nacional que lo menciona.
   El feed de Vélez abría con tres notas de ESPN sobre River —los tres decían
   "Vélez", así que entraban bien— mientras el canal del club quedaba abajo.
   Es un empujón chico a propósito: el resumen oficial del partido es
   nacional y tiene que poder ganar igual.                                  */
export const ALCANCE = { propio: 1.15, ciudad: 1.0, nacional: 0.95 };

export function rankear(clusters, ahora = Date.now()) {
  return clusters.map(c => {
    const horas = Math.max(0, (ahora - c.ts) / 36e5);
    const frescura = Math.pow(0.5, horas / 18);
    const mult = MULT[c.nFuentes] ?? 2.0;
    const cerca = ALCANCE[c.principal.fuenteAlcance] ?? 1;
    const score = c.principal.peso * frescura * mult * cerca;
    return { ...c, horas, frescura, mult, cerca, score };
  }).sort((a, b) => b.score - a.score);
}

/* ─── todo junto ─────────────────────────────────────────────────────────── */

export function construirFeed(crudos, pack, opc = {}) {
  const ahora = opc.ahora ?? Date.now();
  const descartados = [];
  const vivos = [];

  for (const { items, fuente } of crudos)
    for (const c of items) {
      const it = normalizar(c, fuente);
      const d = desambiguar(it, pack.desambiguacion);
      if (d.entra) vivos.push({ ...it, confianza: d.confianza, porque: d.motivo });
      else descartados.push({ ...it, porque: d.motivo });
    }

  const clusters = rankear(agrupar(vivos, opc), ahora);
  return {
    equipo: pack.nombre,
    generado: new Date(ahora).toISOString(),
    entraron: vivos.length,
    descartados,
    clusters,
  };
}
