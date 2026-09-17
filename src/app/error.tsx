"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="access-message">
      <h1>Unable to open this page</h1>
      <p>
        Your account may not have permission, or the database setup is
        unavailable. Contact your administrator if this continues.
      </p>
      <button className="button secondary" onClick={reset}>
        Try again
      </button>{" "}
      <Link href="/">Workspace</Link> · <a href="/auth/signout">Sign out</a>
    </main>
  );
}
