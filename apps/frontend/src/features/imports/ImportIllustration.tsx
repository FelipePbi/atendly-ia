const DEFAULT_BARS = [80, 60, 70, 45];

function ImportCardBars({ bars }: { bars: number[] }) {
  return (
    <>
      {bars.map((width) => (
        <span className="import-bar" key={width} style={{ width: `${width}%` }} />
      ))}
    </>
  );
}

export function ImportIllustration({ bars = DEFAULT_BARS }: { bars?: number[] }) {
  return (
    <div aria-hidden="true" className="import-illustration">
      <div className="import-card">
        <span className="import-card-label">Minha Agenda</span>
        <ImportCardBars bars={bars} />
      </div>
      <div className="import-arrow">
        <svg
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 34 24"
          width="34"
        >
          <path d="M2 12h28M23 5l7 7-7 7" />
        </svg>
        <span>uma vez</span>
      </div>
      <div className="import-card is-avenly">
        <span className="import-card-label">Avenly</span>
        <ImportCardBars bars={bars} />
      </div>
    </div>
  );
}
