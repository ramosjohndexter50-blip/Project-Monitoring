# Implementation and verification

## Delivery status

Implemented in the local repository. On 2026-09-17, access to `hskgapqvsweuljueenig` was restored, the existing schema was inspected, and the consultancy platform migration was applied successfully. The requested account was created through Supabase Auth and its active Super Admin profile verified. Login initially returned `Email not confirmed`. Application deployment and remaining live acceptance checks are pending. Security advisors identified an existing publicly executable `rls_auto_enable` helper; a follow-up migration is prepared locally, not yet applied. Leaked-password protection is disabled in the test project's Auth settings.

## Coverage

| Phase                  | Implementation                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audit                  | Entire small repository inspected, original schema/policies mapped, defects recorded before changes.                                                                                                                                                               |
| Authentication         | Cookie SSR client, session proxy, server-verified user and active-profile guards, confirmation/recovery callback, password setup, sign-out, errors/loading.                                                                                                        |
| Super Admin            | Protected `/admin`, controlled confirmed-account bootstrap, existing admin preservation.                                                                                                                                                                           |
| People / RBAC          | Account setup/reset links through server-only Auth API; editable profiles, role catalog, permission mappings, activation, project overrides. Global role remains `profiles.role`; memberships carry scoped roles instead of duplicating a global user_roles table. |
| Disciplines / teams    | Central directory, activation, project disciplines, lead assignment, multiple discipline memberships per person/project, explicit access removal.                                                                                                                  |
| Projects / tasks       | Consultancy project metadata, phases, milestone links, task hierarchy/dependencies, expanded statuses/critical priority, creator/completion fields, comments, retained board/history/My work.                                                                      |
| Registers              | Milestones, deliverables, private documents with revision numbers, RFIs/responses, issues/resolutions/comments.                                                                                                                                                    |
| Approvals              | Per-project/type workflows, ordered named reviewers, snapshots at submission, current-reviewer-only decisions, rejection/resubmission, immutable decisions and revision guards.                                                                                    |
| Notifications / audit  | Assignment/status/RFI/project/review events; idempotent deadline refresh at notification-center access; immutable database audit, login/logout events, auth last-login sync, account/bootstrap events.                                                             |
| Dashboards / reporting | Scoped portfolio/milestones/my work/deliverables, discipline progress, admin totals/distributions/activity, workload/status/overdue aggregation, global search and paginated registers.                                                                            |

## Existing features preserved

The existing Supabase Auth accounts, projects, tasks, discipline records and task history remain the basis of the upgraded application. Table/Kanban, search, owner assignment, notes, realtime task refresh, My work and optimistic timestamp conflict checks are retained. Existing uncommitted workflow work was incorporated rather than discarded. Old task status values are mapped explicitly by the migration.

## Authorization design

- Route guards and server mutations re-validate the authenticated user and active account.
- Generic register actions accept only declared modules/fields, validate values, and use the caller's session client; they do not bypass RLS.
- Membership and discipline checks are enforced in database policies. Organization Admin has a limited global permission set; it cannot edit Super Admin identities or grant roles.
- A discipline-scoped membership cannot modify the whole project just because its role includes a project permission.
- Project override denial takes precedence over regular grants, except for Super Admin. An override alone does not create membership.
- Assignees and related records are checked against project/discipline boundaries. Creator/uploader identity fields are protected.
- Approval functions serialize decisions with row locks. Submitted steps are snapshots; later template edits do not rewrite history.
- Public RPCs are invoker wrappers; privileged implementations live in the non-exposed private schema with explicit execute grants and authorization checks.
- Every public user-data table has RLS. Normal authenticated accounts cannot append forged audit rows or modify/delete audit and approval history.
- Storage uses a private bucket and project/discipline paths. Signed download URLs expire in 60 seconds; already-issued URLs can remain usable until expiry.
- Disabling an account blocks protected data access despite existing Auth tokens. It does not replace a Supabase Auth token-ban/revocation process.

These are implementation properties inspected and tested locally, not a blanket claim about the deployed project's security.

## Tests run

### Static/build

- `npm run lint`.
- `npm run build`, including TypeScript and route compilation.
- Browser bundle scan for the synthetic service-role credential: no match in static client output.

### PostgreSQL/RLS: `npm run test:db`

Applies the initial and new migration to PGlite using fixture Supabase Auth/Storage schemas, then exercises genuine PostgreSQL roles and RLS:

- Confirmed first Super Admin bootstrap; regular users cannot invoke it.
- Super Admin, Admin, Project Manager, Project Architect, Discipline Lead, Consultant, Team Member, Client, Viewer, disabled and unrelated-user project visibility.
- Cross-discipline/project write rejection and scoped lead project-edit rejection.
- Viewer writes, self-role escalation, Admin-to-Super-Admin escalation and editable metadata privilege escalation denied.
- Assigned task edits, reviewer-only completion, completion percentage and immutable creator behavior.
- Approval order, unauthorized/repeated decisions, immutable decisions, pending/approved revision content locks and revision reset.
- Private Storage object policies, malformed/outside-project paths and document metadata validation.
- Dependency cycles, incomplete predecessors, comments/impersonation, permission overrides and scoped reports.
- RLS enabled on every public table; anonymous queries/RPCs denied.
- No public SECURITY DEFINER functions remain; direct audit forgery and notification-title updates are denied.
- Deadline generation is idempotent and creates reminders for upcoming assigned work.

The harness omits the initial pgcrypto extension declaration because UUID generation is built into its PostgreSQL runtime. The fixture schemas do not model every GoTrue/Storage internal behavior.

### Browser with isolated local database/API fixture

- Unauthenticated `/admin` redirects to sign-in.
- Sign-in reaches the preserved task board and admin dashboard.
- Create project, create discipline, create Auth-account setup link, assign role, disable account, assign project team: browser → server action → fixture API → real local RLS/database → refreshed UI.
- Project Manager can open its dashboard and is denied the admin control center.
- Sign-out returns to sign-in.
- Disabled accounts show the inactive-account screen and can sign out.
- Edit a deliverable, create an approval workflow and reviewer, submit the deliverable, approve it and view its recorded review history.
- Reports and responsive desktop/mobile layouts checked visually.
- The fixture has synthetic Auth/Storage HTTP transport and no realtime service. These tests do not verify real email confirmation, JWT signature validation by GoTrue, Storage upload/download transport or realtime delivery.

## Operational limits / deferred extensions

- Run target-schema preflight, Supabase advisors and live acceptance tests before deployment. No live writes were performed here.
- Account setup and reset actions return one-time links for private sharing; no outbound email integration is configured.
- Deadline reminders are generated on notification-center access, not by a scheduled/background worker.
- Permanent project/task/document deletion is intentionally absent from the UI; statuses/activation preserve relationships and history.
- Designated manager/architect/lead changes add new memberships; remove obsolete memberships explicitly.
- The task board loads project tasks in batches for summary/filtering; use the server-paginated register for large projects. Reference pickers show up to 1,000 choices; a remote searchable picker is a future scaling improvement.
- Global search returns up to 20 accessible matches per register, with pagination/filtering in the full registers.
- Private file transport has no added antivirus/content-inspection pipeline. File upload maximum is 50 MB.
- PDF/Excel exports, background email delivery, custom workflow conditions/delegation and multi-organization tenancy are not part of this foundation.
- Existing external `files_url` attachments are retained but not imported into the new private document register automatically.
