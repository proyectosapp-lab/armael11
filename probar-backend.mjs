/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL ESQUEMA
     node probar-backend.mjs
   No toca la red ni la base: lee `supabase/esquema.sql` y verifica que las
   garantías del juego limpio sigan escritas ahí.

   Esto NO prueba que Postgres acepte el archivo —para eso hace falta una
   base— y no pretende hacerlo. Prueba otra cosa, que es la que se rompe en
   la práctica: que alguien, arreglando algo, no afloje sin querer la regla
   de que los puntos los escribe el servidor o la del cierre. Una política
   borrada no da error en ningún lado: simplemente deja pasar.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

const SQL = readFileSync(new URL("./supabase/esquema.sql", import.meta.url), "utf8");
const casos = [];
const caso = (nom, ok, detalle = "") => casos.push([nom, ok, detalle]);

/* Todo lo que sea una tabla nuestra tiene que tener el candado puesto. Sin
   RLS, una política es un cartel: está escrita y no la lee nadie.        */
const TABLAS = ["perfil", "fechas", "equipo", "puntaje", "liga", "liga_miembro"];
for (const t of TABLAS)
  caso("la tabla " + t + " tiene RLS encendido",
       new RegExp("alter table " + t + " enable row level security", "i").test(SQL));

/* Las políticas de una tabla, como texto, para poder preguntarles cosas. */
const politicasDe = tabla => [...SQL.matchAll(/create policy[\s\S]*?;/gi)]
  .map(m => m[0]).filter(p => new RegExp("\\bon " + tabla + "\\b", "i").test(p));

/* ── LA REGLA ────────────────────────────────────────────────────────────
   El teléfono escribe el equipo, y solo antes del cierre. Los puntos los
   escribe el servidor.                                                   */
{
  const p = politicasDe("puntaje");
  caso("los puntajes se pueden leer", p.some(x => /for select/i.test(x)));
  caso("pero NADIE los escribe desde el navegador",
       !p.some(x => /for (insert|update|delete|all)/i.test(x)),
       p.filter(x => /for (insert|update|delete|all)/i.test(x)).join(" ").slice(0, 80));
}
{
  const p = politicasDe("fechas");
  caso("las fechas tampoco se escriben desde el navegador",
       !p.some(x => /for (insert|update|delete|all)/i.test(x)));
}
{
  const p = politicasDe("equipo");
  const escrituras = p.filter(x => /for (insert|update)/i.test(x));
  caso("hay política para guardar y para cambiar el equipo", escrituras.length === 2);
  caso("las dos exigen que la fecha NO haya cerrado",
       escrituras.length === 2 && escrituras.every(x => /now\(\)\s*<\s*f\.cierra/i.test(x)),
       escrituras.length + " escrituras");
  caso("las dos exigen que el equipo sea tuyo",
       escrituras.every(x => /auth\.uid\(\)\s*=\s*perfil/i.test(x)));
  caso("el equipo de otro no se ve hasta que la fecha cierra",
       p.some(x => /for select/i.test(x) && /now\(\)\s*>=\s*f\.cierra/i.test(x)));
  caso("un equipo no se puede borrar", !p.some(x => /for delete/i.test(x)));
}

/* Las funciones que se saltean las políticas tienen que ser exactamente las
   que decidimos, y ninguna más. `security definer` es una llave maestra: si
   aparece una nueva sin que nadie lo note, la puerta quedó abierta.      */
{
  const defs = [...SQL.matchAll(/create (?:or replace )?function\s+(\w+)/gi)].map(m => m[1]);
  const conLlave = [...SQL.matchAll(/create (?:or replace )?function\s+(\w+)[\s\S]*?security definer/gi)]
    .map(m => m[1]);
  caso("las funciones con llave maestra son las tres conocidas",
       conLlave.length === 3 &&
       ["es_miembro", "entrar_a_liga", "tabla_liga"].every(f => conLlave.includes(f)),
       conLlave.join(", "));
  caso("y todas fijan el search_path (si no, se les puede cambiar el piso)",
       conLlave.every(f => new RegExp("function\\s+" + f + "[\\s\\S]*?set search_path", "i").test(SQL)));
  caso("no hay funciones sueltas sin revisar", defs.length === conLlave.length,
       defs.join(", "));
}

/* ── EL ARCHIVO TIENE QUE SOBREVIVIR AL VIAJE ────────────────────────────
   La primera vez que Fausto pegó este archivo en Supabase, Postgres cortó
   con "syntax error" en la línea 1: los dos guiones del comentario habían
   desaparecido en el camino y la primera línea entró como código. Hay
   editores de texto que "corrigen" dos guiones y los convierten en una raya
   larga, y comillas rectas en comillas tipográficas, con solo abrir el
   archivo. Si eso pasa adentro de una cadena, el error ni siquiera se ve.

   Así que el archivo no usa ninguna de las dos cosas. Y esto lo verifica,
   porque es exactamente el tipo de detalle que uno reintroduce sin querer
   la próxima vez que agrega una tabla.                                    */
{
  const lineas = SQL.split("\n");
  const conGuiones = lineas.filter(l => /^\s*--/.test(l)).length;
  caso("no hay comentarios con dos guiones (se los come el editor de texto)",
       conGuiones === 0, conGuiones + " líneas");
  const rizadas = SQL.match(/[‘’“”–—]/g) || [];
  caso("ni comillas curvas ni rayas largas en ningún lado",
       rizadas.length === 0, rizadas.join(" "));
  caso("y arranca con un comentario de bloque, que ningún editor toca",
       /^\s*\/\*/.test(SQL));
}

/* Un usuario es un usuario: no un nombre, no un mail, no un club. */
caso("el usuario está acotado y es único",
     /usuario\s+text unique not null check/i.test(SQL));
caso("no se guarda ni el mail ni el nombre real de nadie",
     !/\bemail\b|\bnombre_real\b|\bapellido\b/i.test(SQL));

/* Y la clave de servidor no puede aparecer en ningún archivo del proyecto. */
{
  const cfg = JSON.parse(readFileSync(new URL("./sitio.json", import.meta.url)));
  const sb = cfg.supabase || {};
  /* Se miran las CLAVES configuradas, no el archivo entero: las notas del
     archivo nombran a la service_role justamente para decir que no va acá. */
  caso("sitio.json no tiene ninguna clave de servidor",
       !/service/i.test(Object.keys(sb).join(" ")) &&
       !Object.values(sb).some(v => typeof v === "string" && /service_role/i.test(v)));
  caso("y la clave pública, si está, es de las públicas (empieza con eyJ)",
       !sb.anon || /^eyJ/.test(sb.anon), sb.anon ? sb.anon.slice(0, 6) + "…" : "vacía");
}

/* ─── resultado ──────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([nom, ok, det]) => console.log("  " + (ok ? "ok    " : "MAL   ") + nom +
  (ok || !det ? "" : "   → " + det)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
