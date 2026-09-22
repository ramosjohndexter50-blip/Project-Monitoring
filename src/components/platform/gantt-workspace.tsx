"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DetailedGantt, { type DetailedGanttTask } from "@/components/platform/detailed-gantt";
import type { Discipline, Profile } from "@/app/task-types";

type Project = {
  id: string;
  name: string;
  project_code: string | null;
  start_date: string | null;
  target_date: string | null;
};

export default function GanttWorkspace({
  projects,
  tasks,
  disciplines,
  people,
}: {
  projects: Project[];
  tasks: DetailedGanttTask[];
  disciplines: Discipline[];
  people: Profile[];
}) {
  const searchParams = useSearchParams();
  const requestedProject = searchParams.get("project") ?? "";
  const [scope, setScope] = useState(projects.some((project) => project.id === requestedProject) ? requestedProject : "overall");
  const [search, setSearch] = useState("");

  const decoratedTasks = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    return tasks.map((task) => ({
      ...task,
      project_name: projectMap.get(task.project_id ?? "")?.name ?? "Project",
      project_code: projectMap.get(task.project_id ?? "")?.project_code ?? null,
    }));
  }, [projects, tasks]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return decoratedTasks.filter((task) => {
      if (scope !== "overall" && task.project_id !== scope) return false;
      if (!term) return true;
      return [
        task.task_name,
        task.project_name,
        task.project_code,
        task.notes,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [decoratedTasks, scope, search]);

  const scopeProject = projects.find((project) => project.id === scope);
  const scopeLabel = scopeProject
    ? `${scopeProject.project_code ? `${scopeProject.project_code} · ` : ""}${scopeProject.name}`
    : "Overall accessible projects";

  return (
    <>
      <div className="platform-heading gantt-page-heading">
        <div>
          <p className="page-crumb">Project Monitor <span>/</span> Gantt</p>
          <h1>Gantt</h1>
          <p>Detailed task schedule across one project or all projects you can access.</p>
        </div>
      </div>

      <section className="gantt-workspace-controls">
        <label>
          Scope
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="overall">Overall accessible projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.project_code ? `${project.project_code} · ` : ""}{project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="gantt-workspace-search">
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks or projects" />
        </label>
        <div className="gantt-workspace-summary">
          <span><b>{visible.length}</b> tasks</span>
          <span><b>{scope === "overall" ? projects.length : 1}</b> project{scope === "overall" && projects.length !== 1 ? "s" : ""}</span>
        </div>
      </section>

      <DetailedGantt
        tasks={visible}
        disciplines={disciplines}
        people={people}
        scopeLabel={scopeLabel}
        overall={scope === "overall"}
        printable
      />
    </>
  );
}
