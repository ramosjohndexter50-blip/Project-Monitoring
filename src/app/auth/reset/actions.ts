"use server";
import { serverClient } from "@/lib/supabase/server";
import { authAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function changePassword(form: FormData) {
  const password = String(form.get("password") || "");
  if (password !== form.get("confirm")) return { ok: false, message: "Passwords do not match." };
  if (password.length < 6 || password.length > 128) return { ok: false, message: "Use 6–128 characters for your new password." };
  const db = await serverClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { ok: false, message: "Sign in with your temporary password first." };
  const admin = authAdmin();
  const profile = await admin.from("profiles").select("is_active").eq("id", user.id).single();
  if (profile.error || !profile.data?.is_active) return { ok: false, message: "This account is inactive. Contact Super Admin." };
  // Update through the user's session; Auth validates password policy and rejects reuse.
  const updated = await db.auth.updateUser({ password });
  if (updated.error) return { ok: false, message: updated.error.message };
  const cleared = await admin.auth.admin.updateUserById(user.id, { app_metadata: { must_change_password: false } });
  if (cleared.error) return { ok: false, message: "Password changed, but workspace access could not be updated. Contact Super Admin." };
  await db.auth.refreshSession();
  revalidatePath("/", "layout");
  return { ok: true, message: "Password saved. You can now open your workspace." };
}
