import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { listDesigns, readDesign } from './mcp/design-store.mjs';
const root=resolve(process.argv[2]||'dist/home-viewer/browser');
const port=Number(process.argv[3]||8787);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.glb':'model/gltf-binary','.ico':'image/x-icon'};
http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/designs'||url.pathname.startsWith('/api/designs/')){
   if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end();return;}
   // Same-origin, loopback-only read bridge. Mutations are available only via stdio MCP.
   const expectedOrigin='http://'+req.headers.host;
   if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||req.headers.origin&&req.headers.origin!==expectedOrigin||req.headers['sec-fetch-site']==='cross-site'){
    res.writeHead(403);res.end();return;
   }
   try{const data=url.pathname==='/api/designs'?listDesigns():readDesign(decodeURIComponent(url.pathname.slice('/api/designs/'.length)));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
   catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'无法读取该设计文件'}));}return;
  }
  let file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(statSync(file).isDirectory())file=resolve(file,'index.html');
  const st=statSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-cache'});
  createReadStream(file).pipe(res);
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('File not found');}
}).listen(port,'127.0.0.1',()=>console.log('Home simulator: http://127.0.0.1:'+port+'/'));
