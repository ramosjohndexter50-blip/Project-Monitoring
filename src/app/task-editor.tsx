"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import type { Profile } from "./workspace";
import { labels, statuses, type Status, type Task, type Discipline } from "./task-types";

export default function TaskEditor({
  task,
  projectAdmin,
  canReview,
  disciplines,
  people,
  disciplineId,
  saving,
  onCancel,
  onSave,
}: {
  task: Task | null;
  projectAdmin: boolean;
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
    if (!projectAdmin && task) {
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
            readOnly={!projectAdmin && !!task}
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
            disabled={!projectAdmin && !!task}
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
            readOnly={!projectAdmin && !!task}
            value={draft.due_date}
            onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
          />
        </label>
        <label>
          Priority
          <select
            disabled={!projectAdmin && !!task}
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
                  projectAdmin ||
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
            readOnly={!projectAdmin && !!task}
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
