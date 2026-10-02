import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
async function attach(port) {
 const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 const page=pages.find(p=>p.url.startsWith('http://127.0.0.1:4175'));
 if(!page)throw Error('QA page missing');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let next=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 return {pages,ws,call,evaluate};
}
// Pass the two QA browser debugging ports explicitly; this never targets a personal browser.
const a=await attach(Number(process.argv[2])),b=await attach(Number(process.argv[3]));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report=[];
try {
 // Explicitly navigate every QA owner page away, including background tabs.
 for(const p of a.pages.filter(p=>p.url.startsWith('http://127.0.0.1:4175'))) {
  const w=new WebSocket(p.webSocketDebuggerUrl);await new Promise(r=>w.addEventListener('open',r,{once:true}));w.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'about:blank'}}));await delay(150);w.close();
 }
 await delay(16000);
 const state=await b.evaluate('fetch("/api/state").then(r=>r.json())');
 const defender=state.players.find(p=>p.id!==state.me);
 assert.equal(defender.status,'offline');assert.equal(defender.best.hop,40);assert.equal(defender.incoming,3);
 report.push({check:'Owner left; offline avatar and score retained',status:defender.status,best:defender.best.hop});
 const fourth=await b.evaluate(`fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:'hop',target:'${defender.id}'})}).then(async r=>({status:r.status,data:await r.json()}))`);
 assert.equal(fourth.status,400);report.push({check:'Fourth challenge rejected',...fourth});
 await b.evaluate(`document.querySelector('#close-modal').click();document.querySelector('[data-open=neighbours]').click()`);
 await b.evaluate(`document.querySelector('[data-player="${defender.id}"]').click()`);
 await delay(350);
 const inspect=await b.evaluate('({...document.querySelector("#world canvas").dataset})');
 assert.equal(inspect.inspect,`player:${defender.id}`);assert.equal(inspect.sharedPlayers,'1');
 const avatarShot=await b.call('Page.captureScreenshot',{format:'png'});writeFileSync('.browser/social-offline-avatar.png',Buffer.from(avatarShot.data,'base64'));
 report.push({check:'Real offline avatar inspected in third person',camera:inspect.camera,sharedPlayers:inspect.sharedPlayers});
 for(const [width,height] of [[320,740],[390,844],[1440,960]]) {
  await b.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const panel of ['board','dares','neighbours']) {
   await b.evaluate(`document.querySelector('[data-action=close-inspector]')?.click();document.querySelector('#close-modal').click();${panel==='board'?"document.querySelector('nav [data-open=dares]').click();document.querySelector('#modal-body [data-open=board]').click()":`document.querySelector('[data-open=${panel}]').click()`}`);
   const sizes=await b.evaluate('({width:innerWidth,body:document.documentElement.scrollWidth,dialog:document.querySelector("#modal").clientWidth,content:document.querySelector("#modal").scrollWidth,title:document.querySelector("#modal-body h2")?.textContent})');
   assert.ok(sizes.body<=width+1&&sizes.content<=sizes.dialog+1,JSON.stringify(sizes));report.push({check:'Responsive panel',panel,width,...sizes});
   if(panel==='board') {const shot=await b.call('Page.captureScreenshot',{format:'png'});writeFileSync(`.browser/social-board-${width}.png`,Buffer.from(shot.data,'base64'));}
  }
 }
 console.log(JSON.stringify(report,null,2));writeFileSync('.browser/social-report.json',JSON.stringify(report,null,2));
} finally {a.ws.close();b.ws.close();}
