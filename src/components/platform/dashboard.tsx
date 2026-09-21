import Link from "next/link";
import { session } from "@/lib/platform/auth";

export default async function Dashboard({
  admin = false,
}: {
  admin?: boolean;
}) {
  const { db, profile, user } = await session();
  const today = new Date().toISOString().slice(0, 10);
  const dashboard = await db.rpc("dashboard_home", { include_activity: admin });
  if (dashboard.error) throw new Error(dashboard.error.message);

  const home = dashboard.data as {
    home_discipline: string | null;
    metrics: {
      counts: number[];
      organization: {
        total_users: number;
        active_projects: number;
        project_status: { status: string; count: number }[];
        discipline_projects: { name: string; count: number }[];
      };
      disciplines: { name: string; tasks: number; progress: number }[];
    };
    recent_progress: { id: string; task_id: string; field_changed: string; old_value: string | null; new_value: string | null; changed_at: string }[];
    deliverables: { id: string; title: string; status: string; project_id: string; due_date: string | null }[];
    milestones: { id: string; name: string; due_date: string | null; status: string; project_id: string }[];
    tasks: { id: string; task_name: string; due_date: string | null; status: string; project_id: string; percent_complete: number }[];
    projects: { id: string; name: string; status: string; target_date: string | null }[];
    notifications: { id: string; title: string; created_at: string }[];
    activity: { id: string; action: string; entity: string; created_at: string }[];
  };

  const data = home.metrics;
  const recentProgress = admin ? null : home.recent_progress;
  const mine = home.deliverables;
  const milestones = home.milestones;
  const work = home.tasks;
  const projects = home.projects;
  const notifications = home.notifications;
  const activity = admin ? home.activity : null;
  const results = data.counts.map((count) => ({ count }));
  const aggregate = data.organization;
  const disciplineProgress = data.disciplines;
  const taskCount = disciplineProgress.reduce((sum, d) => sum + Number(d.tasks), 0);
  const completion = taskCount
    ? Math.round(
        disciplineProgress.reduce(
          (sum, d) => sum + Number(d.tasks) * Number(d.progress),
          0,
        ) / taskCount,
      )
    : 0;

  const canCreateTask = !admin && ["admin","employee","team_member","discipline_lead","project_architect","project_manager"].includes(profile.role);

  const kpis = [
    { label: "Projects", value: results[0]?.count ?? 0, icon: "▦", tone: "blue", hint: `${aggregate.active_projects} active` },
    { label: "Overdue", value: results[1]?.count ?? 0, icon: "!", tone: "red", hint: "Needs attention" },
    { label: "Open RFIs", value: results[2]?.count ?? 0, icon: "?", tone: "violet", hint: "Waiting for response" },
    { label: "Critical", value: results[3]?.count ?? 0, icon: "◆", tone: "amber", hint: "High priority" },
    { label: "For Approval", value: results[4]?.count ?? 0, icon: "✓", tone: "green", hint: "Ready for review" },
  ];

  return (
    <>
      <div className="platform-heading dashboard-heading">
        <div>
          <p className="page-crumb">
            {admin ? "Control Center" : "Project Monitor"} <span>/</span> Overview
          </p>
          <h1>{admin ? "Control center" : "Overview"}</h1>
          <p>
            {admin
              ? "Manage people, access, disciplines, and system settings from one place."
              : profile.role === "admin"
                ? "See project health, assign work, and keep the team moving."
                : `Your projects, priorities, and progress in ${home.home_discipline ?? "your assigned discipline"}.`}
          </p>
        </div>
        <div className="heading-actions">
          {canCreateTask && (
            <Link className="button primary" href="/portal/board">+ Add Task</Link>
          )}
          <Link className="button secondary" href="/portal/projects">Projects</Link>
        </div>
      </div>

      <section className="task-kpi-grid dashboard-kpis" aria-label="Workspace summary">
        {kpis.map((item) => (
          <article className={`task-kpi ${item.tone}`} key={item.label}>
            <span className="task-kpi-icon">{item.icon}</span>
            <div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </div>
            <i className="task-kpi-spark" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="overview-main-grid">
        <article className="register-card overview-progress-card">
          <div className="overview-card-head">
            <div>
              <h2>Project progress</h2>
              <p>Current progress across your visible disciplines.</p>
            </div>
            <strong className="overview-completion">{completion}%</strong>
          </div>

          {disciplineProgress.length ? (
            <div className="overview-progress-list">
              {disciplineProgress.slice(0, 8).map((discipline) => {
                const progress = Math.max(0, Math.min(100, Number(discipline.progress)));
                return (
                  <div className="overview-progress-row" key={discipline.name}>
                    <div>
                      <b>{discipline.name}</b>
                      <small>{discipline.tasks} tasks</small>
                    </div>
                    <span>{progress}%</span>
                    <i><em style={{ width: `${progress}%` }} /></i>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overview-empty">
              <b>No progress data yet</b>
              <p>Progress appears here as tasks are created and updated.</p>
            </div>
          )}
        </article>

        <article className="register-card overview-work-card">
          <div className="overview-card-head">
            <div>
              <h2>{admin ? "Workspace" : "My work"}</h2>
              <p>{admin ? "Quick system snapshot." : "What needs your attention now."}</p>
            </div>
          </div>
          <div className="overview-mini-grid">
            <div><span>Open tasks</span><strong>{work.length}</strong></div>
            <div><span>{admin ? "Active people" : "Team members"}</span><strong>{results[5]?.count ?? 0}</strong></div>
            <div><span>Updates</span><strong>{notifications.length}</strong></div>
          </div>
          {!admin && (
            <Link className="overview-primary-link" href={`/portal/tasks?owner=${user.id}`}>
              Open My Tasks <span>→</span>
            </Link>
          )}
          <p className="overview-footnote">
            {notifications.length
              ? `${notifications.length} recent unread notification${notifications.length === 1 ? "" : "s"}`
              : "You're all caught up."}
          </p>
        </article>
      </section>

      <div className="dashboard-grid dashboard-grid-consistent">
        {recentProgress && (
          <section className="register-card">
            <div className="overview-card-head compact">
              <div>
                <h2>Recent changes</h2>
                <p>Latest task updates in your workspace.</p>
              </div>
            </div>
            {recentProgress.length ? (
              recentProgress.map((h) => (
                <Link className="summary-row dashboard-row" key={h.id} href={`/portal/tasks?edit=${h.task_id}`}>
                  <b>{h.field_changed.replaceAll("_", " ")}</b>
                  <span>{h.old_value ?? "Empty"} → {h.new_value ?? "Empty"}</span>
                  <small>{new Date(h.changed_at).toLocaleString()}</small>
                </Link>
              ))
            ) : (
              <p>No recent progress changes.</p>
            )}
          </section>
        )}

        <section className="register-card">
          <div className="overview-card-head compact">
            <div><h2>Projects</h2><p>Your accessible project list.</p></div>
            <Link href="/portal/projects">View all →</Link>
          </div>
          {projects.length ? (
            projects.map((p) => (
              <Link className="summary-row dashboard-row" key={p.id} href={`/portal/projects?edit=${p.id}`}>
                <b>{p.name}</b>
                <span className={`status-badge ${p.status}`}>{p.status.replaceAll("_", " ")}</span>
                <small>Target {p.target_date ?? "Not set"}</small>
              </Link>
            ))
          ) : (
            <p>No projects assigned yet.</p>
          )}
        </section>

        <section className="register-card">
          <div className="overview-card-head compact">
            <div><h2>Upcoming milestones</h2><p>Next project checkpoints.</p></div>
          </div>
          {milestones.length ? (
            milestones.map((m) => (
              <Link className="summary-row dashboard-row" key={m.id} href={`/portal/milestones?project=${m.project_id}&edit=${m.id}`}>
                <b>{m.name}</b>
                <span className={m.due_date && m.due_date < today ? "overdue" : ""}>{m.due_date ?? "No target date"}</span>
              </Link>
            ))
          ) : (
            <p>No upcoming milestones.</p>
          )}
        </section>

        <section className="register-card">
          <div className="overview-card-head compact">
            <div><h2>What I need to do</h2><p>Your current assigned tasks.</p></div>
          </div>
          {work.length ? (
            work.map((t) => (
              <Link className="summary-row dashboard-row" key={t.id} href={`/portal/tasks?project=${t.project_id}&edit=${t.id}`}>
                <b>{t.task_name}</b>
                <span className={`status-badge ${t.status}`}>{t.status.replaceAll("_", " ")}</span>
                <strong>{t.percent_complete}%</strong>
                <small>{t.due_date ?? "No due date"}</small>
              </Link>
            ))
          ) : (
            <p>No open tasks assigned to you.</p>
          )}
        </section>

        <section className="register-card">
          <div className="overview-card-head compact">
            <div><h2>Updates</h2><p>Recent notifications.</p></div>
            <Link href="/portal/notifications">View all →</Link>
          </div>
          {notifications.length ? (
            notifications.map((n) => (
              <p className="summary-row dashboard-row" key={n.id}>
                <b>{n.title}</b>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </p>
            ))
          ) : (
            <p>You are up to date.</p>
          )}
        </section>

        <section className="register-card">
          <div className="overview-card-head compact">
            <div><h2>My deliverables</h2><p>Deliverables currently visible to you.</p></div>
          </div>
          {mine.length ? (
            mine.map((d) => (
              <Link className="summary-row dashboard-row" key={d.id} href={`/portal/deliverables?project=${d.project_id}&edit=${d.id}`}>
                <b>{d.title}</b>
                <span className={`status-badge ${d.status}`}>{d.status.replaceAll("_", " ")}</span>
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
              <div className="overview-card-head compact"><div><h2>Projects by status</h2><p>Current portfolio distribution.</p></div></div>
              {aggregate.project_status.map((s) => (
                <p className="summary-row dashboard-row" key={s.status}>
                  <b>{s.status.replaceAll("_", " ")}</b><span>{s.count}</span>
                </p>
              ))}
            </section>
            <section className="register-card">
              <div className="overview-card-head compact"><div><h2>Projects by discipline</h2><p>Discipline coverage.</p></div></div>
              {aggregate.discipline_projects.map((d) => (
                <p className="summary-row dashboard-row" key={d.name}>
                  <b>{d.name}</b><span>{d.count}</span>
                </p>
              ))}
            </section>
          </>
        )}

        {activity && (
          <section className="register-card">
            <div className="overview-card-head compact">
              <div><h2>Recent activity</h2><p>Latest administration events.</p></div>
              <Link href="/portal/audit">Audit →</Link>
            </div>
            {activity.length ? (
              activity.map((a) => (
                <p className="summary-row dashboard-row" key={a.id}>
                  <b>{a.action} · {a.entity}</b>
                  <small>{a.created_at}</small>
                </p>
              ))
            ) : (
              <p>No recent activity.</p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
