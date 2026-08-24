/* ══════════════════════════════════════════════════════════════════════════
   ARMÁ EL 11 — motor
   ──────────────────────────────────────────────────────────────────────────
   Portado tal cual del prototipo validado. No cambió un número: los que
   están acá son los que pasaron el backtest sobre 8 ligas.

   La regla que ordena todo: NUNCA se mira el partido que se está simulando.
   Los planteles y las fuerzas salen de los partidos ANTERIORES. Si mirara el
   partido, la simulación sería una profecía autocumplida y el juego no
   tendría gracia.
   ══════════════════════════════════════════════════════════════════════════ */

export const BASE = "https://v3.football.api-sports.io", LEAGUE = 128;
export const MEDIA_LIGA = 6.5;
export const FORMS = ["4-4-2","4-3-3","4-2-3-1","3-5-2","5-3-2","4-5-1","3-4-3","4-1-4-1"];

/* Fuerza de un jugador = promedio de sus ratings en los partidos previos.
   6.5 es el rating medio de la liga: por debajo resta, por encima suma.
   La confianza sube con los minutos — a quien jugó poco se le cree menos. */
export function fuerza(p){
  if(!p.ratings.length) return { v: MEDIA_LIGA, conf: 0 };
  const v = p.ratings.reduce((a,b)=>a+b,0) / p.ratings.length;
  const conf = Math.min(1, p.mins/180);            // 2 partidos completos = confianza plena
  return { v: MEDIA_LIGA + (v-MEDIA_LIGA)*(.45+.55*conf), conf };
}

/* Castigo por jugar fuera de puesto, en puntos de rating.
   La API sólo distingue G/D/M/F, así que un extremo figura como M aunque
   juegue de F: mover a alguien entre medio y ataque casi no cuesta. Poner a
   un defensor de nueve sí. Y al arco, cualquiera que no sea arquero es un
   desastre. Las claves van en orden alfabético, que es como las arma la
   función — ese detalle me costó un bug entero.                           */
const PENAL = { DG:1.6, GM:2.2, FG:2.6, DM:0.40, DF:0.85, FM:0.15 };
export function penalPuesto(real, slot){
  if(!real || real===slot) return 0;
  return PENAL[[real,slot].sort().join("")] ?? 0.5;
}

export function slotsDe(f){
  const l = f.split("-").map(Number).filter(n=>n>0), s = [{cat:"G",n:1}];
  s.push({cat:"D", n:l[0]});
  if(l.length===2){ s.push({cat:"M", n:l[1]}); }
  else {
    for(let i=1;i<l.length-1;i++) s.push({cat:"M", n:l[i]});
    s.push({cat:"F", n:l[l.length-1]});
  }
  return s;
}

export function lineas(xi){
  const g = x => xi.filter(p=>p&&p.slotCat===x).map(p => fuerza(p).v - penalPuesto(p.pos,p.slotCat));
  const m = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : MEDIA_LIGA;
  const arq=m(g("G")), def=m(g("D")), med=m(g("M")), ata=m(g("F"));
  return { arq, def, med, ata,
    DEF: def*.72 + arq*.28,
    MED: med,
    ATA: ata*.68 + med*.32 };
}

/* Perillas. Ninguna puede ser una mejora gratis — cada una cobra su precio:
   LINEA   riesgo simétrico: sube o baja las chances de los dos lados
   PRESION le corta la salida al rival pero le regala contras. El castigo es
           ADITIVO, así que pesa mucho más cuando el rival es flojo:
           presionar a un equipo chico es mal negocio, a uno grande es barato
   RITMO   escala el partido entero: más goles de los dos lados
   ANCHO   depende de con qué jugadores contás (se resuelve en bonusAncho)  */
export const KNOBS = [
  { id:"linea",   n:"Línea defensiva", izq:"Baja",        der:"Alta" },
  { id:"presion", n:"Presión",         izq:"Repliegue",   der:"Alta" },
  { id:"ancho",   n:"Ancho de juego",  izq:"Por adentro", der:"Por afuera" },
  { id:"ritmo",   n:"Ritmo",           izq:"Controlado",  der:"Alto" },
];

export function tacticas(k){
  let mine=1, theirs=1, theirsFlat=0; const notas=[];
  const lin=k.linea/100;
  mine *= 1+0.13*lin; theirs *= 1+0.20*lin;
  if(lin> .35) notas.push("Con la línea alta generás más, pero le dejás la espalda al rival.");
  if(lin<-.35) notas.push("Con la línea baja te exponés menos, pero también creás menos.");

  const pre=k.presion/100;
  mine *= 1+0.14*pre;
  if(pre>0){ theirsFlat += 0.26*pre;
    if(pre>.35) notas.push("Presionando alto le cortás la salida, pero cada pelota que te ganan es una contra franca.");
  } else { theirs *= 1+0.12*pre;
    if(pre<-.35) notas.push("Replegado le cedés el balón: te llegan menos, pero vos también llegás menos.");
  }

  const rit=k.ritmo/100;
  mine *= 1+0.11*rit; theirs *= 1+0.11*rit;
  if(rit> .35) notas.push("Ritmo alto: partido de ida y vuelta, más goles de los dos lados.");
  if(rit<-.35) notas.push("Ritmo controlado: partido cerrado, pocos goles.");

  return { mine, theirs, theirsFlat, notas, ancho:k.ancho/100 };
}

export function bonusAncho(xi, anchoVal){
  const lat = xi.filter(p=>p&&p.slotCat==="D").slice(1,-1);
  const ext = xi.filter(p=>p&&p.slotCat==="F");
  const afuera = [...lat,...ext].map(p=>fuerza(p).v);
  const med = xi.filter(p=>p&&p.slotCat==="M").map(p=>fuerza(p).v);
  const prom = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : MEDIA_LIGA;
  const dif = (prom(afuera)-prom(med))*anchoVal;
  return 1 + Math.max(-.12, Math.min(.12, dif*0.10));
}

const BASE_LOCAL=1.36, BASE_VISITA=1.12;
export function xgDe(A,B,esLocal,mult,anchoA){
  const base = esLocal ? BASE_LOCAL : BASE_VISITA;
  /* z = diferencia de rating en desvíos, topada: en el fútbol real ni el
     mejor equipo contra el peor pasa de ~3 goles esperados.               */
  const z = Math.max(-2.2, Math.min(2.2, (A.ATA-B.DEF)/0.62));
  return Math.max(.18, Math.min(3.4, base*Math.exp(0.30*z)*mult*anchoA));
}

export const poissonUno = l => { const L=Math.exp(-l); let k=0,p=1;
  do { k++; p*=Math.random(); } while(p>L); return k-1; };
const poisson = poissonUno;

export function simular(xgA, xgB, n=6000){
  let w=0,d=0,l=0; const marc={};
  for(let i=0;i<n;i++){
    const a=poisson(xgA), b=poisson(xgB);
    if(a>b)w++; else if(a===b)d++; else l++;
    const k=a+"-"+b; marc[k]=(marc[k]||0)+1;
  }
  const top=Object.entries(marc).sort((x,y)=>y[1]-x[1])[0];
  return { win:w/n*100, draw:d/n*100, loss:l/n*100,
           marcador:top[0], probMarcador:top[1]/n*100, xgA, xgB };
}

/* Re-simulación condicionada por expulsión: el equipo con uno menos pierde
   ataque y concede más, pero solo por el tiempo que quedaba por jugar.    */
export function simExpulsion(xgA, xgB, rojas){
  let a=xgA, b=xgB;
  rojas.forEach(r=>{
    const resto=Math.max(0,(90-r.min))/90, jugado=1-resto;
    if(r.esMio){ a=a*(jugado+resto*0.68); b=b*(jugado+resto*1.42); }
    else       { b=b*(jugado+resto*0.68); a=a*(jugado+resto*1.42); }
  });
  return simular(a,b);
}

/* Arma el once más fuerte disponible respetando la formación. */
export function autoXI(pool, form){
  /* Antes esto llenaba puesto por puesto con el mejor "nivel menos castigo".
     Suena razonable y sale mal: el castigo por jugar de volante siendo
     delantero es 0.15, y la diferencia de nivel entre dos jugadores es
     tranquilamente 1.0. Así que el mejor delantero terminaba de volante, y
     cuando le tocaba el turno a la delantera ya no quedaba ninguno. El once
     salía entero fuera de puesto.

     Los castigos no se tocan: pasaron el backtest y son del MODELO. Lo que
     estaba mal era esta función, que es comodidad de pantalla: el puesto no
     es una preferencia con precio, es una restricción. Primero cada uno en
     el suyo; recién después, si falta gente, se improvisa.                */
  const slots = slotsDe(form).flatMap(l => Array.from({length:l.n}, () => l.cat));
  const xi = new Array(slots.length).fill(null);
  const usados = new Set();
  const libres = () => pool.filter(p => !usados.has(p.id));

  /* El orden lo decide la escasez, no el dibujo. Si hay un solo arquero y
     seis volantes para tres lugares, el arquero se reparte primero.      */
  const demanda = {}; slots.forEach(c => demanda[c] = (demanda[c] || 0) + 1);
  const oferta  = {}; pool.forEach(p => oferta[p.pos] = (oferta[p.pos] || 0) + 1);
  const orden = [...new Set(slots)]
    .sort((a, b) => (oferta[a] || 0) / demanda[a] - (oferta[b] || 0) / demanda[b]);

  for (const cat of orden)
    slots.forEach((c, i) => {
      if (c !== cat || xi[i]) return;
      /* Entre los del puesto, primero los que vienen jugando. Al plantel se
         le suman los que no sumaron minutos —para que estén en la lista y se
         puedan elegir a mano— pero de esos no sabemos nada, así que no
         pueden entrar de arranque por delante de uno que sí jugó.       */
      const cand = libres().filter(p => p.pos === cat)
        .sort((a, b) => (b.mins > 0) - (a.mins > 0) || fuerza(b).v - fuerza(a).v)[0];
      if (cand) { usados.add(cand.id); xi[i] = { ...cand, slotCat: cat }; }
    });

  /* Lo que quedó vacío se improvisa, y ahí sí paga el castigo. */
  slots.forEach((c, i) => {
    if (xi[i]) return;
    const cand = libres().map(p => ({ p, v: fuerza(p).v - penalPuesto(p.pos, c) }))
      .sort((a, b) => b.v - a.v)[0];
    if (cand) { usados.add(cand.p.id); xi[i] = { ...cand.p, slotCat: c }; }
  });
  return xi;
}
