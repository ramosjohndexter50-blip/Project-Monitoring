begin;

insert into public.role_permissions(role_key, permission_key)
select r.key, 'tasks.create'
from public.roles r
where r.key in ('employee','team_member','discipline_lead','project_architect','project_manager')
  and exists (select 1 from public.permissions p where p.key='tasks.create')
on conflict do nothing;

create or replace function private.project_permission(project uuid, discipline uuid, permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
select not private.password_required() and (
  select private.global_permission(permission) or (
    not private.super_admin()
    and not private.project_admin()
    and permission not in ('tasks.assign','tasks.delete','admin.access','settings.manage','audit.view')
    and (split_part(permission,'.',1) not in ('users','roles','teams','disciplines','projects') or permission like '%.view')
    and exists (
      select 1
      from public.profiles p
      join public.disciplines d on d.id=p.discipline_id and d.is_active
      join public.project_disciplines pd on pd.discipline_id=p.discipline_id and pd.project_id=project and pd.is_active
      join public.project_members m on m.project_id=project and m.user_id=p.id
      where p.id=(select auth.uid())
        and p.is_active
        and (m.discipline_id is null or m.discipline_id=p.discipline_id)
        and (discipline=p.discipline_id or (discipline is null and permission like '%.view'))
        and not exists (
          select 1 from public.project_permission_overrides o
          where o.project_id=project and o.user_id=p.id and o.permission_key=permission and not o.allowed
        )
        and exists (
          select 1 from public.role_permissions rp
          where rp.role_key=p.role and rp.permission_key=permission
        )
        and (
          exists (
            select 1 from public.role_permissions rp
            where rp.role_key=m.role_key and rp.permission_key=permission
          )
          or exists (
            select 1 from public.project_permission_overrides o
            where o.project_id=project and o.user_id=p.id and o.permission_key=permission and o.allowed
          )
        )
    )
  )
)
$function$;

notify pgrst,'reload schema';
commit;
