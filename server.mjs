import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {gzipSync} from 'node:zlib';
import {randomUUID,createHash} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {Room,MAX_PLAYERS} from './lib/game.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export function createArena({map=JSON.parse(fs.readFileSync(path.join(root,'map.json'),'utf8')),port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0',autoTick=true}={}){
 const html=fs.readFileSync(path.join(root,'public/index.html')),compressedHTML=gzipSync(html),htmlTag='"'+createHash('sha256').update(html).digest('hex').slice(0,24)+'"';
 const rooms=new Map(),clients=new Map();let next=1;
 const server=http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(req.url?.split('?')[0]==='/api/rooms'){res.setHeader('Content-Type','application/json');res.setHeader('Access-Control-Allow-Origin','*');res.end(JSON.stringify({capacity:MAX_PLAYERS,rooms:[...rooms.values()].map(r=>({id:r.id,count:r.players.size,max:MAX_PLAYERS}))}));return;}
  if(['/','/index.html','/favicon.ico'].includes(req.url?.split('?')[0])){if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');res.setHeader('ETag',htmlTag);res.setHeader('Vary','Accept-Encoding');if(req.headers['if-none-match']===htmlTag){res.writeHead(304);res.end();return;}const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');if(gzip)res.setHeader('Content-Encoding','gzip');const body=gzip?compressedHTML:html;res.setHeader('Content-Length',body.length);res.end(body);return;}
  res.writeHead(404);res.end('No encontrado');
 });
 const wsServer=new WebSocketServer({server,path:'/ws',maxPayload:4096,perMessageDeflate:false});
 const wireNumber=(key,value)=>typeof value==='number'&&Number.isFinite(value)?Math.round(value*1000)/1000:value;
 const send=(ws,m)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<1_000_000)ws.send(typeof m==='string'?m:JSON.stringify(m,wireNumber))};
 wsServer.on('connection',ws=>{
  const c={id:randomUUID().slice(0,12),room:null,alive:true,count:0,since:Date.now(),joined:false};clients.set(ws,c);
  const timeout=setTimeout(()=>{if(!c.joined)ws.close(4001,'Primero elige un nombre');},8000);
  ws.on('pong',()=>c.alive=true);
  ws.on('message',data=>{
   if(Date.now()-c.since>1000){c.count=0;c.since=Date.now()}if(++c.count>90){ws.close(4008,'Demasiadas solicitudes');return;}
   let m;try{m=JSON.parse(data.toString())}catch{send(ws,{type:'error',message:'Mensaje inválido'});return;}if(!m||typeof m!=='object')return;
   if(m.type==='join'&&!c.joined){const name=(typeof m.name==='string'?m.name:'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18);if(name.length<2){send(ws,{type:'error',message:'Escribe un nombre de 2 a 18 caracteres'});return;}
    const requested=typeof m.room==='string'?m.room.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,20):'';let r;
    if(requested){r=rooms.get(requested);if(r&&r.players.size>=MAX_PLAYERS){send(ws,{type:'error',message:'Esta sala está llena (10/10). Elige otra sala o la búsqueda automática.'});return;}if(!r){if(rooms.size>=100){send(ws,{type:'error',message:'No hay más salas disponibles'});return;}r=new Room(requested,map);rooms.set(r.id,r);}}
    else{r=[...rooms.values()].find(r=>r.players.size<MAX_PLAYERS);if(!r){if(rooms.size>=100){send(ws,{type:'error',message:'Servidor ocupado'});return;}r=new Room('SALA-'+next++,map);rooms.set(r.id,r)}}
    const player=r.join(c.id,name,Array.isArray(m.owned)?m.owned.filter(i=>typeof i==='string').slice(0,40):[],Array.isArray(m.accessories)?m.accessories.filter(i=>typeof i==='string').slice(0,3):[]);if(!player){send(ws,{type:'error',message:'Sala llena'});return;}c.room=r;c.joined=true;clearTimeout(timeout);send(ws,{type:'welcome',id:c.id,room:r.id,name:player.name,capacity:MAX_PLAYERS,mapVersion:map.version,chat:r.history(),terrain:r.world.state(r.now),broken:r.world.state(r.now).broken});return;
   }
   const r=c.room;if(!r)return;
   if(m.type==='input')r.input(c.id,m);else if(m.type==='action'){const accepted=r.action(c.id,m);send(ws,{type:'ack',seq:m.seq,action:m.action,accepted});}
   else if(m.type==='chat'){const text=(typeof m.text==='string'?m.text:'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,120);if(text&&(!c.lastChat||Date.now()-c.lastChat>800)){c.lastChat=Date.now();r.chat(c.id,text)}}
   else if(m.type==='history')send(ws,{type:'history',...r.history(Number.isSafeInteger(m.before)&&m.before>0?m.before:undefined)});
   else if(m.type==='ping')send(ws,{type:'pong',at:m.at});
  });
  ws.on('close',()=>{clearTimeout(timeout);c.room?.leave(c.id);clients.delete(ws)});
  ws.on('error',()=>{});
 });
 const tick=()=>{for(const r of rooms.values()){r.step(1/30);r.frame=(r.frame||0)+1;if(r.frame%2===0){const snap=JSON.stringify(r.snapshot(),wireNumber);for(const [ws,c] of clients)if(c.room===r)send(ws,snap)}if(!r.players.size){if(!r.emptySince)r.emptySince=Date.now();if(Date.now()-r.emptySince>60_000)rooms.delete(r.id)}else r.emptySince=0;}};
 const timer=autoTick?setInterval(tick,1000/30):null;
 const heartbeat=setInterval(()=>{for(const [ws,c] of clients){if(!c.alive){ws.terminate();continue;}c.alive=false;ws.ping()}},20000);heartbeat.unref();
 const close=async()=>{if(timer)clearInterval(timer);clearInterval(heartbeat);for(const ws of clients.keys())ws.terminate();await new Promise(resolve=>wsServer.close(resolve));await new Promise(resolve=>server.close(resolve))};
 return {server,rooms,clients,tick,close,listen:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address())))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const app=createArena();app.listen().then(addr=>{console.log('Gojo Arena listo en http://localhost:'+addr.port+' · salas de 10 jugadores · Ctrl+C para detener');for(const nets of Object.values(networkInterfaces()))for(const n of nets||[])if(n.family==='IPv4'&&!n.internal)console.log('Otros equipos en tu red: http://'+n.address+':'+addr.port);});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.close().then(()=>process.exit(0)));}
