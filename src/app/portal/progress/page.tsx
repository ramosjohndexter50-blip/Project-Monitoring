import ProgressDashboardClient from "@/components/platform/progress-dashboard-client";
import { session } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

type Category = {
  key: "model" | "annotation" | "coordination" | "sheet";
  label: string;
  total: number;
  completed: number;
  percent: number;
};

type DashboardData = {
  categories: Category[];
  overall_percent: number;
  task_count: number;
  projects: {
    project_id: string;
    project_name: string;
    project_code: string | null;
    task_count: number;
    overall_percent: number;
    categories: Category[];
  }[];
};

export default async function ProgressDashboardPage() {
  const { db } = await session();
  const result = await db.rpc("progress_dashboard", { target_project: null });
  if (result.error) throw new Error(result.error.message);

  return (
    <>
      <div className="platform-heading progress-dashboard-heading">
        <div>
          <p className="page-crumb">Project Monitor <span>/</span> Progress</p>
          <h1>Progress dashboard</h1>
          <p>Completion percentage by Model, Annotation, Coordination and Sheet.</p>
        </div>
      </div>
      <ProgressDashboardClient data={result.data as DashboardData} />
    </>
  );
}
