export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "date"
    | "number"
    | "checkbox"
    | "select"
    | "email";
  required?: boolean;
  options?: string[];
  reference?: string;
  immutable?: boolean;
  min?: number;
  max?: number;
};
export type Module = {
  title: string;
  table: string;
  permission: string;
  fields: Field[];
  columns: string[];
  search: string;
  project?: boolean;
  readOnly?: boolean;
  admin?: boolean;
  removable?: boolean;
  key?: string;
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
const ref = (
  key: string,
  label: string,
  reference: string,
  required = false,
): Field => f(key, label, "select", { reference, required });
const status = (options: string[]) =>
  f("status", "Status", "select", { options, required: true });
const priority = f("priority", "Priority", "select", {
  options: ["low", "medium", "high", "critical"],
  required: true,
});
const discipline = ref("discipline_id", "Discipline", "disciplines", true);
const owner = ref("owner", "Responsible person", "profiles");
const dates = [
  f("start_date", "Start date", "date"),
  f("due_date", "Due date", "date"),
];
const project = ref("project_id", "Project", "projects", true);
export const taskStatuses = [
  "not_started",
  "in_progress",
  "for_review",
  "revision_required",
  "approved",
  "completed",
  "blocked",
  "cancelled",
];
export const deliverableTypes = [
  "Drawing Package",
  "Design Report",
  "Specification",
  "BOQ",
  "Presentation",
  "Model",
  "Calculation",
  "Permit Document",
  "Tender Package",
];
export const modules: Record<string, Module> = {
  projects: {
    title: "Project register",
    table: "projects",
    permission: "projects",
    search: "name",
    columns: [
      "project_code",
      "name",
      "client_name",
      "status",
      "target_date",
      "priority",
    ],
    fields: [
      f("name", "Project name", "text", { required: true }),
      f("project_code", "Project code", "text", { required: true }),
      f("client_name", "Client"),
      f("description", "Description", "textarea"),
      f("project_type", "Project type"),
      f("location", "Location"),
      status([
        "planning",
        "concept_design",
        "schematic_design",
        "design_development",
        "construction_documents",
        "tender",
        "construction",
        "closeout",
        "on_hold",
        "completed",
        "cancelled",
        "ongoing",
      ]),
      priority,
      f("start_date", "Start date", "date"),
      f("target_date", "Target completion", "date"),
      f("actual_completion_date", "Actual completion", "date"),
      ref("project_manager", "Project manager", "profiles"),
      ref("project_architect", "Project architect", "profiles"),
      f("contract_information", "Contract information", "textarea"),
      f("budget", "Contract value", "number", { min: 0 }),
    ],
  },
  users: {
    title: "Employee management",
    table: "profiles",
    permission: "users",
    admin: true,
    search: "full_name",
    columns: [
      "full_name",
      "email",
      "role",
      "discipline_id",
      "position",
      "is_active",
      "last_login_at",
    ],
    fields: [
      f("full_name", "Full name", "text", { required: true }),
      f("employee_code", "Employee / consultant ID"),
      f("position", "Position", "text", { required: true }),
      f("company", "Company"),
      f("department", "Department"),
      f("phone", "Phone"),
      f("avatar_url", "Avatar URL"),
      ref("discipline_id", "Discipline", "disciplines", true),
      ref("role", "Global role", "roles", true),
      f("is_active", "Active account", "checkbox"),
    ],
  },
  roles: {
    title: "Roles",
    table: "roles",
    permission: "roles",
    admin: true,
    key: "key",
    search: "name",
    columns: ["key", "name", "description", "is_system"],
    fields: [
      f("key", "Role key", "text", { required: true, immutable: true }),
      f("name", "Role name", "text", { required: true }),
      f("description", "Description", "textarea"),
    ],
  },
  permissions: {
    title: "Permission catalog",
    table: "permissions",
    permission: "roles",
    admin: true,
    readOnly: true,
    key: "key",
    search: "key",
    columns: ["key", "description"],
    fields: [],
  },
  role_permissions: {
    title: "Role permissions",
    table: "role_permissions",
    permission: "roles",
    admin: true,
    search: "role_key",
    columns: ["role_key", "permission_key"],
    fields: [
      ref("role_key", "Role", "roles", true),
      ref("permission_key", "Permission", "permissions", true),
    ],
    removable: true,
  },
  overrides: {
    title: "Project permission overrides",
    table: "project_permission_overrides",
    permission: "roles",
    admin: true,
    search: "permission_key",
    columns: ["project_id", "user_id", "permission_key", "allowed"],
    fields: [
      project,
      ref("user_id", "User", "profiles", true),
      ref("permission_key", "Permission", "permissions", true),
      f("allowed", "Allow (unchecked = deny)", "checkbox"),
    ],
    removable: true,
  },
  disciplines: {
    title: "Discipline directory",
    table: "disciplines",
    permission: "disciplines",
    admin: true,
    search: "name",
    columns: ["name", "description", "color_code", "is_active"],
    fields: [
      f("name", "Discipline name", "text", { required: true }),
      f("description", "Description", "textarea"),
      f("color_code", "Color (#RRGGBB)"),
      f("is_active", "Active discipline", "checkbox"),
    ],
  },
  teams: {
    title: "Project teams",
    table: "project_members",
    permission: "teams",
    project: true,
    search: "role_key",
    columns: ["project_id", "user_id", "role_key", "discipline_id"],
    fields: [
      project,
      ref("user_id", "Team member", "profiles", true),
      ref("role_key", "Project role", "project_roles", true),
      ref("discipline_id", "Employee discipline", "disciplines", true),
    ],
    removable: true,
  },
  project_disciplines: {
    title: "Project disciplines",
    table: "project_disciplines",
    permission: "teams",
    project: true,
    search: "status",
    columns: [
      "project_id",
      "discipline_id",
      "assigned_lead",
      "is_active",
      "status",
      "progress",
      "target_date",
    ],
    fields: [
      project,
      discipline,
      ref("assigned_lead", "Discipline lead", "profiles"),
      f("is_active", "Active contributor", "checkbox"),
      status(["planning", "in_progress", "on_hold", "completed"]),
      f("progress", "Progress %", "number", { min: 0, max: 100 }),
      f("target_date", "Target date", "date"),
    ],
  },
  phases: {
    title: "Design phases",
    table: "project_phases",
    permission: "projects",
    project: true,
    search: "name",
    columns: ["name", "sequence", "status", "start_date", "due_date"],
    fields: [
      f("name", "Phase name", "text", { required: true }),
      f("description", "Description", "textarea"),
      f("sequence", "Sequence", "number", { required: true, min: 1 }),
      status(["planning", "in_progress", "completed", "on_hold"]),
      ...dates,
    ],
  },
  tasks: {
    title: "Task register",
    table: "tasks",
    permission: "tasks",
    project: true,
    search: "task_name",
    columns: [
      "task_name",
      "discipline_id",
      "owner",
      "status",
      "priority",
      "due_date",
      "percent_complete",
    ],
    fields: [
      f("task_name", "Task title", "text", { required: true }),
      f("notes", "Description / notes", "textarea"),
      f("progress_note", "Progress note", "textarea"),
      discipline,
      owner,
      priority,
      status(taskStatuses),
      ...dates,
      f("percent_complete", "Progress %", "number", { min: 0, max: 100 }),
      ref("parent_task_id", "Parent task", "tasks"),
      ref("deliverable_id", "Deliverable", "deliverables"),
      ref("milestone_id", "Milestone", "milestones"),
      ref("phase_id", "Phase", "project_phases"),
    ],
  },
  milestones: {
    title: "Milestones",
    table: "milestones",
    permission: "milestones",
    project: true,
    search: "name",
    columns: [
      "name",
      "discipline_id",
      "owner",
      "due_date",
      "status",
      "progress",
    ],
    fields: [
      f("name", "Milestone name", "text", { required: true }),
      f("description", "Description", "textarea"),
      ref("discipline_id", "Discipline", "disciplines", true),
      ref("phase_id", "Phase", "project_phases"),
      owner,
      f("due_date", "Target date", "date"),
      f("actual_date", "Actual date", "date"),
      status(["planned", "in_progress", "completed", "on_hold"]),
      f("progress", "Progress %", "number", { min: 0, max: 100 }),
    ],
  },
  deliverables: {
    title: "Deliverable register",
    table: "deliverables",
    permission: "deliverables",
    project: true,
    search: "title",
    columns: [
      "title",
      "deliverable_type",
      "discipline_id",
      "owner",
      "revision",
      "due_date",
      "status",
      "approval_status",
    ],
    fields: [
      f("title", "Title", "text", { required: true }),
      f("deliverable_type", "Deliverable type", "select", {
        required: true,
        options: deliverableTypes,
      }),
      f("description", "Description", "textarea"),
      discipline,
      owner,
      ref("phase_id", "Phase", "project_phases"),
      ref("milestone_id", "Milestone", "milestones"),
      f("revision", "Revision", "text", { required: true }),
      f("submission_date", "Submission date", "date"),
      f("due_date", "Due date", "date"),
      status([
        "draft",
        "internal_review",
        "coordination",
        "client_review",
        "for_approval",
        "approved",
        "revise_resubmit",
        "issued",
      ]),
    ],
  },
  documents: {
    title: "Document register",
    table: "documents",
    permission: "documents",
    project: true,
    search: "title",
    columns: [
      "document_number",
      "title",
      "discipline_id",
      "revision",
      "document_type",
      "status",
      "created_at",
    ],
    fields: [
      f("document_number", "Document number", "text", { required: true }),
      f("title", "Title", "text", { required: true }),
      discipline,
      f("revision", "Revision", "text", { required: true }),
      f("document_type", "Document type", "text", { required: true }),
      status(["draft", "review", "issued", "superseded", "archived"]),
      ref("task_id", "Related task", "tasks"),
      ref("deliverable_id", "Related deliverable", "deliverables"),
      ref("rfi_id", "Related RFI", "rfis"),
      ref("issue_id", "Related issue", "issues"),
    ],
  },
  rfis: {
    title: "Request for information",
    table: "rfis",
    permission: "rfis",
    project: true,
    search: "subject",
    columns: [
      "rfi_number",
      "subject",
      "discipline_id",
      "owner",
      "priority",
      "due_date",
      "status",
    ],
    fields: [
      f("rfi_number", "RFI number", "text", { required: true }),
      f("subject", "Subject", "text", { required: true }),
      f("question", "Question", "textarea", { required: true }),
      discipline,
      owner,
      priority,
      f("due_date", "Required response date", "date"),
      f("response", "Response", "textarea"),
      status(["open", "under_review", "responded", "closed", "cancelled"]),
    ],
  },
  issues: {
    title: "Coordination issues",
    table: "issues",
    permission: "issues",
    project: true,
    search: "title",
    columns: [
      "issue_number",
      "title",
      "discipline_id",
      "owner",
      "severity",
      "due_date",
      "status",
    ],
    fields: [
      f("issue_number", "Issue number", "text", { required: true }),
      f("title", "Title", "text", { required: true }),
      f("description", "Description", "textarea"),
      discipline,
      owner,
      f("severity", "Severity", "select", {
        required: true,
        options: ["low", "medium", "high", "critical"],
      }),
      f("due_date", "Due date", "date"),
      status(["open", "in_progress", "resolved", "closed", "cancelled"]),
      f("resolution", "Resolution", "textarea"),
    ],
  },
  workflows: {
    title: "Approval workflows",
    table: "approval_workflows",
    permission: "workflows",
    project: true,
    search: "name",
    columns: ["name", "deliverable_type", "is_active"],
    fields: [
      f("name", "Workflow name", "text", { required: true }),
      f("deliverable_type", "Deliverable type", "select", {
        required: true,
        options: deliverableTypes,
      }),
      f("is_active", "Active workflow", "checkbox"),
    ],
  },
  workflow_steps: {
    title: "Workflow reviewers",
    table: "workflow_steps",
    permission: "workflows",
    search: "name",
    columns: ["workflow_id", "sequence", "name", "reviewer"],
    fields: [
      ref("workflow_id", "Workflow", "approval_workflows", true),
      f("sequence", "Step order", "number", { required: true, min: 1 }),
      f("name", "Step name", "text", { required: true }),
      ref("reviewer", "Reviewer", "profiles", true),
    ],
    removable: true,
  },
  approvals: {
    title: "Review & approval queue",
    table: "approvals",
    permission: "deliverables",
    project: true,
    readOnly: true,
    search: "status",
    columns: [
      "deliverable_id",
      "revision",
      "submitted_by",
      "status",
      "created_at",
    ],
    fields: [],
  },
  notifications: {
    title: "Notification center",
    table: "notifications",
    permission: "",
    readOnly: true,
    search: "title",
    columns: ["title", "entity_type", "read_at", "created_at"],
    fields: [],
  },
  audit: {
    title: "Audit & activity log",
    table: "audit_logs",
    permission: "audit",
    admin: true,
    readOnly: true,
    search: "entity",
    columns: [
      "actor_id",
      "action",
      "entity",
      "entity_id",
      "project_id",
      "created_at",
      "metadata",
    ],
    fields: [],
  },
  settings: {
    title: "System settings",
    table: "system_settings",
    permission: "settings",
    admin: true,
    key: "key",
    search: "key",
    columns: ["key", "value", "updated_at"],
    fields: [
      f("key", "Setting key", "text", { required: true, immutable: true }),
      f("value", "Value", "text", { required: true }),
    ],
  },
};
export function getModule(key: string) {
  const config = modules[key];
  if (!config) throw new Error("Unknown module");
  return config;
}
export const label = (value: string) =>
  (
    ({
      project_id: "Project",
      discipline_id: "Discipline",
      owner: "Responsible Person",
      user_id: "Team Member",
      actor_id: "User",
      role_key: "Role",
      is_active: "Active",
      created_at: "Created",
      updated_at: "Updated",
      due_date: "Due Date",
      deliverable_id: "Deliverable",
      workflow_id: "Workflow",
      submitted_by: "Submitted By",
      reviewer: "Reviewer",
    }) as Record<string, string>
  )[value] ??
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export type DataRow = Record<string, string | number | boolean | null | object>;
export type Choices = Record<
  string,
  { value: string; label: string; disciplineId?: string }[]
>;
