
/* Prueba del flujo "próximo partido" con la API simulada. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const nombres=["Unsaín","Riquelme","Galarza","Fernández","Cristaldo","Maidana","Chamorro",
 "Depietri","Martínez","Barticciotto","Rick","Portilla","Girotti","Herrera","Navarro","Bustos"];
const jug=(pref,base)=>{const pos=["G","D","D","D","D","M","M","M","F","F","F","D","M","F","M","G"];
 return nombres.map((n,i)=>({player:{id:pref*100+i,name:(pref===1?"":"R ")+n},
  statistics:[{games:{minutes:90,position:pos[i],rating:(base+Math.random()*0.6-0.3).toFixed(1)}}]}));};

(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:430,height:920}});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.route("**/v3.football.api-sports.io/**", route=>{
  const u=route.request().url(); let resp=[];
  if(u.includes("/fixtures/players")) resp=[{team:{id:456},players:jug(1,7.0)},{team:{id:1066},players:jug(2,6.6)}];
  else if(u.includes("/fixtures/lineups")) resp=[{team:{id:456},formation:"4-4-2",startXI:nombres.slice(0,11).map(n=>({player:{name:n,pos:"M"}}))}];
  else if(u.includes("/fixtures/events")) resp=[];
  else if(u.includes("/fixtures")) resp=[
    ...Array.from({length:5},(_,i)=>({fixture:{id:900+i,date:`2026-0${i+3}-1${i}T20:00:00+00:00`,status:{short:"FT"}},
      teams:{home:{id:456,name:"Talleres Cordoba"},away:{id:1066,name:"Gimnasia M."}},goals:{home:2,away:1}})),
    {fixture:{id:999,date:"2026-08-30T21:00:00+00:00",status:{short:"NS"}},
      teams:{home:{id:456,name:"Talleres Cordoba"},away:{id:1066,name:"Gimnasia M."}},goals:{home:null,away:null}}];
  route.fulfill({contentType:"application/json",body:JSON.stringify({response:resp,errors:[]})});
});

await p.goto('file:///home/claude/tste/Talleres.html');
await p.locator('button[data-tab=juego]').click();
await p.fill('#k','x'); await p.locator('#bcargar').click(); await p.waitForTimeout(600);
const secciones=await p.locator('h3.sec').allInnerTexts();
console.log('secciones:', secciones.join(' | '));
console.log('marcados como próximo:', await p.locator('.sello:text("próximo")').count());

await p.locator('.fx').first().click(); await p.waitForTimeout(700);
console.log('elegí el próximo · globitos:', await p.locator('.jug').count());
await p.locator('#bsim').click(); await p.waitForTimeout(9500);
console.log('hay botón revelar:', await p.locator('#brev').count(), '(tiene que ser 0)');
console.log('hay botón guardar:', await p.locator('#bguardar').count(), '(tiene que ser 1)');
await p.locator('#bguardar').click(); await p.waitForTimeout(400);
const hash=await p.evaluate(()=>location.hash);
console.log('link generado:', hash.slice(0,44)+'…', '| largo', hash.length);

// recargar con el link EN UNA PESTAÑA NUEVA: cambiar solo el hash no recarga
const antes=await p.locator('.jug .n').allInnerTexts();
const p2=await ctx.newPage(); p2.on('pageerror',e=>errs.push('p2: '+e.message));
await p2.route("**/v3.football.api-sports.io/**", route=>{
  const u=route.request().url(); let resp=[];
  if(u.includes("/fixtures/players")) resp=[{team:{id:456},players:jug(1,7.0)},{team:{id:1066},players:jug(2,6.6)}];
  else if(u.includes("/fixtures/lineups")) resp=[];
  else if(u.includes("/fixtures/events")) resp=[];
  else if(u.includes("/fixtures")) resp=[
    ...Array.from({length:5},(_,i)=>({fixture:{id:900+i,date:`2026-0${i+3}-1${i}T20:00:00+00:00`,status:{short:"FT"}},
      teams:{home:{id:456,name:"Talleres Cordoba"},away:{id:1066,name:"Gimnasia M."}},goals:{home:2,away:1}})),
    {fixture:{id:999,date:"2026-08-30T21:00:00+00:00",status:{short:"NS"}},
      teams:{home:{id:456,name:"Talleres Cordoba"},away:{id:1066,name:"Gimnasia M."}},goals:{home:null,away:null}}];
  route.fulfill({contentType:"application/json",body:JSON.stringify({response:resp,errors:[]})});
});
await p2.goto('file:///home/claude/tste/Talleres.html'+hash);
await p2.waitForTimeout(400);
await p2.locator('button[data-tab=juego]').click();
await p2.waitForTimeout(300);
await p2.fill('#k','x'); await p2.locator('#bcargar').click(); await p2.waitForTimeout(1800);
const despues=await p2.locator('.jug .n').allInnerTexts();
console.log('once reconstruido idéntico:', JSON.stringify(antes)===JSON.stringify(despues));
console.log('mensaje:', (await p2.locator('.cargando').first().innerText().catch(()=>'(sin mensaje)')).slice(0,70));
console.log('globitos tras restaurar:', await p2.locator('.jug').count());
console.log('JS:', errs.length?errs:'sin errores');
await b.close();})();

