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

export async function permission(
  key: string,
  project?: string | null,
  discipline?: string | null,
) {
  const context = await getSession();
  const result = await context.db.rpc("has_permission", {
    permission: key,
    project: project || null,
    discipline: discipline || null,
  });
  if (result.error || result.data !== true)
    throw new Error("You do not have permission to perform this action.");
  return context;
}
