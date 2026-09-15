create extension if not exists pgcrypto;

create table if not exists public.disciplines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color_code text not null default '#73a6a0',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'viewer' check (role in ('super_admin', 'project_manager', 'discipline_lead', 'viewer')),
  discipline_id uuid references public.disciplines(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  start_date date,
  target_date date,
  status text not null default 'planning' check (status in ('planning', 'ongoing', 'on_hold', 'completed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.project_disciplines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  discipline_id uuid not null references public.disciplines(id) on delete restrict,
  assigned_lead uuid references public.profiles(id) on delete set null,
  unique (project_id, discipline_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  discipline_id uuid not null references public.disciplines(id) on delete restrict,
  task_name text not null,
  status text not null default 'not_started' check (status in ('not_started', 'working_on_it', 'stuck', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  owner uuid references public.profiles(id) on delete set null,
  start_date date,
  due_date date,
  percent_complete integer not null default 0 check (percent_complete between 0 and 100),
  notes text,
  files_url text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  field_changed text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index if not exists tasks_project_discipline_idx on public.tasks(project_id, discipline_id);
create index if not exists task_history_task_changed_idx on public.task_history(task_id, changed_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute procedure public.set_task_updated_at();

create or replace function public.log_task_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  changed_field text;
  old_text text;
  new_text text;
begin
  foreach changed_field in array array['task_name', 'status', 'priority', 'owner', 'start_date', 'due_date', 'percent_complete', 'notes', 'files_url'] loop
    execute format('select ($1).%I::text, ($2).%I::text', changed_field, changed_field)
      into old_text, new_text using old, new;
    if old_text is distinct from new_text then
      insert into public.task_history (task_id, changed_by, field_changed, old_value, new_value)
      values (new.id, auth.uid(), changed_field, old_text, new_text);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists log_task_changes on public.tasks;
create trigger log_task_changes
after update on public.tasks
for each row execute procedure public.log_task_changes();

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin'); $$;

create or replace function public.can_view_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles p join public.project_disciplines pd on pd.assigned_lead = p.id where p.id = auth.uid() and pd.project_id = target_project)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('project_manager', 'viewer'));
$$;

alter table public.profiles enable row level security;
alter table public.disciplines enable row level security;
alter table public.projects enable row level security;
alter table public.project_disciplines enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_super_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists disciplines_authenticated_read on public.disciplines;
create policy disciplines_authenticated_read on public.disciplines for select to authenticated using (true);
drop policy if exists disciplines_admin_write on public.disciplines;
create policy disciplines_admin_write on public.disciplines for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists projects_view on public.projects;
create policy projects_view on public.projects for select to authenticated using (public.can_view_project(id));
drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists project_disciplines_view on public.project_disciplines;
create policy project_disciplines_view on public.project_disciplines for select to authenticated using (public.can_view_project(project_id));
drop policy if exists project_disciplines_admin_write on public.project_disciplines;
create policy project_disciplines_admin_write on public.project_disciplines for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tasks_view on public.tasks;
create policy tasks_view on public.tasks for select to authenticated using (public.can_view_project(project_id));
drop policy if exists tasks_lead_insert on public.tasks;
create policy tasks_lead_insert on public.tasks for insert to authenticated with check (
  public.is_super_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'discipline_lead' and p.discipline_id = discipline_id)
);
drop policy if exists tasks_lead_update on public.tasks;
create policy tasks_lead_update on public.tasks for update to authenticated using (
  public.is_super_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'discipline_lead' and p.discipline_id = discipline_id)
) with check (discipline_id = (select p.discipline_id from public.profiles p where p.id = auth.uid()) or public.is_super_admin());
drop policy if exists tasks_lead_delete on public.tasks;
create policy tasks_lead_delete on public.tasks for delete to authenticated using (
  public.is_super_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'discipline_lead' and p.discipline_id = discipline_id)
);

drop policy if exists task_history_view on public.task_history;
create policy task_history_view on public.task_history for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and public.can_view_project(t.project_id)));

insert into public.disciplines (name, color_code) values
  ('Architecture', '#ef8f64'), ('Interior Design', '#d6ad63'), ('Fire & Plumbing', '#df6c6c'),
  ('HVAC', '#77a8bc'), ('Electrical - High Current', '#a28bbd'), ('Electrical - Low Current', '#78ad91'),
  ('BIM Coordinator', '#73a6a0')
on conflict (name) do nothing;
