// Game relay server for Five Card Draw + Rummy Royale (no dependencies). Run: node server.js
// Pages: /  or /poker = Five Card Draw (index.html) · /rummy = Rummy Royale (rummy.html)
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,rooms={};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const sse=(res,o)=>{try{res.write('data: '+JSON.stringify(o)+'\n\n');}catch(e){}};
const json=(res,c,o)=>{res.writeHead(c,{...CORS,'Content-Type':'application/json'});res.end(JSON.stringify(o));};
const readBody=req=>new Promise(r=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e5)req.destroy();});req.on('end',()=>{try{r(JSON.parse(d||'{}'));}catch(e){r({});}});req.on('error',()=>r({}));});
function newCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(;;){let c='';for(let i=0;i<5;i++)c+=a[Math.floor(Math.random()*a.length)];if(!rooms[c])return c;}}
function dropRoom(code,msg){const r=rooms[code];if(!r)return;clearTimeout(r.gone);Object.values(r.clients).forEach(c=>{sse(c,{t:'err',m:msg});try{c.end();}catch(e){}});delete rooms[code];}
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),p=u.pathname;
  if(req.method==='OPTIONS'){res.writeHead(204,CORS);return res.end();}
  if(p==='/health')return json(res,200,{ok:true,rooms:Object.keys(rooms).length});
  if(p==='/api/create'&&req.method==='POST'){
    const b=await readBody(req);if(!b.tok)return json(res,400,{});
    let code=String(b.code||'').toUpperCase();
    if(code){
      if(!/^[A-Z0-9]{4,6}$/.test(code))return json(res,400,{});
      const r=rooms[code];
      if(r&&r.hres)return json(res,200,{taken:true});
      if(r){clearTimeout(r.gone);r.host=String(b.tok);r.t=Date.now();return json(res,200,{code});}
    }else code=newCode();
    rooms[code]={host:String(b.tok),hres:null,clients:{},t:Date.now(),gone:null};return json(res,200,{code});
  }
  if(p==='/api/stream'){
    const code=String(u.searchParams.get('room')||'').toUpperCase(),tok=u.searchParams.get('tok'),role=u.searchParams.get('role'),r=rooms[code];
    res.writeHead(200,{...CORS,'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 2000\n\n');
    if(!r||!tok){sse(res,{t:'err',m:'Room not found. Check the code.'});return res.end();}
    if(role==='host'){
      if(tok!==r.host){sse(res,{t:'err',m:'Not the host.'});return res.end();}
      clearTimeout(r.gone);r.hres=res;
      req.on('close',()=>{if(r.hres===res){r.hres=null;clearTimeout(r.gone);r.gone=setTimeout(()=>dropRoom(code,'The host left the room.'),90000);}});
    }else{
      if(r.clients[tok]){try{r.clients[tok].end();}catch(e){}}
      r.clients[tok]=res;if(r.hres)sse(r.hres,{from:tok,m:{t:'open'}});
      req.on('close',()=>{if(r.clients[tok]===res){delete r.clients[tok];if(r.hres)sse(r.hres,{from:tok,m:{t:'close'}});}});
    }
    return;
  }
  if(p==='/api/send'&&req.method==='POST'){
    const b=await readBody(req),r=rooms[String(b.room||'').toUpperCase()];if(!r||!b.m)return json(res,404,{ok:false});
    if(String(b.tok)===r.host){const c=r.clients[b.to];if(!c)return json(res,200,{ok:false});sse(c,b.m);return json(res,200,{ok:true});}
    if(!r.hres)return json(res,200,{ok:false});sse(r.hres,{from:String(b.tok),m:b.m});return json(res,200,{ok:true});
  }
  const pages={'/':['index.html','Five-Card-Draw.html','rummy.html'],'/rummy':['rummy.html'],'/poker':['index.html','Five-Card-Draw.html']};
  for(const f of (pages[p.replace(/\/+$/,'')||'/']||[])){const fp=path.join(__dirname,f);if(fs.existsSync(fp)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(fp));}}
  res.writeHead(404);res.end('Page not found. Put index.html (poker) and/or rummy.html next to server.js');
}).listen(PORT,()=>console.log('Five Card Draw server on port '+PORT));
setInterval(()=>{const now=Date.now();for(const c in rooms){const r=rooms[c];if(r.hres)sse(r.hres,{t:'ping'});Object.values(r.clients).forEach(x=>{try{x.write(': ping\n\n');}catch(e){}});if(now-r.t>12*3600e3)dropRoom(c,'Room expired.');}},20000);
