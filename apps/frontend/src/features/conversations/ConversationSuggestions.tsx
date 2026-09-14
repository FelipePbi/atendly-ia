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
 * Sugestão da IA acima do campo de resposta, só oferecida com atendimento
 * humano vigente (Goal012/Goal017 · WU-05). Usar uma sugestão preenche o
 * rascunho para a profissional editar — nunca envia nada sozinha.
 */
export function ConversationSuggestions({
  conversationId,
  onUse,
}: {
  conversationId: string;
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

  function use(text: string) {
    onUse(text);
    setState({ status: "idle" });
  }

  return (
    <div className="composer-suggestions">
      {state.status === "idle" && (
        <button
          className="btn btn-tertiary composer-suggestions-trigger"
          onClick={() => void load()}
          type="button"
        >
          <Icon name="spark" />
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
          <button
            onClick={() => setState({ status: "idle" })}
            type="button"
          >
            Fechar
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <div
          aria-label="Sugestões da IA"
          className="composer-suggestions-list"
          role="group"
        >
          {state.suggestions.length === 0 ? (
            <p className="composer-suggestions-status">
              Nenhuma sugestão desta vez.
            </p>
          ) : (
            state.suggestions.slice(0, 3).map((text, index) => (
              <button
                className="composer-suggestion-chip"
                key={index}
                onClick={() => use(text)}
                type="button"
              >
                {text}
              </button>
            ))
          )}
          <button
            className="btn btn-tertiary composer-suggestions-trigger"
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
