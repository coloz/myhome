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
 await assert.rejects(db.exec("delete from public.home_design_schemes where id='new-design'"),/permission denied/);
 await assert.rejects(db.exec("update public.home_design_schemes set template_id='alternative' where id='new-design'"),/cannot be changed/);
 await assert.rejects(db.exec("update public.home_design_schemes set layout='{}'::jsonb where id='new-design'"),/check constraint/);
 await db.exec("set request.jwt.claims='{\"is_anonymous\":true}'");
 await assert.rejects(save('original',2,a),/Sign in/);
 assert.equal((await db.query("update public.home_design_schemes set name='anonymous' returning id")).rows.length,0);
 await assert.rejects(db.exec("insert into public.home_design_schemes(id,name,template_id) values ('anon-auth','anon','original')"),/row-level security/);
 console.log('SQL passed: public read, authenticated writes, no deletion, anonymous-auth denied, revision conflicts, idempotent retry, schema validation, repeatable setup.');
} finally {await db.close();}
