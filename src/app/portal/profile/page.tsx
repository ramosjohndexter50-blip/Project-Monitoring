import Link from "next/link";
import { session } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { db, user } = await session();

  const profileResult = await db
    .from("profiles")
    .select("id,full_name,email,employee_code,position,role,is_active")
    .eq("id", user.id)
    .single();

  if (profileResult.error || !profileResult.data)
    throw new Error("Unable to load your profile.");

  const membershipsResult = await db
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);

  if (membershipsResult.error) throw membershipsResult.error;

  const projectIds = [...new Set((membershipsResult.data ?? []).map((row) => row.project_id))];
  const projectsResult = projectIds.length
    ? await db
        .from("projects")
        .select("id,name,project_code,status")
        .in("id", projectIds)
        .order("name")
    : { data: [], error: null };

  if (projectsResult.error) throw projectsResult.error;

  const profile = profileResult.data;
  const projects = projectsResult.data ?? [];
  const initials = (profile.full_name || "Employee")
    .split(/\s+/)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");

  return (
    <>
      <div className="platform-heading profile-page-heading">
        <div>
          <p className="page-crumb">Project Monitor <span>/</span> Profile</p>
          <h1>My profile</h1>
          <p>Your employee information and assigned projects.</p>
        </div>
      </div>

      <section className="employee-profile-card">
        <div className="employee-profile-hero">
          <span className="employee-profile-avatar">{initials || "TM"}</span>
          <div>
            <h2>{profile.full_name || "Employee"}</h2>
            <p>{profile.position || "—"}</p>
          </div>
          <span className={profile.is_active ? "employee-status active" : "employee-status inactive"}>
            <i />{profile.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="employee-profile-grid">
          <div className="employee-profile-field">
            <span>Full name</span>
            <strong>{profile.full_name || "—"}</strong>
          </div>
          <div className="employee-profile-field">
            <span>Employee ID</span>
            <strong>{profile.employee_code || "—"}</strong>
          </div>
          <div className="employee-profile-field">
            <span>Position</span>
            <strong>{profile.position || "—"}</strong>
          </div>
          <div className="employee-profile-field">
            <span>Email</span>
            <strong className="profile-email">{profile.email || user.email || "—"}</strong>
          </div>
          <div className="employee-profile-field employee-profile-projects">
            <span>Project</span>
            {projects.length ? (
              <div className="employee-profile-project-list">
                {projects.map((project) => (
                  <Link key={project.id} href={`/portal/projects?edit=${project.id}`}>
                    <b>{project.name}</b>
                    <small>{project.project_code || project.status}</small>
                  </Link>
                ))}
              </div>
            ) : (
              <strong>No assigned project</strong>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
