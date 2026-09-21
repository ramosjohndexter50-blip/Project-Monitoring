begin;

create or replace function public.task_register_summary(target_project uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'in_progress', count(*) filter (where status='in_progress'),
    'completed', count(*) filter (where status in ('completed','approved')),
    'not_started', count(*) filter (where status='not_started'),
    'blocked', count(*) filter (where status='blocked')
  )
  from public.tasks
  where target_project is null or project_id=target_project
$$;

revoke all on function public.task_register_summary(uuid) from public, anon;
grant execute on function public.task_register_summary(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
