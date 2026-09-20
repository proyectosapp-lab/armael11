/* ══════════════════════════════════════════════════════════════════════════
   CONTROL — las cuentas de la pantalla de seguimiento.

   ─── POR QUÉ ESTO ESTÁ EN UN ARCHIVO APARTE Y NO ADENTRO DEL HTML ────────
   Porque son las cuentas, y las cuentas se prueban. Un panel que muestra
   "de cada 100 que llegaron, 26 simularon" es un número con el que se
   deciden gastos de plata: si divide mal, la decisión sale mal y nada avisa.

   Adentro del `<style>` de una página no hay forma de correr un caso. Acá
   sí: `probar-control.mjs` las corre todas sin abrir un navegador.

   ─── LA REGLA QUE ORDENA TODO EL ARCHIVO ─────────────────────────────────
   **Ninguna función de acá inventa un número.** Cuando el dato no alcanza
   —cero llegadas, ningún día con uso, la plata sin cargar— se devuelve
   `null` y la pantalla escribe una raya. Un cero y un "no sé" se parecen
   mucho en una tabla y significan cosas opuestas: uno dice que nadie entró,
   el otro que no estábamos contando. Confundirlos fue exactamente lo que
   pasó con el contador de uso entre el 19 y el 20 de septiembre.
   ══════════════════════════════════════════════════════════════════════════ */

/* Todo lo de acá lleva `ctl` por la misma razón que `campana.js` lleva
   `camp`: la página se arma con <script> clásicos, que comparten UN ámbito
   global, y dos archivos que declaran el mismo nombre no se pisan, se
   matan. */

export const CTL_META_TESTERS = 12;   /* lo que pide Google en la prueba cerrada */

const num = v => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : 0;
};

/* ── EL PORCENTAJE, SIN INVENTAR ─────────────────────────────────────────
   Sobre cero no se divide y no se devuelve cero: se devuelve null. "0% de
   los que llegaron simularon" con nadie que haya llegado es una frase falsa
   que además desanima. */
export function porcentaje(parte, total, decimales = 0) {
  const t = num(total);
  if (!t) return null;
  const p = (num(parte) / t) * 100;
  const f = Math.pow(10, decimales);
  return Math.round(p * f) / f;
}

/* ── LA SERIE DE DÍAS, SIN AGUJEROS ──────────────────────────────────────
   La base devuelve solo los días que tuvieron algo. Un gráfico armado con
   eso miente: dos días con uso separados por una semana muerta se dibujan
   pegados y parece que el uso fue parejo. Acá se rellenan los días vacíos
   con ceros, que es lo que de verdad pasó.

   `hasta` incluido. Las fechas son cadenas "AAAA-MM-DD" y se comparan como
   cadenas a propósito: con `Date` entra el huso horario, y el día de la
   base ya viene calculado en hora argentina. Pasarlo por `Date` acá lo
   correría tres horas y el domingo a la noche cambiaría de día. */
export function diaSiguiente(dia) {
  const d = new Date(String(dia) + "T12:00:00Z");
  if (isNaN(d)) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function serieDeDias(filas, desde, hasta) {
  if (!desde || !hasta || desde > hasta) return [];
  const porDia = new Map();
  for (const f of (filas || [])) if (f && f.dia) porDia.set(String(f.dia), f);
  const out = [];
  let d = String(desde);
  /* Tope de seguridad: una fecha rara no puede colgar la pantalla. */
  for (let i = 0; i < 400 && d && d <= String(hasta); i++) {
    const f = porDia.get(d) || {};
    out.push({
      dia: d,
      app_abrio:  num(f.app_abrio),  app_simulo:  num(f.app_simulo),
      web_abrio:  num(f.web_abrio),  web_simulo:  num(f.web_simulo),
      vacio: !porDia.has(d),
    });
    d = diaSiguiente(d);
  }
  return out;
}

/* ── EL NÚMERO CON EL QUE SE DISCUTE EL RECHAZO DE GOOGLE ────────────────
   Google no mira cuántos testers se anotaron: mira cuántos ABRIERON la app,
   cuántos días distintos, durante los catorce. Esto contesta esa pregunta
   exacta y ninguna otra.

   `dias_con_meta` es el número que se lleva al formulario. `mejor_dia` dice
   si alguna vez se llegó, que es otra cosa: llegar un día y nunca más no es
   una prueba de catorce días. */
export function resumenDeUso(serie, meta = CTL_META_TESTERS) {
  const s = serie || [];
  if (!s.length) return null;
  const conDato = s.filter(d => !d.vacio);
  return {
    dias: s.length,
    dias_con_dato: conDato.length,
    app_abrio_total: s.reduce((a, d) => a + d.app_abrio, 0),
    web_abrio_total: s.reduce((a, d) => a + d.web_abrio, 0),
    app_simulo_total: s.reduce((a, d) => a + d.app_simulo, 0),
    web_simulo_total: s.reduce((a, d) => a + d.web_simulo, 0),
    mejor_dia: s.reduce((m, d) => d.app_abrio > (m ? m.app_abrio : -1) ? d : m, null),
    dias_con_meta: s.filter(d => d.app_abrio >= meta).length,
    meta,
  };
}

/* ── EL EMBUDO DE UNA CAMPAÑA ────────────────────────────────────────────
   `gasto` lo escribe Fausto en la pantalla y queda en ESE navegador: Meta
   sabe lo que cobró y nuestra base no tiene por qué enterarse. Sin gasto
   cargado, los costos son null y la pantalla pone una raya.

   El costo por SIMULACIÓN es el que importa y casi nunca se mira: una
   visita que rebota a los tres segundos cuesta lo mismo que una que arma un
   once, y no valen lo mismo para nada. */
export function embudo(c, gasto) {
  const llegaron = num(c && c.llegaron), simularon = num(c && c.simularon);
  const instalaron = num(c && c.instalaron), cuentas = num(c && c.cuentas);
  const g = gasto == null || gasto === "" ? null : num(gasto);
  return {
    codigo: (c && c.codigo) || "?",
    llegaron, simularon, instalaron, cuentas,
    simulo_pct:  porcentaje(simularon, llegaron, 1),
    instalo_pct: porcentaje(instalaron, llegaron, 1),
    cuenta_pct:  porcentaje(cuentas, llegaron, 1),
    costo_visita:     g && llegaron  ? Math.round(g / llegaron * 100) / 100 : null,
    costo_simulacion: g && simularon ? Math.round(g / simularon * 100) / 100 : null,
    costo_cuenta:     g && cuentas   ? Math.round(g / cuentas * 100) / 100 : null,
    gasto: g,
  };
}

/* ── LA ALTURA DE CADA BARRA ─────────────────────────────────────────────
   Contra el máximo de la serie y no contra un número fijo: con quince
   usuarios por día, una escala de cien deja todas las barras aplastadas
   contra el piso y el gráfico no dice nada.

   Un día en cero dibuja una barra de altura cero y NO una rayita mínima:
   una rayita donde no pasó nada es un día que parece que pasó algo. */
export function alturas(serie, campo) {
  const s = serie || [];
  const max = s.reduce((m, d) => Math.max(m, num(d[campo])), 0);
  return s.map(d => ({ dia: d.dia, valor: num(d[campo]),
                       alto: max ? Math.round(num(d[campo]) / max * 100) : 0 }));
}

/* ── CÓMO SE ESCRIBE UN NÚMERO QUE PUEDE NO EXISTIR ──────────────────────
   Una sola función para que la raya sea siempre la misma raya. */
export function texto(v, sufijo = "") {
  if (v == null || (typeof v === "number" && !isFinite(v))) return "—";
  return String(v) + sufijo;
}

/* La fecha, corta y en castellano. Sin `Date` sobre la cadena por el mismo
   motivo de arriba: el día ya viene en hora argentina. */
const CTL_DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function diaCorto(dia) {
  const p = String(dia || "").split("-");
  if (p.length !== 3) return String(dia || "");
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  if (isNaN(d)) return String(dia);
  return CTL_DIAS[d.getUTCDay()] + " " + p[2] + "/" + p[1];
}
