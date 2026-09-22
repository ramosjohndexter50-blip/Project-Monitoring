import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EXPECTED_KEY_HASH =
  "bef98b2ea6e06727fdce68d47b010167de69af7d774805fddca313c6196d6e70";

type EmployeeInput = {
  full_name: string;
  employee_code: string;
  position: string;
  email: string;
  discipline: string;
};

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  if (keyHash !== EXPECTED_KEY_HASH) return response({ error: "Unauthorized" }, 401);

  const password = request.nextUrl.searchParams.get("password") ?? "";
  if (password.length < 6 || password.length > 128)
    return response({ error: "Temporary password must be 6–128 characters." }, 400);

  const encoded = request.nextUrl.searchParams.get("payload");
  if (!encoded) return response({ error: "Missing payload." }, 400);

  let employees: EmployeeInput[];
  try {
    employees = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return response({ error: "Invalid payload." }, 400);
  }

  if (!Array.isArray(employees) || employees.length > 25)
    return response({ error: "Invalid employee list." }, 400);

  const db = authAdmin();
  const creator = await db
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (creator.error || !creator.data)
    return response({ error: creator.error?.message ?? "No active Super Admin." }, 500);

  let hr = await db
    .from("disciplines")
    .select("id")
    .eq("name", "Human Resources")
    .eq("is_active", true)
    .maybeSingle();

  if (!hr.data) {
    const inserted = await db
      .from("disciplines")
      .insert({
        name: "Human Resources",
        color_code: "#8b7bb8",
        is_active: true,
        description: "Human Resources",
      })
      .select("id")
      .single();
    if (inserted.error) return response({ error: inserted.error.message }, 500);
    hr = { data: inserted.data, error: null } as typeof hr;
  }

  const disciplines = await db
    .from("disciplines")
    .select("id,name")
    .eq("is_active", true);
  if (disciplines.error) return response({ error: disciplines.error.message }, 500);

  const disciplineMap = new Map((disciplines.data ?? []).map((row) => [row.name, row.id]));
  const results: Array<Record<string, unknown>> = [];

  for (const employee of employees) {
    if (
      !employee ||
      !employee.full_name?.trim() ||
      !employee.employee_code?.trim() ||
      !employee.position?.trim() ||
      !employee.email?.trim() ||
      !employee.discipline?.trim()
    ) {
      results.push({ email: employee?.email ?? null, status: "error", error: "Missing required employee data." });
      continue;
    }

    const disciplineId = disciplineMap.get(employee.discipline);
    if (!disciplineId) {
      results.push({ email: employee.email, status: "error", error: `Discipline not found: ${employee.discipline}` });
      continue;
    }

    const existing = await db
      .from("profiles")
      .select("id")
      .ilike("email", employee.email.trim().toLowerCase())
      .maybeSingle();
    if (existing.error) {
      results.push({ email: employee.email, status: "error", error: existing.error.message });
      continue;
    }
    if (existing.data) {
      results.push({ email: employee.email, status: "skipped_existing" });
      continue;
    }

    const token = crypto.randomUUID();
    const reservation = await db
      .from("employee_provisioning")
      .insert({
        token,
        email: employee.email.trim().toLowerCase(),
        full_name: employee.full_name.trim(),
        employee_code: employee.employee_code.trim(),
        role_key: "employee",
        discipline_id: disciplineId,
        position: employee.position.trim(),
        company: "Hamdan Studio Manila",
        is_active: true,
        created_by: creator.data.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .select("token")
      .single();

    if (reservation.error) {
      results.push({ email: employee.email, status: "error", error: reservation.error.message });
      continue;
    }

    const created = await db.auth.admin.createUser({
      email: employee.email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: employee.full_name.trim(),
        provisioning_token: token,
      },
      app_metadata: { must_change_password: true },
    });

    await db.from("employee_provisioning").delete().eq("token", token);

    if (created.error || !created.data.user) {
      results.push({
        email: employee.email,
        status: "error",
        error: created.error?.message ?? "Unable to create Auth user.",
      });
      continue;
    }

    const projectDisciplines = await db
      .from("project_disciplines")
      .select("project_id")
      .eq("discipline_id", disciplineId)
      .eq("is_active", true);

    if (projectDisciplines.error) {
      results.push({
        email: employee.email,
        status: "created_no_projects",
        error: projectDisciplines.error.message,
      });
      continue;
    }

    const memberships = (projectDisciplines.data ?? []).map((row) => ({
      project_id: row.project_id,
      user_id: created.data.user.id,
      role_key: employee.position.trim() === "Project Architect"
        ? "project_architect"
        : "team_member",
      discipline_id: disciplineId,
    }));

    if (memberships.length) {
      const membershipResult = await db
        .from("project_members")
        .upsert(memberships, {
          onConflict: "project_id,user_id,discipline_id",
          ignoreDuplicates: true,
        });
      if (membershipResult.error) {
        results.push({
          email: employee.email,
          status: "created_membership_error",
          error: membershipResult.error.message,
        });
        continue;
      }
    }

    results.push({
      email: employee.email,
      status: "created",
      discipline: employee.discipline,
      project_count: memberships.length,
    });
  }

  return response({
    created: results.filter((row) => row.status === "created").length,
    skipped: results.filter((row) => row.status === "skipped_existing").length,
    errors: results.filter((row) => String(row.status).includes("error")).length,
    results,
  });
}
