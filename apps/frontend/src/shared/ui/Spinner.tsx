type SpinnerProps = {
  label?: string;
};

export function Spinner({ label = "Carregando" }: SpinnerProps) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
