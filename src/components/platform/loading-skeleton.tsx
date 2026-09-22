export default function LoadingSkeleton({ cards = false }: { cards?: boolean }) {
  return (
    <div className="page-transition-loader" role="status" aria-label="Loading page" aria-busy="true">
      <div className="page-loader-mark" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div className="page-loader-copy">
        <strong>Hamdan Studio</strong>
        <span>Loading workspace</span>
      </div>
      <div className="page-loader-track" aria-hidden="true"><i /></div>
      <span className="sr-only">Loading workspace content…</span>
    </div>
  );
}
