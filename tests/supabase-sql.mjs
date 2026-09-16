import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db=new PGlite();
try {
 await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key);
  insert into auth.users values ('11111111-1111-4111-8111-111111111111');
  create function auth.uid() returns uuid language sql as
   $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql as
   $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  grant usage on schema public,auth to anon,authenticated;
 `);
 const sql=await readFile(new URL('../supabase/migrations/202609150001_home_design_schemes.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql); // Re-running setup must preserve existing rows.
 const unified=await readFile(new URL('../supabase/migrations/202609150002_unified_floor_plans.sql',import.meta.url),'utf8');
 const deletion=await readFile(new URL('../supabase/migrations/202609150003_delete_designs.sql',import.meta.url),'utf8');
 await db.exec('set role anon');
 assert.equal((await db.query('select * from public.home_design_schemes')).rows.length,2);
 await assert.rejects(db.exec("update public.home_design_schemes set name='guest'"),/permission denied/);
 await assert.rejects(db.exec("insert into public.home_design_schemes(id,name,template_id) values ('guest','guest','original')"),/permission denied/);
 const save=(id,rev,mutation,name='测试方案')=>db.query('select * from public.save_home_design_scheme($1,$2,$3,$4::jsonb,$5,$6::uuid)',
  [id,name,'original',JSON.stringify({format:'home-simulator',version:2,modelVersion:'2026-09-14',entities:[],rooms:{}}),rev,mutation]);
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await assert.rejects(save('original',0,a),/permission denied/);
 await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; set request.jwt.claims='{\"is_anonymous\":false}'");
 const first=(await save('original',0,a)).rows[0];assert.equal(first.revision,1);assert.equal(first.updated_by,'11111111-1111-4111-8111-111111111111');
 assert.equal((await save('original',0,a)).rows[0].revision,1,'Retry duplicated the write');
 assert.equal((await save('original',0,b)).rows.length,0,'Stale revision overwrote newer work');
 assert.equal((await save('original',1,b)).rows[0].revision,2);
 assert.equal((await save('new-design',0,a)).rows[0].revision,1);
 // Reproduce the deployed v1 schema rejecting a valid raw-shell layout, then
 // apply the actual repair and retry the identical queued mutation.
 const raw=JSON.parse(await readFile(new URL('../public/designs/demo-family-layout.json',import.meta.url),'utf8'));
 const rawSave=(layout,id='raw-design')=>db.query('select * from public.save_home_design_scheme($1,$2,$3,$4::jsonb,$5,$6::uuid)',
  [id,'清水房装修','raw-shell',JSON.stringify(layout),0,a]);
 await assert.rejects(rawSave(raw),e=>e.code==='23514'&&e.message.includes('home_design_layout_valid'));
 const beforeUpgrade=(await db.query('select * from public.home_design_schemes order by id')).rows;
 await db.exec('reset role');await db.exec(unified);await db.exec(unified);
 assert.deepEqual((await db.query('select * from public.home_design_schemes order by id')).rows,beforeUpgrade,'Template upgrade changed existing designs');
 await db.exec('set role authenticated');
 await assert.rejects(rawSave({...raw,modelVersion:'2026-09-14'}),/check constraint/);
 await assert.rejects(rawSave({...raw,entities:Array(601).fill(raw.entities[0])}),/check constraint/);
 const rawRow=(await rawSave(raw)).rows[0];assert.deepEqual(rawRow.layout,raw);assert.equal(rawRow.template_id,'raw-shell');
 assert.equal((await rawSave(raw)).rows[0].revision,1,'Retry after the repair duplicated a write');
 assert.deepEqual((await rawSave(raw,'raw-shell')).rows[0].layout,raw,'Built-in raw-shell did not save');
 const beforeRepeat=(await db.query('select * from public.home_design_schemes order by id')).rows;
 await db.exec('reset role');await db.exec(unified);
 assert.deepEqual((await db.query('select * from public.home_design_schemes order by id')).rows,beforeRepeat,'Repeated repair changed saved raw layouts');
 await db.exec(deletion);await db.exec(deletion);await db.exec('set role authenticated');
 await assert.rejects(db.exec("delete from public.home_design_schemes where id='new-design'"),/permission denied/);
 await assert.rejects(db.exec("update public.home_design_schemes set template_id='alternative' where id='new-design'"),/cannot be changed/);
 await assert.rejects(db.exec("update public.home_design_schemes set layout='{}'::jsonb where id='new-design'"),/check constraint/);
 const remove=(id,revision,template='original')=>db.query('select public.delete_home_design_scheme($1,$2,$3) as removed',[id,template,revision]);
 await assert.rejects(remove('original',2),/protected template/);
 assert.equal((await remove('new-design',0)).rows[0].removed,false,'Stale deletion removed another revision');
 assert.equal((await remove('new-design',1)).rows[0].removed,true);
 assert.equal((await remove('new-design',1)).rows[0].removed,true,'Delete retry is not idempotent');
 assert.equal((await db.query("select * from public.home_design_schemes where id='new-design'")).rows.length,0);
 assert.equal((await save('new-design',1,b)).rows.length,0,'Pending edit recreated a deleted design');
 assert.equal((await save('new-design',0,b)).rows.length,0,'Pending first save recreated a deleted design');
 assert.equal((await remove('never-uploaded',0)).rows[0].removed,true);
 assert.equal((await save('never-uploaded',0,a)).rows.length,0);
 assert.equal((await remove('raw-design',1,'raw-shell')).rows[0].removed,true);
 await db.exec("set request.jwt.claims='{\"is_anonymous\":true}'");
 await assert.rejects(save('original',2,a),/Sign in/);
 await assert.rejects(remove('original',2),/Sign in/);
 assert.equal((await db.query("update public.home_design_schemes set name='anonymous' returning id")).rows.length,0);
 await assert.rejects(db.exec("insert into public.home_design_schemes(id,name,template_id) values ('anon-auth','anon','original')"),/row-level security/);
 await db.exec('reset role;set role anon');await assert.rejects(remove('new-design',1),/permission denied/);
 console.log('SQL passed: v1 raw-shell failure reproduced, migration repairs the same queued save and preserves existing layouts/revisions, repeated repair is safe, invalid layouts rejected, public read, authenticated writes and confirmed-delete RPC, direct deletion blocked, anonymous denied, protected templates, revision conflicts, idempotent retry, no resurrection.');
} finally {await db.close();}
