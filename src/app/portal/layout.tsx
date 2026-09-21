import Link from "next/link";
import Image from "next/image";
import projectLogo from "../../../image/project.png";
import NavLink from "@/components/platform/nav-link";
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
          <Image className="platform-brand-logo" src={projectLogo} alt="" priority />
          <span>Hamdan Studio<small>PROJECT MONITOR</small></span>
        </Link>

        <nav aria-label="Workspace">
          <h2>WORKSPACE</h2>
          <NavLink href="/portal">Home</NavLink>
          <NavLink href={taskHref}>{["super_admin", "admin"].includes(profile.role) ? "Tasks" : "My Tasks"}</NavLink>
          <NavLink href="/portal/projects">Projects</NavLink>
          {profile.role === "admin" && <NavLink href="/portal/teams">Team</NavLink>}
          <NavLink href="/?view=board">Board</NavLink>
          <NavLink href="/portal/notifications">Updates</NavLink>
          <NavLink href="/portal/search">Find</NavLink>
        </nav>

        {access && (
          <nav aria-label="Administration">
            <h2>CONTROL CENTER</h2>
            <NavLink href="/admin">Admin overview</NavLink>
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
                <NavLink key={key} href={`/portal/${key}`}>
                  {name}
                </NavLink>
              ))}
          </nav>
        )}

        <div className="platform-user">
          <b>{profile.full_name ?? "Team member"}</b>
          <small>{profile.role.replaceAll("_", " ")}</small>
          <Link href="/auth/reset">Change password</Link>
          <form action="/auth/signout" method="post">
            <button>Sign out</button>
          </form>
        </div>
      </aside>
      <main className="platform-main">
        <header className="platform-topbar">
          <span>PROJECT WORKSPACE</span>
          <Link href="/portal/search">Find anything ↗</Link>
        </header>
        <div className="platform-body">{children}</div>
      </main>
    </div>
  );
}
