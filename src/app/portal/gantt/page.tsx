import GanttWorkspace from "@/components/platform/gantt-workspace";
import { session } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  const { db } = await session();

  const [projectsResult, tasksResult, disciplinesResult, peopleResult] = await Promise.all([
    db
      .from("projects")
      .select("id,name,project_code,start_date,target_date")
      .order("name"),
    db
      .from("tasks")
      .select("id,project_id,task_name,discipline_id,owner,status,priority,start_date,due_date,percent_complete,notes,progress_note,updated_at")
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(1500),
    db
      .from("disciplines")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    db
      .from("profiles")
      .select("id,full_name,role,discipline_id")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  if (projectsResult.error) throw new Error(projectsResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (disciplinesResult.error) throw new Error(disciplinesResult.error.message);
  if (peopleResult.error) throw new Error(peopleResult.error.message);

  return (
    <GanttWorkspace
      projects={projectsResult.data ?? []}
      tasks={tasksResult.data ?? []}
      disciplines={disciplinesResult.data ?? []}
      people={peopleResult.data ?? []}
    />
  );
}
