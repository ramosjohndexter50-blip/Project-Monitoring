import Link from "next/link";
import { notFound } from "next/navigation";
import { session, permission } from "@/lib/platform/auth";
import { modules, label, type DataRow } from "@/lib/platform/modules";
import { choicesFor, recordLabel } from "@/lib/platform/queries";
import {
  RecordForm,
  ActionButton,
  AccountForm,
  ApprovalForm,
  RelatedForm,
  RfiResponse,
} from "@/components/platform/forms";
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
  const { db, user } = await session();
  if (config.admin) {
    await permission("admin.access");
    await permission(
      config.permission === "settings"
        ? "settings.manage"
        : `${config.permission}.view`,
    );
  }
  const project = filters.project || null;
  if (moduleKey === "notifications") {
    const refresh = await db.rpc("refresh_deadline_notifications");
    if (refresh.error) throw new Error(refresh.error.message);
  }
  const choices = await choicesFor(
    db,
    moduleKey === "approvals"
      ? {
          ...config,
          fields: [
            {
              key: "deliverable_id",
              label: "Deliverable",
              reference: "deliverables",
            },
            {
              key: "workflow_id",
              label: "Workflow",
              reference: "approval_workflows",
            },
          ],
        }
      : config,
    project,
  );
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(filters.page ?? "1", 10) || 1),
  );
  let query = db
    .from(config.table)
    .select("*", { count: "exact" })
    .order(
      ["notifications", "audit", "approvals"].includes(moduleKey)
        ? "created_at"
        : (config.key ??
            (moduleKey === "role_permissions" ? "role_key" : "id")),
      {
        ascending: !["notifications", "audit", "approvals"].includes(moduleKey),
      },
    );
  if (config.project && project) query = query.eq("project_id", project);
  if (moduleKey === "projects" && project) query = query.eq("id", project);
  if (filters.q)
    query = query.ilike(
      config.search,
      `%${filters.q.replace(/[%_\\]/g, "").slice(0, 100)}%`,
    );
  if (filters.status && config.columns.includes("status"))
    query = query.eq("status", filters.status);
  if (filters.discipline && config.columns.includes("discipline_id"))
    query = query.eq("discipline_id", filters.discipline);
  if (filters.owner && config.columns.includes("owner"))
    query = query.eq("owner", filters.owner);
  if (filters.from && config.columns.includes("due_date"))
    query = query.gte("due_date", filters.from);
  if (filters.to && config.columns.includes("due_date"))
    query = query.lte("due_date", filters.to);

  const records = await query.range((page - 1) * 25, page * 25 - 1);
  if (records.error) throw new Error(records.error.message);
  const rows = (records.data ?? []) as DataRow[];
  let selected: DataRow | null = null;
  if (filters.edit) {
    const row = await db
      .from(config.table)
      .select("*")
      .eq(config.key ?? "id", filters.edit)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data) notFound();
    selected = row.data;
  }
  const scopedProject =
    moduleKey === "projects" && selected
      ? String(selected.id)
      : (project ??
        (selected?.project_id ? String(selected.project_id) : null));
  const permissionPrefix =
    config.permission === "settings"
      ? "settings.manage"
      : `${config.permission}.${selected ? "update" : "create"}`;
  const rights = await db.rpc("has_permission", {
    permission: permissionPrefix,
    project: config.admin ? null : scopedProject,
    discipline: selected?.discipline_id ?? filters.discipline ?? null,
  });
  const editable = !config.readOnly && rights.data === true;
  const link = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...filters, ...extra }).filter(([, v]) => !!v),
      ) as Record<string, string>,
    );
    return `/portal/${moduleKey}?${qs}`;
  };
  return (
    <>
      <div className="platform-heading">
        <div>
          <p className="eyebrow">
            {config.admin ? "CONTROL CENTER" : "PROJECT OPERATIONS"}
          </p>
          <h1>{config.title}</h1>
          <p>
            {records.count ?? 0} accessible records · page {page}
          </p>
        </div>
        <div className="heading-actions">
          {moduleKey !== "users" &&
            editable &&
            (!config.project || project) && (
              <Link
                className="button primary"
                href={link({ new: "1", edit: "" })}
              >
                + New record
              </Link>
            )}
          {moduleKey === "workflows" && (
            <Link
              className="button secondary"
              href={`/portal/workflow_steps?project=${project ?? ""}`}
            >
              Configure reviewers
            </Link>
          )}
        </div>
      </div>
      <form className="register-filters" method="get">
        {!config.admin && (
          <label>
            Project
            <select name="project" defaultValue={project ?? ""}>
              <option value="">All accessible projects</option>
              {choices.projects?.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Search
          <input
            name="q"
            placeholder={`Search ${label(config.search).toLowerCase()}`}
            defaultValue={filters.q}
          />
        </label>
        {config.fields.find((f) => f.key === "status")?.options && (
          <label>
            Status
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">All statuses</option>
              {config.fields
                .find((f) => f.key === "status")!
                .options!.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
            </select>
          </label>
        )}
        {config.columns.includes("discipline_id") && (
          <label>
            Discipline
            <select name="discipline" defaultValue={filters.discipline ?? ""}>
              <option value="">All disciplines</option>
              {choices.disciplines?.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.columns.includes("owner") && (
          <label>
            Assignee
            <select name="owner" defaultValue={filters.owner ?? ""}>
              <option value="">All people</option>
              {choices.profiles?.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.columns.includes("due_date") && (
          <>
            <label>
              Due from
              <input name="from" type="date" defaultValue={filters.from} />
            </label>
            <label>
              Due to
              <input name="to" type="date" defaultValue={filters.to} />
            </label>
          </>
        )}
        <button className="button secondary">Apply filters</button>
        <Link href={`/portal/${moduleKey}`}>Clear</Link>
      </form>
      {config.project && !project && (
        <p className="data-note">
          Select a project to create records or configure its workflow. The list
          below includes only authorized records.
        </p>
      )}
      {moduleKey === "users" && <AccountForm />}
      {(selected || (filters.new && moduleKey !== "users")) &&
        !config.readOnly && (
          <RecordForm
            key={String(selected?.id ?? selected?.key ?? "new")}
            moduleKey={moduleKey}
            row={selected}
            project={scopedProject}
            choices={choices}
            editable={editable}
          />
        )}
      {moduleKey === "approvals" && project && (
        <ApprovalForm
          deliverables={choices.deliverables}
          workflows={choices.approval_workflows}
        />
      )}
      <div className="register-card table-wrap">
        <table className="register-table">
          <thead>
            <tr>
              {config.columns.map((column) => (
                <th key={column}>{label(column)}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const id = String(
                row[config.key ?? "id"] ?? row.role_key ?? index,
              );
              return (
                <tr key={id + index}>
                  {config.columns.map((column) => (
                    <td key={column}>
                      {column === "status" ? (
                        <span className="status-badge">
                          {label(String(row[column]))}
                        </span>
                      ) : (
                        recordLabel(column, row[column], choices)
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="row-actions">
                      {!config.readOnly && moduleKey !== "role_permissions" && (
                        <Link
                          href={link({
                            edit: id,
                            new: "",
                            project: config.project
                              ? String(row.project_id)
                              : (project ?? ""),
                          })}
                        >
                          Details
                        </Link>
                      )}
                      {moduleKey === "projects" && (
                        <Link href={`/portal/tasks?project=${id}`}>
                          Open project
                        </Link>
                      )}
                      {moduleKey === "documents" && (
                        <a
                          href={`/api/documents/${id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download
                        </a>
                      )}
                      {moduleKey === "users" && (
                        <ActionButton kind="reset" id={id} />
                      )}{" "}
                      {moduleKey === "notifications" && !row.read_at && (
                        <ActionButton kind="read" id={id} />
                      )}{" "}
                      {config.removable && (
                        <ActionButton
                          kind="remove"
                          moduleKey={moduleKey}
                          id={id}
                          extra={String(row.permission_key ?? "")}
                        />
                      )}{" "}
                      {moduleKey === "approvals" && (
                        <Link href={link({ edit: id })}>Review history</Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-board">
            <h2>No records found</h2>
            <p>
              Adjust the filters, or add your first record when you have access.
            </p>
          </div>
        )}
      </div>
      <nav className="pagination" aria-label="Pagination">
        {page > 1 && (
          <Link href={link({ page: String(page - 1) })}>← Previous</Link>
        )}
        <span>
          Page {page} · {records.count ?? 0} records
        </span>
        {page * 25 < (records.count ?? 0) && (
          <Link href={link({ page: String(page + 1) })}>Next →</Link>
        )}
      </nav>
      {selected && moduleKey === "rfis" && (
        <RfiResponse id={String(selected.id)} />
      )}
      {selected && ["tasks", "issues"].includes(moduleKey) && (
        <RelatedRecords
          moduleKey={moduleKey}
          row={selected}
          choices={choices}
        />
      )}
      {selected && moduleKey === "approvals" && (
        <ApprovalHistory id={String(selected.id)} userId={user.id} />
      )}
    </>
  );
}
async function RelatedRecords({
  moduleKey,
  row,
  choices,
}: {
  moduleKey: string;
  row: DataRow;
  choices: Awaited<ReturnType<typeof choicesFor>>;
}) {
  const { db } = await session();
  const task = moduleKey === "tasks";
  const comments = await db
    .from(task ? "task_comments" : "issue_comments")
    .select("id,body,author,created_at")
    .eq(task ? "task_id" : "issue_id", row.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (comments.error) throw new Error(comments.error.message);
  const history = task
    ? await db
        .from("task_history")
        .select("id,field_changed,old_value,new_value,changed_at")
        .eq("task_id", row.id)
        .order("changed_at", { ascending: false })
        .limit(50)
    : null;
  const dependencies = task
    ? await db
        .from("task_dependencies")
        .select("id,depends_on")
        .eq("task_id", row.id)
    : null;
  return (
    <section className="register-card">
      <h2>Coordination & activity</h2>
      <RelatedForm
        type={task ? "task_comment" : "issue_comment"}
        id={String(row.id)}
      />
      {comments.data.map((c) => (
        <article className="activity-entry" key={c.id}>
          <b>{recordLabel("user_id", c.author, choices)}</b>
          <p>{c.body}</p>
          <small>{c.created_at}</small>
        </article>
      ))}
      {task && (
        <>
          <RelatedForm
            type="dependency"
            id={String(row.id)}
            tasks={choices.tasks}
          />
          <h3>Predecessors</h3>
          {dependencies?.data?.map((d) => (
            <p key={d.id}>
              {choices.tasks?.find((t) => t.value === d.depends_on)?.label ??
                d.depends_on}
            </p>
          ))}
          <h3>Latest 50 field changes</h3>
          {history?.error ? (
            <p role="alert">Could not load history.</p>
          ) : (
            history?.data?.map((h) => (
              <p key={h.id}>
                {label(h.field_changed)}: {h.old_value ?? "—"} →{" "}
                {h.new_value ?? "—"} <small>{h.changed_at}</small>
              </p>
            ))
          )}
        </>
      )}
    </section>
  );
}
async function ApprovalHistory({ id, userId }: { id: string; userId: string }) {
  const { db } = await session();
  const steps = await db
    .from("approval_steps")
    .select("id,name,sequence,reviewer")
    .eq("approval_id", id)
    .order("sequence");
  if (steps.error) throw new Error(steps.error.message);
  const ids = steps.data.map((s) => s.id);
  const decisions = ids.length
    ? await db.from("approval_decisions").select("*").in("step_id", ids)
    : { data: [], error: null };
  if (decisions.error) throw new Error(decisions.error.message);
  const next = steps.data.find(
    (s) => !decisions.data?.some((d) => d.step_id === s.id),
  );
  return (
    <section className="register-card">
      <h2>Approval history</h2>
      {steps.data.map((s) => {
        const d = decisions.data?.find((d) => d.step_id === s.id);
        return (
          <article key={s.id} className="activity-entry">
            <b>
              {s.sequence}. {s.name}
            </b>
            <p>
              {d
                ? `${d.decision} · ${d.comments} · ${d.created_at}`
                : "Pending"}
            </p>
          </article>
        );
      })}
      {next?.reviewer === userId && <ApprovalForm approval={id} />}
    </section>
  );
}
