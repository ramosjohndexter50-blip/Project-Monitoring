# Deployment and migration runbook

## Before rollout

1. Obtain authorized access to the Supabase project referenced by `NEXT_PUBLIC_SUPABASE_URL`. The connected tool currently denied schema inspection; no production migration was applied.
2. Run `supabase/PREFLIGHT.sql` read-only against that project. Compare tables, constraints, functions, policies and buckets with `docs/AUDIT.md` and both repository migrations. Resolve drift before applying anything. In particular, inspect additional permissive RLS/Storage policies: policies are ORed, so an unexpected old policy could widen access.
3. Take a database backup using your existing Supabase backup process. Rehearse migration against a staging copy including representative data.
4. Confirm the existing initial migration is already applied. Do not rerun it against an existing database; it restores legacy permissive policies. Apply only pending migrations using your established Supabase migration workflow. Discover CLI commands with `supabase migration --help` and `supabase db --help` for the installed version.
5. Review `20260916090812_consultancy_platform.sql`. It is transactional and additive, but changes statuses and replaces authorization policies. It intentionally fails on conflicting existing object names so schema drift does not silently pass.

## Data migration behavior

- Existing users/projects/tasks/disciplines are retained.
- Existing global roles are preserved and linked to the role catalog.
- Existing assigned discipline leads and project creators are backfilled as explicit members.
- Managers/viewers who previously saw all projects need explicit membership assignments. Prepare this mapping before rollout.
- `working_on_it → in_progress`, `stuck → blocked`, `done → completed`.
- Existing combined disciplines remain; additional discipline names are seeded without automatic merges.
- Audit/approval history becomes append-only for application users. Task history no longer cascades when deleting a task.
- Existing Super Admin accounts remain. Bootstrap is only for installations without one.
- Existing legacy `files_url` values are preserved, but files are not automatically imported to Storage or the new document register.

## Environment

Set in local `.env.local` or the deployment platform's secret environment settings:

- `NEXT_PUBLIC_SUPABASE_URL`: target project API URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key (legacy anon fallback is retained).
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Auth administration key. Never use a `NEXT_PUBLIC_` prefix or commit it. Required only for account provisioning/access-reset links and the operator bootstrap.
- `APP_ORIGIN`: trusted full application origin, e.g. `https://monitor.example.com`.

`NEXT_BUILD_DIR` is an optional local verification build directory. Do not set it on the normal deployment.

Add the application's `/auth/callback` URL to Supabase Auth's allowed redirect URLs. Public signup creates unprivileged Viewer accounts. Disable public signup in Supabase Auth if the organization requires administrator-created accounts only. Account setup/recovery links produced by the control center must be shared privately; no email delivery was added.

The app checks active status and authorization on the server and in RLS. Disabling a profile denies protected data even if an old Auth token remains valid. The account can still reach the inactive-account page. If account revocation must also prevent issuing Auth tokens, add an operational Supabase Auth ban/revocation workflow.

## Initial administrator

Create and confirm the account in Supabase Auth, then from a trusted terminal:

```powershell
npm run bootstrap:admin -- confirmed-admin@your-company.example
```

This uses the server-only key, an advisory lock and a database function restricted to `service_role`. It requires confirmed email, refuses a second bootstrap and writes an audit record. Ordinary users cannot select Super Admin at signup.

## Coordinated release

Apply the verified migration and release this application version together during a controlled change window. This app requires the new schema; it displays a setup-required page if it cannot load it. The previous task board version uses legacy status names and must not continue writing after the status migration.

After migration:

1. Run Supabase's security/performance advisors and investigate unexpected findings.
2. Sign in with the existing/bootstrapped Super Admin.
3. Verify roles, user activation and project memberships before inviting team members.
4. Enable project disciplines, assign teams and verify permissions with real test users.
5. Create and update a staging task, then confirm persistence after reload.
6. Test all approval steps with separate reviewer accounts, rejection/resubmission, private upload/download, RFI response, and notification read states.
7. Revoke a membership and disable an account; verify direct Data API and Storage access are denied.
8. Check the realtime subscription uses the existing `supabase_realtime` task publication.

Keep the staging copy and backup until these checks pass. Do not blindly run the old app against the new schema as a rollback: its task statuses differ. Revert via the validated restore/release plan or a reviewed forward migration.

## Local verification

```powershell
npm run lint
npm run build
npm run test:db
```

`test:db` applies migrations to embedded PostgreSQL (PGlite), with fixture Supabase Auth/Storage schemas and genuine database roles/RLS. The old pgcrypto extension statement is omitted in that harness because `gen_random_uuid()` is built in. This is not a live GoTrue/Storage service test.

For reproducible browser verification:

1. Run `node scripts/browser-fixture.mjs` in a separate terminal (loopback-only test database/API).
2. Build with `node scripts/build-verification.mjs`.
3. Run `node scripts/start-verification.mjs` and open `http://localhost:3101`.
4. Fixture accounts are `admin@fixture.test`, `manager@fixture.test`, `viewer@fixture.test`, `disabled@fixture.test`; any nonempty password is accepted by the **fixture transport only**.
5. Stop both processes after testing. Never deploy these test servers or use fixture configuration outside local verification.

The fixture's database operations execute real migration policies. Its Auth transport, signed links, Storage transport and absence of realtime service are test doubles. Live confirmation links, password resets, token validation, upload/download and realtime remain rollout checks.
