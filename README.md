# Architectural Consultancy Project Monitor

Next.js 16 + Supabase platform for project-based architectural and engineering consultancy work.

- `/`: original table/Kanban task board, My work and workflow guide.
- `/portal`: scoped dashboards, registers, notifications, search and reporting.
- `/admin`: server-protected control center.

Read [WORKFLOW.md](WORKFLOW.md) for operating procedures, [audit](docs/AUDIT.md) for the original architecture and findings, [implementation](docs/IMPLEMENTATION.md) for feature/test coverage, and [deployment](docs/DEPLOYMENT.md) for migration and bootstrap instructions.

## Local development

```powershell
npm ci
# Configure .env.local from .env.example without committing credentials.
# Apply verified migrations to a staging/local Supabase project first.
npm run dev
```

This application version requires the consultancy platform migration. The connected production database has not been migrated by this implementation session.

## Verification

```powershell
npm run lint
npm run build
npm run test:db
```

Database tests use embedded PostgreSQL and fixture Auth/Storage schemas. See the deployment guide for isolated browser verification and the remaining live-environment checks.

## Architecture

- `src/lib/supabase`: browser, cookie SSR and server-only Auth admin clients.
- `src/proxy.ts`: session refresh and private cache headers.
- `src/lib/platform`: authorization, allowlisted module definitions, queries, validated mutations.
- `src/components/platform`: reusable dashboard and management forms.
- `src/app/portal`: server-rendered registers, search and reports; row access remains enforced by RLS.
- `supabase/migrations`: data-preserving schema/status migration, project permissions, immutable histories, approvals and private Storage policies.
- `scripts`: controlled Super Admin bootstrap and isolated verification tooling.

Secrets belong only in server-side environment configuration. The service-role client is protected by `server-only` and used only after authenticated permission checks or by the trusted bootstrap operator.
