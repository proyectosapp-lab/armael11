# Publicar TSTE en GitHub Pages

Son seis pasos. Todo desde la web, sin terminal. Unos quince minutos la
primera vez; después no se toca más: se actualiza solo cada tres horas.

---

## 1. Crear el repositorio

En github.com → **New repository**.

- Nombre: `tste` (o el que quieras)
- **Public** — con cuenta gratis, Pages necesita que el repositorio sea
  público. Se ve el código; **la API key no**, porque va como secreto y los
  secretos no se ven ni siquiera siendo público.
- No marques nada más. **Create repository**.

## 2. Subir los archivos

En el repositorio vacío → **uploading an existing file**.

Arrastrá **todo el contenido de la carpeta tste** (los archivos sueltos, no
la carpeta). Si tu explorador no te deja arrastrar `.github` porque empieza
con punto, no importa: lo creamos en el paso 3.

Abajo, **Commit changes**.

## 3. Crear el archivo que hace todo

Este es el que le dice a GitHub qué correr y cada cuánto.

**Add file → Create new file.** En el nombre escribí exactamente:

```
.github/workflows/publicar.yml
```

(al escribir las barras GitHub va armando las carpetas solo)

Y pegá adentro el contenido de `.github/workflows/publicar.yml`, que está en
el zip. **Commit changes.**

> Si en el paso 2 sí se subió la carpeta `.github`, saltéate este paso.

## 4. Guardar la API key como secreto

**Settings → Secrets and variables → Actions → New repository secret.**

- Name: `API_FOOTBALL_KEY`
- Secret: tu key de API-Football

**Add secret.** A partir de acá GitHub la usa para bajar los datos y no la
muestra nunca, ni en los registros de las corridas.

> Si la key que tenías se compartió alguna vez por chat, **regenerala en el
> panel de API-Football antes de pegarla acá**. Es un botón y toma diez
> segundos.

## 5. Encender Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Nada más. No elijas rama.

## 6. Correrlo la primera vez

**Actions → Traer y publicar → Run workflow.**

Tarda tres o cuatro minutos. Cuando el círculo se ponga verde, tu sitio está
en:

```
https://TU-USUARIO.github.io/tste/
```

---

## Qué hace cada corrida

1. Corre las 33 pruebas. **Si algo falla, no publica** — mejor dejar el sitio
   anterior que pisarlo con treinta feeds mal armados.
2. Resuelve los canales de YouTube.
3. Baja las fuentes y arma los 30 feeds.
4. Baja de API-Football el próximo partido y el último jugado de cada club.
5. Arma el sitio y lo publica.

De ahí en más se repite **cada tres horas**, sola. También podés apretar
"Run workflow" cuando quieras, y se dispara sola cada vez que subas un cambio.

## Lo que esto arregla

**La API key salió del navegador.** Antes la app le pedía la suya a cada
usuario. Ahora las respuestas vienen bajadas y el navegador no llama a
API-Football ni una vez — hay una prueba que lo verifica bloqueando el
dominio: si el juego llega al final, es porque no lo necesitó.

**El link del pronóstico ahora le abre a un amigo.** Antes era un archivo en
tu disco: el link no le servía a nadie más. Ahora es una URL de verdad.

**La ingesta corre sola.** Ya no depende de que hagas doble clic.

## Cosas para saber

**El sitio es estático.** No hay servidor ni base de datos. Eso lo hace
gratis, rápido e imposible de tirar abajo, y también quiere decir que el
torneo de amigos —que necesita guardar puntajes de verdad— va a pedir algo
más adelante. Hoy no hace falta.

**Del juego están cargados dos partidos por club**: el próximo y el último
jugado. Son los dos que se juegan: uno para pronosticar, el otro para revelar
qué puso el DT. Los viejos no se ofrecen, en vez de ofrecerlos y fallar.

**Si falta el secreto**, el sitio se publica igual y la pestaña del juego
vuelve a pedirle la key al usuario, como antes. No se rompe nada.

**Para ver qué pasó en una corrida**: Actions → la última corrida → el paso
que te interese. Es la misma salida que veías en `salida.txt`.

## Para probarlo antes de subir nada

En tu máquina, doble clic en **CORRER.cmd** y después:

```
node datos-juego.mjs TU_KEY
node construir-sitio.mjs
```

Te deja la carpeta `sitio/`. Abrí `sitio/index.html` con doble clic: anda
igual desde el disco, porque los datos entran como `<script src>` y eso el
navegador sí lo carga desde `file://`.

Y `node probar-sitio.cjs` levanta un servidor y verifica las nueve cosas que
importan, incluida la única que de verdad importa: que el navegador no llame
a API-Football ni una vez.
