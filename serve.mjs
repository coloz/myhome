import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const root=resolve(process.argv[2]||'dist/home-viewer/browser');
const port=Number(process.argv[3]||8787);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.glb':'model/gltf-binary','.ico':'image/x-icon'};
http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  let file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(statSync(file).isDirectory())file=resolve(file,'index.html');
  const st=statSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-cache'});
  createReadStream(file).pipe(res);
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('File not found');}
}).listen(port,'127.0.0.1',()=>console.log('Home simulator: http://127.0.0.1:'+port+'/'));
