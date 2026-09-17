import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Choices, Module } from "./modules";
export async function choicesFor(
  db: SupabaseClient,
  config: Module,
  project: string | null,
): Promise<Choices> {
  const references = new Set(
    config.fields.map((f) => f.reference).filter((x): x is string => !!x),
  );
  references.add("projects");
  references.add("disciplines");
  references.add("profiles");
  const entries = await Promise.all(
    [...references].map(async (ref) => {
      const table = ref === "project_roles" ? "roles" : ref;
      const label =
        table === "profiles"
          ? "full_name"
          : table === "permissions"
            ? "key"
            : table === "tasks"
              ? "task_name"
              : table === "rfis"
                ? "subject"
                : ["deliverables", "documents", "issues"].includes(table)
                  ? "title"
                  : "name";
      const id = ["roles", "permissions"].includes(table) ? "key" : "id";
      let query = db
        .from(table)
        .select(`${id},${label}`)
        .order(label)
        .limit(1000);
      if (
        project &&
        [
          "tasks",
          "rfis",
          "issues",
          "deliverables",
          "documents",
          "project_phases",
          "milestones",
          "approval_workflows",
        ].includes(table)
      )
        query = query.eq("project_id", project);
      if (ref === "project_roles")
        query = query.not("key", "in", "(super_admin,admin)");
      const result = await query;
      if (result.error) throw result.error;
      let rows = result.data as unknown as Record<string, string>[];
      if (table === "disciplines" && project) {
        const pd = await db
          .from("project_disciplines")
          .select("discipline_id")
          .eq("project_id", project);
        if (pd.error) throw pd.error;
        const allowed = new Set(pd.data.map((d) => d.discipline_id));
        rows = rows.filter((row) => allowed.has(row.id));
      }
      return [
        ref,
        rows.map((row) => ({ value: row[id], label: row[label] || row[id] })),
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}
export function recordLabel(key: string, value: unknown, choices: Choices) {
  const map: Record<string, string> = {
    project_id: "projects",
    discipline_id: "disciplines",
    owner: "profiles",
    user_id: "profiles",
    actor_id: "profiles",
    reviewer: "profiles",
    submitted_by: "profiles",
    assigned_lead: "profiles",
    deliverable_id: "deliverables",
    workflow_id: "approval_workflows",
    role_key: "roles",
  };
  const name = choices[map[key]]?.find((item) => item.value === value)?.label;
  return (
    name ??
    (value === null || value === undefined
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : typeof value === "boolean"
          ? value
            ? "Active / Yes"
            : "Inactive / No"
          : String(value))
  );
}
