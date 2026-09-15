-- Run once in the Supabase SQL Editor. Public viewing; signed-in users share editing.
begin;

create table if not exists public.home_design_schemes (
 id text primary key check (id ~ '^[a-zA-Z0-9-]{1,80}$'),
 name text not null check (char_length(btrim(name)) between 1 and 60),
 template_id text not null check (template_id in ('original','alternative')),
 layout jsonb,
 revision integer not null default 0 check (revision >= 0),
 last_mutation_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 constraint home_design_layout_valid check (layout is null or (
  jsonb_typeof(layout) = 'object'
  and layout->>'format' = 'home-simulator'
  and layout->>'version' in ('1','2')
  and jsonb_typeof(layout->'entities') = 'array'
  and jsonb_array_length(layout->'entities') <= 600
  and jsonb_typeof(layout->'rooms') = 'object'
  and octet_length(layout::text) <= 5000000
  and layout->>'modelVersion' = case template_id
   when 'original' then '2026-09-14' else '2026-09-14-plan-b' end
 ) is true)
);

alter table public.home_design_schemes enable row level security;
revoke all on public.home_design_schemes from anon, authenticated;
grant select on public.home_design_schemes to anon, authenticated;
grant insert, update on public.home_design_schemes to authenticated;

drop policy if exists home_design_public_read on public.home_design_schemes;
create policy home_design_public_read on public.home_design_schemes for select to anon, authenticated using (true);
drop policy if exists home_design_signed_in_insert on public.home_design_schemes;
create policy home_design_signed_in_insert on public.home_design_schemes for insert to authenticated
 with check ((select auth.uid()) is not null and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
drop policy if exists home_design_signed_in_update on public.home_design_schemes;
create policy home_design_signed_in_update on public.home_design_schemes for update to authenticated
 using ((select auth.uid()) is not null and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean)
 with check ((select auth.uid()) is not null and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
-- Deliberately no DELETE grant or policy for either application role.

create or replace function public.stamp_home_design_scheme()
returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' then
  if new.id <> old.id or new.template_id <> old.template_id then
   raise exception 'The design id and template cannot be changed';
  end if;
  new.revision := old.revision + 1;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
 else
  new.created_by := auth.uid();
 end if;
 new.updated_at := clock_timestamp();
 new.updated_by := auth.uid();
 return new;
end;
$$;
drop trigger if exists home_design_stamp on public.home_design_schemes;
create trigger home_design_stamp before insert or update on public.home_design_schemes
 for each row execute function public.stamp_home_design_scheme();

insert into public.home_design_schemes (id,name,template_id)
 values ('original','方案一 · 原方案','original'),('alternative','方案二 · 新户型','alternative')
 on conflict (id) do nothing;

-- Atomic compare-and-save. An empty result means another editor saved first.
-- A stable mutation id makes retries safe if the original response was lost.
create or replace function public.save_home_design_scheme(
 p_id text,p_name text,p_template_id text,p_layout jsonb,p_expected_revision integer,p_mutation_id uuid
) returns setof public.home_design_schemes
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')::boolean then
  raise exception 'Sign in to edit designs' using errcode = '42501';
 end if;
 if p_layout is null or p_mutation_id is null or p_expected_revision is null or p_expected_revision < 0 then
  raise exception 'Invalid design save request' using errcode = '22023';
 end if;
 return query select d.* from public.home_design_schemes d
  where d.id=p_id and d.last_mutation_id=p_mutation_id;
 if found then return; end if;
 return query update public.home_design_schemes d
  set name=btrim(p_name),layout=p_layout,last_mutation_id=p_mutation_id
  where d.id=p_id and d.template_id=p_template_id and d.revision=p_expected_revision
  returning d.*;
 if found then return; end if;
 if p_expected_revision=0 then
  return query insert into public.home_design_schemes (id,name,template_id,layout,revision,last_mutation_id)
   values (p_id,btrim(p_name),p_template_id,p_layout,1,p_mutation_id)
   on conflict (id) do nothing returning *;
 end if;
end;
$$;
revoke all on function public.save_home_design_scheme(text,text,text,jsonb,integer,uuid) from public, anon;
grant execute on function public.save_home_design_scheme(text,text,text,jsonb,integer,uuid) to authenticated;
revoke all on function public.stamp_home_design_scheme() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
