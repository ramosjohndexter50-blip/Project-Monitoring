import Link from "next/link";
import Image from "next/image";
import projectLogo from "../../../image/project.png";
import NavLink from "@/components/platform/nav-link";
import ThemeToggle from "@/components/theme-toggle";
import PortalNavigationBehavior from "@/components/platform/portal-navigation-behavior";
import { session } from "@/lib/platform/auth";

type IconName = "home" | "tasks" | "projects" | "board" | "gantt" | "updates" | "guide" | "people" | "roles" | "permissions" | "settings";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
    tasks: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M8 11h8M8 15h5"/></>,
    projects: <><path d="M3.5 7h6l1.6 2H20.5v10H3.5z"/><path d="M3.5 7V5h6l1.5 2"/></>,
    board: <><rect x="4" y="4" width="6" height="16" rx="1.5"/><rect x="14" y="4" width="6" height="16" rx="1.5"/></>,
    gantt: <><path d="M4 5v14M4 8h16M4 13h16M4 18h16"/><path d="M8 6h7v4H8zM11 11h8v4h-8zM6 16h9v4H6z"/></>,
    updates: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
    guide: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 8h7M8 12h7M8 16h4"/></>,
    people: <><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a2.5 2.5 0 1 0 0-5"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M14 14a4 4 0 0 1 7 3v2"/></>,
    roles: <><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M18 4.5 20 6l-2 1.5"/></>,
    permissions: <><path d="M12 3 5 6v5c0 4.8 3 8.1 7 10 4-1.9 7-5.2 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.5 6A8 8 0 0 0 9 7.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A8 8 0 0 0 10.5 18l.3 2.6h4L15 18a8 8 0 0 0 1.5-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></>,
  };
  return <svg className="portal-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Item({ href, icon, children }: { href: string; icon: IconName; children: React.ReactNode }) {
  return <NavLink href={href}><Icon name={icon}/><span>{children}</span></NavLink>;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { db, profile } = await session();
  const grants = await db.from("role_permissions").select("permission_key").eq("role_key", profile.role);
  const allowed = new Set((grants.data ?? []).map((g) => g.permission_key));
  const access = allowed.has("admin.access");
  const taskHref = ["super_admin", "admin"].includes(profile.role) ? "/portal/tasks" : `/portal/tasks?owner=${profile.id}`;
  const initials = (profile.full_name ?? "Team member").split(/\s+/).slice(0,2).map((part: string) => part[0]?.toUpperCase()).join("");

  return (
    <div className="platform-shell">
      <input className="mobile-nav-toggle" id="mobile-nav-toggle" type="checkbox" aria-hidden="true" />
      <aside className="platform-sidebar">
        <Link className="platform-brand" href="/portal">
          <Image className="platform-brand-logo" src={projectLogo} alt="" priority />
          <span>Hamdan Studio<small>PROJECT MONITOR</small></span>
        </Link>

        <nav aria-label="Workspace">
          <Item href="/portal" icon="home">Overview</Item>
          <Item href={taskHref} icon="tasks">{["super_admin", "admin"].includes(profile.role) ? "Tasks" : "My Tasks"}</Item>
          <Item href="/portal/projects" icon="projects">Projects</Item>
          <Item href="/portal/board" icon="board">Board</Item>
          <Item href="/portal/gantt" icon="gantt">Gantt</Item>
          <Item href="/portal/notifications" icon="updates">Updates</Item>
          <Item href="/portal/workflow" icon="guide">Workflow Guide</Item>
        </nav>

        {access && (
          <nav aria-label="Administration" className="management-nav">
            <h2>MANAGEMENT</h2>
            {allowed.has("users.view") && <Item href="/portal/users" icon="people">Employees</Item>}
            {allowed.has("roles.view") && <Item href="/portal/roles" icon="roles">Roles</Item>}
            {allowed.has("roles.view") && <Item href="/portal/permissions" icon="permissions">Permissions</Item>}
            {allowed.has("settings.manage") && <Item href="/portal/settings" icon="settings">Settings</Item>}
          </nav>
        )}

        <div className="sidebar-utility">
          <ThemeToggle />
          <Link className="sidebar-notification notification-dot" href="/portal/notifications" aria-label="Notifications">
            <Icon name="updates" />
            <span>Notifications</span>
          </Link>
        </div>

        <div className="platform-user">
          <Link className="platform-profile-link" href="/portal/profile">
            <span className="platform-avatar">{initials || "TM"}</span>
            <span className="platform-user-copy"><b>{profile.full_name ?? "Team member"}</b><small>{profile.role.replaceAll("_", " ")}</small></span>
          </Link>
          <form className="platform-signout-form" action="/auth/signout" method="post">
            <button className="portal-signout" aria-label="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/>
                <path d="M14 8l4 4-4 4"/>
                <path d="M18 12H9"/>
              </svg>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>
      <label className="mobile-nav-backdrop" htmlFor="mobile-nav-toggle" aria-hidden="true" />

      <main className="platform-main">
        <header className="platform-topbar portal-topbar-clean">
          <div className="mobile-topbar-brand">
            <label className="mobile-menu-button" htmlFor="mobile-nav-toggle" aria-label="Open navigation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16"/>
              </svg>
            </label>
            <Link className="mobile-brand" href="/portal">
              <Image src={projectLogo} alt="" priority />
              <span>Hamdan Studio<small>PROJECT MONITOR</small></span>
            </Link>
          </div>
          <div className="portal-top-actions">
            <ThemeToggle />
            <Link className="top-icon notification-dot" href="/portal/notifications" aria-label="Notifications">♧</Link>
            <Link className="top-user" href="/portal/profile" aria-label="Open profile">
              <span className="platform-avatar compact">{initials || "TM"}</span>
              <span className="top-user-copy"><b>{profile.full_name ?? "Team member"}</b><small>{profile.role.replaceAll("_", " ")}</small></span>
              <span className="top-chevron">⌄</span>
            </Link>
          </div>
        </header>
        <div className="platform-body">
          <PortalNavigationBehavior />
          {children}
        </div>
      </main>
    </div>
  );
}
