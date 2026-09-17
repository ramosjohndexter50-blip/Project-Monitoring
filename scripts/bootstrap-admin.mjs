import { createClient } from "@supabase/supabase-js";
const email = process.argv[2];
if (
  !email ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error(
    "Usage: node --env-file=.env.local scripts/bootstrap-admin.mjs confirmed-email. Requires server-only service key.",
  );
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const result = await db.rpc("bootstrap_first_admin", { target_email: email });
if (result.error) throw new Error(result.error.message);
console.log("Initial Super Admin assigned and audited.");
