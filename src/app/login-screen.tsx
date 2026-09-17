"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginScreen() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Add the values from .env.example first.",
      );
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                data: { full_name: fullName },
                emailRedirectTo: `${window.location.origin}/auth/callback`,
              },
            });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setNotice(
          "Account created. Check your email to confirm your account, then sign in.",
        );
        setMode("signin");
        return;
      }

      if (result.data.session) {
        await supabase.rpc("record_session_event", { event: "login" });
        router.refresh();
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand login-brand">
          <span className="brand-mark">⌁</span>
          <span>HAMDAN STUDIO MANILA</span>
        </div>
        <div className="login-copy">
          <div className="eyebrow">PROJECT OPERATIONS</div>
          <h1>
            {mode === "signin" ? "Welcome back." : "Create your account."}
          </h1>
          <p>
            {mode === "signin"
              ? "Sign in to see your project dashboard and keep every change attributed to the right person."
              : "Create an account to join the project workspace and appear in the audit trail."}
          </p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Full name
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Juan Dela Cruz"
                required
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>
          {mode === "signup" && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
                required
              />
            </label>
          )}
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="login-notice" role="status">
              {notice}
            </p>
          )}
          <button
            className="login-submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
            <span>↗</span>
          </button>
        </form>
        <button
          className="login-switch"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setNotice("");
          }}
        >
          {mode === "signin"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>
        <p className="login-note">
          Your session is required for audit history and role-based access.
        </p>
      </section>
      <aside className="login-aside">
        <div className="aside-mark">⌁</div>
        <p>
          ONE SOURCE
          <br />
          <em>OF TRUTH</em>
        </p>
        <span>Portside Residence · 2026</span>
      </aside>
    </main>
  );
}
