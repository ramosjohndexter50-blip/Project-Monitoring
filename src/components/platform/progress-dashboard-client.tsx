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

const iconPath: Record<Category["key"] | "overall", React.ReactNode> = {
  model: <><path d="m12 3 7 4-7 4-7-4 7-4Z"/><path d="m5 7 7 4 7-4v9l-7 4-7-4V7Z"/></>,
  annotation: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/><path d="M15 15v4M13 17h4"/></>,
  coordination: <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="8" r="2"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M14 14.5a4.5 4.5 0 0 1 6.5 4"/></>,
  sheet: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  overall: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 7-7M16 5h3v3"/></>,
};

function StageIcon({ name }: { name: Category["key"] | "overall" }) {
  return <svg className="progress-stage-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPath[name]}</svg>;
}

function HexProgress({ percent, compact = false }: { percent: number; compact?: boolean }) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div className={`hex-progress ${compact ? "compact" : ""}`} style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <div className="hex-progress-core"><strong>{value}%</strong></div>
    </div>
  );
}

export default function ProgressDashboardClient({ data }: { data: DashboardData }) {
  const [projectId, setProjectId] = useState("overall");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState("updated");

  const selected = useMemo(() => {
    if (projectId === "overall") {
      return { categories: data.categories, overall_percent: data.overall_percent, task_count: data.task_count, label: "Overall accessible projects" };
    }
    const project = data.projects.find((item) => item.project_id === projectId);
    return {
      categories: project?.categories ?? data.categories,
      overall_percent: project?.overall_percent ?? 0,
      task_count: project?.task_count ?? 0,
      label: project ? `${project.project_code ? `${project.project_code} · ` : ""}${project.project_name}` : "Project",
    };
  }, [data, projectId]);

  const visibleProjects = useMemo(() => {
    let items = data.projects.filter((project) => {
      const text = `${project.project_name} ${project.project_code ?? ""}`.toLowerCase();
      return text.includes(query.trim().toLowerCase()) && (projectFilter === "all" || project.project_id === projectFilter);
    });
    if (sort === "name") items = [...items].sort((a, b) => a.project_name.localeCompare(b.project_name));
    if (sort === "complete") items = [...items].sort((a, b) => b.overall_percent - a.overall_percent);
    return items;
  }, [data.projects, query, projectFilter, sort]);

  return (
    <>
      <section className="progress-dashboard-filter">
        <label>
          <span>Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="overall">Overall accessible projects</option>
            {data.projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.project_code ? `${project.project_code} · ` : ""}{project.project_name}</option>)}
          </select>
        </label>
        <div className="progress-scope">
          <span>Scope</span>
          <strong>{selected.label}</strong>
          <small>{selected.task_count} active task{selected.task_count === 1 ? "" : "s"}</small>
        </div>
      </section>

      <section className="progress-dashboard-grid" aria-label="Task completion by production stage">
        {selected.categories.map((category) => (
          <article className="progress-dashboard-card" key={category.key}>
            <div className="progress-dashboard-card-head"><span className="progress-card-title"><StageIcon name={category.key}/>{category.label}</span><button type="button" aria-label={`${category.label} options`}>•••</button></div>
            <HexProgress percent={category.percent}/>
            <small>{category.completed} of {category.total} task{category.total === 1 ? "" : "s"} complete</small>
          </article>
        ))}
        <article className="progress-dashboard-card overall">
          <div className="progress-dashboard-card-head"><span className="progress-card-title"><StageIcon name="overall"/>Overall complete</span><button type="button" aria-label="Overall completion options">•••</button></div>
          <HexProgress percent={selected.overall_percent}/>
          <small>Average of Model, Annotation, Coordination and Sheet completion</small>
        </article>
      </section>

      <section className="register-card progress-project-table">
        <div className="progress-table-toolbar">
          <div className="progress-table-title"><span className="progress-table-title-icon">☷</span><div><h2>Project completion</h2><p>Same four-stage percentage model by accessible project.</p></div></div>
          <div className="progress-table-controls">
            <label className="progress-table-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects..." /></label>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="all">All Projects</option>{data.projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}</select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">Last updated</option><option value="name">Project name</option><option value="complete">Completion</option></select>
          </div>
        </div>
        <div className="progress-project-head"><span>#</span><span>Project name</span><span>Model</span><span>Annotation</span><span>Coordination</span><span>Sheet</span><span>Complete</span><span>Status</span></div>
        {visibleProjects.length ? visibleProjects.map((project, index) => {
          const map = new Map(project.categories.map((category) => [category.key, category.percent]));
          const status = project.overall_percent >= 75 ? "On track" : project.overall_percent >= 40 ? "In progress" : "At risk";
          return (
            <button className={`progress-project-row ${projectId === project.project_id ? "selected" : ""}`} key={project.project_id} type="button" onClick={() => setProjectId(project.project_id)}>
              <span className="progress-row-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="progress-project-name"><b>{project.project_name}</b><small>{project.project_code ?? "No project code"}</small></span>
              <span><HexProgress compact percent={map.get("model") ?? 0}/></span>
              <span><HexProgress compact percent={map.get("annotation") ?? 0}/></span>
              <span><HexProgress compact percent={map.get("coordination") ?? 0}/></span>
              <span><HexProgress compact percent={map.get("sheet") ?? 0}/></span>
              <span><HexProgress compact percent={project.overall_percent}/></span>
              <span><i className={`project-health ${status.toLowerCase().replace(" ", "-")}`}>{status}</i></span>
            </button>
          );
        }) : <p className="overview-empty">No project matches the current filters.</p>}
      </section>
    </>
  );
}
