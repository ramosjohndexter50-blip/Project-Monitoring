import Link from "next/link";
import Form from "next/form";
import { notFound } from "next/navigation";
import { session, permission, hasPermission } from "@/lib/platform/auth";
import { modules, label, type DataRow } from "@/lib/platform/monitoring-modules";
import { choicesFor, recordLabel } from "@/lib/platform/queries";
import { RecordForm, ActionButton, AccountForm } from "@/components/platform/forms";

type Params = {
  project?: string;
  q?: string;
  status?: string;
  discipline?: string;
  owner?: string;
  from?: string;
  to?: string;
  page?: string;
  edit?: string;
  new?: string;
  role?: string;
  position?: string;
};

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Params>;
}) {
  const { module: moduleKey } = await params;
  const config = modules[moduleKey];
  if (!config) notFound();

  const filters = await searchParams;
  const { db, user, profile } = await session();

  if (config.admin) {
    await Promise.all([permission("admin.access"), permission(moduleKey === "settings" ? "settings.manage" : `${config.permission}.view`)]);
  }

  const project = filters.project || null;
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page ?? "1", 10) || 1));

  const choicesPromise = choicesFor(db, config, project, !!(filters.edit || filters.new) || moduleKey === "users");
  const recordKey = config.key ?? "id";
  const columns = [...new Set([...config.columns, ...(moduleKey === "tasks" ? ["notes"] : []), ...(moduleKey === "role_permissions" ? [] : [recordKey]), ...(config.project ? ["project_id"] : [])])].join(",");
  let query = db.from(config.table).select(columns, { count: "exact" });
  if (moduleKey === "disciplines") query = query.is("deleted_at", null);
  query = moduleKey === "tasks"
    ? query.order("due_date", { ascending: true, nullsFirst: false }).order(recordKey)
    : query.order(moduleKey === "notifications" ? "created_at" : moduleKey === "role_permissions" ? "role_key" : recordKey, {
        ascending: moduleKey !== "notifications",
      });
  if (moduleKey === "role_permissions") query = query.order("permission_key");
  if (moduleKey === "notifications") query = query.order("id");

  if (config.project && project) query = query.eq("project_id", project);
  if (moduleKey === "projects" && project) query = query.eq("id", project);
  if (filters.q) query = query.ilike(config.search, `%${filters.q.replace(/[%_\\]/g, "").slice(0, 100)}%`);
  if (filters.status && config.columns.includes("status")) query = query.eq("status", filters.status);
  if (filters.discipline && config.columns.includes("discipline_id")) query = query.eq("discipline_id", filters.discipline);
  if (filters.owner && config.columns.includes("owner")) query = query.eq("owner", filters.owner);
  if (filters.from && config.columns.includes("due_date")) query = query.gte("due_date", filters.from);
  if (filters.to && config.columns.includes("due_date")) query = query.lte("due_date", filters.to);
  if (moduleKey === "users") {
    if (filters.role) query = query.eq("role", filters.role);
    if (filters.position) query = query.ilike("position", `%${filters.position.replace(/[%_\\]/g, "")}%`);
    if (filters.status === "active" || filters.status === "inactive") query = query.eq("is_active", filters.status === "active");
  }

  const selectedPromise = filters.edit
    ? db.from(config.table).select([...new Set([recordKey, ...config.columns, ...config.fields.map(f => f.key), ...(config.project ? ["project_id"] : []), ...(["tasks", "projects", "profiles", "disciplines"].includes(config.table) ? ["updated_at"] : [])])].join(",")).eq(recordKey, filters.edit).maybeSingle()
    : Promise.resolve(null);
  const createPromise = config.readOnly ? Promise.resolve(false) : hasPermission(moduleKey === "settings" ? "settings.manage" : `${config.permission}.create`, config.admin ? null : project, filters.discipline || null);
  const pageSize = moduleKey === "tasks" ? 10 : 25;
  const [choices, records, selectedResult, createAllowed] = await Promise.all([
    choicesPromise,
    query.range((page - 1) * pageSize, page * pageSize - 1),
    selectedPromise,
    createPromise,
  ]);
  if (records.error) throw new Error(records.error.message);

  const rows = (records.data ?? []) as unknown as DataRow[];
  const taskSummary = moduleKey === "tasks" ? {
    total: records.count ?? rows.length,
    in_progress: rows.filter((row) => row.status === "in_progress").length,
    completed: rows.filter((row) => row.status === "completed" || row.status === "approved").length,
    not_started: rows.filter((row) => row.status === "not_started").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
  } : null;
  const selected = selectedResult?.data as unknown as DataRow | null;
  if (filters.edit) {
    if (selectedResult?.error) throw new Error(selectedResult.error.message);
    if (!selected) notFound();
  }

  const scopedProject = moduleKey === "projects" && selected
    ? String(selected.id)
    : (project ?? (selected?.project_id ? String(selected.project_id) : null));

  let editable = false;
  let canCreate = false;
  if (config.readOnly) {
    editable = false;
  } else if (moduleKey === "tasks" && selected && profile.role !== "admin") {
    editable = profile.role !== "super_admin" && String(selected.owner ?? "") === user.id && await hasPermission("tasks.update", scopedProject, String(selected.discipline_id));
  } else {
    editable = selected ? await hasPermission(moduleKey === "settings" ? "settings.manage" : `${config.permission}.update`, config.admin ? null : scopedProject, String(selected.discipline_id ?? filters.discipline ?? "") || null) : createAllowed;
    canCreate = createAllowed;
  }

  if (moduleKey === "tasks" && selected && profile.role !== "admin") canCreate = false;

  const contributors = moduleKey === "projects" && selected
    ? await db.from("project_disciplines").select("discipline_id").eq("project_id", String(selected.id)).eq("is_active", true)
    : null;
  if (contributors?.error) throw new Error(contributors.error.message);

  const link = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ ...filters, ...extra }).filter(([, value]) => !!value)) as Record<string, string>,
    );
    return `/portal/${moduleKey}?${qs}`;
  };

  return (
    <>
      <div className={moduleKey === "users" ? "platform-heading employee-page-heading" : "platform-heading"}>
        <div>
          {moduleKey !== "users" && <p className="page-crumb">Project Monitor <span>/</span> {config.title}</p>}
          <h1>{config.title}</h1>
          <p>{moduleKey === "users" ? "Manage team members, their roles and access. Create new accounts and monitor activity." : moduleKey === "tasks" ? "Monitor and manage all project tasks in one place." : `${records.count ?? 0} accessible records · page ${page}`}</p>
        </div>
        <div className="heading-actions">
          {moduleKey !== "users" && canCreate && (!config.project || project) && (
            <Link className="button primary" href={link({ new: "1", edit: "" })}>+ {moduleKey === "projects" ? "New Project" : moduleKey === "tasks" ? "Create Task" : moduleKey === "teams" ? "Assign Employee" : "New Record"}</Link>
          )}
        </div>
      </div>

      {moduleKey === "tasks" && taskSummary && (
        <section className="task-kpi-grid" aria-label="Task summary">
          {[
            ["Total Tasks", taskSummary.total, "▦", "blue"],
            ["In Progress", taskSummary.in_progress, "♧", "violet"],
            ["Completed", taskSummary.completed, "✓", "green"],
            ["Not Started", taskSummary.not_started, "◴", "amber"],
            ["Blocked", taskSummary.blocked, "×", "red"],
          ].map(([title, value, icon, tone]) => (
            <article className={`task-kpi ${tone}`} key={String(title)}>
              <span className="task-kpi-icon">{icon}</span>
              <div><strong>{value}</strong><span>{title}</span></div>
              <i className="task-kpi-spark" aria-hidden="true" />
            </article>
          ))}
        </section>
      )}

      {moduleKey === "users" ? (
        <details className="employee-filter-shell">
          <summary>
            <span>⌁</span>
            Filters
          </summary>
          <Form className="register-filters employee-filters" action={`/portal/${moduleKey}`}>
            {!config.admin && config.project && (
              <label>
                Project
                <select name="project" defaultValue={project ?? ""}>
                  <option value="">All accessible projects</option>
                  {choices.projects?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            )}
            <label>
              Search
              <input name="q" placeholder={moduleKey === "users" ? "Search by name, email or ID..." : `Search ${label(config.search).toLowerCase()}`} defaultValue={filters.q} />
            </label>
            {config.fields.find((field) => field.key === "status")?.options && (
              <label>
                Status
                <select name="status" defaultValue={filters.status ?? ""}>
                  <option value="">All statuses</option>
                  {config.fields.find((field) => field.key === "status")!.options!.map((statusValue) => <option key={statusValue} value={statusValue}>{label(statusValue)}</option>)}
                </select>
              </label>
            )}
            {config.columns.includes("discipline_id") && (
              <label>
                Discipline
                <select name="discipline" defaultValue={filters.discipline ?? ""}>
                  <option value="">All disciplines</option>
                  {choices.disciplines?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            )}
            {config.columns.includes("owner") && ["admin", "super_admin"].includes(profile.role) && (
              <label>
                Assignee
                <select name="owner" defaultValue={filters.owner ?? ""}>
                  <option value="">All employees</option>
                  {choices.profiles?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            )}
            {config.columns.includes("due_date") && (
              <>
                <label>Due from<input name="from" type="date" defaultValue={filters.from} /></label>
                <label>Due to<input name="to" type="date" defaultValue={filters.to} /></label>
              </>
            )}
            {moduleKey === "users" && (
              <>
                <label>Role<select name="role" defaultValue={filters.role ?? ""}><option value="">All roles</option>{choices.roles?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label>Position<input name="position" placeholder="All positions" defaultValue={filters.position} /></label>
                <label>Account status<select name="status" defaultValue={filters.status ?? ""}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              </>
            )}
            <button className="button secondary">Apply filters</button>
            <Link href={`/portal/${moduleKey}`}>Clear</Link>
          </Form>
        </details>
      ) : (
        <Form className="register-filters" action={`/portal/${moduleKey}`}>
          {!config.admin && config.project && (
            <label>
              Project
              <select name="project" defaultValue={project ?? ""}>
                <option value="">All accessible projects</option>
                {choices.projects?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          )}
          <label>
            Search
            <input name="q" placeholder={`Search ${label(config.search).toLowerCase()}`} defaultValue={filters.q} />
          </label>
          {config.fields.find((field) => field.key === "status")?.options && (
            <label>
              Status
              <select name="status" defaultValue={filters.status ?? ""}>
                <option value="">All statuses</option>
                {config.fields.find((field) => field.key === "status")!.options!.map((statusValue) => <option key={statusValue} value={statusValue}>{label(statusValue)}</option>)}
              </select>
            </label>
          )}
          {config.columns.includes("discipline_id") && (
            <label>
              Discipline
              <select name="discipline" defaultValue={filters.discipline ?? ""}>
                <option value="">All disciplines</option>
                {choices.disciplines?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          )}
          {config.columns.includes("owner") && ["admin", "super_admin"].includes(profile.role) && (
            <label>
              Assignee
              <select name="owner" defaultValue={filters.owner ?? ""}>
                <option value="">All employees</option>
                {choices.profiles?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          )}
          {config.columns.includes("due_date") && (moduleKey === "tasks" ? (
            <label>Due date<input name="to" type="date" defaultValue={filters.to} /></label>
          ) : (
            <>
              <label>Due from<input name="from" type="date" defaultValue={filters.from} /></label>
              <label>Due to<input name="to" type="date" defaultValue={filters.to} /></label>
            </>
          ))}
          {moduleKey === "users" && (
            <>
              <label>Role<select name="role" defaultValue={filters.role ?? ""}><option value="">All roles</option>{choices.roles?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label>Position<input name="position" defaultValue={filters.position} /></label>
              <label>Account status<select name="status" defaultValue={filters.status ?? ""}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </>
          )}
          <button className="button secondary">Apply filters</button>
          <Link href={`/portal/${moduleKey}`}>Clear</Link>
        </Form>
      )}

      {moduleKey === "users" && profile.role === "super_admin" && !selected && <AccountForm choices={choices} />}
      {(selected || filters.new) && !config.readOnly && (
        <RecordForm
          key={String(selected?.id ?? selected?.key ?? "new")}
          moduleKey={moduleKey}
          row={selected}
          project={scopedProject}
          choices={choices}
          editable={editable || (!selected && canCreate)}
          projectAdmin={profile.role === "admin"}
          contributorIds={contributors?.data?.map(d => d.discipline_id) ?? []}
        />
      )}

      <div className={moduleKey === "tasks" ? "register-card table-wrap task-register-card" : moduleKey === "users" ? "register-card employee-list-card" : "register-card table-wrap"}>
        {moduleKey === "users" ? (
          <>
            <div className="employee-list-head">
              <div className="employee-list-title">
                <span className="employee-list-icon" aria-hidden="true">♙</span>
                <div>
                  <h2>Employees ({records.count ?? 0})</h2>
                  <p>View and manage all team members in your organization.</p>
                </div>
              </div>
            </div>
            <div className="employee-table-wrap">
              <table className="register-table employee-table">
                <thead><tr><th>#</th><th>Full Name</th><th>Email</th><th>Role</th><th>Discipline</th><th>Position</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((row, index) => {
                    const id = String(row.id ?? index);
                    const roleValue = String(row.role ?? "viewer");
                    const active = Boolean(row.is_active);
                    const lastLogin = row.last_login_at ? new Date(String(row.last_login_at)).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";
                    return (
                      <tr key={id}>
                        <td className="employee-index">{(page - 1) * pageSize + index + 1}</td>
                        <td className="employee-name-cell"><b>{String(row.full_name ?? "Unnamed employee")}</b></td>
                        <td className="employee-email-cell">{String(row.email ?? "—")}</td>
                        <td><span className={`role-badge ${roleValue}`}>{label(roleValue)}</span></td>
                        <td>{recordLabel("discipline_id", row.discipline_id, choices)}</td>
                        <td>{String(row.position ?? "—")}</td>
                        <td><span className={active ? "employee-status active" : "employee-status inactive"}><i />{active ? "Active" : "Inactive"}</span></td>
                        <td className="employee-last-login">{lastLogin}</td>
                        <td>
                          <div className="employee-row-actions">
                            <Link className="employee-details-button" prefetch={false} href={link({ edit: id, new: "" })}>Details</Link>
                            <ActionButton kind="reset" id={id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="employee-mobile-list">
              {rows.map((row, index) => {
                const id = String(row.id ?? index);
                const roleValue = String(row.role ?? "viewer");
                const active = Boolean(row.is_active);
                const lastLogin = row.last_login_at ? new Date(String(row.last_login_at)).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";
                return (
                  <article className="employee-mobile-card" key={id}>
                    <div className="employee-mobile-card-top">
                      <div>
                        <b>{String(row.full_name ?? "Unnamed employee")}</b>
                        <small>{String(row.email ?? "—")}</small>
                      </div>
                      <ActionButton kind="reset" id={id} />
                    </div>
                    <div className="employee-mobile-badges">
                      <span className={`role-badge ${roleValue}`}>{label(roleValue)}</span>
                      <span className={active ? "employee-status active" : "employee-status inactive"}><i />{active ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="employee-mobile-meta">
                      <span>{recordLabel("discipline_id", row.discipline_id, choices)}</span>
                      <span>{String(row.position ?? "—")}</span>
                    </div>
                    <div className="employee-mobile-footer">
                      <small>Last login: {lastLogin}</small>
                      <Link prefetch={false} href={link({ edit: id, new: "" })}>Details</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : moduleKey === "tasks" ? (
          <>
            <div className="task-table-head">
              <b>{records.count ?? 0} tasks found</b>
              <div><span>Sort by</span><button type="button">Due Date (Soonest)⌄</button></div>
            </div>
            <table className="register-table task-register-table">
              <thead><tr><th className="select-col">□</th><th>Task</th><th>Discipline</th><th>Project</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due date</th><th>Progress</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((row, index) => {
                  const id = String(row.id ?? index);
                  const assignee = recordLabel("owner", row.owner, choices);
                  const statusValue = String(row.status ?? "");
                  const priorityValue = String(row.priority ?? "");
                  const progress = Math.max(0, Math.min(100, Number(row.percent_complete ?? 0)));
                  return (
                    <tr key={id}>
                      <td className="select-col">□</td>
                      <td className="task-main-cell"><Link prefetch={false} href={link({ edit: id, new: "", project: String(row.project_id ?? project ?? "") })}>{String(row.task_name ?? "Untitled task")}</Link><small>{String(row.notes ?? "").slice(0, 72) || "No description added."}</small></td>
                      <td>{recordLabel("discipline_id", row.discipline_id, choices)}</td>
                      <td>{recordLabel("project_id", row.project_id, choices)}</td>
                      <td><span className="assignee-cell">{assignee !== "—" && <i>{assignee.split(/\s+/).slice(0,2).map((part: string) => part[0]).join("").toUpperCase()}</i>}{assignee}</span></td>
                      <td><span className={`status-badge ${statusValue}`}>{label(statusValue)}</span></td>
                      <td><span className={`priority-badge ${priorityValue}`}>◆ {label(priorityValue)}</span></td>
                      <td>{String(row.due_date ?? "—")}</td>
                      <td><span className="progress-cell"><b>{progress}%</b><i><em style={{ width: `${progress}%` }} /></i></span></td>
                      <td><Link className="task-more" prefetch={false} href={link({ edit: id, new: "", project: String(row.project_id ?? project ?? "") })}>⋮</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <table className="register-table">
            <thead><tr>{config.columns.map((column) => <th key={column}>{label(column)}</th>)}<th>Actions</th></tr></thead>
            <tbody>
              {rows.map((row, index) => {
                const id = String(row[config.key ?? "id"] ?? row.role_key ?? index);
                return (
                  <tr key={id + index}>
                    {config.columns.map((column) => <td key={column}>{column === "status" ? <span className={`status-badge ${String(row[column])}`}>{label(String(row[column]))}</span> : recordLabel(column, row[column], choices)}</td>)}
                    <td>
                      <div className="row-actions">
                        {!config.readOnly && moduleKey !== "role_permissions" && <Link prefetch={false} href={link({ edit: id, new: "", project: config.project ? String(row.project_id) : (project ?? "") })}>Details</Link>}
                        {moduleKey === "projects" && <Link href={`/portal/tasks?project=${id}`}>Open tasks</Link>}
                        {moduleKey === "projects" && profile.role === "admin" && <Link href={`/portal/teams?project=${id}`}>Manage team</Link>}
                        {moduleKey === "users" && <ActionButton kind="reset" id={id} />}
                        {moduleKey === "notifications" && !row.read_at && <ActionButton kind="read" id={id} />}
                        {config.removable && <ActionButton kind="remove" moduleKey={moduleKey} id={id} extra={String(row.permission_key ?? "")} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!rows.length && <div className="empty-board"><h2>No records found</h2><p>There are no monitoring records matching the current filters.</p></div>}
      </div>

      <nav className="pagination" aria-label="Pagination">
        {page > 1 && <Link href={link({ page: String(page - 1) })}>← Previous</Link>}
        <span>Page {page} · {records.count ?? 0} records</span>
        {page * pageSize < (records.count ?? 0) && <Link href={link({ page: String(page + 1) })}>Next →</Link>}
      </nav>
    </>
  );
}
