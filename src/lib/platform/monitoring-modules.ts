export type Field = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "checkbox" | "select" | "email";
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

export type DataRow = Record<string, string | number | boolean | null | object>;
export type Choices = Record<string, { value: string; label: string; disciplineId?: string }[]>;

const f = (key: string, label: string, type: Field["type"] = "text", extra: Partial<Field> = {}): Field => ({ key, label, type, ...extra });
const ref = (key: string, label: string, reference: string, required = false): Field => f(key, label, "select", { reference, required });
const status = (options: string[]) => f("status", "Status", "select", { options, required: true });
const priority = f("priority", "Priority", "select", { options: ["low", "medium", "high", "critical"], required: true });
const discipline = ref("discipline_id", "Discipline", "disciplines", true);
const owner = ref("owner", "Assigned employee", "profiles", true);
const dates = [f("start_date", "Start date", "date"), f("due_date", "Due date", "date")];
const project = ref("project_id", "Project", "projects", true);

export const taskStatuses = ["not_started", "in_progress", "for_review", "revision_required", "approved", "completed", "blocked", "cancelled"];

export const modules: Record<string, Module> = {
  settings: {
    title: "Web settings", table: "system_settings", permission: "settings", admin: true,
    key: "key", search: "key", columns: ["key", "value"],
    fields: [f("key", "Setting key", "text", { required: true, immutable: true }), f("value", "Value", "text", { required: true })],
  },
  teams: {
    title: "Project team", table: "project_members", permission: "teams", project: true,
    search: "role_key", columns: ["project_id", "user_id", "role_key", "discipline_id"], removable: true,
    fields: [ref("user_id", "Employee", "profiles", true), ref("role_key", "Project role", "project_roles", true), discipline],
  },
  projects: {
    title: "Projects",
    table: "projects",
    permission: "projects",
    search: "name",
    columns: ["project_code", "name", "client_name", "status", "target_date", "priority"],
    fields: [
      f("name", "Project name", "text", { required: true }),
      f("project_code", "Project code", "text", { required: true }),
      f("client_name", "Client"),
      f("description", "Description", "textarea"),
      f("project_type", "Project type"),
      f("location", "Location"),
      status(["planning", "ongoing", "on_hold", "completed", "cancelled"]),
      priority,
      f("start_date", "Start date", "date"),
      f("target_date", "Target completion", "date"),
      f("actual_completion_date", "Actual completion", "date"),
      ref("project_manager", "Project manager", "profiles"),
      ref("project_architect", "Project architect", "profiles"),
    ],
  },
  tasks: {
    title: "Tasks",
    table: "tasks",
    permission: "tasks",
    project: true,
    search: "task_name",
    columns: ["task_name", "discipline_id", "owner", "status", "priority", "due_date", "percent_complete"],
    fields: [
      f("task_name", "Task", "text", { required: true }),
      f("notes", "Task description", "textarea"),
      discipline,
      owner,
      priority,
      status(taskStatuses),
      ...dates,
      f("percent_complete", "Progress %", "number", { min: 0, max: 100 }),
      f("progress_note", "Progress update", "textarea"),
    ],
  },
  notifications: {
    title: "Notifications",
    table: "notifications",
    permission: "notifications",
    readOnly: true,
    search: "title",
    columns: ["title", "created_at", "read_at"],
    fields: [],
  },
  users: {
    title: "Employee management",
    table: "profiles",
    permission: "users",
    admin: true,
    search: "full_name",
    columns: ["full_name", "email", "role", "discipline_id", "position", "is_active", "last_login_at"],
    fields: [
      f("full_name", "Full name", "text", { required: true }),
      f("employee_code", "Employee ID"),
      f("position", "Position", "text", { required: true }),
      f("company", "Company"),
      f("department", "Department"),
      f("phone", "Phone"),
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
    fields: [f("key", "Role key", "text", { required: true, immutable: true }), f("name", "Role name", "text", { required: true }), f("description", "Description", "textarea")],
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
    fields: [ref("role_key", "Role", "roles", true), ref("permission_key", "Permission", "permissions", true)],
    removable: true,
  },
  overrides: {
    title: "Permission overrides",
    table: "project_permission_overrides",
    permission: "roles",
    admin: true,
    search: "permission_key",
    columns: ["project_id", "user_id", "permission_key", "allowed"],
    fields: [project, ref("user_id", "User", "profiles", true), ref("permission_key", "Permission", "permissions", true), f("allowed", "Allow", "checkbox")],
    removable: true,
  },
  disciplines: {
    title: "Disciplines",
    table: "disciplines",
    permission: "disciplines",
    admin: true,
    search: "name",
    columns: ["name", "description", "is_active"],
    fields: [f("name", "Discipline name", "text", { required: true }), f("description", "Description", "textarea"), f("is_active", "Active discipline", "checkbox")],
  },
};

export function getModule(key: string) {
  const config = modules[key];
  if (!config) throw new Error("Unknown monitoring module");
  return config;
}

export const label = (value: string) =>
  ({ project_id: "Project", discipline_id: "Discipline", owner: "Assigned Employee", due_date: "Due date", start_date: "Start date", percent_complete: "Progress %", progress_note: "Progress update", task_name: "Task", client_name: "Client", project_code: "Project code", target_date: "Target completion", actual_completion_date: "Actual completion" } as Record<string, string>)[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
