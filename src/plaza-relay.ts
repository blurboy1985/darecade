import * as T from 'three';
import {api} from './social';
import {createAvatar,animateDetails,disposeAvatar,type Avatar} from './character';
import type {LobbyWorld} from './world';
import type {RelaySnapshot} from '../shared/relay-protocol';
import {PLAZA_STOPS,PLAZA_START} from '../shared/plaza-relay';
import type {Save} from './state';
import './plaza-relay.css';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let stopPrevious: (()=>void)|null=null;
export function mountPlazaRelay(host:HTMLElement,ctx:{world:LobbyWorld;save:Save;close:()=>void}){
 stopPrevious?.();
 const root=document.createElement('section');root.className='plaza-relay';host.replaceChildren(root);
 root.innerHTML='<h2>Neighbourhood Relay</h2><p>Run and jump through four glowing plaza gates. Pass the baton to your team. Empty places fill with named computer players.</p><button class="primary" data-solo>Race with computer players</button><button class="secondary" data-host>Host friends</button><form><label>Team code<input name="code" maxlength="8" autocomplete="off"></label><button class="secondary">Join team</button></form><div class="plaza-room"></div><p class="plaza-error" role="alert"></p><small>Casual play · no XP or tokens · normal world controls</small>';
 const abort=new AbortController();let snap:RelaySnapshot|null=null,busy=false,dead=false,started=false,seq=0,code='',frame=0;
 const group=new T.Group();ctx.world.scene.add(group);const avatars=new Map<number,Avatar>();const rings:T.Mesh[]=[];
 const q=(s:string)=>root.querySelector<HTMLElement>(s)!;
 async function request(action:string,data:Record<string,unknown>){if(busy||dead)return;busy=true;try{snap=await api<RelaySnapshot>(`relay/${action}`,data);if(dead)return;if(snap.code)code=snap.code;if(!snap.plaza)throw Error('This code is for the earlier Relay course. Create a new plaza team.');render();}catch(e){q('.plaza-error').textContent=(e as Error).message;}finally{busy=false}}
 function render(){if(!snap)return;const s=snap;
  if(s.status==='running'&&!started)launch();
  if(!started){q('.plaza-room').innerHTML=`<strong>${code?`Team code: ${escape(code)}`:'Your team'}</strong><p>${s.players.map(p=>`${escape(p.name)} · ${p.ready?'ready':'joining'}`).join('<br>')}</p><button class="primary" data-ready>Ready</button>${s.host===s.slot?'<button class="secondary" data-start>Start relay</button>':''}<p>Any empty places become computer teammates. Opponents are computer players.</p>`;return;}
  const p=s.plaza!,leg=p.legs[0],owner=p.runners[p.owners[0]],mine=p.runners[s.slot];
  q('.plaza-clock').textContent=`${Math.max(0,120-Math.floor(p.tick/60))}s`;
  q('.plaza-score').textContent=`Your team ${leg}/4 · Rivals ${p.legs[1]}/4`;
  q('.plaza-cue').textContent=s.status==='cancelled'?'Team closed.':s.status!=='running'?`${p.winner===0?'Your team wins!':p.winner===1?'Rivals win — nice run!':'Time’s up'} · ${p.times[0]?.toFixed(1)||'—'}s · ${leg} gates` : p.tick-p.lastHandoff<90&&p.handoffs? 'Baton handed over!' : leg>=4?'Finished! Watching the rivals.':`${owner.slot===s.slot?'You have the baton':`${s.players.find(v=>v.slot===owner.slot)?.name||owner.name}${owner.bot?' · CPU':''} has the baton`} · ${PLAZA_STOPS[leg].name}${PLAZA_STOPS[leg].jump?' · Jump through!':''}`;
  q('[data-next]').textContent=leg<4?'Walk to next gate':'Course complete';
  if(mine?.bot)q('.plaza-cue').textContent+=' · Your place was filled while away';
  for(const [i,r] of rings.entries())r.material instanceof T.MeshStandardMaterial&&(r.material.color.set(i===leg?'#ffcb63':'#73c7af'),r.material.emissive.set(i===leg?'#e99d39':'#419f96'));
 }
 function launch(){started=true;ctx.world.placePlayer(PLAZA_START.x+(snap!.slot%4)*.4,PLAZA_START.z);ctx.world.setCameraMode('third');ctx.world.followDistance=9;
  root.classList.add('plaza-running');root.innerHTML='<div class="plaza-top"><b>PLAZA RELAY</b><strong class="plaza-clock"></strong><span class="plaza-score"></span><button data-leave aria-label="Leave relay">×</button></div><p class="plaza-cue" role="status"></p><button data-next class="secondary">Walk to next gate</button><p class="plaza-error" role="alert"></p><div class="plaza-roster"></div>';
  document.body.append(root);ctx.close();
  for(const [i,p] of PLAZA_STOPS.entries()){const ring=new T.Mesh(new T.TorusGeometry(1,.09,6,24),new T.MeshStandardMaterial({color:'#ffcc70',emissive:'#d69735',emissiveIntensity:.7}));ring.position.set(p.x,p.jump?2:.9,p.z);ring.rotation.y=i%2?Math.PI/2:0;group.add(ring);rings.push(ring)}
  const draw=(now:number)=>{if(dead)return;frame=requestAnimationFrame(draw);const s=snap?.plaza;if(!s)return;
   q('.plaza-roster').textContent=s.runners.filter(r=>r.bot).map(r=>`${r.name} · CPU`).join(' · ');
   for(const r of s.runners){if(r.slot===snap!.slot&&!r.bot)continue;let a=avatars.get(r.slot);if(!a){const friend=snap!.players.find(p=>p.slot===r.slot);a=createAvatar(group,r.x,r.z,r.team?'#cc7c79':'#75b9aa','#dca47e',r.slot%4,friend?.look||{clothing:r.slot%7,hair:r.slot%8,skin:r.slot%5,outfit:r.slot%6});avatars.set(r.slot,a)}const p=a.root.position;const dx=r.x-p.x,dz=r.z-p.z;p.lerp(new T.Vector3(r.x,r.y,r.z),.3);if(Math.hypot(dx,dz)>.01)a.root.rotation.y=Math.atan2(dx,dz);a.moving=Math.hypot(dx,dz)>.015;animateDetails(a,now/1000,a.moving?'jog':'idle',ctx.save.reduced);a.legs.forEach((l,i)=>l.rotation.x=a.moving?Math.sin(now*.012+i*Math.PI)*.5:0);}
  };frame=requestAnimationFrame(draw);
 }
 async function create(solo:boolean){await request('create',{solo,difficulty:'standard',course:'plaza'});if(solo&&snap){await request('ready',{room:snap.room,ready:true});await request('start',{room:snap.room});}}
 root.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('button');if(!b)return;if(b.hasAttribute('data-solo'))void create(true);if(b.hasAttribute('data-host'))void create(false);if(b.hasAttribute('data-ready')&&snap)void request('ready',{room:snap.room,ready:true});if(b.hasAttribute('data-start')&&snap)void request('start',{room:snap.room});if(b.hasAttribute('data-leave'))stop();if(b.hasAttribute('data-next')&&snap?.plaza){const p=PLAZA_STOPS[Math.min(3,snap.plaza.legs[0])];ctx.world.walkTo(p.x,p.z)}},{signal:abort.signal});
 root.querySelector('form')!.addEventListener('submit',e=>{e.preventDefault();void request('join',{code:(root.querySelector('input') as HTMLInputElement).value.trim().toUpperCase()})},{signal:abort.signal});
 const interval=setInterval(()=>{if(dead)return;if(!root.isConnected){stop();return;}if(!snap)return;const p=ctx.world.player.root.position;void request('tick',{room:snap.room,controlEpoch:snap.controlEpoch,seq:++seq,actionSeq:0,input:{x:0,z:0},...(started?{position:{x:p.x,y:p.y,z:p.z}}:{})});},250);
 function stop(){if(dead)return;dead=true;clearInterval(interval);cancelAnimationFrame(frame);abort.abort();root.remove();group.removeFromParent();for(const a of avatars.values())disposeAvatar(a);for(const r of rings){r.geometry.dispose();(r.material as T.Material).dispose()}if(snap)void api('relay/leave',{room:snap.room,controlEpoch:snap.controlEpoch}).catch(()=>{});stopPrevious=null;}
 stopPrevious=stop;
}
