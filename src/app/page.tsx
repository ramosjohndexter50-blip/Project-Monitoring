import { serverClient } from "@/lib/supabase/server";
import LoginScreen from "./login-screen";
import Workspace from "./workspace";
import { redirect } from "next/navigation";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <LoginScreen />;
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return <LoginScreen />;
  const result = await db
    .from("profiles")
    .select("id, full_name, role, is_active, discipline_id")
    .eq("id", user.id)
    .single();
  if (result.error || !result.data)
    return (
      <main className="access-message">
        <h1>Workspace setup required</h1>
        <p>
          The platform database migration must be installed before this version
          can load. No project records were changed by this page.
        </p>
        <a href="/auth/signout">Sign out</a>
      </main>
    );
  if (!result.data.is_active)
    return (
      <main className="access-message">
        <h1>Account inactive</h1>
        <p>Contact your administrator to restore access.</p>
        <a href="/auth/signout">Sign out</a>
      </main>
    );
  if (
    result.data.role !== "super_admin" &&
    (await searchParams).view !== "board"
  )
    redirect("/portal");
  return <Workspace user={{ id: user.id, email: user.email }} initialProfile={result.data} />;
}
