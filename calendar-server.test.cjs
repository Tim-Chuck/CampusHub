const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const {server,createServer,launchOptions}=require('./server.cjs');
test('Calendar API parses previews, refuses webpages, and restricts request origins and private URLs',async t=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port;
 for(const [route,type] of [['/campus-core.js','text/javascript'],['/campus.js','text/javascript'],['/sync-core.js','text/javascript'],['/sync.js','text/javascript'],['/campus.css','text/css']]){
  const asset=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:route,headers:{Host:'127.0.0.1:4173'}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,type:res.headers['content-type'],body}))}).on('error',reject)});
  assert.equal(asset.status,200);assert.ok(asset.type.startsWith(type));assert.ok(asset.body.length>100);
 }
 const request=(route,body,headers={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,method:'POST',headers:{Host:'127.0.0.1:4173','Content-Type':'application/json',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,text})})});req.on('error',reject);req.end(JSON.stringify(body))});
 const text=fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8'),range={from:'2026-10-01',to:'2026-11-30'};
 const ok=await request('/api/calendar/parse',{text,...range});assert.equal(ok.status,200);assert.equal(JSON.parse(ok.text).events.length,4);
 const bad=await request('/api/calendar/parse',{text:'<html>login</html>',...range});assert.equal(bad.status,400);assert.ok(JSON.parse(bad.text).error.includes('不是'));
 const denied=await request('/api/calendar/parse',{text,...range},{Origin:'https://unrelated.example'});assert.equal(denied.status,403);
 const local=await request('/api/calendar/import',{url:'http://127.0.0.1/private',...range});assert.equal(local.status,400);
 const rebinding=await request('/api/calendar/parse',{text,...range},{Host:'attacker.example:4173'});assert.equal(rebinding.status,403);
});
test('LAN mode is opt-in, binds a specific private IPv4 and validates its port',()=>{
 assert.deepEqual(launchOptions([]),{lanHost:null,port:4173});assert.deepEqual(launchOptions(['--lan=192.168.10.221']),{lanHost:'192.168.10.221',port:4174});assert.equal(launchOptions(['--lan=10.0.0.5','--port=4180']).port,4180);
 for(const address of ['0.0.0.0','8.8.8.8','127.0.0.1','172.32.0.1','192.168.1.999',''])assert.throws(()=>launchOptions(['--lan='+address]));
 for(const port of ['0','80','65536','oops'])assert.throws(()=>launchOptions(['--port='+port]));
});
test('LAN host can serve assets and same-origin calendar requests without accepting unrelated hosts or origins',async t=>{
 const preview=createServer({lanHost:'192.168.10.221',port:4174});await new Promise(resolve=>preview.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>preview.close(resolve)));
 const request=(host,origin,method='GET')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:preview.address().port,path:method==='GET'?'/interface.css':'/api/calendar/parse',method,headers:{Host:host,...(origin?{Origin:origin}:{}),'Content-Type':'application/json'}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}))});req.on('error',reject);req.end(method==='POST'?JSON.stringify({text:fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8'),from:'2026-10-01',to:'2026-11-30'}):undefined)});
 assert.equal((await request('192.168.10.221:4174')).status,200);
 const valid=await request('192.168.10.221:4174','http://192.168.10.221:4174','POST');assert.equal(valid.status,200);assert.equal(JSON.parse(valid.body).events.length,4);
 assert.equal((await request('192.168.10.222:4174')).status,403);assert.equal((await request('attacker.example:4174')).status,403);assert.equal((await request('192.168.10.221:4174','https://unrelated.example','POST')).status,403);assert.equal((await request('192.168.10.221:4174','http://localhost:4173','POST')).status,403);
});

test('Public hostname is explicit, normalized and limited to an HTTPS DNS origin',()=>{
 assert.deepEqual(launchOptions(['--public-origin=https://CampusHub.de5.net/']),{lanHost:null,port:4173,publicOrigin:'https://campushub.de5.net'});
 for(const value of ['http://campushub.de5.net','https://user:secret@campushub.de5.net','https://campushub.de5.net/path','https://campushub.de5.net/?q=1','https://campushub.de5.net/#hash','https://campushub.de5.net:8443','https://localhost','https://127.0.0.1','https://[::1]','https://*.de5.net','oops','']){
  assert.throws(()=>launchOptions(['--public-origin='+value]));assert.throws(()=>createServer({publicOrigin:value}));
 }
});

test('Tunnel requests retain the public HTTPS Origin and Host; wrong hosts, cross-origin requests and forwarded spoofing are refused',async t=>{
 const origin='https://campushub.de5.net',preview=createServer({publicOrigin:origin});await new Promise(resolve=>preview.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>preview.close(resolve)));
 const request=(host,requestOrigin,method='GET',extra={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:preview.address().port,path:method==='POST'?'/api/calendar/parse':'/',method,headers:{Host:host,...(requestOrigin?{Origin:requestOrigin}:{}),'Content-Type':'application/json',...extra}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}))});req.on('error',reject);req.end(method==='POST'?JSON.stringify({text:fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8'),from:'2026-10-01',to:'2026-11-30'}):undefined)});
 assert.equal((await request('campushub.de5.net')).status,200);
 const imported=await request('campushub.de5.net',origin,'POST');assert.equal(imported.status,200);assert.equal(JSON.parse(imported.body).events.length,4);
 assert.equal((await request('127.0.0.1:4173','http://127.0.0.1:4173','POST')).status,200);
 for(const wrong of ['https://other.example','http://campushub.de5.net','http://127.0.0.1:4173','null'])assert.equal((await request('campushub.de5.net',wrong,'POST')).status,403);
 assert.equal((await request('127.0.0.1:4173',origin,'POST')).status,403);
 assert.equal((await request('www.campushub.de5.net')).status,403);
 assert.equal((await request('campushub.de5.net.attacker.example',origin,'POST',{'X-Forwarded-Host':'campushub.de5.net','X-Forwarded-Proto':'https'})).status,403);
 const localOnly=createServer();await new Promise(resolve=>localOnly.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>localOnly.close(resolve)));
 const denied=await new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:localOnly.address().port,path:'/',headers:{Host:'campushub.de5.net'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))}).on('error',reject));assert.equal(denied,403);
});
