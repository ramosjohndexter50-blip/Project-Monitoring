# Admin and Super Admin workflow

## Responsibilities

| Action | Admin | Super Admin |
| --- | --- | --- |
| Create/edit projects and contributing disciplines | Yes | Read-only monitoring |
| Assign existing employees to project teams | Yes | Read-only monitoring |
| Create, assign, edit and review project tasks | Yes | Read-only monitoring |
| Create accounts, reset access, change global roles, disable accounts | No | Yes |
| Manage role definitions, discipline catalog and web settings | No | Yes |

The database enforces this separation even if someone calls the API directly or adds a conflicting role grant. Employee discipline and project isolation still apply. Disabled Admin accounts lose access. Admin can read profiles to choose project staff but cannot edit their accounts.

## Super Admin: provision an Admin

1. Sign in. The landing page is **Super Admin Control Center**.
2. Open **Employee management**. For a new account, enter name, email, discipline, position, and select **Admin** as the global role. Existing users can be edited to use **Admin**.
3. Share the generated one-time setup link privately. This flow does not send email.
4. Keep at least one Super Admin. Self-demotion and self-deactivation remain blocked.
5. Use **Web settings** for system configuration, and **Disciplines** for the organization-wide discipline catalog.

Local setup links use `APP_ORIGIN=http://localhost:3000`. A deployed environment must set `APP_ORIGIN` to its actual HTTPS URL and supply the server-only Supabase service key. Never copy localhost setup links to remote users.

## Admin: manage delivery

1. Sign in to the project board, or open **Dashboard** for **Admin Project Center**.
2. Open **Projects → New project**. Enter the project code/name and select contributing disciplines.
3. Use **Details** to edit project information and contributors. Removed contributors retain historical records.
4. Use **Manage team → Assign employee** to add existing employees. Their assigned project discipline must match their active home discipline and an active project contributor.
5. Open **Tasks**, choose a project, and create/assign tasks. The board also supports task edits, progress, review and history.
6. Account creation, role changes and web settings stay with Super Admin.

## Verification and deployment

- `npm run test:db` covers project/team/task writes, account/settings denials, Super Admin read-only projects, conflicting grants and disabled Admin isolation.
- `npm run test:browser` uses the isolated browser fixture to verify both roles, project creation/editing/team assignment, settings saving, and existing employee access.
- Migration `20260918061952_split_project_admin.sql` was applied to Project Monitor Supabase `hskgapqvsweuljueenig`.
- Authenticated live project create/edit and role checks were verified inside a rolled-back transaction; no test projects or user-role changes remain.
- Application changes are local until deployed. Browser fixture authentication is synthetic, not proof of real account invitation or email delivery.
