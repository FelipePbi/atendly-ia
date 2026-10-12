import { Icon } from "@/shared/icons/Icon";

import { ImportsPage } from "./ImportsLayout";

const STEPS = [
  <>
    Seus dados são copiados <strong>uma única vez</strong>.
  </>,
  "O Minha Agenda não fica conectado. Alterações feitas lá depois não chegam aqui.",
  "A Avenly passa a ser sua agenda oficial.",
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
              <MinhaAgendaLogo />
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
          <button
            className="btn btn-primary"
            type="button"
            onClick={onContinue}
          >
            Continuar
          </button>
        </div>
      </div>
    </ImportsPage>
  );
}

/**
 * Símbolo da Minha Agenda, redesenhado em SVG: livro aberto com lápis, em
 * traço branco sobre o roxo da marca. Só identifica a origem da importação.
 */
function MinhaAgendaLogo() {
  return (
    <svg fill="none" viewBox="0 0 44 44">
      <defs>
        <pattern
          height="5"
          id="minha-agenda-dots"
          patternUnits="userSpaceOnUse"
          width="5"
        >
          <circle cx="2.5" cy="2.5" fill="#fff" fillOpacity="0.14" r="0.7" />
        </pattern>
      </defs>
      <rect fill="#6b3fe6" height="44" width="44" />
      <rect fill="url(#minha-agenda-dots)" height="44" width="44" />
      <g
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      >
        <path d="M22 15.5C19 13.6 15.2 13 11.5 13.4V29.6C15.2 29.2 19 29.8 22 31.7C25 29.8 28.8 29.2 32.5 29.6V13.4C28.8 13 25 13.6 22 15.5Z" />
        <path d="M11.5 16.2H9.5V32.4C13.6 32 18.2 32.6 22 34.3C25.8 32.6 30.4 32 34.5 32.4V16.2H32.5" />
        <path d="M22 15.5V31.7" />
        <path d="M20.2 11.2H23.8V24.4L22 27.6L20.2 24.4Z" fill="#6b3fe6" />
        <path d="M20.2 13.8H23.8" />
      </g>
    </svg>
  );
}
