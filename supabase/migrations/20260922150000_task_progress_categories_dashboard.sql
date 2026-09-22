alter table public.tasks
  add column if not exists progress_stage text;

update public.tasks
set progress_stage='model'
where progress_stage is null;

alter table public.tasks
  alter column progress_stage set not null;

alter table public.tasks
  drop constraint if exists tasks_progress_stage_check;

alter table public.tasks
  add constraint tasks_progress_stage_check
  check (progress_stage in ('model','annotation','coordination','sheet'));

create index if not exists tasks_progress_stage_scope_idx
  on public.tasks(project_id,progress_stage,status);

update public.tasks
set percent_complete=case
  when status in ('approved','completed') then 100
  else 0
end;

create or replace function private.sync_task_completion_percent()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.percent_complete :=
    case when new.status in ('approved','completed') then 100 else 0 end;
  return new;
end
$$;

drop trigger if exists zz_task_completion_percent on public.tasks;
create trigger zz_task_completion_percent
before insert or update of status,percent_complete on public.tasks
for each row execute function private.sync_task_completion_percent();

create or replace function public.task_board_page(
  target_project uuid,
  page_number integer default 1,
  page_size integer default 25,
  search_term text default ''::text,
  status_filter text default null::text,
  discipline_filter uuid default null::uuid,
  only_mine boolean default false,
  as_of date default current_date
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with scoped as materialized (
    select t.id,t.discipline_id,t.owner,t.status,t.start_date,t.due_date,t.percent_complete
    from public.tasks t
    where t.project_id=target_project
      and (not only_mine or t.owner=(select auth.uid()))
  ), matching as materialized (
    select t.id,t.start_date,t.due_date,t.status
    from scoped t
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
    select count(*) total,
      greatest(1,least(coalesce(page_number,1),ceil(count(*)::numeric/greatest(1,least(coalesce(page_size,25),100)))::integer)) page,
      greatest(1,least(coalesce(page_size,25),100)) size
    from matching
  ), page_ids as (
    select id
    from matching
    order by due_date nulls last,id
    limit (select size from bounds)
    offset (select (page-1)*size from bounds)
  ), page_rows as materialized (
    select t.id,t.task_name,t.discipline_id,t.owner,t.status,t.priority,t.progress_stage,t.start_date,t.due_date,
      t.percent_complete,t.notes,t.progress_note,t.updated_at
    from public.tasks t
    join page_ids p on p.id=t.id
  ), counts as (
    select status,count(*) n from scoped group by status
  ), matching_counts as (
    select status,count(*) n from matching group by status
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(p order by p.due_date nulls last,p.id) from page_rows p),'[]'::jsonb),
    'total',(select total from bounds),
    'page',(select page from bounds),
    'summary',(select jsonb_build_object(
      'total',count(*),
      'progress',coalesce(round(avg(percent_complete)),0),
      'done',count(*) filter(where status='completed'),
      'overdue',count(*) filter(where due_date<as_of and status not in ('completed','cancelled')),
      'attention',count(*) filter(where status='blocked' or (due_date<as_of and status not in ('completed','cancelled'))),
      'statuses',coalesce((select jsonb_object_agg(status,n) from counts),'{}'::jsonb)
    ) from scoped),
    'matching_statuses',coalesce((select jsonb_object_agg(status,n) from matching_counts),'{}'::jsonb),
    'capabilities',jsonb_build_object(
      'editable_tasks',coalesce((select jsonb_agg(t.id) from page_rows t where private.can_work(target_project,t.discipline_id,t.owner,'tasks.update')),'[]'::jsonb),
      'review_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd where pd.project_id=target_project and pd.is_active and private.project_permission(target_project,pd.discipline_id,'approvals.review')),'[]'::jsonb),
      'create_disciplines',coalesce((select jsonb_agg(pd.discipline_id) from public.project_disciplines pd join public.disciplines d on d.id=pd.discipline_id where pd.project_id=target_project and pd.is_active and d.is_active and private.project_permission(target_project,pd.discipline_id,'tasks.create')),'[]'::jsonb)
    )
  )
$function$;

create or replace function public.progress_dashboard(target_project uuid default null)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with stages(stage,label,ord) as (
    values
      ('model'::text,'Model'::text,1),
      ('annotation'::text,'Annotation'::text,2),
      ('coordination'::text,'Coordination'::text,3),
      ('sheet'::text,'Sheet'::text,4)
  ),
  scoped as materialized (
    select t.project_id,t.progress_stage,t.status
    from public.tasks t
    where target_project is null or t.project_id=target_project
  ),
  category_metrics as (
    select s.stage,s.label,s.ord,
      count(sc.project_id) filter(where sc.status<>'cancelled')::integer as total,
      count(sc.project_id) filter(where sc.status in ('approved','completed'))::integer as completed
    from stages s
    left join scoped sc on sc.progress_stage=s.stage
    group by s.stage,s.label,s.ord
  ),
  category_rows as (
    select stage,label,ord,total,completed,
      case when total=0 then 0 else round((completed::numeric*100)/total)::integer end as percent
    from category_metrics
  ),
  visible_projects as (
    select p.id,p.name,p.project_code
    from public.projects p
    where target_project is null or p.id=target_project
  ),
  project_category_metrics as (
    select p.id as project_id,p.name as project_name,p.project_code,
      s.stage,s.label,s.ord,
      count(sc.project_id) filter(where sc.status<>'cancelled')::integer as total,
      count(sc.project_id) filter(where sc.status in ('approved','completed'))::integer as completed
    from visible_projects p
    cross join stages s
    left join scoped sc on sc.project_id=p.id and sc.progress_stage=s.stage
    group by p.id,p.name,p.project_code,s.stage,s.label,s.ord
  ),
  project_category_rows as (
    select *,
      case when total=0 then 0 else round((completed::numeric*100)/total)::integer end as percent
    from project_category_metrics
  ),
  project_rows as (
    select project_id,project_name,project_code,
      coalesce(sum(total),0)::integer as task_count,
      round(avg(percent))::integer as overall_percent,
      jsonb_agg(jsonb_build_object(
        'key',stage,'label',label,'total',total,'completed',completed,'percent',percent
      ) order by ord) as categories
    from project_category_rows
    group by project_id,project_name,project_code
  )
  select jsonb_build_object(
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'key',stage,'label',label,'total',total,'completed',completed,'percent',percent
    ) order by ord) from category_rows),'[]'::jsonb),
    'overall_percent',coalesce((select round(avg(percent))::integer from category_rows),0),
    'task_count',coalesce((select sum(total)::integer from category_rows),0),
    'projects',coalesce((select jsonb_agg(jsonb_build_object(
      'project_id',project_id,'project_name',project_name,'project_code',project_code,
      'task_count',task_count,'overall_percent',overall_percent,'categories',categories
    ) order by project_name) from project_rows),'[]'::jsonb)
  )
$function$;

revoke all on function public.progress_dashboard(uuid) from public;
grant execute on function public.progress_dashboard(uuid) to authenticated;
