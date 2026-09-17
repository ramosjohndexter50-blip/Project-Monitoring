begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.roles(key text primary key,name text not null,description text,is_system boolean not null default false);
create table public.permissions(key text primary key,description text not null);
create table public.role_permissions(role_key text references public.roles(key) on delete cascade,permission_key text references public.permissions(key) on delete cascade,primary key(role_key,permission_key));
insert into public.roles(key,name,is_system) values ('super_admin','Super Admin',true),('admin','Administrator',true),('project_manager','Project Manager',true),('project_architect','Project Architect',true),('discipline_lead','Discipline Lead',true),('consultant','Consultant',true),('team_member','Team Member',true),('client','Client',true),('viewer','Viewer',true);
insert into public.permissions select resource||'.'||operation,initcap(resource||' '||operation) from unnest(array['users','projects','teams','disciplines','tasks','milestones','deliverables','documents','rfis','issues','workflows','roles']) resource,unnest(array['view','create','update','delete']) operation;
insert into public.permissions values ('users.disable','Disable users'),('tasks.assign','Assign tasks'),('documents.upload','Upload documents'),('rfis.respond','Respond to RFIs'),('approvals.review','Review approvals'),('reports.view','View reports'),('settings.manage','Manage settings'),('audit.view','View audit'),('admin.access','Open administration');
insert into public.role_permissions select 'super_admin',key from public.permissions;
insert into public.role_permissions select 'admin',key from public.permissions where key not like 'roles.%' and key not in ('settings.manage','audit.view','users.delete');
insert into public.role_permissions select r,p.key from unnest(array['project_manager','project_architect','discipline_lead']) r cross join public.permissions p where split_part(p.key,'.',1) in ('tasks','milestones','deliverables','documents','rfis','issues','workflows') or p.key in ('projects.view','projects.update','teams.view','disciplines.view','approvals.review','reports.view');
insert into public.role_permissions select r,p.key from unnest(array['consultant','team_member']) r cross join public.permissions p where p.key in ('projects.view','teams.view','disciplines.view','tasks.view','tasks.create','tasks.update','milestones.view','deliverables.view','deliverables.create','deliverables.update','documents.view','documents.upload','documents.create','rfis.view','rfis.create','rfis.respond','issues.view','issues.create','issues.update','reports.view');
insert into public.role_permissions select r,p.key from unnest(array['client','viewer']) r cross join public.permissions p where p.key in ('projects.view','disciplines.view','tasks.view','milestones.view','deliverables.view','documents.view','rfis.view','issues.view','reports.view');
insert into public.role_permissions values ('client','approvals.review');
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_fkey foreign key(role) references public.roles(key);
alter table public.profiles add column is_active boolean not null default true,add column employee_code text,add column position text,add column company text,add column department text,add column phone text,add column avatar_url text,add column last_login_at timestamptz,add column updated_at timestamptz not null default now();
alter table public.disciplines add column is_active boolean not null default true,add column description text,add column updated_at timestamptz not null default now();
alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check(status in ('planning','ongoing','concept_design','schematic_design','design_development','construction_documents','tender','construction','closeout','on_hold','completed','cancelled'));
alter table public.projects add column project_code text unique,add column description text,add column project_type text,add column location text,add column actual_completion_date date,add column project_manager uuid references public.profiles(id),add column project_architect uuid references public.profiles(id),add column priority text not null default 'medium' check(priority in ('low','medium','high','critical')),add column contract_information text,add column budget numeric(18,2) check(budget>=0),add column updated_at timestamptz not null default now();
alter table public.project_disciplines add column status text not null default 'planning',add column progress integer not null default 0 check(progress between 0 and 100),add column target_date date,add column updated_at timestamptz not null default now();
create table public.project_members(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),user_id uuid not null references public.profiles(id),role_key text not null references public.roles(key),discipline_id uuid references public.disciplines(id),created_at timestamptz not null default now(),unique nulls not distinct(project_id,user_id,discipline_id),check(role_key not in ('super_admin','admin')));
create table public.project_permission_overrides(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),user_id uuid not null references public.profiles(id),permission_key text not null references public.permissions(key),allowed boolean not null default false,unique(project_id,user_id,permission_key));
insert into public.project_members(project_id,user_id,role_key,discipline_id) select project_id,assigned_lead,'discipline_lead',discipline_id from public.project_disciplines where assigned_lead is not null on conflict do nothing;
insert into public.project_members(project_id,user_id,role_key) select id,created_by,'project_manager' from public.projects on conflict do nothing;
create function private.active_user() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and is_active) $$;
create function private.super_admin() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and is_active and role='super_admin') $$;
create function private.global_permission(permission text) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.profiles p join public.role_permissions rp on rp.role_key=p.role where p.id=auth.uid() and p.is_active and p.role in ('super_admin','admin') and rp.permission_key=permission) $$;
create function private.project_permission(project uuid,discipline uuid,permission text) returns boolean language sql stable security definer set search_path='' as $$
select private.active_user() and (private.super_admin() or (not exists(select 1 from public.project_permission_overrides o where o.project_id=project and o.user_id=auth.uid() and o.permission_key=permission and not o.allowed) and (private.global_permission(permission) or exists(select 1 from public.project_members m where m.project_id=project and m.user_id=auth.uid() and (m.discipline_id is null or m.discipline_id=discipline or (discipline is null and permission like '%.view')) and (exists(select 1 from public.role_permissions rp where rp.role_key=m.role_key and rp.permission_key=permission) or exists(select 1 from public.project_permission_overrides o where o.project_id=project and o.user_id=auth.uid() and o.permission_key=permission and o.allowed)))))) $$;
create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path='' as $$ select private.super_admin() $$;
create or replace function public.can_view_project(target_project uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.project_permission(target_project,null,'projects.view') $$;
create function public.has_permission(permission text,project uuid default null,discipline uuid default null) returns boolean language sql stable security invoker set search_path='' as $$ select case when project is null then private.global_permission(permission) else private.project_permission(project,discipline,permission) end $$;
create table public.project_phases(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),name text not null,description text,sequence integer not null default 1,status text not null default 'planning',start_date date,due_date date,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.milestones(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),discipline_id uuid references public.disciplines(id),phase_id uuid references public.project_phases(id),name text not null,description text,due_date date,actual_date date,status text not null default 'planned' check(status in ('planned','in_progress','completed','on_hold')),owner uuid references public.profiles(id),progress integer not null default 0 check(progress between 0 and 100),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.deliverables(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),discipline_id uuid not null references public.disciplines(id),phase_id uuid references public.project_phases(id),milestone_id uuid references public.milestones(id),title text not null,deliverable_type text not null default 'Drawing Package',description text,owner uuid references public.profiles(id),revision text not null default '00',submission_date date,due_date date,status text not null default 'draft' check(status in ('draft','internal_review','coordination','client_review','for_approval','approved','revise_resubmit','issued')),review_status text not null default 'pending',approval_status text not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.tasks drop constraint tasks_status_check;
update public.tasks set status=case status when 'working_on_it' then 'in_progress' when 'stuck' then 'blocked' when 'done' then 'completed' else status end;
alter table public.tasks add constraint tasks_status_check check(status in ('not_started','in_progress','for_review','revision_required','approved','completed','blocked','cancelled'));
alter table public.tasks drop constraint tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check(priority in ('low','medium','high','critical'));
alter table public.tasks add column created_by uuid references public.profiles(id) default auth.uid(),add column completed_at timestamptz,add column parent_task_id uuid references public.tasks(id),add column milestone_id uuid references public.milestones(id),add column deliverable_id uuid references public.deliverables(id),add column phase_id uuid references public.project_phases(id),add constraint task_not_own_parent check(parent_task_id is distinct from id);
create table public.task_dependencies(id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id),depends_on uuid not null references public.tasks(id),created_at timestamptz not null default now(),unique(task_id,depends_on),check(task_id<>depends_on));
create table public.task_comments(id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks(id),author uuid not null default auth.uid() references public.profiles(id),body text not null check(length(trim(body)) between 1 and 10000),created_at timestamptz not null default now());
create table public.rfis(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),discipline_id uuid not null references public.disciplines(id),rfi_number text not null,subject text not null,question text not null,raised_by uuid not null default auth.uid() references public.profiles(id),owner uuid references public.profiles(id),priority text not null default 'medium' check(priority in ('low','medium','high','critical')),due_date date,response text,status text not null default 'open' check(status in ('open','under_review','responded','closed','cancelled')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(project_id,rfi_number));
create table public.issues(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),discipline_id uuid not null references public.disciplines(id),issue_number text not null,title text not null,description text,severity text not null default 'medium' check(severity in ('low','medium','high','critical')),owner uuid references public.profiles(id),due_date date,status text not null default 'open' check(status in ('open','in_progress','resolved','closed','cancelled')),resolution text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(project_id,issue_number));
create table public.issue_comments(id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.issues(id),author uuid not null default auth.uid() references public.profiles(id),body text not null check(length(trim(body)) between 1 and 10000),created_at timestamptz not null default now());
create table public.documents(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),discipline_id uuid not null references public.disciplines(id),document_number text not null,revision text not null default '00',title text not null,document_type text not null default 'Drawing',status text not null default 'draft' check(status in ('draft','review','issued','superseded','archived')),storage_path text not null unique,uploaded_by uuid not null default auth.uid() references public.profiles(id),task_id uuid references public.tasks(id),deliverable_id uuid references public.deliverables(id),rfi_id uuid references public.rfis(id),issue_id uuid references public.issues(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(project_id,document_number,revision));
create table public.approval_workflows(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),name text not null,deliverable_type text not null,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.workflow_steps(id uuid primary key default gen_random_uuid(),workflow_id uuid not null references public.approval_workflows(id),sequence integer not null check(sequence>0),reviewer uuid not null references public.profiles(id),name text not null,unique(workflow_id,sequence));
create table public.approvals(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),discipline_id uuid not null references public.disciplines(id),deliverable_id uuid not null references public.deliverables(id),workflow_id uuid not null references public.approval_workflows(id),revision text not null,submitted_by uuid not null references public.profiles(id),status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now());
create unique index approval_one_pending on public.approvals(deliverable_id) where status='pending';
create table public.approval_steps(id uuid primary key default gen_random_uuid(),approval_id uuid not null references public.approvals(id),sequence integer not null,reviewer uuid not null references public.profiles(id),name text not null,unique(approval_id,sequence));
create table public.approval_decisions(id uuid primary key default gen_random_uuid(),step_id uuid not null unique references public.approval_steps(id),reviewer uuid not null references public.profiles(id),decision text not null check(decision in ('approved','rejected')),comments text not null default '',created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),project_id uuid references public.projects(id),title text not null,entity_type text,entity_id uuid,read_at timestamptz,dedupe_key text unique,created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,action text not null,entity text not null,entity_id uuid,project_id uuid,metadata jsonb not null default '{}',created_at timestamptz not null default now());
create table public.system_settings(key text primary key,value text not null,updated_at timestamptz not null default now());
insert into public.system_settings values ('organization_name','Hamdan Studio Manila',now());
create function private.can_work(project uuid,discipline uuid,owner_id uuid,permission text) returns boolean language sql stable security definer set search_path='' as $$ select private.project_permission(project,discipline,permission) and (private.global_permission(permission) or owner_id=auth.uid() or exists(select 1 from public.project_members m where m.project_id=project and m.user_id=auth.uid() and (m.discipline_id is null or m.discipline_id=discipline) and m.role_key in ('project_manager','project_architect','discipline_lead'))) $$;
create function private.visible_profile(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.active_user() and (target=auth.uid() or private.global_permission('users.view') or exists(select 1 from public.project_members m join public.project_members other on other.project_id=m.project_id where m.user_id=auth.uid() and other.user_id=target and (m.discipline_id is null or other.discipline_id is null or m.discipline_id=other.discipline_id))) $$;
create function private.touch_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
create function private.immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'History is append-only'; end $$;
create trigger audit_immutable before update or delete on public.audit_logs for each row execute function private.immutable();
create trigger decisions_immutable before update or delete on public.approval_decisions for each row execute function private.immutable();
create trigger steps_immutable before update or delete on public.approval_steps for each row execute function private.immutable();
alter table public.task_history drop constraint task_history_task_id_fkey;
alter table public.task_history add constraint task_history_task_id_fkey foreign key(task_id) references public.tasks(id) on delete restrict;
create trigger task_history_immutable before update or delete on public.task_history for each row execute function private.immutable();
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; olddata jsonb; entity uuid; project uuid;
begin rowdata=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; olddata=case when tg_op='INSERT' then null else to_jsonb(old) end; entity=nullif(rowdata->>'id','')::uuid; project=case when tg_table_name='projects' then entity else nullif(rowdata->>'project_id','')::uuid end;
insert into public.audit_logs(actor_id,action,entity,entity_id,project_id,metadata) values(auth.uid(),lower(tg_op),tg_table_name,entity,project,jsonb_build_object('before',olddata,'after',case when tg_op='DELETE' then null else rowdata end)); return case when tg_op='DELETE' then old else new end; end $$;
create function private.profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if pg_trigger_depth()>1 and (to_jsonb(new)-array['last_login_at','updated_at'])=(to_jsonb(old)-array['last_login_at','updated_at']) then return new; end if;
 if auth.uid() is not null then
 if not private.global_permission('users.update') then raise exception 'User administration required'; end if;
 if (old.role='super_admin' or new.role='super_admin' or old.role is distinct from new.role) and not private.super_admin() then raise exception 'Only Super Admin can assign roles or edit Super Admin accounts'; end if;
 if old.is_active is distinct from new.is_active and not private.global_permission('users.disable') then raise exception 'Disable permission required'; end if;
 if old.id=auth.uid() and (new.role<>old.role or not new.is_active) then raise exception 'Cannot disable or demote your own account'; end if;
 end if; return new; end $$;
create trigger profile_guard before update on public.profiles for each row execute function private.profile_guard();
create function private.scope_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb=to_jsonb(new); previous jsonb; project uuid; discipline uuid; person uuid; target uuid; tab text; key text; valid boolean;
begin project=(j->>'project_id')::uuid; discipline=nullif(j->>'discipline_id','')::uuid;
 if tg_op='UPDATE' then previous=to_jsonb(old); if previous->>'project_id' is distinct from j->>'project_id' or previous->>'discipline_id' is distinct from j->>'discipline_id' then raise exception 'Project and discipline cannot be changed'; end if; end if;
 if discipline is not null and not exists(select 1 from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id where pd.project_id=project and pd.discipline_id=discipline and (tg_op='UPDATE' or d.is_active)) then raise exception 'Discipline must be enabled for this project'; end if;
 person=nullif(j->>'owner','')::uuid;
 if person is not null and not exists(select 1 from public.profiles p where p.id=person and p.is_active and (p.role='super_admin' or exists(select 1 from public.project_members m where m.project_id=project and m.user_id=person and (m.discipline_id is null or discipline is null or m.discipline_id=discipline)))) then raise exception 'Assignee must be an active member of this project discipline'; end if;
 foreach key in array array['phase_id','milestone_id','deliverable_id','parent_task_id','task_id','rfi_id','issue_id'] loop target=nullif(j->>key,'')::uuid;
 if target is not null then tab=case key when 'phase_id' then 'project_phases' when 'milestone_id' then 'milestones' when 'deliverable_id' then 'deliverables' when 'rfi_id' then 'rfis' when 'issue_id' then 'issues' else 'tasks' end;
 execute format('select exists(select 1 from public.%I t where t.id=$1 and t.project_id=$2)',tab) into valid using target,project;
 if not valid then raise exception 'Related records must belong to the same project'; end if;
 end if; end loop; return new; end $$;
create function private.task_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' and auth.uid() is not null then new.created_by=auth.uid(); end if;
 if tg_op='UPDATE' and new.created_by is distinct from old.created_by then raise exception 'Creator is immutable'; end if;
 if auth.uid() is not null and (tg_op='INSERT' or new.owner is distinct from old.owner) and new.owner is distinct from auth.uid() and not private.project_permission(new.project_id,new.discipline_id,'tasks.assign') then raise exception 'Task assignment permission required'; end if;
 if new.status in ('approved','completed') and (tg_op='INSERT' or new.status is distinct from old.status) then
 if auth.uid() is not null and not private.project_permission(new.project_id,new.discipline_id,'approvals.review') then raise exception 'Reviewer permission required to approve or complete'; end if;
 if exists(select 1 from public.task_dependencies dep join public.tasks t on t.id=dep.depends_on where dep.task_id=new.id and t.status not in ('completed','cancelled')) then raise exception 'Complete predecessor tasks first'; end if; end if;
 if new.status='completed' then new.percent_complete=100; new.completed_at=coalesce(new.completed_at,now()); elsif new.status='not_started' then new.percent_complete=0; new.completed_at=null; else new.percent_complete=least(new.percent_complete,99); new.completed_at=null; end if;
 if tg_op='UPDATE' and old.status='completed' and new.status<>'completed' then new.percent_complete=0; end if;
 if new.parent_task_id is not null then perform pg_advisory_xact_lock(41002); if exists(with recursive ancestors as (select id,parent_task_id from public.tasks where id=new.parent_task_id union select t.id,t.parent_task_id from public.tasks t join ancestors a on t.id=a.parent_task_id) select 1 from ancestors where id=new.id) then raise exception 'Parent task cycle'; end if; end if;
 return new; end $$;
create trigger task_guard before insert or update on public.tasks for each row execute function private.task_guard();
create function private.dependency_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(41001);
 if not exists(select 1 from public.tasks a join public.tasks b on a.project_id=b.project_id where a.id=new.task_id and b.id=new.depends_on and private.project_permission(a.project_id,a.discipline_id,'tasks.update') and private.project_permission(b.project_id,b.discipline_id,'tasks.view')) then raise exception 'Both dependency tasks must be authorized in the same project'; end if;
 if exists(select 1 from public.tasks a join public.tasks b on b.id=new.depends_on where a.id=new.task_id and a.status in ('approved','completed') and b.status not in ('completed','cancelled')) then raise exception 'Reopen the task before adding an incomplete predecessor'; end if;
 if exists(with recursive chain as (select depends_on from public.task_dependencies where task_id=new.depends_on union select d.depends_on from public.task_dependencies d join chain c on d.task_id=c.depends_on) select 1 from chain where depends_on=new.task_id) then raise exception 'Dependency cycle'; end if; return new; end $$;
create trigger dependency_guard before insert or update on public.task_dependencies for each row execute function private.dependency_guard();
create function private.deliverable_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.revision=new.revision and exists(select 1 from public.approvals where deliverable_id=new.id and revision=new.revision) and (new.title is distinct from old.title or new.description is distinct from old.description or new.deliverable_type is distinct from old.deliverable_type or new.owner is distinct from old.owner) then raise exception 'Create a new revision before changing submitted deliverable content'; end if;
 if tg_op='UPDATE' and old.revision is distinct from new.revision then if exists(select 1 from public.approvals where deliverable_id=new.id and status='pending') then raise exception 'Finish pending review before changing revision'; end if; new.approval_status='pending'; new.review_status='pending'; new.status='draft'; end if;
 if new.status in ('approved','issued') or new.approval_status='approved' then if not exists(select 1 from public.approvals a where a.deliverable_id=new.id and a.revision=new.revision and a.status='approved') then raise exception 'Approved workflow required for this revision'; end if; end if; return new; end $$;
create trigger deliverable_guard before insert or update on public.deliverables for each row execute function private.deliverable_guard();
drop policy profiles_read_own on public.profiles; drop policy profiles_admin_update on public.profiles;
drop policy disciplines_authenticated_read on public.disciplines; drop policy disciplines_admin_write on public.disciplines;
drop policy projects_view on public.projects; drop policy projects_admin_write on public.projects;
drop policy project_disciplines_view on public.project_disciplines; drop policy project_disciplines_admin_write on public.project_disciplines;
drop policy tasks_view on public.tasks; drop policy tasks_lead_insert on public.tasks; drop policy tasks_lead_update on public.tasks; drop policy tasks_lead_delete on public.tasks;
drop policy task_history_view on public.task_history;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or private.visible_profile(id));
create policy profiles_update on public.profiles for update to authenticated using(private.global_permission('users.update')) with check(private.global_permission('users.update'));
create policy disciplines_read on public.disciplines for select to authenticated using(private.active_user());
create policy disciplines_insert on public.disciplines for insert to authenticated with check(private.global_permission('disciplines.create'));
create policy disciplines_update on public.disciplines for update to authenticated using(private.global_permission('disciplines.update')) with check(private.global_permission('disciplines.update'));
create policy projects_read on public.projects for select to authenticated using(private.project_permission(id,null,'projects.view'));
create policy projects_insert on public.projects for insert to authenticated with check(private.global_permission('projects.create') and created_by=auth.uid());
create policy projects_update on public.projects for update to authenticated using(private.project_permission(id,null,'projects.update')) with check(private.project_permission(id,null,'projects.update'));
create policy project_disciplines_read on public.project_disciplines for select to authenticated using(private.project_permission(project_id,discipline_id,'projects.view'));
create policy project_disciplines_write on public.project_disciplines for all to authenticated using(private.global_permission('teams.update')) with check(private.global_permission('teams.update'));
create policy members_read on public.project_members for select to authenticated using(private.project_permission(project_id,discipline_id,'projects.view'));
create policy members_write on public.project_members for all to authenticated using(private.global_permission('teams.update')) with check(private.global_permission('teams.update'));
create policy overrides_admin on public.project_permission_overrides for all to authenticated using(private.super_admin()) with check(private.super_admin());
create policy tasks_read on public.tasks for select to authenticated using(private.project_permission(project_id,discipline_id,'tasks.view'));
create policy tasks_insert on public.tasks for insert to authenticated with check(private.can_work(project_id,discipline_id,owner,'tasks.create'));
create policy tasks_update on public.tasks for update to authenticated using(private.can_work(project_id,discipline_id,owner,'tasks.update')) with check(private.can_work(project_id,discipline_id,owner,'tasks.update'));
create policy task_history_read on public.task_history for select to authenticated using(exists(select 1 from public.tasks where id=task_id));
create policy dependency_read on public.task_dependencies for select to authenticated using(exists(select 1 from public.tasks where id=task_id));
create policy dependency_insert on public.task_dependencies for insert to authenticated with check(exists(select 1 from public.tasks t where t.id=task_id and private.can_work(t.project_id,t.discipline_id,t.owner,'tasks.update')));
create policy dependency_delete on public.task_dependencies for delete to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and private.can_work(t.project_id,t.discipline_id,t.owner,'tasks.update')));
create policy task_comments_read on public.task_comments for select to authenticated using(exists(select 1 from public.tasks where id=task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated with check(author=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and private.project_permission(t.project_id,t.discipline_id,'tasks.update')));
create policy issue_comments_read on public.issue_comments for select to authenticated using(exists(select 1 from public.issues where id=issue_id));
create policy issue_comments_insert on public.issue_comments for insert to authenticated with check(author=auth.uid() and exists(select 1 from public.issues t where t.id=issue_id and private.project_permission(t.project_id,t.discipline_id,'issues.update')));
create policy notifications_read on public.notifications for select to authenticated using(private.active_user() and user_id=auth.uid() and (project_id is null or private.project_permission(project_id,null,'projects.view')));
create policy notifications_update on public.notifications for update to authenticated using(private.active_user() and user_id=auth.uid()) with check(user_id=auth.uid());
create policy audit_read on public.audit_logs for select to authenticated using(private.global_permission('audit.view'));
create policy settings_read on public.system_settings for select to authenticated using(private.global_permission('settings.manage'));
create policy settings_write on public.system_settings for all to authenticated using(private.global_permission('settings.manage')) with check(private.global_permission('settings.manage'));
do $$ declare tab text; resource text; scoped text; writecheck text; begin
 foreach tab in array array['project_phases','milestones','deliverables','documents','rfis','issues','approval_workflows'] loop
 resource=case tab when 'project_phases' then 'projects' when 'approval_workflows' then 'workflows' else tab end;
 scoped=case when tab in ('project_phases','approval_workflows') then 'null' else 'discipline_id' end;
 execute format('create policy module_read on public.%I for select to authenticated using(private.project_permission(project_id,%s,%L))',tab,scoped,resource||'.view');
 execute format('create policy module_insert on public.%I for insert to authenticated with check(private.project_permission(project_id,%s,%L))',tab,scoped,resource||'.create');
 writecheck=case when tab in ('deliverables','issues') then format('private.can_work(project_id,%s,owner,%L)',scoped,resource||'.update') else format('private.project_permission(project_id,%s,%L)',scoped,resource||'.update') end;
 execute format('create policy module_update on public.%I for update to authenticated using(%s) with check(%s)',tab,writecheck,writecheck);
 end loop;
 foreach tab in array array['roles','permissions','role_permissions'] loop
 execute format('create policy reference_read on public.%I for select to authenticated using(private.active_user())',tab);
 if tab<>'permissions' then execute format('create policy roles_admin on public.%I for all to authenticated using(private.super_admin()) with check(private.super_admin())',tab); end if;
 end loop;
 foreach tab in array array['profiles','disciplines','projects','project_disciplines','project_members','project_permission_overrides','project_phases','tasks','task_dependencies','task_comments','milestones','deliverables','documents','rfis','issues','issue_comments','approval_workflows','workflow_steps','approvals','approval_steps','approval_decisions','roles','role_permissions','system_settings'] loop execute format('create trigger platform_audit after insert or update or delete on public.%I for each row execute function private.audit_change()',tab); end loop;
 foreach tab in array array['project_phases','milestones','deliverables','documents','rfis','issues','approval_workflows','profiles','disciplines','projects','project_disciplines'] loop execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',tab); end loop;
 foreach tab in array array['project_phases','milestones','deliverables','documents','rfis','issues','tasks','project_members','approval_workflows'] loop execute format('create trigger scope_guard before insert or update on public.%I for each row execute function private.scope_guard()',tab); end loop;
 foreach tab in array array['roles','permissions','role_permissions','project_members','project_permission_overrides','project_phases','milestones','task_dependencies','task_comments','deliverables','documents','rfis','issues','issue_comments','approval_workflows','workflow_steps','approvals','approval_steps','approval_decisions','notifications','audit_logs','system_settings'] loop execute format('alter table public.%I enable row level security',tab); execute format('grant select,insert,update,delete on public.%I to authenticated',tab); end loop;
end $$;
create policy workflow_steps_read on public.workflow_steps for select to authenticated using(exists(select 1 from public.approval_workflows w where w.id=workflow_id));
create policy workflow_steps_write on public.workflow_steps for all to authenticated using(exists(select 1 from public.approval_workflows w where w.id=workflow_id and private.project_permission(w.project_id,null,'workflows.update'))) with check(exists(select 1 from public.approval_workflows w where w.id=workflow_id and private.project_permission(w.project_id,null,'workflows.update')));
create policy approvals_read on public.approvals for select to authenticated using(private.project_permission(project_id,discipline_id,'deliverables.view'));
create policy approval_steps_read on public.approval_steps for select to authenticated using(exists(select 1 from public.approvals where id=approval_id));
create policy approval_decisions_read on public.approval_decisions for select to authenticated using(exists(select 1 from public.approval_steps where id=step_id));
create policy rfis_respond on public.rfis for update to authenticated using(owner=auth.uid() and private.project_permission(project_id,discipline_id,'rfis.respond')) with check(owner=auth.uid() and private.project_permission(project_id,discipline_id,'rfis.respond'));
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;
create function public.submit_approval(deliverable uuid,workflow uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.deliverables; w public.approval_workflows; result uuid; begin
 select * into strict d from public.deliverables where id=deliverable for update;
 if not private.can_work(d.project_id,d.discipline_id,d.owner,'deliverables.update') then raise exception 'Not authorized to submit this deliverable'; end if;
 select * into strict w from public.approval_workflows where id=workflow and project_id=d.project_id and deliverable_type=d.deliverable_type and is_active;
 if not exists(select 1 from public.workflow_steps where workflow_id=workflow) then raise exception 'Configure workflow reviewers first'; end if;
 if exists(select 1 from public.workflow_steps s join public.profiles p on p.id=s.reviewer where s.workflow_id=workflow and (not p.is_active or (p.role<>'super_admin' and (exists(select 1 from public.project_permission_overrides o where o.project_id=d.project_id and o.user_id=p.id and o.permission_key='approvals.review' and not o.allowed) or not (exists(select 1 from public.role_permissions rp where p.role='admin' and rp.role_key=p.role and rp.permission_key='approvals.review') or exists(select 1 from public.project_members m where m.project_id=d.project_id and m.user_id=s.reviewer and (m.discipline_id is null or m.discipline_id=d.discipline_id) and (exists(select 1 from public.role_permissions rp where rp.role_key=m.role_key and rp.permission_key='approvals.review') or exists(select 1 from public.project_permission_overrides o where o.project_id=d.project_id and o.user_id=p.id and o.permission_key='approvals.review' and o.allowed)))))))) then raise exception 'Every reviewer must be an active authorized project member'; end if;
 insert into public.approvals(project_id,discipline_id,deliverable_id,workflow_id,revision,submitted_by) values(d.project_id,d.discipline_id,d.id,w.id,d.revision,auth.uid()) returning id into result;
 insert into public.approval_steps(approval_id,sequence,reviewer,name) select result,sequence,reviewer,name from public.workflow_steps where workflow_id=workflow;
 update public.deliverables set status='for_approval',submission_date=current_date,approval_status='pending' where id=d.id;
 insert into public.notifications(user_id,project_id,title,entity_type,entity_id) select reviewer,d.project_id,'Approval requested: '||d.title,'approvals',result from public.approval_steps where approval_id=result order by sequence limit 1;
 return result; end $$;
create function public.decide_approval(approval uuid,decision text,comments text default '') returns void language plpgsql security definer set search_path='' as $$
declare a public.approvals; s public.approval_steps; next_reviewer uuid; begin
 if decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 select * into strict a from public.approvals where id=approval for update;
 if a.status<>'pending' then raise exception 'Approval already closed'; end if;
 select st.* into strict s from public.approval_steps st where st.approval_id=a.id and not exists(select 1 from public.approval_decisions where step_id=st.id) order by sequence limit 1;
 if s.reviewer is distinct from auth.uid() or not private.project_permission(a.project_id,a.discipline_id,'approvals.review') then raise exception 'Only the current authorized reviewer may decide'; end if;
 insert into public.approval_decisions(step_id,reviewer,decision,comments) values(s.id,auth.uid(),decision,left(comments,10000));
 if decision='rejected' then update public.approvals set status='rejected' where id=a.id; update public.deliverables set status='revise_resubmit',approval_status='rejected',review_status='revision_required' where id=a.deliverable_id;
 else
 select st.reviewer into next_reviewer from public.approval_steps st where st.approval_id=a.id and not exists(select 1 from public.approval_decisions where step_id=st.id) order by sequence limit 1;
 if next_reviewer is null then update public.approvals set status='approved' where id=a.id; update public.deliverables set status='approved',approval_status='approved',review_status='approved' where id=a.deliverable_id;
 else insert into public.notifications(user_id,project_id,title,entity_type,entity_id) values(next_reviewer,a.project_id,'Your approval review is ready','approvals',a.id); end if; end if;
 insert into public.notifications(user_id,project_id,title,entity_type,entity_id) values(a.submitted_by,a.project_id,'Review decision: '||decision,'approvals',a.id);
 end $$;
create function private.notify_change() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb=to_jsonb(new); previous jsonb; recipient uuid; begin
 previous=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end; recipient=nullif(j->>'owner','')::uuid;
 if recipient is not null and (tg_op='INSERT' or previous->>'owner' is distinct from j->>'owner' or previous->>'status' is distinct from j->>'status') then insert into public.notifications(user_id,project_id,title,entity_type,entity_id) values(recipient,(j->>'project_id')::uuid,replace(tg_table_name,'_',' ')||': '||coalesce(j->>'task_name',j->>'title',j->>'subject',j->>'name','Updated'),tg_table_name,(j->>'id')::uuid); end if;
 if tg_table_name='rfis' and tg_op='UPDATE' and previous->>'response' is distinct from j->>'response' then insert into public.notifications(user_id,project_id,title,entity_type,entity_id) values((j->>'raised_by')::uuid,(j->>'project_id')::uuid,'RFI response: '||(j->>'subject'),'rfis',(j->>'id')::uuid); end if;
 return new; end $$;
do $$ declare tab text; begin foreach tab in array array['tasks','deliverables','milestones','issues','rfis'] loop execute format('create trigger notify_change after insert or update on public.%I for each row execute function private.notify_change()',tab); end loop; end $$;
create function public.refresh_deadline_notifications() returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.active_user() then raise exception 'Unauthorized'; end if;
 insert into public.notifications(user_id,project_id,title,entity_type,entity_id,dedupe_key)
 select auth.uid(),t.project_id,case when t.due_date<current_date then 'Overdue: ' else 'Due soon: ' end||t.task_name,'tasks',t.id,auth.uid()::text||':'||t.id::text||':'||t.due_date::text||':'||case when t.due_date<current_date then 'overdue' else 'upcoming' end from public.tasks t where t.owner=auth.uid() and t.status not in ('completed','cancelled') and t.due_date<=current_date+3 and private.project_permission(t.project_id,t.discipline_id,'tasks.view') on conflict(dedupe_key) do nothing;
 end $$;
create function public.record_session_event(event text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.active_user() or event not in ('login','logout') then raise exception 'Unauthorized session event'; end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(auth.uid(),event,'auth_session',auth.uid()); end $$;
insert into storage.buckets(id,name,public,file_size_limit) values('project-documents','project-documents',false,52428800) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
create function private.storage_allowed(path text,permission text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare project uuid; discipline uuid; begin
 begin project=split_part(path,'/',1)::uuid; discipline=split_part(path,'/',2)::uuid; exception when invalid_text_representation then return false; end;
 return private.project_permission(project,discipline,permission) and exists(select 1 from public.project_disciplines where project_id=project and discipline_id=discipline); end $$;
create policy project_documents_read on storage.objects for select to authenticated using(bucket_id='project-documents' and private.storage_allowed(name,'documents.view'));
create policy project_documents_upload on storage.objects for insert to authenticated with check(bucket_id='project-documents' and private.storage_allowed(name,'documents.upload'));
create policy project_documents_delete on storage.objects for delete to authenticated using(bucket_id='project-documents' and private.storage_allowed(name,'documents.delete') and not exists(select 1 from public.documents where storage_path=name));
create function private.document_path_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if split_part(new.storage_path,'/',1)<>new.project_id::text or split_part(new.storage_path,'/',2)<>new.discipline_id::text or not exists(select 1 from storage.objects where bucket_id='project-documents' and name=new.storage_path) then raise exception 'Upload a file to this project and discipline first'; end if;
 if tg_op='UPDATE' and new.storage_path<>old.storage_path then raise exception 'Upload a new revision instead of replacing a file'; end if; return new; end $$;
create trigger document_path_guard before insert or update on public.documents for each row execute function private.document_path_guard();
do $$ declare r record; begin
 for r in select c.conrelid::regclass rel,a.attname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.connamespace='public'::regnamespace loop
 if not exists(select 1 from pg_index i where i.indrelid=r.rel and (i.indkey::smallint[])[0]=(select attnum from pg_attribute where attrelid=r.rel and attname=r.attname)) then execute format('create index on %s (%I)',r.rel,r.attname); end if; end loop; end $$;
create index tasks_owner_due on public.tasks(owner,due_date) where status not in ('completed','cancelled');
create index notifications_user_created on public.notifications(user_id,created_at desc);
create index audit_logs_created on public.audit_logs(created_at desc);
create index audit_logs_actor on public.audit_logs(actor_id,created_at desc);
create index audit_logs_project on public.audit_logs(project_id,created_at desc);
insert into public.disciplines(name) values ('Structural'),('Civil'),('Mechanical'),('Electrical'),('Plumbing'),('Fire Protection'),('ICT / Technology'),('Landscape'),('Geotechnical'),('Environmental'),('Quantity Surveying'),('Project Management'),('Other') on conflict(name) do nothing;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.active_user(),private.super_admin(),private.global_permission(text),private.project_permission(uuid,uuid,text),private.can_work(uuid,uuid,uuid,text),private.visible_profile(uuid),private.storage_allowed(text,text) to authenticated;
revoke execute on function public.is_super_admin(),public.can_view_project(uuid),public.has_permission(text,uuid,uuid),public.submit_approval(uuid,uuid),public.decide_approval(uuid,text,text),public.refresh_deadline_notifications(),public.record_session_event(text) from public,anon;
grant execute on function public.is_super_admin(),public.can_view_project(uuid),public.has_permission(text,uuid,uuid),public.submit_approval(uuid,uuid),public.decide_approval(uuid,text,text),public.refresh_deadline_notifications(),public.record_session_event(text) to authenticated;
revoke execute on function public.handle_new_user(),public.log_task_changes(),public.set_task_updated_at() from public,anon,authenticated;

create function public.task_capabilities(project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('editable_tasks',coalesce((select jsonb_agg(t.id) from public.tasks t where t.project_id=project and private.can_work(project,t.discipline_id,t.owner,'tasks.update')),'[]'::jsonb),'create_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd where pd.project_id=project and private.project_permission(project,pd.discipline_id,'tasks.create')),'[]'::jsonb))
$$;
revoke execute on function public.task_capabilities(uuid) from public,anon;
grant execute on function public.task_capabilities(uuid) to authenticated;
create function public.bootstrap_first_admin(target_email text) returns uuid language plpgsql security definer set search_path='' as $$
 declare target uuid;
 begin
 perform pg_advisory_xact_lock(41000);
 if exists(select 1 from public.profiles where role='super_admin') then raise exception 'Super Admin already exists; use the authenticated control center'; end if;
 select id into strict target from auth.users where lower(email)=lower(target_email) and email_confirmed_at is not null;
 update public.profiles set role='super_admin',is_active=true where id=target;
 insert into public.audit_logs(actor_id,action,entity,entity_id,metadata) values(target,'bootstrap_super_admin','profiles',target,jsonb_build_object('method','service_role_bootstrap'));
 return target;
 end $$;
revoke execute on function public.bootstrap_first_admin(text) from public,anon,authenticated;
grant execute on function public.bootstrap_first_admin(text) to service_role;


create function public.project_report(target_project uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 with work as (select * from public.tasks where target_project is null or project_id=target_project),
 by_discipline as (select d.name,count(*) tasks,round(avg(t.percent_complete)) progress from work t join public.disciplines d on d.id=t.discipline_id group by d.id,d.name),
 by_owner as (select coalesce(p.full_name,'Unassigned') name,count(*) open_tasks from work t left join public.profiles p on p.id=t.owner where t.status not in ('completed','cancelled') group by t.owner,p.full_name),
 statuses as (select status,count(*) count from work group by status),
 rfi_status as (select status,count(*) count from public.rfis where target_project is null or project_id=target_project group by status),
 issue_status as (select status,count(*) count from public.issues where target_project is null or project_id=target_project group by status),
 deliverable_status as (select status,count(*) count from public.deliverables where target_project is null or project_id=target_project group by status)
 select jsonb_build_object('tasks',(select count(*) from work),'progress',coalesce((select round(avg(percent_complete)) from work),0),'overdue',(select count(*) from work where due_date<current_date and status not in ('completed','cancelled')),'disciplines',coalesce((select jsonb_agg(by_discipline) from by_discipline),'[]'),'workload',coalesce((select jsonb_agg(by_owner) from by_owner),'[]'),'statuses',coalesce((select jsonb_agg(statuses) from statuses),'[]'),'rfis',coalesce((select jsonb_agg(rfi_status) from rfi_status),'[]'),'issues',coalesce((select jsonb_agg(issue_status) from issue_status),'[]'),'deliverables',coalesce((select jsonb_agg(deliverable_status) from deliverable_status),'[]'))
$$;
revoke execute on function public.project_report(uuid) from public,anon;
grant execute on function public.project_report(uuid) to authenticated;


-- Membership management is project-scoped; account roles remain a separate admin operation.
insert into public.role_permissions(role_key,permission_key) select r,p from unnest(array['project_manager','project_architect']) r,unnest(array['teams.create','teams.update','teams.delete']) p on conflict do nothing;
drop policy members_write on public.project_members;
create policy members_insert on public.project_members for insert to authenticated with check(private.project_permission(project_id,discipline_id,'teams.create'));
create policy members_update on public.project_members for update to authenticated using(private.project_permission(project_id,discipline_id,'teams.update')) with check(private.project_permission(project_id,discipline_id,'teams.update'));
create policy members_delete on public.project_members for delete to authenticated using(private.project_permission(project_id,discipline_id,'teams.delete'));
drop policy project_disciplines_write on public.project_disciplines;
create policy project_disciplines_write on public.project_disciplines for all to authenticated using(private.project_permission(project_id,discipline_id,'teams.update')) with check(private.project_permission(project_id,discipline_id,'teams.update'));
create function private.identity_guard() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_table_name='rfis' then
 if tg_op='INSERT' and auth.uid() is not null then new.raised_by=auth.uid(); end if;
 if tg_op='UPDATE' and new.raised_by is distinct from old.raised_by then raise exception 'RFI creator is immutable'; end if;
 if tg_op='UPDATE' and auth.uid() is not null and not private.project_permission(new.project_id,new.discipline_id,'rfis.update') and ((to_jsonb(new)-array['response','status','updated_at']) is distinct from (to_jsonb(old)-array['response','status','updated_at'])) then raise exception 'Responders may only update response and status'; end if;
 elsif tg_table_name='documents' then
 if tg_op='INSERT' and auth.uid() is not null then new.uploaded_by=auth.uid(); end if;
 if tg_op='UPDATE' and new.uploaded_by is distinct from old.uploaded_by then raise exception 'Uploader is immutable'; end if;
 elsif tg_table_name='projects' and tg_op='UPDATE' then
 if new.created_by is distinct from old.created_by then raise exception 'Project creator is immutable'; end if;
 end if;
 return new;
 end $$;
create trigger identity_guard before insert or update on public.rfis for each row execute function private.identity_guard();
create trigger identity_guard before insert or update on public.documents for each row execute function private.identity_guard();
create trigger identity_guard before update on public.projects for each row execute function private.identity_guard();
create function private.project_assignments() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.project_manager is not null then insert into public.project_members(project_id,user_id,role_key) values(new.id,new.project_manager,'project_manager') on conflict(project_id,user_id,discipline_id) do update set role_key='project_manager'; end if;
 if new.project_architect is not null and new.project_architect is distinct from new.project_manager then insert into public.project_members(project_id,user_id,role_key) values(new.id,new.project_architect,'project_architect') on conflict(project_id,user_id,discipline_id) do update set role_key='project_architect'; end if;
 if tg_op='UPDATE' then
 insert into public.notifications(user_id,project_id,title,entity_type,entity_id) select distinct user_id,new.id,'Project updated: '||new.name,'projects',new.id from public.project_members where project_id=new.id and user_id is distinct from auth.uid();
 end if;
 return new;
 end $$;
create trigger project_assignments after insert or update on public.projects for each row execute function private.project_assignments();
-- Block cross-project or unauthorized-discipline links and preserve submitted document revisions.
create function private.related_scope_guard() returns trigger language plpgsql security definer set search_path='' as $$
 declare j jsonb=to_jsonb(new); key text; target uuid; tab text; resource text; valid boolean;
 begin
 foreach key in array array['milestone_id','deliverable_id','parent_task_id','task_id','rfi_id','issue_id'] loop
 target=nullif(j->>key,'')::uuid;
 if target is not null then
 tab=case key when 'milestone_id' then 'milestones' when 'deliverable_id' then 'deliverables' when 'rfi_id' then 'rfis' when 'issue_id' then 'issues' else 'tasks' end;resource=tab||'.view';
 execute format('select exists(select 1 from public.%I t where t.id=$1 and t.project_id=$2 and ($3 is null or private.project_permission(t.project_id,t.discipline_id,$4)))',tab) into valid using target,new.project_id,auth.uid(),resource;
 if not valid then raise exception 'Related record is outside your authorized project scope'; end if;
 end if; end loop;
 if tg_table_name='documents' and nullif(j->>'deliverable_id','') is not null and exists(select 1 from public.approvals a join public.deliverables d on d.id=a.deliverable_id where d.id=nullif(j->>'deliverable_id','')::uuid and a.revision=d.revision) then raise exception 'Create a new deliverable revision before attaching more files'; end if;
 return new;
 end $$;
do $$ declare tab text; begin foreach tab in array array['tasks','deliverables','documents','milestones'] loop execute format('create trigger related_scope_guard before insert or update on public.%I for each row execute function private.related_scope_guard()',tab); end loop; end $$;
revoke execute on function private.identity_guard(),private.project_assignments(),private.related_scope_guard() from public,anon,authenticated;


create function private.sync_last_login() returns trigger language plpgsql security definer set search_path='' as $$
 begin update public.profiles set last_login_at=new.last_sign_in_at where id=new.id; return new; end $$;
create trigger sync_last_login after update of last_sign_in_at on auth.users for each row execute function private.sync_last_login();
create function private.discipline_lead_assignment() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.assigned_lead is not null then insert into public.project_members(project_id,user_id,role_key,discipline_id) values(new.project_id,new.assigned_lead,'discipline_lead',new.discipline_id) on conflict(project_id,user_id,discipline_id) do update set role_key='discipline_lead'; end if;
 return new;
 end $$;
create trigger discipline_lead_assignment after insert or update of assigned_lead on public.project_disciplines for each row execute function private.discipline_lead_assignment();
revoke execute on function private.sync_last_login(),private.discipline_lead_assignment() from public,anon,authenticated;


-- Public API functions are invoker wrappers; privileged implementations live outside exposed schemas.
alter function public.submit_approval(uuid,uuid) set schema private;
alter function public.decide_approval(uuid,text,text) set schema private;
alter function public.refresh_deadline_notifications() set schema private;
alter function public.record_session_event(text) set schema private;
alter function public.bootstrap_first_admin(text) set schema private;
create function public.submit_approval(deliverable uuid,workflow uuid) returns uuid language sql security invoker set search_path='' as $$ select private.submit_approval(deliverable,workflow) $$;
create function public.decide_approval(approval uuid,decision text,comments text default '') returns void language sql security invoker set search_path='' as $$ select private.decide_approval(approval,decision,comments) $$;
create function public.refresh_deadline_notifications() returns void language sql security invoker set search_path='' as $$ select private.refresh_deadline_notifications() $$;
create function public.record_session_event(event text) returns void language sql security invoker set search_path='' as $$ select private.record_session_event(event) $$;
create function public.bootstrap_first_admin(target_email text) returns uuid language sql security invoker set search_path='' as $$ select private.bootstrap_first_admin(target_email) $$;
revoke execute on function public.submit_approval(uuid,uuid),public.decide_approval(uuid,text,text),public.refresh_deadline_notifications(),public.record_session_event(text),public.bootstrap_first_admin(text) from public,anon,authenticated;
grant execute on function public.submit_approval(uuid,uuid),public.decide_approval(uuid,text,text),public.refresh_deadline_notifications(),public.record_session_event(text) to authenticated;
grant usage on schema private to service_role;
grant execute on function public.bootstrap_first_admin(text) to service_role;
alter function public.handle_new_user() set schema private;
alter function public.log_task_changes() set schema private;
alter function public.set_task_updated_at() set schema private;
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.profiles(id,email,full_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',new.email)) on conflict(id) do update set email=excluded.email; return new; end $$;
alter function private.log_task_changes() set search_path='';
alter function private.set_task_updated_at() set search_path='';
alter function public.is_super_admin() security invoker;
alter function public.can_view_project(uuid) security invoker;
grant select,insert,update,delete on public.profiles,public.disciplines,public.projects,public.project_disciplines,public.tasks,public.task_history to authenticated;


alter table public.notifications add column discipline_id uuid references public.disciplines(id);
create index notifications_discipline_idx on public.notifications(discipline_id);
drop policy notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(private.active_user() and user_id=auth.uid() and (project_id is null or private.project_permission(project_id,discipline_id,case when entity_type in ('tasks','deliverables','milestones','rfis','issues') then entity_type||'.view' when entity_type='approvals' then 'deliverables.view' else 'projects.view' end)));
create function private.notification_scope() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.entity_type in ('tasks','deliverables','milestones','rfis','issues','approvals') and new.entity_id is not null then execute format('select discipline_id from public.%I where id=$1',new.entity_type) into new.discipline_id using new.entity_id; end if;
 return new;
 end $$;
create trigger notification_scope before insert on public.notifications for each row execute function private.notification_scope();
revoke execute on function private.notification_scope() from public,anon,authenticated;
create or replace function private.refresh_deadline_notifications() returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.active_user() then raise exception 'Unauthorized'; end if;
 insert into public.notifications(user_id,project_id,title,entity_type,entity_id,dedupe_key)
 select auth.uid(),w.project_id,case when w.due_date<current_date then 'Overdue: ' else 'Due soon: ' end||w.title,w.kind,w.id,auth.uid()::text||':'||w.kind||':'||w.id::text||':'||w.due_date::text||':'||case when w.due_date<current_date then 'overdue' else 'upcoming' end
 from (
 select id,project_id,discipline_id,owner,due_date,task_name title,'tasks' kind from public.tasks where status not in ('completed','cancelled')
 union all select id,project_id,discipline_id,owner,due_date,name,'milestones' from public.milestones where status<>'completed'
 union all select id,project_id,discipline_id,owner,due_date,title,'deliverables' from public.deliverables where status not in ('approved','issued')
 union all select id,project_id,discipline_id,owner,due_date,subject,'rfis' from public.rfis where status not in ('responded','closed','cancelled')
 union all select id,project_id,discipline_id,owner,due_date,title,'issues' from public.issues where status not in ('resolved','closed','cancelled')
 ) w where w.owner=auth.uid() and w.due_date<=current_date+3 and private.project_permission(w.project_id,w.discipline_id,w.kind||'.view') on conflict(dedupe_key) do nothing;
 end $$;


create function public.organization_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 with project_status as (select status,count(*) count from public.projects group by status),
 discipline_projects as (select d.name,count(distinct pd.project_id) count from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id group by d.name)
 select jsonb_build_object('total_users',(select count(*) from public.profiles),'active_projects',(select count(*) from public.projects where status not in ('completed','cancelled')),'project_status',coalesce((select jsonb_agg(project_status) from project_status),'[]'),'discipline_projects',coalesce((select jsonb_agg(discipline_projects) from discipline_projects),'[]'))
$$;
revoke execute on function public.organization_summary() from public,anon;
grant execute on function public.organization_summary() to authenticated;

commit;
