begin;

-- The FK indexes already exist. These cover measured ORDER BY / LIMIT paths,
-- rather than adding another index to every foreign key.
create index if not exists tasks_project_due_id on public.tasks(project_id, due_date, id);
create index if not exists task_history_recent on public.task_history(changed_at desc, id);
create index if not exists projects_recent on public.projects(updated_at desc, id);

-- One HTTP call, narrow materialized task data reused by the dashboard aggregates.
-- SECURITY INVOKER is deliberate: every underlying SELECT retains caller RLS.
create or replace function public.dashboard_metrics() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with work as materialized (
    select discipline_id, percent_complete, due_date, status from public.tasks
  ), discipline_progress as (
    select d.name, count(*) tasks, round(avg(t.percent_complete)) progress
    from work t join public.disciplines d on d.id=t.discipline_id group by d.id,d.name
  )
  select jsonb_build_object(
    'counts', jsonb_build_array(
      (select count(*) from public.projects),
      (select count(*) from work where due_date<current_date and status not in ('completed','cancelled')),
      (select count(*) from public.rfis where status in ('open','under_review')),
      (select count(*) from public.issues where severity='critical' and status not in ('resolved','closed','cancelled')),
      (select count(*) from public.approvals where status='pending'),
      (select count(*) from public.profiles where is_active)
    ),
    'organization', public.organization_summary(),
    'disciplines', coalesce((select jsonb_agg(discipline_progress) from discipline_progress),'[]'::jsonb)
  )
$$;
revoke all on function public.dashboard_metrics() from public, anon;
grant execute on function public.dashboard_metrics() to authenticated;

-- Bounded task payload with complete (not page-only) counts and averages.
-- Search preserves task/discipline/person matching; joins are also RLS-scoped.
create or replace function public.task_board_page(
  target_project uuid, page_number integer default 1, page_size integer default 25,
  search_term text default '', status_filter text default null,
  discipline_filter uuid default null, only_mine boolean default false,
  as_of date default current_date
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with scoped as materialized (
    select t.id,t.discipline_id,t.owner,t.status,t.due_date,t.percent_complete
    from public.tasks t where t.project_id=target_project
      and (not only_mine or t.owner=(select auth.uid()))
  ), matching as materialized (
    select t.id,t.due_date,t.status from scoped t
    join public.tasks detail on detail.id=t.id
    left join public.disciplines d on d.id=t.discipline_id
    left join public.profiles p on p.id=t.owner
    where (status_filter is null or t.status=status_filter)
      and (discipline_filter is null or t.discipline_id=discipline_filter)
      and (coalesce(search_term,'')='' or position(lower(left(search_term,100)) in lower(
        detail.task_name || ' ' || coalesce(d.name,'Unknown discipline') || ' ' ||
        coalesce(p.full_name,case when t.owner is null then 'Unassigned' when t.owner=(select auth.uid()) then 'You' else 'Assigned team member' end)
      ))>0)
  ), bounds as (
    select count(*) total, greatest(1,least(coalesce(page_number,1),ceil(count(*)::numeric/greatest(1,least(coalesce(page_size,25),100)))::integer)) page,
      greatest(1,least(coalesce(page_size,25),100)) size from matching
  ), page_ids as (
    select id from matching order by due_date nulls last,id
    limit (select size from bounds) offset (select (page-1)*size from bounds)
  ), page_rows as materialized (
    select t.id,t.task_name,t.discipline_id,t.owner,t.status,t.priority,t.due_date,
      t.percent_complete,t.notes,t.progress_note,t.updated_at
    from public.tasks t join page_ids p on p.id=t.id
  ), counts as (select status,count(*) n from scoped group by status),
  matching_counts as (select status,count(*) n from matching group by status)
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(p order by p.due_date nulls last,p.id) from page_rows p),'[]'::jsonb),
    'total',(select total from bounds),'page',(select page from bounds),
    'summary',(select jsonb_build_object('total',count(*),'progress',coalesce(round(avg(percent_complete)),0),
      'done',count(*) filter(where status='completed'),
      'overdue',count(*) filter(where due_date<as_of and status not in ('completed','cancelled')),
      'attention',count(*) filter(where status='blocked' or (due_date<as_of and status not in ('completed','cancelled'))),
      'statuses',coalesce((select jsonb_object_agg(status,n) from counts),'{}'::jsonb)) from scoped),
    'matching_statuses',coalesce((select jsonb_object_agg(status,n) from matching_counts),'{}'::jsonb),
    'capabilities',jsonb_build_object(
      'editable_tasks',coalesce((select jsonb_agg(t.id) from page_rows t where private.can_work(target_project,t.discipline_id,t.owner,'tasks.update')),'[]'::jsonb),
      'review_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd where pd.project_id=target_project and pd.is_active and private.project_permission(target_project,pd.discipline_id,'approvals.review')),'[]'::jsonb),
      'create_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id where pd.project_id=target_project and pd.is_active and d.is_active and (select private.super_admin())),'[]'::jsonb)
    )
  )
$$;
revoke all on function public.task_board_page(uuid,integer,integer,text,text,uuid,boolean,date) from public, anon;
grant execute on function public.task_board_page(uuid,integer,integer,text,text,uuid,boolean,date) to authenticated;

notify pgrst, 'reload schema';
commit;
