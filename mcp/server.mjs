import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { context, listDesigns, readDesign, saveDesign, reportFor } from './design-store.mjs';
import { DESIGN_SCENARIOS, generateDesign, roomArea } from '../src/design-engine.ts';
import { DESIGN_METHOD, PROMPTS } from './prompts.mjs';

const server=new McpServer({name:'home-renovation-designer',version:'1.0.0'});
const id=z.string().regex(/^[-a-zA-Z0-9]{1,80}$/),stamp=z.string().datetime();
const briefFields={name:z.string().trim().min(1).max(60),household:z.string().trim().min(1).max(400),requirements:z.string().trim().min(1).max(3000),style:z.enum(['warm','calm','natural']),budget:z.number().min(1000).max(10000000),reservePercent:z.number().min(0).max(40),workRate:z.number().min(0).max(10000),furnitureFactor:z.number().min(.1).max(10),clearance:z.number().min(.5).max(1.5)};
const briefPatch=z.object(briefFields).partial().strict();
const result=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
function tool(name,description,inputSchema,readOnly,fn){server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}},async args=>{try{return result(await fn(args));}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});}
function summary(d){const r=reportFor(d);return {id:d.id,name:d.brief.name,updatedAt:d.updatedAt,furnitureCount:r.furnitureCount,total:r.total,balance:r.balance,issues:r.issues};}
tool('get_project','读取清水房模型版本、房间多边形、墙体、门窗、米制坐标与模型面积。',{},true,()=>{const {project}=context();return {templateId:'raw-shell',units:{position:'metres; [x,y,z]',dimensions:'[width,depth,height]',rotation:'radians in layout, degrees in tool arguments'},project,areas:project.rooms.map(r=>({id:r.id,name:r.name,area:roomArea(r.polygon)}))};});
tool('search_catalog','搜索可用真实模型。dimensions = 宽、深、高（米）；不含市场单价。',{query:z.string().max(100).optional(),type:z.string().max(40).optional(),limit:z.number().int().min(1).max(100).default(30)},true,({query='',type,limit})=>{const items=context().catalog.filter(c=>(!type||c.type===type)&&JSON.stringify([c.id,c.name,c.category,c.typeTags,c.styleTags]).toLowerCase().includes(query.toLowerCase()));return {total:items.length,items:items.slice(0,limit)};});
tool('list_designs','列出本地 MCP 设计文件。',{},true,()=>({designs:listDesigns()}));
tool('get_design','读取完整设计、布局与 updatedAt 并发令牌。',{id},true,({id})=>({design:readDesign(id)}));
tool('create_design','在清水房模板中创建独立场景；可覆盖任务书、风格及估价参数。自由文字不会自动改变场景布局。',{scenario:z.enum(['family','work','elder']),brief:briefPatch.optional()},false,({scenario,brief={}})=>{const {project,catalog}=context(),b={...DESIGN_SCENARIOS.find(b=>b.scenario===scenario),...brief};const {design}=saveDesign(generateDesign(project,catalog,b,randomUUID()));return summary(design);});
tool('update_brief','更新任务书和估价参数；不改变已有家具与饰面。先读取最新 updatedAt。',{id,expectedUpdatedAt:stamp,patch:briefPatch},false,({id,expectedUpdatedAt,patch})=>{const d=readDesign(id);d.brief={...d.brief,...patch};return summary(saveDesign(d,expectedUpdatedAt).design);});
const placement={room:z.string().min(1).max(80),x:z.number().min(-99).max(99),z:z.number().min(-99).max(99),y:z.number().min(0).max(9).default(0),rotationDegrees:z.number().min(-360).max(360).default(0)};
tool('add_furniture','按真实目录 ID 放置家具；越界、穿墙或重叠会拒绝保存。',{id,expectedUpdatedAt:stamp,catalogId:z.string().max(100),...placement},false,({id,expectedUpdatedAt,catalogId,room,x,y,z,rotationDegrees})=>{const d=readDesign(id),entityId='design-'+randomUUID();d.layout.entities.push({id:entityId,catalogId,room,position:[x,y,z],rotation:rotationDegrees*Math.PI/180,scale:1,deleted:false});return {...summary(saveDesign(d,expectedUpdatedAt).design),entityId};});
tool('update_furniture','移动、旋转家具或改变所属房间；一组改动原子校验后保存。',{id,expectedUpdatedAt:stamp,entityId:id,...placement},false,({id,expectedUpdatedAt,entityId,room,x,y,z,rotationDegrees})=>{const d=readDesign(id),e=d.layout.entities.find(e=>e.id===entityId&&!e.deleted);if(!e)throw Error('家具不存在');Object.assign(e,{room,position:[x,y,z],rotation:rotationDegrees*Math.PI/180});return summary(saveDesign(d,expectedUpdatedAt).design);});
tool('remove_furniture','删除指定家具，保留可恢复记录；用 restore_furniture 恢复。',{id,expectedUpdatedAt:stamp,entityId:id},false,({id,expectedUpdatedAt,entityId})=>{const d=readDesign(id),e=d.layout.entities.find(e=>e.id===entityId);if(!e)throw Error('家具不存在');e.deleted=true;return summary(saveDesign(d,expectedUpdatedAt).design);});
tool('restore_furniture','恢复已删除的家具，通过几何校验后保存。',{id,expectedUpdatedAt:stamp,entityId:id},false,({id,expectedUpdatedAt,entityId})=>{const d=readDesign(id),e=d.layout.entities.find(e=>e.id===entityId);if(!e)throw Error('家具不存在');e.deleted=false;return summary(saveDesign(d,expectedUpdatedAt).design);});
tool('set_room_finish','设置房间饰面，公共光厅不可装修。',{id,expectedUpdatedAt:stamp,room:z.string().max(80),wall:z.enum(['white','cream','blue','sage']),floor:z.enum(['oak','light-oak','tile','terrazzo'])},false,({id,expectedUpdatedAt,room,wall,floor})=>{if(!context().project.rooms.some(r=>r.id===room&&!r.greeneryOnly))throw Error('房间不存在或属于公共光厅');const d=readDesign(id);d.layout.finishes[room]={wall,floor};return summary(saveDesign(d,expectedUpdatedAt).design);});
tool('analyze_design','检查几何冲突、门口预留、面积与模拟预算，列出未覆盖的设计验证。',{id},true,({id})=>({report:reportFor(readDesign(id))}));
tool('compare_designs','比较 2 至 6 套方案；每套均返回实际估价参数，避免混淆不同口径。',{ids:z.array(id).min(2).max(6)},true,({ids})=>({designs:ids.map(id=>{const d=readDesign(id);return {brief:d.brief,roomUses:d.roomUses,...summary(d)};})}));
tool('export_design','返回设计任务书、网页兼容布局及分析报告；不写入任意路径。网页读取 MCP 方案时会创建独立副本。',{id},true,({id})=>{const d=readDesign(id);return {design:d,layout:{...d.layout,design:{brief:d.brief,roomUses:d.roomUses}},report:reportFor(d)};});
for(const [name,uri,description,read] of [
  ['project','home://project','清水房模型与尺寸',()=>JSON.stringify(context().project)],
  ['design-method','home://design-method','设计流程、工具使用与检查边界',()=>DESIGN_METHOD],
  ['scenarios','home://scenarios','三种用户需求和模拟费用参数',()=>JSON.stringify(DESIGN_SCENARIOS)],
])server.registerResource(name,uri,{description,mimeType:name==='design-method'?'text/plain':'application/json'},async url=>({contents:[{uri:url.href,text:read()}]}));
for(const [name,p] of Object.entries(PROMPTS))server.registerPrompt(name,{title:p.title,description:p.description,argsSchema:name==='home_design_brief'?{requirements:z.string().min(1).max(3000)}:name==='home_design_review'?{designId:id}:{}},args=>({messages:[{role:'user',content:{type:'text',text:p.body(args)}}]}));
await server.connect(new StdioServerTransport());
