"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/shared/layout/AppShell";
import { Dialog } from "@/shared/ui/Dialog";
import { Icon } from "@/shared/icons/Icon";
import { mockConversations } from "@/mocks/data/conversations";
import type { ConversationState, ConversationsScenario } from "./types";

const stateLabel: Record<ConversationState, string> = {
  ai: "IA atendendo",
  human: "Atendimento humano",
  paused: "IA pausada",
  waiting: "Aguardando você",
  resolved: "Resolvida",
  error: "Falha na agenda",
};
const stateClass: Record<ConversationState, string> = {
  ai: "badge-ai",
  human: "badge-attention",
  paused: "",
  waiting: "badge-attention",
  resolved: "badge-success",
  error: "badge-danger",
};

function ConversationRows({
  compact = false,
  selected,
  query = "",
  filter = "all",
}: {
  compact?: boolean;
  selected?: ConversationState;
  query?: string;
  filter?: string;
}) {
  const rows = mockConversations.filter((item) => {
    if (compact && item.state === "resolved") return false;
    const matchesText = `${item.name} ${item.preview}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR"));
    return (
      matchesText &&
      (filter === "all" ||
        (filter === "unread" && item.unread > 0) ||
        item.state === filter)
    );
  });
  return (
    <>
      {rows.map((item) => (
        <Link
          className={clsx(
            "conversation-row",
            item.state === "waiting" && "is-attention",
            item.state === selected && "is-selected",
          )}
          href={`/conversas/${item.state === "ai" ? "ai-active" : item.state}`}
          key={item.id}
        >
          <span className="conversation-row-avatar">
            <span className="avatar">{item.initials}</span>
            {item.unread > 0 && (
              <span
                className="unread-count"
                aria-label={`${item.unread} mensagens não lidas`}
              >
                {item.unread}
              </span>
            )}
          </span>
          <span className="conversation-row-main">
            <span className="conversation-row-title">
              <strong>{item.name}</strong>
            </span>
            <span className="conversation-row-preview">{item.preview}</span>
            <span className="conversation-row-signals">
              <span className={`badge ${stateClass[item.state]}`}>
                {!compact && (
                  <Icon
                    name={
                      item.state === "ai"
                        ? "spark"
                        : item.state === "waiting"
                          ? "alert"
                          : item.state === "resolved"
                            ? "check"
                            : "info"
                    }
                  />
                )}
                {stateLabel[item.state]}
              </span>
              {!compact && item.state === "ai" && (
                <span className="badge">
                  <Icon name="calendar" />
                  Agendamento em andamento
                </span>
              )}
              {!compact && item.state === "paused" && (
                <span className="badge">
                  <Icon name="calendar" />
                  Agendamento relacionado
                </span>
              )}
            </span>
          </span>
          <time className="conversation-row-time">{item.time}</time>
        </Link>
      ))}
    </>
  );
}

function ConversationList({
  scenario,
}: {
  scenario: "list" | "empty" | "loading" | "error";
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [updated, setUpdated] = useState(true);
  const filters = [
    ["all", "Todas", 4],
    ["unread", "Não lidas", 1],
    ["ai", "IA atendendo", 1],
    ["waiting", "Aguardando você", 1],
    ["paused", "Pausadas", 1],
    ["resolved", "Resolvidas", 1],
  ] as const;
  return (
    <AppShell active="conversas" module="conversations">
      <div className="conversation-list-page">
        <header className="conversation-page-header">
          <div>
            <h1>Conversas</h1>
            <p>
              {scenario === "loading"
                ? "Carregando mensagens e estados de atendimento."
                : scenario === "empty"
                  ? "Acompanhe as mensagens recebidas e priorize quem precisa do seu atendimento."
                  : "Encontre mensagens recentes e priorize quem precisa do seu atendimento."}
            </p>
          </div>
          {scenario === "list" && (
            <span className="conversation-page-summary">
              <Icon name="info" />
              Exemplo de interface
            </span>
          )}
        </header>
        {scenario === "list" && (
          <div className="conversation-toolbar">
            <label className="conversation-search">
              <span className="sr-only">Buscar conversa</span>
              <Icon name="search" />
              <input
                className="input"
                type="search"
                placeholder="Buscar por nome ou telefone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div
              className="conversation-filter-row"
              role="toolbar"
              aria-label="Filtros de conversa"
            >
              {filters.map(([value, label, count]) => (
                <button
                  className={clsx(
                    "chip conversation-filter",
                    filter === value && "is-active",
                  )}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  key={value}
                >
                  {label}
                  <span className="conversation-filter-count">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {scenario === "loading" && (
          <section
            className="conversation-toolbar"
            aria-label="Busca e filtros"
          >
            <div className="conversation-search">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                placeholder="Buscar por nome ou telefone"
                aria-label="Buscar por nome ou telefone"
                disabled
              />
            </div>
            <div className="conversation-filter-row" aria-hidden="true">
              <span className="skeleton" style={{ width: 88, height: 40 }} />
              <span className="skeleton" style={{ width: 104, height: 40 }} />
              <span className="skeleton" style={{ width: 120, height: 40 }} />
            </div>
          </section>
        )}
        {scenario === "empty" && (
          <section className="conversation-toolbar conversation-empty-toolbar">
            <div className="conversation-empty-search-group">
              <div className="conversation-search">
                <Icon name="search" />
                <input
                  className="input"
                  type="search"
                  placeholder="Buscar por nome ou telefone"
                  aria-label="Buscar por nome ou telefone"
                  disabled
                />
              </div>
              <p className="conversation-empty-search-help">
                A busca ficará disponível quando a primeira conversa chegar.
              </p>
            </div>
          </section>
        )}
        <section
          className={clsx(
            "conversation-list-surface",
            (scenario === "empty" || scenario === "error") &&
              "conversation-list-state",
            scenario === "empty" && "conversation-empty-surface",
          )}
          aria-busy={scenario === "loading" || undefined}
        >
          {(scenario === "list" || scenario === "loading") && (
            <div className="conversation-list-meta">
              <strong>Recentes</strong>
              <span>
                {scenario === "loading"
                  ? "Carregando…"
                  : "4 conversas no exemplo"}
              </span>
            </div>
          )}
          {scenario === "list" && (
            <ConversationRows query={query} filter={filter} />
          )}
          {scenario === "empty" && (
            <div className="empty-state conversation-empty-state">
              <span className="state-icon">
                <Icon name="chat" />
              </span>
              <div className="conversation-empty-status" role="status">
                <span className="status-dot" aria-hidden="true" />
                <span>WhatsApp conectado e aguardando mensagens</span>
              </div>
              <h2>Nenhuma conversa por enquanto</h2>
              <p>
                As mensagens recebidas pelo WhatsApp aparecerão aqui.
                Compartilhe seu número com os clientes ou aguarde o próximo
                contato.
              </p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setUpdated(false);
                  window.setTimeout(() => setUpdated(true), 450);
                }}
              >
                Atualizar lista
              </button>
              <p className="conversation-empty-update" role="status">
                {updated ? "A lista está atualizada." : "Atualizando lista…"}
              </p>
            </div>
          )}
          {scenario === "error" && (
            <div className="error-state" role="alert">
              <span className="state-icon">
                <Icon name="alert" />
              </span>
              <h2>Não foi possível carregar as conversas</h2>
              <p>
                As mensagens podem estar desatualizadas. Tente novamente antes
                de responder um cliente.
              </p>
              <Link className="btn btn-primary" href="/conversas">
                Tentar novamente
              </Link>
            </div>
          )}
          {scenario === "loading" && (
            <div className="conversation-loading-list">
              {[0, 1, 2, 3].map((item) => (
                <div className="conversation-loading-row" key={item}>
                  <span className="skeleton conversation-loading-avatar" />
                  <span className="conversation-loading-copy">
                    <span className="skeleton skeleton-line" />
                    <span className="skeleton skeleton-line" />
                  </span>
                  <span className="skeleton skeleton-line" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

const stateEvent: Record<
  ConversationState,
  {
    icon: "spark" | "user" | "info" | "alert" | "check";
    title: string;
    copy: string;
  }
> = {
  ai: {
    icon: "spark",
    title: "Atendimento automático ativo",
    copy: "A IA está conduzindo a conversa. Nenhum agendamento foi confirmado.",
  },
  human: {
    icon: "user",
    title: "Conversa assumida por você",
    copy: "A IA foi pausada enquanto o atendimento humano estiver ativo.",
  },
  paused: {
    icon: "info",
    title: "IA pausada nesta conversa",
    copy: "Nenhuma resposta automática será enviada até a retomada.",
  },
  waiting: {
    icon: "alert",
    title: "Cliente pediu atendimento humano",
    copy: "A IA foi pausada e esta conversa precisa da sua atenção.",
  },
  error: {
    icon: "alert",
    title: "Não foi possível consultar a agenda",
    copy: "Os horários podem estar desatualizados. Nenhum agendamento foi confirmado.",
  },
  resolved: {
    icon: "check",
    title: "Conversa marcada como resolvida",
    copy: "Nenhuma ação está pendente neste exemplo.",
  },
};

const threadState: Record<
  ConversationState,
  {
    action: string;
    className: string;
    composer: string;
    copy: string;
    label: string;
  }
> = {
  ai: {
    label: "IA atendendo",
    copy: "A IA responde em nome do negócio.",
    action: "Assumir conversa",
    className: "is-ai",
    composer: "Assuma a conversa para responder manualmente.",
  },
  human: {
    label: "Atendimento humano",
    copy: "Você está atendendo. A IA está pausada.",
    action: "Devolver para IA",
    className: "is-human",
    composer: "Você está respondendo · IA pausada",
  },
  paused: {
    label: "IA pausada",
    copy: "Nenhuma resposta automática será enviada.",
    action: "Devolver para IA",
    className: "is-paused",
    composer: "IA pausada para esta conversa.",
  },
  waiting: {
    label: "Aguardando você",
    copy: "O cliente pediu atendimento humano.",
    action: "Assumir conversa",
    className: "is-waiting",
    composer: "Assuma a conversa para responder ao cliente.",
  },
  error: {
    label: "Erro operacional",
    copy: "A IA não pôde concluir a solicitação.",
    action: "Assumir conversa",
    className: "is-error",
    composer: "Assuma a conversa para orientar o cliente.",
  },
  resolved: {
    label: "Conversa resolvida",
    copy: "Nenhuma ação está pendente.",
    action: "Resolvida",
    className: "is-resolved",
    composer: "Reabra a conversa antes de responder.",
  },
};

function ConversationDetail({
  initialState,
}: {
  initialState: ConversationState;
}) {
  const [state, setState] = useState(initialState);
  const [contextOpen, setContextOpen] = useState(false);
  const [returnAiOpen, setReturnAiOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sendError, setSendError] = useState(initialState === "error");
  const [draft, setDraft] = useState(
    initialState === "error" ? "Vou verificar e já retorno." : "",
  );
  const [messages, setMessages] = useState<string[]>([]);
  const event = stateEvent[state];
  const thread = threadState[state];
  const person =
    state === "ai" ? "Contato sem nome" : "Cliente de demonstração";
  const initials = state === "ai" ? "?" : "CD";
  const phone = state === "ai" ? "(**) *****-4321" : "(**) *****-1234";
  const canReply = state === "human";
  const context = (
    <>
      <div className="context-profile">
        <span className="avatar">{initials}</span>
        <div>
          <strong>{person}</strong>
          <span>{phone}</span>
        </div>
      </div>
      <section className="context-section">
        <div className="context-section-head">
          <h3>Cliente</h3>
          <span className="badge">Exemplo</span>
        </div>
        <p>Sem observações cadastradas.</p>
      </section>
      <section className="context-section">
        <div className="context-section-head">
          <h3>Agendamentos relacionados</h3>
        </div>
        <div className="context-appointment">
          <strong>Nenhum agendamento confirmado</strong>
          <span>
            Horário e serviço só aparecerão após registro na fonte oficial.
          </span>
        </div>
      </section>
      <section className="context-section context-actions">
        <Link className="btn btn-secondary" href="/agenda/novo">
          Criar agendamento
        </Link>
        <Link className="btn btn-tertiary" href="/clientes">
          Abrir cliente
        </Link>
        <button
          className="btn btn-tertiary"
          type="button"
          onClick={() => setState("resolved")}
        >
          Marcar como resolvida
        </button>
      </section>
    </>
  );
  function send() {
    const value = draft.trim();
    if (!value) return;
    setMessages((current) => [...current, value]);
    setDraft("");
  }
  return (
    <AppShell
      active="conversas"
      module="conversations"
      mainClassName="conversation-detail-main"
      showBottomNav={false}
      showMobileHeader={false}
    >
      <div className="conversation-workspace">
        <aside className="conversation-rail" aria-label="Conversas recentes">
          <header className="conversation-rail-header">
            <h1>Conversas</h1>
            <span className="badge badge-attention">
              1 pendência no exemplo
            </span>
          </header>
          <div className="conversation-rail-search conversation-search">
            <Icon name="search" />
            <input
              className="input"
              type="search"
              placeholder="Buscar conversa"
            />
          </div>
          <div className="conversation-rail-list">
            <ConversationRows compact selected={state} />
          </div>
        </aside>
        <section
          className="conversation-thread"
          aria-labelledby="conversation-person-name"
        >
          <header className="conversation-thread-header">
            <div className="conversation-person">
              <Link
                className="icon-btn conversation-mobile-back"
                href="/conversas"
                aria-label="Voltar para conversas"
              >
                <Icon name="chevron-right" />
              </Link>
              <span className="avatar">{initials}</span>
              <span className="conversation-person-copy">
                <strong id="conversation-person-name">{person}</strong>
                <span>{phone} · WhatsApp</span>
              </span>
            </div>
            <div className="conversation-header-actions">
              <button
                className="btn btn-secondary desktop-context-action"
                type="button"
                onClick={() => setContextOpen(true)}
              >
                Abrir cliente
              </button>
              <button
                className="icon-btn conversation-mobile-context"
                type="button"
                onClick={() => setContextOpen(true)}
                aria-label="Abrir contexto do cliente"
              >
                <Icon name="user" />
              </button>
              <div className="dropdown">
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Mais ações"
                  aria-expanded={actionsOpen}
                  onClick={() => setActionsOpen((open) => !open)}
                >
                  <Icon name="more" />
                </button>
                {actionsOpen && (
                  <div className="menu">
                    <Link className="menu-item" href="/agenda/novo">
                      <Icon name="calendar" />
                      Criar agendamento
                    </Link>
                    <button
                      className="menu-item"
                      type="button"
                      onClick={() => {
                        setState("resolved");
                        setActionsOpen(false);
                      }}
                    >
                      <Icon name="check" />
                      Marcar como resolvida
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div
            className={`conversation-state-bar ${thread.className}`}
            role="status"
          >
            <span className="conversation-state-icon">
              <Icon name={event.icon} />
            </span>
            <span className="conversation-state-copy">
              <strong>{thread.label}</strong>
              <span>{thread.copy}</span>
            </span>
            <button
              className={clsx(
                "btn conversation-state-action",
                state === "human" || state === "paused" || state === "resolved"
                  ? "btn-secondary"
                  : "btn-primary",
              )}
              type="button"
              disabled={state === "resolved"}
              onClick={() => {
                if (state === "human" || state === "paused") {
                  setReturnAiOpen(true);
                } else {
                  setState("human");
                }
              }}
            >
              {thread.action}
            </button>
          </div>
          <div
            className="message-timeline"
            tabIndex={0}
            role="log"
            aria-label={`Histórico da conversa com ${person}`}
          >
            <div className="conversation-demo-note">
              Conversa de demonstração
            </div>
            <div className="message-date">
              <span>Hoje</span>
            </div>
            <div className="message-group">
              <span className="message-sender">{person}</span>
              <div className="message-bubble">
                Olá, gostaria de saber os horários disponíveis para esta semana.
              </div>
              <span className="message-meta">09:42</span>
            </div>
            <div className="message-group is-outgoing is-ai">
              <span className="message-sender">Studio Aurora · IA</span>
              <div className="message-bubble">
                Claro. Antes de consultar a agenda, qual serviço você procura?
              </div>
              <span className="message-meta">09:42 · resposta automática</span>
            </div>
            <div className="message-group">
              <span className="message-sender">{person}</span>
              <div className="message-bubble">
                {state === "waiting"
                  ? "Prefiro falar com uma pessoa, por favor."
                  : state === "error"
                    ? "Pode confirmar se esse horário está disponível?"
                    : "Quero entender quais opções tenho para esta semana."}
              </div>
              <span className="message-meta">09:44</span>
            </div>
            <div
              className={clsx(
                "message-system",
                state === "error" && "is-error",
              )}
              role={state === "error" ? "alert" : "status"}
            >
              <Icon name={event.icon} />
              <div>
                <strong>{event.title}</strong>
                <span>{event.copy}</span>
              </div>
            </div>
            {state === "human" && messages.length === 0 && (
              <div className="message-group is-outgoing">
                <span className="message-sender">Você</span>
                <div className="message-bubble">
                  Olá, vou continuar seu atendimento por aqui.
                </div>
                <span className="message-meta">09:45 · atendimento humano</span>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                className="message-group is-outgoing"
                key={`${message}-${index}`}
              >
                <span className="message-sender">Você</span>
                <div className="message-bubble">{message}</div>
                <span className="message-meta">Agora · atendimento humano</span>
              </div>
            ))}
          </div>
          <footer className="composer-zone">
            {state === "error" && sendError && (
              <div className="composer-error" role="alert">
                <span>
                  Uma mensagem não foi enviada. O texto foi preservado.
                </span>
                <button type="button" onClick={() => setSendError(false)}>
                  Tentar novamente
                </button>
              </div>
            )}
            <div className="composer-status">
              <Icon name="info" />
              <span id="composer-status-text">{thread.composer}</span>
            </div>
            <form
              className="composer-form"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <label className="sr-only" htmlFor="message-composer">
                Mensagem
              </label>
              <textarea
                className="composer-input"
                id="message-composer"
                rows={1}
                aria-describedby="composer-status-text"
                placeholder={canReply ? "Digite sua mensagem" : thread.composer}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!canReply}
              />
              <button
                className="btn btn-primary composer-send"
                type="submit"
                disabled={!canReply}
                aria-label="Enviar mensagem"
              >
                <Icon name="chevron-right" />
              </button>
            </form>
          </footer>
        </section>
        <aside className="conversation-context desktop-context">
          {context}
        </aside>
      </div>
      <Dialog
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        title="Contexto do cliente"
        variant="sheet"
      >
        <div className="context-sheet-profile">{context}</div>
      </Dialog>
      <Dialog
        open={returnAiOpen}
        onClose={() => setReturnAiOpen(false)}
        eyebrow="Retomar automação"
        title="Devolver conversa para a IA?"
      >
        <p className="small muted">
          A IA voltará a responder automaticamente em nome do Studio Aurora.
          Revise a conversa antes de continuar.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setReturnAiOpen(false)}
          >
            Manter atendimento humano
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setState("ai");
              setReturnAiOpen(false);
            }}
          >
            Devolver para IA
          </button>
        </div>
      </Dialog>
    </AppShell>
  );
}

export function ConversationsScreen({
  scenario = "list",
}: {
  scenario?: ConversationsScenario;
}) {
  return useMemo(
    () =>
      ["list", "empty", "loading", "error"].includes(scenario) ? (
        <ConversationList
          scenario={scenario as "list" | "empty" | "loading" | "error"}
        />
      ) : (
        <ConversationDetail
          initialState={
            (scenario === "detail-error"
              ? "error"
              : scenario) as ConversationState
          }
        />
      ),
    [scenario],
  );
}
