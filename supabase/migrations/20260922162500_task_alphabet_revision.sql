alter table public.tasks
  drop constraint if exists tasks_revision_no_check;

alter table public.tasks
  alter column revision_no drop default;

alter table public.tasks
  alter column revision_no type text
  using chr(65 + least(greatest(revision_no,0),11));

alter table public.tasks
  alter column revision_no set default 'A';

alter table public.tasks
  alter column revision_no set not null;

alter table public.tasks
  add constraint tasks_revision_no_check
  check (revision_no in ('A','B','C','D','E','F','G','H','I','J','K','L'));

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
    heading='Revision updated to Rev '||new.revision_no||': ';
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
