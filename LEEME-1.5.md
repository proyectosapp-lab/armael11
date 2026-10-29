# Mano a mano 1.5 — lo que va en este zip (28/10/2026)

Se sube al repo armael11 por la web de GitHub, mismos caminos (reemplaza los que ya existen).

- `mam/mam.css`: dos arreglos visuales que aparecieron al armar las capturas: con la piel noche el logo de
  arriba se veía como un cuadrado crema (la M blanca no se veía) y quedaba un hueco vacío entre la tarjeta del
  desafío y los partidos.
- `codemagic.yaml` y `package.json`: la versión pasa a 1.5 (iPhone y Android). En la App Store está la 1.3.
- `textos-tiendas.md`: novedades de la 1.5, texto promocional, descripción (7 días gratis) y la nota al revisor.
- `funcion-mail-desafio.ts`: copia de la función del mail como quedó desplegada (Brevo; solo anuncia desafíos con
  3 o más partidos por delante). No hay que desplegar nada: ya está en Supabase.

Pruebas: probar-mam 177 (las 2 de "cabecera propia" de tenis/NBA fallan solo con los stubs locales), y las de
empaquetado iOS, nativo, tienda iOS y datos iOS, todas bien.
