-- Run this after creating the first account in the app.
-- Replace the email with the account that should manage users and projects.
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', email)
from auth.users
where email = 'admin@example.com'
on conflict (id) do nothing;

update public.profiles
set role = 'super_admin', full_name = 'Project Director'
where email = 'admin@example.com';

-- View available disciplines before assigning a lead.
select id, name from public.disciplines order by name;

-- Assign an employee to one discipline.
-- Replace the email and discipline name with real values.
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', email)
from auth.users
where email = 'employee@example.com'
on conflict (id) do nothing;

update public.profiles
set role = 'discipline_lead',
    discipline_id = (select id from public.disciplines where name = 'Architecture')
where email = 'employee@example.com';

-- Other valid role values:
-- project_manager, viewer
