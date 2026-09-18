"use client";
import Link from "next/link";
import { useState } from "react";
import { changePassword } from "./actions";
import { useRouter } from "next/navigation";
export default function ResetPassword() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <main className="login-panel">
      <h1>Set your password</h1>
      <p>Choose your own password before opening the workspace. Use at least 12 characters.</p>
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
            const result = await changePassword(data);
            setMessage(result.message);
            if (result.ok) { router.replace("/"); router.refresh(); }
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
            minLength={12}
            maxLength={128}
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm password
          <input
            name="confirm"
            minLength={12}
            maxLength={128}
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
