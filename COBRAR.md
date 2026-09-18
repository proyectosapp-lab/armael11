# Cómo se prende el cobro

Todo esto se hace **una sola vez** y **desde el navegador**. No hace falta
terminal en ningún paso.

El orden importa: la función del webhook necesita que la base ya tenga
`registrar_pago`, y Mercado Pago necesita que la función ya exista para
poder apuntarle.

---

## 1. La base (Supabase → SQL Editor)

Pegá **`esquema.sql`** entero y dale *Run*. Es el mismo archivo de siempre:
se puede correr todas las veces que quieras, no rompe nada de lo que ya
está. Lo nuevo son dos cosas:

- la columna `acreditado` en la tabla `pago`
- la función `registrar_pago`

Si algo falla, va a fallar acá y no se cobró nada todavía. Es el mejor lugar
para fallar.

---

## 2. El token de Mercado Pago (Supabase → Edge Functions → Secrets)

**No me lo pegues a mí, ni en un archivo del proyecto, ni en el sitio.** Va
de la página de Mercado Pago al campo de Supabase y de ningún otro lado.

En Mercado Pago: *Tus integraciones → Arma el 11 → Credenciales de
producción → Access Token*.

En Supabase: *Edge Functions → Secrets → Add new secret*

| Nombre | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | el Access Token de producción |
| `SITIO_URL` | `https://armael11.com` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` **no se
cargan**: Supabase se las pasa sola a sus funciones. Ese es el punto — la
clave de servicio nunca pasa por tus manos ni por las mías.

---

## 3. Las dos funciones (Supabase → Edge Functions → Open Editor)

Una por vez. El nombre tiene que ser **exactamente** este, porque la app y
Mercado Pago le pegan a esa dirección:

| Nombre de la función | Qué archivo pegar | Verify JWT |
|---|---|---|
| `crear-pago` | `funcion-crear-pago.ts` | **tildado** |
| `pago-avisado` | `funcion-pago-avisado.ts` | **DESTILDADO** |

Se abre el editor, se borra el ejemplo que trae, se pega el archivo entero y
*Deploy*.

**El destildado de `pago-avisado` es el paso que más se olvida.** Mercado
Pago no tiene una sesión de Supabase que mostrar: si queda tildado, Supabase
le contesta 401 a todos los avisos, Mercado Pago reintenta durante días y
nadie cobra nunca. No hay ningún error visible en ningún lado.

Es el único lugar del proyecto donde esa puerta queda abierta, y por eso
adentro de esa función no se le cree nada a nadie: del aviso se toma
solamente el número de pago, y el pago se va a buscar a la API de Mercado
Pago con nuestro token.

Para saber que quedó bien: abrí la dirección de `pago-avisado` en el
navegador. Tiene que contestar `pago-avisado, andando`. Si contesta 401,
quedó tildado.

---

## 4. Avisarle a Mercado Pago dónde avisar

*Tus integraciones → Arma el 11 → Notificaciones → Webhooks*

- **URL**: `https://wbqxmoerzofzierurxfb.supabase.co/functions/v1/pago-avisado`
- **Evento**: Pagos

Esto es cinturón y tiradores: la función `crear-pago` ya le manda esa misma
dirección en cada pago (`notification_url`). Con las dos, el día que alguien
toque una pantalla el cobro sigue andando.

---

## 5. Los precios

Están en **un solo lugar**: la tabla `PLANES` arriba de todo en
`funcion-crear-pago.ts`. Se cambia el número, se vuelve a pegar la función,
*Deploy*, y listo — la app pide esos precios para dibujar los botones, así
que no hay forma de que muestre uno y cobre otro.

Los que dejé son un punto de partida, no una decisión:

| Plan | Precio |
|---|---|
| 1 mes | $ 2.500 |
| 3 meses | $ 6.000 |
| 12 meses | $ 20.000 |

Cambialos antes de prenderlo. El de un mes es el que importa: los otros dos
existen para que ese no parezca caro.

---

## 6. Probarlo sin gastar plata

Con las credenciales **de prueba** de Mercado Pago en `MP_ACCESS_TOKEN`, y
usando un usuario de prueba, todo el circuito funciona igual y no se mueve
un peso. Cuando termines, poné las de producción y volvé a desplegar
`crear-pago`.

Lo que hay que ver: entrás con tu cuenta, tocás un plan, pagás, volvés, y en
el panel de tu cuenta dice **"Tenés el pase"**. Si no aparece en un minuto,
mirá los *Logs* de `pago-avisado` en Supabase: ahí dice, en castellano, qué
pago llegó y qué hizo con él.

---

## 7. El cobro ADENTRO de la app (Google Play)

Mercado Pago queda para la web. Adentro de la app publicada en Play, Google
exige su propia facturación para cualquier bien digital, y prohíbe además
mandar al usuario a pagar afuera. No es negociable: durante una prueba
cerrada nadie mira, al pedir producción sí.

La app se da cuenta sola de dónde está corriendo (el envoltorio de Play abre
el sitio con un referrer propio) y ofrece uno u otro. Lo que compró en la
web le sirve igual adentro de la app: el derecho vive en nuestra base, no en
la tienda.

Los pasos, una sola vez:

1. **Los tres productos, en la Play Console.** Monetizar → Productos →
   Productos integrados en la app. Los identificadores tienen que ser
   exactamente `liga`, `tres` y `todas` —son los mismos nombres que usa la
   base—, con su precio en pesos, y hay que **activarlos**.

2. **Una cuenta de servicio de Google Cloud.** En la consola de Google
   Cloud, del proyecto asociado a Play: crear una cuenta de servicio y
   descargar su clave en JSON. Ese archivo es la llave: no va al repositorio,
   no se pega en un chat y no viaja en ningún zip.

3. **Invitarla en la Play Console.** Usuarios y permisos → invitar el mail de
   esa cuenta de servicio, con permiso para **ver información financiera y
   pedidos** y para **administrar pedidos**. Sin esto, Google contesta que no
   conoce la compra.

4. **El secreto en Supabase.** Edge Functions → Secrets → `PLAY_CUENTA`, con
   el JSON entero pegado tal cual.

5. **La función.** Pegar `funcion-pago-play.ts` como `pago-play`, con
   *Verify JWT* **tildado**: la llama la app con la sesión de la persona.

6. **El .aab nuevo.** En PWABuilder hay que tildar la facturación de Google
   Play al generar el paquete. Sin eso, la app no tiene la puerta y los
   botones quedan apagados con el cartel de "todavía no está disponible" —que
   es lo correcto: es preferible a ofrecer un pago que Google no acepta.

Para saber que quedó bien: entrar desde la app instalada, tocar un plan y que
aparezca la ventana de Google (no la de Mercado Pago). El pase se acredita
cuando el servidor le pregunta a Google, igual que con Mercado Pago: del
teléfono no se toma más que el número de comprobante.

---

## Lo que NO hay que hacer nunca

- **No acreditar premium porque el navegador lo diga.** La página de vuelta
  de Mercado Pago (`gracias.html`) no confirma nada a propósito: cualquiera
  puede escribir esa dirección a mano. Quien confirma es el servidor,
  hablando con Mercado Pago por su lado.
- **No poner el precio en la app.** Si el navegador manda cuánto pagar,
  alguien cambia 2500 por 1 en la consola, paga un peso, y Mercado Pago
  confirma un pago perfectamente legítimo de un peso. Eso no se arregla
  después.
- **No pegar la clave de la cuenta de servicio de Google en ningún lado que no sea el secreto de Supabase.** Con ese archivo, cualquiera consulta y toca los pedidos de la app.
- **No mandar el token a nadie.** Si alguna vez se te escapa en un mensaje o
  en un archivo, se revoca en Mercado Pago y se genera otro. Es gratis y
  tarda un minuto.
