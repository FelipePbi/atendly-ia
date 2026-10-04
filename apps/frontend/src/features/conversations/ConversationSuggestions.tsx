"use client";

import { useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { requestError, upstreamErrorCode } from "./format";

/**
 * As cinco recusas próprias da rota de sugestões (`error.details.upstreamCode`),
 * na mesma ordem em que a porta de entrada da IA as avalia. Nunca vira lista
 * vazia silenciosa nem erro genérico.
 */
const refusalCopy: Record<string, string> = {
  AI_DISABLED:
    "A IA está desligada para este negócio. Ative a IA para receber sugestões.",
  CONTACT_IGNORED:
    "Este contato está marcado para a IA não usar — sugestões não estão disponíveis.",
  HUMAN_HANDLING_REQUIRED: "Assuma a conversa para pedir sugestões da IA.",
  NO_TEXTUAL_MESSAGE:
    "Não há uma mensagem de texto recente do cliente para basear a sugestão.",
  SESSION_PERSONAL: "Conversas pessoais não recebem sugestão da IA.",
};

function suggestionErrorCopy(error: unknown): string {
  const code = upstreamErrorCode(error);
  if (code && code in refusalCopy) return refusalCopy[code];
  return requestError(error, "Não foi possível gerar sugestões agora.");
}

type SuggestionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: string[] };

/**
 * Sugestão da IA acima do campo de resposta, oferecida quando a conversa está
 * com a profissional ou à espera dela (Goal012/Goal017; quadros K2 e K3). O
 * cartão aberto é tracejado e rotulado, para nunca parecer algo já enviado:
 * "Usar" e "Editar" preenchem o rascunho — nada é enviado sozinho —, e
 * "Editar" ainda leva o foco ao campo.
 */
export function ConversationSuggestions({
  conversationId,
  onEdit,
  onUse,
}: {
  conversationId: string;
  onEdit: (text: string) => void;
  onUse: (text: string) => void;
}) {
  const [state, setState] = useState<SuggestionsState>({ status: "idle" });

  async function load() {
    setState({ status: "loading" });
    try {
      const result =
        await getProductServices().conversations.generateSuggestions(
          conversationId,
        );
      setState({ status: "ready", suggestions: result.suggestions });
    } catch (caught: unknown) {
      setState({ status: "error", message: suggestionErrorCopy(caught) });
    }
  }

  function use(text: string, edit: boolean) {
    if (edit) onEdit(text);
    else onUse(text);
    setState({ status: "idle" });
  }

  return (
    <div className="composer-suggestions">
      {state.status === "idle" && (
        <button
          className="composer-suggestions-trigger"
          onClick={() => void load()}
          type="button"
        >
          <span aria-hidden="true" className="composer-suggestion-dot" />
          Sugerir resposta
        </button>
      )}
      {state.status === "loading" && (
        <p className="composer-suggestions-status" role="status">
          Buscando sugestões…
        </p>
      )}
      {state.status === "error" && (
        <div className="composer-suggestions-status is-error" role="alert">
          <span>{state.message}</span>
          <button onClick={() => setState({ status: "idle" })} type="button">
            Fechar
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <div
          aria-label="Sugestões da IA"
          className="composer-suggestion-card"
          role="group"
        >
          <div className="composer-suggestion-head">
            <span className="composer-suggestion-label">
              <span aria-hidden="true" className="composer-suggestion-dot" />
              Sugestão da IA
            </span>
            <button
              aria-label="Fechar sugestões"
              className="composer-suggestion-close"
              onClick={() => setState({ status: "idle" })}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {state.suggestions.length === 0 ? (
            <p className="composer-suggestions-status">
              Nenhuma sugestão desta vez.
            </p>
          ) : (
            state.suggestions.slice(0, 3).map((text, index) => (
              <div className="composer-suggestion" key={index}>
                <p className="composer-suggestion-text">{text}</p>
                <div className="composer-suggestion-actions">
                  <button
                    aria-label={`Usar: ${text}`}
                    className="composer-suggestion-use"
                    onClick={() => use(text, false)}
                    type="button"
                  >
                    Usar
                  </button>
                  <button
                    aria-label={`Editar: ${text}`}
                    className="composer-suggestion-edit"
                    onClick={() => use(text, true)}
                    type="button"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))
          )}
          <button
            className="composer-suggestion-refresh"
            onClick={() => void load()}
            type="button"
          >
            <Icon name="refresh" />
            Buscar novas sugestões
          </button>
        </div>
      )}
    </div>
  );
}
