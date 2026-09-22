"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import projectLogo from "../../image/project.png";
import ThemeToggle from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

export default function LoginScreen() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError(
        "Supabase is not configured. Add the values from .env.example first.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (result.data.session) {
        if (result.data.user?.app_metadata.must_change_password === true) {
          router.replace("/auth/reset");
          router.refresh();
          return;
        }
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
    <main className="login-shell baseline-login">
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
            <div className="eyebrow">PROJECT OPERATIONS</div>
            <h1>Welcome back</h1>
            <p>Sign in with the account provided by your Super Admin.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
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
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="login-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Please wait..." : "Sign in"}
              <span>→</span>
            </button>
          </form>
          <p className="login-note">
            Secure role-based access with project and discipline controls.
          </p>
        </div>
      </section>

      <aside className="login-aside">
        <div className="login-aside-content">
          <div className="login-aside-brand">
            <span className="login-aside-logo-wrap">
              <Image src={projectLogo} alt="Hamdan Studio logo" priority />
            </span>
            <span>
              <strong>Hamdan Studio</strong>
              <small>PROJECT MONITOR</small>
            </span>
          </div>
          <span className="login-aside-eyebrow">HAMDAN STUDIO · PROJECT MONITOR</span>
          <h2>One clean workspace for every project team.</h2>
          <p>Track projects, tasks, deliverables, RFIs, milestones and approvals from one consistent system.</p>
          <div className="login-feature-grid">
            <article><strong>01</strong><span>Clear ownership</span></article>
            <article><strong>02</strong><span>Live progress</span></article>
            <article><strong>03</strong><span>Role-based access</span></article>
          </div>
        </div>
      </aside>
    </main>
  );
}
