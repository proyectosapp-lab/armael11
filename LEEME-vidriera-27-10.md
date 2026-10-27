# Mano a mano — la vidriera (27/10/2026)

Todo lo que se construyó el martes para que el jueves la app y las webs vendan solas.
Un zip, los mismos caminos que el repo `armael11`: se sube por la web de GitHub arrastrando
la carpeta y GitHub reemplaza los archivos que ya existen.

## Qué cambia (lo que ve la gente)

1. **Piel noche y día.** La app arranca en noche (negro cálido + lima). En Cuenta hay una
   tarjeta "Piel" con tres chips: Noche, Día, Automática. Las tres webs la siguen adentro de la app
   (fútbol ya; tenis y NBA con el snippet de abajo). La web de fútbol en modo oscuro ahora es el
   mismo negro cálido de la app, no el azul de antes.
2. **La pantalla del desafío, rediseñada.** Portada arriba ("El modelo también juega: elige antes
   que todos…"), la racha del modelo ("Últimos 2 desafíos: 17 de 23, arriba de todos las dos veces"),
   los partidos como tarjetas grandes con la elección marcada en lima, y un pie con "Te falta 1 partido".
3. **Elegir sin cuenta.** Quien llega por el link del reel ya no pasa por la bienvenida ni por el
   apodo: ve el desafío, toca sus partidos y recién al Guardar se le pide el apodo. Una pantalla
   menos antes de jugar.
4. **Compartir al guardar.** Apenas guarda, aparece "¿A quién le mandas el desafío?": WhatsApp directo y el
   menú del sistema, con el texto de invitación listo.
5. **7 días gratis con cuenta (web).** En Cuenta, quien tiene apodo y nunca la usó ve "7 días
   gratis": un toque y tiene fútbol, tenis y NBA por 7 días. Una vez por cuenta. En las tiendas no
   aplica: ahí la prueba la define cada tienda (ver abajo).
6. **La portada de armael11.com vende.** "Deja de adivinar. Simula el partido.", dos botones
   (Simular ahora / El desafío de la semana) y una tarjeta con la racha del modelo en vivo que lleva
   al desafío. Adentro de la app no aparece (ahí el desafío ya es una pestaña).
7. **Medición.** La app cuenta, sin seguir a nadie, cuántos abren, abren un desafío, eligen,
   guardan, hacen cuenta y miran planes (mam-app / mam-web). Si llegaron con `?c=CODIGO` en el link
   del anuncio, los mismos pasos se cuentan bajo ese código. El control corto (control-mam.html)
   los muestra en "Mano a mano, paso por paso".
8. **Mail del desafío.** Cada vez que abre un desafío oficial, un mail a cada cuenta con mail
   confirmado (hoy son 39): qué abrió, los partidos, la racha y el botón "Jugar ahora". Un mail por
   desafío por persona, con link de baja. Lo manda Resend. FALTA LA CLAVE (ver abajo).

## Los archivos del zip

| Archivo | Qué es |
|---|---|
| `mam/hitos.js` | NUEVO: la medición. |
| `mam/index.html` | carga hitos.js y pone la piel antes del CSS (sin parpadeo). |
| `mam/mam.js` | piel, hitos, tarjeta de prueba, chips de piel en Cuenta. |
| `mam/mam.css` | la piel noche/día, el desafío rediseñado, compartir, prueba. |
| `mam/desafios.js` | racha, portada del desafío, elegir sin cuenta, apodo al guardar, compartir. |
| `mam/mam-cuentas.js` | `mis_pases_mam`, `estadoPrueba`, `empezarPrueba`. |
| `mam/mam-marco.js` y `mam-marco.js` | el puente que avisa la piel a cada web (`alTema`). |
| `app.tpl.html` | la web de fútbol: noche cálida, portada que vende, racha en vivo, sigue la piel adentro de la app. |
| `control-mam.tpl.html` | el control corto con los pasos. |
| `probar-mam.mjs` | 177 pruebas (las 2 de "cabecera propia" de tenis/NBA fallan solo con los stubs de prueba). |
| `racha-y-hitos-mam.sql`, `prueba-y-mail-mam.sql` | copia de lo que YA está aplicado en Supabase. No hay que correrlos. |
| `funcion-mail-desafio.ts` | copia de la Edge Function `mail-desafio`, YA desplegada. |

Después de subir: Actions corre `publicar` como siempre (construye el sitio y la app web en
armael11.com/app). Para las tiendas, la build de Codemagic de siempre; el número de versión lo
decidís vos (sugerido 1.5.0: la piel es cambio visible).

## Lo que te toca a vos (3 cosas, 20 minutos)

### 1. Resend (el mail)
1. Crear cuenta en resend.com (gratis: 3.000 mails por mes, 100 por día; sobra).
2. **API Keys → Create** → copiar la clave (empieza con `re_`).
3. Supabase → Edge Functions → **Secrets** → agregar `RESEND_API_KEY` con esa clave. Nada más:
   la función ya está desplegada y el reloj ya la llama cada hora de 10 a 20.
4. Hasta verificar el dominio, Resend solo manda desde `onboarding@resend.dev` y SOLO al mail de tu
   cuenta de Resend. Para probar cómo queda, en Supabase → Edge Functions → mail-desafio → Invoke
   (o desde el SQL editor) con `?prueba=tu@mail.com`. Si te llega, está todo bien.
5. Para mandar a los 39: **Domains → Add domain → armael11.com**. Resend te da 3 registros DNS
   (un MX y dos TXT) que cargás donde está el dominio. Cuando diga Verified, agregás el secreto
   `MAIL_DESDE` = `Mano a mano <hola@armael11.com>`. A la hora siguiente salen los mails.
   Hasta entonces la función intenta cada hora y falla sin molestar a nadie.

### 2. La prueba de 7 días en las tiendas
En la web ya anda. En las apps instaladas la prueba la maneja la tienda:
- **App Store Connect** → la app → Suscripciones → cada plan → **Ofertas introductorias →
  Prueba gratuita → 7 días**. Es un formulario, no hay que mandar build nueva.
- **Play Console** → Monetización → Suscripciones → cada plan → **Ofertas → Prueba gratuita → 7
  días**.
Las apps muestran lo que la tienda ofrece, así que aparece solo.

### 3. Las webs de tenis y NBA (sacavos y starting5)
Adentro de la app, el cascarón les avisa la piel. Dos formas de seguirla, elegí una por web:
- **Solo CSS (la fácil):** el puente pone `data-mam-tema="noche"` o `"dia"` en el `<html>` de la
  web. Alcanza con reglas tipo `html[data-mam-tema="dia"]{ --fondo:#F6F1EA; --tinta:#14110F; … }`
  en el CSS de cada una, usando las mismas variables que ya usen para su tema claro.
- **JS (si la web ya tiene botón de tema):** donde maneja el tema, agregar
  `if(window.mamMarco && window.mamMarco.adentro() && window.mamMarco.alTema) window.mamMarco.alTema(t => { /* t es "noche" o "dia": aplicar el tema oscuro o claro */ });`
Si la web publica su propio `mam-marco.js`, reemplazarlo por el de este zip (el viejo no tiene
`alTema`). Si no lo publica, el empaquetador ya le pone el nuevo.

## Reglas que se respetaron
Ninguna palabra de apuestas ni de premios; "app independiente" en el mail y en la portada; no se
dice cómo elige el modelo ni cómo se arma el desafío; la racha solo se muestra cuando el modelo
quedó arriba de todos; tuteo neutro en el producto; ningún link a sitios que vendan planes adentro
de la app; ninguna clave en ningún archivo.
