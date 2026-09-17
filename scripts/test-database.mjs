import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role service_role bypassrls; create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;
create publication supabase_realtime;`);
for (const file of readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql") && !f.includes("discipline_control"))
  .sort()) {
  const sql = readFileSync("supabase/migrations/" + file, "utf8").replace(
    "create extension if not exists pgcrypto;",
    "-- gen_random_uuid is built into this PostgreSQL test runtime",
  );
  try {
    await db.exec(sql);
    console.log("PASS migration", file);
  } catch (e) {
    console.error("FAIL migration", file, e.message, e.where);
    process.exit(1);
  }
}
await db.exec(
  "grant select,insert,update,delete on all tables in schema public to authenticated; revoke update on public.notifications from authenticated; grant update(read_at) on public.notifications to authenticated;",
);
const ids = Object.fromEntries(
  [
    "admin",
    "manager",
    "lead",
    "member",
    "viewer",
    "client",
    "disabled",
    "outsider",
    "orgadmin",
    "architect",
    "consultant",
  ].map((key, i) => [
    key,
    `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
for (const [name, id] of Object.entries(ids))
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [id, name + "@example.invalid"],
  );
await db.exec("set role service_role");
assert.equal(
  (
    await db.query(
      "select public.bootstrap_first_admin('admin@example.invalid') id",
    )
  ).rows[0].id,
  ids.admin,
);
await db.exec("reset role");
console.log("PASS confirmed initial Super Admin bootstrap");
const roles = {
  admin: "super_admin",
  manager: "project_manager",
  lead: "discipline_lead",
  member: "team_member",
  viewer: "viewer",
  client: "client",
  disabled: "team_member",
  outsider: "project_manager",
  orgadmin: "admin",
  architect: "project_architect",
  consultant: "consultant",
};
for (const [name, id] of Object.entries(ids))
  await db.query(
    "update public.profiles set role=$1,is_active=$2 where id=$3",
    [roles[name], name !== "disabled", id],
  );
const d = (
  await db.query("select id from public.disciplines where name='Architecture'")
).rows[0].id;
const d2 = (
  await db.query("select id from public.disciplines where name='Structural'")
).rows[0].id;
const p = (
  await db.query(
    "insert into public.projects(name,created_by) values('Project A',$1) returning id",
    [ids.admin],
  )
).rows[0].id;
const p2 = (
  await db.query(
    "insert into public.projects(name,created_by) values('Project B',$1) returning id",
    [ids.admin],
  )
).rows[0].id;
await db.query(
  "insert into public.project_disciplines(project_id,discipline_id) values($1,$2),($1,$3),($4,$2)",
  [p, d, d2, p2],
);
for (const name of [
  "manager",
  "lead",
  "member",
  "viewer",
  "client",
  "disabled",
  "architect",
  "consultant",
])
  await db.query(
    "insert into public.project_members(project_id,user_id,role_key,discipline_id) values($1,$2,$3,$4)",
    [p, ids[name], roles[name], name === "manager" ? null : d],
  );
const t = (
  await db.query(
    "insert into public.tasks(project_id,discipline_id,task_name,owner) values($1,$2,'Plan',$3) returning id",
    [p, d, ids.member],
  )
).rows[0].id;
await db.query(
  "insert into public.tasks(project_id,discipline_id,task_name) values($1,$2,'Structural work'),($3,$4,'Private project')",
  [p, d2, p2, d],
);
async function as(name, fn) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    ids[name],
  ]);
  try {
    await fn();
  } finally {
    await db.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false)",
    );
  }
}
async function denied(sql, params = []) {
  let failed = false;
  try {
    const r = await db.query(sql, params);
    failed = r.affectedRows === 0;
  } catch {
    failed = true;
  }
  assert.ok(failed, "Unauthorized operation should fail: " + sql);
}
for (const [name, count] of Object.entries({
  admin: 2,
  manager: 1,
  lead: 1,
  member: 1,
  viewer: 1,
  client: 1,
  disabled: 0,
  outsider: 0,
  orgadmin: 2,
  architect: 1,
  consultant: 1,
}))
  await as(name, async () => {
    assert.equal(
      (await db.query("select * from public.projects")).rows.length,
      count,
    );
    console.log("PASS project isolation", name);
  });
await as("lead", async () => {
  await denied(
    "update public.projects set name='unauthorized project edit' where id=$1",
    [p],
  );
  assert.equal((await db.query("select * from public.tasks")).rows.length, 1);
  await denied(
    "update public.tasks set status='completed' where task_name='Structural work'",
  );
});
await as("viewer", async () => {
  await denied("update public.tasks set status='completed' where id=$1", [t]);
  await denied(
    "insert into public.tasks(project_id,discipline_id,task_name) values($1,$2,'attack')",
    [p, d],
  );
  await denied("update public.profiles set role='super_admin' where id=$1", [
    ids.viewer,
  ]);
});
await as("member", async () => {
  await db.query("update public.tasks set status='in_progress' where id=$1", [
    t,
  ]);
  await denied("update public.tasks set status='approved' where id=$1", [t]);
  await denied("update public.tasks set project_id=$1 where id=$2", [p2, t]);
});
await as("disabled", async () => {
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
  await denied("select public.refresh_deadline_notifications()");
});
await as("orgadmin", async () => {
  await denied("update public.profiles set role='super_admin' where id=$1", [
    ids.member,
  ]);
  await denied(
    "insert into public.role_permissions values('viewer','settings.manage')",
  );
});
await as("admin", async () => {
  await db.query("update public.tasks set status='completed' where id=$1", [t]);
  assert.equal(
    (
      await db.query("select percent_complete from public.tasks where id=$1", [
        t,
      ])
    ).rows[0].percent_complete,
    100,
  );
  await denied("delete from public.audit_logs");
});
console.log("PASS authorization, task lifecycle and immutable audit checks");

// Approval snapshots, reviewer order, revision locking, and history immutability.
const deliverable = (
  await db.query(
    "insert into public.deliverables(project_id,discipline_id,title,owner) values($1,$2,'Drawing package',$3) returning id",
    [p, d, ids.member],
  )
).rows[0].id;
const workflow = (
  await db.query(
    "insert into public.approval_workflows(project_id,name,deliverable_type) values($1,'Lead then client','Drawing Package') returning id",
    [p],
  )
).rows[0].id;
await db.query(
  "insert into public.workflow_steps(workflow_id,sequence,reviewer,name) values($1,1,$2,'Discipline review'),($1,2,$3,'Client review')",
  [workflow, ids.lead, ids.client],
);
let approval;
await as("member", async () => {
  approval = (
    await db.query("select public.submit_approval($1,$2) id", [
      deliverable,
      workflow,
    ])
  ).rows[0].id;
  await denied("update public.deliverables set revision='01' where id=$1", [
    deliverable,
  ]);
  await denied(
    "update public.deliverables set description='Changed during review' where id=$1",
    [deliverable],
  );
  await denied("update public.deliverables set status='approved' where id=$1", [
    deliverable,
  ]);
});
await as("client", async () => {
  await denied("select public.decide_approval($1,'approved','skip lead')", [
    approval,
  ]);
});
await as("outsider", async () => {
  await denied(
    "select public.decide_approval($1,'approved','outside project')",
    [approval],
  );
  assert.equal(
    (await db.query("select * from public.approvals")).rows.length,
    0,
  );
});
await as("lead", async () => {
  await db.query("select public.decide_approval($1,'approved','Reviewed')", [
    approval,
  ]);
  await denied("select public.decide_approval($1,'approved','duplicate')", [
    approval,
  ]);
});
await as("client", async () => {
  await db.query("select public.decide_approval($1,'approved','Accepted')", [
    approval,
  ]);
  assert.equal(
    (
      await db.query("select status from public.deliverables where id=$1", [
        deliverable,
      ])
    ).rows[0].status,
    "approved",
  );
  await denied("delete from public.approval_decisions");
});
await as("member", async () => {
  await denied(
    "update public.deliverables set title='Changed after approval' where id=$1",
    [deliverable],
  );
  await db.query("update public.deliverables set revision='01' where id=$1", [
    deliverable,
  ]);
  assert.equal(
    (
      await db.query("select status from public.deliverables where id=$1", [
        deliverable,
      ])
    ).rows[0].status,
    "draft",
  );
});
console.log("PASS approval ordering, immutable snapshots and revision locking");
// Private storage policy checks with fixture storage.objects, not a live Storage server.
const path = `${p}/${d}/test/drawing.pdf`;
await as("member", async () => {
  await db.query(
    "insert into storage.objects(bucket_id,name) values('project-documents',$1)",
    [path],
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('project-documents',$1)",
    [`${p2}/${d}/test/attack.pdf`],
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('project-documents','invalid/path')",
  );
});
await as("viewer", async () => {
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('project-documents',$1)",
    [`${p}/${d}/test/viewer.pdf`],
  );
});
await as("outsider", async () => {
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
});
await as("disabled", async () => {
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
});
await as("member", async () => {
  await db.query(
    "insert into public.documents(project_id,discipline_id,document_number,title,storage_path) values($1,$2,'AR-001','Plan',$3)",
    [p, d, path],
  );
  await denied(
    "insert into public.documents(project_id,discipline_id,document_number,title,storage_path) values($1,$2,'AR-002','Fake',$3)",
    [p, d, `${p}/${d}/missing.pdf`],
  );
});
console.log("PASS private storage scoping and document path validation");
const predecessor = (
  await db.query(
    "insert into public.tasks(project_id,discipline_id,task_name,owner) values($1,$2,'Predecessor',$3) returning id",
    [p, d, ids.member],
  )
).rows[0].id;
await as("lead", async () => {
  await db.query("update public.tasks set status='in_progress' where id=$1", [
    t,
  ]);
  await db.query(
    "insert into public.task_dependencies(task_id,depends_on) values($1,$2)",
    [t, predecessor],
  );
  await denied(
    "insert into public.task_dependencies(task_id,depends_on) values($1,$2)",
    [predecessor, t],
  );
  await db.query("update public.tasks set status='in_progress' where id=$1", [
    t,
  ]);
  await denied("update public.tasks set status='completed' where id=$1", [t]);
});
await as("member", async () => {
  await db.query(
    "insert into public.task_comments(task_id,body) values($1,'Coordination note')",
    [t],
  );
  await denied(
    "insert into public.task_comments(task_id,author,body) values($1,$2,'Impersonation')",
    [t, ids.admin],
  );
});
await as("viewer", async () => {
  await denied(
    "insert into public.task_comments(task_id,body) values($1,'Unauthorized note')",
    [t],
  );
  await denied("select public.bootstrap_first_admin('viewer@example.invalid')");
});
await as("admin", async () => {
  await db.query(
    "insert into public.project_permission_overrides(project_id,user_id,permission_key,allowed) values($1,$2,'tasks.view',false)",
    [p, ids.member],
  );
});
await as("member", async () => {
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
});
await as("lead", async () => {
  const report = (
    await db.query("select public.project_report($1) report", [p])
  ).rows[0].report;
  assert.equal(report.tasks, 2);
});
await as("disabled", async () => {
  const report = (await db.query("select public.project_report(null) report"))
    .rows[0].report;
  assert.equal(report.tasks, 0);
});
console.log(
  "PASS dependency cycles, predecessor completion, comments, overrides, and scoped reports",
);
const rls = (
  await db.query(
    "select tablename from pg_tables where schemaname='public' and not rowsecurity",
  )
).rows;
assert.deepEqual(rls, []);
await db.exec("set role anon");
await denied("select * from public.tasks");
await denied("select public.submit_approval($1,$2)", [deliverable, workflow]);
await db.exec("reset role");
console.log(
  "PASS RLS enabled on every public table and anonymous access denied",
);
assert.deepEqual(
  (
    await db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
    )
  ).rows,
  [],
);
const attacker = crypto.randomUUID();
await db.query(
  "insert into auth.users(id,email,raw_user_meta_data) values($1,'metadata-attack@example.invalid',$2)",
  [
    attacker,
    JSON.stringify({
      role: "super_admin",
      is_admin: true,
      full_name: "Unprivileged account",
    }),
  ],
);
assert.equal(
  (await db.query("select role from public.profiles where id=$1", [attacker]))
    .rows[0].role,
  "viewer",
);
await as("admin", async () => {
  await denied(
    "insert into public.audit_logs(action,entity) values('forged','tasks')",
  );
});
await db.query(
  "insert into public.issues(project_id,discipline_id,issue_number,title,owner,due_date) values($1,$2,'ISS-TEST','Upcoming issue',$3,current_date+1)",
  [p, d, ids.member],
);
await as("member", async () => {
  const initial = (
    await db.query("select count(*) n from public.notifications")
  ).rows[0].n;
  await db.query("select public.refresh_deadline_notifications()");
  assert.ok(
    (await db.query("select count(*) n from public.notifications")).rows[0].n >
      initial,
  );
  const before = (await db.query("select count(*) n from public.notifications"))
    .rows[0].n;
  await db.query("select public.refresh_deadline_notifications()");
  assert.equal(
    (await db.query("select count(*) n from public.notifications")).rows[0].n,
    before,
  );
  await denied("update public.notifications set title='forged'");
});
console.log(
  "PASS private privilege boundaries, metadata isolation and notification integrity",
);
// Validate the stricter discipline model as an upgrade of an existing database.
await db.exec(
  readFileSync(
    "supabase/migrations/20260917033350_discipline_control.sql",
    "utf8",
  ),
);
await db.query(
  "update public.profiles set discipline_id=$1,position='Designer' where role<>'super_admin'",
  [d],
);
await db.query("delete from public.project_permission_overrides");
await db.query(
  "update public.tasks set owner=$1,status='in_progress' where id=$2",
  [ids.member, t],
);
await denied(
  "insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'public-signup@example.invalid','{\"role\":\"super_admin\"}')",
);
await as("member", async () => {
  await denied(
    "insert into public.employee_provisioning(email,full_name,role_key,discipline_id,position) values('attack@example.invalid','Attack','super_admin',$1,'Admin')",
    [d],
  );
  await denied(
    "update public.tasks set notes='changed instructions' where id=$1",
    [t],
  );
  await denied("update public.tasks set owner=$1 where id=$2", [ids.viewer, t]);
  await denied("update public.tasks set status='completed' where id=$1", [t]);
  await db.query(
    "update public.tasks set status='for_review',percent_complete=100,progress_note='Ready for review' where id=$1",
    [t],
  );
  assert.equal(
    (
      await db.query("select percent_complete from public.tasks where id=$1", [
        t,
      ])
    ).rows[0].percent_complete,
    100,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.tasks where discipline_id=$1",
        [d2],
      )
    ).rows[0].n,
    0,
  );
});
await as("orgadmin", async () => {
  await denied("update public.profiles set position='Changed' where id=$1", [
    ids.member,
  ]);
  await denied("insert into public.projects(name) values('Not allowed')");
});
await as("manager", async () => {
  // Whole-project membership no longer opens other disciplines.
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.tasks where discipline_id=$1",
        [d2],
      )
    ).rows[0].n,
    0,
  );
  await denied(
    "insert into public.tasks(project_id,discipline_id,task_name) values($1,$2,'Unauthorized')",
    [p, d],
  );
});
await as("admin", async () => {
  await denied(
    "insert into public.tasks(project_id,discipline_id,task_name,owner) values($1,$2,'Wrong discipline',$3)",
    [p, d2, ids.member],
  );
  const reservation = (
    await db.query(
      "insert into public.employee_provisioning(email,full_name,role_key,discipline_id,position) values('new-employee@example.invalid','New employee','employee',$1,'Designer') returning token",
      [d],
    )
  ).rows[0];
  await db.exec(
    "reset role; select set_config('request.jwt.claim.sub','',false)",
  );
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'new-employee@example.invalid',$1)",
    [
      JSON.stringify({
        provisioning_token: reservation.token,
        role: "super_admin",
      }),
    ],
  );
  const created = (
    await db.query(
      "select role,discipline_id,position from public.profiles where email='new-employee@example.invalid'",
    )
  ).rows[0];
  assert.equal(created.role, "employee");
  assert.equal(created.discipline_id, d);
  assert.equal(created.position, "Designer");
  assert.equal(
    (await db.query("select count(*) n from public.employee_provisioning"))
      .rows[0].n,
    0,
  );
});
await as("admin", async () => {
  const created = (
    await db.query(
      "select public.save_project_contributors(null,$1,$2,null) id",
      [
        JSON.stringify({ name: "Integrated project", project_code: "INT-01" }),
        [d, d2],
      ],
    )
  ).rows[0].id;
  assert.equal(
    (
      await db.query("select * from public.project_discipline_summary($1)", [
        created,
      ])
    ).rows.length,
    2,
  );
  await db.query("select public.set_project_contributors($1,$2)", [p, [d2]]);
});
await as("member", async () => {
  assert.equal(
    (await db.query("select * from public.projects where id=$1", [p])).rows
      .length,
    0,
  );
});
await as("admin", async () => {
  await db.query("select public.set_project_contributors($1,$2)", [p, [d, d2]]);
});
await db.query("update public.profiles set discipline_id=$1 where id=$2", [
  d2,
  ids.member,
]);
await as("member", async () => {
  await denied("update public.tasks set percent_complete=50 where id=$1", [t]);
});
assert.ok(
  (
    await db.query(
      "select * from public.task_history where task_id=$1 and field_changed='progress_note'",
      [t],
    )
  ).rows.length > 0,
);
console.log(
  "PASS invitation-only provisioning, discipline isolation, reserved assignments, 100% review progress, history, contributor revocation and profile-discipline changes",
);
await db.close();
