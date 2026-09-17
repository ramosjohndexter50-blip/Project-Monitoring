import Link from "next/link";
import { notFound } from "next/navigation";
import { session, permission } from "@/lib/platform/auth";
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
    await permission("admin.access");
    await permission(`${config.permission}.view`);
  }

  const project = filters.project || null;
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page ?? "1", 10) || 1));

  const choicesPromise = choicesFor(db, config, project);
  let query = db.from(config.table).select("*", { count: "exact" });
  query = query.order(moduleKey === "notifications" ? "created_at" : (config.key ?? "id"), {
    ascending: moduleKey !== "notifications",
  });

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

  const [choices, records] = await Promise.all([
    choicesPromise,
    query.range((page - 1) * 25, page * 25 - 1),
  ]);
  if (records.error) throw new Error(records.error.message);

  const rows = (records.data ?? []) as DataRow[];
  let selected: DataRow | null = null;
  if (filters.edit) {
    const selectedResult = await db.from(config.table).select("*").eq(config.key ?? "id", filters.edit).maybeSingle();
    if (selectedResult.error) throw new Error(selectedResult.error.message);
    if (!selectedResult.data) notFound();
    selected = selectedResult.data;
  }

  const scopedProject = moduleKey === "projects" && selected
    ? String(selected.id)
    : (project ?? (selected?.project_id ? String(selected.project_id) : null));

  let editable = false;
  let canCreate = false;
  if (config.readOnly) {
    editable = false;
  } else if (moduleKey === "tasks" && selected && profile.role !== "super_admin") {
    editable = String(selected.owner ?? "") === user.id;
  } else {
    const [rights, creation] = await Promise.all([
      db.rpc("has_permission", {
        permission: `${config.permission}.${selected ? "update" : "create"}`,
        project: config.admin ? null : scopedProject,
        discipline: selected?.discipline_id ?? filters.discipline ?? null,
      }),
      db.rpc("has_permission", {
        permission: `${config.permission}.create`,
        project: config.admin ? null : scopedProject,
        discipline: filters.discipline ?? null,
      }),
    ]);
    editable = rights.data === true;
    canCreate = creation.data === true;
  }

  if (moduleKey === "tasks" && profile.role === "super_admin") canCreate = true;
  if (moduleKey === "tasks" && selected && profile.role !== "super_admin") canCreate = false;

  const link = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ ...filters, ...extra }).filter(([, value]) => !!value)) as Record<string, string>,
    );
    return `/portal/${moduleKey}?${qs}`;
  };

  return (
    <>
      <div className="platform-heading">
        <div>
          <p className="eyebrow">{config.admin ? "CONTROL CENTER" : "PROJECT TASK MONITORING"}</p>
          <h1>{config.title}</h1>
          <p>{records.count ?? 0} accessible records · page {page}</p>
        </div>
        <div className="heading-actions">
          {canCreate && (!config.project || project) && (
            <Link className="button primary" href={link({ new: "1", edit: "" })}>+ New task</Link>
          )}
        </div>
      </div>

      <form className="register-filters" method="get">
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
        {config.columns.includes("owner") && profile.role === "super_admin" && (
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
            <label>Position<input name="position" defaultValue={filters.position} /></label>
            <label>Account status<select name="status" defaultValue={filters.status ?? ""}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          </>
        )}
        <button className="button secondary">Apply filters</button>
        <Link href={`/portal/${moduleKey}`}>Clear</Link>
      </form>

      {moduleKey === "users" && profile.role === "super_admin" && <AccountForm choices={choices} />}
      {(selected || filters.new) && !config.readOnly && (
        <RecordForm
          key={String(selected?.id ?? selected?.key ?? "new")}
          moduleKey={moduleKey}
          row={selected}
          project={scopedProject}
          choices={choices}
          editable={editable || (!selected && canCreate)}
          superAdmin={profile.role === "super_admin"}
        />
      )}

      <div className="register-card table-wrap">
        <table className="register-table">
          <thead><tr>{config.columns.map((column) => <th key={column}>{label(column)}</th>)}<th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const id = String(row[config.key ?? "id"] ?? row.role_key ?? index);
              return (
                <tr key={id + index}>
                  {config.columns.map((column) => <td key={column}>{column === "status" ? <span className="status-badge">{label(String(row[column]))}</span> : recordLabel(column, row[column], choices)}</td>)}
                  <td>
                    <div className="row-actions">
                      {!config.readOnly && <Link href={link({ edit: id, new: "", project: config.project ? String(row.project_id) : (project ?? "") })}>Details</Link>}
                      {moduleKey === "projects" && <Link href={`/portal/tasks?project=${id}`}>Open tasks</Link>}
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
        {!rows.length && <div className="empty-board"><h2>No records found</h2><p>There are no monitoring records matching the current filters.</p></div>}
      </div>

      <nav className="pagination" aria-label="Pagination">
        {page > 1 && <Link href={link({ page: String(page - 1) })}>← Previous</Link>}
        <span>Page {page} · {records.count ?? 0} records</span>
        {page * 25 < (records.count ?? 0) && <Link href={link({ page: String(page + 1) })}>Next →</Link>}
      </nav>
    </>
  );
}
