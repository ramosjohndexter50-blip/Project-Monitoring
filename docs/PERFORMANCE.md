# Performance implementation and verification — 2026-09-18

The main fixes address database round trips, loading every task before displaying a page, and render-blocking font requests. Work was performed on `main`, starting at `d0a4c28`. An external commit (`6463075`) appeared during verification; its changes were preserved. This session did not push Git or deploy the application to Vercel.

The performance migration **was applied to live Supabase `hskgapqvsweuljueenig`**, version `20260918010649`. Its local filename matches that live migration version. No production test records were created. Both new RPCs were exercised as the authenticated Super Admin inside a rolled-back transaction. Live data currently has no projects/tasks, so production task-query or navigation speedups cannot be measured meaningfully there.

## Findings and architecture

- Next.js 16.3.5 App Router, React Server Components, Supabase HTTP Data API/Auth, one browser Realtime subscription per project. The configured deployment target is Vercel.
- Navigation: Link → proxy token validation → request-scoped user/profile → RLS queries/RPCs → streamed Server Components. Mutations remain protected Server Actions or authenticated Supabase requests. Private downloads retain short-lived signed URLs and `private, no-store`.
- Dashboard issued 22 backend requests, including six separate count requests, a complete project report just to obtain discipline progress, and several sequential independent operations.
- Task board fetched every task in serial 500-row batches, then filtered/paginated in JavaScript. Capabilities returned IDs for every editable task. Every Realtime event repeated task, profile, discipline, and capability requests.
- Register pages selected every column and loaded form reference data even when no form was shown. Duplicate create-permission RPCs were identical. Profile lookup was repeated after the workspace server had already loaded it.
- Native GET filter forms caused document reloads. Search/report/dashboard routes lacked useful local loading boundaries. Existing module skeleton classes had no CSS definitions.
- CSS imported Manrope and DM Mono from Google at runtime, while unused Geist fonts were also preloaded. This caused an avoidable external stylesheet/font waterfall.
- The live database already indexed foreign keys. The useful missing indexes covered project/due-date task ordering and recent history/project ordering. Nine RLS policies repeatedly evaluated the same caller identity.
- No per-record HTTP N+1 loop was found. The board's serial batch loop and per-task capability work were the relevant scaling problems; these have been replaced with a bounded RPC.
- Browser verification also exposed a pre-existing notification column mismatch (`message` vs the actual `title`) and the composite-key role-permission register's invalid `id` assumption. Both were fixed. Project editing now retains selected contributor IDs rather than presenting unchecked assignments.

## All 20 requested items

| # | Optimization | Status | Implementation / applicability |
|---|---|---|---|
| 1 | Cache API responses | IMPLEMENTED, request scope | Repeated authorization/reference reads share their result within the render. Private HTTP responses are intentionally not shared across requests. The only original application GET API is a permission-sensitive document download redirect, unsuitable for public/CDN caching. |
| 2 | Load balancing | NOT APPLICABLE to custom infrastructure | Vercel manages distribution and scaling. The application has no process-local sessions, sticky-session dependency, or custom SQL pool. No additional proxy/load balancer was added. |
| 3 | Database indexes | IMPLEMENTED | Three targeted composite/order indexes; all existing FK indexes reviewed. Authenticated EXPLAIN demonstrates the task ordering index. |
| 4 | Image compression | IMPLEMENTED | Logo uses `next/image`, explicit 48px dimensions/sizes, negotiated WebP/AVIF, and default lazy loading. Original 19,109-byte PNG retained for browser icons. No large photo gallery exists. |
| 5 | Loading skeletons | IMPLEMENTED | Dashboard/admin, search, reports, module tables, and board queries have layout-sized placeholders; reduced-motion support included. |
| 6 | Cache expensive queries | IMPLEMENTED, statement/request scope | Materialized narrow task CTEs reuse work for aggregate calculations. Reference/permission results are deduplicated per render. No stale persistent task-summary cache. |
| 7 | Eliminate N+1 | IMPLEMENTED for identified repeated work | Board rows, aggregate counts, and page capabilities use one RPC; joins replace client name-search scans. Removed serial all-task batch fetching. No invented N+1 claim for existing already-batched register queries. |
| 8 | Debounce inputs | IMPLEMENTED | Board search debounces 250ms; obsolete RPCs are aborted and version-guarded. Realtime bursts coalesce for 150ms. Buttons remain immediate. Submit-only server filters require no debounce. |
| 9 | Split code | IMPLEMENTED | Task editor moved to a separate dynamically imported client chunk. Storage client import is deferred until document upload. Next.js retains automatic route splitting. |
| 10 | CDN | IMPLEMENTED using existing platform | Next-generated fingerprinted assets and self-hosted fonts are eligible for Vercel's existing immutable CDN delivery. No blanket cache header on authenticated pages. |
| 11 | Server caching | IMPLEMENTED, request scope | React `cache` reuses server client/session, permission decisions, and matching reference calls. Lifetime ends with the request, so the next request rechecks RLS/account state. |
| 12 | Pagination | IMPLEMENTED for large task/register datasets | Board fetches 25 rows (RPC hard cap 100), while SQL computes full authorized totals. Registers already use 25 rows and now select narrow columns with stable ordering. Search/history/dashboard feeds remain bounded. Reference-selector limits are documented below. |
| 13 | Lighthouse | IMPLEMENTED | Saved before/after mobile lab reports for the login page. Authenticated routes were separately verified in browser; login results are not presented as authenticated dashboard scores. |
| 14 | Payload compression/reduction | IMPLEMENTED | Narrow register/mutation projections, small user props, bounded board payload, aggregate RPC. Next's production HTTP compression explicitly enabled; platform compression retained. |
| 15 | Re-render reduction | IMPLEMENTED | Removed all-task filtering/status recounting from renders. Memoized person/discipline maps replace repeated `.find()`. Editor draft state is isolated in its own lazy component. |
| 16 | Minification/tree shaking | IMPLEMENTED using production defaults | Verified actual Turbopack production builds, minified JS/CSS output, and chunk sizes. No redundant minifier dependency. |
| 17 | Lazy loading | IMPLEMENTED | Task editor fetched when opened, document client fetched on upload, history requested only when opened, logo optimized via Next image loading. Critical board content is not artificially delayed. |
| 18 | Defer third-party scripts | NOT APPLICABLE to scripts | No active analytics/widgets/tracking script is imported. The actual external blocking resource was fonts: replaced runtime Google CSS imports with self-hosted `next/font`, preserving Manrope/DM Mono. |
| 19 | Remove unused dependencies | IMPLEMENTED | Removed unused runtime `@vercel/analytics` and `@vercel/speed-insights`; lockfile updated. Added pinned `@playwright/test` only as a dev dependency, used by the regression suite. |
| 20 | Connection pooling | IMPLEMENTED using provider connection model | Application uses Supabase's HTTP Data API, not one direct Postgres connection per request. Reuses the SSR client within a render and the browser client. No redundant `pg` pool/Supavisor connection string added. |

Caching policy: no cross-user or cross-request storage of private query results, role grants, signed URLs, or session clients. Request/statement caches expire automatically when execution ends. Successful Server Actions still revalidate affected routes; browser mutations reload the current page; Realtime refreshes bounded task data. Fresh authorization remains authoritative. Therefore no distributed cache invalidation bus or multi-minute permission TTL is needed.

## Database changes

Migration: `supabase/migrations/20260918010649_performance_optimization.sql`.

- `tasks_project_due_id (project_id, due_date, id)`
- `task_history_recent (changed_at DESC, id)`
- `projects_recent (updated_at DESC, id)`
- `dashboard_metrics()` consolidates counts and the required summaries without calling the larger full project report.
- `task_board_page(...)` returns at most 100 tasks (UI requests 25), full filtered totals, overall progress/status counts, and capabilities only for the returned page. Search still matches task, discipline, and owner names. Pagination is ordered by due date and ID and clamps out-of-range pages.
- Nine policies now use `(select auth.uid())`; ownership and permission expressions are otherwise preserved. No security-definer public function was introduced. New RPCs are security invoker, deny `anon`/`PUBLIC`, and retain underlying RLS.
- Live advisors confirm the nine identity-initplan warnings are gone. Existing multiple-permissive-policy warnings remain (six); merging these has not been proven beneficial and could affect access semantics. Existing/new unused-index notices are expected in this nearly empty database; no FK index was blindly dropped.

## Measurements

Local production Next build, synthetic Auth/Storage transport, real PostgreSQL migrations/RLS in PGlite. One warm-up plus three warm requests per route. These are **local lab measurements**, not live network latency or field INP.

| Route | Backend requests before → after | Warm median full-response time before → after |
|---|---:|---:|
| Dashboard | 22 → 15 | 38 → 29 ms |
| Admin dashboard | 22 → 15 | 31 → 23 ms |
| Task register | 11 → 10 | 17 → 18 ms |
| Project register | 10 → 7 | 16 → 17 ms |
| Employee register | 12 → 11 | 20 → 19 ms |
| Reports | 7 → 7, independent work now parallel | 11 → 13 ms |
| Search | 12 → 12 | 18 → 18 ms |

Small localhost timing differences are noise; the request-count/payload reductions are the reliable structural changes. No claim that every route became faster or is near-instant. Synthetic HS256 auth still makes proxy `getClaims` fall back to remote validation; asymmetric production JWTs can use the supported local verification path while the server still performs `getUser`.

With **1,203 synthetic tasks**, old all-task plus capabilities payload was **1,820,643 bytes**, versus **38,121 bytes** for a 25-row board response (~97.9% reduction). Local combined database execution was **102.3 → 73.1 ms** in the recorded run. These single-run SQL timings are illustrative; the byte and row bounds are deterministic. The task-order EXPLAIN uses `tasks_project_due_id` with caller RLS retained; plan is saved in `docs/performance/database.json`.

Lighthouse mobile login: Performance **90 → 97**, Accessibility **95 → 95**, Best Practices **100 → 100**, SEO **100 → 100**. FCP **2.51 → 0.76 s**, LCP **3.12 → 2.42 s**, CLS **0.0004 → 0**. TBT **4 → 72.5 ms** (not an improvement); INP is not measured by this navigation-only lab run. The Windows Lighthouse CLI wrote valid reports but exited with an EPERM error while cleaning its temporary Chrome directory; score assertions are drawn from saved reports, not a claimed clean CLI exit.

All emitted JS chunks, summed across the whole build: **903,026 → 932,090 bytes** (gzip sum **268,346 → 279,265**). CSS: **39,733 → 40,603 bytes**. These totals increased with the image/form runtime and loading UI; they are not initial-route transfer size. The editor is now a separate on-demand chunk. No unsupported claim of a smaller total bundle is made.

Image endpoint verified: original logo **19,109 bytes → 957 bytes** at 48px in AVIF. The response returned HTTP 200 and immutable public caching for the fingerprinted image source. This check does not change caching of private documents.

Performance budgets: 25 board rows per normal response (server-enforced maximum 100); one board RPC per settled search/page refresh; no all-task download or per-row HTTP request loop; no runtime Google font request; one project Realtime subscription; target mobile LCP ≤2.5s and CLS ≤0.1. Field navigation/INP targets still require deployed measurements; the lab results do not establish a production percentile.

## Verification and evidence

- Production verification build, TypeScript, ESLint, full database tests passed.
- Database tests cover previous role/isolation/approval/storage rules plus bounded/stable pagination, full aggregate agreement, literal and owner-name search, invalid-page clamping, read-after-write, inactive/outsider isolation, and anonymous RPC denial.
- Browser suite passed login, board, lazy editor/save, debounced search, kanban/history, all active portal/admin modules, same-document search navigation, reports, preservation of project contributors, task creation, 390px mobile layouts, logout/protected redirects, non-admin UI, and inactive account denial.
- No unexpected browser runtime/console errors. The fixture lacks Realtime WebSocket transport; that expected limitation is excluded explicitly. The disabled account's audit-RPC rejection is recorded as an expected denial.
- Source, query plans, request lists, lab JSON, and screenshots: `docs/performance/`. Database tests use 1,200 added synthetic tasks; browser/route measurements use the small fixture and never production data.

Repeat locally in separate terminals: `node scripts/browser-fixture.mjs`, `node scripts/build-verification.mjs`, then `node scripts/start-verification.mjs`. Run `npm run test:db`, `npm run test:browser`, and `npm run perf:measure -- after`. Playwright needs `npx playwright install chromium`, or set `PERFORMANCE_CHROME_PATH` to an installed Chromium executable. The test site origin is `http://localhost:3101` to match the fixture's CSRF origin setting.

## Important files

- `src/components/platform/dashboard.tsx`, `src/lib/platform/auth.ts`, `src/lib/platform/queries.ts`, `src/lib/supabase/server.ts`, `src/proxy.ts`
- `src/app/task-board.tsx`, `src/app/task-editor.tsx`, `src/app/task-types.ts`, `src/lib/use-debounced-value.ts`
- `src/app/portal/[module]/page.tsx`, search/reports pages, workspace/page, forms/actions, monitoring module configuration
- `src/app/layout.tsx`, `src/app/globals.css`, route loading files, loading skeleton, `next.config.ts`
- Performance migration; `scripts/test-database.mjs`, `scripts/browser-fixture.mjs`, `scripts/verify-browser.mjs`, `scripts/measure-performance.mjs`; package/lockfile

## Remaining limits

- Full live user-navigation, SMTP, actual Storage transport, and Realtime delivery were not tested. Live checks were read-only catalog/RPC/advisor verification; browser writes were local fixture only.
- Reference dropdowns still use bounded option arrays (register choices max 500; original board/report options follow the Data API result cap). Very large employee/project directories need searchable paged selectors to make every option reachable efficiently. This task optimized the large task/register datasets; it does not claim those reference controls are unlimited.
- Exact totals and full-workload reports still scan authorized records. At much larger scale, evaluate production `pg_stat_statements`, RLS plans, and search indexes against actual selectivity before adding more indexes/caches. No large production dataset was available.
- Some older dashboard/search links target modules removed in the incoming GitHub monitoring refactor. Those features were already absent from the active module registry; this performance pass did not restore removed business modules.
- Existing leaked-password protection warning remains unchanged; no Auth configuration was modified by this optimization.

Architecture references: [Next.js form navigation](https://nextjs.org/docs/app/api-reference/components/form), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Vercel CDN](https://vercel.com/docs/cdn). Implementation was checked against the installed Next.js documentation as required by AGENTS.md.
