"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import TaskBoard from "./task-board";
import Link from "next/link";
import Image from "next/image";
import projectLogo from "../../image/project.png";
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
        <div className="brand workspace-brand">
          <Image className="workspace-brand-logo" src={projectLogo} alt="" priority />
          <span>Hamdan Studio<small>PROJECT MONITOR</small></span>
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
          <button
            title="Overview"
            className={`nav-item ${section === "board" ? "active" : ""}`}
            onClick={() => setSection("board")}
          >
            <span className="nav-icon">▦</span>Overview
          </button>
          <Link className="nav-item" href="/portal">
            <span className="nav-icon">＋</span>Consultancy dashboard
          </Link>
          <Link className="nav-item" href="/portal/projects">
            <span className="nav-icon">＋</span>Project registers
          </Link>
          <Link className="nav-item" href="/portal/deliverables"><span className="nav-icon">◇</span>Deliverables</Link>
          <Link className="nav-item" href="/portal/milestones"><span className="nav-icon">◆</span>Milestones</Link>
          <Link className="nav-item" href="/portal/rfis"><span className="nav-icon">?</span>RFIs</Link>
          <Link className="nav-item" href="/portal/reports"><span className="nav-icon">⌁</span>Gantt & reports</Link>
          <Link className="nav-item" href="/portal/documents"><span className="nav-icon">□</span>Documents</Link>
          <Link className="nav-item" href="/portal/notifications"><span className="nav-icon">♧</span>Notifications</Link>
          {profile?.role === "super_admin" && (
            <Link className="nav-item" href="/admin">
              <span className="nav-icon">⚙</span>Control center
            </Link>
          )}
          <span className="nav-divider" aria-hidden="true" />
          <button
            title="My tasks"
            className={`nav-item ${section === "mine" ? "active" : ""}`}
            onClick={() => setSection("mine")}
          >
            <span className="nav-icon">◉</span>My tasks
          </button>
          <button
            title="Workflow guide"
            className={`nav-item ${section === "workflow" ? "active" : ""}`}
            onClick={() => setSection("workflow")}
          >
            <span className="nav-icon">▤</span>Workflow guide
          </button>
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
            <span>My Project</span>
            <b>/</b>
            <strong>{project?.name ?? "Projects"}</strong>
          </div>
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
          <section className="workspace-hero">
            <div>
              <div className="eyebrow">PROJECT WORKSPACE · {profile.role.replaceAll("_", " ")}</div>
              <h1>{section === "workflow" ? "A clear path to done." : `Welcome, ${name.split(" ")[0]}`}</h1>
              <p>{section === "mine" ? "Your assigned work in this project." : "What do you plan to deliver today?"}</p>
            </div>
            <div className="hero-project">
              <span>Current project</span>
              <strong>{project?.name ?? "Select a project"}</strong>
              <small>{project?.target_date ? `Target ${project.target_date}` : "Project delivery workspace"}</small>
            </div>
          </section>
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
        Use one board for each project. Every deliverable should be tracked as a task with a discipline,
        owner, priority, and deadline.
      </p>
      <div className="workflow-steps">
        {[
          [
            "01",
            "Plan & assign",
            "Create the task, choose the correct discipline and owner, then set the due date and priority.",
          ],
          [
            "02",
            "Not started",
            "The task is queued. Review the scope and notes before starting work.",
          ],
          [
            "03",
            "In progress",
            "Update progress while the work is being done and record important details in the notes.",
          ],
          [
            "04",
            "Blocked → resolve",
            "If something is stopping the work, set the task to Blocked and explain the reason in the notes. Move it back to In Progress once resolved.",
          ],
          [
            "05",
            "Review & complete",
            "Move the task to For Review when it is ready. An authorized reviewer can complete it, which sets progress to 100%.",
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
          Open My Tasks → handle overdue and high-priority work first → update
          the status and notes → check History when you need to review changes.
        </p>
        <h2>Access at responsibility</h2>
        <p>
          Project membership and role permissions control access. Managers and
          leads review work, team members handle their assigned tasks, and viewers
          have read-only access.
        </p>
        <h2>Automatic behavior</h2>
        <p>
          Completed tasks are automatically set to 100%, while Not Started tasks
          remain at 0%. Use For Review before approval. Deliverables follow the
          configured approval flow, and notifications track assignments and reviews.
        </p>
      </div>
    </section>
  );
}
