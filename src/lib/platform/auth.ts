import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

/** Request-scoped memoization prevents duplicate auth/profile queries during one navigation. */
const getSession = cache(async () => {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/");
  if (user.app_metadata.must_change_password === true) redirect("/auth/reset");

  const profile = await db
    .from("profiles")
    .select("id,full_name,role,is_active,discipline_id")
    .eq("id", user.id)
    .single();

  if (profile.error || !profile.data)
    throw new Error(
      "Cannot load account access. Check the platform migration and database connection.",
    );
  if (!profile.data.is_active)
    throw new Error("This account is inactive. Contact the administrator.");

  return { db, user, profile: profile.data };
});

export async function session() {
  return getSession();
}

// Lifetime: one server render/action. Never share authorization results between users
// or across requests; role/assignment changes take effect on the next request.
export const hasPermission = cache(async (
  key: string,
  project: string | null = null,
  discipline: string | null = null,
) => {
  const { db } = await getSession();
  const result = await db.rpc("has_permission", { permission: key, project, discipline });
  if (result.error) throw new Error(result.error.message);
  return result.data === true;
});

export async function permission(
  key: string,
  project?: string | null,
  discipline?: string | null,
) {
  const context = await getSession();
  if (!(await hasPermission(key, project || null, discipline || null)))
    throw new Error("You do not have permission to perform this action.");
  return context;
}
