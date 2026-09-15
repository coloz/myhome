const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1536,height:1000},deviceScaleFactor:1});
 await require('./supabase-mock.cjs').installSupabaseMock(page.context());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/');
 await page.waitForFunction(()=>window.__homeViewer,{timeout:120000});
 await page.waitForTimeout(1300);
 const snap=await page.evaluate(()=>window.__homeViewer.snapshot());
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync('test-results/snapshot.json',JSON.stringify(snap,null,2));
 await page.screenshot({path:'test-results/overview.png'});
 console.log(JSON.stringify({errors,webgl2:snap.webgl2,mode:snap.mode,entities:snap.entities.length,parts:snap.parts.length,hidden:snap.hiddenWalls,triangles:snap.triangles}));
 await page.getByRole('button',{name:'户型图',exact:false}).first().click();
 await page.waitForTimeout(1200);await page.screenshot({path:'test-results/plan.png'});
 await page.getByRole('button',{name:'清水房',exact:true}).click();
 await page.waitForTimeout(500);await page.screenshot({path:'test-results/raw-plan.png'});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

