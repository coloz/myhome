import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workspace } from '../mcp/design-store.mjs';

// Exercise the real JSON-RPC stdio protocol; no direct call to the generation engine.
const client=new Client({name:'home-simulation-runner',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['--experimental-strip-types',resolve(workspace,'mcp/server.mjs')],cwd:workspace,env:Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined))}));
async function call(name,args={}){const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return r.structuredContent??JSON.parse(r.content[0].text);}
try{
  const saved=(await call('list_designs')).designs,ids=[],index=[],out=resolve(workspace,'public/designs');mkdirSync(out,{recursive:true});
  const evidence=[];
  for(const scenario of ['family','work','elder']){
    // Use dedicated names; never replace a user's design during a repeat run.
    let old=saved.find(d=>d.name.startsWith('模拟示例 · ')&&d.scenario===scenario);
    const title={family:'亲子成长',work:'双人办公',elder:'长辈同住'}[scenario];
    const item=old??await call('create_design',{scenario,brief:{name:'模拟示例 · '+title}});
    ids.push(item.id);
    let exported=await call('export_design',{id:item.id});
    evidence.push({scenario,phase:'initial',id:item.id,total:exported.report.total,issues:exported.report.issues});
    // As the elder household, remove the living-room media cabinet to protect budget and open space.
    if(scenario==='elder'&&exported.report.balance<0){
      const cabinet=exported.design.layout.entities.find(e=>e.catalogId==='ph-modern_wooden_cabinet'&&!e.deleted);
      if(cabinet)await call('remove_furniture',{id:item.id,expectedUpdatedAt:exported.design.updatedAt,entityId:cabinet.id});
      exported=await call('export_design',{id:item.id});
    }
    const findings=exported.report.issues.filter(i=>i.severity==='error'||i.severity==='warning');
    if(findings.length)throw Error('示例存在未处理问题：'+JSON.stringify(findings));
    const slug='demo-'+scenario,doc={...exported.design,id:slug};
    writeFileSync(resolve(out,slug+'.json'),JSON.stringify(doc,null,2)+'\n');
    writeFileSync(resolve(out,slug+'-layout.json'),JSON.stringify(exported.layout,null,2)+'\n');
    writeFileSync(resolve(out,slug+'-report.json'),JSON.stringify(exported.report,null,2)+'\n');
    index.push({id:slug,name:doc.brief.name,scenario});
    evidence.push({scenario,phase:'final',id:item.id,total:exported.report.total,balance:exported.report.balance,furnitureCount:exported.report.furnitureCount,issues:exported.report.issues});
  }
  const comparison=await call('compare_designs',{ids});
  writeFileSync(resolve(out,'index.json'),JSON.stringify(index,null,2)+'\n');
  writeFileSync(resolve(out,'simulation-evidence.json'),JSON.stringify({transport:'MCP stdio / official SDK Client',generatedAt:new Date().toISOString(),evidence,comparison},null,2)+'\n');
  console.log(JSON.stringify(evidence.filter(e=>e.phase==='final'),null,2));
}finally{await client.close();}
