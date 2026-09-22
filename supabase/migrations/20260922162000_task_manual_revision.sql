alter table public.tasks
  add column if not exists revision_no integer not null default 0;

alter table public.tasks
  drop constraint if exists tasks_revision_no_check;

alter table public.tasks
  add constraint tasks_revision_no_check
  check (revision_no between 0 and 999);

create or replace function private.discipline_assignment_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1
    from public.project_disciplines pd
    join public.disciplines d on d.id=pd.discipline_id
    where pd.project_id=new.project_id
      and pd.discipline_id=new.discipline_id
      and pd.is_active
      and d.is_active
  ) then
    raise exception 'Discipline is not an active project contributor';
  end if;

  if new.owner is not null and not exists(
    select 1
    from public.profiles p
    where p.id=new.owner
      and p.is_active
      and p.discipline_id=new.discipline_id
      and exists(
        select 1
        from public.project_members m
        where m.project_id=new.project_id
          and m.user_id=p.id
          and (m.discipline_id is null or m.discipline_id=new.discipline_id)
      )
  ) then
    raise exception 'Assign an active employee in this project discipline';
  end if;

  if tg_op='UPDATE' and auth.uid() is not null and not private.project_admin() then
    if (to_jsonb(new)-array['status','percent_complete','progress_note','revision_no','updated_at','completed_at'])
      is distinct from
      (to_jsonb(old)-array['status','percent_complete','progress_note','revision_no','updated_at','completed_at'])
    then
      raise exception 'Only Admin can change task instructions or assignments';
    end if;

    if new.status is distinct from old.status
      and new.status in ('revision_required','for_resubmission','approved','completed','cancelled')
      and not private.project_permission(new.project_id,new.discipline_id,'approvals.review')
    then
      raise exception 'Reviewer permission required for this status';
    end if;
  end if;

  return new;
end
$$;

create or replace function private.log_task_changes()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  changed_field text;
  old_text text;
  new_text text;
begin
  foreach changed_field in array array[
    'task_name','status','priority','owner','start_date','due_date',
    'percent_complete','revision_no','notes','files_url'
  ] loop
    execute format('select ($1).%I::text, ($2).%I::text', changed_field, changed_field)
      into old_text, new_text using old, new;
    if old_text is distinct from new_text then
      insert into public.task_history (task_id, changed_by, field_changed, old_value, new_value)
      values (new.id, auth.uid(), changed_field, old_text, new_text);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.task_discipline_notifications()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare heading text;
begin
  if tg_op='INSERT' then
    heading='New discipline task: ';
  elsif new.owner is distinct from old.owner then
    heading='Task reassigned: ';
  elsif new.notes is distinct from old.notes or new.task_name is distinct from old.task_name then
    heading='Task instructions changed: ';
  elsif new.revision_no is distinct from old.revision_no then
    heading='Revision updated to R'||new.revision_no||': ';
  elsif new.status='revision_required' and new.status is distinct from old.status then
    heading='Revision requested: ';
  elsif new.status='for_resubmission' and new.status is distinct from old.status then
    heading='Resubmission requested: ';
  elsif new.status='submitted' and new.status is distinct from old.status then
    heading='Task submitted: ';
  elsif new.status is distinct from old.status then
    heading='Task status changed: ';
  elsif new.due_date is distinct from old.due_date then
    heading='Task deadline changed: ';
  else
    return new;
  end if;

  insert into public.notifications(user_id,project_id,title,entity_type,entity_id)
  select distinct p.id,new.project_id,heading||new.task_name,'tasks',new.id
  from public.profiles p
  join public.project_members m on m.user_id=p.id and m.project_id=new.project_id
  where p.is_active
    and p.discipline_id=new.discipline_id
    and (m.discipline_id is null or m.discipline_id=new.discipline_id)
    and (new.owner is null or p.id=new.owner);

  return new;
end
$$;

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
    select t.id,t.task_name,t.discipline_id,t.owner,t.status,t.priority,t.progress_stage,t.design_stage,t.revision_no,
      t.start_date,t.due_date,t.percent_complete,t.notes,t.progress_note,t.updated_at
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