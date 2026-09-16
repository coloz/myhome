-- Soft deletion prevents an older browser's pending save from recreating a design.
begin;
alter table public.home_design_schemes add column if not exists deleted_at timestamptz;
drop policy if exists home_design_public_read on public.home_design_schemes;
create policy home_design_public_read on public.home_design_schemes for select to anon, authenticated using (deleted_at is null);
drop policy if exists home_design_signed_in_update on public.home_design_schemes;
create policy home_design_signed_in_update on public.home_design_schemes for update to authenticated
 using (deleted_at is null and (select auth.uid()) is not null and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean)
 with check (deleted_at is null and (select auth.uid()) is not null and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
drop policy if exists home_design_signed_in_insert on public.home_design_schemes;
create policy home_design_signed_in_insert on public.home_design_schemes for insert to authenticated
 with check (deleted_at is null and (select auth.uid()) is not null and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);

create or replace function public.delete_home_design_scheme(p_id text,p_template_id text,p_expected_revision integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.home_design_schemes;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')::boolean then
  raise exception 'Sign in to delete designs' using errcode='42501';
 end if;
 if p_id is null or p_id !~ '^[a-zA-Z0-9-]{1,80}$' or p_id in ('original','alternative','raw-shell')
  or p_template_id is null or p_template_id not in ('original','alternative','raw-shell')
  or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Invalid delete request or protected template' using errcode='22023';
 end if;
 -- Reserve never-uploaded IDs too, so a delayed initial save cannot recreate them.
 if p_expected_revision=0 then
  insert into public.home_design_schemes(id,name,template_id,deleted_at)
   values(p_id,'已删除方案',p_template_id,clock_timestamp()) on conflict(id) do nothing;
 end if;
 select * into target from public.home_design_schemes where id=p_id for update;
 if not found then return true; end if;
 if target.template_id<>p_template_id then return false; end if;
 if target.deleted_at is not null then return true; end if;
 if target.revision<>p_expected_revision then return false; end if;
 update public.home_design_schemes set deleted_at=clock_timestamp() where id=p_id;
 return true;
end;
$$;
revoke all on function public.delete_home_design_scheme(text,text,integer) from public,anon;
grant execute on function public.delete_home_design_scheme(text,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
