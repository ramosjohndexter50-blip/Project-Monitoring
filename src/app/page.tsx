import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import LoginScreen from "./login-screen";

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <LoginScreen />;

  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return <LoginScreen />;
  if (user.app_metadata.must_change_password === true) redirect("/auth/reset");

  const profile = await db
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();

  if (profile.error || !profile.data) {
    return (
      <main className="access-message">
        <h1>Workspace setup required</h1>
        <p>The platform database must be ready before the workspace can load.</p>
        <a href="/auth/signout">Sign out</a>
      </main>
    );
  }

  if (!profile.data.is_active) {
    return (
      <main className="access-message">
        <h1>Account inactive</h1>
        <p>Contact your administrator to restore access.</p>
        <a href="/auth/signout">Sign out</a>
      </main>
    );
  }

  redirect("/portal");
}
