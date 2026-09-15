"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Status = "On track" | "At risk" | "Blocked";

const disciplines = [
  { name: "Architecture", code: "AR", color: "#ef8f64", progress: 72, status: "On track" as Status, due: "18 Sep" },
  { name: "Interior Design", code: "ID", color: "#d6ad63", progress: 58, status: "At risk" as Status, due: "23 Sep" },
  { name: "Fire & Plumbing", code: "FP", color: "#df6c6c", progress: 41, status: "Blocked" as Status, due: "30 Sep" },
  { name: "HVAC", code: "HV", color: "#77a8bc", progress: 64, status: "On track" as Status, due: "25 Sep" },
  { name: "Electrical — High Current", code: "HC", color: "#a28bbd", progress: 86, status: "On track" as Status, due: "14 Sep" },
  { name: "Electrical — Low Current", code: "LC", color: "#78ad91", progress: 49, status: "At risk" as Status, due: "02 Oct" },
  { name: "BIM Coordination", code: "BM", color: "#73a6a0", progress: 67, status: "On track" as Status, due: "20 Sep" },
];

const tasks = [
  { name: "Resolve reflected ceiling plan clashes", discipline: "Interior Design", owner: "MC", status: "At risk" as Status, due: "23 Sep", priority: "High", updated: "12 min ago" },
  { name: "Issue coordinated ground floor plan", discipline: "Architecture", owner: "JL", status: "On track" as Status, due: "18 Sep", priority: "High", updated: "26 min ago" },
  { name: "Confirm pump room equipment clearances", discipline: "Fire & Plumbing", owner: "RS", status: "Blocked" as Status, due: "30 Sep", priority: "High", updated: "1 hr ago" },
  { name: "Update AHU sizing schedule", discipline: "HVAC", owner: "AT", status: "On track" as Status, due: "25 Sep", priority: "Medium", updated: "2 hrs ago" },
  { name: "Complete single-line diagram review", discipline: "Electrical — High Current", owner: "NP", status: "On track" as Status, due: "14 Sep", priority: "Medium", updated: "3 hrs ago" },
];

const icons = { overview: "▦", disciplines: "◫", activity: "↗", settings: "⚙" };

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
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
      setError("Supabase is not configured. Add the values from .env.example first.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setNotice("Account created. Check your email to confirm your account, then sign in.");
      setMode("signin");
      return;
    }

    if (result.data.user) onLogin(result.data.user);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand login-brand"><span className="brand-mark">⌁</span><span>FIELD<span className="brand-accent">/</span>NOTE</span></div>
        <div className="login-copy"><div className="eyebrow">PROJECT OPERATIONS</div><h1>{mode === "signin" ? "Welcome back." : "Create your account."}</h1><p>{mode === "signin" ? "Sign in to see your project dashboard and keep every change attributed to the right person." : "Create an account to join the project workspace and appear in the audit trail."}</p></div>
        <form className="login-form" onSubmit={handleSubmit}>
          {mode === "signup" && <label>Full name<input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Juan Dela Cruz" required /></label>}
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
          {mode === "signup" && <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" required /></label>}
          {error && <p className="login-error" role="alert">{error}</p>}
          {notice && <p className="login-notice" role="status">{notice}</p>}
          <button className="login-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}<span>↗</span></button>
        </form>
        <button className="login-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>{mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
        <p className="login-note">Your session is required for audit history and role-based access.</p>
      </section>
      <aside className="login-aside"><div className="aside-mark">⌁</div><p>ONE SOURCE<br /><em>OF TRUTH</em></p><span>Portside Residence · 2026</span></aside>
    </main>
  );
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("overview");
  const [filter, setFilter] = useState<"All tasks" | Status>("All tasks");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => (filter === "All tasks" || task.status === filter) && task.name.toLowerCase().includes(search.toLowerCase())),
    [filter, search],
  );

  if (isLoading) {
    return <main className="auth-loading"><span className="live-dot" />Checking your session...</main>;
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const userInitials = (user.user_metadata?.full_name ?? user.email ?? "US").slice(0, 2).toUpperCase();
  const userName = user.user_metadata?.full_name ?? user.email ?? "Signed-in user";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">⌁</span><span>FIELD<span className="brand-accent">/</span>NOTE</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="project-switcher"><span className="project-dot" />Portside Residence<span className="chevron">⌄</span></button>
        <nav className="main-nav" aria-label="Main navigation">
          {[["overview", "Overview"], ["disciplines", "Disciplines"], ["activity", "Activity log"], ["settings", "Project settings"]].map(([key, label]) => (
            <button key={key} className={`nav-item ${activeNav === key ? "active" : ""}`} onClick={() => setActiveNav(key)}><span className="nav-icon">{icons[key as keyof typeof icons]}</span>{label}</button>
          ))}
        </nav>
        <div className="sidebar-foot"><div className="sync-line"><span className="live-dot" />Live sync active</div><div className="user-chip"><span className="avatar avatar-orange">{userInitials}</span><span><b>{userName}</b><small>{user.user_metadata?.role ?? "Authenticated user"}</small></span><button className="more logout-button" onClick={() => supabase?.auth.signOut()} aria-label="Sign out">↪</button></div></div>
      </aside>

      <section className="content">
        <header className="topbar"><div className="breadcrumbs"><span>Projects</span><b>/</b><strong>Portside Residence</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="icon-button notification" aria-label="Notifications">♧<i /></button><span className="avatar avatar-orange">{userInitials}</span></div></header>
        <div className="page-body">
          <div className="page-heading"><div><div className="eyebrow">PROJECT OVERVIEW <span className="status-pill live"><span className="live-dot" />ON TRACK</span></div><h1>Portside Residence</h1><p>Project dashboard <span>·</span> Updated just now</p></div><div className="heading-actions"><button className="button secondary">↥ <span>Export PDF</span></button><button className="button primary">＋ <span>New task</span></button></div></div>

          <section className="stats-grid" aria-label="Project summary">
            <div className="stat-card accent-stat"><span className="stat-label">Overall progress</span><strong>68<span>%</span></strong><div className="progress-track"><div className="progress-fill" style={{ width: "68%" }} /></div><small>+4.2% from last week</small></div>
            <div className="stat-card"><span className="stat-label">Open tasks</span><strong>42</strong><small className="muted-stat">Across 7 disciplines</small><div className="mini-bars"><i style={{ height: "50%" }} /><i style={{ height: "70%" }} /><i style={{ height: "42%" }} /><i style={{ height: "85%" }} /><i style={{ height: "62%" }} /><i style={{ height: "90%" }} /></div></div>
            <div className="stat-card"><span className="stat-label">Needs attention</span><strong className="warm-number">8</strong><small className="muted-stat">5 at risk · 3 blocked</small><div className="attention-line"><span className="tiny-status risk" /><span className="tiny-status blocked" /><span className="tiny-status blocked" /><span className="tiny-status risk" /><span className="tiny-status risk" /></div></div>
            <div className="stat-card"><span className="stat-label">Next milestone</span><strong className="date-stat">14 <span>SEP</span></strong><small className="muted-stat">Electrical design review</small><div className="milestone-line"><span />12 days remaining</div></div>
          </section>

          <div className="section-heading"><div><h2>Discipline progress</h2><p>Live status across the project team</p></div><button className="text-button">View all disciplines ↗</button></div>
          <section className="discipline-grid">{disciplines.map((discipline) => <article className="discipline-card" key={discipline.code}><div className="discipline-top"><span className="discipline-code" style={{ background: discipline.color }}>{discipline.code}</span><span className={`status-dot ${discipline.status.toLowerCase().replace(" ", "-")}`} /> <span className="status-text">{discipline.status}</span></div><h3>{discipline.name}</h3><div className="discipline-progress"><strong>{discipline.progress}%</strong><span>Due {discipline.due}</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${discipline.progress}%`, background: discipline.color }} /></div></article>)}</section>

          <div className="section-heading task-heading"><div><h2>Task pulse</h2><p>Recent work requiring your attention</p></div><div className="view-toggle"><button className="selected">Table</button><button>Timeline</button></div></div>
          <section className="task-panel"><div className="table-toolbar"><div className="filter-group">{(["All tasks", "On track", "At risk", "Blocked"] as const).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item !== "All tasks" && <span className={`filter-count ${item.toLowerCase().replace(" ", "-")}`}>{item === "On track" ? 3 : item === "At risk" ? 5 : 3}</span>}</button>)}</div><label className="search-box">⌕<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" /></label></div><div className="table-wrap"><table><thead><tr><th>TASK</th><th>DISCIPLINE</th><th>OWNER</th><th>STATUS</th><th>DUE DATE</th><th>PRIORITY</th><th>UPDATED</th></tr></thead><tbody>{visibleTasks.map((task) => <tr key={task.name}><td><span className="task-name">{task.name}</span></td><td><span className="discipline-cell"><span className="table-dot" />{task.discipline}</span></td><td><span className="avatar avatar-small">{task.owner}</span></td><td><span className={`table-status ${task.status.toLowerCase().replace(" ", "-")}`}><i />{task.status}</span></td><td>{task.due}</td><td><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></td><td className="updated">{task.updated}</td></tr>)}</tbody></table></div></section>
          <footer className="footer-note"><span><span className="live-dot" /> Changes sync automatically across all disciplines</span><span>Last synced 14:32:08</span></footer>
        </div>
      </section>
    </main>
  );
}
