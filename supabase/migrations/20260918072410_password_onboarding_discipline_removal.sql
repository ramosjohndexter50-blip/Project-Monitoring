begin;
create function private.password_required() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select raw_app_meta_data->>'must_change_password'='true' from auth.users where id=(select auth.uid())),false)
$$;
revoke all on function private.password_required() from public,anon;
grant execute on function private.password_required() to authenticated;
-- Read authoritative Auth metadata, not a stale JWT or user-editable metadata.
do $$ declare signature text; source text; definition text; begin
 foreach signature in array array['private.active_user()','private.super_admin()','private.project_admin()','private.global_permission(text)','private.project_permission(uuid,uuid,text)','private.can_work(uuid,uuid,uuid,text)'] loop
   select prosrc into source from pg_proc where oid=signature::regprocedure;
   definition=pg_get_functiondef(signature::regprocedure);
   execute replace(definition,source,' select not private.password_required() and ('||rtrim(trim(source),';')||') ');
 end loop;
end $$;

alter table public.disciplines add column deleted_at timestamptz;
alter table public.disciplines add constraint deleted_discipline_inactive check(deleted_at is null or not is_active);
create policy disciplines_delete on public.disciplines for delete to authenticated using(private.super_admin());

create function private.discipline_removal_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (new.deleted_at is not null and old.deleted_at is null) then
   if exists(select 1 from public.profiles where discipline_id=old.id and is_active) then
     raise exception 'Cannot delete this discipline while active employees are assigned. Reassign or deactivate them first.';
   end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger discipline_removal_guard before delete or update on public.disciplines for each row execute function private.discipline_removal_guard();

create function private.employee_discipline_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_active and new.discipline_id is not null and (tg_op='INSERT' or new.discipline_id is distinct from old.discipline_id or new.is_active is distinct from old.is_active) then
   perform 1 from public.disciplines where id=new.discipline_id and is_active and deleted_at is null for update;
   if not found then raise exception 'Choose an active, available discipline for this employee'; end if;
 end if;
 return new;
end $$;
create trigger employee_discipline_guard before insert or update on public.profiles for each row execute function private.employee_discipline_guard();
revoke all on function private.discipline_removal_guard(),private.employee_discipline_guard() from public,anon,authenticated;

create function public.remove_discipline(target uuid) returns text language plpgsql security invoker set search_path='' as $$
begin
 if not private.super_admin() then raise exception 'Super Admin required'; end if;
 perform 1 from public.disciplines where id=target and deleted_at is null for update;
 if not found then raise exception 'Discipline unavailable'; end if;
 if exists(select 1 from public.profiles where discipline_id=target and is_active) then
   raise exception 'Cannot delete this discipline while active employees are assigned. Reassign or deactivate them first.';
 end if;
 begin
   delete from public.disciplines where id=target;
   if not found then raise exception 'Discipline deletion denied'; end if;
   return 'Discipline deleted.';
 exception when foreign_key_violation then
   update public.disciplines set is_active=false,deleted_at=now() where id=target;
   return 'Discipline removed from the catalog. Historical references were preserved.';
 end;
end $$;
revoke all on function public.remove_discipline(uuid) from public,anon;
grant execute on function public.remove_discipline(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
