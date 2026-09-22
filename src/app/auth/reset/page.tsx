"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { changePassword } from "./actions";
import { useRouter } from "next/navigation";
import projectLogo from "../../../../image/project.png";
import ThemeToggle from "@/components/theme-toggle";

export default function ResetPassword() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <main className="login-shell baseline-login login-reset-shell">
      <section className="login-panel">
        <div className="login-topline">
          <div className="login-studio-brand">
            <Image src={projectLogo} alt="" priority />
            <span>Hamdan Studio<small>PROJECT MONITOR</small></span>
          </div>
          <ThemeToggle />
        </div>

        <div className="login-card">
          <div className="login-copy">
            <div className="eyebrow">ACCOUNT SECURITY</div>
            <h1>Set your password</h1>
            <p>Choose your own password before opening the workspace. Use at least 12 characters.</p>
          </div>
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
                placeholder="Minimum 12 characters"
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
                placeholder="Repeat your new password"
              />
            </label>
            {message && <p className="login-notice" role="status">{message}</p>}
            <button className="login-submit" disabled={busy}>
              {busy ? "Saving..." : "Save password"} <span>→</span>
            </button>
          </form>
          <Link className="login-back-link" href="/">Back to sign in</Link>
        </div>
      </section>
      <aside className="login-aside">
        <div className="login-aside-content">
          <span className="login-aside-eyebrow">SECURE ACCESS</span>
          <h2>Your workspace starts with a protected account.</h2>
          <p>Authentication, active-account checks and database permissions work together before project data is shown.</p>
        </div>
      </aside>
    </main>
  );
}
