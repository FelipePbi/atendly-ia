import { Button } from "@/shared/ui/Button";

export function CustomerEmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="customer-state is-empty">
      <div aria-hidden="true" className="customer-state-contacts">
        <span className="customer-state-contact is-plain" />
        <span className="customer-state-contact is-shaded" />
        <span className="customer-state-contact is-add">
          <svg
            fill="none"
            height="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="20"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </div>
      <div className="customer-state-copy">
        <h2>Nenhum cliente ainda</h2>
        <p>
          Seus clientes aparecerão aqui quando você criar um agendamento ou
          cadastrá-los manualmente. Quem marcar pelo WhatsApp é cadastrado pela
          IA na hora da confirmação.
        </p>
      </div>
      {canCreate && (
        <Button className="customer-state-action" href="/clientes/novo">
          Adicionar cliente
        </Button>
      )}
    </div>
  );
}

export function CustomerErrorState({
  onRetry,
  reference,
}: {
  onRetry: () => void;
  reference: string | null;
}) {
  return (
    <div className="customer-state is-error" role="alert">
      <div aria-hidden="true" className="customer-state-alert">
        <svg
          fill="none"
          height="28"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
          width="28"
        >
          <path d="M12 4 21 20H3z" />
          <path d="M12 10v4M12 17v.5" />
        </svg>
      </div>
      <div className="customer-state-copy">
        <h2>Não foi possível carregar seus clientes</h2>
        <p>
          Verifique sua conexão e tente novamente. Seus dados continuam
          guardados.
        </p>
        {reference && (
          <p className="customer-state-reference">Referência: {reference}</p>
        )}
      </div>
      <Button className="customer-state-action" onClick={onRetry} type="button">
        Tentar novamente
      </Button>
    </div>
  );
}
