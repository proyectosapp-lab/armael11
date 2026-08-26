# Crear el backend — paso a paso

Todo se hace desde el navegador. **No hace falta terminal.** Son unos veinte
minutos y se hace una sola vez.

El backend es lo que permite las tablas, los desafíos, las ligas de amigos y
el torneo pago. Sin él, cada uno juega solo en su teléfono.

---

## Antes de empezar: las tres claves

Supabase te va a dar tres cosas. **No son iguales y no van al mismo lugar.**
Esta es la parte donde un error se paga caro, así que va primero:

| Qué | Dónde va | Si se filtra |
|---|---|---|
| **URL del proyecto** | `sitio.json`, a la vista | nada, es pública |
| **anon public** | `sitio.json`, a la vista | nada. Está hecha para vivir en el navegador: sola no puede leer ni escribir nada que las políticas no permitan |
| **service_role** | **solo** como secreto de GitHub | **todo.** Se saltea todas las políticas. Puede leer, escribir y borrar cualquier cosa |

La `service_role` no va en ningún archivo del proyecto, no se pega en un chat
(tampoco conmigo) y no se manda por WhatsApp. Si alguna vez pasa, se regenera
desde el panel y listo — pero hay que hacerlo.

La contraseña de la base que te pide Supabase al crear el proyecto: guardala
en tu gestor de contraseñas. No la vas a necesitar para esto.

---

## 1. Crear la cuenta y el proyecto

1. Entrá a **supabase.com** y creá una cuenta (podés entrar con GitHub).
2. **New project**.
3. Nombre: `tste`. Contraseña de la base: la que te genere, guardada.
4. Región: **South America (São Paulo)**. Es la más cerca; se nota.
5. Esperá un minuto y medio a que termine de armarse.

## 2. Crear las tablas

**Cómo abrir el archivo importa.** No lo abras con Word ni con WordPad: esos
programas "corrigen" el texto al abrirlo —dos guiones se convierten en una
raya larga, las comillas rectas en comillas curvas— y el SQL deja de ser SQL.
Ya nos pasó: Postgres cortó con *syntax error* en la línea 1.

La forma más segura, sin instalar nada: **arrastrá `esquema.sql` a una pestaña
nueva de Chrome**. Lo muestra tal cual es. Ahí Ctrl+A, Ctrl+C. (El Bloc de
notas de Windows también sirve; Word y WordPad no.)

1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. Pegá **todo** el archivo.
3. Antes de correr, mirá la línea 1: tiene que empezar con `/*`. Si empieza
   con otra cosa, el archivo se ensució en el camino y hay que copiarlo de
   nuevo como dice arriba.
4. **Run**.

Tiene que decir *Success*. Si dice otra cosa, mandame el error y las primeras
líneas de lo que pegaste: el archivo se puede correr de nuevo sin romper nada,
así que no hay riesgo en reintentar.

Para ver que quedó: **Table Editor** → tienen que estar `perfil`, `fechas`,
`equipo`, `puntaje`, `liga` y `liga_miembro`, todas con el candadito de
*RLS enabled*. **Ese candado es el juego limpio.** Si alguna aparece sin él,
avisame antes de seguir.

## 3. Cómo se entra

1. **Authentication** → **Providers** → dejá **Email** encendido.
2. Adentro de Email, **apagá "Confirm password"** / dejá activado el ingreso
   por link (*magic link*). Sin contraseñas: llega un mail con un link y listo.
3. **Authentication** → **URL Configuration**:
   - *Site URL*: `https://proyectosapp-lab.github.io/armael11`
   - *Redirect URLs*: la misma, y agregá `http://localhost:8099/**` para poder
     probar.

Por qué sin contraseñas: la contraseña que no guardamos es la que no podemos
perder. Y una menos que la gente tenga que inventar es una persona más que
llega hasta el final.

## 4. Pasar las claves

**Las dos públicas** — **Project Settings** → **API**. Copiá *Project URL* y
la clave *anon public*, y pegalas en `sitio.json`:

```json
"supabase": {
  "url": "https://xxxxxxxxxxxx.supabase.co",
  "anon": "eyJhbGciOi..."
}
```

**La de servidor** — en la misma pantalla, *service_role*. Esa va a GitHub:

1. Tu repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. Nombre exacto: `SUPABASE_SERVICE_KEY`. Valor: la clave. **Add secret**.

Es el mismo lugar donde ya está `API_FOOTBALL_KEY`.

## 5. Abrir la primera fecha

Las fechas las escribe el servidor, así que la primera se carga a mano:
**SQL Editor**, y esto, cambiando el número y la hora del primer partido:

```sql
insert into fechas (numero, torneo, cierra)
values (8, 'Clausura 2026', '2026-08-29 19:00-03')
on conflict (numero) do update set cierra = excluded.cierra;
```

La hora es **la del primer partido de esa fecha**, en hora argentina (`-03`).
Después de esa hora, la base deja de aceptar equipos: no porque la app lo
esconda, sino porque no los acepta.

---

## Cómo saber que funciona

Cuando esté todo, la app va a mostrar el botón de entrar. La prueba de fuego
no es que se pueda entrar: es que **no** se pueda hacer trampa. Estas tres
cosas tienen que fallar, y hay pruebas que las intentan a propósito:

1. Guardar un equipo después del cierre.
2. Escribirse los puntos uno mismo desde el navegador.
3. Ver el equipo de otro antes de que cierre la fecha.

Si alguna de las tres funciona, algo salió mal en el paso 2 y hay que mirarlo
antes de invitar a nadie.

## Qué guarda y qué no

Guarda: tu usuario, tus equipos, tus puntos y tus ligas.

No guarda: tu nombre, tu club, ni nada que no haga falta. En la pantalla del
torneo pago van **solo usuarios y puntajes** — sin nombres de club ni escudos,
como está decidido desde el primer día.
