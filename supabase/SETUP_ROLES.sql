-- Superseded by the controlled bootstrap and Control Center.
-- 1. Create the initial account through Supabase Auth and confirm its email.
-- 2. Apply all repository migrations in order to the verified target database.
-- 3. From a trusted operator terminal with the server-only key configured:
--      npm run bootstrap:admin -- confirmed-admin@your-company.example
-- The bootstrap refuses to run if a Super Admin already exists and logs its action.
-- Existing Super Admin accounts are preserved by the platform migration.
-- Assign other roles through Control Center -> People & consultants.
-- Assign project access through Project teams; a global role alone grants no project membership.
select key, name from public.roles order by name;
