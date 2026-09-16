import { readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDesign, analyzeDesign } from '../src/design-engine.ts';

export const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const designDirectory=resolve(process.env.HOME_DESIGN_DIR||resolve(workspace,'.home-designs'));
export function context(){return {project:JSON.parse(readFileSync(resolve(workspace,'public/assets/raw-shell/project.json'),'utf8')),catalog:JSON.parse(readFileSync(resolve(workspace,'public/library/catalog.v1.json'),'utf8')).items};}
function pathFor(id){if(typeof id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(id))throw Error('无效方案 ID');return resolve(designDirectory,id+'.json');}
export function readDesign(id){const {project,catalog}=context();return validateDesign(JSON.parse(readFileSync(pathFor(id),'utf8')),project,catalog);}
export function listDesigns(){
  let files;try{files=readdirSync(designDirectory);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  return files.filter(f=>/^[-a-zA-Z0-9]{1,80}\.json$/.test(f)).sort().map(f=>{const d=readDesign(f.slice(0,-5));return {id:d.id,name:d.brief.name,scenario:d.brief.scenario,updatedAt:d.updatedAt};});
}
export function reportFor(d){const {project,catalog}=context();return analyzeDesign(project,catalog,d.layout,d.brief,d.roomUses);}
export function saveDesign(value,expectedUpdatedAt){
  const {project,catalog}=context(),d=validateDesign(value,project,catalog),file=pathFor(d.id);
  // Cross-process exclusion + optimistic token: two MCP clients cannot overwrite each other.
  mkdirSync(designDirectory,{recursive:true});const lock=file+'.lock';let fd;
  try{fd=openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('方案正由另一个进程保存，请稍后重新读取。');throw e;}
  let temp;
  try{
    let old;try{old=readDesign(d.id);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(old&&old.updatedAt!==expectedUpdatedAt)throw Error('方案已更新，请先 get_design 读取最新 updatedAt 后重试。');
    if(!old&&expectedUpdatedAt!==undefined)throw Error('需要更新的方案不存在。');
    const report=reportFor(d),conflicts=report.issues.filter(i=>i.severity==='error');
    if(conflicts.length)throw Error('布置未保存：'+conflicts.map(i=>i.message).join('；'));
    d.updatedAt=new Date(Math.max(Date.now(),old?Date.parse(old.updatedAt)+1:0)).toISOString();
    temp=file+'.'+crypto.randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(d,null,2)+'\n',{flag:'wx'});renameSync(temp,file);temp=undefined;
    return {design:d,report};
  }finally{if(temp)try{unlinkSync(temp);}catch{}closeSync(fd);unlinkSync(lock);}
}
