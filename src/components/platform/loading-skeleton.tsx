export default function LoadingSkeleton({ cards = false }: { cards?: boolean }) {
  return (
    <div className="module-loading" role="status" aria-label="Loading workspace content" aria-busy="true">
      <div className="platform-heading" aria-hidden="true"><div>
        <div className="loading-line loading-eyebrow" /><div className="loading-line loading-title" /><div className="loading-line loading-meta" />
      </div></div>
      {cards ? <>
        <div className="metric-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <article key={i}><div className="loading-line loading-meta" /><div className="loading-line loading-title" /></article>)}</div>
        <div className="dashboard-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <section className="register-card" key={i}><div className="loading-line loading-title" />{Array.from({ length: 4 }, (_, j) => <div className="loading-row" key={j}><span /><span /></div>)}</section>)}</div>
      </> : <div className="register-card loading-table" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <div className="loading-row" key={i}><span /><span /><span /><span /></div>)}</div>}
    </div>
  );
}
