import Link from "next/link";
import { session } from "@/lib/platform/auth";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, profile } = await session();
  const access = await db.rpc("has_permission", { permission: "admin.access" });
  const grants = await db
    .from("role_permissions")
    .select("permission_key")
    .eq("role_key", profile.role);
  const allowed = new Set((grants.data ?? []).map((g) => g.permission_key));
  const groups = [
    [
      "OVERVIEW",
      [
        ["/portal", "Dashboard"],
        ["/?view=board", "Task board"],
        ["/portal/projects", "Projects"],
        ["/portal/notifications", "Notifications"],
        ["/portal/search", "Global search"],
        ["/portal/reports", "Reports"],
      ],
    ],
    [
      "PROJECT REGISTERS",
      [
        ["/portal/teams", "Project teams"],
        ["/portal/project_disciplines", "Project disciplines"],
        ["/portal/phases", "Design phases"],
        ["/portal/milestones", "Milestones"],
        ["/portal/tasks", "Task register"],
        ["/portal/deliverables", "Deliverables"],
        ["/portal/documents", "Documents"],
        ["/portal/rfis", "RFIs"],
        ["/portal/issues", "Coordination issues"],
        ["/portal/workflows", "Approval workflows"],
        ["/portal/workflow_steps", "Workflow reviewers"],
        ["/portal/approvals", "Approval queue"],
      ],
    ],
  ] as const;
  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <Link className="platform-brand" href="/portal">
          H /{" "}
          <span>
            Hamdan Studio<small>ARCHITECTURAL CONSULTANCY</small>
          </span>
        </Link>
        {groups.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2>{title}</h2>
            {links.map(([href, name]) => (
              <Link href={href} key={href}>
                {name}
              </Link>
            ))}
          </nav>
        ))}
        {access.data === true && (
          <nav aria-label="Administration">
            <h2>CONTROL CENTER</h2>
            <Link href="/admin">Admin overview</Link>
            {[
              ["users", "People & consultants", "users.view"],
              ["roles", "Roles", "roles.view"],
              ["permissions", "Permission catalog", "roles.view"],
              ["role_permissions", "Role permissions", "roles.view"],
              ["disciplines", "Disciplines", "disciplines.view"],
              ["overrides", "Permission overrides", "roles.view"],
              ["audit", "Audit & activity", "audit.view"],
              ["settings", "Settings", "settings.manage"],
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
          <span>ORGANIZATION / PROJECT OPERATIONS</span>
          <Link href="/portal/search">Search workspace ↗</Link>
        </header>
        <div className="platform-body">{children}</div>
      </main>
    </div>
  );
}
