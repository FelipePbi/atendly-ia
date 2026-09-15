"use client";

import clsx from "clsx";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { Conversation, Message, SessionCategory } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";

import { ConversationContextPanel } from "./ConversationContextPanel";
import { ConversationLoading } from "./ConversationLoading";
import { ConversationRow } from "./ConversationRow";
import {
  conversationState,
  conversationStateView,
  handoffReasonCopy,
  needsAttention,
} from "./conversationState";
import { ConversationSuggestions } from "./ConversationSuggestions";
import {
  conversationLabel,
  formatPhone,
  initials,
  requestError,
} from "./format";
import { refreshIntervalMs } from "./inboxLenses";
import { MessageTimeline } from "./MessageTimeline";

/**
 * O chat de uma conversa. É o único ponto da árvore do detalhe que declara
 * `useShellConfig` — o número de call sites acompanha o número de cenários
 * vivos, não o de componentes.
 */
export function ConversationThread({
  conversationId,
}: {
  conversationId: string;
}) {
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
  const [sendConfirmation, setSendConfirmation] = useState<string | null>(
    null,
  );
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [ignoredBusy, setIgnoredBusy] = useState(false);
  const [ignoredError, setIgnoredError] = useState<string | null>(null);
  const [ignoreOpen, setIgnoreOpen] = useState(false);

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

  /**
   * `handling` reflete a sessão vigente, e o envio grava o controle humano
   * antes do transporte (ai-orchestrator internal/routes.ts:474-492): o
   * estado local acompanha isso na hora, sem esperar o próximo polling —
   * senão a barra de estado continuaria dizendo `Aguardando você` logo
   * depois do envio que acabou de assumir a conversa.
   */
  function markHumanHandling() {
    setConversation((current) =>
      current && current.handling !== "HUMAN"
        ? { ...current, handling: "HUMAN" }
        : current,
    );
    setConversations((current) =>
      current.map((item) =>
        item.id === conversationId && item.handling !== "HUMAN"
          ? { ...item, handling: "HUMAN" }
          : item,
      ),
    );
  }

  async function setCategory(category: SessionCategory | null) {
    if (!conversation || categoryBusy) return;
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      const result = await getProductServices().conversations.setCategory(
        conversation.id,
        category,
      );
      setConversation(result);
      setConversations((current) =>
        current.map((item) => (item.id === result.id ? result : item)),
      );
    } catch (caught: unknown) {
      setCategoryError(
        requestError(caught, "Não foi possível alterar a categoria."),
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  /**
   * Marcar e desmarcar ignorado, sempre pela mesma operação reversível
   * (`setIgnored`): a decisão é do contato, não da sessão, e a confirmação
   * acontece antes — nunca ao lado do efeito já aplicado.
   */
  async function toggleIgnored() {
    if (!conversation || ignoredBusy) return;
    setIgnoredBusy(true);
    setIgnoredError(null);
    try {
      const result = await getProductServices().conversations.setIgnored(
        conversation.id,
        !conversation.ignored,
      );
      setConversation(result);
      setConversations((current) =>
        current.map((item) => (item.id === result.id ? result : item)),
      );
      setIgnoreOpen(false);
    } catch (caught: unknown) {
      setIgnoredError(
        requestError(caught, "Não foi possível alterar o contato ignorado."),
      );
    } finally {
      setIgnoredBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!conversation || !text || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { message, status } =
        await getProductServices().conversations.sendMessage(
          conversation.id,
          text,
        );
      setMessages((current) => [...current, message]);
      setDraft("");
      announceSendResult(status);
      markHumanHandling();
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

  /**
   * Os dois sucessos do envio, ditos pelo que cada um significa no contrato
   * (`PUBLIC_API_V1.md`): `201` é a saída gravada e despachada ao transporte,
   * `202` é a tentativa gravada sem confirmação de envio. Nenhum dos dois
   * afirma entrega no WhatsApp — isso quem diz é `deliveryState`, na própria
   * mensagem.
   */
  function announceSendResult(status: number) {
    setSendConfirmation(
      status === 202
        ? "Tentativa registrada: a mensagem foi gravada, mas o envio ainda não foi confirmado. O estado da mensagem acompanha."
        : "Mensagem registrada e enviada ao WhatsApp. A entrega aparece no estado da mensagem.",
    );
  }

  async function resend(message: Message) {
    if (!conversation || resendingId) return;
    setResendingId(message.id);
    setActionError(null);
    try {
      const { message: sent, status } =
        await getProductServices().conversations.sendMessage(
          conversation.id,
          message.body,
        );
      setMessages((current) => [...current, sent]);
      announceSendResult(status);
      markHumanHandling();
    } catch (caught: unknown) {
      setActionError(requestError(caught, "Não foi possível reenviar."));
    } finally {
      setResendingId(null);
    }
  }

  const ready = !loading && !error && Boolean(conversation);
  const earlyState = conversation ? conversationState(conversation) : null;
  useShellConfig({
    active: "conversas",
    attention: earlyState ? needsAttention(earlyState) : false,
    loading,
    mainClassName: ready ? "conversation-detail-main" : undefined,
    module: "conversations",
    showBottomNav: !ready,
    showMobileHeader: !ready,
    title: conversation ? conversationLabel(conversation) : "Conversas",
  });

  if (loading || error || !conversation) {
    return (
      <div className="conversation-list-page">
        <section className="conversation-list-surface conversation-list-state">
          {loading ? (
            <ConversationLoading />
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
    );
  }

  const state = conversationState(conversation);
  const stateView = conversationStateView(state);
  const closed = conversation.status === "CLOSED";
  // Enviar assume: o takeover prévio deixou de ser pré-condição
  // (internal/routes.ts:474-492), então o campo aceita digitação em qualquer
  // estado aberto — só a conversa resolvida bloqueia. `willAssume` avisa
  // antes do envio quando ele vai mudar quem está atendendo.
  const canReply = !closed;
  const willAssume = !closed && state !== "you-handling";
  const person = conversationLabel(conversation);
  const phone = formatPhone(conversation.externalContactId);
  const reason = handoffReasonCopy(conversation.handoffReason);
  const businessName =
    session?.businessProfile?.businessName ??
    session?.tenant.name ??
    "Seu negócio";
  const waiting = conversations.filter(
    (item) => conversationState(item) === "waiting-you",
  ).length;
  const context = (
    <ConversationContextPanel
      categoryBusy={categoryBusy}
      categoryError={categoryError}
      conversation={conversation}
      ignoredBusy={ignoredBusy}
      ignoredError={ignoredError}
      onResolve={() => void mutate("resolve")}
      onSetCategory={(category) => void setCategory(category)}
      onToggleIgnored={() => {
        setIgnoredError(null);
        setIgnoreOpen(true);
      }}
    />
  );

  return (
    <>
      <div className="conversation-workspace">
        <aside className="conversation-rail" aria-label="Conversas recentes">
          <header className="conversation-rail-header">
            <h1>Conversas</h1>
            <span className="badge badge-attention">
              {waiting} aguardando você
            </span>
          </header>
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
                      disabled={busy || closed}
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
              {reason && (
                <span className="conversation-state-reason">{reason}</span>
              )}
              {closed && (
                <span className="conversation-state-reason">
                  Esta conversa foi marcada como resolvida.
                </span>
              )}
            </span>
            <button
              className={clsx(
                "btn conversation-state-action",
                state === "you-handling" ? "btn-secondary" : "btn-primary",
              )}
              disabled={busy || closed}
              onClick={() => {
                if (state === "you-handling") setReleaseOpen(true);
                else void mutate("takeover");
              }}
              type="button"
            >
              {busy ? "Atualizando…" : stateView.action}
            </button>
          </div>

          <MessageTimeline
            businessName={businessName}
            contentExpiredThrough={conversation.contentExpiredThrough ?? null}
            conversationId={conversation.id}
            messages={messages}
            onResend={(message) => void resend(message)}
            person={person}
            resendingId={resendingId}
          />

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
              <span id="composer-status-text">
                {closed
                  ? "Esta conversa foi marcada como resolvida."
                  : willAssume
                    ? "Enviar assume esta conversa: a IA é pausada e você passa a atender."
                    : stateView.composer}
              </span>
            </div>
            {sendConfirmation && (
              <p className="composer-confirmation" role="status">
                {sendConfirmation}
              </p>
            )}
            {!closed && state === "you-handling" && (
              <ConversationSuggestions
                conversationId={conversation.id}
                onUse={(text) => setDraft(text)}
              />
            )}
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
        eyebrow={conversation.ignored ? "Voltar a usar na IA" : "Ignorar na IA"}
        open={ignoreOpen}
        onClose={() => setIgnoreOpen(false)}
        title={
          conversation.ignored
            ? "Voltar a usar este contato na IA?"
            : "Ignorar este contato na IA?"
        }
      >
        <p className="small muted">
          {conversation.ignored
            ? `A IA volta a usar as conversas de ${person} como contexto e pode responder de novo por ${businessName}. As mensagens já trocadas continuam onde estão.`
            : `A IA deixa de usar as conversas de ${person}: o conteúdo não vira contexto e o histórico anterior deixa de ser contexto. Nada é apagado, o contato não é bloqueado e as mensagens continuam visíveis aqui.`}
        </p>
        {ignoredError && (
          <p className="composer-error" role="alert">
            {ignoredError}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={ignoredBusy}
            onClick={() => setIgnoreOpen(false)}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={ignoredBusy}
            onClick={() => void toggleIgnored()}
            type="button"
          >
            {ignoredBusy
              ? "Salvando…"
              : conversation.ignored
                ? "Voltar a usar na IA"
                : "Ignorar contato"}
          </button>
        </div>
      </Dialog>
      <Dialog
        eyebrow="Retomar automação"
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="Devolver conversa para a IA?"
      >
        <p className="small muted">
          A IA volta a responder em nome de {businessName} e reavalia o
          contexto atual da conversa, em vez de simplesmente continuar do
          ponto em que parou.
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
            {busy ? "Devolvendo…" : "Retomar IA"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
