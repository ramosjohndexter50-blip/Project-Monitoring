"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { designStageLabels, designStages, labels, progressStageLabels, progressStages, statuses, type DesignStage, type Status, type Task, type Discipline, type Profile, type ProgressStage } from "./task-types";

export default function TaskEditor({
  task,
  canManageTask,
  canReview,
  disciplines,
  people,
  disciplineId,
  saving,
  currentUserId,
  onCancel,
  onSave,
}: {
  task: Task | null;
  canManageTask: boolean;
  canReview: boolean;
  disciplines: Discipline[];
  people: Profile[];
  disciplineId: string | null;
  saving: boolean;
  currentUserId: string;
  onCancel: () => void;
  onSave: (values: Partial<Task>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    task_name: task?.task_name ?? "",
    discipline_id: task?.discipline_id ?? disciplineId ?? "",
    owner: task?.owner ?? (canManageTask ? "" : currentUserId),
    start_date: task?.start_date ?? "",
    due_date: task?.due_date ?? "",
    priority: task?.priority ?? "medium",
    progress_stage: task?.progress_stage ?? "",
    design_stage: task?.design_stage ?? "",
    status: task?.status ?? "not_started",
    notes: task?.notes ?? "",
    progress_note: task?.progress_note ?? "",
  });
  const editable =
    disciplines.some((d) => d.id === draft.discipline_id) ||
    (!task && disciplines.length > 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.task_name.trim() || !editable) return;
    if (!task && (!draft.progress_stage || !draft.design_stage || !draft.owner || !draft.start_date || !draft.due_date)) return;
    if (!canManageTask && task) {
      await onSave({
        status: draft.status,
        progress_note: draft.progress_note,
      });
      return;
    }
    await onSave({
      ...draft,
      task_name: draft.task_name.trim(),
      owner: canManageTask ? (draft.owner || null) : currentUserId,
      start_date: draft.start_date,
      due_date: draft.due_date,
      progress_stage: draft.progress_stage as ProgressStage,
      design_stage: draft.design_stage as DesignStage,
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
            readOnly={!canManageTask && !!task}
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
            required
            disabled={!canManageTask}
            value={draft.owner}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          >
            {canManageTask && <option value="">Choose owner</option>}
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
          Start date
          <input
            type="date"
            required
            readOnly={!canManageTask && !!task}
            max={draft.due_date || undefined}
            value={draft.start_date}
            onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
          />
        </label>
        <label>
          Due date
          <input
            type="date"
            required
            readOnly={!canManageTask && !!task}
            min={draft.start_date || undefined}
            value={draft.due_date}
            onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
          />
        </label>
        <label>
          Priority
          <select
            disabled={!canManageTask && !!task}
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
          Design Stage
          <select
            required
            disabled={!canManageTask && !!task}
            value={draft.design_stage}
            onChange={(e) => setDraft({ ...draft, design_stage: e.target.value as DesignStage })}
          >
            <option value="">Choose design stage</option>
            {designStages.map((stage) => (
              <option key={stage} value={stage}>{designStageLabels[stage]}</option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select
            required
            disabled={!canManageTask && !!task}
            value={draft.progress_stage}
            onChange={(e) => setDraft({ ...draft, progress_stage: e.target.value as ProgressStage })}
          >
            <option value="">Choose progress category</option>
            {progressStages.map((stage) => (
              <option key={stage} value={stage}>{progressStageLabels[stage]}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            required
            value={draft.status}
            onChange={(e) => {
              const status = e.target.value as Status;
              setDraft({ ...draft, status });
            }}
          >
            {statuses
              .filter(
                (s) =>
                  canManageTask ||
                  canReview ||
                  ![
                    "approved",
                    "completed",
                    "revision_required",
                    "for_resubmission",
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
        <label className="wide">
          Notes / blocker
          <textarea
            rows={3}
            readOnly={!canManageTask && !!task}
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
        {canManageTask
          ? "Choose an owner from the people available in this project and discipline."
          : "New tasks are assigned to you automatically. An admin or project lead can reassign them."}
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
