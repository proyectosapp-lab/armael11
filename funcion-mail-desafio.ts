/* ══════════════════════════════════════════════════════════════════════════
   MAIL-DESAFIO — el mail del desafío de la semana (27/10/2026).

   Un mail a cada cuenta con mail confirmado, cada vez que hay un desafío
   oficial nuevo. Dice qué desafío abrió, los primeros partidos, la racha del
   modelo y el link. Un mail por desafío por persona (tabla mail_enviado), y
   quien toca "no me mandes más" queda en mail_baja para siempre.

   Lo manda Resend (resend.com). Secretos de la función (Edge Functions → Secrets):
     RESEND_API_KEY   la clave de Resend (empieza con re_). NUNCA va en un archivo.
     RESOLVER_CLAVE   la misma frase que resolver-desafios: la puerta para que la llame el reloj.
     MAIL_DESDE       opcional, "Mano a mano <hola@armael11.com>". Hasta verificar el dominio en Resend,
                      Resend solo deja mandar desde onboarding@resend.dev y solo al mail del dueño de la cuenta.

   Cómo se llama:
     POST  con Authorization: Bearer <RESOLVER_CLAVE>    → manda (lo hace pg_cron después de cada cambio de desafío)
     POST  ?prueba=mail@x.com                            → manda SOLO a ese mail, para ver cómo queda
     GET   ?baja=<id>.<firma>                            → el link de "no me mandes más": da de baja y muestra una página

   No tiene palabras de apuestas. Es un aviso de que abrió el desafío.
   ══════════════════════════════════════════════════════════════════════════ */
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLAVE = Deno.env.get("RESOLVER_CLAVE") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const DESDE = Deno.env.get("MAIL_DESDE") || "Mano a mano <onboarding@resend.dev>";
const APP = "https://armael11.com/app/";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
const html = (t: string, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function mismoSecreto(a: string, b: string): boolean {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0;
}
async function firma(id: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id + "|" + CLAVE));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function rpc(nombre: string, args: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/rpc/" + nombre, { method: "POST", headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });
  if (!r.ok) throw new Error(nombre + " → " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function tabla(ruta: string) {
  const r = await fetch(SB_URL + "/rest/v1/" + ruta, { headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE } });
  if (!r.ok) throw new Error(ruta + " → " + r.status); return r.json();
}

/* ─── el desafío oficial de hoy ─── */
async function desafioOficial() {
  const aj = await tabla("ajuste?select=valor&clave=eq.desafio_oficial");
  const codigo = aj?.[0]?.valor; if (!codigo) return null;
  const d = await rpc("ver_desafio", { p_codigo: codigo });
  if (!d || !d.codigo || d.estado === "terminado") return null;
  return d;
}
const ZONA = "America/Argentina/Buenos_Aires";
const DEP: Record<string, string> = { futbol: "Fútbol", tenis: "Tenis", nba: "NBA" };
const cuando = (iso: string) => { try { return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)); } catch { return ""; } };

export function armarMail(d: any, racha: any, bajaUrl: string) {
  const partidos = (d.partidos || []).filter((p: any) => !p.empezo).slice(0, 6);
  const link = APP + "#desafio=" + d.codigo;
  const rachaTxt = racha && racha.desafios > 0 && racha.arriba > 0
    ? `El modelo, en ${racha.desafios === 1 ? "el último desafío" : "los últimos " + racha.desafios + " desafíos"}: <b>${racha.modelo} de ${racha.jugados}</b>, ${racha.arriba === racha.desafios ? (racha.desafios === 1 ? "arriba de todos" : "arriba de todos las " + (racha.desafios === 2 ? "dos" : racha.desafios) + " veces") : "arriba de todos en " + racha.arriba + " de " + racha.desafios}.`
    : "";
  const filas = partidos.map((p: any) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #2A2521;color:#F6F1EA;font-size:15px"><span style="color:#A39B93;font-size:11px;letter-spacing:.5px;text-transform:uppercase">${esc(p.rotulo || DEP[p.deporte] || "")}</span><br>${esc(p.local)} – ${esc(p.visita)}</td><td style="padding:8px 10px;border-bottom:1px solid #2A2521;color:#A39B93;font-size:12px;text-align:right;white-space:nowrap">${esc(cuando(p.empieza))}</td></tr>`).join("");
  const mas = (d.partidos || []).length - partidos.length;
  const asunto = `Abrió ${d.nombre}: el modelo ya eligió`;
  const texto = `Abrió ${d.nombre} en Mano a mano: ${(d.partidos || []).length} partidos. El modelo ya eligió. ¿Le vas en contra? Juega: ${link}\n\nPara no recibir más estos mails: ${bajaUrl}`;
  const cuerpo = `<!doctype html><html lang="es"><body style="margin:0;background:#14110F;font-family:Poppins,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:28px 18px">
    <p style="margin:0 0 18px;color:#DFF140;font-weight:700;font-size:13px;letter-spacing:1px">MANO A MANO</p>
    <h1 style="margin:0 0 6px;color:#fff;font-size:28px;line-height:1.1">Abrió ${esc(d.nombre)}.</h1>
    <p style="margin:0 0 18px;color:#A39B93;font-size:15px">${(d.partidos || []).length} partidos de ${esc([...new Set((d.partidos || []).map((p: any) => p.deporte === "nba" ? "NBA" : (DEP[p.deporte] || "").toLowerCase()))].join(", "))}. <b style="color:#F6F1EA">El modelo ya eligió. ¿Le vas en contra?</b></p>
    ${rachaTxt ? `<div style="background:#2E2823;border-radius:12px;padding:12px 14px;margin:0 0 18px;color:#F6F1EA;font-size:14px">${rachaTxt}</div>` : ""}
    <table style="width:100%;border-collapse:collapse;background:#221D1A;border-radius:14px;overflow:hidden">${filas}</table>
    ${mas > 0 ? `<p style="margin:8px 0 0;color:#6B6359;font-size:12px">y ${mas} más</p>` : ""}
    <p style="margin:24px 0 8px"><a href="${link}" style="display:inline-block;background:#DFF140;color:#14110F;text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:14px">Jugar ahora</a></p>
    <p style="margin:0 0 24px;color:#A39B93;font-size:13px">Gratis, con tu apodo. Eliges a ciegas y se revela cuando empieza cada partido.</p>
    <p style="margin:0;color:#6B6359;font-size:11px;line-height:1.5">Mano a mano es una app independiente, sin relación con ligas, clubes ni jugadores.<br><a href="${bajaUrl}" style="color:#6B6359">No quiero recibir más estos mails</a></p>
  </div></body></html>`;
  return { asunto, texto, cuerpo };
}

async function mandar(lote: Array<{ to: string; subject: string; html: string; text: string }>) {
  if (!RESEND) throw new Error("falta RESEND_API_KEY");
  const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" }, body: JSON.stringify(lote.map((m) => ({ from: DESDE, to: [m.to], subject: m.subject, html: m.html, text: m.text }))) });
  const t = await r.text(); if (!r.ok) throw new Error("Resend → " + r.status + " " + t.slice(0, 300));
  return t;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  // ── la baja, por el link del mail ──
  const baja = u.searchParams.get("baja");
  if (req.method === "GET" && baja) {
    const [id, f] = baja.split("."); if (!id || !f || !mismoSecreto(f, await firma(id))) return html("<p>Ese link no sirve.</p>", 400);
    try { await rpc("mail_dar_baja", { p_perfil: id }); } catch (e) { console.error(e); return html("<p>No pude hacerlo. Probá de nuevo más tarde.</p>", 500); }
    return html(`<!doctype html><html lang="es"><body style="margin:0;background:#14110F;color:#F6F1EA;font-family:Poppins,Helvetica,Arial,sans-serif"><div style="max-width:520px;margin:0 auto;padding:60px 18px"><p style="color:#DFF140;font-weight:700;font-size:13px;letter-spacing:1px">MANO A MANO</p><h1 style="font-size:26px">Listo. No te mandamos más mails.</h1><p style="color:#A39B93">Los desafíos siguen en la app, cuando quieras: <a href="${APP}" style="color:#DFF140">armael11.com/app</a></p></div></body></html>`);
  }
  if (req.method !== "POST") return json({ error: "método" }, 405);
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!mismoSecreto(auth, CLAVE) && !mismoSecreto(auth, SB_SERVICE)) return json({ error: "no" }, 401);

  const d = await desafioOficial();
  if (!d) return json({ ok: true, mandados: 0, motivo: "no hay desafío abierto" });
  let racha = null; try { racha = await rpc("modelo_racha", {}); } catch { racha = null; }
  const prueba = u.searchParams.get("prueba");
  const tipo = "desafio";
  let gente: Array<{ id: string; email: string; usuario: string }>;
  if (prueba) gente = [{ id: "00000000-0000-0000-0000-000000000000", email: prueba, usuario: "prueba" }];
  else gente = (await rpc("mail_destinatarios", { p_tipo: tipo, p_clave: d.codigo })) || [];
  let mandados = 0; const errores: string[] = [];
  for (let i = 0; i < gente.length; i += 50) {
    const parte = gente.slice(i, i + 50);
    const lote = [];
    for (const g of parte) { const m = armarMail(d, racha, u.origin + u.pathname + "?baja=" + g.id + "." + await firma(g.id)); lote.push({ to: g.email, subject: m.asunto, html: m.cuerpo, text: m.texto }); }
    try { await mandar(lote); mandados += lote.length; if (!prueba) for (const g of parte) { try { await rpc("mail_marcar", { p_perfil: g.id, p_tipo: tipo, p_clave: d.codigo }); } catch (e) { console.error(e); } } }
    catch (e) { errores.push(String(e)); console.error(e); }
  }
  return json({ ok: !errores.length, desafio: d.codigo, destinatarios: gente.length, mandados, errores });
});
