export default function Loading() {
  return (
    <main className="access-message" role="status" aria-live="polite">
      <div aria-hidden="true" className="loading-spinner" />
      <p>Loading project workspace…</p>
    </main>
  );
}
