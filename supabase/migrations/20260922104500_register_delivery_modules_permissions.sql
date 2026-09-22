begin;

insert into public.permissions(key, description)
values
  ('deliverables.view', 'View deliverables'),
  ('deliverables.create', 'Create deliverables'),
  ('deliverables.update', 'Update deliverables'),
  ('milestones.view', 'View milestones'),
  ('milestones.create', 'Create milestones'),
  ('milestones.update', 'Update milestones'),
  ('issues.view', 'View issues'),
  ('issues.create', 'Create issues'),
  ('issues.update', 'Update issues'),
  ('rfis.view', 'View RFIs'),
  ('rfis.create', 'Create RFIs'),
  ('rfis.update', 'Update RFIs')
on conflict (key) do update set description=excluded.description;

-- Keep the standard CRUD grants exact: delivery leads can write, contributors
-- and external/read-only roles can view. team_member follows employee.
delete from public.role_permissions
where permission_key in (
  'deliverables.create','deliverables.update',
  'milestones.create','milestones.update',
  'issues.create','issues.update',
  'rfis.create','rfis.update'
)
and role_key not in (
  'super_admin','admin','project_manager','project_architect','discipline_lead'
);

insert into public.role_permissions(role_key, permission_key)
select role_key, permission_key
from (
  values
    ('super_admin'),('admin'),('project_manager'),('project_architect'),('discipline_lead')
) as roles(role_key)
cross join (
  values
    ('deliverables.view'),('deliverables.create'),('deliverables.update'),
    ('milestones.view'),('milestones.create'),('milestones.update'),
    ('issues.view'),('issues.create'),('issues.update'),
    ('rfis.view'),('rfis.create'),('rfis.update')
) as permissions(permission_key)
on conflict do nothing;

insert into public.role_permissions(role_key, permission_key)
select role_key, permission_key
from (
  values
    ('employee'),('team_member'),('consultant'),('client'),('viewer')
) as roles(role_key)
cross join (
  values
    ('deliverables.view'),
    ('milestones.view'),
    ('issues.view'),
    ('rfis.view')
) as permissions(permission_key)
on conflict do nothing;

-- Super Admin is normally read-only for project delivery. These explicit
-- standard CRUD grants are intentionally enabled for the four registered
-- modules requested here, without changing any RLS policy.
create or replace function private.global_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
select not private.password_required() and (
  select exists(
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.is_active
      and (
        (
          p.role='super_admin'
          and (
            permission like '%.view'
            or split_part(permission,'.',1) in ('users','roles','disciplines')
            or permission in ('admin.access','settings.manage')
            or (
              split_part(permission,'.',1) in ('deliverables','milestones','issues','rfis')
              and exists(
                select 1
                from public.role_permissions rp
                where rp.role_key=p.role and rp.permission_key=permission
              )
            )
          )
        )
        or (
          p.role='admin'
          and (
            split_part(permission,'.',1) in ('projects','teams','tasks','milestones','deliverables','documents','rfis','issues','workflows')
            or permission in ('disciplines.view','approvals.review','reports.view')
          )
          and exists(
            select 1
            from public.role_permissions rp
            where rp.role_key=p.role and rp.permission_key=permission
          )
        )
      )
  )
)
$function$;

-- The generic Issues form intentionally does not expose issue_number.
-- Give new issues a stable automatic identifier so create works without
-- adding a form-only field that was not requested.
alter table public.issues
  alter column issue_number
  set default ('ISS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));

notify pgrst, 'reload schema';

commit;
