import Link from "next/link";
import { session, hasPermission } from "@/lib/platform/auth";
export default async function Dashboard({
  admin = false,
}: {
  admin?: boolean;
}) {
  const { db, profile, user } = await session();
  const today = new Date().toISOString().slice(0, 10);
  const [homeDiscipline, recentProgress, metrics, mine, activity, milestones, work, projects, notifications] = await Promise.all([
    profile.discipline_id ? db.from("disciplines").select("name").eq("id", profile.discipline_id).maybeSingle() : null,
    !admin ? db.from("task_history").select("id,task_id,field_changed,old_value,new_value,changed_at").order("changed_at", { ascending: false }).limit(8) : null,
    db.rpc("dashboard_metrics"),
    db.from("deliverables").select("id,title,status,project_id,due_date").eq("owner", user.id).not("status", "in", "(approved,issued)").order("due_date", { nullsFirst: false }).limit(8),
    hasPermission("audit.view").then(allowed => allowed ? db.from("audit_logs").select("id,action,entity,created_at").order("created_at", { ascending: false }).limit(8) : null),
    db.from("milestones").select("id,name,due_date,status,project_id").neq("status", "completed").order("due_date", { nullsFirst: false }).limit(8),
    db.from("tasks").select("id,task_name,due_date,status,project_id,percent_complete").eq("owner", user.id).not("status", "in", "(completed,cancelled)").order("due_date", { nullsFirst: false }).limit(8),
    db.from("projects").select("id,name,status,target_date").order("updated_at", { ascending: false }).limit(8),
    db.from("notifications").select("id,title,created_at").eq("user_id", user.id).is("read_at", null).order("created_at", { ascending: false }).limit(6),
  ]);
  for (const result of [homeDiscipline, recentProgress, metrics, mine, milestones, work, projects, notifications]) {
    if (result?.error) throw new Error(result.error.message);
  }
  const data = metrics.data as {
    counts: number[];
    organization: {
      total_users: number; active_projects: number;
      project_status: { status: string; count: number }[];
      discipline_projects: { name: string; count: number }[];
    };
    disciplines: { name: string; tasks: number; progress: number }[];
  };
  const results = data.counts.map(count => ({ count }));
  const aggregate = data.organization;
  const disciplineProgress = data.disciplines;
  return (
    <>
      <div className="platform-heading">
        <div>
          <p className="eyebrow">
            {admin
              ? "ADMINISTRATION / CONTROL CENTER"
              : "CONSULTANCY OPERATIONS"}
          </p>
          <h1>
            {admin
              ? "Super Admin Control Center"
              : (homeDiscipline?.data?.name ?? "Discipline assignment pending")}
          </h1>
          {!admin && (
            <p>
              You are viewing{" "}
              {homeDiscipline?.data?.name ?? "your assigned discipline"}. Access
              follows your discipline and project assignments.
            </p>
          )}
          <p>
            {profile.full_name ?? "Welcome"} ·{" "}
            {profile.role.replaceAll("_", " ")} · Results reflect your
            authorized projects.
          </p>
        </div>
        <Link className="button primary" href="/portal/projects">
          Open project register
        </Link>
      </div>
      <section className="metric-grid">
        {[
          "Accessible projects",
          "Overdue tasks",
          "Open RFIs",
          "Critical issues",
          "Pending approvals",
          admin ? "Active users" : "Visible active people",
        ].map((label, i) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{results[i].count ?? 0}</strong>
          </article>
        ))}
      </section>
      <p className="data-note">
        {aggregate.active_projects} active projects
        {admin ? ` ? ${aggregate.total_users} total users` : ""}
      </p>
      <div className="dashboard-grid">
        {recentProgress && (
          <section className="register-card">
            <h2>Recent discipline activity</h2>
            {recentProgress.data?.length ? (
              recentProgress.data.map((h) => (
                <p key={h.id}>
                  <Link href={`/portal/tasks?edit=${h.task_id}`}>
                    {h.field_changed.replaceAll("_", " ")}
                  </Link>
                  : {h.old_value ?? "Empty"} → {h.new_value ?? "Empty"}
                  <small> · {new Date(h.changed_at).toLocaleString()}</small>
                </p>
              ))
            ) : (
              <p>No recent progress changes.</p>
            )}
          </section>
        )}
        <section className="register-card">
          <h2>Project portfolio</h2>
          {projects.data?.length ? (
            projects.data.map((p) => (
              <Link
                className="summary-row"
                key={p.id}
                href={`/portal/projects?edit=${p.id}`}
              >
                <b>{p.name}</b>
                <span className="status-badge">
                  {p.status.replaceAll("_", " ")}
                </span>
                <small>Target {p.target_date ?? "Not set"}</small>
              </Link>
            ))
          ) : (
            <p>No projects assigned yet.</p>
          )}
        </section>
        <section className="register-card">
          <h2>Milestones to watch</h2>
          {milestones.data?.length ? (
            milestones.data.map((m) => (
              <Link
                className="summary-row"
                key={m.id}
                href={`/portal/milestones?project=${m.project_id}&edit=${m.id}`}
              >
                <b>{m.name}</b>
                <span
                  className={m.due_date && m.due_date < today ? "overdue" : ""}
                >
                  {m.due_date ?? "No target date"}
                </span>
              </Link>
            ))
          ) : (
            <p>No upcoming milestones.</p>
          )}
        </section>
        <section className="register-card">
          <h2>My next actions</h2>
          {work.data?.length ? (
            work.data.map((t) => (
              <Link
                className="summary-row"
                key={t.id}
                href={`/portal/tasks?project=${t.project_id}&edit=${t.id}`}
              >
                <b>{t.task_name}</b>
                <span>{t.status.replaceAll("_", " ")}</span>
                <strong>{t.percent_complete}%</strong>
                <small>{t.due_date ?? "No due date"}</small>
              </Link>
            ))
          ) : (
            <p>No open tasks assigned to you.</p>
          )}
        </section>
        <section className="register-card">
          <h2>Notifications</h2>
          {notifications.data?.length ? (
            notifications.data.map((n) => (
              <p className="summary-row" key={n.id}>
                {n.title}
              </p>
            ))
          ) : (
            <p>You are up to date.</p>
          )}
          <Link href="/portal/notifications">Open notification center →</Link>
        </section>
        <section className="register-card">
          <h2>Discipline progress</h2>
          {disciplineProgress.length ? (
            disciplineProgress.map((d) => (
              <div className="summary-row" key={d.name}>
                <b>{d.name}</b>
                <span>
                  {d.progress}% ? {d.tasks} tasks
                </span>
                <progress value={d.progress} max={100} />
              </div>
            ))
          ) : (
            <p>No discipline work recorded yet.</p>
          )}
          <Link href="/portal/reports">Team workload & reports ?</Link>
        </section>
        <section className="register-card">
          <h2>My deliverables</h2>
          {mine.data?.length ? (
            mine.data.map((d) => (
              <Link
                className="summary-row"
                key={d.id}
                href={`/portal/deliverables?project=${d.project_id}&edit=${d.id}`}
              >
                <b>{d.title}</b>
                <span>{d.status.replaceAll("_", " ")}</span>
                <small>{d.due_date ?? "No due date"}</small>
              </Link>
            ))
          ) : (
            <p>No open deliverables assigned to you.</p>
          )}
        </section>
        {admin && (
          <>
            <section className="register-card">
              <h2>Projects by phase / status</h2>
              {aggregate.project_status.map((s) => (
                <p className="summary-row" key={s.status}>
                  <b>{s.status.replaceAll("_", " ")}</b>
                  <span>{s.count}</span>
                </p>
              ))}
            </section>
            <section className="register-card">
              <h2>Projects by discipline</h2>
              {aggregate.discipline_projects.map((d) => (
                <p className="summary-row" key={d.name}>
                  <b>{d.name}</b>
                  <span>{d.count}</span>
                </p>
              ))}
            </section>
          </>
        )}
        {activity && (
          <section className="register-card">
            <h2>Recent activity</h2>
            {activity.error ? (
              <p>Activity could not be loaded.</p>
            ) : (
              activity.data?.map((a) => (
                <p className="summary-row" key={a.id}>
                  <b>
                    {a.action} ? {a.entity}
                  </b>
                  <small>{a.created_at}</small>
                </p>
              ))
            )}
            <Link href="/portal/audit">Audit & user activity ?</Link>
          </section>
        )}
      </div>
      <p className="data-note">
        Database queries succeeded. This indicates data connectivity, not a
        complete infrastructure health check.
      </p>
    </>
  );
}
