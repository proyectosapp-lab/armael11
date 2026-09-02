/* ══════════════════════════════════════════════════════════════════════════
   LOS ÍCONOS DE LA APP — se corren A MANO, cada muerte de obispo.

     node iconos.cjs

   No los hace `publicar.mjs` porque generar un PNG necesita un navegador y
   en la nube de GitHub no hay ninguno. Los tres archivos que salen de acá
   viven en el repo como cualquier otro y `construir-sitio.mjs` los copia.

   Por qué PNG y no los SVG que ya usa la web: Play pide un 512×512 de
   verdad para la ficha, y uno "maskable" aparte. Maskable quiere decir que
   Android lo va a recortar con la forma que use cada teléfono —círculo,
   cuadrado redondeado, gota— así que el dibujo tiene que dejar libre el 20%
   de los bordes. Si llega al borde, se come las puntas.

   Y HAY UN TERCERO, EL DE LA FICHA DE PLAY, que va A SANGRE: el verde llega
   hasta el borde y no lleva esquinas redondeadas. Los de la web sí las
   llevan, y como el PNG no tiene transparencia, atrás de esas esquinas hay
   BLANCO. Play recorta el ícono con su propia forma redondeada, así que un
   ícono ya redondeado le deja cuatro cuñas blancas en las puntas. El que
   redondea es Play; nosotros le damos el cuadrado lleno.

   El monograma es nuestro: dos unos sobre verde. Nada de escudos ajenos.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const VERDE = '#0B4F3A', TINTA = '#FFFFFF';
/* Dos versiones. La normal ocupa casi todo el cuadrado. La "maskable" deja
   el 20% de los bordes libre porque Android recorta el ícono con la forma
   que use cada teléfono: si el dibujo llega al borde, se come las puntas. */
const pagina = (lado, seguro) => `
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${lado}px;height:${lado}px}
  .c{width:${lado}px;height:${lado}px;background:${VERDE};
     display:flex;align-items:center;justify-content:center;
     ${seguro ? '' : `border-radius:${Math.round(lado*0.22)}px;`}}
  b{font-family:Arial,Helvetica,sans-serif;font-weight:800;color:${TINTA};
    font-size:${Math.round(lado * (seguro === true ? 0.42 : seguro === 'sangre' ? 0.50 : 0.54))}px;letter-spacing:-${Math.round(lado*0.02)}px;
    line-height:1}
</style></head><body><div class="c"><b>11</b></div></body></html>`;
(async () => {
  const nav = await chromium.launch();
  for (const [archivo, lado, seguro] of [
    ['sitio-icono-192.png', 192, false],
    ['sitio-icono-512.png', 512, false],
    ['sitio-icono-mask-512.png', 512, true],
    ['play-icono-512.png', 512, 'sangre'],
  ]) {
    const pg = await nav.newPage({ viewport: { width: lado, height: lado },
                                   deviceScaleFactor: 1 });
    await pg.setContent(pagina(lado, seguro));
    await pg.screenshot({ path: archivo, omitBackground: false });
    await pg.close();
    console.log('  ✓ ' + archivo + '  ' + lado + '×' + lado +
      (seguro === true ? '  (maskable)' : seguro === 'sangre' ? '  (a sangre, para la ficha de Play)' : ''));
  }
  await nav.close();
})();
