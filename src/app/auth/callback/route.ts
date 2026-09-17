import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await serverClient();
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next =
    url.searchParams.get("next") === "/auth/reset" ? "/auth/reset" : "/";
  const result = code
    ? await db.auth.exchangeCodeForSession(code)
    : hash && ["signup", "invite", "recovery", "email"].includes(type ?? "")
      ? await db.auth.verifyOtp({
          token_hash: hash,
          type: type as EmailOtpType,
        })
      : { error: new Error("Invalid confirmation link") };
  if (result.error)
    return NextResponse.redirect(
      new URL("/?auth_error=invalid_link", url.origin),
    );
  return NextResponse.redirect(new URL(next, url.origin));
}
