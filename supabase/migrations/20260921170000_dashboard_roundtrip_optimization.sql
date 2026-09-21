begin;

-- One dashboard request instead of many independent PostgREST round trips.
-- SECURITY INVOKER keeps every existing RLS rule in force.
create or replace function public.dashboard_home(include_activity boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  home as (
    select d.name
    from public.profiles p
    left join public.disciplines d on d.id = p.discipline_id
    where p.id = (select auth.uid())
    limit 1
  ),
  recent_progress as (
    select h.id,h.task_id,h.field_changed,h.old_value,h.new_value,h.changed_at
    from public.task_history h
    where not include_activity
    order by h.changed_at desc,h.id
    limit 8
  ),
  my_deliverables as (
    select d.id,d.title,d.status,d.project_id,d.due_date
    from public.deliverables d
    where d.owner=(select auth.uid()) and d.status not in ('approved','issued')
    order by d.due_date nulls last,d.id
    limit 8
  ),
  upcoming_milestones as (
    select m.id,m.name,m.due_date,m.status,m.project_id
    from public.milestones m
    where m.status <> 'completed'
    order by m.due_date nulls last,m.id
    limit 8
  ),
  my_tasks as (
    select t.id,t.task_name,t.due_date,t.status,t.project_id,t.percent_complete
    from public.tasks t
    where t.owner=(select auth.uid()) and t.status not in ('completed','cancelled')
    order by t.due_date nulls last,t.id
    limit 8
  ),
  recent_projects as (
    select p.id,p.name,p.status,p.target_date
    from public.projects p
    order by p.updated_at desc,p.id
    limit 8
  ),
  unread_notifications as (
    select n.id,n.title,n.created_at
    from public.notifications n
    where n.user_id=(select auth.uid()) and n.read_at is null
    order by n.created_at desc,n.id
    limit 6
  ),
  recent_activity as (
    select a.id,a.action,a.entity,a.created_at
    from public.audit_logs a
    where include_activity
    order by a.created_at desc,a.id
    limit 8
  )
  select jsonb_build_object(
    'home_discipline',(select name from home),
    'metrics',public.dashboard_metrics(),
    'recent_progress',coalesce((select jsonb_agg(r order by r.changed_at desc,r.id) from recent_progress r),'[]'::jsonb),
    'deliverables',coalesce((select jsonb_agg(d order by d.due_date nulls last,d.id) from my_deliverables d),'[]'::jsonb),
    'milestones',coalesce((select jsonb_agg(m order by m.due_date nulls last,m.id) from upcoming_milestones m),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(t order by t.due_date nulls last,t.id) from my_tasks t),'[]'::jsonb),
    'projects',coalesce((select jsonb_agg(p order by p.id) from recent_projects p),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(n order by n.created_at desc,n.id) from unread_notifications n),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(a order by a.created_at desc,a.id) from recent_activity a),'[]'::jsonb)
  )
$$;

revoke all on function public.dashboard_home(boolean) from public, anon;
grant execute on function public.dashboard_home(boolean) to authenticated;

create index if not exists notifications_user_unread_recent_idx
  on public.notifications(user_id,created_at desc,id) where read_at is null;
create index if not exists tasks_owner_open_due_idx
  on public.tasks(owner,due_date,id) where status not in ('completed','cancelled');
create index if not exists deliverables_owner_open_due_idx
  on public.deliverables(owner,due_date,id) where status not in ('approved','issued');
create index if not exists milestones_open_due_idx
  on public.milestones(due_date,id) where status <> 'completed';

notify pgrst,'reload schema';
commit;
