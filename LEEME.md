# TSTE — el feed y el juego

## Para correrlo: doble clic

**Windows:** doble clic en **CORRER.cmd**
**Mac:** doble clic en **CORRER.command** (si no abre: botón derecho → Abrir)

Hace tres cosas, en este orden:

0. **Prueba el pipeline** contra datos guardados, sin internet. Dos segundos.
   Si algo de esto falla, el resto de la corrida no sirve para nada.
1. **Resuelve los canales de YouTube** (`youtube-candidatos.json`). Los
   convierte en channelId, mira cuándo subieron el último video, comprueba
   que el canal **se siga llamando** como esperábamos, y carga los vivos en
   `medios.json` él solo. No hay que copiar nada a mano.
2. **Baja todas las fuentes y arma los 30 feeds.** Cada fuente se pide **una
   sola vez**: las nacionales las comparten los treinta clubes y las de
   ciudad, dos o tres. Deja un `feed-<club>.js` por club y `resumen.json`.

Todo lo que aparece en pantalla queda en **salida.txt**, al lado del archivo.
Ese es el archivo para mandar.

Si te dice que no encuentra Node, instalalo de https://nodejs.org — el botón
verde de la izquierda — cerrá la ventana y volvé a hacer doble clic.

Para un club solo: `node todos.mjs boca`.

## Para mandárselo a alguien

**COMPARTIR.md** tiene el link, un texto para pegar en WhatsApp, y qué mirar
cuando lo usen. `sitio.json` configura la dirección del sitio y, si algún día
querés, un contador de visitas.

## Para publicarlo

**PUBLICAR.md** tiene los seis pasos para ponerlo en GitHub Pages. Todo desde
la web, sin terminal. Una vez hecho se actualiza solo cada tres horas y la
API key deja de vivir en el navegador.

Para armar el sitio en tu máquina: `node construir-sitio.mjs` (deja `sitio/`,
se abre con doble clic en `sitio/index.html`).

## Para ver la app en un solo archivo

Doble clic en **Talleres.html**. Tiene tres pestañas: Feed, Armá el 11 y Números.
"Armá el 11" pide tu API key de API-Football; queda solo en tu navegador.

## Los archivos

```
clubes.json          los 30 clubes: ciudad, colores, patrón, estrellas, bloqueadores
medios.json          catálogo ÚNICO de fuentes. Cada una dice a quién alcanza:
                     propio = un club · ciudad = todos los de esa ciudad · nacional = todos
traer.mjs            la red: RSS, Atom, news sitemap, sitemap con slugs, wp-json, YouTube
pipeline.mjs         la cabeza: desambigua, clasifica, agrupa, rankea. NO toca la red.
juego.js             el motor de "Armá el 11". Los números que pasaron el backtest.
todos.mjs            baja todo una vez y arma los 30 feeds
ingest.mjs           un club solo, volviendo a pedir sus fuentes
resolver-youtube.mjs handle -> channelId, y mide si el canal publica
probar.mjs           11 casos de Talleres contra datos reales guardados
probar-clubes.mjs    29 casos de los clubes nuevos: titulares que entraron mal
probar-once.mjs      22 casos del once automático
probar-stats.mjs     30 casos de la tabla y los números
probar-backend.mjs   25 casos del esquema: que nadie se escriba sus propios puntos
cuentas.js           entrar, el perfil, el equipo y las ligas. Solo fetch.
probar-cuentas.mjs   37 casos de lo que se le pide al backend, sin red
probar-cuenta-sitio.cjs  18 casos del recorrido de entrar, en un navegador
stats-api.mjs        tabla y números frescos, con /standings
stats-calc.mjs       la cuenta, sin red: la usan stats.mjs y stats-api.mjs
probar-sitio.cjs     42 casos del sitio publicado, con la API bloqueada
construir-sitio.mjs  arma sitio/ : portada + una página por club
datos-juego.mjs      baja lo que el juego pedía desde el navegador
app.tpl.html         la app. Talleres.html se genera desde acá.
```

## Para probar que no rompiste nada

```
node probar.mjs
node probar-clubes.mjs
node probar-once.mjs
node probar-stats.mjs
node probar-backend.mjs
node probar-cuentas.mjs
node probar-cuenta-sitio.cjs
node probar-sitio.cjs
```

Doscientos catorce casos, en dos segundos y sin internet.
Correlos cada vez que toques `pipeline.mjs` o `clubes.json`. Ya van dentro de
CORRER, así que si algo se rompe se ve arriba de todo en `salida.txt`.

## Las reglas que costó aprender

**Un feed no se valida por responder: se valida por la fecha de su ítem más
nuevo.** Cadena 3 responde 200 con XML válido y su última nota de RSS es de 2018.

**Y no alcanza con mirar el `lastmod` del sitemap.** MDP Hoy dice "modificado en
julio de 2026" y su nota más nueva es de agosto de 2021: esa fecha es cuándo el
plugin regeneró el archivo, no cuándo se publicó algo. Hay que abrir el sitemap
y mirar las notas.

**Un feed muerto no significa un medio muerto.** El RSS de Cadena 3 está
abandonado hace ocho años y su news sitemap está fresco al minuto.

**Un feed con XML válido puede tener cero ítems.** Es la trampa más común de
todas. En WordPress, un tag que no existe devuelve el feed de *comentarios*:
200, bien formado, `<title>Comentarios en: …</title>`, sin un solo `<item>`.
Nunca alcanza con que el XML parsee: hay que contar los ítems.

**Y un feed de categoría puede no filtrar nada.** Mendoza Today devuelve el
feed completo del sitio para *cualquier* categoría. Se detecta pidiendo una
categoría inventada: si devuelve lo mismo, el filtro no existe.

**Las fuentes no son propiedad de un club.** Un medio de Córdoba sirve a Talleres,
Belgrano e Instituto por igual. Por eso `medios.json` es uno solo y cada fuente
declara su alcance: el segundo club de una ciudad arranca con todo heredado.

**Las etiquetas del medio son gratis y son mejores que adivinar.** El feed
oficial de Belgrano marca cada nota con Femenino, Socios, Copa Argentina. Con eso
se separa primera de femenino y reserva sin analizar una palabra.

**Sitemap no es scraping.** Un sitemap lo publica el sitio para máquinas, igual
que un RSS. Scraping es leer el HTML hecho para personas — eso se rompe en
silencio cada vez que el sitio se retoca.

**Y `wp-json` tampoco.** Estudiantes de La Plata tiene WordPress con el `/feed/`
interceptado y la REST API abierta: `/wp-json/wp/v2/posts` devuelve lo mismo
que devolvería el RSS. Es una API pública documentada, no una puerta de atrás.
Vale para cualquier club que apague el feed y se olvide de apagar esto.

**El feed puede estar en otro subdominio.** El sitio de Huracán es un front
moderno sin RSS, pero las imágenes salen de `admin.cahuracan.com` — o sea,
WordPress headless. Ahí sí hay `/feed/`. Cuando un club tiene sitio nuevo y
ningún feed, mirá de dónde vienen las imágenes.

**Un medio con un tag por club es treinta feeds en uno.** Vermouth Deportivo
tiene `/tag/<club>/feed/` para los treinta y todos publican. Es el piso que
sostiene a los clubes sin prensa propia — Riestra y Vélez viven casi de eso.
Ojo con los tags legacy: en ese mismo sitio, `gimnasia-y-esgrima-la-plata`
quedó en 2025 y `central-cordoba-sde` en **2018**, y los dos responden 200.

**Un handle de YouTube se puede reasignar.** Buscando "Muy Independiente"
pusimos `@MuyCAI`. Resolvió perfecto, devolvió quince videos frescos, y el
canal hoy se llama "WanderWish - Joa Agente de Viajes". Nada lo detectaba:
respondía, tenía videos, y habría metido tips de Disney en el feed del Rojo.
Por eso el resolvedor compara el nombre del canal con el que esperábamos.

**El nombre corto de un club puede ser una palabra del idioma.** "Argentinos"
es el gentilicio, "Unión" trajo la UEFA, "los Leones" es el seleccionado de
hockey. Para esos clubes la señal débil está escrita a mano en `clubes.json`,
en el campo `debiles`, en vez de salir del nombre y los apodos.

**Un IDF necesita corpus.** Descartar las palabras que aparecen en más del 25%
del lote es buena idea con cincuenta ítems y una guillotina con tres: entre
tres títulos casi iguales, todo lo compartido está en el 100% y se descarta,
así que quedan sin nada en común y no se agrupan. Abajo de ocho ítems el
filtro no corre.

**Un feed de YouTube no trae etiquetas, y ya son más de treinta fuentes.** Los
clubes suben muchísimo juvenil, femenino y futsal por ahí —el canal de Central
Córdoba encabezaba su feed con la 4ª, la 5ª y la 6ª división del mismo
partido— y sin etiquetas todo eso caía junto con la primera. Cuando no hay
etiquetas se mira el texto. Con dos cuidados: "División" sola no es reserva
(*Primera* División es lo contrario) y "Piratas" es el club entero mientras
que "las Piratas" es el femenino.

**El puesto no es una preferencia con precio, es una restricción.** El once
automático elegía por "nivel menos castigo por jugar fuera de puesto". El
castigo de delantero a volante es 0.15 y la diferencia de nivel entre dos
jugadores es tranquilamente 1.0, así que el mejor delantero terminaba de
volante y para la delantera ya no quedaba ninguno: el once salía entero
cambiado. Los castigos no se tocaron —pasaron el backtest, son del modelo—;
lo que estaba mal era la función que arma el once, que es comodidad de
pantalla. Ahora primero cada uno en el suyo y recién después se improvisa.

**El puesto de un jugador no es el del último partido que jugó.** Un lateral
que tapó un hueco en el medio quedaba de volante para siempre. La lista
oficial del plantel cuesta un pedido por equipo y trae el puesto real; los
partidos siguen mandando para el nivel, que es lo que el modelo necesita.

**El número grande tiene que ser el que la persona acaba de ver.** Mostraba
el marcador más probable —0-1— justo debajo de un partido que había terminado
0-2, con un párrafo explicando la diferencia. El párrafo estaba bien y la
jerarquía mal.

**La fase regular y los playoffs no son el mismo torneo.** Nuestra tabla daba
24 y 25 partidos jugados donde la oficial dice 21 y 22, porque sumaba las dos
cosas: al que llegó a la final le contaba tres partidos más que al que quedó
afuera en la primera ronda. La cuenta estaba bien; lo que estaba mal era qué
partidos entraban. La tabla anual oficial cuenta solo la fase regular.

**Y para la tabla no hay que calcular nada: la publica la liga.** `/standings`
devuelve la que ve cualquier hincha. Las rachas, los tiros y el xG sí los
calculamos nosotros, porque esos no vienen — pero sobre los partidos de fase
regular.

**Un archivo generado una vez y commiteado se queda viejo el mismo día.**
`stats-liga.js` mostraba la foto del 18 de agosto una semana después. Ahora se
rehace en cada corrida.

**La liga publica varias tablas, y todas son ciertas.** El torneo terminado, el
que está en curso, cada zona. Quedarnos con una sola y elegirla mal —agarramos
la del que tenía más partidos jugados, que era el torneo YA TERMINADO— mostró
algo cierto y viejo, que se ve igual de mal que algo falso. Ahora se guardan
todas, se puede elegir, y la app arranca en la que tiene a tu equipo.

**La anual la calculamos siempre nosotros**, sobre la fase regular de toda la
temporada. Si la liga publica la suya quedan las dos y se comparan; si no la
publica, es la única que hay.

**Que la liga publique una tabla no quiere decir que publique LA tabla.**
`/standings` devolvió las dos zonas del **Apertura**, que ya terminó, y del
Clausura —el que se está jugando— no devolvió nada. Cierto y viejo. La tabla
del torneo en curso se arma con los partidos, que sí los tenemos: se agrupan
por el nombre del torneo que viene en la ronda ("Clausura - 6" → Clausura), y
adelante va el que se está jugando.

**Los goleadores no salían de ningún lado porque nunca se pidieron.** Estuvieron
desde el principio en "lo que falta" con la explicación de por qué: son datos
de JUGADOR y todo lo demás son datos de PARTIDO. La explicación era correcta y
sirvió de excusa demasiado tiempo. `/players` los trae de a veinte por página,
unas cuarenta páginas para toda la liga, y es el pedido más caro de la corrida.
Entra sobrado en la cuota.

**Un promedio de puntaje sin mínimo de minutos no es un ranking.** El que entró
diez minutos y le pusieron 8 encabeza la liga. Van 450 minutos de piso.

**Un link que no muestra tarjeta muere en el primer reenvío.** Cada página
lleva su `og:title`, su descripción y su dirección absoluta, así que WhatsApp
muestra el nombre del club en vez de un renglón gris. Cuesta quince líneas y
es la diferencia entre que algo circule y que no.

**Copiar al portapapeles no es compartir.** Obliga a salir de la app, abrir el
chat y pegar, y ahí se pierde la mitad de la gente. `navigator.share` abre
WhatsApp directo; copiar quedó de respaldo para cuando no está.

**"No espiamos a nadie" es una promesa que se puede probar.** Hay un caso que
falla si la página carga un script de cualquier dominio que no sea el propio.
Una promesa sin prueba dura hasta el próximo apuro.

**Una perilla que no se ve no significa nada.** Las cuatro tácticas cambiaban
el resultado y los once puntos se quedaban exactamente donde estaban. Ahora la
línea sube o baja el bloque, la presión lo acorta, el ancho lo abre, y durante
el partido el equipo entero sube cuando la pelota está en campo rival. Se mueve
solo TU equipo: el rival no tiene por qué reacomodarse porque toques algo tuyo.

**Recortar a cada jugador por separado aplasta el equipo.** Con la línea al
mínimo, defensores y volantes terminaban todos pegados al tope y encimados.
Un equipo que no entra en la cancha retrocede completo y conserva su forma:
el corrimiento se calcula una vez para el bloque, no once veces.

**Una tira de ocho píxeles no puede mostrar un patrón a lo ancho.** Cae entera
adentro de un solo bastón, y los trece clubes de rayas quedan con un color
plano, indistinguibles. El filete traduce la camiseta a lo LARGO: los bastones
bajan como segmentos, la franja son tres tramos, la banda una diagonal.

**Y los segmentos tienen que ser gruesos.** Quince píxeles a lo alto de una
pantalla son cincuenta y seis segmentos: se lee como una línea rayada, no como
una camiseta. Cuarenta y cuatro son unos diez y se leen como bandas.

**El patrón `uve` no existía en la app.** Vélez, el único club que lo tiene,
caía al patrón por defecto. Y donde sí estaba dibujado —la planilla de
aprobación— estaba al revés: 122/238 da una Λ, no una V. Los ángulos buenos
son 58 y 302. Un patrón que usa un solo club de treinta no lo mira nadie.

**Los colores salieron de una planilla y ahí entran invertidos.** River estaba
como rojo con banda blanca y es blanco con banda roja. La prueba fija ese caso;
para el resto hay una hoja con los treinta filetes al lado de su camiseta.
