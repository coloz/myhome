-- Add the raw floor-plan template to the existing shared design library.
-- Existing records, permissions, revision checks and save RPC remain unchanged.
begin;
alter table public.home_design_schemes
 drop constraint if exists home_design_schemes_template_id_check;
alter table public.home_design_schemes
 add constraint home_design_schemes_template_id_check
 check (template_id in ('original','alternative','raw-shell'));
alter table public.home_design_schemes drop constraint if exists home_design_layout_valid;
alter table public.home_design_schemes add constraint home_design_layout_valid check (layout is null or (
 jsonb_typeof(layout) = 'object'
 and layout->>'format' = 'home-simulator'
 and layout->>'version' in ('1','2')
 and jsonb_typeof(layout->'entities') = 'array'
 and jsonb_array_length(layout->'entities') <= 600
 and jsonb_typeof(layout->'rooms') = 'object'
 and octet_length(layout::text) <= 5000000
 and layout->>'modelVersion' = case template_id
  when 'original' then '2026-09-14'
  when 'alternative' then '2026-09-14-plan-b'
  when 'raw-shell' then '2026-09-15-raw-shell' end
) is true);
notify pgrst, 'reload schema';
commit;
