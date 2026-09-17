# Pre-implementation audit — 16 September 2026

## Current Architecture

Next.js 16.3.5 / React 19, App Router, TypeScript. One browser-rendered entry page, Supabase browser client, cookie-based login/signup, workspace and task board. Existing functionality includes project switching, table/Kanban, My work, task editing, filtering, notes, optimistic concurrency, realtime refresh and task history. No server client, proxy, protected admin route, API layer, or database tests.

## Current Database

Repository migration defines profiles → auth.users; profiles → disciplines; projects → creator profile; project_disciplines → project, discipline, lead; tasks → project, discipline, owner; task_history → task, actor. RLS is enabled on all six tables. Triggers create profiles, stamp task updates, and log selected changed fields. Existing roles: super_admin, project_manager, discipline_lead, viewer. Setup scripts assign roles and seed a project using a fixed email address.

Live inspection of project hskgapqvsweuljueenig was attempted and rejected by the connected Supabase service. This report describes repository SQL, not a verified production catalog. No live database changes are authorized by inference from this snapshot; compare migrations with the deployed catalog before rollout.

## Problems Found

- can_view_project grants every manager/viewer visibility across all projects.
- Lead task policy has an unqualified discipline_id in a subquery; it can resolve to the profile column rather than the task column.
- Task insert policy does not require project membership.
- No account activation guard, project member table, granular permissions or server-side admin protection.
- Profiles expose only own/admin records, limiting collaboration and owner labels.
- Task history cascades on task deletion and does not record creation/deletion.
- Role setup has hard-coded personal email and no controlled one-time bootstrap.
- No document storage, deliverables, approvals, milestones, RFIs, issues or notifications.

## Recommended Architecture

Retain existing tables and task board. Add cookie SSR/proxy and verified server authorization. Database roles and permission mappings remain authoritative; profiles.role is the global role, project_members stores project/discipline roles, and project_permission_overrides stores scoped exceptions. A duplicate global user_roles table is unnecessary while each account has one global role. Use private authorization functions, explicit policies, append-only audit and approval histories, private Storage, server-only Auth administration, and reusable module configuration/forms.

## Migration Plan

One additive, versioned migration extends existing data, maps old task status names, backfills explicit assigned leads/creators, adds module tables and replaces unsafe policies. Existing managers/viewers receive no implicit membership: an administrator must explicitly assign projects. Preserve existing discipline names and seed additional names without merging historical records. No live application of this migration until catalog comparison is possible.

## Files To Modify

src/app/page.tsx, workspace.tsx, task-board.tsx, globals.css; src/lib/supabase/server.ts; src/proxy.ts; new protected platform/admin routes, module configuration, server actions, reusable UI, Auth administration, storage upload/download, auth callback, scripts/bootstrap-admin.mjs, scripts/test-database.mjs, .env.example, package scripts, WORKFLOW.md, docs.

## Database Changes

Extend profiles, projects, disciplines, project_disciplines, tasks. Add roles, permissions, role_permissions, project_members, project_permission_overrides, project_phases, milestones, task_dependencies, task_comments, deliverables, documents, rfis, issues, issue_comments, approval_workflows, workflow_steps, approvals, approval_steps, approval_decisions, notifications, audit_logs, system_settings. Add indexes, relationship checks, scoped RLS, immutable audit triggers, approval RPCs and private document storage policies. Test migrations and direct authenticated-role access locally before reporting results.

## Discipline-control change audit ? 2026-09-17

Inspected before changing the implementation: landing auth component, verified server session helper, global/project permission functions, profile/task/scope guards, RLS table policies, employee creation actions, project/task forms, task board and portal/admin dashboards.

Findings: public signup was exposed; accounts were created as Viewer with later manual edits; legacy Admin could manage employees; whole-project memberships could grant cross-discipline access; task updates could alter instructions; project contributors were a separate register without integrated selection; the landing page did not direct staff to a named discipline dashboard. Existing task history, audit, notifications, approvals and private Storage were retained.

Read-only live Data API inspection found 9 roles, 2 profiles and no project memberships or contributor rows at inspection time. No new discipline-control migration or application deployment was applied by this session. The authorized service key was used without printing it. The new migration and database regression tests address the findings above.
