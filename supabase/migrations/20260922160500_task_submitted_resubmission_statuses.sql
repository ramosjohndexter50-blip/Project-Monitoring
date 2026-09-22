alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in (
    'not_started',
    'in_progress',
    'submitted',
    'for_review',
    'revision_required',
    'for_resubmission',
    'approved',
    'completed',
    'blocked',
    'cancelled'
  ));

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
    if (to_jsonb(new)-array['status','percent_complete','progress_note','updated_at','completed_at'])
      is distinct from
      (to_jsonb(old)-array['status','percent_complete','progress_note','updated_at','completed_at'])
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
