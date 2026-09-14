"use client";

import clsx from "clsx";
import { useRef, useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { StatePanel } from "@/shared/ui/States";

import { ConversationLoading } from "./ConversationLoading";
import { ConversationRow } from "./ConversationRow";
import { conversationState } from "./conversationState";
import {
  type InboxLens,
  inboxLimit,
  inboxTabs,
  lensLabels,
  useInboxConversations,
} from "./inboxLenses";

/**
 * A inbox: três abas do vault (Comercial / Não classificadas / Pessoal) mais a
 * entrada própria de ignorados, todas servidas pelo backend por `category` e
 * `ignored`, com a busca viajando por `search` junto da aba corrente.
 *
 * Este é o único ponto da árvore da lista que declara `useShellConfig`.
 */
export function ConversationInbox() {
  const [lens, setLens] = useState<InboxLens>("commercial");
  const [search, setSearch] = useState("");
  const { attention, conversations, error, loading, reload, searching } =
    useInboxConversations(lens, search);

  useShellConfig({
    active: "conversas",
    attention,
    loading,
    module: "conversations",
    title: "Conversas",
  });

  const waiting = conversations.filter(
    (item) => conversationState(item) === "waiting-you",
  ).length;
  const term = search.trim();
  const showRows = !loading && !error && conversations.length > 0;
  const emptyTab = !loading && !error && conversations.length === 0 && !term;
  const noResults =
    !loading && !error && conversations.length === 0 && Boolean(term);

  return (
    <div className="conversation-list-page">
      <header className="conversation-page-header">
        <div>
          <h1>Conversas</h1>
          <p>
            Encontre mensagens recentes e priorize quem precisa do seu
            atendimento.
          </p>
        </div>
        {!loading && lens === "commercial" && (
          <span className="conversation-page-summary">
            <Icon name={waiting > 0 ? "alert" : "info"} />
            {waiting > 0
              ? `${waiting} aguardando você nesta aba`
              : "Nenhuma pendência humana nesta aba"}
          </span>
        )}
      </header>

      <section className="conversation-toolbar" aria-label="Busca e abas">
        <div className="conversation-search">
          <label className="sr-only" htmlFor="conversation-search">
            Buscar por nome ou telefone
          </label>
          <Icon name="search" />
          <input
            className="input"
            id="conversation-search"
            type="search"
            placeholder="Buscar por nome ou telefone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <InboxTabs lens={lens} onSelect={setLens} />
        <div className="conversation-lens-extra">
          <button
            aria-pressed={lens === "ignored"}
            className={clsx(
              "chip conversation-lens",
              lens === "ignored" && "is-active",
            )}
            onClick={() => setLens("ignored")}
            type="button"
          >
            <Icon name="eye" />
            Ignorados
          </button>
        </div>
      </section>

      <p className="conversation-lens-note">{lensNotes[lens]}</p>

      <section
        aria-busy={loading || undefined}
        aria-label={`Conversas · ${lensLabels[lens]}`}
        className={clsx(
          "conversation-list-surface",
          (loading || error || conversations.length === 0) &&
            "conversation-list-state",
          emptyTab && "conversation-empty-surface",
        )}
        role="tabpanel"
      >
        {showRows && (
          <div className="conversation-list-meta">
            <strong>{lensLabels[lens]}</strong>
            <span>
              {conversations.length === inboxLimit
                ? `${inboxLimit} conversas mais recentes`
                : `${conversations.length} ${
                    conversations.length === 1 ? "conversa" : "conversas"
                  }`}
            </span>
          </div>
        )}

        {loading && searching && (
          <p className="conversation-searching" role="status">
            Buscando conversas em {lensLabels[lens]}…
          </p>
        )}
        {loading && !searching && <ConversationLoading />}

        {!loading && error && (
          <StatePanel
            actionLabel="Tentar novamente"
            description={error}
            icon="alert"
            onAction={reload}
            title="Não foi possível carregar as conversas"
            tone="error"
          />
        )}

        {noResults && (
          <p className="conversation-no-results" role="status">
            Nenhuma conversa em {lensLabels[lens]} corresponde a {`“${term}”`}.
          </p>
        )}

        {emptyTab && (
          <StatePanel
            actionLabel="Atualizar lista"
            description={emptyStates[lens].description}
            icon="chat"
            onAction={reload}
            title={emptyStates[lens].title}
          />
        )}

        {showRows &&
          conversations.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              key={conversation.id}
            />
          ))}
      </section>
    </div>
  );
}

/**
 * As três abas do vault. Roving tabindex: a aba corrente recebe o foco pelo
 * Tab e as setas andam entre elas — teclado sem depender de cor para saber
 * onde se está.
 */
function InboxTabs({
  lens,
  onSelect,
}: {
  lens: InboxLens;
  onSelect: (lens: InboxLens) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = inboxTabs.findIndex((tab) => tab.id === lens);
  const focusable = current === -1 ? 0 : current;

  return (
    <div
      aria-label="Categorias de conversa"
      className="conversation-tabs"
      role="tablist"
    >
      {inboxTabs.map((tab, index) => (
        <button
          aria-selected={lens === tab.id}
          className={clsx(
            "chip conversation-tab",
            lens === tab.id && "is-active",
          )}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0;
            if (!step) return;
            event.preventDefault();
            const next = (index + step + inboxTabs.length) % inboxTabs.length;
            onSelect(inboxTabs[next].id);
            refs.current[next]?.focus();
          }}
          ref={(node) => {
            refs.current[index] = node;
          }}
          role="tab"
          tabIndex={index === focusable ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const lensNotes: Record<InboxLens, string> = {
  commercial:
    "Atendimento do negócio. Quem está aguardando você aparece primeiro.",
  ignored:
    "A IA não usa estas conversas: o conteúdo não vira contexto e o histórico anterior deixa de ser contexto. As mensagens continuam aqui.",
  personal:
    "A IA está desativada nestas sessões. Nenhuma resposta automática é enviada.",
  unclassified:
    "A plataforma ainda não separou estas conversas entre comercial e pessoal.",
};

const emptyStates: Record<InboxLens, { description: string; title: string }> = {
  commercial: {
    description:
      "As mensagens de atendimento recebidas pelo WhatsApp aparecerão aqui. Compartilhe seu número ou aguarde o próximo contato.",
    title: "Nenhuma conversa comercial por enquanto",
  },
  ignored: {
    description:
      "Contatos marcados para a IA não usar aparecem aqui, com as mensagens preservadas.",
    title: "Nenhum contato ignorado",
  },
  personal: {
    description:
      "Conversas reconhecidas como pessoais aparecerão aqui, sempre sem resposta automática.",
    title: "Nenhuma conversa pessoal por enquanto",
  },
  unclassified: {
    description:
      "Conversas que a plataforma ainda não separou entre comercial e pessoal aparecerão aqui.",
    title: "Nenhuma conversa sem classificação",
  },
};
