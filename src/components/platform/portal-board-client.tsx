"use client";

import { useMemo, useState } from "react";
import TaskBoard from "@/app/task-board";
import type { Profile } from "@/app/task-types";
import { createClient } from "@/lib/supabase/client";

type Project = {
  id: string;
  name: string;
  target_date: string | null;
};

export default function PortalBoardClient({
  profile,
  userId,
  projects,
}: {
  profile: Profile;
  userId: string;
  projects: Project[];
}) {
  const supabase = useMemo(() => createClient()!, []);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = projects.find((item) => item.id === projectId);

  return (
    <>
      <div className="platform-heading board-page-heading">
        <div>
          <p className="page-crumb">Project Monitor <span>/</span> Board</p>
          <h1>Board</h1>
          <p>Track project work by status, discipline, and progress.</p>
        </div>
        <label className="board-project-picker">
          <span>Project</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={!projects.length}
            aria-label="Current project"
          >
            {projects.length ? (
              projects.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))
            ) : (
              <option value="">No accessible projects</option>
            )}
          </select>
        </label>
      </div>

      {project ? (
        <>
          <div className="board-project-context">
            <div>
              <span>Current project</span>
              <b>{project.name}</b>
            </div>
            <small>{project.target_date ? `Target ${project.target_date}` : "No target date set"}</small>
          </div>
          <TaskBoard
            key={project.id}
            supabase={supabase}
            role={profile.role}
            disciplineId={profile.discipline_id}
            projectId={project.id}
            userId={userId}
            onlyMine={false}
          />
        </>
      ) : (
        <div className="register-card empty-board">
          <h2>No accessible projects</h2>
          <p>Ask your administrator to assign you to a project.</p>
        </div>
      )}
    </>
  );
}
