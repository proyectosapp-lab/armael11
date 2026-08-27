# Enchufar armael11.com

Cinco lugares, y **el orden importa**. Si se sube el zip antes de que el DNS
funcione, el sitio queda inalcanzable por las dos direcciones a la vez. Por
qué: el zip trae un archivo `CNAME` que le dice a GitHub "de ahora en más
contesto en armael11.com", y GitHub empieza a mandar a todo el mundo ahí. Si
esa dirección todavía no lleva a ningún lado, no queda ninguna que funcione.

Así que: **DNS primero, zip al final.**

---

## 1. En el registrador: apuntar el dominio a GitHub

En la zona DNS de `armael11.com`, cuatro registros **A** para el dominio pelado
(aparece como `@` o como `armael11.com`, según el registrador):

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Cuatro **AAAA**, que son los mismos servidores por IPv6:

```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

Y un **CNAME** para `www` apuntando a `proyectosapp-lab.github.io`.

Estas direcciones son de GitHub. **Copialas de su documentación, no de este
archivo**: si algún día las cambian, esto queda viejo y el sitio se cae sin
que nadie entienda por qué. Están en *Managing a custom domain for your GitHub
Pages site*.

El DNS tarda: puede andar en cinco minutos o en unas horas. No hay nada que
apurar ni que tocar mientras tanto.

## 2. En el repositorio: decirle a GitHub cuál es

**Settings → Pages → Custom domain**: `armael11.com` → **Save**.

GitHub chequea el DNS. Cuando pasa, aparece **Enforce HTTPS** — tildalo. Si
está en gris, el certificado todavía no salió: esperá y volvé. Puede tardar
una hora.

**No sigas hasta que `https://armael11.com` abra la portada con los 30 clubes.**

## 3. Recién ahora: subir el zip

`sitio.json` ya viene con `"dominio": "armael11.com"`. Al subirlo, la corrida
escribe el `CNAME` y **todas** las direcciones absolutas pasan al dominio
nuevo: la tarjeta que muestra WhatsApp, la dirección canónica que leen los
buscadores y el link que se comparte. Si quedaran las dos vivas, la tarjeta
diría una cosa y el link llevaría a otra.

## 4. En Supabase: las direcciones de vuelta

`Authentication → URL Configuration`:

- **Site URL**: `https://armael11.com`
- **Redirect URLs**: agregá `https://armael11.com/**`

**Este paso no es opcional.** Si queda la dirección vieja, el link del mail
sigue llevando a `github.io`, o a la raíz, que fue el 404 de la primera vez.
Dejá la vieja en la lista un par de semanas, por si alguien tiene un link a
medio usar.

## 5. En Brevo: que el mail salga del dominio

**Senders, Domains & Dedicated IPs → Domains → Add a domain**: `armael11.com`.
Te da unos registros **TXT** para cargar en el mismo DNS del paso 1.

Eso es lo que le prueba a Gmail que los mails son tuyos. Sin esto llegan, pero
caen en spam seguido; con esto, entran a la bandeja. Después el remitente pasa
a ser `hola@armael11.com` y en Supabase se actualiza el *Sender email* de
SMTP Settings.

---

## Cómo saber que quedó bien

1. `https://armael11.com` abre la portada con los 30 clubes.
2. Pegar `https://armael11.com/talleres-cba.html` en WhatsApp muestra la
   tarjeta con el nombre del club, no un renglón gris.
3. Pedir un link de ingreso y que llegue **a la bandeja de entrada**, no a
   spam, desde `armael11.com`.
4. Que ese link te devuelva a la app con la sesión ya iniciada.

Si falla solo el 3, es el paso 5 y nada más.

## Si algo sale mal

**El sitio no abre en ninguna de las dos direcciones.** Se subió el zip antes
de tiempo. Solución: en `sitio.json`, poner `"dominio": ""` y volver a subir —
la corrida borra el `CNAME` y GitHub vuelve a contestar en `github.io`.

**Abre pero sin candado.** El certificado todavía no salió. Es esperar.

**El link del mail lleva a otro lado.** Paso 4.
