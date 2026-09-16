const PROJECT='nbdodqezyijrztikvkcd',BASE_URL='https://'+PROJECT+'.supabase.co';
const USER={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'editor@example.test',is_anonymous:false,app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:USER.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.');
const session=()=>({access_token:token(),refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:USER});
function database(){return {rows:new Map(),writes:[],deletions:[],deleted:new Set(),offline:false,delay:0,loseResponse:false};}
async function installSupabaseMock(context,{signedIn=true,db=database()}={}){
 // Guard every Supabase call; no test is allowed to write to the real project.
 await context.route(BASE_URL+'/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname.startsWith('/auth/v1/')){
   if(url.pathname.endsWith('/token'))return respond(session());
   if(url.pathname.endsWith('/user'))return respond(USER);
   if(url.pathname.endsWith('/logout'))return respond({});
   return respond({message:'Unknown test auth endpoint'},400);
  }
  if(db.offline)return route.abort('internetdisconnected');
  if(url.pathname.endsWith('/rpc/delete_home_design_scheme')){
   if(!req.headers().authorization)return respond({message:'Sign in'},403);
   if(db.deleteUnavailable)return respond({message:'Function not found'},404);
   const p=req.postDataJSON();db.deletions.push(p);if(db.delay)await new Promise(r=>setTimeout(r,db.delay));
   if(['original','alternative','raw-shell'].includes(p.p_id))return respond(false,400);
   if(db.deleted.has(p.p_id))return respond(true);
   const row=db.rows.get(p.p_id);if(row&&(row.revision!==p.p_expected_revision||row.template_id!==p.p_template_id))return respond(false);
   db.deleted.add(p.p_id);db.rows.delete(p.p_id);return respond(true);
  }
  if(url.pathname.endsWith('/rpc/save_home_design_scheme')){
   if(!req.headers().authorization)return respond({message:'Sign in'},403);
   const p=req.postDataJSON();db.writes.push(structuredClone(p));
   if(db.rejectRaw&&p.p_template_id==='raw-shell')return respond({message:'home_design_schemes_template_id_check'},400);
   if(db.delay)await new Promise(r=>setTimeout(r,db.delay));
   if(db.deleted.has(p.p_id))return respond([]);
   const row=db.rows.get(p.p_id);
   if(row?.last_mutation_id===p.p_mutation_id)return respond([row]);
   if((row?.revision??0)!==p.p_expected_revision)return respond([]);
   const saved={id:p.p_id,name:p.p_name,template_id:p.p_template_id,layout:p.p_layout,revision:(row?.revision??0)+1,updated_at:new Date().toISOString(),last_mutation_id:p.p_mutation_id};
   db.rows.set(saved.id,saved);
   if(db.loseResponse){db.loseResponse=false;return route.abort('connectionreset');}
   return respond([saved]);
  }
  if(url.pathname.endsWith('/home_design_schemes')){
   const id=url.searchParams.get('id')?.slice(3),offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??1000);
   return respond([...db.rows.values()].filter(r=>!id||r.id===id).sort((a,b)=>a.id.localeCompare(b.id)).slice(offset,offset+limit));
  }
  return respond({message:'Unknown test endpoint'},404);
 });
 if(signedIn)await context.addInitScript(({session,key})=>{if(!sessionStorage.getItem('test-auth-seeded')){localStorage.setItem(key,JSON.stringify(session));sessionStorage.setItem('test-auth-seeded','1');}},{session:session(),key:'sb-'+PROJECT+'-auth-token'});
 return db;
}
module.exports={installSupabaseMock,database};
