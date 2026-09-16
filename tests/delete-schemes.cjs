const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {installSupabaseMock}=require('./supabase-mock.cjs');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/',cache='home-simulator:supabase:nbdodqezyijrztikvkcd:v1:';
const ready=async(p,id)=>{try{await p.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId===id&&!document.querySelector('.loading'),id,{timeout:30000});}catch(e){console.error('Expected',id,'URL',p.url(),await p.locator('body').innerText());await p.screenshot({path:'test-results/delete-error.png'});throw e;}};
const snapshot=p=>p.evaluate(()=>window.__homeViewer.snapshot());
const create=async(p,name)=>{const before=(await snapshot(p)).schemeId;await p.getByRole('button',{name:'新建方案',exact:true}).click();assert.equal(await p.getByLabel('起始布置').inputValue(),'raw-shell');await p.getByLabel('方案名称',{exact:true}).fill(name);await p.getByRole('button',{name:'创建方案',exact:true}).click();await p.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId!==id&&!document.querySelector('.loading')&&!document.querySelector('.scheme-dialog[open]'),before);return (await snapshot(p)).schemeId;};
const wait=async fn=>{const end=Date.now()+20000;while(!fn()){if(Date.now()>end)throw new Error('Timed out waiting for mock');await new Promise(r=>setTimeout(r,50));}};
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const errors=[],checks=[];
 try{
  const c=await b.newContext({viewport:{width:1536,height:1000}}),db=await installSupabaseMock(c,{signedIn:false});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'?scheme=raw-shell');await ready(p,'raw-shell');assert(await p.getByRole('button',{name:'删除方案',exact:true}).isDisabled());
  const id=await create(p,'待删除的本机装修');await p.getByRole('button',{name:'添加云白布艺沙发',exact:true}).click();const original=await snapshot(p);
  await p.getByRole('button',{name:'删除方案',exact:true}).click();const dialog=p.getByRole('dialog',{name:'删除方案？',exact:true});await dialog.waitFor();assert.match(await dialog.innerText(),/待删除的本机装修/);
  assert(await dialog.getByRole('button',{name:'取消',exact:true}).evaluate(e=>e===document.activeElement));await p.screenshot({path:'test-results/delete-scheme-confirm.png'});
  await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual((await snapshot(p)).entities,original.entities);assert(await p.locator('.scheme-file[data-scheme-id="'+id+'"]').count());
  await p.getByRole('button',{name:'删除方案',exact:true}).click();await p.keyboard.press('Escape');assert.equal(await p.locator('dialog[open]').count(),0);
  const oldCache=await p.evaluate(k=>localStorage.getItem(k),cache+id);
  await p.getByRole('button',{name:'删除方案',exact:true}).click();await dialog.getByRole('button',{name:'确认删除',exact:true}).click();await ready(p,'raw-shell');
  assert.equal(await p.locator('.scheme-file[data-scheme-id="'+id+'"]').count(),0);assert.equal(await p.evaluate(k=>localStorage.getItem(k),cache+id),null);
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),'home-simulator:design:'+id),null);await p.reload();await ready(p,'raw-shell');
  await p.evaluate(({key,value,id})=>{localStorage.setItem(key,value);localStorage.removeItem('home-simulator:unified-raw-migration:v1');localStorage.setItem('home-simulator:raw-workspace:v1',JSON.stringify([{id,name:'旧档复现',layout:JSON.parse(value).row.layout}]));},{key:cache+id,value:oldCache,id});
  await p.reload();await ready(p,'raw-shell');assert.equal(await p.locator('.scheme-file[data-scheme-id="'+id+'"]').count(),0);assert.equal(db.writes.length+db.deletions.length,0);
  checks.push('Local deletion requires confirmation; Cancel and Escape preserve data; active selection falls back safely; reload and old archives cannot resurrect deleted designs');
  const mobile=await create(p,'手机删除验证');await p.setViewportSize({width:390,height:844});await require('./scheme-ui.cjs').openSchemes(p);await p.getByRole('button',{name:'删除方案',exact:true}).click();await dialog.waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'test-results/delete-scheme-mobile.png'});await dialog.getByRole('button',{name:'确认删除',exact:true}).click();await ready(p,'raw-shell');assert.equal(await p.locator('.scheme-file[data-scheme-id="'+mobile+'"]').count(),0);
  checks.push('Mobile confirmation fits the screen and supports deletion');
  const sharedContext=await b.newContext({viewport:{width:1536,height:1000}}),cloud=await installSupabaseMock(sharedContext,{signedIn:true}),s=await sharedContext.newPage();s.on('pageerror',e=>errors.push(e.message));
  await s.goto(BASE+'?scheme=original');await ready(s,'original');assert(await s.getByRole('button',{name:'删除方案',exact:true}).isDisabled());const shared=await create(s,'共享方案删除验证');await wait(()=>cloud.rows.has(shared));
  cloud.delay=500;await s.getByRole('button',{name:'添加云白布艺沙发',exact:true}).click();await s.waitForFunction(()=>{const s=window.__homeViewer.snapshot();return s.sync.find(x=>x.id===s.schemeId)?.state==='saving';});
  await s.getByRole('button',{name:'删除方案',exact:true}).click();await s.getByRole('button',{name:'确认删除',exact:true}).click();await ready(s,'raw-shell');cloud.delay=0;assert(!cloud.rows.has(shared));assert(cloud.deleted.has(shared));console.log('Concurrent save/delete completed',cloud.deletions);await s.reload();await ready(s,'raw-shell');assert.equal(await s.locator('.scheme-file[data-scheme-id="'+shared+'"]').count(),0);
  checks.push('Shared deletion waits for an in-flight save and removes the acknowledged revision; later refresh cannot restore it');
  await require('./scheme-ui.cjs').selectScheme(s,'original');const failure=await create(s,'失败时保留的方案');await wait(()=>cloud.rows.has(failure));cloud.deleteUnavailable=true;
  await s.getByRole('button',{name:'删除方案',exact:true}).click();await s.getByRole('button',{name:'确认删除',exact:true}).click();await s.getByRole('alert').filter({hasText:'云端尚未启用'}).waitFor();assert(cloud.rows.has(failure));assert.equal((await snapshot(s)).schemeId,failure);
  cloud.deleteUnavailable=false;cloud.rows.get(failure).revision+=1;await s.getByRole('button',{name:'确认删除',exact:true}).click();await s.getByRole('alert').filter({hasText:'其他人修改'}).waitFor();assert(cloud.rows.has(failure));await s.getByRole('dialog',{name:'删除方案？'}).getByRole('button',{name:'取消',exact:true}).click();
  await s.getByRole('button',{name:'刷新方案',exact:true}).click();await ready(s,failure);await s.getByRole('button',{name:'删除方案',exact:true}).click();await s.getByRole('button',{name:'确认删除',exact:true}).click();await ready(s,'raw-shell');assert(!cloud.rows.has(failure));
  checks.push('Missing database migration and revision conflicts never pretend deletion succeeded; refresh and confirmed retry work');
  assert.deepEqual(errors,[]);fs.writeFileSync('test-results/delete-schemes-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));console.log(checks.join('\n'));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
