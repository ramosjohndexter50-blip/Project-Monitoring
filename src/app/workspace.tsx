"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import TaskBoard from "./task-board";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  discipline_id: string | null;
};
type Project = { id: string; name: string; target_date: string | null };

export default function Workspace({ user, initialProfile }: { user: Pick<User, "id" | "email">; initialProfile: Profile }) {
  const supabase = useMemo(() => createClient()!, []);
  const router = useRouter();
  const profile = initialProfile;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [section, setSection] = useState("board");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const boards = await supabase.from("projects").select("id, name, target_date").order("name");
        if (!active) return;
        if (boards.error) throw boards.error;

        setProjects(boards.data ?? []);
        setProjectId(boards.data?.[0]?.id ?? "");
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load your workspace. Please refresh.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [supabase, user.id]);
  const project = projects.find((item) => item.id === projectId);
  const name = profile?.full_name ?? user.email ?? "Team member";
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">H</span>
          <span>
            Hamdan Studio<span className="brand-accent">/</span>Manila
          </span>
        </div>
        <div className="workspace-label">PROJECT WORKSPACE</div>
        <label className="project-label">
          Current project
          <select
            className="project-switcher"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!projects.length}
            aria-label="Current project"
          >
            <option value="" disabled>
              Select project
            </option>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className="nav-item" href="/portal">
            <span className="nav-icon">+</span>Consultancy dashboard
          </Link>
          <Link className="nav-item" href="/portal/projects">
            <span className="nav-icon">+</span>Project registers
          </Link>
          <Link className="nav-item" href="/portal/notifications">
            <span className="nav-icon">+</span>Notifications
          </Link>
          {profile?.role === "super_admin" && (
            <Link className="nav-item" href="/admin">
              <span className="nav-icon">+</span>Control center
            </Link>
          )}
          {[
            ["board", "▦", "Project board"],
            ["mine", "◉", "My work"],
            ["workflow", "↗", "Workflow guide"],
          ].map(([key, icon, title]) => (
            <button
              title={title}
              key={key}
              className={`nav-item ${section === key ? "active" : ""}`}
              onClick={() => setSection(key)}
            >
              <span className="nav-icon">{icon}</span>
              {title}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar avatar-orange">
              {name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{name}</b>
              <small>{(profile?.role ?? "viewer").replaceAll("_", " ")}</small>
            </span>
          </div>
          <button
            className="text-button"
            onClick={async () => {
              await supabase.rpc("record_session_event", { event: "logout" });
              const result = await supabase.auth.signOut();
              router.refresh();
              if (result.error) setError(result.error.message);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>{project?.name ?? "Projects"}</strong>
          </div>
          <span className="eyebrow">TEAM OPERATIONS</span>
        </header>
        <div className="mobile-workspace">
          <select
            aria-label="Select project on mobile"
            value={projectId}
            disabled={!projects.length}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="" disabled>
              Select project
            </option>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            onClick={async () => {
              await supabase.rpc("record_session_event", { event: "logout" });
              const result = await supabase.auth.signOut();
              router.refresh();
              if (result.error) setError(result.error.message);
            }}
          >
            Sign out
          </button>
        </div>
        <div className="page-body">
          <div className="page-heading">
            <div>
              <div className="eyebrow">PLAN · ASSIGN · TRACK · COMPLETE</div>
              <h1>
                {section === "workflow"
                  ? "A clear path to done."
                  : section === "mine"
                    ? "My work"
                    : (project?.name ?? "Your project workspace")}
              </h1>
              <p>
                {section === "mine"
                  ? "Tasks assigned to you across the selected project."
                  : "Keep every discipline moving in the same direction."}
              </p>
            </div>
          </div>
          {error && (
            <p className="task-message" role="alert">
              {error}
            </p>
          )}
          {section === "workflow" ? (
            <WorkflowGuide />
          ) : loading ? (
            <p role="status">Loading workspace...</p>
          ) : project ? (
            <TaskBoard
              key={project.id}
              supabase={supabase}
              role={profile?.role ?? "viewer"}
              disciplineId={profile?.discipline_id ?? null}
              projectId={project.id}
              userId={user.id}
              onlyMine={section === "mine"}
            />
          ) : (
            <div className="empty-board">
              <h2>No accessible projects yet</h2>
              <p>
                Ask your administrator to create a project and assign its
                discipline leads.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function WorkflowGuide() {
  return (
    <section className="workflow-guide">
      <p className="guide-intro">
        Isang board bawat project. Bawat deliverable ay task na may discipline,
        owner, priority, at deadline.
      </p>
      <div className="workflow-steps">
        {[
          [
            "01",
            "Plan & assign",
            "Admin: gumawa ng task, pumili ng discipline at owner, ilagay ang due date at priority.",
          ],
          [
            "02",
            "Not started",
            "Nakapila ang task. Tingnan ang scope at notes bago simulan.",
          ],
          [
            "03",
            "In progress",
            "I-update ang progress habang ginagawa. Ilagay sa notes ang mahahalagang detalye.",
          ],
          [
            "04",
            "Blocked → resolve",
            "Kung may blocker, piliin ang Blocked at ilagay ang dahilan sa notes. Kapag resolved, ibalik sa In progress.",
          ],
          [
            "05",
            "Review & complete",
            "Ilagay sa For review at ipa-review sa lead. Ang awtorisadong reviewer ang maglalagay ng Completed; magiging 100% ang progress.",
          ],
        ].map(([step, title, description]) => (
          <article key={step}>
            <span>{step}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <div className="guide-notes">
        <h2>Daily team routine</h2>
        <p>
          Buksan ang My work → unahin ang overdue at high priority → i-update
          ang status at notes → tingnan ang History para makita ang mga
          pagbabago.
        </p>
        <h2>Access at responsibility</h2>
        <p>
          Project membership at role permissions ang nagtatakda ng access.
          Managers at leads ang nagre-review; team members ang gumagawa ng
          assigned work. Viewer ay read-only.
        </p>
        <h2>Automatic behavior</h2>
        <p>
          Completed = 100%. Not started = 0%. Use For review before approval.
          Deliverables use the configurable approval queue in Project registers.
          In-app notifications track assignments and reviews.
        </p>
      </div>
    </section>
  );
}
