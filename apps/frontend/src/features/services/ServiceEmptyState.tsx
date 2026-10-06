import { Button } from "@/shared/ui/Button";

export function ServiceEmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="service-state">
      <div aria-hidden="true" className="service-state-sketch">
        <div className="service-state-line">
          <span className="service-state-accent" data-color="SKY" />
          <span className="service-state-text">
            <span className="service-state-bar is-title" />
            <span className="service-state-bar is-meta" />
          </span>
        </div>
        <div className="service-state-line">
          <span className="service-state-accent" data-color="EMERALD" />
          <span className="service-state-text">
            <span className="service-state-bar is-title" />
            <span className="service-state-bar is-meta" />
          </span>
        </div>
        <div className="service-state-line is-next">
          <span className="service-state-accent is-dashed" />
          <span className="service-state-text is-centered">
            <span className="service-state-slot" />
          </span>
        </div>
      </div>
      <div className="service-state-copy">
        <h2>Nenhum serviço cadastrado</h2>
        <p>
          Nome, duração e preço bastam. É com isso que a IA responde perguntas e
          encontra horários para seus clientes.
        </p>
      </div>
      {canCreate && (
        <Button className="service-state-action" href="/servicos/novo">
          Criar primeiro serviço
        </Button>
      )}
    </div>
  );
}
