# Para mandarlo

## El link

```
https://proyectosapp-lab.github.io/armael11/
```

Esa es la portada, donde se elige el club. Si sabés de qué equipo es la
persona, mandale la página directa: se ahorra un paso y entra a lo suyo.

```
.../armael11/talleres-cba.html      .../armael11/belgrano-cba.html
.../armael11/boca.html              .../armael11/river.html
```

El id de cada club está en `clubes.json`.

## El texto

Para un hincha, por WhatsApp. Corto, sin explicar de más:

> Estoy armando una app donde te aparece todo lo que se dice de Talleres en
> un solo lugar: noticias, videos y los números de la liga. Y hay un juego
> para armar el once del próximo partido y ver si le pegás.
>
> https://proyectosapp-lab.github.io/armael11/talleres-cba.html
>
> Decime qué te parece, sobre todo lo que esté mal o falte.

Cambiá el nombre del club y el link. Nada más.

**Lo que NO conviene decir:** que la hiciste con ayuda, cómo funciona por
dentro, ni pedir disculpas por lo que falta. Que la usen y digan.

## Qué mirar

No preguntes "¿te gustó?" — todo el mundo dice que sí. Mirá esto:

1. **¿Volvió?** Es la única pregunta que importa. Una visita es curiosidad;
   dos es un producto.
2. **¿Jugó a armar el once?** Y si jugó, ¿mandó el link a alguien?
3. **¿Qué buscó y no encontró?** Ahí está lo próximo que hay que construir,
   y no en la lista de pendientes que tenemos escrita.
4. **¿Con qué club entró?** Si todos entran con los grandes, los veintiséis
   restantes pueden esperar. Si entran con el suyo, el trabajo de fuentes
   valió la pena.

## Contar visitas sin espiar a nadie

Hoy el sitio **no carga ningún script de terceros**. Hay una prueba que lo
verifica: si alguna vez se cuela uno, falla la corrida.

Si querés saber cuánta gente entra, `sitio.json` tiene un campo `contador`.
Poniéndole un código de **GoatCounter** se agrega ese contador y nada más.
GoatCounter no usa cookies, no guarda IPs completas y no sigue a nadie entre
sitios: cuenta páginas vistas y de dónde vinieron. La cuenta es gratis y toma
dos minutos en goatcounter.com.

Si el campo queda vacío, no se carga nada. Es la opción por defecto a
propósito: es más fácil agregarlo después que explicar por qué estaba.

## Lo que ya está listo para que circule

**El link se ve bien al mandarlo.** Cada página lleva el nombre del club y
una descripción, así que WhatsApp muestra una tarjeta en vez de un renglón
gris. Es la diferencia entre que un link se reenvíe y que muera.

**Se puede agregar a la pantalla de inicio.** Cada club tiene su icono con
su color y su inicial, y abre directo en su página. En el teléfono queda como
una app.

**El pronóstico se comparte de una.** El botón usa el compartir del teléfono:
abre WhatsApp directo en vez de copiar al portapapeles y obligar a salir de la
app, abrir el chat y pegar. Ahí es donde se pierde la mitad de la gente.
