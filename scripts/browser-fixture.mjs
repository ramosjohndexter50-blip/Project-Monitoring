// Isolated browser verification fixture. Never deploy or point production at this server.
// Real PostgreSQL migrations/RLS via PGlite; Auth and Storage HTTP transport are fixtures.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;
create publication supabase_realtime;`);
for (const file of readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql") && !f.includes("discipline_control"))
  .sort())
  await db.exec(
    readFileSync("supabase/migrations/" + file, "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
await db.exec(
  "grant select,insert,update,delete on all tables in schema public to authenticated; revoke update on public.notifications from authenticated; grant update(read_at) on public.notifications to authenticated;",
);
const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  manager: "10000000-0000-4000-8000-000000000002",
  viewer: "10000000-0000-4000-8000-000000000003",
  disabled: "10000000-0000-4000-8000-000000000004",
};
for (const [name, id] of Object.entries(ids)) {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
    [id, `${name}@fixture.test`, JSON.stringify({ full_name: `Test ${name}` })],
  );
  await db.query(
    "update public.profiles set role=$1,is_active=$2 where id=$3",
    [
      name === "admin"
        ? "super_admin"
        : name === "manager"
          ? "project_manager"
          : "viewer",
      name !== "disabled",
      id,
    ],
  );
}
const project = "20000000-0000-4000-8000-000000000001";
await db.query(
  "insert into public.projects(id,name,project_code,client_name,created_by) values($1,'Harbor Design Consultancy','HDC-001','Harbor Client',$2)",
  [project, ids.admin],
);
const discipline = (
  await db.query("select id from public.disciplines where name='Architecture'")
).rows[0].id;
await db.query(
  "insert into public.project_disciplines(project_id,discipline_id) values($1,$2)",
  [project, discipline],
);
for (const name of ["manager", "viewer"])
  await db.query(
    "insert into public.project_members(project_id,user_id,role_key) values($1,$2,$3)",
    [project, ids[name], name === "manager" ? "project_manager" : "viewer"],
  );
await db.query(
  "insert into public.tasks(project_id,discipline_id,task_name,owner,due_date) values($1,$2,'Coordinate ground floor drawings',$3,current_date-1)",
  [project, discipline, ids.manager],
);
await db.query(
  "insert into public.milestones(project_id,discipline_id,name,due_date) values($1,$2,'Concept submission',current_date+7)",
  [project, discipline],
);
await db.query(
  "insert into public.deliverables(project_id,discipline_id,title,owner) values($1,$2,'Concept drawing package',$3)",
  [project, discipline, ids.manager],
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917033350_discipline_control.sql",
    "utf8",
  ),
);
await db.query(
  "update public.profiles set discipline_id=$1,position='Designer'",
  [discipline],
);
const user = (id) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: Object.keys(ids).find((k) => ids[k] === id) + "@fixture.test",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
});
const token = (id) =>
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
    }),
  ).toString("base64url") +
  ".fixture";
const quote = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Error("Invalid test identifier");
  return '"' + s + '"';
};
let queue = Promise.resolve();
const server = createServer((req, res) => {
  queue = queue
    .then(async () => {
      const headers = {
        "Access-Control-Allow-Origin": req.headers.origin ?? "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
        "Access-Control-Expose-Headers": "Content-Range",
        "Content-Type": "application/json",
      };
      const send = (data, status = 200, extra = {}) => {
        res.writeHead(status, { ...headers, ...extra });
        res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
      };
      if (req.method === "OPTIONS") {
        send(null, 204);
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1:55440");
      const parts = url.pathname.split("/");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      let body = {};
      try {
        body = JSON.parse(raw.toString() || "{}");
      } catch {}
      let uid = null;
      try {
        uid = JSON.parse(
          Buffer.from(
            (req.headers.authorization ?? "")
              .replace("Bearer ", "")
              .split(".")[1],
            "base64url",
          ).toString(),
        ).sub;
      } catch {}
      try {
        if (url.pathname === "/auth/v1/token") {
          const name = String(body.email ?? "").split("@")[0];
          const id = ids[name];
          if (!id) {
            send({ message: "Unknown fixture account" }, 400);
            return;
          }
          await db.query(
            "update auth.users set last_sign_in_at=now() where id=$1",
            [id],
          );
          send({
            access_token: token(id),
            refresh_token: "fixture-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user: user(id),
          });
          return;
        }
        if (url.pathname === "/auth/v1/user") {
          if (!uid) {
            send({ message: "Not authenticated" }, 401);
            return;
          }
          send(user(uid));
          return;
        }
        if (url.pathname === "/auth/v1/logout") {
          send({});
          return;
        }
        if (url.pathname === "/auth/v1/admin/generate_link") {
          if (req.headers.authorization !== "Bearer fixture-service-key") {
            send({ message: "Denied" }, 403);
            return;
          }
          const id = crypto.randomUUID();
          await db.query(
            "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
            [id, body.email, JSON.stringify(body.data ?? {})],
          );
          send({
            ...user(id),
            email: body.email,
            action_link: "http://localhost:3101/auth/reset",
            hashed_token: "fixture-hash",
            email_otp: "123456",
            verification_type: "invite",
            redirect_to: "http://localhost:3101/auth/reset",
          });
          return;
        }
        const service =
          req.headers.authorization === "Bearer fixture-service-key";
        await db.exec(
          service ? "reset role" : `set role ${uid ? "authenticated" : "anon"}`,
        );
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          uid ?? "",
        ]);
        if (parts[1] === "rest" && parts[3] === "rpc") {
          const keys = Object.keys(body);
          if (parts[4] === "project_discipline_summary") {
            const result = await db.query(
              "select * from public.project_discipline_summary($1)",
              [body.target_project],
            );
            send(result.rows);
            return;
          }
          const sql = `select public.${quote(parts[4])}(${keys.map((k, i) => `${quote(k)} => $${i + 1}`).join(",")}) as value`;
          const result = await db.query(sql, Object.values(body));
          send(result.rows[0]?.value ?? null);
          return;
        }
        if (parts[1] === "rest") {
          const table = quote(parts[3]);
          const values = [];
          const clauses = [];
          const bind = (value) => {
            values.push(value);
            return "$" + values.length;
          };
          for (const [key, value] of url.searchParams) {
            if (["select", "order", "limit", "offset"].includes(key)) continue;
            const column = quote(key);
            const dot = value.indexOf(".");
            const op = value.slice(0, dot);
            const val = value.slice(dot + 1);
            if (op === "eq") clauses.push(`${column}=${bind(val)}`);
            else if (op === "neq") clauses.push(`${column}<>${bind(val)}`);
            else if (op === "is")
              clauses.push(
                `${column} is ${val === "null" ? "null" : "not null"}`,
              );
            else if (op === "ilike")
              clauses.push(`${column} ilike ${bind(val)}`);
            else if (["lt", "lte", "gt", "gte"].includes(op))
              clauses.push(
                `${column}${{ lt: "<", lte: "<=", gt: ">", gte: ">=" }[op]}${bind(val)}`,
              );
            else if (op === "in" || op === "not") {
              const list = (op === "not" ? val.slice(3) : val)
                .replace(/^\(|\)$/g, "")
                .split(",")
                .map((s) => s.replace(/^"|"$/g, ""));
              clauses.push(
                `${column} ${op === "not" ? "not in" : "in"} (${list.map(bind).join(",")})`,
              );
            }
          }
          const where = clauses.length ? " where " + clauses.join(" and ") : "";
          const selection = url.searchParams.get("select");
          const columns =
            selection && selection !== "*"
              ? selection.split(",").map(quote).join(",")
              : "*";
          let result,
            total = 0;
          if (req.method === "GET" || req.method === "HEAD") {
            total = Number(
              (
                await db.query(
                  `select count(*) n from public.${table}${where}`,
                  values,
                )
              ).rows[0].n,
            );
            const order = url.searchParams
              .get("order")
              ?.split(",")
              .map((o) => {
                const [col, dir, nulls] = o.split(".");
                return `${quote(col)} ${dir === "desc" ? "desc" : "asc"} ${nulls === "nullslast" ? "nulls last" : nulls === "nullsfirst" ? "nulls first" : ""}`;
              })
              .join(",");
            const limit = Math.min(
              Number(url.searchParams.get("limit") ?? 1000),
              1000,
            );
            const offset = Number(url.searchParams.get("offset") ?? 0);
            result = await db.query(
              `select ${columns} from public.${table}${where}${order ? " order by " + order : ""} limit ${limit} offset ${offset}`,
              values,
            );
          } else if (req.method === "POST") {
            const keys = Object.keys(body);
            const vals = keys.map((k) => body[k]);
            result = await db.query(
              `insert into public.${table}(${keys.map(quote).join(",")}) values(${vals.map((_, i) => "$" + (i + 1)).join(",")}) returning ${columns}`,
              vals,
            );
          } else if (req.method === "PATCH") {
            const assignments = Object.entries(body).map(
              ([key, value]) => `${quote(key)}=${bind(value)}`,
            );
            result = await db.query(
              `update public.${table} set ${assignments.join(",")}${where} returning ${columns}`,
              values,
            );
          } else if (req.method === "DELETE")
            result = await db.query(
              `delete from public.${table}${where} returning ${columns}`,
              values,
            );
          else throw Error("Unsupported fixture operation");
          const object = (req.headers.accept ?? "").includes(
            "vnd.pgrst.object",
          );
          send(object ? (result.rows[0] ?? null) : result.rows, 200, {
            "Content-Range": `0-${Math.max(0, result.rows.length - 1)}/${total || result.rows.length}`,
          });
          return;
        }
        if (parts[1] === "storage") {
          if (parts[3] === "object" && parts[4] === "sign") {
            const path = parts.slice(6).join("/");
            const row = await db.query(
              "select * from storage.objects where bucket_id=$1 and name=$2",
              [parts[5], path],
            );
            if (!row.rows.length) throw Error("File denied");
            send({
              signedURL:
                "/object/sign/" + parts.slice(5).join("/") + "?token=fixture",
            });
            return;
          }
          if (parts[3] === "object" && req.method === "POST") {
            await db.query(
              "insert into storage.objects(bucket_id,name) values($1,$2)",
              [parts[4], decodeURIComponent(parts.slice(5).join("/"))],
            );
            send({ Key: parts.slice(4).join("/"), Id: crypto.randomUUID() });
            return;
          }
        }
        send({ message: "Unknown fixture endpoint" }, 404);
      } catch (e) {
        send({ message: e.message, code: e.code ?? "FIXTURE_ERROR" }, 400);
      } finally {
        await db.exec(
          "reset role; select set_config('request.jwt.claim.sub','',false)",
        );
      }
    })
    .catch((e) => {
      console.error(e.message);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Fixture error");
      }
    });
});
server.listen(55440, "127.0.0.1", () =>
  console.log(
    "Isolated database fixture ready on 127.0.0.1:55440; users admin/manager/viewer/disabled@fixture.test.",
  ),
);
