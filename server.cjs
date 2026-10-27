const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');const net=require('node:net');const {Worker}=require('node:worker_threads');
const {downloadCalendar}=require('./calendar-import.cjs');
const root=__dirname;
const paths={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/schedule-core.js':'schedule-core.js','/timetable.js':'timetable.js','/campus-core.js':'campus-core.js','/campus.js':'campus.js','/campus.css':'campus.css','/interface.css':'interface.css','/fonts/campus-sans-regular.woff2':'assets/fonts/campus-sans-regular.woff2','/fonts/campus-sans-semibold.woff2':'assets/fonts/campus-sans-semibold.woff2'};
paths['/sync-core.js']='sync-core.js';paths['/sync.js']='sync.js';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function readJSON(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024)throw Error('请求内容过大，日历文件不能超过 2MB。');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('请求格式不正确。')}}
function parseInWorker(text,from,to){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(root,'calendar-worker.cjs'),{workerData:{text,from,to},resourceLimits:{maxOldGenerationSizeMb:96}});const timer=setTimeout(()=>{worker.terminate();reject(Error('日历解析超时，请缩小日期范围。'))},8000);worker.once('message',result=>{clearTimeout(timer);worker.terminate();result.ok?resolve(result):reject(Error(result.error))});worker.once('error',()=>{clearTimeout(timer);reject(Error('日历解析失败，请检查文件格式。'))});worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('日历解析失败，请缩小日期范围。'))})})}
function privateIPv4(value){if(!net.isIPv4(value))return false;const [a,b]=value.split('.').map(Number);return a===10||a===192&&b===168||a===172&&b>=16&&b<=31}
function normalizePublicOrigin(value){
 let parsed;try{parsed=new URL(value)}catch{throw Error('公网地址请填写完整的 HTTPS 域名，例如 https://campushub.de5.net。')}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.hostname.length>253||! /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(parsed.hostname)||net.isIP(parsed.hostname))throw Error('公网地址须为 HTTPS 域名，不包含路径、账号或自定义端口。');
 return parsed.origin;
}
function launchOptions(args){
 let lanHost=null,requestedPort,publicOrigin;
 for(const arg of args){if(arg.startsWith('--lan='))lanHost=arg.slice(6);else if(arg.startsWith('--port='))requestedPort=Number(arg.slice(7));else if(arg.startsWith('--public-origin='))publicOrigin=normalizePublicOrigin(arg.slice(16));else throw Error('使用 node server.cjs [--lan=电脑局域网IP] [--port=4173] [--public-origin=https://你的域名]');}
 if(lanHost!==null&&!privateIPv4(lanHost))throw Error('请提供电脑的局域网 IPv4 地址，例如 --lan=192.168.1.10。');
 const port=requestedPort??(lanHost?4174:4173);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('端口须为 1024—65535 之间的整数。');
 return {lanHost,port,...(publicOrigin?{publicOrigin}:{})};
}
function createServer({port=4173,lanHost=null,publicOrigin=null}={}){
 if(lanHost!==null&&!privateIPv4(lanHost))throw Error('局域网模式只接受明确的私有 IPv4 地址。');
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('无效端口。');
 const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,...(lanHost?[`${lanHost}:${port}`]:[])]);
 const requestOrigins=new Map([...allowedHosts].map(host=>[host,`http://${host}`]));
 if(publicOrigin!==null){publicOrigin=normalizePublicOrigin(publicOrigin);const publicHost=new URL(publicOrigin).host;allowedHosts.add(publicHost);requestOrigins.set(publicHost,publicOrigin);}
 let importing=false;
 return http.createServer(async(req,res)=>{
 if(!allowedHosts.has(req.headers.host)){res.writeHead(403);return res.end('Forbidden')}
 const pathname=req.url.split('?')[0];
 if(pathname.startsWith('/api/calendar/')){
  if(req.method!=='POST')return json(res,405,{error:'请使用 POST 请求。'});
  if(req.headers.origin&&req.headers.origin!==requestOrigins.get(req.headers.host))return json(res,403,{error:'请求来源不允许。'});
  if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'请求格式不正确。'});
  if(importing)return json(res,429,{error:'正在解析另一个日历，请稍后再试。'});
  importing=true;
  try{
   if(!['/api/calendar/import','/api/calendar/parse'].includes(pathname))return json(res,404,{error:'接口不存在。'});
   const data=await readJSON(req);let text;const S=require('./schedule-core.js');if(S.diffDays(data.to,data.from)<0||S.diffDays(data.to,data.from)>366)throw Error('导入日期范围须在 1 年以内。');
   if(pathname==='/api/calendar/import')text=await downloadCalendar(data.url);else text=data.text;
   const result=await parseInWorker(text,data.from,data.to);return json(res,200,result);
  }catch(error){return json(res,400,{error:error.message||'导入失败，请检查日历链接。'})}finally{importing=false;}
 }
 const file=paths[pathname];if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);return res.end('Not found')}
 try{const content=await fs.readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:content)}catch{res.writeHead(500);res.end('Error')}
});
}
const server=createServer();
if(require.main===module){
 try{const options=launchOptions(process.argv.slice(2)),preview=options.lanHost||options.publicOrigin||options.port!==4173?createServer(options):server,host=options.lanHost||'127.0.0.1';
  preview.on('error',error=>{console.error(error.code==='EADDRINUSE'?'端口已被占用，请通过 --port=其他端口 启动。':error.code==='EADDRNOTAVAIL'?'该 IP 不属于这台电脑，请检查当前局域网地址。':error.message);process.exitCode=1});
  preview.listen(options.port,host,()=>{console.log(`CampusHub ${options.lanHost?'LAN':'preview'}: http://${host}:${options.port}`);if(options.publicOrigin)console.log(`Domain enabled: ${options.publicOrigin} (requires an HTTPS proxy or Cloudflare Tunnel)`)});
 }catch(error){console.error(error.message);process.exitCode=1}
}
module.exports={server,createServer,launchOptions,parseInWorker};
