"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Discipline, Profile, Status, Task } from "@/app/task-types";

export type DetailedGanttTask = Task & {
  project_id?: string;
  project_name?: string;
  project_code?: string | null;
};

type Zoom = "day" | "week" | "month";
type ModelRow = {
  key: string;
  type: "project" | "discipline" | "task";
  wbs: string;
  label: string;
  task?: DetailedGanttTask;
  owner: string;
  start: number;
  due: number;
  progress: number;
  discipline?: string;
  status?: Status;
  estimatedStart?: boolean;
  estimatedDue?: boolean;
};

const DAY = 86_400_000;
const ROW_HEIGHT = 40;
const dateMs = (value: string) => Date.parse(`${value}T00:00:00Z`);
const isoDay = (value: number) => new Date(value).toISOString().slice(0, 10);
const shortDate = (value: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" }).format(new Date(value));
const monthLabel = (value: number) =>
  new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));

function taskSchedule(task: DetailedGanttTask, now: number) {
  let start = task.start_date ? dateMs(task.start_date) : task.due_date ? dateMs(task.due_date) - (6 * DAY) : now;
  let due = task.due_date ? dateMs(task.due_date) : task.start_date ? dateMs(task.start_date) + (6 * DAY) : now + (6 * DAY);
  if (due < start) [start, due] = [due, start];
  return {
    start,
    due,
    estimatedStart: !task.start_date,
    estimatedDue: !task.due_date,
  };
}

function rangeForTasks(tasks: DetailedGanttTask[], now: number) {
  const schedules = tasks.map((task) => taskSchedule(task, now));
  return {
    start: schedules.length ? Math.min(...schedules.map((item) => item.start)) : now,
    due: schedules.length ? Math.max(...schedules.map((item) => item.due)) : now + (6 * DAY),
    progress: tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.percent_complete, 0) / tasks.length) : 0,
  };
}

function durationDays(start: number, due: number) {
  return Math.max(1, Math.round((due - start) / DAY) + 1);
}

export default function DetailedGantt({
  tasks,
  disciplines,
  people,
  scopeLabel,
  overall,
  printable = false,
  newTabHref,
}: {
  tasks: DetailedGanttTask[];
  disciplines: Discipline[];
  people: Profile[];
  scopeLabel: string;
  overall: boolean;
  printable?: boolean;
  newTabHref?: string;
}) {
  const [zoom, setZoom] = useState<Zoom>(overall ? "month" : "week");
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [paneWidth, setPaneWidth] = useState(760);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0 });

  useEffect(() => {
    const pane = timelineRef.current;
    if (!pane) return;

    const update = () => setPaneWidth(Math.max(320, Math.round(pane.clientWidth)));
    update();

    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

    const disciplineMap = useMemo(() => new Map(disciplines.map((item) => [item.id, item.name])), [disciplines]);
  const peopleMap = useMemo(() => new Map(people.map((item) => [item.id, item.full_name || "Team member"])), [people]);

  const model = useMemo(() => {
    const now = dateMs(new Date().toISOString().slice(0, 10));
    const rows: ModelRow[] = [];

    const addDisciplineRows = (source: DetailedGanttTask[], prefix = "") => {
      const groups = new Map<string, DetailedGanttTask[]>();
      source.forEach((task) => {
        const name = disciplineMap.get(task.discipline_id) ?? "Unassigned discipline";
        const list = groups.get(name) ?? [];
        list.push(task);
        groups.set(name, list);
      });
      [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([discipline, groupTasks], groupIndex) => {
          const groupNumber = prefix ? `${prefix}.${groupIndex + 1}` : `${groupIndex + 1}`;
          const range = rangeForTasks(groupTasks, now);
          rows.push({
            key: `discipline-${prefix}-${discipline}`,
            type: "discipline",
            wbs: groupNumber,
            label: discipline,
            owner: "",
            start: range.start,
            due: range.due,
            progress: range.progress,
            discipline,
          });
          groupTasks
            .slice()
            .sort((a, b) => (a.start_date ?? a.due_date ?? "").localeCompare(b.start_date ?? b.due_date ?? "") || a.task_name.localeCompare(b.task_name))
            .forEach((task, taskIndex) => {
              const schedule = taskSchedule(task, now);
              rows.push({
                key: task.id,
                type: "task",
                wbs: `${groupNumber}.${taskIndex + 1}`,
                label: task.task_name,
                task,
                owner: task.owner ? peopleMap.get(task.owner) ?? "Assigned team member" : "Unassigned",
                start: schedule.start,
                due: schedule.due,
                progress: task.percent_complete,
                discipline,
                status: task.status,
                estimatedStart: schedule.estimatedStart,
                estimatedDue: schedule.estimatedDue,
              });
            });
        });
    };

    if (overall) {
      const projectGroups = new Map<string, DetailedGanttTask[]>();
      tasks.forEach((task) => {
        const key = task.project_id ?? task.project_name ?? "project";
        const list = projectGroups.get(key) ?? [];
        list.push(task);
        projectGroups.set(key, list);
      });
      [...projectGroups.entries()]
        .sort(([, a], [, b]) => (a[0]?.project_name ?? "").localeCompare(b[0]?.project_name ?? ""))
        .forEach(([, projectTasks], projectIndex) => {
          const first = projectTasks[0];
          const range = rangeForTasks(projectTasks, now);
          const projectNumber = `${projectIndex + 1}`;
          rows.push({
            key: `project-${first?.project_id ?? projectIndex}`,
            type: "project",
            wbs: projectNumber,
            label: first?.project_name ?? "Project",
            owner: "",
            start: range.start,
            due: range.due,
            progress: range.progress,
          });
          addDisciplineRows(projectTasks, projectNumber);
        });
    } else {
      addDisciplineRows(tasks);
    }

    const rawStart = rows.length ? Math.min(...rows.map((row) => row.start)) : now;
    const rawEnd = rows.length ? Math.max(...rows.map((row) => row.due)) : now + (30 * DAY);
    const start = rawStart - (2 * DAY);
    const end = Math.max(rawEnd + (2 * DAY), start + (20 * DAY));
    const baseDayWidth = zoom === "day" ? 34 : zoom === "week" ? 18 : 9;
    const days = Math.max(1, Math.ceil((end - start) / DAY) + 1);
    const width = Math.max(paneWidth, days * baseDayWidth);
    const dayWidth = width / days;

    const months: Array<{ key: string; label: string; left: number; width: number }> = [];
    let cursor = new Date(start);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    while (cursor.getTime() <= end) {
      const monthStart = Math.max(start, cursor.getTime());
      const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      const monthEnd = Math.min(end + DAY, next.getTime());
      months.push({
        key: cursor.toISOString(),
        label: monthLabel(cursor.getTime()),
        left: ((monthStart - start) / DAY) * dayWidth,
        width: Math.max(dayWidth, ((monthEnd - monthStart) / DAY) * dayWidth),
      });
      cursor = next;
    }

    const tickEvery = zoom === "day" ? 1 : zoom === "week" ? 7 : 14;
    const ticks: Array<{ key: string; label: string; left: number }> = [];
    for (let index = 0; index < days; index += tickEvery) {
      const at = start + (index * DAY);
      const date = new Date(at);
      ticks.push({
        key: isoDay(at),
        label: zoom === "day"
          ? String(date.getUTCDate()).padStart(2, "0")
          : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date),
        left: index * dayWidth,
      });
    }

    const todayLeft = ((now - start) / DAY) * dayWidth;

    return { rows, start, end, width, dayWidth, months, ticks, todayLeft };
  }, [tasks, disciplineMap, peopleMap, overall, zoom, paneWidth]);

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const pane = timelineRef.current;
    if (!pane) return;
    drag.current = { active: true, startX: event.clientX, scrollLeft: pane.scrollLeft };
    pane.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pane = timelineRef.current;
    if (!pane || !drag.current.active) return;
    pane.scrollLeft = drag.current.scrollLeft - (event.clientX - drag.current.startX);
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    timelineRef.current?.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function keyboardPan(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!timelineRef.current) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      timelineRef.current.scrollBy({ left: 280, behavior: "smooth" });
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      timelineRef.current.scrollBy({ left: -280, behavior: "smooth" });
    }
  }

  function exportPdf() {
    const previous = zoom;
    if (zoom !== "month") setZoom("month");
    const restore = () => {
      window.removeEventListener("afterprint", restore);
      setZoom(previous);
    };
    window.addEventListener("afterprint", restore);
    window.setTimeout(() => window.print(), zoom === "month" ? 0 : 120);
  }

  return (
    <section className={`gantt-pro ${detailsCollapsed ? "details-collapsed" : ""}`}>
      <div className="gantt-pro-titlebar">
        <div>
          <b>Detailed task Gantt</b>
          <small>{scopeLabel} · {tasks.length} task{tasks.length === 1 ? "" : "s"} · drag timeline to move</small>
        </div>
        <div className="gantt-pro-actions">
          <button
            className="gantt-details-toggle"
            type="button"
            onClick={() => setDetailsCollapsed((value) => !value)}
            aria-label="Toggle task details"
          >
            <span className="gantt-details-toggle-desktop">{detailsCollapsed ? "Show details" : "Hide details"}</span>
            <span className="gantt-details-toggle-mobile">{detailsCollapsed ? "Timeline" : "Task details"}</span>
          </button>
          <div className="gantt-pro-zoom" aria-label="Gantt zoom">
            {(["day", "week", "month"] as Zoom[]).map((item) => (
              <button key={item} className={zoom === item ? "selected" : ""} onClick={() => setZoom(item)}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          {newTabHref && <a className="button secondary compact" href={newTabHref} target="_blank" rel="noreferrer">Open full Gantt ↗</a>}
          {printable && <button className="button primary compact" onClick={exportPdf}>Export PDF</button>}
        </div>
      </div>

      {!tasks.length ? (
        <div className="gantt-pro-empty">
          <b>No scheduled tasks yet</b>
          <p>Add project tasks with start and due dates to build the Gantt chart.</p>
        </div>
      ) : (
        <div className="gantt-pro-shell">
          <div className="gantt-pro-left">
            <div className="gantt-pro-left-head">
              <span>WBS</span><span>Task name</span><span>Owner</span><span>Duration</span><span>Start</span><span>Finish</span><span>Progress</span>
            </div>
            <div className="gantt-pro-left-body">
              {model.rows.map((row) => (
                <div className={`gantt-pro-left-row ${row.type}`} key={row.key}>
                  <span className="gantt-wbs">{row.wbs}</span>
                  <span className="gantt-name">
                    {row.type !== "task" && <i aria-hidden="true">▾</i>}
                    <b>{row.label}</b>
                    {row.type === "task" && <small>{row.discipline} · {row.task?.priority} priority</small>}
                  </span>
                  <span className="gantt-owner">{row.owner || "—"}</span>
                  <span>{durationDays(row.start, row.due)}d</span>
                  <span>{shortDate(row.start)}{row.estimatedStart ? " *" : ""}</span>
                  <span>{shortDate(row.due)}{row.estimatedDue ? " *" : ""}</span>
                  <span className="gantt-progress-value">{row.progress}%</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="gantt-pro-timeline-pane"
            ref={timelineRef}
            tabIndex={0}
            aria-label="Gantt timeline. Drag horizontally or use left and right arrow keys."
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
            onKeyDown={keyboardPan}
          >
            <div className="gantt-pro-timeline" style={{ width: model.width }}>
              <div className="gantt-pro-calendar">
                <div className="gantt-pro-months">
                  {model.months.map((month) => (
                    <span key={month.key} style={{ left: month.left, width: month.width }}>{month.label}</span>
                  ))}
                </div>
                <div className="gantt-pro-ticks">
                  {model.ticks.map((tick) => <span key={tick.key} style={{ left: tick.left }}>{tick.label}</span>)}
                </div>
              </div>
              <div
                className="gantt-pro-timeline-body"
                style={{
                  backgroundSize: `${model.dayWidth}px 100%`,
                  height: model.rows.length * ROW_HEIGHT,
                }}
              >
                {model.todayLeft >= 0 && model.todayLeft <= model.width && (
                  <span className="gantt-pro-today" style={{ left: model.todayLeft }}><b>Today</b></span>
                )}
                {model.rows.map((row, index) => {
                  const left = ((row.start - model.start) / DAY) * model.dayWidth;
                  const width = Math.max(row.type === "task" ? 8 : 14, ((row.due - row.start + DAY) / DAY) * model.dayWidth);
                  return (
                    <div className={`gantt-pro-time-row ${row.type}`} key={row.key} style={{ top: index * ROW_HEIGHT }}>
                      {row.type === "task" ? (
                        <span
                          className={`gantt-pro-bar task ${row.status ?? "not_started"}`}
                          style={{ left, width }}
                          title={`${row.label}: ${shortDate(row.start)} to ${shortDate(row.due)} · ${row.progress}%`}
                        >
                          <i style={{ width: `${row.progress}%` }} />
                          {width > 76 && <b>{row.progress}%</b>}
                        </span>
                      ) : (
                        <span
                          className={`gantt-pro-bar summary ${row.type}`}
                          style={{ left, width }}
                          title={`${row.label}: ${shortDate(row.start)} to ${shortDate(row.due)}`}
                        >
                          <i />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      <small className="gantt-pro-note">* Estimated date when a task start or due date is missing. PDF export switches temporarily to month zoom for a cleaner landscape print.</small>
    </section>
  );
}
