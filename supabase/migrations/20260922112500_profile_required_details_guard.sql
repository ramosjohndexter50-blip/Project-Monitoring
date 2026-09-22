begin;

create or replace function private.profile_required_details_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if nullif(trim(new.full_name),'') is null
    or nullif(trim(new.email),'') is null
    or nullif(trim(new.employee_code),'') is null
    or nullif(trim(new.position),'') is null
    or nullif(trim(new.company),'') is null
    or nullif(trim(new.role),'') is null
    or new.discipline_id is null
  then
    raise exception 'Full name, email, employee ID, position, company, role and discipline are required.';
  end if;
  return new;
end $$;

create trigger profile_required_details_insert
before insert on public.profiles
for each row execute function private.profile_required_details_guard();

create trigger profile_required_details_update
before update of full_name,email,employee_code,position,company,role,discipline_id
on public.profiles
for each row execute function private.profile_required_details_guard();

revoke all on function private.profile_required_details_guard() from public,anon,authenticated;

commit;
