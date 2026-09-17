import Link from "next/link";
import { session } from "@/lib/platform/auth";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const { db } = await session();
  const projects = await db.from("projects").select("id,name").order("name");
  if (projects.error) throw new Error(projects.error.message);
  const result = await db.rpc("project_report", {
    target_project: project || null,
  });
  if (result.error) throw new Error(result.error.message);
  const data = result.data as {
    tasks: number;
    progress: number;
    overdue: number;
    disciplines: { name: string; tasks: number; progress: number }[];
    workload: { name: string; open_tasks: number }[];
    statuses: { status: string; count: number }[];
    rfis: { status: string; count: number }[];
    issues: { status: string; count: number }[];
    deliverables: { status: string; count: number }[];
  };
  return (
    <>
      <div className="platform-heading">
        <div>
          <p className="eyebrow">PROJECT INTELLIGENCE</p>
          <h1>Progress & workload reports</h1>
          <p>
            Computed from all authorized records, independent of register
            pagination.
          </p>
        </div>
      </div>
      <form className="register-filters">
        <label>
          Project
          <select name="project" defaultValue={project ?? ""}>
            <option value="">All accessible projects</option>
            {projects.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Apply</button>
      </form>
      <section className="metric-grid">
        <article>
          <span>Tasks</span>
          <strong>{data.tasks}</strong>
        </article>
        <article>
          <span>Average progress</span>
          <strong>{data.progress}%</strong>
        </article>
        <article>
          <span>Overdue tasks</span>
          <strong>{data.overdue}</strong>
        </article>
      </section>
      <div className="dashboard-grid">
        <section className="register-card">
          <h2>Discipline progress</h2>
          {data.disciplines.map((d) => (
            <div className="summary-row" key={d.name}>
              <b>{d.name}</b>
              <span>
                {d.progress}% · {d.tasks} tasks
              </span>
              <progress value={d.progress} max={100} />
            </div>
          ))}
        </section>
        <section className="register-card">
          <h2>Team workload</h2>
          {data.workload.map((w, i) => (
            <div className="summary-row" key={w.name + i}>
              <b>{w.name}</b>
              <span>{w.open_tasks} open tasks</span>
            </div>
          ))}
        </section>
        {[
          ["Tasks", data.statuses],
          ["RFIs", data.rfis],
          ["Issues", data.issues],
          ["Deliverables", data.deliverables],
        ].map(([title, rows]) => (
          <section key={String(title)} className="register-card">
            <h2>{String(title)} by status</h2>
            {(rows as { status: string; count: number }[]).map((r) => (
              <div className="summary-row" key={r.status}>
                <b>{r.status.replaceAll("_", " ")}</b>
                <span>{r.count}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className="data-note">
        Reporting foundation: live summaries and linked registers. PDF/Excel
        export can be added later.
      </p>
      <Link href={`/portal/tasks?project=${project ?? ""}`}>
        Open task register →
      </Link>
    </>
  );
}
