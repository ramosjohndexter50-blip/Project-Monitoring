export default function WorkflowPage() {
  const steps = [
    ["01", "Plan and assign", "Create a clear task, choose the correct discipline and owner, then set the due date and priority."],
    ["02", "Start the work", "Review the scope and notes before starting. Move the task to In Progress when work begins."],
    ["03", "Keep it updated", "Update progress while you work and add a short progress note when something important changes."],
    ["04", "Handle blockers", "If work cannot continue, set the task to Blocked and explain the reason. Return it to In Progress when resolved."],
    ["05", "Review and complete", "Move finished work to For Review. An authorized reviewer can approve or complete the task."],
  ];

  return (
    <>
      <div className="platform-heading">
        <div>
          <p className="page-crumb">Project Monitor <span>/</span> Workflow Guide</p>
          <h1>Workflow Guide</h1>
          <p>A simple five-step flow for everyday project work.</p>
        </div>
      </div>

      <section className="workflow-guide portal-workflow-guide">
        <div className="workflow-steps">
          {steps.map(([step, title, description]) => (
            <article key={step}>
              <span>{step}</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <div className="guide-notes">
          <h2>Daily routine</h2>
          <p>Open My Tasks, handle overdue and high-priority work first, update status and progress, then review anything waiting for feedback.</p>
          <h2>Access and responsibility</h2>
          <p>Your project membership, discipline, and role permissions determine what you can view or change. Regular employees work within their assigned project and discipline.</p>
          <h2>Task rules</h2>
          <p>Employees can create tasks in an assigned project and discipline. A regular employee's new task is assigned to that employee automatically. Leads and administrators can manage broader assignments when their permissions allow it.</p>
        </div>
      </section>
    </>
  );
}
