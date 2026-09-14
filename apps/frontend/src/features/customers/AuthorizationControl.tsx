import { Icon } from "@/shared/icons/Icon";

type AuthorizationControlProps = {
  authorized: boolean;
  busy: boolean;
  onToggle: () => void;
};

/**
 * Autorização de uso pela IA é sempre uma ação explícita e nunca nasce
 * marcada (Goal006/Goal012). O badge e o botão comunicam o efeito em texto,
 * não só por cor, porque alternar decide se a IA pode usar este conteúdo com
 * o cliente.
 */
export function AuthorizationControl({
  authorized,
  busy,
  onToggle,
}: AuthorizationControlProps) {
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
