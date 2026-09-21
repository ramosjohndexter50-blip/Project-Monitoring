import PortalBoardClient from "@/components/platform/portal-board-client";
import { session } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const { db, profile, user } = await session();
  const projects = await db
    .from("projects")
    .select("id,name,target_date")
    .order("name");

  if (projects.error) throw new Error(projects.error.message);

  return (
    <PortalBoardClient
      profile={{
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        discipline_id: profile.discipline_id,
      }}
      userId={user.id}
      projects={projects.data ?? []}
    />
  );
}
