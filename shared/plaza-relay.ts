/** A casual, unranked plaza relay. Existing room identity and block checks apply. */
export const PLAZA_START = {x:2,z:5};
export const PLAZA_STOPS = [{x:-5,z:4,jump:true,name:'Kopi corner'},{x:-5,z:-4,jump:false,name:'Arcade Row'},{x:6,z:-4,jump:false,name:'Mama Shop'},{x:6,z:5,jump:true,name:'Dragon gate'}];
export type PlazaRunner={slot:number;bot:boolean;team:number;x:number;y:number;z:number;seen:number;name:string};
export type PlazaRelay={kind:'plaza';tick:number;status:'running'|'finished'|'timeout';runners:PlazaRunner[];legs:number[];owners:number[];times:(number|null)[];handoffs:number;lastHandoff:number;winner:number|null};
export function createPlazaRelay(slots:number[]):PlazaRelay{return {kind:'plaza',tick:0,status:'running',runners:Array.from({length:8},(_,slot)=>({slot,bot:slot>=4||!slots.includes(slot),team:slot<4?0:1,x:PLAZA_START.x+(slot%4)*.4,y:.1,z:PLAZA_START.z+(slot>=4?1:0),seen:0,name:['You','Milo','Pandan','Peach','Coco','Bao','Luna','Kaya'][slot]})),legs:[0,0],owners:[0,4],times:[null,null],handoffs:0,lastHandoff:0,winner:null}}
export function plazaPosition(s:PlazaRelay,slot:number,p:{x:number;y:number;z:number}){
 const r=s.runners.find(r=>r.slot===slot);if(!r||r.bot||s.status!=='running')return;
 if(![p.x,p.y,p.z].every(Number.isFinite)||Math.abs(p.x)>40||Math.abs(p.z)>30||p.y<0||p.y>9)throw Error('Invalid plaza position.');
 const seconds=Math.min(3,Math.max(.25,(s.tick-r.seen)/60));
 if(Math.hypot(p.x-r.x,p.z-r.z)>seconds*8+1)throw Error('Stay on the plaza course.');
 r.x=p.x;r.y=p.y;r.z=p.z;r.seen=s.tick;
}
export function advancePlazaRelay(s:PlazaRelay){
 if(s.status!=='running')return;s.tick++;
 for(let team=0;team<2;team++){
  const leg=s.legs[team];if(leg>=4)continue;
  const target=PLAZA_STOPS[leg],owner=s.runners[s.owners[team]];
  for(const r of s.runners.filter(r=>r.team===team&&r.bot)){
   const dx=target.x-r.x,dz=target.z-r.z,d=Math.hypot(dx,dz),step=(r.slot===owner.slot?2.5:3)/60;
   if(d>.35){r.x+=dx/d*Math.min(d,step);r.z+=dz/d*Math.min(d,step)}
   r.y=target.jump&&d<1.3?.1+Math.abs(Math.sin(s.tick*.08))*1.3:.1;
  }
  // A disconnected teammate is replaced by an explicitly labelled computer.
  if(!owner.bot&&s.tick-owner.seen>300){owner.bot=true;owner.name='Relief runner';}
  if(Math.hypot(owner.x-target.x,owner.z-target.z)<1.25&&(!target.jump||owner.y>.7)){
   const next=s.runners[team*4+((leg+1)%4)];
   if(leg<3&&Math.hypot(next.x-owner.x,next.z-owner.z)>2.8)continue;
   s.legs[team]++;s.owners[team]=next.slot;s.handoffs++;s.lastHandoff=s.tick;
   if(s.legs[team]===4){s.times[team]=s.tick/60;if(s.winner===null)s.winner=team;}
  }
 }
 if(s.legs.every(l=>l===4))s.status='finished';else if(s.tick>=7200)s.status='timeout';
}
