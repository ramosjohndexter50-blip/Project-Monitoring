update public.tasks t
set owner=coalesce(t.owner,t.created_by,p.created_by)
from public.projects p
where p.id=t.project_id
  and t.owner is null;

update public.tasks
set start_date=coalesce(start_date,due_date,created_at::date)
where start_date is null;

update public.tasks
set due_date=coalesce(due_date,start_date,created_at::date)
where due_date is null;

update public.tasks
set notes=coalesce(notes,''),
    progress_note=coalesce(progress_note,'');

do $$
begin
  if exists(select 1 from public.tasks where owner is null) then
    raise exception 'Cannot enforce task owner: existing task without owner';
  end if;
end $$;

alter table public.tasks alter column owner set not null;
alter table public.tasks alter column start_date set not null;
alter table public.tasks alter column due_date set not null;
alter table public.tasks alter column notes set default '';
alter table public.tasks alter column notes set not null;
alter table public.tasks alter column progress_note set default '';
alter table public.tasks alter column progress_note set not null;

alter table public.tasks drop constraint if exists tasks_date_order_check;
alter table public.tasks add constraint tasks_date_order_check check (due_date >= start_date);

alter table public.tasks drop constraint if exists tasks_task_name_nonblank;
alter table public.tasks add constraint tasks_task_name_nonblank check (btrim(task_name) <> '');
