-- Replace the email with the Super Admin account created in the app.
-- Run this after 20260915_initial_schema.sql and SETUP_ROLES.sql.
do $$
declare
  admin_id uuid;
  project_id uuid;
begin
  select id into admin_id from public.profiles where email = 'admin@example.com';
  if admin_id is null then
    raise exception 'Create the admin account first, then replace admin@example.com in this file.';
  end if;

  if not exists (select 1 from public.projects where name = 'Portside Residence') then
    insert into public.projects (name, client_name, start_date, target_date, status, created_by)
    values ('Portside Residence', 'Portside Residence Client', current_date, current_date + 180, 'ongoing', admin_id);
  end if;

  select id into project_id from public.projects where name = 'Portside Residence' order by created_at limit 1;

  insert into public.project_disciplines (project_id, discipline_id)
  select project_id, id from public.disciplines
  on conflict (project_id, discipline_id) do nothing;
end;
$$;