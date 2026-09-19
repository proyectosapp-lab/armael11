/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL ENCHUFE DE LA PUBLICIDAD
     node probar-publicidad.mjs

   Construye el sitio DOS veces —una sin publicidad y otra con— y compara.
   Deja `sitio.json` como estaba, pase lo que pase.

   Las dos cosas que mide, y son opuestas:

   1. APAGADA, NO ENTRA NADA. La app no carga un solo script de terceros, y
      esa propiedad tiene que seguir siendo cierta mientras el bloque
      `publicidad` no esté en sitio.json. Es la clase de cosa que se rompe
      sin que nadie lo note: alguien deja una prueba con la publicidad
      encendida y queda así.

   2. ENCENDIDA, ENTRA UNA SOLA VEZ Y CON EL ID CORRECTO. Dos copias del
      script de AdSense en la misma página es una infracción de política, no
      un detalle estético.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const aca = p => new URL(p, import.meta.url);
const CFG = aca("./sitio.json");
const original = readFileSync(CFG, "utf8");

const casos = [];
const caso = (n, ok, d = "") => casos.push([n, ok, d]);
const construir = () => execFileSync("node", ["construir-sitio.mjs"],
  { cwd: new URL(".", import.meta.url), stdio: "pipe" });
const leer = f => existsSync(aca(f)) ? readFileSync(aca(f), "utf8") : "";
const PAGINAS = ["./sitio/index.html", "./sitio/talleres-cba.html"];

try {
  /* ─── 1. APAGADA ──────────────────────────────────────────────────────── */
  const cfg = JSON.parse(original);
  delete cfg.publicidad;
  writeFileSync(CFG, JSON.stringify(cfg, null, 2));
  construir();

  for (const p of PAGINAS) {
    const html = leer(p);
    if (!html) continue;
    /* Se mira el DOMINIO de Google, y no la palabra "adsbygoogle" suelta.
       Desde y51 esa palabra está adentro de nuestro propio JavaScript —en
       la función que arma el hueco— y ahí es código inerte: no baja nada ni
       le pide nada a nadie hasta que `sitio.json` tenga el cliente.

       La propiedad que hay que cuidar es "no se baja un solo script de
       terceros", no "no aparece cierta cadena de texto". Una prueba que
       confunde las dos obliga a la próxima persona a elegir entre romperla
       o escribir el código raro para esquivarla.

       Que además NO SE DIBUJE ningún hueco con la publicidad apagada se
       prueba donde se puede ver de verdad, que es en el navegador:
       `probar-sitio.cjs`, "sin configurar, no hay hueco de publicidad ni
       aunque se fuerce". Cada prueba mira lo que su mundo le deja ver. */
    caso("sin configurar, " + p.split("/").pop() + " no baja nada de Google",
         !/googlesyndication/i.test(html),
         (html.match(/googlesyndication[^"']*/) || [""])[0]);
    caso("y no dice que haya publicidad en window.SITIO",
         !/"publicidad"/.test(html));
  }

  /* ─── 2. ENCENDIDA ────────────────────────────────────────────────────── */
  const ID = "ca-pub-0000000000000001";
  cfg.publicidad = { cliente: ID };
  writeFileSync(CFG, JSON.stringify(cfg, null, 2));
  construir();

  for (const p of PAGINAS) {
    const html = leer(p);
    if (!html) continue;
    const cuantos = (html.match(/pagead\/js\/adsbygoogle\.js/g) || []).length;
    caso("configurada, " + p.split("/").pop() + " trae el script UNA sola vez",
         cuantos === 1, cuantos + " copias");
    caso("con el id de cliente que dice sitio.json",
         html.includes("client=" + ID));
    /* Google lo pide así, y sin `async` un problema en su servidor frenaría
       el dibujado de la página: un aviso que tarda no puede hacer esperar
       al partido. */
    caso("async y crossorigin, como pide Google",
         /<script async crossorigin="anonymous" src="https:\/\/pagead2/.test(html));
    /* `window.SITIO` solo existe en las páginas de club: la portada es la
       lista de clubes y no corre la app. El script de Google sí va en las
       dos, porque Auto Ads trabaja sobre el sitio entero. */
    if (/window\.SITIO=/.test(html))
      caso("y la app se entera de que hay red de publicidad",
           /"publicidad":\{"cliente":"ca-pub-0000000000000001"\}/.test(html));
  }

  /* ─── 3. LA UNIDAD DE ANUNCIO ─────────────────────────────────────────
     El `cliente` hace entrar el script; el `bloque` es lo que le dice a la
     app DÓNDE poner el aviso. Son dos momentos distintos en el tiempo real:
     una cuenta recién aprobada tiene cliente y todavía no tiene ninguna
     unidad creada, y en ese rato la app tiene que verse exactamente como
     hasta ahora. */
  {
    cfg.publicidad = { cliente: ID };
    writeFileSync(CFG, JSON.stringify(cfg, null, 2));
    construir();
    const html = leer("./sitio/talleres-cba.html");
    caso("con cliente y sin unidad creada, la app no recibe ningún bloque",
         /"publicidad":\{"cliente":"[^"]*"\}/.test(html), (html.match(/"publicidad":[^}]*\}/) || [""])[0]);

    cfg.publicidad = { cliente: ID, bloque: "9988776655" };
    writeFileSync(CFG, JSON.stringify(cfg, null, 2));
    construir();
    const con = leer("./sitio/talleres-cba.html");
    caso("con la unidad creada, el id del bloque viaja a la app",
         /"bloque":"9988776655"/.test(con));
  }

  /* Lo que NO puede pasar: que el bloque de configuración entero termine en
     la página. Ahí adentro puede haber cosas que no tienen por qué viajar. */
  {
    cfg.publicidad = { cliente: ID, notaInterna: "no-tiene-que-viajar" };
    writeFileSync(CFG, JSON.stringify(cfg, null, 2));
    construir();
    const html = leer("./sitio/talleres-cba.html");
    caso("solo viaja el id, no el bloque de configuración entero",
         !/no-tiene-que-viajar/.test(html));
  }
} finally {
  /* Pase lo que pase, sitio.json vuelve a ser el de Fausto y el sitio se
     reconstruye sin publicidad. Una prueba que deja el sitio con avisos
     encendidos es peor que no tener prueba. */
  writeFileSync(CFG, original);
  construir();
  const html = leer("./sitio/talleres-cba.html");
  caso("y al terminar la prueba el sitio queda como estaba, sin publicidad",
       !/googlesyndication/.test(html));
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
