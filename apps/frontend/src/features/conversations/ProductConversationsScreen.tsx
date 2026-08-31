"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { BffHttpError, type Conversation, type Message } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { AppShell } from "@/shared/layout/AppShell";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";

type ConversationFilter =
  "ai" | "all" | "paused" | "resolved" | "unread" | "waiting";
type ConversationViewState = "ai" | "human" | "paused" | "resolved" | "waiting";

const refreshIntervalMs = 8_000;

export function ProductConversationsScreen({
  conversationId,
}: {
  conversationId?: string;
}) {
  return conversationId ? (
    <ConversationDetail conversationId={conversationId} />
  ) : (
    <ConversationList />
  );
}

function ConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async (background = false) => {
      try {
        const result = await getProductServices().conversations.list(
          { limit: 100 },
          controller.signal,
        );
        setConversations(result);
        setError(null);
      } catch (caught: unknown) {
        if (!controller.signal.aborted && !background) {
          setError(
            requestError(caught, "Não foi possível carregar as conversas."),
          );
        }
      } finally {
        if (!controller.signal.aborted && !background) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(true), refreshIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [reload]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return conversations.filter((conversation) => {
      const state = conversationViewState(conversation);
      const matchesFilter =
        filter === "all" ||
        (filter === "unread" && conversation.unreadCount > 0) ||
        (filter === "ai" && state === "ai") ||
        (filter === "waiting" && (state === "waiting" || state === "human")) ||
        (filter === "paused" && state === "paused") ||
        (filter === "resolved" && state === "resolved");
      const matchesQuery =
        !normalizedQuery ||
        conversationLabel(conversation)
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery) ||
        conversation.externalContactId.includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [conversations, filter, query]);

  const counts = useMemo(
    () => ({
      all: conversations.length,
      unread: conversations.filter((item) => item.unreadCount > 0).length,
      ai: conversations.filter((item) => conversationViewState(item) === "ai")
        .length,
      waiting: conversations.filter((item) =>
        ["human", "waiting"].includes(conversationViewState(item)),
      ).length,
      paused: conversations.filter(
        (item) => conversationViewState(item) === "paused",
      ).length,
      resolved: conversations.filter(
        (item) => conversationViewState(item) === "resolved",
      ).length,
    }),
    [conversations],
  );

  return (
    <AppShell
      active="conversas"
      attention={counts.waiting > 0}
      loading={loading}
      module="conversations"
    >
      <div className="conversation-list-page">
        <header className="conversation-page-header">
          <div>
            <h1>Conversas</h1>
            <p>
              Encontre mensagens recentes e priorize quem precisa do seu
              atendimento.
            </p>
          </div>
          {!loading && (
            <span className="conversation-page-summary">
              <Icon name={counts.waiting > 0 ? "alert" : "info"} />
              {counts.waiting > 0
                ? `${counts.waiting} aguardando você`
                : "Nenhuma pendência humana"}
            </span>
          )}
        </header>

        <section className="conversation-toolbar" aria-label="Busca e filtros">
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div
            className="conversation-filter-row"
            aria-label="Filtrar conversas"
          >
            {(
              [
                ["all", "Todas"],
                ["unread", "Não lidas"],
                ["ai", "IA atendendo"],
                ["waiting", "Aguardando você"],
                ["paused", "Pausadas"],
                ["resolved", "Resolvidas"],
              ] as const
            ).map(([value, label]) => (
              <button
                className={clsx(
                  "chip conversation-filter",
                  filter === value && "is-active",
                )}
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
                <span className="conversation-filter-count">
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          className={clsx(
            "conversation-list-surface",
            (loading || error || conversations.length === 0) &&
              "conversation-list-state",
            !loading &&
              !error &&
              conversations.length === 0 &&
              "conversation-empty-surface",
          )}
          aria-busy={loading || undefined}
        >
          {!error && conversations.length > 0 && (
            <div className="conversation-list-meta">
              <strong>Recentes</strong>
              <span>
                {visible.length}{" "}
                {visible.length === 1 ? "conversa" : "conversas"}
              </span>
            </div>
          )}
          {loading && <ConversationListLoading />}
          {!loading && error && (
            <StatePanel
              actionLabel="Tentar novamente"
              description={error}
              icon="alert"
              onAction={() => {
                setLoading(true);
                setError(null);
                setReload((value) => value + 1);
              }}
              title="Não foi possível carregar as conversas"
              tone="error"
            />
          )}
          {!loading && !error && conversations.length === 0 && (
            <StatePanel
              actionLabel="Atualizar lista"
              description="As mensagens recebidas pelo WhatsApp aparecerão aqui. Compartilhe seu número ou aguarde o próximo contato."
              icon="chat"
              onAction={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
              title="Nenhuma conversa por enquanto"
            />
          )}
          {!loading &&
            !error &&
            conversations.length > 0 &&
            visible.length === 0 && (
              <p className="conversation-no-results">
                Nenhuma conversa corresponde à busca e ao filtro selecionado.
              </p>
            )}
          {!loading &&
            !error &&
            visible.map((conversation) => (
              <ConversationRow
                conversation={conversation}
                key={conversation.id}
              />
            ))}
        </section>
      </div>
    </AppShell>
  );
}

function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { session } = useProductRuntime();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      try {
        const [conversationResult, messagesResult, listResult] =
          await Promise.all([
            getProductServices().conversations.get(conversationId, signal),
            getProductServices().conversations.listMessages(
              conversationId,
              signal,
            ),
            getProductServices().conversations.list({ limit: 50 }, signal),
          ]);
        setConversation(conversationResult);
        setMessages(messagesResult);
        setConversations(listResult);
        if (!background) setError(null);
      } catch (caught: unknown) {
        if (!signal?.aborted && !background) {
          setError(
            requestError(caught, "Não foi possível carregar esta conversa."),
          );
        }
      } finally {
        if (!signal?.aborted && !background) setLoading(false);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initialTimer = window.setTimeout(
      () => void load(controller.signal),
      0,
    );
    const timer = window.setInterval(
      () => void load(controller.signal, true),
      refreshIntervalMs,
    );
    return () => {
      controller.abort();
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  async function mutate(action: "release" | "resolve" | "takeover") {
    if (!conversation || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await getProductServices().conversations[action](
        conversation.id,
      );
      setConversation(result);
      setConversations((current) =>
        current.map((item) => (item.id === result.id ? result : item)),
      );
      if (action === "release") setReleaseOpen(false);
      if (action === "resolve") setActionsOpen(false);
    } catch (caught: unknown) {
      setActionError(
        requestError(caught, "Não foi possível alterar o atendimento."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!conversation || !text || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const message = await getProductServices().conversations.sendMessage(
        conversation.id,
        text,
      );
      setMessages((current) => [...current, message]);
      setDraft("");
    } catch (caught: unknown) {
      setActionError(
        requestError(
          caught,
          "Não foi possível enviar. Sua mensagem foi preservada.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading || error || !conversation) {
    return (
      <AppShell active="conversas" loading={loading} module="conversations">
        <div className="conversation-list-page">
          <section className="conversation-list-surface conversation-list-state">
            {loading ? (
              <ConversationListLoading />
            ) : (
              <StatePanel
                actionHref="/conversas"
                actionLabel="Voltar para conversas"
                description={
                  error ?? "A conversa solicitada não está disponível."
                }
                icon="alert"
                title="Não foi possível abrir a conversa"
                tone="error"
              />
            )}
          </section>
        </div>
      </AppShell>
    );
  }

  const state = conversationViewState(conversation);
  const stateView = conversationStateView(state);
  const canReply = state === "human";
  const person = conversationLabel(conversation);
  const phone = formatPhone(conversation.externalContactId);
  const businessName =
    session?.businessProfile?.businessName ??
    session?.tenant.name ??
    "Seu negócio";
  const context = (
    <ConversationContext
      conversation={conversation}
      onResolve={() => void mutate("resolve")}
    />
  );

  return (
    <AppShell
      active="conversas"
      attention={state === "waiting" || state === "paused"}
      mainClassName="conversation-detail-main"
      module="conversations"
      showBottomNav={false}
      showMobileHeader={false}
    >
      <div className="conversation-workspace">
        <aside className="conversation-rail" aria-label="Conversas recentes">
          <header className="conversation-rail-header">
            <h1>Conversas</h1>
            <span className="badge badge-attention">
              {
                conversations.filter((item) => item.status === "HUMAN_HANDOFF")
                  .length
              }{" "}
              pendentes
            </span>
          </header>
          <div className="conversation-rail-search conversation-search">
            <Icon name="search" />
            <input
              aria-label="Buscar conversa"
              className="input"
              placeholder="Buscar conversa"
              readOnly
              type="search"
            />
          </div>
          <div className="conversation-rail-list">
            {conversations.map((item) => (
              <ConversationRow
                compact
                conversation={item}
                key={item.id}
                selected={item.id === conversation.id}
              />
            ))}
          </div>
        </aside>

        <section
          className="conversation-thread"
          aria-labelledby="conversation-person-name"
        >
          <header className="conversation-thread-header">
            <div className="conversation-person">
              <Link
                aria-label="Voltar para conversas"
                className="icon-btn conversation-mobile-back"
                href="/conversas"
              >
                <Icon name="chevron-right" />
              </Link>
              <span className="avatar">{initials(person)}</span>
              <span className="conversation-person-copy">
                <strong id="conversation-person-name">{person}</strong>
                <span>{phone} · WhatsApp</span>
              </span>
            </div>
            <div className="conversation-header-actions">
              <button
                className="btn btn-secondary desktop-context-action"
                onClick={() => setContextOpen(true)}
                type="button"
              >
                Abrir contexto
              </button>
              <button
                aria-label="Abrir contexto do cliente"
                className="icon-btn conversation-mobile-context"
                onClick={() => setContextOpen(true)}
                type="button"
              >
                <Icon name="user" />
              </button>
              <div className="dropdown">
                <button
                  aria-expanded={actionsOpen}
                  aria-label="Mais ações"
                  className="icon-btn"
                  onClick={() => setActionsOpen((open) => !open)}
                  type="button"
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
                      disabled={busy || state === "resolved"}
                      onClick={() => void mutate("resolve")}
                      type="button"
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
            className={clsx("conversation-state-bar", stateView.className)}
            role="status"
          >
            <span className="conversation-state-icon">
              <Icon name={stateView.icon} />
            </span>
            <span className="conversation-state-copy">
              <strong>{stateView.label}</strong>
              <span>{stateView.copy}</span>
            </span>
            <button
              className={clsx(
                "btn conversation-state-action",
                state === "human" ? "btn-secondary" : "btn-primary",
              )}
              disabled={busy || state === "resolved"}
              onClick={() => {
                if (state === "human") setReleaseOpen(true);
                else void mutate("takeover");
              }}
              type="button"
            >
              {busy ? "Atualizando…" : stateView.action}
            </button>
          </div>

          <div
            aria-label={`Histórico da conversa com ${person}`}
            className="message-timeline"
            role="log"
            tabIndex={0}
          >
            <div className="message-date">
              <span>Histórico</span>
            </div>
            {messages.length === 0 ? (
              <div className="message-system" role="status">
                <Icon name="info" />
                <div>
                  <strong>Nenhuma mensagem registrada</strong>
                  <span>Novas mensagens aparecerão aqui automaticamente.</span>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  businessName={businessName}
                  key={message.id}
                  message={message}
                  person={person}
                />
              ))
            )}
          </div>

          <footer className="composer-zone">
            {actionError && (
              <div className="composer-error" role="alert">
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} type="button">
                  Fechar
                </button>
              </div>
            )}
            <div className="composer-status">
              <Icon name="info" />
              <span id="composer-status-text">{stateView.composer}</span>
            </div>
            <form
              className="composer-form"
              onSubmit={(event) => void send(event)}
            >
              <label className="sr-only" htmlFor="message-composer">
                Mensagem
              </label>
              <textarea
                aria-describedby="composer-status-text"
                className="composer-input"
                disabled={!canReply || busy}
                id="message-composer"
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  canReply ? "Digite sua mensagem" : stateView.composer
                }
                rows={1}
                value={draft}
              />
              <button
                aria-label="Enviar mensagem"
                className="btn btn-primary composer-send"
                disabled={!canReply || busy || !draft.trim()}
                type="submit"
              >
                <Icon name="chevron-right" />
              </button>
            </form>
          </footer>
        </section>

        <aside
          className="conversation-context"
          aria-label="Contexto da conversa"
        >
          <h2>Contexto</h2>
          {context}
        </aside>
      </div>

      <Dialog
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        title="Contexto da conversa"
        variant="sheet"
      >
        <div className="context-sheet-profile">{context}</div>
      </Dialog>
      <Dialog
        eyebrow="Retomar automação"
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="Devolver conversa para a IA?"
      >
        <p className="small muted">
          A IA voltará a responder automaticamente em nome de {businessName}.
          Revise a conversa antes de continuar.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setReleaseOpen(false)}
            type="button"
          >
            Manter atendimento humano
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void mutate("release")}
            type="button"
          >
            {busy ? "Devolvendo…" : "Devolver para IA"}
          </button>
        </div>
      </Dialog>
    </AppShell>
  );
}

function ConversationRow({
  compact = false,
  conversation,
  selected = false,
}: {
  compact?: boolean;
  conversation: Conversation;
  selected?: boolean;
}) {
  const state = conversationViewState(conversation);
  const view = conversationStateView(state);
  const label = conversationLabel(conversation);
  return (
    <Link
      className={clsx(
        "conversation-row",
        (state === "waiting" || state === "paused") && "is-attention",
        selected && "is-selected",
      )}
      href={`/conversas/${encodeURIComponent(conversation.id)}`}
    >
      <span className="conversation-row-avatar">
        <span className="avatar">{initials(label)}</span>
        {conversation.unreadCount > 0 && (
          <span
            className="unread-count"
            aria-label={`${conversation.unreadCount} não lidas`}
          >
            {conversation.unreadCount}
          </span>
        )}
      </span>
      <span className="conversation-row-main">
        <span className="conversation-row-title">
          <strong>{label}</strong>
        </span>
        <span className="conversation-row-preview">
          {conversation.lastMessage?.body || "Sem mensagens"}
        </span>
        <span className="conversation-row-signals">
          <span
            className={clsx(
              "badge",
              state === "ai" && "badge-ai",
              (state === "waiting" || state === "paused") && "badge-attention",
              state === "resolved" && "badge-success",
            )}
          >
            <Icon name={view.icon} />
            {view.label}
          </span>
        </span>
      </span>
      <time className="conversation-row-time" dateTime={conversation.updatedAt}>
        {formatRelativeTime(conversation.updatedAt)}
      </time>
      {compact && <span className="sr-only">Abrir conversa</span>}
    </Link>
  );
}

function MessageBubble({
  businessName,
  message,
  person,
}: {
  businessName: string;
  message: Message;
  person: string;
}) {
  const outgoing = message.direction === "OUTBOUND";
  const ai = message.source === "AI";
  const sender = outgoing ? (ai ? `${businessName} · IA` : "Você") : person;
  return (
    <div
      className={clsx(
        "message-group",
        outgoing && "is-outgoing",
        ai && "is-ai",
      )}
    >
      <span className="message-sender">{sender}</span>
      <div className="message-bubble">{message.body}</div>
      <span className="message-meta">
        {formatMessageTime(message.createdAt)}
        {ai
          ? " · resposta automática"
          : message.source === "OWNER"
            ? " · atendimento humano"
            : ""}
      </span>
    </div>
  );
}

function ConversationContext({
  conversation,
  onResolve,
}: {
  conversation: Conversation;
  onResolve: () => void;
}) {
  const person = conversationLabel(conversation);
  return (
    <>
      <div className="context-profile">
        <span className="avatar">{initials(person)}</span>
        <div>
          <strong>{person}</strong>
          <span>{formatPhone(conversation.externalContactId)}</span>
        </div>
      </div>
      <section className="context-section">
        <div className="context-section-head">
          <h3>Cliente</h3>
        </div>
        <p>Abra clientes para consultar dados e histórico de agendamentos.</p>
      </section>
      <section className="context-section context-actions">
        <Link className="btn btn-secondary" href="/agenda/novo">
          Criar agendamento
        </Link>
        <Link className="btn btn-tertiary" href="/clientes">
          Abrir clientes
        </Link>
        <button
          className="btn btn-tertiary"
          disabled={conversation.status === "CLOSED"}
          onClick={onResolve}
          type="button"
        >
          Marcar como resolvida
        </button>
      </section>
    </>
  );
}

function ConversationListLoading() {
  return (
    <div
      className="conversation-loading-list"
      aria-label="Carregando conversas"
    >
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
  );
}

function conversationViewState(
  conversation: Conversation,
): ConversationViewState {
  if (conversation.status === "CLOSED") return "resolved";
  if (conversation.status !== "HUMAN_HANDOFF") return "ai";
  if (conversation.handoffReason === "OWNER_TAKEOVER") return "human";
  if (
    conversation.handoffReason?.includes("COMMAND") ||
    conversation.handoffReason?.includes("PAUSE") ||
    conversation.handoffReason?.includes("nao suportada")
  ) {
    return "paused";
  }
  return "waiting";
}

function conversationStateView(state: ConversationViewState): {
  action: string;
  className: string;
  composer: string;
  copy: string;
  icon: IconName;
  label: string;
} {
  const views = {
    ai: {
      action: "Assumir conversa",
      className: "is-ai",
      composer: "Assuma a conversa para responder manualmente.",
      copy: "A IA responde em nome do negócio.",
      icon: "spark",
      label: "IA atendendo",
    },
    human: {
      action: "Devolver para IA",
      className: "is-human",
      composer: "Você está respondendo · IA pausada",
      copy: "Você está atendendo. A IA está pausada.",
      icon: "user",
      label: "Atendimento humano",
    },
    paused: {
      action: "Assumir conversa",
      className: "is-paused",
      composer: "Assuma a conversa para responder ao cliente.",
      copy: "Nenhuma resposta automática será enviada.",
      icon: "info",
      label: "IA pausada",
    },
    resolved: {
      action: "Resolvida",
      className: "is-resolved",
      composer: "Esta conversa foi marcada como resolvida.",
      copy: "Nenhuma ação está pendente.",
      icon: "check",
      label: "Conversa resolvida",
    },
    waiting: {
      action: "Assumir conversa",
      className: "is-waiting",
      composer: "Assuma a conversa para responder ao cliente.",
      copy: "Esta conversa precisa da sua atenção.",
      icon: "alert",
      label: "Aguardando você",
    },
  } satisfies Record<
    ConversationViewState,
    {
      action: string;
      className: string;
      composer: string;
      copy: string;
      icon: IconName;
      label: string;
    }
  >;
  return views[state];
}

function conversationLabel(conversation: Conversation): string {
  return (
    conversation.customerName?.trim() ||
    formatPhone(conversation.externalContactId)
  );
}

function initials(value: string): string {
  const result = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return result || "?";
}

function formatPhone(value: string): string {
  const digits = value.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length === 13 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return digits || "Contato sem telefone";
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Agora";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} h`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function requestError(error: unknown, fallback: string): string {
  if (error instanceof BffHttpError)
    return `${error.message} (ID ${error.requestId})`;
  return fallback;
}
