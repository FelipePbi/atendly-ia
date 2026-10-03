import { Icon } from "@/shared/icons/Icon";

import { ImportsPage } from "./ImportsLayout";

const STEPS = [
  <>
    Seus dados são copiados <strong>uma única vez</strong>.
  </>,
  "O Minha Agenda não fica conectado. Alterações feitas lá depois não chegam aqui.",
  "A Atendly passa a ser sua agenda oficial.",
];

/**
 * Origem da importação (2.I1), antes das credenciais: o Minha Agenda é a
 * única opção e já vem escolhida. A explicação da migração vem aqui, nunca
 * junto do formulário.
 */
export function ImportOriginScreen({
  onCancel,
  onContinue,
}: {
  onCancel?: () => void;
  onContinue: () => void;
}) {
  return (
    <ImportsPage title="De onde vamos trazer seus dados?">
      <div className="imports-origin">
        <div className="imports-origin-body">
          <div className="imports-origin-card">
            <span aria-hidden="true" className="imports-origin-logo">
              MA
            </span>
            <div className="imports-origin-copy">
              <strong>Minha Agenda</strong>
              <span>Serviços, clientes, horários e agendamentos</span>
            </div>
            <span aria-hidden="true" className="imports-origin-check">
              <Icon name="check" />
            </span>
          </div>
          <p className="imports-origin-note">
            Por enquanto, a importação está disponível para o Minha Agenda.
          </p>
          <div className="imports-origin-facts">
            <h2>Isto é uma migração, não uma conexão</h2>
            <ol>
              {STEPS.map((step, index) => (
                <li key={index}>
                  <span aria-hidden="true" className="imports-origin-number">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="imports-origin-actions">
          {onCancel && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onCancel}
            >
              Cancelar
            </button>
          )}
          <button className="btn btn-primary" type="button" onClick={onContinue}>
            Continuar
          </button>
        </div>
      </div>
    </ImportsPage>
  );
}
