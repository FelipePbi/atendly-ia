export function ToneChoice({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="settings-tone-choice">
      <input checked={checked} name="tone" type="radio" onChange={onChange} />
      <span className="settings-tone-card">
        <strong>{label}</strong>
      </span>
    </label>
  );
}

export function Password({ label, name }: { label: string; name: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input"
        minLength={8}
        name={name}
        required
        type="password"
      />
    </label>
  );
}

export function SaveActions({
  busy,
  disabled = false,
  label = "Salvar alterações",
  message,
  onClick,
}: {
  busy: boolean;
  disabled?: boolean;
  label?: string;
  message: string | null;
  onClick?: () => void;
}) {
  return (
    <div className="settings-form-actions">
      <span className="settings-save-note" role="status">
        {message}
      </span>
      <button
        className="btn btn-primary"
        disabled={busy || disabled}
        type={onClick ? "button" : "submit"}
        onClick={onClick}
      >
        {busy ? "Salvando..." : label}
      </button>
    </div>
  );
}

export function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
