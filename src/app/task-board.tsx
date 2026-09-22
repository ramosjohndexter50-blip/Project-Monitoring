"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import LoadingSkeleton from "@/components/platform/loading-skeleton";
import DetailedGantt from "@/components/platform/detailed-gantt";
import { labels, statuses, type Status, type Task, type Discipline } from "./task-types";
const TaskEditor = dynamic(() => import("./task-editor"), { loading: () => <p role="status">Loading task details…</p> });
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./task-types";

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
  projectName: string;
  userId: string;
  onlyMine: boolean;
};
const fields =
  "id, task_name, discipline_id, owner, status, priority, progress_stage, design_stage, start_date, due_date, percent_complete, notes, progress_note, updated_at";
const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Unable to reach the server. Please try again.";
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const shortDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`))
    : "No date";
const statusHelp: Record<Status, string> = {
  not_started: "New work ready to be picked up.",
  in_progress: "Tasks currently being worked on.",
  for_review: "Work waiting for review or feedback.",
  submitted: "Work submitted and waiting for the next review step.",
  revision_required: "Tasks that need another pass.",
  for_resubmission: "Reviewed work that must be updated and submitted again.",
  approved: "Reviewed work that has been approved.",
  completed: "Finished work kept here for reference.",
  blocked: "Work waiting on an issue or dependency.",
  cancelled: "Tasks that are no longer active.",
};

export default function TaskBoard({
  supabase,
  role,
  disciplineId,
  projectId,
  projectName,
  userId,
  onlyMine,
}: Props) {
  const [summary, setSummary] = useState({ total: 0, progress: 0, done: 0, overdue: 0, attention: 0, statuses: {} as Record<string, number> });
  const [total, setTotal] = useState(0);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [matchingStatuses, setMatchingStatuses] = useState<Record<string, number>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sync, setSync] = useState("Connecting...");
  const [view, setView] = useState("board");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const historyRequest = useRef(0);
  const mutation = useRef(false);
  const pendingRealtime = useRef(false);
  const kanbanRef = useRef<HTMLDivElement | null>(null);
  const dragBoard = useRef({ active: false, startX: 0, startScrollLeft: 0 });
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
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const result = await supabase.rpc("task_board_page", {
        target_project: projectId, page_number: page, page_size: 25,
        search_term: debouncedSearch, status_filter: filter === "all" ? null : filter,
        discipline_filter: disciplineFilter || null, only_mine: onlyMine, as_of: today(),
      }).abortSignal(controller.signal);
      if (version !== request.current || controller.signal.aborted) return;
      if (result.error) throw result.error;
      setTasks(result.data.rows);
      setCapabilities(result.data.capabilities);
      setSummary(result.data.summary);
      setTotal(result.data.total);
      setResolvedPage(result.data.page);
      setMatchingStatuses(result.data.matching_statuses);
      setMessage("");
    } catch (error) {
      if (version === request.current && !controller.signal.aborted) setMessage(errorText(error));
    } finally {
      if (version === request.current && !controller.signal.aborted) setLoading(false);
    }
  }, [supabase, projectId, page, debouncedSearch, filter, disciplineFilter, onlyMine]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      supabase.from("disciplines").select("id, name").order("name").abortSignal(controller.signal),
      supabase.from("profiles").select("id, full_name, role, discipline_id").order("full_name").abortSignal(controller.signal),
    ]).then(([ds, ps]) => {
      if (controller.signal.aborted) return;
      if (ds.error || ps.error) { setMessage(errorText(ds.error ?? ps.error)); return; }
      setDisciplines(ds.data ?? []);
      setPeople((ps.data ?? []) as Profile[]);
    });
    return () => controller.abort();
  }, [supabase, projectId]);
  useEffect(() => {
    const requests = request;
    const pending = abort;
    // Request cancellation prevents an older search overwriting a newer page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { requests.current++; pending.current?.abort(); };
  }, [load]);
  const latestLoad = useRef(load);
  useEffect(() => { latestLoad.current = load; }, [load]);
  useEffect(() => {
    const requests = request;
    const historyRequests = historyRequest;
    let timer: ReturnType<typeof setTimeout>;
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
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (mutation.current) pendingRealtime.current = true;
            else void latestLoad.current();
          }, 150);
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
      clearTimeout(timer);
      requests.current++;
      historyRequests.current++;
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId]);

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p.full_name])), [people]);
  const disciplinesById = useMemo(() => new Map(disciplines.map(d => [d.id, d.name])), [disciplines]);
  const personName = (id: string | null) => id ? (peopleById.get(id) ?? (id === userId ? "You" : "Assigned team member")) : "Unassigned";
  const personInitials = (id: string | null) =>
    personName(id).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "—";
  const disciplineName = (id: string) => disciplinesById.get(id) ?? "Unknown discipline";
  const overdue = (task: Task) => !["completed", "cancelled"].includes(task.status) && !!task.due_date && task.due_date < today();
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const currentPage = resolvedPage;
  const displayed = tasks;
  const { done, progress } = summary;
  function startBoardDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, select, input, a, textarea")) return;
    const board = kanbanRef.current;
    if (!board) return;
    dragBoard.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: board.scrollLeft,
    };
    board.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveBoardDrag(event: React.PointerEvent<HTMLDivElement>) {
    const board = kanbanRef.current;
    if (!board || !dragBoard.current.active) return;
    board.scrollLeft =
      dragBoard.current.startScrollLeft -
      (event.clientX - dragBoard.current.startX);
  }

  function endBoardDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragBoard.current.active) return;
    dragBoard.current.active = false;
    kanbanRef.current?.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveBoardWithKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    const board = kanbanRef.current;
    if (!board) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      board.scrollBy({ left: 320, behavior: "smooth" });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      board.scrollBy({ left: -320, behavior: "smooth" });
    }
  }

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
      await latestLoad.current();
      return true;
    } catch (error) {
      setMessage(errorText(error));
      return false;
    } finally {
      mutation.current = false;
      setSaving(false);
      if (pendingRealtime.current) {
        pendingRealtime.current = false;
        void latestLoad.current();
      }
    }
  }
  async function changeStatus(task: Task, status: Status) {
    await persist(task, { status });
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
              role === "admin" ||
              capabilities.review_disciplines?.includes(task.discipline_id) ||
              ![
                "approved",
                "completed",
                "revision_required",
                "for_resubmission",
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
          <strong>{loading ? "—" : summary.total - done}</strong>
          <small>Ready and in progress</small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Needs attention</span>
          <strong className="warm-number">
            {loading
              ? "—"
              : summary.attention}
          </strong>
          <small>
            {summary.overdue} overdue ·{" "}
            {(summary.statuses.blocked ?? 0)} stuck
          </small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed</span>
          <strong>{loading ? "—" : done}</strong>
          <small>of {summary.total} tasks</small>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>{onlyMine ? "Assigned to me" : "Project tasks"}</h2>
          <p>One task, one owner, a clear next step.</p>
        </div>
        <div className="view-toggle">
          {["board", "table", "gantt"].map((item) => (
            <button
              key={item}
              aria-pressed={view === item}
              className={view === item ? "selected" : ""}
              onClick={() => setView(item)}
            >
              {item === "table" ? "List" : item === "board" ? "Board" : "Gantt"}
            </button>
          ))}
        </div>
      </div>
      <section className="task-panel">
        <div className="board-toolbar">
          <div className="board-toolbar-fields">
            <label className="search-box">
              <input
                aria-label="Search tasks"
                placeholder="Search tasks or people"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <select
              aria-label="Filter discipline"
              value={disciplineFilter}
              onChange={(e) => { setDisciplineFilter(e.target.value); setPage(1); }}
            >
              <option value="">All disciplines</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
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
              onClick={() => { setFilter(status); setPage(1); }}
            >
              {status === "all" ? "All tasks" : labels[status]}
              <span className="filter-count">
                {status === "all"
                  ? summary.total
                  : (summary.statuses[status] ?? 0)}
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
            canManageTask={["admin", "discipline_lead", "project_manager", "project_architect"].includes(role)}
            canReview={
              editor !== "new" &&
              !!capabilities.review_disciplines?.includes(editor.discipline_id)
            }
            people={people}
            disciplineId={disciplineId}
            saving={saving}
            currentUserId={userId}
            onCancel={() => setEditor(null)}
            onSave={async (values) => {
              if (await persist(editor === "new" ? null : editor, values))
                setEditor(null);
            }}
          />
        )}
        {loading ? (
          <LoadingSkeleton />
        ) : total === 0 ? (
          <div className="empty-board">
            <h3>
              {summary.total
                ? "No matching tasks"
                : onlyMine
                  ? "No tasks assigned to you yet"
                  : "Your board is ready"}
            </h3>
            <p>
              {summary.total
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
                    "Design Stage",
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
                    <td>{task.design_stage.replaceAll("_", " ")}</td>
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
        ) : view === "gantt" ? (
          <DetailedGantt
            tasks={displayed}
            disciplines={disciplines}
            people={people}
            scopeLabel={projectName}
            overall={false}
            newTabHref={`/portal/gantt?project=${projectId}`}
          />
        ) : (
          <div
            className="kanban draggable-kanban"
            ref={kanbanRef}
            tabIndex={0}
            aria-label="Task status board. Drag horizontally to move across columns. Use left and right arrow keys when focused."
            onPointerDown={startBoardDrag}
            onPointerMove={moveBoardDrag}
            onPointerUp={endBoardDrag}
            onPointerCancel={endBoardDrag}
            onKeyDown={moveBoardWithKeys}
          >
            {statuses.map((status) => {
              const columnTasks = displayed.filter((task) => task.status === status);
              return (
                <section key={status} className={`kanban-column ${status}`}>
                  <header className="kanban-column-head">
                    <span className="kanban-status-mark" aria-hidden="true" />
                    <div>
                      <h3>{labels[status]}</h3>
                      <small>{statusHelp[status]}</small>
                    </div>
                    <b>{matchingStatuses[status] ?? 0}</b>
                  </header>
                  <div className="kanban-column-body">
                    {columnTasks.map((task) => (
                      <article className="kanban-card" key={task.id}>
                        <div className="kanban-card-top">
                          <span className="kanban-discipline">{disciplineName(task.discipline_id)}</span>
                          <button
                            className="kanban-card-menu"
                            aria-label={`Open ${task.task_name}`}
                            onClick={() => {
                              setEditor(task);
                              setHistoryTask(null);
                            }}
                          >•••</button>
                        </div>
                        <button
                          className="task-title kanban-task-title"
                          onClick={() => {
                            setEditor(task);
                            setHistoryTask(null);
                          }}
                        >
                          {task.task_name}
                        </button>
                        {task.notes && <p className="kanban-card-note">{task.notes}</p>}
                        <div className="kanban-assignee">
                          <i>{personInitials(task.owner)}</i>
                          <span>{personName(task.owner)}</span>
                        </div>
                        <div className="kanban-meta-grid">
                          <span>
                            <small>Due</small>
                            <b className={overdue(task) ? "overdue" : ""}>{task.due_date ? shortDate(task.due_date) : "No date"}</b>
                          </span>
                          <span>
                            <small>Priority</small>
                            <b className={`priority ${task.priority}`}>{task.priority}</b>
                          </span>
                          <span>
                            <small>Design stage</small>
                            <b>{task.design_stage.replaceAll("_", " ")}</b>
                          </span>
                        </div>
                        {statusControl(task)}
                        <div className="kanban-progress-head">
                          <span>Progress</span>
                          <b>{task.percent_complete}%</b>
                        </div>
                        <div className="kanban-progress"><i style={{ width: `${task.percent_complete}%` }} /></div>
                        <button className="kanban-history" onClick={() => void showHistory(task)}>View history →</button>
                      </article>
                    ))}
                    {!columnTasks.length && (
                      <div className="kanban-empty">
                        <span aria-hidden="true">○</span>
                        <b>No tasks here</b>
                        <small>{statusHelp[status]}</small>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
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
          disabled={loading || currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          Page {currentPage} of {pageCount} ? {total} matching tasks
        </span>
        <button
          disabled={loading || currentPage >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </nav>
      <footer className="footer-note">
        <span>{sync}</span>
        <span>
          {role === "admin"
            ? "Admin access"
            : role === "discipline_lead"
              ? "Edit your discipline"
              : "Access follows task permissions"}
        </span>
      </footer>
    </>
  );
}
