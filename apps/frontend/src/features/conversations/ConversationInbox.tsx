"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import { ListDetailEmpty } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { formatBrazilianPhone } from "@/shared/phone";
import { useProductRuntime } from "@/shared/runtime/ProductRuntime";
import { useSystemStatus } from "@/shared/runtime/systemStatus";
import { StatePanel } from "@/shared/ui/States";

import { ConversationLoading } from "./ConversationLoading";
import { ConversationRow } from "./ConversationRow";
import { DEFAULT_BUSINESS_TIMEZONE } from "./format";
import {
  groupInbox,
  type InboxLens,
  inboxTabs,
  lensLabels,
  useCommercialAttention,
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
    <div className="conversation-list-page is-inbox">
      <header className="conversation-page-header">
        <h1>Conversas</h1>
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
 * `ignored`, com a busca viajando por `search` junto da aba corrente. A busca
 * abre pelo botão de lupa do cabeçalho e a lente de ignorados só existe nela.
 *
 * De 1024 px em diante a lista ocupa uma coluna e o painel "Selecione uma
 * conversa" fica ao lado (D-103, D-126). O invólucro e a coluna da lista são os
 * mesmos nós nas duas faixas, e aba, termo e busca aberta moram acima da troca:
 * cruzar a largura só liga ou desliga o painel. O vazio conectado (C4) e o C5 não
 * têm painel.
 *
 * Declara `useShellConfig` uma vez; é o único ramo de `ConversationInbox` com abas.
 */
function InboxWithTabs() {
  const wide = useWideLayout();
  const { whatsapp, whatsappView } = useSystemStatus();
  const [lens, setLens] = useState<InboxLens>("commercial");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { session } = useProductRuntime();
  const timezone =
    session?.businessProfile?.timezone ?? DEFAULT_BUSINESS_TIMEZONE;
  const { attention, conversations, error, loading, reload, searching } =
    useInboxConversations(lens, search);
  const term = search.trim();
  const commercialAttention = useCommercialAttention(
    lens === "commercial" && !term ? conversations : null,
    !loading && !error,
  );
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchToggle = useRef<HTMLButtonElement | null>(null);
  const searchPanelId = useId();

  useShellConfig({
    active: "conversas",
    attention,
    loading,
    module: "conversations",
    title: "Conversas",
  });

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    setSearch("");
    setSearchOpen(false);
    if (lens === "ignored") setLens("commercial");
    searchToggle.current?.focus();
  };

  const groups = groupInbox(lens, conversations, timezone);
  const showRows = !loading && !error && conversations.length > 0;
  const emptyTab = !loading && !error && conversations.length === 0 && !term;
  const noResults =
    !loading && !error && conversations.length === 0 && Boolean(term);
  const note = lensNotes[lens];
  const connectedEmpty =
    emptyTab && lens === "commercial" && whatsappView === "active";
  const split = wide && !connectedEmpty;
  const connectedPhone = whatsapp?.phoneNumber
    ? formatBrazilianPhone(whatsapp.phoneNumber, "plus")
    : null;

  const inbox = (
    <div
      className={clsx(
        "conversation-list-page is-inbox",
        connectedEmpty && "is-connected-empty",
      )}
    >
      <header className="conversation-page-header">
        <h1>Conversas</h1>
        <button
          aria-controls={searchOpen ? searchPanelId : undefined}
          aria-expanded={searchOpen}
          aria-label="Buscar conversas"
          className="conversation-search-toggle"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          ref={searchToggle}
          type="button"
        >
          <span className="conversation-search-toggle-disc">
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
              width="20"
            >
              {searchOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M20 20l-4.2-4.2" />
                </>
              )}
            </svg>
          </span>
        </button>
      </header>

      {searchOpen && (
        <div className="conversation-search-panel" id={searchPanelId}>
          <div className="conversation-search">
            <label className="sr-only" htmlFor="conversation-search">
              Buscar por nome ou telefone
            </label>
            <Icon name="search" />
            <input
              className="input"
              id="conversation-search"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
              placeholder="Buscar por nome ou telefone"
              ref={searchInput}
              type="search"
              value={search}
            />
          </div>
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
      )}

      <InboxTabs
        attention={commercialAttention}
        lens={lens}
        onSelect={setLens}
      />

      {note && <div className="conversation-lens-note">{note}</div>}

      <section
        aria-busy={loading || undefined}
        aria-label={`Conversas · ${lensLabels[lens]}`}
        className={clsx(
          "conversation-list-surface",
          (loading || error || conversations.length === 0) &&
            !connectedEmpty &&
            "conversation-list-state",
          emptyTab && !connectedEmpty && "conversation-empty-surface",
        )}
        role="tabpanel"
      >
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

        {connectedEmpty && <ConnectedEmpty phone={connectedPhone} />}

        {emptyTab && !connectedEmpty && (
          <StatePanel
            actionLabel="Atualizar lista"
            description={emptyStates[lens].description}
            icon="chat"
            onAction={reload}
            title={emptyStates[lens].title}
          />
        )}

        {showRows &&
          groups.map((group, index) => (
            <div
              className={clsx(
                "conversation-group",
                `is-${group.key}`,
                group.key === "earlier" &&
                  group.labelHidden &&
                  index > 0 &&
                  "is-continued",
              )}
              key={group.key}
            >
              {group.label && (
                <h2
                  className={clsx(
                    "conversation-group-label",
                    group.labelHidden && "sr-only",
                  )}
                >
                  {group.label}
                </h2>
              )}
              {group.conversations.map((conversation) => (
                <ConversationRow
                  conversation={conversation}
                  key={conversation.id}
                  timezone={timezone}
                />
              ))}
            </div>
          ))}
      </section>
    </div>
  );

  return (
    <div
      className={
        split ? "list-detail conversation-list-detail" : "list-detail-flat"
      }
    >
      <div
        aria-label={split ? "Conversas" : undefined}
        className="list-detail-list conversation-list-column"
        role={split ? "complementary" : undefined}
      >
        {inbox}
      </div>
      {split && (
        <div className="list-detail-panel conversation-detail-panel">
          <ListDetailEmpty>Selecione uma conversa</ListDetailEmpty>
        </div>
      )}
    </div>
  );
}

/** C4: o vazio desenhado com os elementos do chat e a pílula de conexão. */
function ConnectedEmpty({ phone }: { phone: string | null }) {
  return (
    <div className="conversation-connected-empty">
      <div aria-hidden="true" className="conversation-connected-art">
        <span className="conversation-connected-bubble is-left" />
        <span className="conversation-connected-bubble is-right">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="conversation-connected-copy">
        <h2>
          Quando alguém falar com você pelo WhatsApp, a conversa aparecerá aqui.
        </h2>
        <p>
          A IA responde clientes automaticamente e avisa quando precisar de
          você.
        </p>
      </div>
      <span className="conversation-connected-pill">
        <span aria-hidden="true" className="conversation-connected-dot" />
        {phone ? `Conectado · ${phone}` : "Conectado"}
      </span>
    </div>
  );
}

/**
 * As três abas do vault, sublinhadas como no quadro. Roving tabindex: a aba
 * corrente recebe o foco pelo Tab e as setas andam entre elas — teclado sem
 * depender de cor para saber onde se está. O contador âmbar de Comercial conta
 * só quem exige atenção e some em zero; o texto acessível dele é a descrição
 * da aba, para o nome dela continuar sendo só "Comercial".
 */
function InboxTabs({
  attention,
  lens,
  onSelect,
}: {
  attention: number | null;
  lens: InboxLens;
  onSelect: (lens: InboxLens) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const countNoteId = useId();
  const current = inboxTabs.findIndex((tab) => tab.id === lens);
  const focusable = current === -1 ? 0 : current;

  return (
    <div
      aria-label="Categorias de conversa"
      className="conversation-tabs"
      role="tablist"
    >
      {inboxTabs.map((tab, index) => {
        const counted = tab.id === "commercial" && Boolean(attention);
        return (
          <button
            aria-describedby={counted ? countNoteId : undefined}
            aria-selected={lens === tab.id}
            className={clsx("conversation-tab", lens === tab.id && "is-active")}
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
            {counted && (
              <>
                <span aria-hidden="true" className="conversation-tab-count">
                  {attention}
                </span>
                <span hidden id={countNoteId}>
                  {attention} aguardando você
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

const lensNotes: Record<InboxLens, ReactNode> = {
  commercial: null,
  ignored:
    "A IA não usa estas conversas: o conteúdo não vira contexto e o histórico anterior deixa de ser contexto. As mensagens continuam aqui.",
  personal: (
    <>
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M9 6v12M15 6v12" />
      </svg>
      <span>
        <strong>IA desativada.</strong> Ela não responde nem usa estas
        conversas. Elas ficam fora dos seus números.
      </span>
    </>
  ),
  unclassified:
    "Ainda não dá para saber se são clientes ou pessoais. A IA só responde quando a intenção fica clara — ou você move a conversa.",
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
