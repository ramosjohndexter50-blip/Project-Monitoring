export type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  discipline_id: string | null;
};

export type Status =
  | "not_started"
  | "in_progress"
  | "for_review"
  | "revision_required"
  | "approved"
  | "completed"
  | "blocked"
  | "cancelled";
export type ProgressStage = "model" | "annotation" | "coordination" | "sheet";
export type Task = {
  id: string;
  task_name: string;
  discipline_id: string;
  owner: string | null;
  status: Status;
  priority: "low" | "medium" | "high" | "critical";
  progress_stage: ProgressStage;
  start_date: string | null;
  due_date: string | null;
  percent_complete: number;
  notes: string | null;
  progress_note: string | null;
  updated_at: string;
};
export type Discipline = { id: string; name: string };
export const labels: Record<Status, string> = {
  not_started: "Assigned",
  in_progress: "In progress",
  for_review: "For review",
  revision_required: "Revision required",
  approved: "Approved",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};
export const statuses = Object.keys(labels) as Status[];

export const progressStageLabels: Record<ProgressStage, string> = {
  model: "Model - % Complete",
  annotation: "Annotation - % Complete",
  coordination: "Coordination - % Complete",
  sheet: "Sheet - % Complete",
};
export const progressStages = Object.keys(progressStageLabels) as ProgressStage[];
