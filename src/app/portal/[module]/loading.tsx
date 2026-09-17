export default function ModuleLoading() {
  return (
    <div aria-busy="true" aria-label="Loading module" className="module-loading">
      <div className="platform-heading">
        <div>
          <div className="loading-line loading-eyebrow" />
          <div className="loading-line loading-title" />
          <div className="loading-line loading-meta" />
        </div>
      </div>
      <div className="register-filters loading-filters">
        <div className="loading-field" />
        <div className="loading-field" />
        <div className="loading-field" />
        <div className="loading-field" />
      </div>
      <div className="register-card table-wrap">
        <div className="loading-table">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="loading-row" key={index}>
              <span />
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
