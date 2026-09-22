begin;

-- Provisioning rows are temporary reservations. Clear any pre-migration
-- reservations so every future account must supply the new required fields.
delete from public.employee_provisioning;

alter table public.employee_provisioning
  add column employee_code text not null check(length(trim(employee_code))>0),
  add column company text not null check(length(trim(company))>0);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare invitation public.employee_provisioning;
begin
 delete from public.employee_provisioning
 where email=lower(new.email)
   and token::text=new.raw_user_meta_data->>'provisioning_token'
   and expires_at>now()
 returning * into invitation;

 if invitation.token is null then
   raise exception 'Public registration is disabled. Contact the Super Admin.';
 end if;

 if not exists(
   select 1 from public.profiles
   where id=invitation.created_by and role='super_admin' and is_active
 )
 or not exists(
   select 1 from public.disciplines
   where id=invitation.discipline_id and is_active
 )
 then
   raise exception 'Invalid administrator invitation';
 end if;

 insert into public.profiles(
   id,email,full_name,employee_code,role,discipline_id,position,company,is_active
 )
 values(
   new.id,new.email,invitation.full_name,invitation.employee_code,
   invitation.role_key,invitation.discipline_id,invitation.position,
   invitation.company,invitation.is_active
 );

 insert into public.audit_logs(actor_id,action,entity,entity_id,metadata)
 values(
   invitation.created_by,
   'employee_created',
   'profiles',
   new.id,
   jsonb_build_object(
     'after',
     jsonb_build_object(
       'email',new.email,
       'employee_code',invitation.employee_code,
       'role',invitation.role_key,
       'discipline_id',invitation.discipline_id,
       'position',invitation.position,
       'company',invitation.company,
       'is_active',invitation.is_active
     )
   )
 );

 return new;
end $$;

notify pgrst,'reload schema';

commit;
