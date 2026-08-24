/* Prueba de la pestaña del juego con la API simulada: así se puede ver la
   cancha y la animación sin gastar pedidos ni usar la key real.          */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');

const nombres=["Unsaín","Riquelme","Galarza","Fernández","Cristaldo","Maidana","Chamorro",
 "Depietri","Martínez","Barticciotto","Rick","Portilla","Girotti","Herrera","Navarro","Bustos"];
const jugadores=(pref,base)=>{
  const pos=["G","D","D","D","D","M","M","M","F","F","F","D","M","F","M","G"];
  return nombres.map((n,i)=>({player:{id:pref*100+i,name:pref===1?n:"Rival "+n},
    statistics:[{games:{minutes:90,position:pos[i],rating:(base+Math.random()*0.8-0.3).toFixed(1)}}]}));
};

(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:430,height:920},deviceScaleFactor:2});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));

  await p.route("**/v3.football.api-sports.io/**", route=>{
    const u=route.request().url();
    let resp=[];
    if(u.includes("/fixtures/players")){
      resp=[{team:{id:456},players:jugadores(1,7.0)},{team:{id:1066},players:jugadores(2,6.6)}];
    } else if(u.includes("/fixtures/lineups")){
      resp=[{team:{id:456},formation:"4-4-2",startXI:nombres.slice(0,11).map((n,i)=>({player:{name:n,pos:"M"}}))}];
    } else if(u.includes("/fixtures/events")){
      resp=[{type:"Card",detail:"Red Card",time:{elapsed:63},team:{id:1066},player:{name:"Rival Muñoz"}}];
    } else if(u.includes("/fixtures")){
      resp=Array.from({length:6},(_,i)=>({
        fixture:{id:900+i,date:`2026-0${i+3}-1${i}T20:00:00+00:00`,status:{short:"FT"}},
        teams:{home:{id:i%2?456:1066,name:i%2?"Talleres Cordoba":"Gimnasia M."},
               away:{id:i%2?1066:456,name:i%2?"Gimnasia M.":"Talleres Cordoba"}},
        goals:{home:2,away:1}}));
    }
    route.fulfill({contentType:"application/json",body:JSON.stringify({response:resp,errors:[]})});
  });

  await p.goto('file:///home/claude/tste/Talleres.html');
  await p.waitForTimeout(300);
  await p.locator('button[data-tab=juego]').click(); await p.waitForTimeout(200);
  await p.fill('#k','clave-de-prueba');
  await p.locator('#bcargar').click(); await p.waitForTimeout(500);
  console.log('partidos listados:', await p.locator('.fx').count());
  await p.locator('.fx').first().click();   // la lista viene con el más reciente arriba
  await p.waitForTimeout(1300);
  console.log('globitos en la cancha:', await p.locator('.jug').count(), '(tienen que ser 22)');
  await p.screenshot({path:'cancha.png'});

  await p.locator('.jug').nth(15).click(); await p.waitForTimeout(250);
  console.log('picker abierto con', await p.locator('.opt').count(), 'opciones');
  await p.screenshot({path:'picker.png'});
  await p.locator('.opt').nth(1).click(); await p.waitForTimeout(300);
  console.log('sigue habiendo 22 globitos:', await p.locator('.jug').count());

  await p.locator('#bsim').click();
  await p.waitForTimeout(1800);
  const relojMedio = await p.locator('#reloj').innerText();
  await p.screenshot({path:'jugando.png'});
  await p.waitForTimeout(8000);
  console.log('reloj a mitad de partido:', relojMedio.trim(), '| hay resultado:', await p.locator('.res').count());
  console.log('nota de esta simulación:', (await p.locator('.nota').first().innerText()).slice(0,60).replace(/\n/g,' '));
  await p.screenshot({path:'resultado.png'});

  await p.locator('#brev').click(); await p.waitForTimeout(600);
  const rev=await p.locator('.nota').allInnerTexts();
  console.log('revelado · menciona expulsión:', rev.some(t=>/Expulsión/.test(t)));
  await p.screenshot({path:'revelado.png'});
  console.log('JS:', errs.length?errs:'sin errores');
  await b.close();
})();
