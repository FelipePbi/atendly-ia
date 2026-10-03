"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRef, useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useSystemStatus } from "@/shared/runtime/systemStatus";
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
  useNoWhatsappProbe,
} from "./inboxLenses";

/**
 * Porta de entrada de /conversas (Goal096 §a). Sem número e sem nenhuma
 * conversa a tela é o quadro C5; com o WhatsApp conectado, desconhecido, ou com
 * histórico, é a inbox com abas. Enquanto o status ou a consulta carregam, nem
 * C5 nem abas. Cada ramo declara `useShellConfig` uma vez, e só um monta.
 */
export function ConversationInbox() {
  const { whatsappView } = useSystemStatus();
  const probe = useNoWhatsappProbe(whatsappView);

  if (whatsappView === "loading" || probe === "loading")
    return <InboxPending />;
  if (probe === "empty") return <NoWhatsappState />;
  return <InboxWithTabs />;
}

function InboxPending() {
  useShellConfig({
    active: "conversas",
    loading: true,
    module: "conversations",
    title: "Conversas",
  });

  return (
    <div className="conversation-list-page">
      <header className="conversation-page-header">
        <div>
          <h1>Conversas</h1>
        </div>
      </header>
      <section
        aria-busy="true"
        aria-label="Conversas"
        className="conversation-list-surface conversation-list-state"
      >
        <ConversationLoading />
      </section>
    </div>
  );
}

function NoWhatsappState() {
  useShellConfig({
    active: "conversas",
    attention: false,
    module: "conversations",
    title: "Conversas",
    whatsappInBand: true,
  });

  return (
    <div className="conversation-list-page conversation-no-whatsapp">
      <header className="conversation-no-whatsapp-header">
        <h1>Conversas</h1>
      </header>
      <section className="conversation-no-whatsapp-body">
        <div aria-hidden="true" className="conversation-no-whatsapp-art">
          <span className="conversation-no-whatsapp-bubble is-left" />
          <span className="conversation-no-whatsapp-bubble is-right" />
          <span className="conversation-no-whatsapp-phone">
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
            </svg>
          </span>
        </div>
        <div className="conversation-no-whatsapp-copy">
          <h2>Conecte seu WhatsApp para ver suas conversas aqui.</h2>
          <p>
            Elas ficam organizadas em Comercial, Não classificadas e Pessoal — e
            a IA passa a atender seus clientes. Você continua usando o WhatsApp
            normalmente.
          </p>
        </div>
        <Link
          className="conversation-no-whatsapp-action"
          href="/configuracoes/whatsapp"
        >
          Conectar WhatsApp
        </Link>
      </section>
    </div>
  );
}

/**
 * A inbox: três abas do vault (Comercial / Não classificadas / Pessoal) mais a
 * entrada própria de ignorados, todas servidas pelo backend por `category` e
 * `ignored`, com a busca viajando por `search` junto da aba corrente.
 *
 * Declara `useShellConfig` uma vez; é o único ramo de `ConversationInbox` com abas.
 */
function InboxWithTabs() {
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
