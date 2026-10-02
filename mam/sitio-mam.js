// sitio-mam.js — la configuración pública de Mano a mano. Todo lo que hay acá es público a propósito:
// las claves 'anon' de Supabase y 'appl_' de RevenueCat viajan adentro de cada copia de la app y solas no
// autorizan nada que las políticas del servidor no permitan. Las secretas (service_role, sk_) NO van en ningún
// archivo: viven como secretos de Supabase y de GitHub.
window.MAM_SITIO = {
  nombre: "Mano a mano",
  supabase: {
    url: "https://wbqxmoerzofzierurxfb.supabase.co",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndicXhtb2Vyem9memllcnVyeGZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDI5NjksImV4cCI6MjEwMzMxODk2OX0.PzYAzjnc97aAMtXi3lCZKlxwWZFNl2Tgh23ipIDkYxQ"
  },
  // la clave PÚBLICA de RevenueCat de la app (la misma app de RevenueCat que Armá el 11: el paquete es com.armael11.app).
  // En Android, RevenueCat da OTRA clave pública (goog_…): va en `revenuecatAndroid`.
  apple: { revenuecat: "appl_dQnGEbXpKWceFceVepoLEHQGWNn" },
  android: { revenuecat: "" },
  // los tres sitios: de acá bajan los datos cuando hay red, y a acá van los links que se abren afuera
  sitios: { futbol: "https://armael11.com", tenis: "https://sacavos.com", nba: "https://armaelquinteto.com" },
  // dónde viven las sub-apps adentro del paquete (relativo a index.html). En la web de prueba pueden ser los sitios.
  apps: { futbol: "futbol/index.html", tenis: "tenis/index.html", nba: "nba/index.html" },
  // el link de un desafío: una página del sitio de fútbol que muestra la vista previa y manda a la tienda.
  // La app registra este dominio como "link universal", así el que ya la tiene abre el desafío adentro.
  desafios: { dominio: "https://armael11.com", ruta: "/desafio.html" },
  // el link de la App Store se completa cuando la app esté publicada (App Store Connect → Información de la app → Ver en App Store)
  tiendas: { apple: "", play: "https://play.google.com/store/apps/details?id=com.armael11.app" },
  // los avisos al teléfono (push) llegan en una versión siguiente: mientras esté en false no se pide permiso para nada
  avisos: false,
  privacidad: "https://armael11.com/privacidad.html",
  terminos: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
};
