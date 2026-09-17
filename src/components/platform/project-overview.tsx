import Link from "next/link";
import { session } from "@/lib/platform/auth";

export default async function ProjectOverview({
  projectId,
}: {
  projectId: string;
}) {
  const { db, profile } = await session();
  const { data, error } = await db.rpc("project_discipline_summary", {
    target_project: projectId,
  });
  if (error) throw new Error(error.message);
  const rows = data as {
    discipline_id: string;
    name: string;
    task_count: number;
    progress: number;
  }[];
  const overall = rows.length
    ? Math.round(
        rows.reduce((sum, d) => sum + Number(d.progress), 0) / rows.length,
      )
    : 0;
  return (
    <section className="register-card">
      <h2>
        {profile.role === "super_admin"
          ? "Overall project completion"
          : "Your discipline completion"}
        : {overall}%
      </h2>
      <p>
        Average completion across active contributing disciplines. A discipline
        without tasks starts at 0%.
      </p>
      {rows.length ? (
        rows.map((d) => (
          <div className="summary-row" key={d.discipline_id}>
            <Link
              href={`/portal/tasks?project=${projectId}&discipline=${d.discipline_id}`}
            >
              {d.name}
            </Link>
            <progress
              aria-label={`${d.name} completion`}
              max={100}
              value={d.progress}
            />
            <strong>{d.progress}%</strong>
            <small>{d.task_count} tasks</small>
          </div>
        ))
      ) : (
        <p>No active contributing disciplines.</p>
      )}
    </section>
  );
}
