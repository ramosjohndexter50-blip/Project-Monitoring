"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function ResetPassword() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-panel">
      <h1>Set your password</h1>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (data.get("password") !== data.get("confirm")) {
            setMessage("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const db = createClient();
            if (!db) throw new Error("Supabase not configured");
            const result = await db.auth.updateUser({
              password: String(data.get("password")),
            });
            if (result.error) throw result.error;
            setMessage("Password saved. You can open your workspace.");
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Password update failed.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          New password
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm password
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <button disabled={busy}>Save password</button>
        <p role="status">{message}</p>
      </form>
      <Link href="/">Open workspace</Link>
    </main>
  );
}
