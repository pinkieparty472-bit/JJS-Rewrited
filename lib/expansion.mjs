import {vec,add,sub,unit,dist,melee,sphere,clamp} from './geometry.mjs';
export const EMOTE_CATALOG=[
 ['choque','Choque de energía','duo',250],['carry','A caballito','duo',300],['vuelo','Lanzamiento amistoso','duo',350],['abrazo','Abrazo de amigos','duo',200],['codos','Saludo de rivales','duo',200],
 ['bailegrupo','Círculo de hechiceros','group',350],['palmasgrupo','Palmas a ritmo','group',250],['ritualgrupo','Ritual de estrellas','group',400],['olagrupo','La ola','group',250],['poseteam','Equipo invencible','group',300],
 ['selfie','Selfie','interactive',200],['dado','Dado de la suerte','interactive',200],['dron','Dron de bolsillo','interactive',400],['camisa','Sin camiseta','interactive',200],['cartel','Cartel de paz','interactive',200],
 ['remate','Sentencia del vacío','kill',600],['destellofinal','Último destello','kill',500],['sentenciaroja','Puño escarlata','kill',500],['sombrasfinal','Silueta final','kill',450],['tornadoremate','Espiral celeste','kill',500],
 ['auraazar','Despertar astral','limited',350],['guardiaazar','Sello del guardián','limited',350],['impactoazar','Ritmo carmesí','limited',350],['ritmoazar','Luz del festival','limited',350],['selloazar','Pacto violeta','limited',350]
].map(([id,name,mode,price])=>({id,name,mode,price}));
export const EMOTE_TYPES=Object.fromEntries(EMOTE_CATALOG.map(q=>[q.id,q.mode]));
export const YUJI_CD={cursed:14,crushing:15,divergent:18,manji:20};
const YUJI_MOVES=['cursed','crushing','divergent','manji'];
const GOJO_MOVES=new Set(['blue','red','rapid','twofold','bmax','rmax','hpurple','ivoid','bfpunch','awaken']);
export const expansionMethods={
 initExpansion(){this.delayedHits=[];this.domains=[];},
 expansionPlayer(p){return {character:p.character||'gojo',domainLock:Math.max(0,(p.domainLock?.end||0)-this.now),cosmetic:p.cosmetic||null,shirtOff:!!p.shirtOff,killWindow:p.killWindow?{left:Math.max(0,p.killWindow.end-this.now),victim:p.killWindow.victim}:null,blackChain:p.blackChain?.count||0};},
 expansionAction(p,m){const now=this.now,a=m.action;
  if(p.domainLock?.end>now&&!['color','equip','cosmetic'].includes(a))return false;
  if(a==='stopEmote'){this.cancelSocial(p);return true;}
  if(a==='character'){if(!['gojo','yuji'].includes(m.character)||!this.ready(p)||p.combat>now||!p.ground)return false;this.cancelSocial(p);p.character=m.character;p.awaken=0;p.cast=null;p.motion=null;p.blackChain=null;this.emit('character',{id:p.id,character:p.character});return true;}
  if(a==='emote'&&EMOTE_TYPES[m.item])return this.startExtendedEmote(p,m.item);
  if(a==='interact'&&p.emote&&['dron','camisa','cartel'].includes(p.emote.id)){if(!this.ready(p)||(p.interactCD||0)>now)return false;p.interactCD=now+.5;if(p.emote.id==='camisa')p.shirtOff=!p.shirtOff;if(p.emote.id==='cartel')p.emote.value=((p.emote.value||0)+1)%3;this.emit('emoteInteract',{id:p.id,kind:p.emote.id,value:p.emote.value||0,pos:{...p.pos}});return true;}
  if(p.character!=='yuji'){if(YUJI_MOVES.includes(a))return false;return;}
  if(a==='limit'||a==='instinct')return this.yujiInstinct(p);
  if(GOJO_MOVES.has(a))return false;
  const skill=/^skill[1-4]$/.test(a)?YUJI_MOVES[+a.slice(5)-1]:YUJI_MOVES.includes(a)?a:null;
  if(!skill)return;
  if(skill==='divergent'&&p.cast?.a==='divergent'&&!p.cast.hit){const t=now-p.cast.t;if(t>=.16&&t<=.36){p.cast.black=true;this.emit('blackReady',{id:p.id});return true;}return false;}
  if(!this.ready(p)||p.block||p.held!==null||(p.cd[skill]||0)>now)return false;
  this.cancelSocial(p);const dir=unit(p.input.aim,true),air=!p.ground,oldCD=p.cd[skill]||0;
  p.cd[skill]=now+YUJI_CD[skill];p.face=Math.atan2(dir.x,dir.z);p.combat=now+5;
  p.cast={a:skill,t:now,dir,air,oldCD,tick:0,hit:false,duration:{cursed:1.65,crushing:1.15,divergent:.72,manji:.8}[skill],cancelUntil:skill==='manji'?0:air&&skill==='cursed'?.15:{cursed:.22,crushing:.33,divergent:.37}[skill]};
  if(air&&(skill==='cursed'||skill==='crushing')){p.vel.y=Math.max(8,p.vel.y);p.ground=false;}
  this.emit('action',{id:p.id,a:skill,air,dir});return true;
 },
 yujiInstinct(p){const now=this.now;if((p.cd.instinct||0)>now||p.hp<=0||p.ragdoll>now||p.stun>now||p.hold||p.domainLock?.end>now)return false;const c=p.cast;
  if(c&&c.a!=='manji'&&c.a!=='manjiReturn'&&now-c.t<(c.cancelUntil??(c.a==='m1'?(c.n===4?.18:.1):0))){p.cast=null;p.attackUntil=now;p.motion=null;p.cd[c.a]=c.oldCD||0;if(c.a==='m1')p.cd.m1=now;p.energy=Math.max(0,p.energy-3);p.cd.instinct=now+2;this.release(p.id);this.emit('feint',{id:p.id,pos:{...p.pos}});return true;}
  if(c||!this.ready(p)||p.energy<3||p.held!==null)return false;
  const q=this.props.filter(q=>q.state==='rest'&&dist(q.pos,p.pos)<2.7&&!this.world.ray(add(p.pos,vec(0,1,0)),add(q.pos,vec(0,.8,0)),now)).sort((a,b)=>dist(a.pos,p.pos)-dist(b.pos,p.pos))[0];if(!q)return false;
  p.energy-=3;p.cd.instinct=now+2;p.held=q.id;q.state='carry';q.owner=p.id;const solid=this.world.byId.get(q.part);if(solid)solid.until=Infinity;this.throw(p);q.yuji=true;this.emit('instinctThrow',{id:p.id,pos:{...p.pos}});return true;
 },
 yujiTargets(p,dir,r=3.5,w=2.2,h=3.2){return [...this.players.values()].filter(q=>q.id!==p.id&&q.hp>0&&melee(p.pos,dir,r,w,h,q.pos)&&!this.world.ray(add(p.pos,vec(0,1.1,0)),add(q.pos,vec(0,1.1,0)),this.now));},
 yujiVolume(p,c,r,w,h){this.emit('volume',{id:p.id,kind:'box',label:c.a,center:add(add(p.pos,vec(0,h/2,0)),c.dir,r/2),half:vec(w/2,h/2,r/2),dir:c.dir});},
 expansionCast(p,dt){const c=p.cast;if(!c||!YUJI_MOVES.includes(c.a)&&c.a!=='manjiReturn')return false;const now=this.now,t=now-c.t,dir=c.dir;let target=this.players.get(c.target);
  if(c.a==='cursed'){
   if(c.air){if(t>=.27&&!c.hit){p.motion={vel:add(vec(0,-20,0),dir,22),end:now+.06};this.yujiVolume(p,c,3.5,2.3,3.6);target=this.yujiTargets(p,dir,3.5,2.3,3.6)[0];if(target||p.ground&&t>.35){c.hit=true;if(target)this.damage(p,target,14,{unblockable:true,bypassRagdoll:true,type:'melee',ragdoll:1.2,speed:5,up:-18,dir});this.destroy(add(p.pos,dir,1.5),1.2);p.motion=null;c.duration=t+.16;this.emit('yujiImpact',{id:p.id,kind:'dropkick',pos:target?.pos||p.pos});}}}
   else{if(!c.hit&&t>=.18&&t<.62){p.motion={vel:add(vec(),dir,21),end:now+.05};this.yujiVolume(p,c,3.1,2.1,2.8);target=this.yujiTargets(p,dir,3.1,2.1,2.8).find(q=>q.ragdoll<=now||!q.ground);if(target){c.hit=true;p.motion=null;if(target.block&&target.ground&&target.stun<=now){this.emit('block',{id:target.id,from:p.id});p.cast=null;return true;}if(this.damage(p,target,4,{unblockable:true,type:'melee',bypassRagdoll:!target.ground,stun:1.35})){c.target=target.id;target.hold={by:p.id};p.bulletIframe=now+1.4;}else p.cast=null;}}
    target=this.players.get(c.target);if(target&&target.hp>0&&target.hold?.by===p.id){target.pos=add(p.pos,dir,1.5);target.vel=vec();while(c.tick<6&&t>=.55+c.tick*.11){c.tick++;this.damage(p,target,1.75,{unblockable:true,bypassRagdoll:true,type:'melee',stun:.4});this.emit('yujiImpact',{id:p.id,kind:'strike',pos:target.pos});}if(t>=1.28&&!c.final){c.final=true;target.hold=null;this.damage(p,target,3,{unblockable:true,bypassRagdoll:true,type:'melee',stun:.65});p.cd.dash_fwd=Math.max(p.cd.dash_fwd||0,now+.9);p.comboUntil=now+1.2;}}else if(t>=.65&&!c.target){p.cast=null;p.motion=null;}}
  }
  if(c.a==='crushing'){
   if(c.air&&t>=.15&&t<.4)p.motion={vel:add(vec(0,1,0),dir,16),end:now+.05};
   if(!c.hit&&t>=.4){c.hit=true;p.motion=null;this.yujiVolume(p,c,3.8,2.3,3.6);target=this.yujiTargets(p,dir,3.8,2.3,3.6)[0];if(target&&c.air&&target.block&&target.ground&&target.stun<=now){this.emit('block',{id:target.id,from:p.id});p.cast=null;return true;}if(target){const landed=this.damage(p,target,6,{unblockable:true,bypassRagdoll:true,type:'melee',stun:.7});if(landed){c.target=target.id;target.hold={by:p.id};}}else{for(const q of this.players.values())if(q.id!==p.id&&sphere(add(p.pos,dir,1),3,q.pos)&&!this.world.ray(add(p.pos,vec(0,1,0)),add(q.pos,vec(0,1,0)),now)){if(c.air&&q.block&&q.ground&&q.stun<=now)this.emit('block',{id:q.id,from:p.id});else this.damage(p,q,3,{unblockable:true,bypassRagdoll:true,type:'melee',stun:.35});}}this.emit('yujiImpact',{id:p.id,kind:'slam',pos:target?.pos||p.pos});this.destroy(add(p.pos,dir,1.5),1.3);}
   target=this.players.get(c.target);if(target?.hold?.by===p.id){target.pos=add(p.pos,dir,1.4);target.vel=vec();if(t>=.82&&!c.final){c.final=true;target.hold=null;this.damage(p,target,6,{unblockable:true,bypassRagdoll:true,type:'melee',ragdoll:1.2,up:18,speed:2,dir});this.emit('yujiImpact',{id:p.id,kind:'slam',pos:target.pos});}}
  }
  if(c.a==='divergent'&&t>=.4&&!c.hit){c.hit=true;this.yujiVolume(p,c,3.2,2.1,3);target=this.yujiTargets(p,dir,3.2,2.1,3)[0];if(target){const interrupt=!!target.cast||!!target.dash,back=(()=>{const d=unit(sub(p.pos,target.pos),true);return d.x*Math.sin(target.face)+d.z*Math.cos(target.face)<-.35})();
    if(c.black){if(target.ragdoll<=now||!target.ground){let count=(p.blackChain?.end>now?p.blackChain.count:0)+1;const chain=back&&count<=4,damage=chain?(count===4?15:interrupt?14:7):interrupt?20:10;const landed=this.damage(p,target,damage,{unblockable:true,type:'melee',bypassRagdoll:!target.ground,stun:chain&&count<4?.7:0,ragdoll:chain&&count<4?0:1.25,trueRagdoll:chain&&count===4,speed:18,up:9,dir});if(landed&&chain&&count<4){p.blackChain={count,end:now+2};p.cd.divergent=now;p.cd.dash_side=now;}else p.blackChain=null;this.emit('yujiBlackFlash',{id:p.id,pos:{...target.pos},chain:chain?count:0,damage});}}
    else{this.damage(p,target,5,{type:'melee',stun:.35});this.delayedHits.push({at:now+.25,from:p.id,to:target.id,dir:{...dir},pos:{...target.pos}});}}
  }
  if(c.a==='manjiReturn'&&t>=.18&&!c.hit){c.hit=true;target=this.players.get(c.target);if(target&&dist(p.pos,target.pos)<=4.5)this.damage(p,target,8.5,{unblockable:true,bypassRagdoll:true,type:'melee',ragdoll:1.15,trueRagdoll:true,speed:18,up:10,dir});this.emit('yujiImpact',{id:p.id,kind:'counter',pos:target?.pos||p.pos});}
  if(t>=c.duration&&p.cast===c){p.cast=null;p.motion=null;this.release(p.id);}return true;
 },
 expansionDamage(p,t,opts){if(!t||t.hp<=0||t.domainLock?.end>this.now||!t.cast||t.cast.a!=='manji'||this.now-t.cast.t>.6||opts.domain||opts.self||!['melee','bullet',undefined].includes(opts.type))return false;const dir=unit(sub(p.pos,t.pos),true);if(opts.type==='bullet'&&dist(t.pos,p.pos)<35){const at=add(p.pos,dir,-2);if(!this.world.ray(add(t.pos,vec(0,1,0)),add(at,vec(0,1,0)),this.now)){t.pos=at;this.world.collide(t.pos,this.now);}}
  t.hold=null;t.cast={a:'manjiReturn',target:p.id,dir,t:this.now,duration:.5,hit:false};t.vel=vec();t.motion=null;t.iframe=this.now+.5;t.bulletIframe=this.now+.5;this.emit('counter',{id:t.id,from:p.id,pos:{...t.pos}});return true;
 },
 startDomain(p){const d={owner:p.id,pos:{...p.pos},r:30,end:this.now+14};this.domains.push(d);this.emit('domain',{owner:p.id,pos:d.pos,r:30,end:d.end});this.lockDomainPlayers(d);},
 lockDomainPlayers(d){for(const q of this.players.values())if(q.id!==d.owner&&q.hp>0&&!q.clashId&&!q.domainLock&&dist(q.pos,d.pos)<d.r){this.cancelSocial(q);q.domainLock={owner:d.owner,end:d.end,anchor:{...q.pos},next:this.now+1};q.cast=null;q.dash=null;q.motion=null;q.hold=null;q.vel=vec();q.block=false;q.drink=0;this.release(q.id);}},
 expansionPre(dt){const now=this.now;this.domains=this.domains.filter(d=>d.end>=now);for(const d of this.domains)this.lockDomainPlayers(d);
  for(const p of this.players.values()){if(p.cosmetic?.ready>now&&p.emote?.id!==p.cosmetic.theme)p.cosmetic=null;const l=p.domainLock;if(l){if(now>l.end||p.hp<=0){while(l.next<=Math.min(now,l.end)+1e-7&&p.hp>0){l.next+=1;const owner=this.players.get(l.owner)||p;this.damage(owner,p,.5,{domain:true,self:owner===p,unblockable:true,bypassRagdoll:true,bypassIframes:true,type:'domain'});}p.domainLock=null;}else{p.pos={...l.anchor};p.vel=vec();p.cast=null;p.dash=null;p.motion=null;p.hold=null;p.block=false;while(l.next<=now&&l.next<=l.end&&p.hp>0){l.next+=1;const owner=this.players.get(l.owner)||p;this.damage(owner,p,.5,{domain:true,self:owner===p,unblockable:true,bypassRagdoll:true,bypassIframes:true,type:'domain'});}}}if(p.blackChain?.end<now)p.blackChain=null;if(p.killWindow?.end<now)p.killWindow=null;}
  for(let i=this.delayedHits.length-1;i>=0;i--){const q=this.delayedHits[i];if(q.at>now)continue;this.delayedHits.splice(i,1);const p=this.players.get(q.from),t=this.players.get(q.to);if(!p||!t||t.hp<=0||dist(t.pos,q.pos)>8)continue;const interrupted=!!t.cast||!!t.dash;this.damage(p,t,5,{unblockable:true,bypassRagdoll:true,type:'melee',stun:interrupted?.7:0,ragdoll:interrupted?0:1,speed:13,up:6,dir:q.dir});this.emit('yujiImpact',{id:p.id,kind:'delayed',pos:{...t.pos},interrupted});}
  this.socialPhysics(dt);
 },
 expansionPost(){for(const p of this.players.values())if(p.domainLock?.end>=this.now&&p.hp>0){p.pos={...p.domainLock.anchor};p.vel=vec();p.cast=null;p.dash=null;p.hold=null;p.block=false;p.ground=false;}},
 wallJump(p){if(p.ground){p.lastWall=null;return false;}if(p.domainLock?.end>this.now||p.hold||p.cast||p.ragdoll>this.now||p.stun>this.now||!p.input.moving||!p.input.jump||p.jumpHeld||(p.wallCD||0)>this.now)return false;const near=this.world.nearby(p.pos,1.4).filter(c=>c.until<=this.now&&c.h>p.pos.y+.65&&c.y0<p.pos.y+1.8);let best=null;
  for(const c of near){const dx=Math.abs(p.pos.x-c.x)-c.hw,dz=Math.abs(p.pos.z-c.z)-c.hd;let normal,gap;if(Math.abs(p.pos.z-c.z)<c.hd+.35&&dx>=-.1&&dx<.85){normal=vec(p.pos.x>=c.x?1:-1,0,0);gap=dx;}if(Math.abs(p.pos.x-c.x)<c.hw+.35&&dz>=-.1&&dz<.85&&(!normal||dz<gap)){normal=vec(0,0,p.pos.z>=c.z?1:-1);gap=dz;}if(normal&&c.id!==p.lastWall&&(!best||gap<best.gap))best={c,normal,gap};}
  if(!best)return false;p.lastWall=best.c.id;p.wallCD=this.now+.22;p.vel=add(add(vec(0,11.5,0),best.normal,10),p.input.dir,2.5);p.motion={vel:{...p.vel},end:this.now+.16,wall:true};p.ground=false;this.emit('wallJump',{id:p.id,pos:{...p.pos},normal:best.normal});return true;
 },
 startExtendedEmote(p,id){const mode=EMOTE_TYPES[id],now=this.now;if(!p.owned.includes(id)||!this.ready(p)||p.domainLock?.end>now)return false;
  if(mode==='kill'){const w=p.killWindow;if(!w||w.end<now)return false;p.killWindow=null;p.cosmetic=null;this.cancelSocial(p);p.emote={id,t:now};this.emit('killScene',{id:p.id,victim:w.victim,pos:w.pos,origin:{...p.pos},style:id,duration:2.4});return true;}
  if(!p.ground||p.combat>now)return false;this.cancelSocial(p);p.cosmetic=null;p.toolDrawn=false;p.emote={id,t:now,waiting:mode==='duo'||mode==='group'};
  if(mode==='duo'||mode==='group'){const sid='social'+ ++this.socialSerial;this.socials.set(sid,{id:sid,emote:id,type:mode,host:p.id,members:[p.id],started:null,created:now});p.socialId=sid;}
  if(mode==='limited'){p.cosmetic={kind:['block','hit','aura'][Math.floor(Math.random()*3)],theme:id,ready:now+1.1};this.emit('limited',{id:p.id,kind:p.cosmetic.kind,theme:id,pos:{...p.pos}});}
  if(id==='camisa')p.shirtOff=!p.shirtOff;return true;
 },
 expansionDeath(p,t){t.cosmetic=null;t.shirtOff=false;t.domainLock=null;t.blackChain=null;t.killWindow=null;t.motion=null;if(p.id!==t.id&&!t.isDummy&&this.players.has(p.id)&&this.players.has(t.id)){p.killWindow={victim:t.id,pos:{...t.pos},end:this.now+5};this.emit('killAvailable',{id:p.id,victim:t.id,left:5});}},
 socialPhysics(dt){for(const s of [...this.socials.values()]){if(s.started===null)continue;const host=this.players.get(s.host),guest=this.players.get(s.members[1]);if(!host||!guest)continue;const age=this.now-s.started;
   if(s.emote==='carry'){const bad=host.hp<=0||guest.hp<=0||host.cast||guest.cast||guest.input.moving||guest.input.jump||host.input.block||guest.input.block||host.ragdoll>this.now||guest.ragdoll>this.now||host.domainLock||guest.domainLock;if(bad){this.cancelSocial(host);continue;}const dir=vec(Math.sin(host.face),0,Math.cos(host.face)),at=add(add(host.pos,dir,-.4),vec(0,1.35,0));if(this.world.ray(add(host.pos,vec(0,1.8,0)),add(at,vec(0,.8,0)),this.now)){this.cancelSocial(host);continue;}guest.socialCarry=host.id;guest.pos=at;guest.vel=vec();guest.ground=false;}
   if(s.emote==='vuelo'&&age<1.4){if(host.input.moving||guest.input.moving||host.input.jump||guest.input.jump||host.cast||guest.cast||host.hp<=0||guest.hp<=0){this.cancelSocial(host);continue;}const dir=vec(Math.sin(host.face),0,Math.cos(host.face));guest.socialCarry=host.id;guest.pos=add(add(host.pos,dir,1.5),vec(0,2.2,0));guest.vel=vec();guest.ground=false;}
   if(s.emote==='vuelo'&&age>=1.4&&!s.launched){s.launched=true;const dir=vec(Math.sin(host.face),0,Math.cos(host.face));this.cancelSocial(host);guest.vel=add(vec(0,15,0),dir,22);guest.ragdoll=this.now+1.3;guest.stun=guest.ragdoll;guest.ground=false;guest.harmlessThrowUntil=this.now+3;this.emit('friendlyThrow',{id:host.id,target:guest.id,pos:{...guest.pos}});}
  }
  for(const p of this.players.values()){if(!p.socialId)p.socialCarry=null;if(p.emote&&EMOTE_TYPES[p.emote.id]==='kill'&&this.now-p.emote.t>2.4)p.emote=null;}
 },
};
