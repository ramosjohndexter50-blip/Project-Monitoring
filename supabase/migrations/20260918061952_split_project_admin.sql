begin;

update public.roles set name='Admin', description='Creates and manages projects, contributors, project teams and tasks.' where key='admin';
update public.roles set description='Manages user accounts, roles, disciplines and web settings. Monitors projects read-only.' where key='super_admin';

-- Keep role grants aligned with the non-delegable boundary enforced below.
delete from public.role_permissions where role_key='admin';
insert into public.role_permissions select 'admin',key from public.permissions
where split_part(key,'.',1) in ('projects','teams','tasks','milestones','deliverables','documents','rfis','issues','workflows')
or key in ('disciplines.view','approvals.review','reports.view');
delete from public.role_permissions where role_key='super_admin'
and split_part(permission_key,'.',1) in ('projects','teams','tasks','milestones','deliverables','documents','rfis','issues','workflows','approvals')
and permission_key not like '%.view';

create function private.project_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and is_active and role='admin')
$$;
revoke all on function private.project_admin() from public,anon;
grant execute on function private.project_admin() to authenticated;

create or replace function private.global_permission(permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and (
   (p.role='super_admin' and (permission like '%.view' or split_part(permission,'.',1) in ('users','roles','disciplines') or permission in ('admin.access','settings.manage')))
   or (p.role='admin' and (split_part(permission,'.',1) in ('projects','teams','tasks','milestones','deliverables','documents','rfis','issues','workflows') or permission in ('disciplines.view','approvals.review','reports.view'))
       and exists(select 1 from public.role_permissions rp where rp.role_key=p.role and rp.permission_key=permission))
 ))
$$;

-- Preserve the existing discipline-scoped employee rules; replace only the
-- former all-powerful Super Admin branch with the bounded global permission.
do $$ declare signature text; definition text; begin
 foreach signature in array array['private.project_permission(uuid,uuid,text)','private.can_work(uuid,uuid,uuid,text)'] loop
   definition=pg_get_functiondef(signature::regprocedure);
   if position('select private.super_admin() or' in definition)=0 then raise exception 'Unexpected authorization function: %',signature; end if;
   execute replace(definition,'select private.super_admin() or (','select private.global_permission(permission) or (not private.super_admin() and not private.project_admin() and ');
 end loop;
 foreach signature in array array['public.set_project_contributors(uuid,uuid[])','public.save_project_contributors(uuid,jsonb,uuid[],timestamptz)','public.task_capabilities(uuid)','public.task_board_page(uuid,integer,integer,text,text,uuid,boolean,date)','private.discipline_assignment_guard()'] loop
   definition=pg_get_functiondef(signature::regprocedure);
   if position('private.super_admin()' in definition)=0 then raise exception 'Unexpected project function: %',signature; end if;
   execute replace(replace(definition,'private.super_admin()','private.project_admin()'),'Super Admin','Admin');
 end loop;
 execute replace(pg_get_functiondef('private.visible_profile(uuid)'::regprocedure),'private.super_admin() or','private.super_admin() or private.project_admin() or');
end $$;

drop policy disciplines_read on public.disciplines;
create policy disciplines_read on public.disciplines for select to authenticated
using(private.super_admin() or private.project_admin() or (private.active_user() and id=(select discipline_id from public.profiles where id=(select auth.uid()))));
drop policy members_read on public.project_members;
create policy members_read on public.project_members for select to authenticated
using(private.super_admin() or private.project_admin() or (private.visible_profile(user_id) and private.project_permission(project_id,discipline_id,'projects.view')));

notify pgrst, 'reload schema';
commit;
