/* Estadísticas de la liga calculadas desde los partidos reales de 2026.
   Todo lo que sale de acá es verificable contra los resultados: no hay
   ningún número inventado. Lo que no se puede calcular con datos de
   PARTIDO (goleadores, asistencias, situaciones generadas) no está acá —
   eso necesita el endpoint de jugadores y se marca como pendiente.        */
import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync("/home/claude/full.json"));
const P = D.temporadas["2026"].partidos
  .filter(p => p.gh != null && p.ga != null)
  .sort((a,b) => new Date(a.fecha) - new Date(b.fecha));

const eq = new Map();
const E = (id,nom) => { if(!eq.has(id)) eq.set(id,{id,nom,pj:0,g:0,e:0,p:0,gf:0,gc:0,
  pts:0,tiros:0,tirosC:0,xg:0,xgc:0,hist:[],localPts:0,localPj:0,visPts:0,visPj:0,
  vallaInv:0, sinMarcar:0,
  /* Solo el 27% de los partidos de 2026 trae xG. Comparar los goles de TODOS
     los partidos contra el xG de una cuarta parte da diferencias de +25 goles,
     que es un imposible físico. Se acumula aparte lo jugado CON xG y se compara
     manzana con manzana. Si el dato es parcial, el universo también.        */
  pjXG:0, gfXG:0}); return eq.get(id); };

for(const m of P){
  const H=E(m.h,m.hn), A=E(m.a,m.an);
  const res = m.gh>m.ga ? "G" : m.gh===m.ga ? "E" : "P";
  H.pj++; A.pj++;
  H.gf+=m.gh; H.gc+=m.ga; A.gf+=m.ga; A.gc+=m.gh;
  H.tiros+=m.th||0; A.tiros+=m.ta||0; H.tirosC+=m.ta||0; A.tirosC+=m.th||0;
  if(m.xh!=null){ H.xg+=m.xh; H.xgc+=m.xa; A.xg+=m.xa; A.xgc+=m.xh;
    H.pjXG++; A.pjXG++; H.gfXG+=m.gh; A.gfXG+=m.ga; }
  if(m.ga===0) H.vallaInv++; if(m.gh===0) A.vallaInv++;
  if(m.gh===0) H.sinMarcar++; if(m.ga===0) A.sinMarcar++;
  const ptsH = res==="G"?3:res==="E"?1:0, ptsA = res==="P"?3:res==="E"?1:0;
  H.pts+=ptsH; A.pts+=ptsA;
  H.localPts+=ptsH; H.localPj++; A.visPts+=ptsA; A.visPj++;
  if(res==="G"){H.g++;A.p++;} else if(res==="E"){H.e++;A.e++;} else {H.p++;A.g++;}
  H.hist.push({r:res, rival:m.an, gf:m.gh, gc:m.ga, fecha:m.fecha, local:true});
  A.hist.push({r:res==="G"?"P":res==="P"?"G":"E", rival:m.hn, gf:m.ga, gc:m.gh, fecha:m.fecha, local:false});
}

/* racha actual y la más larga de cada tipo */
function rachas(h){
  const actual = (()=>{ if(!h.length) return {tipo:"—",n:0};
    const t=h[h.length-1].r; let n=0;
    for(let i=h.length-1;i>=0&&h[i].r===t;i--) n++;
    return {tipo:t,n}; })();
  const mejor = (test)=>{ let m=0,c=0; for(const x of h){ if(test(x.r)){c++;m=Math.max(m,c);} else c=0;} return m; };
  return { actual,
    ganados: mejor(r=>r==="G"),
    invicto: mejor(r=>r!=="P"),
    sinGanar: mejor(r=>r!=="G") };
}

const tabla = [...eq.values()].map(t => ({
  ...t, dg: t.gf-t.gc,
  ppp: +(t.pts/Math.max(1,t.pj)).toFixed(2),
  pppLocal: +(t.localPts/Math.max(1,t.localPj)).toFixed(2),
  pppVis: +(t.visPts/Math.max(1,t.visPj)).toFixed(2),
  pjXG: t.pjXG,
  xgDif: t.pjXG >= 5 ? +(t.gfXG - t.xg).toFixed(1) : null,
  xgDifPP: t.pjXG >= 5 ? +((t.gfXG - t.xg)/t.pjXG).toFixed(2) : null,
  golPorTiro: t.tiros ? +(t.gf/t.tiros*100).toFixed(1) : null,
  rachas: rachas(t.hist),
  forma: t.hist.slice(-5).map(x=>x.r),
})).sort((a,b) => b.pts-a.pts || b.dg-a.dg || b.gf-a.gf);
tabla.forEach((t,i)=> t.pos=i+1);

const conXG = tabla.filter(t=>t.xgDif!=null);
const top = (arr,f,n=5,desc=true) => [...arr].sort((a,b)=> desc? f(b)-f(a) : f(a)-f(b)).slice(0,n);

const partidos = P.map(m=>({...m, total:m.gh+m.ga, dif:Math.abs(m.gh-m.ga)}));

const out = {
  liga:"Liga Profesional Argentina", temporada:2026,
  generado: P[P.length-1].fecha,
  notaXG:"El xG existe solo en el 27% de los partidos de 2026 (desde mayo). Las columnas de xG comparan únicamente esos partidos, y se muestran por partido, no acumuladas.",
  nota:"Tabla acumulada sobre TODOS los partidos de 2026 en la base. No es la tabla oficial por zona ni por torneo: eso sale del endpoint /standings.",
  partidosJugados: P.length,
  promedios:{
    golesPorPartido: +(P.reduce((a,m)=>a+m.gh+m.ga,0)/P.length).toFixed(2),
    local: +(P.filter(m=>m.gh>m.ga).length/P.length*100).toFixed(1),
    empate: +(P.filter(m=>m.gh===m.ga).length/P.length*100).toFixed(1),
    visita: +(P.filter(m=>m.gh<m.ga).length/P.length*100).toFixed(1),
    ceroACero: P.filter(m=>m.gh+m.ga===0).length,
  },
  tabla,
  rachas:{
    ganando: top(tabla, t=>t.rachas.actual.tipo==="G"?t.rachas.actual.n:0, 5),
    invictos: top(tabla, t=>t.rachas.invicto, 5),
    sinGanar: top(tabla, t=>t.rachas.actual.tipo!=="G"?t.rachas.actual.n:0, 5),
  },
  records:{
    goleadas: [...partidos].sort((a,b)=>b.dif-a.dif||b.total-a.total).slice(0,5),
    masGoles: [...partidos].sort((a,b)=>b.total-a.total).slice(0,5),
    masGoleador: top(tabla, t=>t.gf, 5),
    menosGoleador: top(tabla, t=>t.gf, 5, false),
    mejorDefensa: top(tabla, t=>t.gc, 5, false),
    vallaInvicta: top(tabla, t=>t.vallaInv, 5),
  },
  avanzadas:{
    sobreRinden: top(conXG, t=>t.xgDifPP, 5),
    bajoRinden: top(conXG, t=>t.xgDifPP, 5, false),
    punteria: top(tabla.filter(t=>t.tiros>40), t=>t.golPorTiro, 5),
    fortaleza: top(tabla, t=>t.pppLocal, 5),
    viajeros: top(tabla, t=>t.pppVis, 5),
  },
  faltan:{
    jugadores:"goleadores, asistencias, situaciones de gol generadas y puntajes por partido",
    porque:"son datos de JUGADOR y esta base tiene datos de PARTIDO. Salen de /players y /fixtures/players.",
    comoSeArregla:"correr bajar-jugadores.html una vez por fecha",
  },
};
writeFileSync("./stats-liga.js","window.STATS = "+JSON.stringify(out)+";");
writeFileSync("./stats-liga.json",JSON.stringify(out,null,1));

console.log(P.length+" partidos · "+tabla.length+" equipos · hasta "+out.generado.slice(0,10));
console.log("\nTop 5:");
tabla.slice(0,5).forEach(t=>console.log("  "+t.pos+". "+t.nom.padEnd(22)+t.pts+" pts  "+t.pj+" pj  DG "+(t.dg>0?"+":"")+t.dg+"  forma "+t.forma.join("")));
const T=tabla.find(t=>t.id===456);
console.log("\nTalleres: "+T.pos+"º · "+T.pts+" pts · racha actual "+T.rachas.actual.n+T.rachas.actual.tipo+
            " · invicto más largo "+T.rachas.invicto+" · xG "+(T.xgDif>0?"+":"")+T.xgDif);
console.log("\nSobre-rinden vs xG:", out.avanzadas.sobreRinden.map(t=>t.nom+" "+(t.xgDif>0?"+":"")+t.xgDif).join(" · "));
