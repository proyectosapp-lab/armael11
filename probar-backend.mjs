/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL ESQUEMA
     node probar-backend.mjs
   No toca la red ni la base: lee `esquema.sql` y verifica que las
   garantías del juego limpio sigan escritas ahí.

   Esto NO prueba que Postgres acepte el archivo —para eso hace falta una
   base— y no pretende hacerlo. Prueba otra cosa, que es la que se rompe en
   la práctica: que alguien, arreglando algo, no afloje sin querer la regla
   de que los puntos los escribe el servidor o la del cierre. Una política
   borrada no da error en ningún lado: simplemente deja pasar.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

const SQL = readFileSync(new URL("./esquema.sql", import.meta.url), "utf8");
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
  /* Se corta el SQL en definiciones y se mira CADA UNA por separado. Con un
     `[\s\S]*?security definer` corrido, una función sin llave maestra se
     lleva la de la que viene después y queda marcada de más — y, peor, la
     que sí la tiene queda sin marcar. Una prueba de seguridad que se
     equivoca de función no protege nada. */
  const conLlave = SQL.split(/create (?:or replace )?function\s+/i).slice(1)
    .map(t => [ (t.match(/^(\w+)/) || [])[1],
                t.slice(0, t.indexOf("$$")) ])
    .filter(([nom, cabeza]) => nom && /security definer/i.test(cabeza))
    .map(([nom]) => nom);
  /* Este caso existe para que agregar una función con llave maestra sea una
     DECISIÓN y no un descuido: `security definer` corre con permisos que el
     usuario no tiene, así que cada una hay que poder explicarla.
       es_miembro      rompe la recursión de la política de liga_miembro
       entrar_a_liga   deja entrar con un código sin poder leer las ligas
       crear_liga      crea el torneo Y mete adentro al que lo creó, en una
                       sola transacción. Sin esto eran dos inserts desde el
                       teléfono y el primero no podía leer su propia fila: la
                       política de lectura de `liga` es "soy miembro", y el
                       miembro se insertaba recién en el segundo pedido.
       tabla_liga      arma el join de la tabla en un solo pedido
       borrar_mi_cuenta borra auth.users, que el teléfono no puede tocar
       acreditar_premium suma meses de premium, y NO la puede llamar nadie
                         desde el navegador: se le revoca a todos.
       registrar_pago    anota el pago y lo acredita en un solo movimiento,
                         que es lo que impide acreditarlo dos veces. Tampoco
                         se la puede llamar desde el navegador.
       es_de_zona      rompe la misma recursión que es_miembro, en zona
       tabla_zona      arma la tabla de la zona en un solo pedido, y solo
                       si el que pregunta está en esa zona
       mi_cupo         lee el cupo del que pregunta y de nadie más: la tabla
                       `uso_mes` no tiene política de escritura, así que sin
                       esto no habría forma de mirar el propio contador.
       sumar_simulacion gasta una del cupo. Es la ÚNICA forma de mover el
                       contador: si `uso_mes` tuviera política de update, el
                       tope sería una sugerencia.
       poner_plan      cambia el plan de alguien, y no se la puede llamar
                       desde el navegador: se le revoca a todos. Es la misma
                       defensa que `acreditar_premium`, por la misma razón.
     Las doce comparten la misma defensa: o no reciben nada, o lo que
     reciben ya lo tenía el que llama, o directamente no se les puede
     llamar desde afuera. */
  caso("las funciones con llave maestra son las doce conocidas",
       conLlave.length === 12 &&
       ["es_miembro", "entrar_a_liga", "crear_liga", "tabla_liga", "borrar_mi_cuenta",
        "acreditar_premium", "registrar_pago", "es_de_zona", "tabla_zona",
        "mi_cupo", "sumar_simulacion", "poner_plan"]
         .every(f => conLlave.includes(f)),
       conLlave.join(", "));

  /* ── EL ARCHIVO SE TIENE QUE PODER PEGAR DOS VECES ─────────────────────
     Esto lo aprendimos con el torneo que no se creaba. `create or replace`
     NO puede cambiarle a una función lo que devuelve: si ya existe una con
     el mismo nombre y otra forma, Postgres corta con "cannot change return
     type of existing function". Y el editor de Supabase corre TODO el
     archivo dentro de una sola transacción, así que ese único error tira
     abajo el archivo entero: no se crea nada, ni siquiera lo que no tenía
     ningún problema. Desde afuera se ve como si el archivo no se hubiera
     pegado nunca.

     La regla, entonces: toda función que devuelve una TABLA -que son las
     que cambian de forma cuando les agregamos una columna- lleva su
     `drop function if exists` justo antes.

     Ojo con querer extender esto a todas: `es_miembro` y `es_de_zona` las
     usan las políticas, y una función de la que depende una política no se
     puede borrar sin llevarse la política puesta. Esas se reemplazan y
     listo, que además nunca cambian de forma: devuelven un booleano. */
  {
    const tablas = [...SQL.matchAll(
      /create (?:or replace )?function\s+(\w+)\s*\(([^)]*)\)\s*\n?\s*returns table/gi)]
      .map(m => m[1]);
    const sinDrop = tablas.filter(f =>
      !new RegExp("drop function if exists\\s+" + f + "\\s*\\(", "i").test(SQL));
    caso("cada función que devuelve una tabla se borra antes de crearse",
         tablas.length >= 5 && sinDrop.length === 0,
         sinDrop.length ? "sin drop: " + sinDrop.join(", ") : tablas.join(", "));

    /* El drop tiene que estar ANTES, no en cualquier lado: un drop escrito
       después de la creación borra justamente lo que se acaba de crear. */
    const tarde = tablas.filter(f => {
      const d = SQL.search(new RegExp("drop function if exists\\s+" + f + "\\s*\\(", "i"));
      const c = SQL.search(new RegExp("create (?:or replace )?function\\s+" + f + "\\s*\\(", "i"));
      return d < 0 || d > c;
    });
    caso("y el borrado va antes de la creación, no después",
         tarde.length === 0, tarde.join(", "));

    /* La otra forma de romperlo: agregarle un parámetro a una función que ya
       existe. Un parámetro nuevo -aunque tenga valor por defecto- NO
       reemplaza a la vieja: la deja al lado, y a partir de ahí una llamada
       con los parámetros de antes no sabe a cuál ir. `registrar_pago` pasó
       de siete a ocho, así que la de siete se borra a mano. */
    caso("la registrar_pago vieja, la de siete parámetros, se borra",
         /drop function if exists registrar_pago\s*\(\s*text\s*,\s*uuid\s*,\s*int\s*,\s*text\s*,\s*numeric\s*,\s*text\s*,\s*jsonb\s*\)/i.test(SQL));
  }

  /* ── LAS FASES ─────────────────────────────────────────────────────────
     Todo esto lo escribe el servidor, como los puntos. Si alguna de estas
     tablas tuviera política de escritura, cualquiera se anotaría en la
     zona de la final desde la consola. */
  for (const t of ["fase", "zona", "zona_miembro"]) {
    caso("la tabla " + t + " tiene RLS encendido",
         new RegExp("alter table " + t + " enable row level security", "i").test(SQL));
    caso("y nadie la escribe desde el navegador",
         !new RegExp("on " + t + " for (insert|update|delete|all)", "i").test(SQL));
  }
  caso("los uuid de perfil de las zonas no se leen desde ningún teléfono",
       !/on zona_miembro for select/i.test(SQL));
  caso("la tabla de la zona solo la ve el que está en esa zona",
       /function tabla_zona[\s\S]*?es_de_zona\(z\)/i.test(SQL));

  /* ── EL PREMIUM ───────────────────────────────────────────────────────
     La trampa que la RLS sola NO tapa: las políticas son por FILA, no por
     columna, y la de `perfil` ya deja que cada uno modifique la suya —la
     necesita para el nombre de usuario—. Sin un permiso por columna,
     cualquiera se pone premium hasta el 2099 desde la consola. */
  caso("el premium es una fecha, no un sí/no que no se apaga nunca",
       /premium_hasta timestamptz/i.test(SQL));
  caso("y el usuario NO puede escribirla, aunque pueda editar su perfil",
       /revoke update \(premium_hasta\) on perfil from[^;]*authenticated/i.test(SQL));
  caso("la de acreditar no se le puede llamar desde el navegador",
       /revoke all on function acreditar_premium[^;]*from[^;]*authenticated/i.test(SQL));

  /* Mercado Pago puede mandar el mismo aviso varias veces. Que el id del
     pago sea la clave primaria es toda la defensa: el segundo choca. */
  caso("un pago repetido no se puede acreditar dos veces",
       /create table if not exists pago \(\s*\n\s*id\s+text primary key/i.test(SQL));
  caso("y la tabla de pagos no se lee desde ningún teléfono",
       /alter table pago enable row level security/i.test(SQL) &&
       !/on pago for/i.test(SQL));

  /* ── LO QUE SE ANOTA NO ES SI LO VIMOS, SINO SI LO COBRAMOS ───────────
     Que el id sea la clave primaria alcanza para no anotar dos filas, y NO
     alcanza para no acreditar dos veces: un pago avisa varias veces y
     cambia de estado en el camino —pendiente primero, aprobado después—.
     Sin esta columna, el que paga en efectivo no cobra nunca su premium
     porque el aviso bueno rebota contra la fila del aviso malo. */
  caso("se anota si el pago ya se acreditó, no solo si se vio",
       /acreditado boolean not null default false/i.test(SQL));
  caso("y las dos cosas pasan adentro de la misma función, o no pasan",
       /function registrar_pago[\s\S]*?for update[\s\S]*?acreditar_premium/i.test(SQL));
  caso("que tampoco se le puede llamar desde el navegador",
       /revoke all on function registrar_pago[\s\S]{0,120}?from[^;]*authenticated/i.test(SQL));
  caso("un pago sin perfil se anota pero no acredita nada",
       /p_perfil is null[^;]*then return null/i.test(SQL));

  /* La que borra no puede recibir a QUIÉN borrar: si recibiera un id, con
     llave maestra cualquiera podría borrar la cuenta de otro. */
  caso("la que borra la cuenta no recibe ningún parámetro",
       /function\s+borrar_mi_cuenta\s*\(\s*\)/.test(SQL));
  caso("y se la sacan a los anónimos",
       /revoke all on function borrar_mi_cuenta\(\) from public/i.test(SQL) &&
       /grant execute on function borrar_mi_cuenta\(\) to authenticated/i.test(SQL));

  /* Si la liga se fuera con el que la creó, el día que uno se borra
     desaparece el torneo de otros once que no tienen nada que ver. */
  caso("borrarse no se lleva puesta la liga de los demás",
       /liga_dueno_fkey[\s\S]*?on delete set null/i.test(SQL));
  caso("y todas fijan el search_path (si no, se les puede cambiar el piso)",
       conLlave.every(f => new RegExp("function\\s+" + f + "[\\s\\S]*?set search_path", "i").test(SQL)));
  /* Toda función del esquema tiene que estar revisada: o lleva llave maestra
     y está explicada arriba, o está acá abajo con el motivo por el que NO la
     necesita. Lo que no puede haber es una que no esté en ninguna lista.
       inicio_de_ciclo  es aritmética sobre su propio argumento: recibe una
                        fecha y devuelve otra. No lee ni escribe ninguna
                        tabla, así que darle llave maestra sería darle
                        permisos para nada. */
  const sinLlave = ["inicio_de_ciclo"];
  const sueltas = defs.filter(f => !conLlave.includes(f) && !sinLlave.includes(f));
  caso("no hay funciones sueltas sin revisar", sueltas.length === 0,
       sueltas.join(", ") || defs.join(", "));
  /* Y al revés: si una de las que decidimos que no necesita llave un día la
     recibe, esto se pone rojo. La lista tiene que seguir siendo cierta. */
  caso("y las que decidimos sin llave maestra siguen sin tenerla",
       sinLlave.every(f => !conLlave.includes(f)), sinLlave.join(", "));
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
  /* Las dos formas que tiene una clave pública de Supabase: la vieja, que es
     un JWT con `role: anon` adentro, y la nueva, que empieza con
     sb_publishable_. La de servidor no se parece a ninguna de las dos, así
     que esto además avisa si alguien pegó la equivocada.                  */
  caso("y la clave pública tiene forma de clave pública",
       !sb.anon || /^eyJ/.test(sb.anon) || /^sb_publishable_/.test(sb.anon),
       sb.anon ? sb.anon.slice(0, 8) + "…" : "vacía");
  if (sb.anon && /^eyJ/.test(sb.anon)) {
    let rol = "?";
    try { rol = JSON.parse(Buffer.from(sb.anon.split(".")[1], "base64")).role; } catch (e) {}
    caso("y adentro dice anon, no service_role", rol === "anon", "role: " + rol);
  }
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
