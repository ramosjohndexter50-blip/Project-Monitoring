"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getModule,
  type Choices,
  type DataRow,
  type Field,
} from "@/lib/platform/modules";
import {
  saveRecord,
  removeRecord,
  approvalAction,
  markNotification,
  createAccount,
  resetAccount,
  addRelated,
  respondRfi,
  type ActionResult,
} from "@/lib/platform/actions";
export function Result({ result }: { result: ActionResult | null }) {
  return result ? (
    <div className={result.ok ? "form-success" : "form-error"} role="status">
      <p>{result.message}</p>
      {result.link && (
        <textarea
          readOnly
          aria-label="One-time access link"
          value={result.link}
        />
      )}
    </div>
  ) : null;
}
export function RecordForm({
  moduleKey,
  row,
  project,
  choices,
  editable,
  projectAdmin = false,
  contributorIds = [],
  canReview = false,
}: {
  moduleKey: string;
  row: DataRow | null;
  project: string | null;
  choices: Choices;
  editable: boolean;
  projectAdmin?: boolean;
  contributorIds?: string[];
  canReview?: boolean;
}) {
  const config = getModule(moduleKey);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const id = row ? String(row[config.key ?? "id"]) : null;
  const [selectedDiscipline, setSelectedDiscipline] = useState(
    String(row?.discipline_id ?? ""),
  );
  const defaultValue = (field: Field) =>
    String(
      row?.[field.key] ??
        field.options?.[0] ??
        (field.key === "project_id"
          ? (project ?? "")
          : field.key === "role"
            ? "viewer"
            : field.key === "revision"
              ? "00"
              : field.type === "number"
                ? (field.min ?? 0)
                : ""),
    );
  const locked = (field: Field) =>
    moduleKey === "tasks" &&
    !projectAdmin &&
    !["status", "percent_complete", "progress_note"].includes(field.key);
  return (
    <form
      className="register-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          row &&
          [
            "users",
            "projects",
            "project_disciplines",
            "disciplines",
            "teams",
          ].includes(moduleKey) &&
          !confirm(
            "Save these changes? Employee access and project assignments may change immediately.",
          )
        )
          return;
        setBusy(true);
        setResult(null);
        const form = new FormData(e.currentTarget);
        try {
          if (moduleKey === "documents" && !id) {
            const file = form.get("file");
            if (!(file instanceof File) || !file.size)
              throw new Error("Choose a document to upload.");
            if (file.size > 50 * 1024 * 1024)
              throw new Error("Maximum file size is 50 MB.");
            const { createClient } = await import("@/lib/supabase/client");
            const db = createClient();
            if (!db) throw new Error("Supabase not configured.");
            const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${project}/${form.get("discipline_id")}/${crypto.randomUUID()}/${filename}`;
            const upload = await db.storage
              .from("project-documents")
              .upload(path, file, { upsert: false });
            if (upload.error) throw upload.error;
            form.set("storage_path", path);
          }
          const response = await saveRecord(moduleKey, id, project, form);
          setResult(response);
          if (response.ok) router.refresh();
        } catch (error) {
          setResult({
            ok: false,
            message: error instanceof Error ? error.message : "Unable to save.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>
        {row ? "Record details" : `New ${config.title.toLowerCase()} record`}
      </h2>
      {row?.updated_at && (
        <input
          type="hidden"
          name="_updated_at"
          value={String(row.updated_at)}
        />
      )}
      <fieldset disabled={!editable || busy}>
        {config.fields.map((field) => (
          <label
            key={field.key}
            className={field.type === "textarea" ? "span-all" : ""}
          >
            {field.label}
            {field.required ? " *" : ""}
            {field.type === "textarea" ? (
              <textarea
                name={field.key}
                defaultValue={defaultValue(field)}
                readOnly={locked(field)}
                rows={3}
                required={field.required}
                maxLength={10000}
              />
            ) : field.type === "checkbox" ? (
              <input
                name={field.key}
                type="checkbox"
                disabled={locked(field)}
                defaultChecked={
                  row
                    ? Boolean(row[field.key])
                    : ["is_active", "allowed"].includes(field.key)
                }
              />
            ) : field.type === "select" ? (
              <select
                name={field.key}
                onChange={
                  field.key === "discipline_id"
                    ? (e) => setSelectedDiscipline(e.target.value)
                    : undefined
                }
                disabled={
                  locked(field) ||
                  (!!row &&
                    config.project &&
                    ["project_id", "discipline_id"].includes(field.key))
                }
                required={field.required}
                defaultValue={defaultValue(field)}
              >
                <option value="">Choose…</option>
                {field.options
                  ?.filter(
                    (option) =>
                      moduleKey !== "tasks" ||
                      field.key !== "status" ||
                      projectAdmin ||
                      canReview ||
                      ![
                        "approved",
                        "completed",
                        "revision_required",
                        "cancelled",
                      ].includes(option) ||
                      option === row?.status,
                  )
                  .map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                {field.reference &&
                  choices[field.reference]
                    ?.filter(
                      (option) =>
                        moduleKey !== "tasks" ||
                        field.key !== "owner" ||
                        option.disciplineId === selectedDiscipline ||
                        option.value === row?.owner,
                    )
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
              </select>
            ) : (
              <input
                name={field.key}
                type={field.type ?? "text"}
                defaultValue={defaultValue(field)}
                readOnly={locked(field) || (!!row && field.immutable)}
                min={field.min}
                max={field.max}
                step={
                  field.key === "budget"
                    ? "0.01"
                    : field.type === "number"
                      ? "1"
                      : undefined
                }
                required={field.required}
                maxLength={10000}
              />
            )}
          </label>
        ))}
        {moduleKey === "projects" && (
          <div className="span-all">
            <h3>Contributing disciplines</h3>
            <p>
              Only selected active disciplines can work on this project.
              Removing one preserves its history.
            </p>
            <div className="contributor-options">
              {choices.disciplines?.map((d) => (
                <label key={d.value}>
                  <input
                    type="checkbox"
                    name="contributors"
                    value={d.value}
                    defaultChecked={contributorIds.includes(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {moduleKey === "documents" && !id && (
          <label className="span-all">
            File (private, maximum 50 MB)
            <input name="file" type="file" required />
          </label>
        )}
      </fieldset>
      {editable && (
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save record"}
        </button>
      )}
      {!editable && <p>Read-only access.</p>}
      <Result result={result} />
    </form>
  );
}
export function ActionButton({
  kind,
  id,
  moduleKey,
  extra,
}: {
  kind: "remove" | "read" | "reset";
  id: string;
  moduleKey?: string;
  extra?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  return (
    <div>
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          if (
            kind === "remove" &&
            !confirm("Remove this assignment? Access may change immediately.")
          )
            return;
          if (
            kind === "reset" &&
            !confirm("Generate a one-time password reset link for this user?")
          )
            return;
          setBusy(true);
          try {
            setResult(
              await (kind === "read"
                ? markNotification(id)
                : kind === "reset"
                  ? resetAccount(id)
                  : removeRecord(moduleKey!, id, extra)),
            );
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "read"
          ? "Mark read"
          : kind === "reset"
            ? "Reset access"
            : "Remove"}
      </button>
      <Result result={result} />
    </div>
  );
}
export function AccountForm({ choices }: { choices: Choices }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="register-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const form = new FormData(e.currentTarget);
          if (
            form.get("role") === "super_admin" &&
            !confirm("Create a Super Admin who can manage accounts, roles and web settings?")
          )
            return;
          setResult(await createAccount(form));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Create employee account</h2>
      <p>
        Choose the account role and home discipline. Admin manages projects;
        Super Admin manages accounts and web settings. Project membership is assigned by Admin.
      </p>
      <fieldset disabled={busy}>
        <label>
          Full name
          <input name="full_name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select name="role" required defaultValue="employee">
            <option value="">Choose role</option>
            {choices.roles?.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Discipline
          <select name="discipline_id" required>
            <option value="">Choose discipline</option>
            {choices.disciplines?.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Position
          <input name="position" required />
        </label>
        <label>
          Active account
          <input name="is_active" type="checkbox" defaultChecked />
        </label>
      </fieldset>
      <button className="button primary" disabled={busy}>
        Create account & setup link
      </button>
      <Result result={result} />
    </form>
  );
}
export function ApprovalForm({
  deliverables,
  workflows,
  approval,
}: {
  deliverables?: Choices[string];
  workflows?: Choices[string];
  approval?: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="register-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          setResult(await approvalAction(new FormData(e.currentTarget)));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>
        {approval
          ? "Record review decision"
          : "Submit deliverable for approval"}
      </h2>
      <fieldset disabled={busy}>
        {approval ? (
          <>
            <input type="hidden" name="approval" value={approval} />
            <label>
              Decision
              <select name="mode">
                <option value="approved">Approve</option>
                <option value="rejected">Request revision</option>
              </select>
            </label>
            <label>
              Review comments
              <textarea name="comments" maxLength={10000} />
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="mode" value="submit" />
            <label>
              Deliverable
              <select name="deliverable" required>
                <option value="">Choose…</option>
                {deliverables?.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Workflow
              <select name="workflow" required>
                <option value="">Choose…</option>
                {workflows?.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </fieldset>
      <button className="button primary" disabled={busy}>
        Submit
      </button>
      <Result result={result} />
    </form>
  );
}
export function RelatedForm({
  type,
  id,
  tasks,
}: {
  type: "task_comment" | "issue_comment" | "dependency";
  id: string;
  tasks?: Choices[string];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="register-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          setResult(await addRelated(new FormData(e.currentTarget)));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="entity_id" value={id} />
      <h3>{type === "dependency" ? "Add predecessor" : "Add comment"}</h3>
      {type === "dependency" ? (
        <label>
          Predecessor task
          <select name="depends_on" required>
            {tasks
              ?.filter((t) => t.value !== id)
              .map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label>
          Comment
          <textarea name="body" required maxLength={10000} />
        </label>
      )}
      <button disabled={busy} className="button secondary">
        Add
      </button>
      <Result result={result} />
    </form>
  );
}

export function RfiResponse({ id }: { id: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="register-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          setResult(await respondRfi(new FormData(e.currentTarget)));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Respond to RFI</h2>
      <input name="id" type="hidden" value={id} />
      <label>
        Response
        <textarea name="response" required maxLength={10000} />
      </label>
      <button className="button primary" disabled={busy}>
        Submit response
      </button>
      <Result result={result} />
    </form>
  );
}
