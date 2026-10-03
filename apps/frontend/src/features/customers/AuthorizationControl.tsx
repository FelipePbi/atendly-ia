import { useId } from "react";

import { Icon } from "@/shared/icons/Icon";

type AuthorizationControlProps = {
  authorized: boolean;
  busy: boolean;
  onToggle: () => void;
  /** `badge` é a forma da memória; `note` e `tag` são a caixa do quadro CL7. */
  variant?: "badge" | "note" | "tag";
  /** Nome da tag, para o nome acessível da caixa de cada linha. */
  subject?: string;
};

/**
 * Autorização de uso pela IA é sempre uma ação explícita e nunca nasce
 * marcada (Goal006/Goal012). O estado vai em texto e no estado do controle,
 * não só por cor, porque alternar decide se a IA pode usar este conteúdo com
 * o cliente.
 */
export function AuthorizationControl({
  authorized,
  busy,
  onToggle,
  subject,
  variant = "badge",
}: AuthorizationControlProps) {
  const titleId = useId();
  const hintId = useId();
  if (variant === "badge") {
    return (
      <div className="customer-authorization">
        <span className={authorized ? "badge badge-ai" : "badge"}>
          <Icon name={authorized ? "check" : "lock"} />
          {authorized ? "IA autorizada a usar" : "IA não autorizada a usar"}
        </span>
        <button
          className="btn btn-tertiary"
          disabled={busy}
          onClick={onToggle}
          type="button"
        >
          {authorized ? "Revogar autorização da IA" : "Autorizar uso pela IA"}
        </button>
      </div>
    );
  }

  if (variant === "tag") {
    return (
      <label className={authorized ? "customer-check is-tag is-on" : "customer-check is-tag"}>
        <input
          aria-label={`IA pode usar a tag ${subject ?? ""}`.trim()}
          checked={authorized}
          className="customer-check-input"
          disabled={busy}
          onChange={onToggle}
          type="checkbox"
        />
        <span aria-hidden="true" className="customer-check-box">
          <Icon name="check" />
        </span>
        <span>{authorized ? "IA pode usar" : "só você"}</span>
      </label>
    );
  }

  return (
    <label className={authorized ? "customer-check is-note is-on" : "customer-check is-note"}>
      <input
        aria-describedby={hintId}
        aria-labelledby={titleId}
        checked={authorized}
        className="customer-check-input"
        disabled={busy}
        onChange={onToggle}
        type="checkbox"
      />
      <span aria-hidden="true" className="customer-check-box">
        <Icon name="check" />
      </span>
      <span className="customer-check-copy">
        <span className="customer-check-title" id={titleId}>
          A IA pode usar esta informação
        </span>
        <span className="customer-check-hint" id={hintId}>
          Ela considera a observação ao atender, sem repeti-la para a cliente.
        </span>
      </span>
    </label>
  );
}
