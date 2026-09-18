import Link from "next/link";
import { session, hasPermission } from "@/lib/platform/auth";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, profile } = await session();
  const [access, grants] = await Promise.all([
    hasPermission("admin.access"),
    db.from("role_permissions").select("permission_key").eq("role_key", profile.role),
  ]);
  const allowed = new Set((grants.data ?? []).map((g) => g.permission_key));
  const taskHref = ["super_admin", "admin"].includes(profile.role) ? "/portal/tasks" : `/portal/tasks?owner=${profile.id}`;

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <Link className="platform-brand" href="/portal">
          H / <span>Hamdan Studio<small>ARCHITECTURAL CONSULTANCY</small></span>
        </Link>

        <nav aria-label="Workspace">
          <h2>WORKSPACE</h2>
          <Link href="/portal">Dashboard</Link>
          <Link href={taskHref}>{["super_admin", "admin"].includes(profile.role) ? "Tasks" : "My Tasks"}</Link>
          <Link href="/portal/projects">Projects</Link>
          {profile.role === "admin" && <Link href="/portal/teams">Project team</Link>}
          <Link href="/?view=board">Project board</Link>
          <Link href="/portal/notifications">Notifications</Link>
          <Link href="/portal/search">Search</Link>
        </nav>

        {access && (
          <nav aria-label="Administration">
            <h2>CONTROL CENTER</h2>
            <Link href="/admin">Admin overview</Link>
            {[
              ["users", "Employee management", "users.view"],
              ["roles", "Roles", "roles.view"],
              ["permissions", "Permission catalog", "roles.view"],
              ["role_permissions", "Role permissions", "roles.view"],
              ["disciplines", "Disciplines", "disciplines.view"],
              ["overrides", "Permission overrides", "roles.view"],
              ["settings", "Web settings", "settings.manage"],
            ]
              .filter(([, , right]) => allowed.has(right))
              .map(([key, name]) => (
                <Link key={key} href={`/portal/${key}`}>
                  {name}
                </Link>
              ))}
          </nav>
        )}

        <div className="platform-user">
          <b>{profile.full_name ?? "Team member"}</b>
          <small>{profile.role.replaceAll("_", " ")}</small>
          <form action="/auth/signout" method="post">
            <button>Sign out</button>
          </form>
        </div>
      </aside>
      <main className="platform-main">
        <header className="platform-topbar">
          <span>PROJECT TASK MONITORING</span>
          <Link href="/portal/search">Search workspace ↗</Link>
        </header>
        <div className="platform-body">{children}</div>
      </main>
    </div>
  );
}
