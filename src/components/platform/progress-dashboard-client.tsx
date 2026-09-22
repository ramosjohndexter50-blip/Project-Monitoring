"use client";

import { useMemo, useState } from "react";

type Category = {
  key: "model" | "annotation" | "coordination" | "sheet";
  label: string;
  total: number;
  completed: number;
  percent: number;
};

type ProjectProgress = {
  project_id: string;
  project_name: string;
  project_code: string | null;
  task_count: number;
  overall_percent: number;
  categories: Category[];
};

type DashboardData = {
  categories: Category[];
  overall_percent: number;
  task_count: number;
  projects: ProjectProgress[];
};

const tones: Record<Category["key"], string> = {
  model: "blue",
  annotation: "violet",
  coordination: "amber",
  sheet: "green",
};

export default function ProgressDashboardClient({ data }: { data: DashboardData }) {
  const [projectId, setProjectId] = useState("overall");

  const selected = useMemo(() => {
    if (projectId === "overall") {
      return {
        categories: data.categories,
        overall_percent: data.overall_percent,
        task_count: data.task_count,
        label: "Overall accessible projects",
      };
    }
    const project = data.projects.find((item) => item.project_id === projectId);
    return {
      categories: project?.categories ?? data.categories,
      overall_percent: project?.overall_percent ?? 0,
      task_count: project?.task_count ?? 0,
      label: project
        ? `${project.project_code ? `${project.project_code} · ` : ""}${project.project_name}`
        : "Project",
    };
  }, [data, projectId]);

  return (
    <>
      <section className="progress-dashboard-filter">
        <label>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="overall">Overall accessible projects</option>
            {data.projects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.project_code ? `${project.project_code} · ` : ""}{project.project_name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span>Scope</span>
          <strong>{selected.label}</strong>
          <small>{selected.task_count} active task{selected.task_count === 1 ? "" : "s"}</small>
        </div>
      </section>

      <section className="progress-dashboard-grid" aria-label="Task completion by production stage">
        {selected.categories.map((category) => (
          <article className={`progress-dashboard-card ${tones[category.key]}`} key={category.key}>
            <div className="progress-dashboard-card-head">
              <span>{category.label}</span>
              <strong>{category.percent}%</strong>
            </div>
            <div className="progress-dashboard-track"><i style={{ width: `${category.percent}%` }} /></div>
            <small>{category.completed} of {category.total} task{category.total === 1 ? "" : "s"} complete</small>
          </article>
        ))}
        <article className="progress-dashboard-card overall">
          <div className="progress-dashboard-card-head">
            <span>Overall complete</span>
            <strong>{selected.overall_percent}%</strong>
          </div>
          <div className="progress-dashboard-track"><i style={{ width: `${selected.overall_percent}%` }} /></div>
          <small>Average of Model, Annotation, Coordination and Sheet completion</small>
        </article>
      </section>

      <section className="register-card progress-project-table">
        <div className="overview-card-head compact">
          <div>
            <h2>Project completion</h2>
            <p>Same four-stage percentage model by accessible project.</p>
          </div>
        </div>
        <div className="progress-project-head">
          <span>Project</span><span>Model</span><span>Annotation</span><span>Coordination</span><span>Sheet</span><span>Complete</span>
        </div>
        {data.projects.length ? data.projects.map((project) => {
          const map = new Map(project.categories.map((category) => [category.key, category.percent]));
          return (
            <button
              className={`progress-project-row ${projectId === project.project_id ? "selected" : ""}`}
              key={project.project_id}
              type="button"
              onClick={() => setProjectId(project.project_id)}
            >
              <span><b>{project.project_name}</b><small>{project.project_code ?? "No project code"}</small></span>
              <strong>{map.get("model") ?? 0}%</strong>
              <strong>{map.get("annotation") ?? 0}%</strong>
              <strong>{map.get("coordination") ?? 0}%</strong>
              <strong>{map.get("sheet") ?? 0}%</strong>
              <strong className="progress-project-overall">{project.overall_percent}%</strong>
            </button>
          );
        }) : <p className="overview-empty">No accessible project progress yet.</p>}
      </section>
    </>
  );
}
