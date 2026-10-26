export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const vec=(x=0,y=0,z=0)=>({x,y,z});
export const add=(a,b,k=1)=>vec(a.x+b.x*k,a.y+b.y*k,a.z+b.z*k);
export const sub=(a,b)=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
export const len=a=>Math.hypot(a.x,a.y,a.z);
export const dist=(a,b)=>len(sub(a,b));
export function unit(a,flat=false){const n=v=>Number.isFinite(Number(v))?Number(v):0;const b=vec(n(a?.x),flat?0:n(a?.y),n(a?.z));const l=len(b);return l>.001?vec(b.x/l,b.y/l,b.z/l):vec(0,0,-1)}
export function sphere(center,r,p){const d=sub(add(p,vec(0,1.1,0)),center);return Math.hypot(Math.max(0,Math.abs(d.x)-.45),Math.max(0,Math.abs(d.y)-1),Math.max(0,Math.abs(d.z)-.45))<=r}
export function box(center,half,dir,p){const q=sub(add(p,vec(0,1.1,0)),center),f=unit(dir,true),r=vec(f.z,0,-f.x);return Math.abs(q.y)<=half.y+1&&Math.abs(q.x*r.x+q.z*r.z)<=half.x+Math.abs(r.x)*.45+Math.abs(r.z)*.45&&Math.abs(q.x*f.x+q.z*f.z)<=half.z+Math.abs(f.x)*.45+Math.abs(f.z)*.45&&Math.abs(q.x)<=.45+Math.abs(r.x)*half.x+Math.abs(f.x)*half.z&&Math.abs(q.z)<=.45+Math.abs(r.z)*half.x+Math.abs(f.z)*half.z}
export const melee=(p,d,reach,width,height,t)=>box(add(add(p,vec(0,height/2,0)),d,reach/2),vec(width/2,height/2,reach/2),d,t);
export function segmentBox(a,b,c,r=0){let low=0,high=1;for(const [axis,mn,mx] of [['x',c.x-c.hw-r,c.x+c.hw+r],['y',c.y0-r,c.h+r],['z',c.z-c.hd-r,c.z+c.hd+r]]){const d=b[axis]-a[axis];if(Math.abs(d)<1e-8){if(a[axis]<mn||a[axis]>mx)return null;}else{let x=(mn-a[axis])/d,y=(mx-a[axis])/d;if(x>y)[x,y]=[y,x];low=Math.max(low,x);high=Math.min(high,y);if(low>high)return null;}}return low}
export class World{
 constructor(data={}){this.cols=(data.cols||[]).map(c=>({...c,until:0}));this.walks=data.walks||[];this.holes=data.holes||[];this.props=data.props||[];this.machines=data.machines||[];this.byId=new Map(this.cols.map(c=>[c.id,c]));this.grid=new Map();this.walkGrid=new Map();for(const c of this.cols)this.insert(this.grid,c.x-c.hw,c.x+c.hw,c.z-c.hd,c.z+c.hd,c);for(const w of this.walks)this.insert(this.walkGrid,w.x0,w.x1,w.z0,w.z1,w);}
 insert(g,x0,x1,z0,z1,c){for(let x=Math.floor(x0/12);x<=Math.floor(x1/12);x++)for(let z=Math.floor(z0/12);z<=Math.floor(z1/12);z++){const k=x+','+z;if(!g.has(k))g.set(k,[]);g.get(k).push(c)}}
 nearby(p,r=1){const out=new Set();for(let x=Math.floor((p.x-r)/12);x<=Math.floor((p.x+r)/12);x++)for(let z=Math.floor((p.z-r)/12);z<=Math.floor((p.z+r)/12);z++)for(const c of this.grid.get(x+','+z)||[])out.add(c);return [...out]}
 ground(p,now){let y=-40;for(const w of this.walkGrid.get(Math.floor(p.x/12)+','+Math.floor(p.z/12))||[]){if(w.part&&this.byId.get(w.part)?.until>now||p.x<w.x0||p.x>w.x1||p.z<w.z0||p.z>w.z1)continue;let h=w.a;if(w.a!==w.b){let t=w.ax==='x'?(p.x-w.x0)/(w.x1-w.x0):(p.z-w.z0)/(w.z1-w.z0);h=w.a+(w.b-w.a)*(w.rev?1-t:t)}if(h<=p.y+.7)y=Math.max(y,h)}if(p.y>=-.7&&!this.holes.some(h=>p.x>h.x0&&p.x<h.x1&&p.z>h.z0&&p.z<h.z1))y=Math.max(y,0);return y}
 collide(p,now,r=.45){for(let j=0;j<2;j++)for(const c of this.nearby(p,2)){if(c.until>now||p.y>=c.h-.3||p.y+2.2<=c.y0||Math.abs(p.x-c.x)>=c.hw+r||Math.abs(p.z-c.z)>=c.hd+r)continue;const dx=c.hw+r-Math.abs(p.x-c.x),dz=c.hd+r-Math.abs(p.z-c.z);if(dx<dz)p.x+=(p.x>=c.x?1:-1)*dx;else p.z+=(p.z>=c.z?1:-1)*dz;}}
 ray(a,b,now,r=0){let best=null,t=2;const mid=add(a,b);mid.x/=2;mid.y/=2;mid.z/=2;for(const c of this.nearby(mid,dist(a,b)/2+r+1)){if(c.until>now)continue;const s=segmentBox(a,b,c,r);if(s!==null&&s<t){t=s;best={c,point:add(a,sub(b,a),s),t}}}return best}
 destroy(p,r,now){const ids=[];for(const c of this.nearby(p,r+1)){if(!c.destructible||c.until>now)continue;const dx=Math.max(0,Math.abs(p.x-c.x)-c.hw),dz=Math.max(0,Math.abs(p.z-c.z)-c.hd),dy=Math.max(c.y0-p.y,p.y-c.h,0);if(Math.hypot(dx,dy,dz)<r){c.until=now+20;ids.push(c.id)}}return ids}
}
