/* ══════════════════════════════════════════════════════════════════════════
   APP-WEB — la versión web de Mano a mano, en armael11.com/app/

   La corre publicar.mjs después de armar el sitio. Empaqueta la app igual
   que para las tiendas (empaquetar-mam.mjs): fútbol sale del `sitio/` recién
   armado, tenis y NBA se bajan de sus sitios publicados. Lo que queda en
   app/www se copia a sitio/app/, así se puede abrir en el navegador del
   teléfono sin compilar nada: para probar, para mostrar, y para el que no
   quiere instalar. No se indexa (es la app, no una página).

   Si algo falla (un sitio caído, por ejemplo) NO se corta la publicación:
   el sitio sale igual, sin la carpeta app/ de esta ronda.
   ══════════════════════════════════════════════════════════════════════════ */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, cpSync, readFileSync, writeFileSync } from "node:fs";

const aca = p => new URL(p, import.meta.url);
const r = spawnSync(process.execPath, [aca("./empaquetar-mam.mjs").pathname],
  { stdio: "inherit", env: { ...process.env, MAM_LOCAL: JSON.stringify({ futbol: aca("./sitio/").pathname }) } });
if (r.status !== 0 || !existsSync(aca("./app/www/index.html"))) {
  console.log("  ✗ no pude armar la app web: el sitio sale sin /app/ esta vez");
  process.exit(0);
}
const destino = aca("./sitio/app/");
rmSync(destino, { recursive: true, force: true });
cpSync(aca("./app/www/"), destino, { recursive: true });
/* la app no se indexa: el producto es la app de las tiendas, esto es para probar y para el que no instala */
const idx = new URL("index.html", destino);
writeFileSync(idx, readFileSync(idx, "utf8").replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\">\n<meta name=\"robots\" content=\"noindex\">"));
console.log("  ✓ app web en sitio/app/ (abrila en /app/)");
