-- Optional legacy demo project initializer; normal project creation uses Project register.
-- Run only after all migrations and controlled Super Admin bootstrap.
-- This intentionally chooses the earliest existing Super Admin, never a hard-coded email.
do $$
declare v_admin_id uuid; v_project_id uuid;
begin
 select id into v_admin_id from public.profiles where role='super_admin' and is_active order by created_at limit 1;
 if v_admin_id is null then raise exception 'Bootstrap a confirmed Super Admin first'; end if;
 select id into v_project_id from public.projects where name='Portside Residence' order by created_at limit 1;
 if v_project_id is null then insert into public.projects(name,client_name,start_date,target_date,status,created_by) values('Portside Residence','Portside Residence Client',current_date,current_date+180,'planning',v_admin_id) returning id into v_project_id; end if;
 insert into public.project_disciplines(project_id,discipline_id) select v_project_id,id from public.disciplines where is_active on conflict(project_id,discipline_id) do nothing;
end $$;
