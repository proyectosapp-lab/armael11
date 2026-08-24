/* Prueba del motor sin red: planteles inventados, pero el motor es el real. */
import * as J from "./juego.js";

const jug=(id,nombre,pos,rating,mins=270)=>({id,nombre,pos,ratings:[rating,rating],mins,apar:3});
const plantel=(base,pref)=>{
  const out=[]; let id=0;
  const por={G:3,D:8,M:9,F:6};
  for(const [pos,n] of Object.entries(por))
    for(let i=0;i<n;i++) out.push(jug(pref+(++id), pref+"-"+pos+i, pos, base + (Math.random()*0.9-0.3)));
  return out.sort((a,b)=>J.fuerza(b).v-J.fuerza(a).v);
};
const A=plantel(6.9,"A"), B=plantel(6.4,"B");

const xiA=J.autoXI(A,"4-3-3"), xiB=J.autoXI(B,"4-4-2");
console.log("once auto A:", xiA.map(p=>p.slotCat+":"+p.pos).join(" "));
console.log("¿11 jugadores?", xiA.length===11 && xiA.every(Boolean));

const K={linea:0,presion:0,ancho:0,ritmo:0};
const t=J.tacticas(K);
const LA=J.lineas(xiA), LB=J.lineas(xiB);
const xgA=J.xgDe(LA,LB,true,t.mine,J.bonusAncho(xiA,t.ancho));
const xgB=J.xgDe(LB,LA,false,t.theirs,1)+t.theirsFlat;
const s=J.simular(xgA,xgB);
console.log(`neutro: ${s.win.toFixed(0)}% / ${s.draw.toFixed(0)}% / ${s.loss.toFixed(0)}%  ·  xg ${xgA.toFixed(2)}-${xgB.toFixed(2)}  ·  ${s.marcador}`);
console.log("suma 100?", Math.abs(s.win+s.draw+s.loss-100)<0.01);

/* Ninguna perilla puede ser gratis: presionar al mango tiene que subir el xG rival */
for(const p of [-100,0,100]){
  const tt=J.tacticas({...K,presion:p});
  const a=J.xgDe(LA,LB,true,tt.mine,1), b=J.xgDe(LB,LA,false,tt.theirs,1)+tt.theirsFlat;
  console.log(`  presión ${String(p).padStart(4)}: xg propio ${a.toFixed(2)} · xg rival ${b.toFixed(2)}`);
}
/* Un defensor de 9 tiene que costar caro */
const xiMal=xiA.map((p,i)=> i===10 ? {...A.find(x=>x.pos==="D"), slotCat:"F"} : p);
const lm=J.lineas(xiMal);
const sm=J.simular(J.xgDe(lm,LB,true,1,1), J.xgDe(LB,lm,false,1,1));
console.log(`\ncon un defensor de 9: ${sm.win.toFixed(0)}% (era ${s.win.toFixed(0)}%)`);

/* Expulsión temprana propia tiene que empeorar el pronóstico */
const sr=J.simExpulsion(xgA,xgB,[{min:20,esMio:true}]);
console.log(`roja mía al 20': ${sr.win.toFixed(0)}% (era ${s.win.toFixed(0)}%)`);
const sr2=J.simExpulsion(xgA,xgB,[{min:20,esMio:false}]);
console.log(`roja rival al 20': ${sr2.win.toFixed(0)}%`);

const ok = xiA.length===11 && sr.win < s.win && sr2.win > s.win && sm.win < s.win;
console.log("\n" + (ok ? "el motor responde como tiene que responder" : "ALGO NO RESPONDE"));
process.exit(ok?0:1);
