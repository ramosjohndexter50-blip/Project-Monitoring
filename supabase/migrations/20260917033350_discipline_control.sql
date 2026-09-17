begin;

insert into public.roles(key,name,is_system) values('employee','Employee',true);
insert into public.role_permissions(role_key,permission_key)
select 'employee',permission_key from public.role_permissions where role_key='team_member';
delete from public.role_permissions where role_key<>'super_admin' and
 (permission_key like 'users.%' or permission_key like 'teams.%' and permission_key<>'teams.view'
  or permission_key like 'disciplines.%' and permission_key<>'disciplines.view'
  or permission_key like 'projects.%' and permission_key<>'projects.view'
  or permission_key in ('admin.access','tasks.create','tasks.assign','tasks.delete'));

alter table public.project_disciplines add column is_active boolean not null default true;
alter table public.tasks add column progress_note text check(length(progress_note)<=10000);

create or replace function private.global_permission(permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.super_admin()
$$;

-- Membership never overrides the employee's current home discipline.
-- A role/override also cannot delegate reserved Super Admin operations.
create or replace function private.project_permission(project uuid,discipline uuid,permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.super_admin() or (
 permission not in ('tasks.create','tasks.assign','tasks.delete','admin.access','settings.manage','audit.view')
 and (split_part(permission,'.',1) not in ('users','roles','teams','disciplines','projects') or permission like '%.view')
 and exists (
 select 1 from public.profiles p
 join public.disciplines d on d.id=p.discipline_id and d.is_active
 join public.project_disciplines pd on pd.discipline_id=p.discipline_id and pd.project_id=project and pd.is_active
 join public.project_members m on m.project_id=project and m.user_id=p.id
 where p.id=auth.uid() and p.is_active
 and (m.discipline_id is null or m.discipline_id=p.discipline_id)
 and (discipline=p.discipline_id or (discipline is null and permission like '%.view'))
 and not exists(select 1 from public.project_permission_overrides o where o.project_id=project and o.user_id=p.id and o.permission_key=permission and not o.allowed)
 and exists(select 1 from public.role_permissions rp where rp.role_key=p.role and rp.permission_key=permission)
 and (exists(select 1 from public.role_permissions rp where rp.role_key=m.role_key and rp.permission_key=permission)
 or exists(select 1 from public.project_permission_overrides o where o.project_id=project and o.user_id=p.id and o.permission_key=permission and o.allowed))
 ))
$$;

create or replace function private.can_work(project uuid,discipline uuid,owner_id uuid,permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.super_admin() or (private.project_permission(project,discipline,permission)
 and (owner_id=auth.uid() or exists(select 1 from public.profiles p
 join public.project_members m on m.user_id=p.id and m.project_id=project
 where p.id=auth.uid() and p.role in ('discipline_lead','project_manager','project_architect')
 and (m.discipline_id is null or m.discipline_id=discipline)
 and m.role_key in ('discipline_lead','project_manager','project_architect'))))
$$;

create or replace function private.visible_profile(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.active_user() and (private.super_admin() or target=auth.uid() or exists(
 select 1 from public.profiles me join public.profiles other on other.discipline_id=me.discipline_id
 where me.id=auth.uid() and other.id=target))
$$;
drop policy disciplines_read on public.disciplines;
create policy disciplines_read on public.disciplines for select to authenticated
using(private.super_admin() or (private.active_user() and id=(select discipline_id from public.profiles where id=auth.uid())));
drop policy members_read on public.project_members;
create policy members_read on public.project_members for select to authenticated
using(private.super_admin() or (private.visible_profile(user_id) and private.project_permission(project_id,discipline_id,'projects.view')));

-- Trusted, short-lived invitation reservations. Public signup cannot provision
-- an account, even when Auth's public signup endpoint is enabled.
create table public.employee_provisioning(
 token uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(trim(email))),
 full_name text not null check(length(trim(full_name))>0),
 role_key text not null references public.roles(key),
 discipline_id uuid not null references public.disciplines(id),
 position text not null check(length(trim(position))>0),
 is_active boolean not null default true,
 created_by uuid not null default auth.uid() references public.profiles(id),
 expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table public.employee_provisioning enable row level security;
grant select,insert,delete on public.employee_provisioning to authenticated;
create policy provision_admin on public.employee_provisioning for all to authenticated
using(private.super_admin()) with check(private.super_admin() and created_by=auth.uid());
create index employee_provisioning_discipline on public.employee_provisioning(discipline_id);
create index employee_provisioning_role on public.employee_provisioning(role_key);
create index employee_provisioning_creator on public.employee_provisioning(created_by);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare invitation public.employee_provisioning;
begin
 delete from public.employee_provisioning where email=lower(new.email)
 and token::text=new.raw_user_meta_data->>'provisioning_token'
 and expires_at>now() returning * into invitation;
 if invitation.token is null then raise exception 'Public registration is disabled. Contact the Super Admin.'; end if;
 if not exists(select 1 from public.profiles where id=invitation.created_by and role='super_admin' and is_active)
 or not exists(select 1 from public.disciplines where id=invitation.discipline_id and is_active)
 then raise exception 'Invalid administrator invitation'; end if;
 insert into public.profiles(id,email,full_name,role,discipline_id,position,is_active)
 values(new.id,new.email,invitation.full_name,invitation.role_key,invitation.discipline_id,invitation.position,invitation.is_active);
 insert into public.audit_logs(actor_id,action,entity,entity_id,metadata)
 values(invitation.created_by,'employee_created','profiles',new.id,jsonb_build_object('after',jsonb_build_object('email',new.email,'role',invitation.role_key,'discipline_id',invitation.discipline_id,'position',invitation.position,'is_active',invitation.is_active)));
 return new;
end $$;

create function private.discipline_assignment_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id
 where pd.project_id=new.project_id and pd.discipline_id=new.discipline_id and pd.is_active and d.is_active)
 then raise exception 'Discipline is not an active project contributor'; end if;
 if new.owner is not null and not exists(select 1 from public.profiles p where p.id=new.owner and p.is_active
 and p.discipline_id=new.discipline_id and exists(select 1 from public.project_members m where m.project_id=new.project_id
 and m.user_id=p.id and (m.discipline_id is null or m.discipline_id=new.discipline_id)))
 then raise exception 'Assign an active employee in this project discipline'; end if;
 if tg_op='UPDATE' and auth.uid() is not null and not private.super_admin() then
 if (to_jsonb(new)-array['status','percent_complete','progress_note','updated_at','completed_at'])
 is distinct from (to_jsonb(old)-array['status','percent_complete','progress_note','updated_at','completed_at'])
 then raise exception 'Only Super Admin can change task instructions or assignments'; end if;
 if new.status is distinct from old.status and new.status in ('revision_required','approved','completed','cancelled')
 and not private.project_permission(new.project_id,new.discipline_id,'approvals.review')
 then raise exception 'Reviewer permission required for this status'; end if;
 end if;
 return new;
end $$;
create trigger discipline_assignment_guard before insert or update on public.tasks
for each row execute function private.discipline_assignment_guard();

create function private.progress_note_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.progress_note is distinct from old.progress_note then
 insert into public.task_history(task_id,changed_by,field_changed,old_value,new_value)
 values(new.id,auth.uid(),'progress_note',old.progress_note,new.progress_note);
 end if;
 return new;
end $$;
create trigger progress_note_history after update on public.tasks for each row execute function private.progress_note_history();

-- Keep a single contributor record and its historical work when disabled.
create function private.member_discipline_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare home uuid;
begin
 select discipline_id into home from public.profiles where id=new.user_id and is_active;
 if home is null then raise exception 'Set an active employee discipline before project assignment'; end if;
 if new.discipline_id is null then new.discipline_id=home; end if;
 if new.discipline_id<>home or not exists(select 1 from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id
 where pd.project_id=new.project_id and pd.discipline_id=home and pd.is_active and d.is_active)
 then raise exception 'Assign the employee only to their active contributing discipline'; end if;
 return new;
end $$;
create trigger member_discipline_guard before insert or update on public.project_members
for each row execute function private.member_discipline_guard();
revoke execute on function private.member_discipline_guard() from public,anon,authenticated;

create function public.set_project_contributors(target_project uuid,contributors uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not private.super_admin() then raise exception 'Super Admin required'; end if;
 perform 1 from public.projects where id=target_project for update;
 if not found then raise exception 'Project not found'; end if;
 if exists(select 1 from unnest(contributors) c where not exists(select 1 from public.disciplines d where d.id=c and d.is_active))
 then raise exception 'Choose active disciplines'; end if;
 update public.project_disciplines set is_active=false where project_id=target_project and is_active;
 insert into public.project_disciplines(project_id,discipline_id,is_active)
 select target_project,c,true from (select distinct unnest(contributors) c) chosen
 on conflict(project_id,discipline_id) do update set is_active=true;
end $$;
revoke execute on function public.set_project_contributors(uuid,uuid[]) from public,anon;
grant execute on function public.set_project_contributors(uuid,uuid[]) to authenticated;

create function private.task_discipline_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare heading text;
begin
 if tg_op='INSERT' then heading='New discipline task: ';
 elsif new.owner is distinct from old.owner then heading='Task reassigned: ';
 elsif new.notes is distinct from old.notes or new.task_name is distinct from old.task_name then heading='Task instructions changed: ';
 elsif new.status='revision_required' and new.status is distinct from old.status then heading='Revision requested: ';
 elsif new.status is distinct from old.status then heading='Task status changed: ';
 elsif new.due_date is distinct from old.due_date then heading='Task deadline changed: ';
 else return new; end if;
 insert into public.notifications(user_id,project_id,title,entity_type,entity_id)
 select distinct p.id,new.project_id,heading||new.task_name,'tasks',new.id
 from public.profiles p join public.project_members m on m.user_id=p.id and m.project_id=new.project_id
 where p.is_active and p.discipline_id=new.discipline_id and (m.discipline_id is null or m.discipline_id=new.discipline_id)
 and (new.owner is null or p.id=new.owner);
 return new;
end $$;
create trigger task_discipline_notifications after insert or update on public.tasks
for each row execute function private.task_discipline_notifications();
drop trigger notify_change on public.tasks;

create function public.project_discipline_summary(target_project uuid) returns table(discipline_id uuid,name text,task_count bigint,progress numeric)
language sql stable security invoker set search_path='' as $$
 select pd.discipline_id,d.name,count(t.id),coalesce(round(avg(t.percent_complete) filter(where t.status<>'cancelled')),0)
 from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id
 left join public.tasks t on t.project_id=pd.project_id and t.discipline_id=pd.discipline_id
 where pd.project_id=target_project and pd.is_active and d.is_active
 group by pd.discipline_id,d.name order by d.name
$$;
revoke execute on function public.project_discipline_summary(uuid) from public,anon;
grant execute on function public.project_discipline_summary(uuid) to authenticated;
revoke execute on function private.discipline_assignment_guard(),private.progress_note_history(),private.task_discipline_notifications() from public,anon,authenticated;

create function public.save_project_contributors(target_project uuid,fields jsonb,contributors uuid[],expected_updated timestamptz default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare field text; columns_sql text=''; values_sql text=''; assignments text=''; saved uuid;
begin
 if not private.super_admin() then raise exception 'Super Admin required'; end if;
 foreach field in array array['project_manager','project_architect'] loop
 if nullif(fields->>field,'') is not null and not exists(select 1 from public.profiles p where p.id=(fields->>field)::uuid and p.is_active and p.discipline_id=any(contributors))
 then raise exception 'Project manager/architect must belong to a selected contributing discipline'; end if;
 end loop;
 for field in select jsonb_object_keys(fields) loop
 if field<>all(array['name','project_code','client_name','description','project_type','location','status','priority','start_date','target_date','actual_completion_date','project_manager','project_architect','contract_information','budget','created_by']) then raise exception 'Invalid project field'; end if;
 if field='created_by' then continue; end if;
 columns_sql=columns_sql||case when columns_sql='' then '' else ',' end||format('%I',field);
 values_sql=values_sql||case when values_sql='' then '' else ',' end||format('r.%I',field);
 assignments=assignments||case when assignments='' then '' else ',' end||format('%I=r.%I',field,field);
 end loop;
 if columns_sql='' then raise exception 'Project fields required'; end if;
 if target_project is null then
 execute format('insert into public.projects(%s,created_by) select %s,auth.uid() from jsonb_populate_record(null::public.projects,$1) r returning id',columns_sql,values_sql) into saved using fields;
 else
 execute format('update public.projects p set %s from jsonb_populate_record(null::public.projects,$1) r where p.id=$2 and ($3 is null or p.updated_at=$3) returning p.id',assignments)
 into saved using fields,target_project,expected_updated;
 if saved is null then raise exception 'Project changed; reload and try again'; end if;
 end if;
 perform public.set_project_contributors(saved,contributors);
 -- Re-evaluate designated staff after contributor rows have been created.
 update public.projects set project_manager=project_manager where id=saved;
 return saved;
end $$;
revoke execute on function public.save_project_contributors(uuid,jsonb,uuid[],timestamptz) from public,anon;
grant execute on function public.save_project_contributors(uuid,jsonb,uuid[],timestamptz) to authenticated;

-- 100% progress is allowed for submission; completion still requires review.
create or replace function public.task_capabilities(project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'editable_tasks',coalesce((select jsonb_agg(t.id) from public.tasks t where t.project_id=project and private.can_work(project,t.discipline_id,t.owner,'tasks.update')),'[]'::jsonb),
 'review_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd where pd.project_id=project and pd.is_active and private.project_permission(project,pd.discipline_id,'approvals.review')),'[]'::jsonb),
 'create_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id where pd.project_id=project and pd.is_active and d.is_active and private.super_admin()),'[]'::jsonb))
$$;
do $$ begin
 execute replace(replace(pg_get_functiondef('private.project_assignments()'::regprocedure),
 'if new.project_manager is not null then',
 'if new.project_manager is not null and exists(select 1 from public.project_disciplines pd join public.profiles p on p.discipline_id=pd.discipline_id where pd.project_id=new.id and pd.is_active and p.id=new.project_manager) then'),
 'if new.project_architect is not null and',
 'if new.project_architect is not null and exists(select 1 from public.project_disciplines pd join public.profiles p on p.discipline_id=pd.discipline_id where pd.project_id=new.id and pd.is_active and p.id=new.project_architect) and');
 execute replace(pg_get_functiondef('private.task_guard()'::regprocedure),
 'new.percent_complete=least(new.percent_complete,99);','new.percent_complete=least(new.percent_complete,100);');
 execute replace(pg_get_functiondef('private.refresh_deadline_notifications()'::regprocedure),
 'w.owner=auth.uid()', '(w.owner=auth.uid() or (w.kind=''tasks'' and w.owner is null))');
end $$;
commit;
