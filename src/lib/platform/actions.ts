"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { permission, session } from "./auth";
import { getModule } from "./modules";
import { authAdmin } from "@/lib/supabase/admin";
export type ActionResult = { ok: boolean; message: string; link?: string };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorMessage = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Unable to save. Please try again.";
export async function saveRecord(
  moduleKey: string,
  id: string | null,
  projectId: string | null,
  form: FormData,
): Promise<ActionResult> {
  try {
    const config = getModule(moduleKey);
    if (moduleKey === "users" && !id)
      throw new Error(
        "Use Create user account to create a Supabase Auth account.",
      );
    if (config.readOnly) throw new Error("This register is read-only.");
    const context = await session();
    if (
      ["users", "disciplines", "settings"].includes(moduleKey) &&
      context.profile.role !== "super_admin"
    )
      throw new Error("Only Super Admin can manage accounts and web settings.");
    if (["projects", "teams", "project_disciplines"].includes(moduleKey) && context.profile.role !== "admin")
      throw new Error("Only Admin can manage projects and project assignments.");
    if (config.admin) await permission("admin.access");
    let project = projectId;
    let existing: Record<string, unknown> | null = null;
    if (id) {
      const row = await context.db
        .from(config.table)
        .select([config.key ?? "id", ...(config.project ? ["project_id"] : []), ...(config.fields.some(f => f.key === "discipline_id") ? ["discipline_id"] : [])].join(","))
        .eq(config.key ?? "id", id)
        .maybeSingle();
      if (row.error) throw row.error;
      if (!row.data) throw new Error("Record unavailable or access denied.");
      existing = row.data as unknown as Record<string, unknown>;
      if (config.project) project = String(existing.project_id);
    }
    if (moduleKey === "projects" && id) project = id;
    if (moduleKey === "workflow_steps") {
      const parent = await context.db
        .from("approval_workflows")
        .select("project_id")
        .eq("id", String(form.get("workflow_id")))
        .single();
      if (parent.error) throw parent.error;
      project = parent.data.project_id;
    }
    const permissionKey =
      moduleKey === "settings"
        ? "settings.manage"
        : `${config.permission}.${id ? "update" : "create"}`;
    const discipline =
      String(existing?.discipline_id ?? form.get("discipline_id") ?? "") ||
      null;
    await permission(permissionKey, config.admin ? null : project, discipline);
    const values: Record<string, unknown> = {};
    for (const field of config.fields) {
      if (
        moduleKey === "tasks" &&
        context.profile.role !== "admin" &&
        !["status", "percent_complete", "progress_note"].includes(field.key)
      )
        continue;
      if (
        id &&
        (field.immutable ||
          (config.project &&
            ["project_id", "discipline_id"].includes(field.key)))
      )
        continue;
      const raw = form.get(field.key);
      const value = typeof raw === "string" ? raw.trim() : "";
      if (field.type === "checkbox") {
        values[field.key] = raw === "on";
        continue;
      }
      if (field.required && !value)
        throw new Error(`${field.label} is required.`);
      if (value.length > 10000) throw new Error(`${field.label} is too long.`);
      if (field.options && value && !field.options.includes(value))
        throw new Error(`Invalid ${field.label}.`);
      if (
        field.reference &&
        value &&
        !["roles", "project_roles", "permissions"].includes(field.reference) &&
        !uuid.test(value)
      )
        throw new Error(`Invalid ${field.label}.`);
      if (
        field.type === "date" &&
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw new Error(`Invalid ${field.label}.`);
      if (field.type === "number" && value) {
        const n = Number(value);
        if (
          !Number.isFinite(n) ||
          (field.min !== undefined && n < field.min) ||
          (field.max !== undefined && n > field.max)
        )
          throw new Error(`Invalid ${field.label}.`);
        values[field.key] = n;
      } else if (
        !id &&
        !value &&
        ["color_code", "revision", "deliverable_type", "percent_complete", "progress"].includes(
          field.key,
        )
      )
        continue;
      else values[field.key] = value || null;
    }
    if (config.project) {
      if (!project || !uuid.test(project)) throw new Error("Select a project.");
      values.project_id = project;
    }
    if (moduleKey === "projects" && !id) values.created_by = context.user.id;
    if (
      moduleKey === "roles" &&
      !id &&
      !/^[a-z][a-z0-9_]{2,50}$/.test(String(values.key))
    )
      throw new Error(
        "Role key must use lowercase letters, digits and underscores.",
      );
    if (
      moduleKey === "disciplines" &&
      values.color_code &&
      !/^#[0-9a-f]{6}$/i.test(String(values.color_code))
    )
      throw new Error("Use a color such as #73a6a0.");
    if (moduleKey === "documents" && !id) {
      await permission("documents.upload", project, discipline);
      const path = String(form.get("storage_path") || "");
      if (!path.startsWith(`${project}/${discipline}/`))
        throw new Error("Upload a document first.");
      values.storage_path = path;
      values.uploaded_by = context.user.id;
    }
    if (
      values.start_date &&
      (values.due_date || values.target_date) &&
      String(values.start_date) > String(values.due_date || values.target_date)
    )
      throw new Error("End date must be on or after start date.");
    if (moduleKey === "projects") {
      const contributors = form.getAll("contributors").map(String);
      if (contributors.some((value) => !uuid.test(value)))
        throw new Error("Invalid contributing discipline.");
      const result = await context.db.rpc("save_project_contributors", {
        target_project: id,
        fields: values,
        contributors,
        expected_updated: form.get("_updated_at") || null,
      });
      if (result.error) throw result.error;
    } else if (id) {
      let query = context.db
        .from(config.table)
        .update(values)
        .eq(config.key ?? "id", id);
      if (config.project) query = query.eq("project_id", project!);
      const stamp = form.get("_updated_at");
      if (stamp) query = query.eq("updated_at", String(stamp));
      const result = await query.select(config.key ?? "id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data)
        throw new Error(
          "Record changed or access was denied. Reload and try again.",
        );
    } else {
      const result = await context.db
        .from(config.table)
        .insert(values)
        .select(moduleKey === "role_permissions" ? "role_key,permission_key" : (config.key ?? "id"))
        .single();
      if (result.error) throw result.error;
    }
    revalidatePath("/portal", "layout");
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, message: "Saved successfully." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
export async function removeRecord(
  moduleKey: string,
  id: string,
  extra?: string,
): Promise<ActionResult> {
  try {
    const config = getModule(moduleKey);
    if (!config.removable)
      throw new Error("Archive this record instead of deleting it.");
    const context = await session();
    let project: string | null = null;
    if (moduleKey === "disciplines") {
      await permission("disciplines.delete");
      const result = await context.db.rpc("remove_discipline", { target: id });
      if (result.error) throw result.error;
      revalidatePath("/portal", "layout");
      return { ok: true, message: String(result.data) };
    }
    if (moduleKey === "roles") {
      await permission("roles.delete");
      if (context.profile.role !== "super_admin") throw new Error("Super Admin required.");
      const result = await context.db.rpc("remove_role", { target: id });
      if (result.error) throw result.error;
      revalidatePath("/portal", "layout");
      return { ok: true, message: String(result.data) };
    }
    if (config.project) {
      const row = await context.db
        .from(config.table)
        .select("project_id")
        .eq("id", id)
        .single();
      if (row.error) throw row.error;
      project = row.data.project_id;
    }
    if (moduleKey === "workflow_steps") {
      const row = await context.db
        .from("workflow_steps")
        .select("workflow_id")
        .eq("id", id)
        .single();
      if (row.error) throw row.error;
      const parent = await context.db
        .from("approval_workflows")
        .select("project_id")
        .eq("id", row.data.workflow_id)
        .single();
      if (parent.error) throw parent.error;
      project = parent.data.project_id;
    }
    await permission(`${config.permission}.delete`, project);
    let query = context.db.from(config.table).delete();
    query =
      moduleKey === "role_permissions"
        ? query.eq("role_key", id).eq("permission_key", extra ?? "")
        : query.eq("id", id);
    const result = await query.select();
    if (result.error) throw result.error;
    if (!result.data?.length)
      throw new Error("Record no longer exists or access denied.");
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Removed." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
export async function approvalAction(form: FormData): Promise<ActionResult> {
  try {
    const { db } = await session();
    const mode = String(form.get("mode"));
    const result =
      mode === "submit"
        ? await db.rpc("submit_approval", {
            deliverable: String(form.get("deliverable")),
            workflow: String(form.get("workflow")),
          })
        : await db.rpc("decide_approval", {
            approval: String(form.get("approval")),
            decision: mode,
            comments: String(form.get("comments") || ""),
          });
    if (result.error) throw result.error;
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Approval action recorded." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
export async function markNotification(id: string): Promise<ActionResult> {
  try {
    const { db, user } = await session();
    const result = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .single();
    if (result.error) throw result.error;
    revalidatePath("/portal/notifications");
    return { ok: true, message: "Marked as read." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
export async function createAccount(form: FormData): Promise<ActionResult> {
  try {
    const { db, profile } = await permission("users.create");
    if (profile.role !== "super_admin")
      throw new Error("Super Admin required.");
    const password = String(form.get("password") || "");
    if (password.length < 12 || password.length > 128) throw new Error("Use a temporary password with 12–128 characters.");
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const name = String(form.get("full_name") || "").trim();
    const role = String(form.get("role") || "");
    const discipline = String(form.get("discipline_id") || "");
    const position = String(form.get("position") || "").trim();
    if (!role || !uuid.test(discipline) || !position)
      throw new Error("Role, discipline and position are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name)
      throw new Error("Enter a valid name and email.");
    const existing = await db
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data)
      throw new Error(
        "An account already exists for this email. Use Reset access.",
      );
    const admin = authAdmin();
    const expired = await db
      .from("employee_provisioning")
      .delete()
      .eq("email", email)
      .lt("expires_at", new Date().toISOString());
    if (expired.error) throw expired.error;
    const reservation = await db
      .from("employee_provisioning")
      .insert({
        email,
        full_name: name,
        role_key: role,
        discipline_id: discipline,
        position,
        is_active: form.get("is_active") === "on",
      })
      .select("token")
      .single();
    if (reservation.error) throw reservation.error;
    const result = await admin.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, provisioning_token: reservation.data.token },
        app_metadata: { must_change_password: true },
      })
      .finally(async () => {
        await db
          .from("employee_provisioning")
          .delete()
          .eq("token", reservation.data.token);
      });
    if (result.error) throw result.error;
    void db;
    revalidatePath("/portal/users");
    return {
      ok: true,
      message:
        "Account created. Share the temporary password privately. The user must change it at first login. No email was sent.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
export async function resetAccount(id: string, password: string): Promise<ActionResult> {
  try {
    const { db, user, profile } = await permission("users.update");
    if (profile.role !== "super_admin")
      throw new Error("Super Admin required.");
    const target = await db
      .from("profiles")
      .select("email,role,is_active")
      .eq("id", id)
      .single();
    if (target.error) throw target.error;
    if (!target.data.is_active)
      throw new Error("Activate the account before resetting access.");
    if (target.data.role === "super_admin" && profile.role !== "super_admin")
      throw new Error("Super Admin access required.");
    if (id === user.id) throw new Error("Use Change password for your own account.");
    if (password.length < 12 || password.length > 128) throw new Error("Use a temporary password with 12–128 characters.");
    const admin = authAdmin();
    const result = await admin.auth.admin.updateUserById(id, { password, email_confirm: true, app_metadata: { must_change_password: true } });
    if (result.error) throw result.error;
    const log = await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "temporary_password_set",
      entity: "profiles",
      entity_id: id,
    });
    if (log.error) throw log.error;
    return {
      ok: true,
      message: "Temporary password set. The user must change it at next login.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
export async function addRelated(form: FormData): Promise<ActionResult> {
  try {
    const { db, user } = await session();
    const type = String(form.get("type"));
    const id = String(form.get("entity_id"));
    let result;
    if (type === "dependency")
      result = await db
        .from("task_dependencies")
        .insert({ task_id: id, depends_on: String(form.get("depends_on")) });
    else if (type === "task_comment" || type === "issue_comment") {
      const body = String(form.get("body") || "").trim();
      if (!body || body.length > 10000)
        throw new Error("Enter a comment up to 10,000 characters.");
      result = await db
        .from(type === "task_comment" ? "task_comments" : "issue_comments")
        .insert({
          [type === "task_comment" ? "task_id" : "issue_id"]: id,
          author: user.id,
          body,
        });
    } else throw new Error("Invalid action");
    if (result.error) throw result.error;
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Added." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}

export async function respondRfi(form: FormData): Promise<ActionResult> {
  try {
    const { db, user } = await session();
    const id = String(form.get("id"));
    const response = String(form.get("response") || "").trim();
    if (!response || response.length > 10000)
      throw new Error("Enter a response up to 10,000 characters.");
    const rfi = await db
      .from("rfis")
      .select("project_id,discipline_id,owner")
      .eq("id", id)
      .single();
    if (rfi.error) throw rfi.error;
    await permission(
      "rfis.respond",
      rfi.data.project_id,
      rfi.data.discipline_id,
    );
    if (rfi.data.owner !== user.id)
      await permission(
        "rfis.update",
        rfi.data.project_id,
        rfi.data.discipline_id,
      );
    const result = await db
      .from("rfis")
      .update({ response, status: "responded" })
      .eq("id", id)
      .select("id")
      .single();
    if (result.error) throw result.error;
    revalidatePath("/portal/rfis");
    return { ok: true, message: "Response recorded." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: errorMessage(error) };
  }
}
