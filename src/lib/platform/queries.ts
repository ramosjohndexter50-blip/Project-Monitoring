import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Choices, Module } from "./modules";

const COLUMN_REFERENCES: Record<string, string> = {
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

export async function choicesFor(
  db: SupabaseClient,
  config: Module,
  project: string | null,
): Promise<Choices> {
  // Only load reference data that this module can actually render/use.
  // The old implementation loaded projects, disciplines and profiles for
  // every module, even when none of them were needed.
  const references = new Set(
    config.fields.map((f) => f.reference).filter((x): x is string => !!x),
  );

  for (const column of config.columns) {
    const reference = COLUMN_REFERENCES[column];
    if (reference) references.add(reference);
  }

  // The project selector is shown on non-admin register pages.
  if (!config.admin) references.add("projects");
  if (config.table === "users") {
    references.add("disciplines");
    references.add("roles");
  }

  const projectMemberIdsPromise =
    project && config.table === "tasks"
      ? db.from("project_members").select("user_id").eq("project_id", project)
      : null;

  const projectDisciplineIdsPromise =
    project && !["projects", "project_disciplines"].includes(config.table) && references.has("disciplines")
      ? db
          .from("project_disciplines")
          .select("discipline_id")
          .eq("project_id", project)
          .eq("is_active", true)
      : null;

  const entries = await Promise.all(
    [...references].map(async (ref) => {
      const table = ref === "project_roles" ? "roles" : ref;
      const labelColumn =
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
        .select(`${id},${labelColumn}${table === "profiles" ? ",discipline_id" : ""}`)
        .order(labelColumn)
        .limit(500);

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
      ) {
        query = query.eq("project_id", project);
      }
      if (ref === "project_roles") query = query.not("key", "in", "(super_admin,admin)");
      if (table === "disciplines") query = query.eq("is_active", true);

      const result = await query;
      if (result.error) throw result.error;

      let rows = result.data as unknown as Record<string, string>[];
      if (table === "profiles" && projectMemberIdsPromise) {
        const members = await projectMemberIdsPromise;
        if (members.error) throw members.error;
        const ids = new Set(members.data.map((m) => m.user_id));
        rows = rows.filter((r) => ids.has(r.id));
      }
      if (table === "disciplines" && projectDisciplineIdsPromise) {
        const pd = await projectDisciplineIdsPromise;
        if (pd.error) throw pd.error;
        const allowed = new Set(pd.data.map((d) => d.discipline_id));
        rows = rows.filter((row) => allowed.has(row.id));
      }

      return [
        ref,
        rows.map((row) => ({
          value: row[id],
          label: row[labelColumn] || row[id],
          ...(table === "profiles" ? { disciplineId: row.discipline_id } : {}),
        })),
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export function recordLabel(key: string, value: unknown, choices: Choices) {
  const name = choices[COLUMN_REFERENCES[key]]?.find((item) => item.value === value)?.label;
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
