import Link from "next/link";
import { session } from "@/lib/platform/auth";
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { db } = await session();
  const term = q
    .trim()
    .replace(/[%_\\]/g, "")
    .slice(0, 100);
  const sources = [
    ["projects", "name", "Projects"],
    ["tasks", "task_name", "Tasks"],
    ["deliverables", "title", "Deliverables"],
    ["rfis", "subject", "RFIs"],
    ["issues", "title", "Issues"],
    ["documents", "title", "Documents"],
    ["profiles", "full_name", "People"],
  ] as const;
  const results = term
    ? await Promise.all(
        sources.map(async ([table, column, title]) => {
          const result = await db
            .from(table)
            .select(
              table === "projects" || table === "profiles"
                ? `id,${column}`
                : `id,project_id,${column}`,
            )
            .ilike(column, `%${term}%`)
            .limit(20);
          return { table, column, title, ...result };
        }),
      )
    : [];
  return (
    <>
      <div className="platform-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / SEARCH</p>
          <h1>Find project information</h1>
          <p>Search only the records your account is authorized to access.</p>
        </div>
      </div>
      <form className="register-filters">
        <label>
          Search
          <input
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Project, drawing, task, RFI…"
            required
          />
        </label>
        <button className="button primary">Search</button>
      </form>
      <div className="dashboard-grid">
        {results.map((result) => (
          <section key={result.table} className="register-card">
            <h2>{result.title}</h2>
            {result.error ? (
              <p role="alert">Could not search this register.</p>
            ) : result.data?.length ? (
              (result.data as unknown as Record<string, string>[]).map(
                (row) => (
                  <Link
                    className="summary-row"
                    key={row.id}
                    href={
                      result.table === "profiles"
                        ? "/portal/users"
                        : `/portal/${result.table}?edit=${row.id}${row.project_id ? `&project=${row.project_id}` : ""}`
                    }
                  >
                    {row[result.column]}
                  </Link>
                ),
              )
            ) : (
              <p>No matches.</p>
            )}
            <small>
              Up to 20 matches per register; use register filters to narrow
              results.
            </small>
          </section>
        ))}
      </div>
    </>
  );
}
