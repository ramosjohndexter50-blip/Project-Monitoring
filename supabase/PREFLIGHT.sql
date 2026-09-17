-- Read-only preflight. Run against the target BEFORE applying the platform migration.
-- Compare results with docs/AUDIT.md and investigate all unexpected tables/policies.
select current_database(), version();
select schemaname,tablename,rowsecurity from pg_tables where schemaname in ('public','storage') order by 1,2;
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position;
select schemaname,tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2;
select role,count(*) from public.profiles group by role;
select count(*) as existing_projects from public.projects;
select status,count(*) from public.tasks group by status;
select id,name,public,file_size_limit from storage.buckets;
