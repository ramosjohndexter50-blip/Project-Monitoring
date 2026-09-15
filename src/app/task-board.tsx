"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Role = "super_admin" | "project_manager" | "discipline_lead" | "viewer";
type DbStatus = "not_started" | "working_on_it" | "stuck" | "done";
type Filter = "All tasks" | "Working on it" | "Stuck" | "Done";

type Task = {
  id: string;
  task_name: string;
  discipline_id: string;
  discipline_name: string;
  status: DbStatus;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  percent_complete: number;
  updated_at: string;
};

type Discipline = { id: string; name: string };

type Props = {
  supabase: SupabaseClient;
  role: Role;
  disciplineId: string | null;
};

const statusLabels: Record<DbStatus, string> = {
  not_started: "Not started",
  working_on_it: "Working on it",
  stuck: "Stuck",
  done: "Done",
};

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export default function TaskBoard({ supabase, role, disciplineId }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [filter, setFilter] = useState<Filter>("All tasks");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTask, setNewTask] = useState({ task_name: "", discipline_id: disciplineId ?? "", due_date: "", priority: "medium" as Task["priority"] });

  const canEdit = role === "super_admin" || role === "discipline_lead";

  async function loadTasks(targetProjectId: string) {
    const [{ data: rows, error: taskError }, { data: disciplineRows }] = await Promise.all([
      supabase.from("tasks").select("id, task_name, discipline_id, status, priority, due_date, percent_complete, updated_at").eq("project_id", targetProjectId).order("updated_at", { ascending: false }),
      supabase.from("disciplines").select("id, name").order("name"),
    ]);

    if (taskError) {
      setMessage(taskError.message);
      return;
    }

    const names = new Map((disciplineRows ?? []).map((discipline) => [discipline.id, discipline.name]));
    setDisciplines(disciplineRows ?? []);
    setTasks((rows ?? []).map((task) => ({ ...task, discipline_name: names.get(task.discipline_id) ?? "Unassigned" })) as Task[]);
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      const { data: project, error } = await supabase.from("projects").select("id").eq("name", "Portside Residence").limit(1).maybeSingle();
      if (!active) return;
      if (error) {
        setMessage(error.message);
      } else if (!project) {
        setMessage("No Portside Residence project exists yet. Run supabase/SETUP_PROJECT.sql first.");
      } else {
        setProjectId(project.id);
        await loadTasks(project.id);
      }
      setIsLoading(false);
    }
    initialize();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase.channel(`tasks-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, () => loadTasks(projectId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, supabase]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesFilter = filter === "All tasks"
      || (filter === "Working on it" && task.status === "working_on_it")
      || (filter === "Stuck" && task.status === "stuck")
      || (filter === "Done" && task.status === "done");
    return matchesFilter && task.task_name.toLowerCase().includes(search.toLowerCase());
  }), [filter, search, tasks]);

  async function updateTask(id: string, values: Partial<Pick<Task, "status" | "percent_complete">>) {
    setMessage("");
    const { error } = await supabase.from("tasks").update(values).eq("id", id);
    if (error) setMessage(error.message);
    else if (projectId) await loadTasks(projectId);
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !newTask.task_name || !newTask.discipline_id) return;
    setIsSaving(true);
    setMessage("");
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId,
      task_name: newTask.task_name,
      discipline_id: newTask.discipline_id,
      due_date: newTask.due_date || null,
      priority: newTask.priority,
      status: "not_started",
      percent_complete: 0,
    });
    setIsSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setNewTask({ task_name: "", discipline_id: disciplineId ?? "", due_date: "", priority: "medium" });
    setIsFormOpen(false);
    if (projectId) await loadTasks(projectId);
  }

  return (
    <section className="task-panel">
      <div className="table-toolbar">
        <div className="filter-group">{(["All tasks", "Working on it", "Stuck", "Done"] as Filter[]).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}<span className="filter-count">{item === "All tasks" ? tasks.length : tasks.filter((task) => (item === "Working on it" ? task.status === "working_on_it" : task.status === item.toLowerCase())).length}</span></button>)}</div>
        <div className="task-tools"><label className="search-box">⌕<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" /></label>{canEdit && projectId && <button className="button primary compact" onClick={() => setIsFormOpen((open) => !open)}>＋ New task</button>}</div>
      </div>
      {isFormOpen && <form className="task-form" onSubmit={createTask}><input value={newTask.task_name} onChange={(event) => setNewTask({ ...newTask, task_name: event.target.value })} placeholder="Task name" required /><select value={newTask.discipline_id} onChange={(event) => setNewTask({ ...newTask, discipline_id: event.target.value })} required><option value="">Discipline</option>{disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}</select><input type="date" value={newTask.due_date} onChange={(event) => setNewTask({ ...newTask, due_date: event.target.value })} /><select value={newTask.priority} onChange={(event) => setNewTask({ ...newTask, priority: event.target.value as Task["priority"] })}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select><button className="button primary compact" disabled={isSaving}>{isSaving ? "Saving..." : "Save task"}</button></form>}
      {message && <p className="task-message" role="status">{message}</p>}
      {isLoading ? <p className="task-empty">Loading project tasks...</p> : visibleTasks.length === 0 ? <p className="task-empty">{projectId ? "No tasks match this filter." : message}</p> : <div className="table-wrap"><table><thead><tr><th>TASK</th><th>DISCIPLINE</th><th>STATUS</th><th>PROGRESS</th><th>DUE DATE</th><th>PRIORITY</th><th>UPDATED</th></tr></thead><tbody>{visibleTasks.map((task) => { const editable = canEdit && (role === "super_admin" || task.discipline_id === disciplineId); return <tr key={task.id}><td><span className="task-name">{task.task_name}</span></td><td><span className="discipline-cell"><span className="table-dot" />{task.discipline_name}</span></td><td>{editable ? <select className="inline-select" value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as DbStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className={`table-status ${task.status}`}><i />{statusLabels[task.status]}</span>}</td><td>{editable ? <input className="progress-input" type="number" min="0" max="100" value={task.percent_complete} onChange={(event) => updateTask(task.id, { percent_complete: Number(event.target.value) })} /> : `${task.percent_complete}%`}</td><td>{task.due_date ?? "-"}</td><td><span className={`priority ${task.priority}`}>{task.priority}</span></td><td className="updated">{relativeTime(task.updated_at)}</td></tr>; })}</tbody></table></div>}
    </section>
  );
}
