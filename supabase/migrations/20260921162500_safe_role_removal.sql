begin;
create or replace function public.remove_role(target text) returns text language plpgsql security invoker set search_path='' as $$
begin
  if not private.super_admin() then raise exception 'Super Admin required'; end if;
  if target in ('super_admin','admin') then raise exception 'Core administrator roles cannot be deleted'; end if;
  if exists(select 1 from public.profiles where role=target) or exists(select 1 from public.project_members where role_key=target) then
    raise exception 'Role is assigned. Reassign users and project members before deleting it.';
  end if;
  delete from public.roles where key=target and not is_system;
  if not found then raise exception 'System roles cannot be deleted'; end if;
  return 'Role deleted.';
end $$;
revoke all on function public.remove_role(text) from public,anon;
grant execute on function public.remove_role(text) to authenticated;
notify pgrst,'reload schema';
commit;
