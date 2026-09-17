import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Invalid origin", { status: 403 });
  const db = await serverClient();
  await db.rpc("record_session_event", { event: "logout" });
  await db.auth.signOut();
  redirect("/");
}
export async function GET() {
  return new Response(
    '<form method="post"><button>Confirm sign out</button></form>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
