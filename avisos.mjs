/* ══════════════════════════════════════════════════════════════════════════
   AVISOS — mandar una notificación al teléfono cuando sale el once del DT.

   Web Push, sin ninguna librería. Se explica por qué, porque es la decisión
   rara de este archivo: este proyecto no tiene node_modules -todo lo que
   corre es Node pelado- y no lo va a tener por una función. Lo que hace
   `web-push` en npm es criptografía estándar que Node trae adentro: una
   firma ES256 para probar que el que manda somos nosotros (VAPID, RFC 8292)
   y un cifrado con la clave del teléfono para que ni Google ni Mozilla
   puedan leer el mensaje (RFC 8291). Son sesenta líneas, y lo mejor: el
   RFC 8291 trae un ejemplo completo con todas las claves y el resultado
   esperado byte por byte, así que se puede PROBAR que está bien sin mandar
   nada a nadie. Está en probar-avisos.mjs.

   Cómo se usa, de punta a punta:
     · El teléfono se suscribe desde la app (sw.js + cuentas.js) y deja su
       "suscripción" -una URL de Google/Mozilla y dos claves- en la tabla
       `aviso` de Supabase, junto con el club que le interesa.
     · La ronda corta (formaciones.mjs) encuentra una formación nueva y llama
       a `avisarClub(club, texto)`: lee las suscripciones de ese club con la
       clave de servicio, cifra el mensaje para cada una y lo entrega.
     · Una suscripción que contesta 404 o 410 murió (desinstaló, revocó):
       se borra.

   Claves: la PÚBLICA de VAPID va en sitio.json, porque el teléfono la
   necesita para suscribirse. La PRIVADA va como secreto del repositorio,
   VAPID_PRIVATE_KEY, y nada más.
   ══════════════════════════════════════════════════════════════════════════ */
import { createECDH, createCipheriv, hkdfSync, randomBytes, sign, createPrivateKey } from "node:crypto";

const b64u = {
  de: t => Buffer.from(String(t).replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  a:  b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
};

/* ─── el cifrado (RFC 8291 + RFC 8188, aes128gcm) ────────────────────────
   `opciones` existe solo para las pruebas: dejan fijar la clave efímera y
   la sal, que en la vida real son al azar, para reproducir el ejemplo del
   RFC byte por byte. */
export function cifrar(texto, p256dh, auth, opciones = {}) {
  const uaPublica = b64u.de(p256dh);                     // 65 bytes, la del teléfono
  const secretoAuth = b64u.de(auth);                     // 16 bytes
  const efimera = createECDH("prime256v1");
  if (opciones.privadaEfimera) efimera.setPrivateKey(b64u.de(opciones.privadaEfimera));
  else efimera.generateKeys();
  const asPublica = efimera.getPublicKey();              // 65 bytes, la nuestra
  const compartido = efimera.computeSecret(uaPublica);
  const sal = opciones.sal ? b64u.de(opciones.sal) : randomBytes(16);

  /* RFC 8291 §3.3 y §3.4: primero un IKM que mezcla el secreto ECDH con el
     `auth` del teléfono y las dos claves públicas; después, de ese IKM y la
     sal, la clave de contenido y el nonce. */
  const infoIKM = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublica, asPublica]);
  const ikm = Buffer.from(hkdfSync("sha256", compartido, secretoAuth, infoIKM, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: nonce\0"), 12));

  /* Un solo registro: el texto más el byte 0x02 que dice "es el último". */
  const claro = Buffer.concat([Buffer.from(texto, "utf8"), Buffer.from([2])]);
  const cifra = createCipheriv("aes-128-gcm", cek, nonce);
  const cuerpo = Buffer.concat([cifra.update(claro), cifra.final(), cifra.getAuthTag()]);

  /* La cabecera de RFC 8188: sal (16), tamaño de registro (4), largo de la
     clave (1) y la clave pública efímera (65). */
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  const cabecera = Buffer.concat([sal, rs, Buffer.from([asPublica.length]), asPublica]);
  return { cuerpo: Buffer.concat([cabecera, cuerpo]), ikm, cek, nonce, sal, asPublica };
}

/* ─── la firma VAPID (RFC 8292) ──────────────────────────────────────────
   Un JWT firmado con nuestra clave privada. El servicio de push (Google,
   Mozilla) la verifica con la pública que el teléfono dio al suscribirse.
   `aud` es el origen del endpoint; `sub` un contacto por si algo anda mal. */
export function cabecerasVapid(endpoint, publica, privada, contacto, ahora = Date.now()) {
  const aud = new URL(endpoint).origin;
  const cab = b64u.a(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = b64u.a(Buffer.from(JSON.stringify({ aud, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: contacto })));
  const dato = cab + "." + cuerpo;
  /* La privada viene en base64url de 32 bytes (como la escribe todo el
     mundo); Node quiere un PKCS8. Se arma el envoltorio a mano: es un
     prefijo fijo para P-256. */
  const d = b64u.de(privada);
  const pkcs8 = Buffer.concat([Buffer.from("308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420", "hex"), d]);
  const clave = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const firma = sign("sha256", Buffer.from(dato), { key: clave, dsaEncoding: "ieee-p1363" });
  return {
    Authorization: "vapid t=" + dato + "." + b64u.a(firma) + ", k=" + publica,
  };
}

/* Un par de claves VAPID nuevo. Se corre UNA vez; la pública va a sitio.json
   y la privada al secreto. */
export function nuevasClavesVapid() {
  const e = createECDH("prime256v1"); e.generateKeys();
  return { publica: b64u.a(e.getPublicKey()), privada: b64u.a(e.getPrivateKey()) };
}

/* ─── entregar un aviso a una suscripción ────────────────────────────────── */
export async function entregar(sus, texto, vapid, { ttl = 3600, fetchFn = fetch } = {}) {
  const { cuerpo } = cifrar(texto, sus.claves.p256dh, sus.claves.auth);
  const r = await fetchFn(sus.endpoint, {
    method: "POST",
    headers: {
      ...cabecerasVapid(sus.endpoint, vapid.publica, vapid.privada, vapid.contacto),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": String(ttl),
      "Urgency": "high",
    },
    body: cuerpo,
  });
  /* 404 y 410: la suscripción ya no existe. Es la señal para borrarla. */
  return { ok: r.ok, status: r.status, murio: r.status === 404 || r.status === 410 };
}

/* ─── avisar a todos los del club ──────────────────────────────────────────
   Lee las suscripciones de Supabase con la clave de servicio -desde el
   navegador no se pueden leer: la política no lo permite- y entrega una por
   una. Devuelve cuántas llegaron y cuántas se dieron de baja. */
export async function avisarClub({ supabaseUrl, serviceKey, vapid, club, titulo, cuerpo, url, fetchFn = fetch, log = () => {} }) {
  const cab = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };
  const r = await fetchFn(supabaseUrl + "/rest/v1/aviso?club=eq." + encodeURIComponent(club) + "&select=endpoint,claves", { headers: cab });
  if (!r.ok) throw new Error("no pude leer las suscripciones: HTTP " + r.status);
  const lista = await r.json();
  const texto = JSON.stringify({ titulo, cuerpo, url });
  let llegaron = 0, bajas = 0;
  for (const s of lista) {
    try {
      const e = await entregar(s, texto, vapid, { fetchFn });
      if (e.ok) llegaron++;
      else if (e.murio) {
        bajas++;
        await fetchFn(supabaseUrl + "/rest/v1/aviso?endpoint=eq." + encodeURIComponent(s.endpoint),
                      { method: "DELETE", headers: cab });
      } else log("    aviso rebotado: HTTP " + e.status);
    } catch (e) { log("    aviso falló: " + e.message); }
  }
  return { total: lista.length, llegaron, bajas };
}
