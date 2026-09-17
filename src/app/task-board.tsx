"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./workspace";

type Status =
  | "not_started"
  | "in_progress"
  | "for_review"
  | "revision_required"
  | "approved"
  | "completed"
  | "blocked"
  | "cancelled";
type Task = {
  id: string;
  task_name: string;
  discipline_id: string;
  owner: string | null;
  status: Status;
  priority: "low" | "medium" | "high" | "critical";
  due_date: string | null;
  percent_complete: number;
  notes: string | null;
  progress_note: string | null;
  updated_at: string;
};
type Discipline = { id: string; name: string };
type History = {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
};
type Props = {
  supabase: SupabaseClient;
  role: Profile["role"];
  disciplineId: string | null;
  projectId: string;
  userId: string;
  onlyMine: boolean;
};
const labels: Record<Status, string> = {
  not_started: "Assigned",
  in_progress: "In progress",
  for_review: "For review",
  revision_required: "Revision required",
  approved: "Approved",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};
const statuses = Object.keys(labels) as Status[];
const fields =
  "id, task_name, discipline_id, owner, status, priority, due_date, percent_complete, notes, progress_note, updated_at";
const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Unable to reach the server. Please try again.";
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function readProjectTasks(supabase: SupabaseClient, projectId: string) {
  const data: Task[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase
      .from("tasks")
      .select(fields)
      .eq("project_id", projectId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id")
      .range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    data.push(...(result.data as Task[]));
    if (result.data.length < 500) return { data, error: null };
  }
}

export default function TaskBoard({
  supabase,
  role,
  disciplineId,
  projectId,
  userId,
  onlyMine,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sync, setSync] = useState("Connecting...");
  const [view, setView] = useState("table");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const request = useRef(0);
  const historyRequest = useRef(0);
  const mutation = useRef(false);
  const [capabilities, setCapabilities] = useState<{
    editable_tasks: string[];
    create_disciplines: string[];
    review_disciplines?: string[];
  }>({ editable_tasks: [], create_disciplines: [] });
  const canEdit = (task?: Task) =>
    task
      ? capabilities.editable_tasks.includes(task.id)
      : capabilities.create_disciplines.length > 0;
  const load = useCallback(async () => {
    const version = ++request.current;
    try {
      const [taskRows, disciplineRows, profileRows, rights] = await Promise.all(
        [
          readProjectTasks(supabase, projectId),
          supabase.from("disciplines").select("id, name").order("name"),
          supabase
            .from("profiles")
            .select("id, full_name, role, discipline_id")
            .order("full_name"),
          supabase.rpc("task_capabilities", { project: projectId }),
        ],
      );
      if (version !== request.current) return;
      if (
        taskRows.error ||
        disciplineRows.error ||
        profileRows.error ||
        rights.error
      )
        throw (
          taskRows.error ??
          disciplineRows.error ??
          profileRows.error ??
          rights.error
        );
      setCapabilities(rights.data);
      setTasks((taskRows.data ?? []) as Task[]);
      setDisciplines(disciplineRows.data ?? []);
      setPeople((profileRows.data ?? []) as Profile[]);
      setMessage("");
    } catch (error) {
      if (version === request.current) setMessage(errorText(error));
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [supabase, projectId]);
  useEffect(() => {
    const requests = request;
    const historyRequests = historyRequest;
    // Fetching external data updates state only after the awaited database response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const channel = supabase
      .channel(`board-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe((state) =>
        setSync(
          state === "SUBSCRIBED"
            ? "Live updates connected"
            : "Live updates unavailable · use Refresh",
        ),
      );
    return () => {
      requests.current++;
      historyRequests.current++;
      void supabase.removeChannel(channel);
    };
  }, [load, supabase, projectId]);

  const personName = (id: string | null) =>
    id
      ? (people.find((p) => p.id === id)?.full_name ??
        (id === userId ? "You" : "Assigned team member"))
      : "Unassigned";
  const disciplineName = (id: string) =>
    disciplines.find((d) => d.id === id)?.name ?? "Unknown discipline";
  const overdue = (task: Task) =>
    !["completed", "cancelled"].includes(task.status) &&
    !!task.due_date &&
    task.due_date < today();
  const scoped = tasks.filter((task) => !onlyMine || task.owner === userId);
  const visible = scoped.filter(
    (task) =>
      (filter === "all" || task.status === filter) &&
      (!disciplineFilter || task.discipline_id === disciplineFilter) &&
      `${task.task_name} ${disciplineName(task.discipline_id)} ${personName(task.owner)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, pageCount);
  const displayed = visible.slice((currentPage - 1) * 25, currentPage * 25);
  const done = scoped.filter((task) => task.status === "completed").length;
  const progress = scoped.length
    ? Math.round(
        scoped.reduce((sum, task) => sum + task.percent_complete, 0) /
          scoped.length,
      )
    : 0;

  async function persist(task: Task | null, values: Partial<Task>) {
    if (mutation.current || !canEdit(task ?? undefined)) return false;
    mutation.current = true;
    setSaving(true);
    setMessage("");
    try {
      const result = task
        ? await supabase
            .from("tasks")
            .update(values)
            .eq("id", task.id)
            .eq("project_id", projectId)
            .eq("updated_at", task.updated_at)
            .select(fields)
            .maybeSingle()
        : await supabase
            .from("tasks")
            .insert({ ...values, project_id: projectId })
            .select(fields)
            .single();
      if (result.error) throw result.error;
      if (!result.data)
        throw new Error(
          "Task changed or you no longer have access. Refresh and try again.",
        );
      await load();
      return true;
    } catch (error) {
      setMessage(errorText(error));
      return false;
    } finally {
      mutation.current = false;
      setSaving(false);
    }
  }
  async function changeStatus(task: Task, status: Status) {
    await persist(task, {
      status,
      percent_complete:
        status === "completed"
          ? 100
          : status === "not_started" || task.status === "completed"
            ? 0
            : task.percent_complete,
    });
  }
  async function showHistory(task: Task) {
    const version = ++historyRequest.current;
    setHistoryTask(task);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const result = await supabase
        .from("task_history")
        .select(
          "id, field_changed, old_value, new_value, changed_at, changed_by",
        )
        .eq("task_id", task.id)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (result.error) throw result.error;
      if (version === historyRequest.current) setHistory(result.data ?? []);
    } catch (error) {
      if (version === historyRequest.current) setHistoryError(errorText(error));
    } finally {
      if (version === historyRequest.current) setHistoryLoading(false);
    }
  }
  function statusControl(task: Task) {
    return (
      <select
        aria-label={`Status for ${task.task_name}`}
        className={`status-select ${task.status}`}
        value={task.status}
        disabled={!canEdit(task) || saving}
        onChange={(e) => void changeStatus(task, e.target.value as Status)}
      >
        {statuses
          .filter(
            (status) =>
              role === "super_admin" ||
              capabilities.review_disciplines?.includes(task.discipline_id) ||
              ![
                "approved",
                "completed",
                "revision_required",
                "cancelled",
              ].includes(status) ||
              status === task.status,
          )
          .map((status) => (
            <option value={status} key={status}>
              {labels[status]}
            </option>
          ))}
      </select>
    );
  }

  return (
    <>
      <section className="stats-grid" aria-label="Live task summary">
        <div className="stat-card accent-stat">
          <span className="stat-label">Overall progress</span>
          <strong>
            {loading ? "—" : progress}
            <span>%</span>
          </strong>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <small>Average task completion</small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Open tasks</span>
          <strong>{loading ? "—" : scoped.length - done}</strong>
          <small>Ready and in progress</small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Needs attention</span>
          <strong className="warm-number">
            {loading
              ? "—"
              : scoped.filter(
                  (task) => task.status === "blocked" || overdue(task),
                ).length}
          </strong>
          <small>
            {scoped.filter(overdue).length} overdue ·{" "}
            {scoped.filter((task) => task.status === "blocked").length} stuck
          </small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed</span>
          <strong>{loading ? "—" : done}</strong>
          <small>of {scoped.length} tasks</small>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>{onlyMine ? "Assigned to me" : "Project tasks"}</h2>
          <p>One task, one owner, a clear next step.</p>
        </div>
        <div className="view-toggle">
          {["table", "board"].map((item) => (
            <button
              key={item}
              aria-pressed={view === item}
              className={view === item ? "selected" : ""}
              onClick={() => setView(item)}
            >
              {item === "table" ? "Main table" : "Kanban board"}
            </button>
          ))}
        </div>
      </div>
      <section className="task-panel">
        <div className="board-toolbar">
          <label className="search-box">
            <input
              aria-label="Search tasks"
              placeholder="Search tasks or people"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter discipline"
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
          >
            <option value="">All disciplines</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            className="button secondary compact"
            disabled={saving}
            onClick={() => void load()}
          >
            Refresh
          </button>
          {canEdit() && (
            <button
              className="button primary compact"
              disabled={loading || saving}
              onClick={() => {
                setEditor("new");
                setHistoryTask(null);
              }}
            >
              + New task
            </button>
          )}
        </div>
        <div className="filter-group board-filters">
          {(["all", ...statuses] as const).map((status) => (
            <button
              key={status}
              aria-pressed={filter === status}
              className={filter === status ? "selected" : ""}
              onClick={() => setFilter(status)}
            >
              {status === "all" ? "All tasks" : labels[status]}
              <span className="filter-count">
                {status === "all"
                  ? scoped.length
                  : scoped.filter((task) => task.status === status).length}
              </span>
            </button>
          ))}
        </div>
        {message && (
          <p className="task-message" role="alert">
            {message}
          </p>
        )}
        {editor && (
          <TaskEditor
            key={editor === "new" ? "new" : editor.id}
            task={editor === "new" ? null : editor}
            disciplines={disciplines.filter((d) =>
              editor === "new"
                ? capabilities.create_disciplines.includes(d.id)
                : canEdit(editor) && d.id === editor.discipline_id,
            )}
            superAdmin={role === "super_admin"}
            canReview={
              editor !== "new" &&
              !!capabilities.review_disciplines?.includes(editor.discipline_id)
            }
            people={people}
            disciplineId={disciplineId}
            saving={saving}
            onCancel={() => setEditor(null)}
            onSave={async (values) => {
              if (await persist(editor === "new" ? null : editor, values))
                setEditor(null);
            }}
          />
        )}
        {loading ? (
          <p className="task-empty" role="status">
            Loading project tasks...
          </p>
        ) : visible.length === 0 ? (
          <div className="empty-board">
            <h3>
              {scoped.length
                ? "No matching tasks"
                : onlyMine
                  ? "No tasks assigned to you yet"
                  : "Your board is ready"}
            </h3>
            <p>
              {scoped.length
                ? "Try another search or filter."
                : "Create tasks and assign owners to get started."}
            </p>
          </div>
        ) : view === "table" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Task",
                    "Discipline",
                    "Owner",
                    "Status",
                    "Progress",
                    "Due date",
                    "Priority",
                    "History",
                  ].map((title) => (
                    <th key={title}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <button
                        className="task-title"
                        onClick={() => {
                          setEditor(task);
                          setHistoryTask(null);
                        }}
                      >
                        {task.task_name}
                      </button>
                      {task.notes && (
                        <span className="task-note" title={task.notes}>
                          {task.notes}
                        </span>
                      )}
                    </td>
                    <td>{disciplineName(task.discipline_id)}</td>
                    <td>{personName(task.owner)}</td>
                    <td>{statusControl(task)}</td>
                    <td>
                      <span>{task.percent_complete}%</span>
                    </td>
                    <td className={overdue(task) ? "overdue" : ""}>
                      {task.due_date ?? "No date"}
                      {overdue(task) && <small>Overdue</small>}
                    </td>
                    <td>
                      <span className={`priority ${task.priority}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => void showHistory(task)}
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="kanban">
            {statuses.map((status) => (
              <section key={status} className={`kanban-column ${status}`}>
                <h3>
                  {labels[status]}{" "}
                  <span>
                    {visible.filter((task) => task.status === status).length}
                  </span>
                </h3>
                {displayed
                  .filter((task) => task.status === status)
                  .map((task) => (
                    <article className="kanban-card" key={task.id}>
                      <span className="eyebrow">
                        {disciplineName(task.discipline_id)}
                      </span>
                      <button
                        className="task-title"
                        onClick={() => {
                          setEditor(task);
                          setHistoryTask(null);
                        }}
                      >
                        {task.task_name}
                      </button>
                      <p>{personName(task.owner)}</p>
                      <div className="card-meta">
                        <span className={overdue(task) ? "overdue" : ""}>
                          {task.due_date ?? "No date"}
                          {overdue(task) ? " · Overdue" : ""}
                        </span>
                        <span className={`priority ${task.priority}`}>
                          {task.priority}
                        </span>
                      </div>
                      {statusControl(task)}
                      <div className="card-meta">
                        <span>{task.percent_complete}% complete</span>
                        <button
                          className="text-button"
                          onClick={() => void showHistory(task)}
                        >
                          History
                        </button>
                      </div>
                    </article>
                  ))}
                {!displayed.some((task) => task.status === status) && (
                  <p className="task-empty">No tasks here</p>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
      {historyTask && (
        <section className="history-panel" aria-label="Task history">
          <div className="section-heading">
            <h2>History · {historyTask.task_name}</h2>
            <button
              className="text-button"
              onClick={() => {
                historyRequest.current++;
                setHistoryTask(null);
              }}
            >
              Close history
            </button>
          </div>
          {historyLoading ? (
            <p role="status">Loading history...</p>
          ) : historyError ? (
            <p role="alert">{historyError}</p>
          ) : history.length ? (
            <ol>
              {history.map((item) => (
                <li key={item.id}>
                  <strong>{item.field_changed.replaceAll("_", " ")}</strong>
                  <p>
                    {item.field_changed === "owner"
                      ? personName(item.old_value)
                      : item.old_value || "Empty"}{" "}
                    →{" "}
                    {item.field_changed === "owner"
                      ? personName(item.new_value)
                      : item.new_value || "Empty"}
                  </p>
                  <small>
                    {personName(item.changed_by)} ·{" "}
                    {new Date(item.changed_at).toLocaleString()}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No changes recorded yet.</p>
          )}
          <small>
            Latest 50 field changes. New tasks have no update history until
            edited.
          </small>
        </section>
      )}
      <nav className="pagination" aria-label="Task board pagination">
        <button
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          Page {currentPage} of {pageCount} ? {visible.length} matching tasks
        </span>
        <button
          disabled={currentPage >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </nav>
      <footer className="footer-note">
        <span>{sync}</span>
        <span>
          {role === "super_admin"
            ? "Admin access"
            : role === "discipline_lead"
              ? "Edit your discipline"
              : "Access follows task permissions"}
        </span>
      </footer>
    </>
  );
}

function TaskEditor({
  task,
  superAdmin,
  canReview,
  disciplines,
  people,
  disciplineId,
  saving,
  onCancel,
  onSave,
}: {
  task: Task | null;
  superAdmin: boolean;
  canReview: boolean;
  disciplines: Discipline[];
  people: Profile[];
  disciplineId: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: Partial<Task>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    task_name: task?.task_name ?? "",
    discipline_id: task?.discipline_id ?? disciplineId ?? "",
    owner: task?.owner ?? "",
    due_date: task?.due_date ?? "",
    priority: task?.priority ?? "medium",
    status: task?.status ?? "not_started",
    percent_complete: task?.percent_complete ?? 0,
    notes: task?.notes ?? "",
    progress_note: task?.progress_note ?? "",
  });
  const editable =
    disciplines.some((d) => d.id === draft.discipline_id) ||
    (!task && disciplines.length > 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.task_name.trim() || !editable) return;
    if (!superAdmin) {
      await onSave({
        status: draft.status,
        percent_complete: draft.percent_complete,
        progress_note: draft.progress_note,
      });
      return;
    }
    await onSave({
      ...draft,
      task_name: draft.task_name.trim(),
      owner: draft.owner || null,
      due_date: draft.due_date || null,
      percent_complete:
        draft.status === "completed"
          ? 100
          : draft.status === "not_started"
            ? 0
            : draft.percent_complete,
    });
  }
  return (
    <form className="task-editor" onSubmit={submit}>
      <div className="editor-heading">
        <h3>{task ? "Task details" : "Create a task"}</h3>
        <button
          type="button"
          className="text-button"
          disabled={saving}
          onClick={onCancel}
        >
          Close
        </button>
      </div>
      <fieldset disabled={saving || !editable}>
        <label className="wide">
          Task name
          <input
            autoFocus
            required
            maxLength={300}
            readOnly={!superAdmin}
            value={draft.task_name}
            onChange={(e) => setDraft({ ...draft, task_name: e.target.value })}
          />
        </label>
        <label>
          Discipline
          <select
            required
            disabled={!!task}
            value={draft.discipline_id}
            onChange={(e) =>
              setDraft({ ...draft, discipline_id: e.target.value })
            }
          >
            <option value="">Choose discipline</option>
            {task && !disciplines.some((d) => d.id === task.discipline_id) && (
              <option value={task.discipline_id}>Assigned discipline</option>
            )}
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            disabled={!superAdmin}
            value={draft.owner}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          >
            <option value="">Unassigned</option>
            {draft.owner && !people.some((p) => p.id === draft.owner) && (
              <option value={draft.owner}>Assigned team member</option>
            )}
            {people
              .filter((p) => p.discipline_id === draft.discipline_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.id}
                </option>
              ))}
          </select>
        </label>
        <label>
          Due date
          <input
            type="date"
            readOnly={!superAdmin}
            value={draft.due_date}
            onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
          />
        </label>
        <label>
          Priority
          <select
            disabled={!superAdmin}
            value={draft.priority}
            onChange={(e) =>
              setDraft({
                ...draft,
                priority: e.target.value as Task["priority"],
              })
            }
          >
            {["low", "medium", "high", "critical"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={draft.status}
            onChange={(e) => {
              const status = e.target.value as Status;
              setDraft({
                ...draft,
                status,
                percent_complete:
                  status === "completed"
                    ? 100
                    : status === "not_started" || draft.status === "completed"
                      ? 0
                      : draft.percent_complete,
              });
            }}
          >
            {statuses
              .filter(
                (s) =>
                  superAdmin ||
                  canReview ||
                  ![
                    "approved",
                    "completed",
                    "revision_required",
                    "cancelled",
                  ].includes(s) ||
                  s === task?.status,
              )
              .map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Progress (%)
          <input
            type="number"
            min="0"
            max="100"
            required
            disabled={
              draft.status === "completed" || draft.status === "not_started"
            }
            value={draft.percent_complete}
            onChange={(e) =>
              setDraft({ ...draft, percent_complete: Number(e.target.value) })
            }
          />
        </label>
        <label className="wide">
          Notes / blocker
          <textarea
            rows={3}
            readOnly={!superAdmin}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Scope, next steps, or what is blocking this task"
          />
        </label>
      </fieldset>
      <label>
        Progress note
        <textarea
          value={draft.progress_note}
          disabled={saving || !editable}
          onChange={(e) =>
            setDraft({ ...draft, progress_note: e.target.value })
          }
        />
      </label>
      <p className="editor-hint">
        Owners listed here follow your current profile access. Contact an admin
        to assign another team member.
      </p>
      {editable ? (
        <button
          className="button primary compact"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving..." : task ? "Save changes" : "Create task"}
        </button>
      ) : (
        <p>Read-only task details.</p>
      )}
    </form>
  );
}
