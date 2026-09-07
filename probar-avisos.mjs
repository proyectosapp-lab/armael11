/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LOS AVISOS
     node probar-avisos.mjs
   No manda nada a nadie. Prueba tres cosas que sí se pueden probar en seco:

   1. EL CIFRADO CONTRA EL EJEMPLO DEL RFC 8291. El RFC trae un mensaje, las
      claves de los dos lados, la sal, y el resultado esperado byte por
      byte. Si sale igual, el cifrado está bien; no hay forma más fuerte de
      probar criptografía que reproducir el vector del estándar.
   2. LA FIRMA VAPID se verifica con la clave pública, como la verifica el
      servicio de push.
   3. EL ENVÍO, con una red de mentira: una suscripción que contesta 410 se
      borra; una que contesta 201 cuenta como entregada.
   ══════════════════════════════════════════════════════════════════════════ */
import { cifrar, cabecerasVapid, nuevasClavesVapid, avisarClub } from "./avisos.mjs";
import { createPublicKey, verify } from "node:crypto";

const casos = [];
const caso = (n, ok, d = "") => casos.push([n, ok, d]);
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* ─── 1. el vector del RFC 8291, apéndice A ──────────────────────────────── */
{
  const r = cifrar("When I grow up, I want to be a watermelon",
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    "BTBZMqHH6r4Tts7J_aSIgg",
    { privadaEfimera: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", sal: "DGv6ra1nlYgDCS1FRnbzlw" });
  caso("la clave intermedia (IKM) sale como en el RFC", b64u(r.ikm) === "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg", b64u(r.ikm));
  caso("la clave de contenido también", b64u(r.cek) === "oIhVW04MRdy2XN9CiKLxTg");
  caso("y el nonce", b64u(r.nonce) === "4h_95klXJ5E_qnoN");
  caso("el mensaje cifrado es IDÉNTICO al del estándar, byte por byte",
       b64u(r.cuerpo) === "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  /* Sin fijar la sal ni la clave efímera, dos cifrados del mismo texto no
     se parecen en nada: eso es lo que impide que alguien reconozca un
     mensaje repetido. */
  const a = cifrar("hola", "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
  const b = cifrar("hola", "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");
  caso("dos envíos del mismo texto no se parecen", !a.cuerpo.equals(b.cuerpo));
}

/* ─── 2. la firma VAPID ──────────────────────────────────────────────────── */
{
  const k = nuevasClavesVapid();
  caso("las claves nuevas tienen el tamaño justo: 65 bytes la pública, 32 la privada",
       Buffer.from(k.publica.replace(/-/g, "+").replace(/_/g, "/"), "base64").length === 65 &&
       Buffer.from(k.privada.replace(/-/g, "+").replace(/_/g, "/"), "base64").length === 32);
  const h = cabecerasVapid("https://fcm.googleapis.com/fcm/send/x", k.publica, k.privada, "mailto:x@y.z", 1_800_000_000_000);
  const t = h.Authorization.match(/t=([^,]+)/)[1];
  const [cab, cuerpo, firma] = t.split(".");
  const pub = Buffer.from(k.publica.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const spki = Buffer.concat([Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"), pub]);
  const clave = createPublicKey({ key: spki, format: "der", type: "spki" });
  const ok = verify("sha256", Buffer.from(cab + "." + cuerpo), { key: clave, dsaEncoding: "ieee-p1363" },
                    Buffer.from(firma.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  caso("la firma se verifica con la clave pública, como hace Google", ok);
  const claims = JSON.parse(Buffer.from(cuerpo, "base64").toString());
  caso("el destinatario es el ORIGEN del endpoint, no la URL entera", claims.aud === "https://fcm.googleapis.com");
  caso("y vence en doce horas", claims.exp === 1_800_000_000 + 12 * 3600);
  caso("la cabecera lleva la pública al lado, para que la comparen", h.Authorization.includes("k=" + k.publica));
}

/* ─── 3. el envío, con red de mentira ────────────────────────────────────── */
{
  const k = nuevasClavesVapid();
  const sus = n => ({ endpoint: "https://push.example/" + n,
    claves: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
              auth: "BTBZMqHH6r4Tts7J_aSIgg" } });
  const llamadas = [];
  const fetchFalso = async (url, o = {}) => {
    llamadas.push({ url, metodo: o.method || "GET", cab: o.headers || {}, largo: o.body ? o.body.length : 0 });
    if (url.includes("/rest/v1/aviso?club=")) return { ok: true, status: 200, json: async () => [sus("viva"), sus("muerta")] };
    if (url.endsWith("/muerta")) return { ok: false, status: 410 };
    if (url.endsWith("/viva")) return { ok: true, status: 201 };
    return { ok: true, status: 204 };
  };
  const r = await avisarClub({ supabaseUrl: "https://base.supabase.co", serviceKey: "svc", club: "talleres-cba",
    vapid: { publica: k.publica, privada: k.privada, contacto: "mailto:x@y.z" },
    titulo: "Salió el once", cuerpo: "4-2-3-1", url: "https://armael11.com/talleres-cba.html", fetchFn: fetchFalso });
  caso("se leen las suscripciones del club con la clave de servicio",
       llamadas[0].url.includes("club=eq.talleres-cba") && llamadas[0].cab.apikey === "svc");
  caso("se entrega a la viva y cuenta", r.llegaron === 1);
  caso("la que contesta 410 se borra de la base", r.bajas === 1 &&
       llamadas.some(l => l.metodo === "DELETE" && l.url.includes("endpoint=eq.") && l.url.includes("muerta")));
  const envio = llamadas.find(l => l.url.endsWith("/viva"));
  caso("el envío va cifrado (aes128gcm) y con la firma VAPID",
       envio.cab["Content-Encoding"] === "aes128gcm" && /^vapid t=/.test(envio.cab.Authorization) && envio.largo > 86);
  caso("con un TTL: un aviso de formación no sirve mañana", envio.cab.TTL === "3600");
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n + (ok || !d ? "" : "   → " + d)));
const mal = casos.filter(c => !c[1]).length;
console.log(linea + "\n\n" + (mal ? mal + " de " + casos.length + " MAL\n" : casos.length + " de " + casos.length + ". Todo bien.\n"));
process.exit(mal ? 1 : 0);
