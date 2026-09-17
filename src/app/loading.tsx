export default function Loading() {
  return (
    <main
      className="min-h-screen bg-[#f6f8f5] flex items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#e3e8e4] bg-white px-8 py-10 text-center shadow-[0_18px_55px_rgba(23,32,31,0.08)]">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#e3e8e4] bg-[#fbfcfa] p-2">
          <img
            src="/image/project.png"
            alt=""
            className="h-full w-full rounded-xl object-contain"
            aria-hidden="true"
          />
        </div>
        <div className="mx-auto mb-5 h-9 w-9 animate-spin rounded-full border-[3px] border-[#e3e8e4] border-t-[#ef8f64]" aria-hidden="true" />
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#73807d]">
          Project Monitor
        </p>
        <h1 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#17201f]">
          Loading workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#8b9691]">
          Preparing your projects, disciplines, and tasks…
        </p>
        <div className="mt-7 space-y-2" aria-hidden="true">
          <div className="h-2 animate-pulse rounded-full bg-[#edf1ee]" />
          <div className="mx-auto h-2 w-4/5 animate-pulse rounded-full bg-[#edf1ee]" />
          <div className="mx-auto h-2 w-3/5 animate-pulse rounded-full bg-[#edf1ee]" />
        </div>
      </section>
      <span className="sr-only">Please wait while the workspace loads.</span>
    </main>
  );
}
