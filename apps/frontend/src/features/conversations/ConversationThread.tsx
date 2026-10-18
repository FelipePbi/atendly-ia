"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Conversation,
  ConversationEvent,
  Message,
  SessionCategory,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { useSwipeBack } from "@/shared/motion/swipeBack";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { ContactPhoto, conversationPhotoUrl } from "@/shared/ui/ContactPhoto";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";

import {
  type CategoryWriteScope,
  ConversationActionsSheet,
} from "./ConversationActionsSheet";
import type { TreatmentPosition } from "./ConversationContextPanel";
import { ConversationCustomerSheet } from "./ConversationCustomerSheet";
import {
  ConversationListColumn,
  lensForConversation,
  useConversationList,
} from "./ConversationListColumn";
import { ConversationLoading } from "./ConversationLoading";
import {
  type ConversationState,
  conversationState,
  conversationStateView,
  isImageReason,
  needsAttention,
  waitingNoticeCopy,
} from "./conversationState";
import { ConversationSuggestions } from "./ConversationSuggestions";
import {
  type ThreadSnapshot,
  useConversationsWorkspace,
} from "./conversationsWorkspaceContext";
import {
  conversationLabel,
  formatWaitingTime,
  initials,
  requestError,
} from "./format";
import type { InboxLens } from "./inboxLenses";
import { refreshIntervalMs } from "./inboxLenses";
import { MessageTimeline } from "./MessageTimeline";
import { useMarkConversationRead } from "./useMarkConversationRead";

/** Leitura da casca mais nova que isso não é refeita quando o chat abre. */
const FRESH_SNAPSHOT_MS = 5_000;

/**
 * O chat de uma conversa, como nos quadros K1 a K4 (Goal114). É o único ponto
 * da árvore do detalhe que declara `useShellConfig` — o número de call sites
 * acompanha o número de cenários vivos, não o de componentes.
 *
 * De 1024 px em diante a coluna da lista de Conversas (a mesma de
 * `/conversas`) fica ao lado, aberta na aba da categoria da conversa e com a
 * linha aberta marcada. A técnica é a de D-126: o invólucro existe nas duas
 * faixas e o chat fica sempre na mesma posição da árvore, então cruzar 1024 px
 * não apaga o rascunho nem troca o campo. Abaixo disso o chat é tela
 * empurrada, sem barra de abas, e a lista nem é montada.
 *
 * Dentro da casca de `/conversas` (`ConversationsWorkspace`), a lista é da
 * casca e o chat desenha só o painel (`hosted`). A casca já entrega o que leu
 * da conversa (`initial`): o chat abre com ela, sem esqueleto, e só segue
 * atualizando por trás.
 */
export function ConversationThread({
  conversationId,
  initial,
}: {
  conversationId: string;
  initial?: ThreadSnapshot;
}) {
  const wide = useWideLayout();
  const workspace = useConversationsWorkspace();
  const hosted = Boolean(workspace?.hosted);
  const remember = workspace?.remember;
  const { session } = useProductRuntime();
  const [conversation, setConversation] = useState<Conversation | null>(
    initial?.conversation ?? null,
  );
  const [messages, setMessages] = useState<Message[]>(initial?.messages ?? []);
  const [events, setEvents] = useState<ConversationEvent[]>(
    initial?.events ?? [],
  );
  const [loading, setLoading] = useState(!initial);
  // Leitura que a casca acabou de fazer: a primeira busca do chat seria
  // repetida. Mais velha que isso, o chat confere por trás ao abrir.
  const snapshotAt = useRef(initial?.fetchedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [treatmentBusy, setTreatmentBusy] = useState(false);
  const [treatmentError, setTreatmentError] = useState<string | null>(null);
  const [ignoredBusy, setIgnoredBusy] = useState(false);
  const [ignoredError, setIgnoredError] = useState<string | null>(null);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreFromContext, setIgnoreFromContext] = useState(false);
  const [ignoreExit, setIgnoreExit] = useState<TreatmentPosition | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const markedRead = useCallback(
    (id: string, unreadCount: number) =>
      setConversation((current) =>
        current?.id === id ? { ...current, unreadCount } : current,
      ),
    [],
  );
  useMarkConversationRead(conversation, messages, markedRead);

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      // Eventos são complementares às mensagens (Goal070 §4): buscados no
      // mesmo ritmo, mas em promessa própria, para que falha na consulta
      // deles nunca esconda mensagens nem afirme erro na conversa.
      const eventsPromise = (async () => {
        try {
          return await getProductServices().conversations.listEvents(
            conversationId,
            signal,
          );
        } catch {
          return null;
        }
      })();
      try {
        const [conversationResult, messagesResult] = await Promise.all([
          getProductServices().conversations.get(conversationId, signal),
          getProductServices().conversations.listMessages(
            conversationId,
            signal,
          ),
        ]);
        setConversation(conversationResult);
        setMessages(messagesResult);
        if (!background) setError(null);
        remember?.({
          conversation: conversationResult,
          events: (await eventsPromise) ?? [],
          messages: messagesResult,
        });
      } catch (caught: unknown) {
        if (!signal?.aborted && !background) {
          setError(
            requestError(caught, "Não foi possível carregar esta conversa."),
          );
        }
      } finally {
        if (!signal?.aborted && !background) setLoading(false);
      }
      const eventsResult = await eventsPromise;
      if (eventsResult && !signal?.aborted) setEvents(eventsResult);
    },
    [conversationId, remember],
  );

  useEffect(() => {
    const controller = new AbortController();
    const openedAt = snapshotAt.current;
    const skipFirst =
      attempt === 0 &&
      openedAt !== null &&
      Date.now() - openedAt < FRESH_SNAPSHOT_MS;
    const initialTimer = skipFirst
      ? undefined
      : window.setTimeout(
          () =>
            void load(controller.signal, attempt === 0 && openedAt !== null),
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
  }, [load, attempt]);

  function retry() {
    setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  }

  async function mutate(action: "release" | "resolve" | "takeover") {
    if (!conversation || busy) return;
    setBusy(true);
    setActionError(null);
    setActionsOpen(false);
    try {
      const result = await getProductServices().conversations[action](
        conversation.id,
      );
      setConversation(result);
      if (action === "release") setReleaseOpen(false);
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
   * senão o cabeçalho continuaria dizendo `Aguardando você` logo depois do
   * envio que acabou de assumir a conversa.
   */
  function markHumanHandling() {
    setConversation((current) =>
      current && current.handling !== "HUMAN"
        ? { ...current, handling: "HUMAN" }
        : current,
    );
  }

  /**
   * "Como a IA trata este contato" (K5). Nada é gravado no toque quando há
   * diálogo: Nunca responde abre "Ignorar este contato na IA?" e sair de Nunca
   * responde abre "Voltar a usar este contato na IA?", e quem grava é
   * `toggleIgnored`, na confirmação. Só Automático e Sempre atende com o
   * contato não ignorado gravam direto a decisão do contato (`scope: CONTACT`).
   */
  async function chooseTreatment(position: TreatmentPosition) {
    if (!conversation || treatmentBusy) return;
    setTreatmentError(null);
    if (position === "NEVER") {
      openIgnore(true);
      return;
    }
    if (conversation.ignored) {
      openIgnore(true, position);
      return;
    }
    setTreatmentBusy(true);
    try {
      setConversation(
        await getProductServices().conversations.setCategory(
          conversation.id,
          position === "ALWAYS" ? "COMMERCIAL" : null,
          "CONTACT",
        ),
      );
    } catch (caught: unknown) {
      setTreatmentError(
        requestError(
          caught,
          "Não foi possível alterar como a IA trata o contato.",
        ),
      );
    } finally {
      setTreatmentBusy(false);
    }
  }

  /**
   * A gravação da folha "Mais ações": só acontece no botão que a pessoa toca,
   * com o escopo que ela escolheu, e a folha só fecha depois do sucesso — o
   * erro fica nela, não some junto com ela.
   */
  async function setCategoryFromSheet(
    category: SessionCategory,
    scope: CategoryWriteScope,
  ) {
    if (!conversation || sheetBusy) return;
    setSheetBusy(true);
    setSheetError(null);
    try {
      const result = await getProductServices().conversations.setCategory(
        conversation.id,
        category,
        scope,
      );
      setConversation(result);
      setActionsOpen(false);
    } catch (caught: unknown) {
      setSheetError(
        requestError(caught, "Não foi possível alterar a categoria."),
      );
    } finally {
      setSheetBusy(false);
    }
  }

  function toggleActions() {
    setSheetError(null);
    setActionsOpen((open) => !open);
  }

  /**
   * Marcar e desmarcar ignorado, sempre pela mesma operação reversível
   * (`setIgnored`): a decisão é do contato, não da sessão, e a confirmação
   * acontece antes — nunca ao lado do efeito já aplicado. Ao sair de Nunca
   * responde pelo controle, a categoria escolhida grava primeiro e `ignored:
   * false` depois: se a categoria falha, nada mais é gravado; se `ignored:
   * false` falha, o contato continua ignorado.
   */
  async function toggleIgnored() {
    if (!conversation || ignoredBusy) return;
    const nextIgnored = !conversation.ignored;
    setIgnoredBusy(true);
    setIgnoredError(null);
    try {
      const conversations = getProductServices().conversations;
      if (ignoreExit) {
        setConversation(
          await conversations.setCategory(
            conversation.id,
            ignoreExit === "ALWAYS" ? "COMMERCIAL" : null,
            "CONTACT",
          ),
        );
      }
      const result = await conversations.setIgnored(
        conversation.id,
        nextIgnored,
      );
      setConversation(result);
      closeIgnore();
    } catch (caught: unknown) {
      const message = requestError(
        caught,
        ignoreExit
          ? "Não foi possível alterar como a IA trata o contato."
          : "Não foi possível alterar o contato ignorado.",
      );
      if (ignoreFromContext) {
        setTreatmentError(message);
        closeIgnore();
      } else {
        setIgnoredError(message);
      }
    } finally {
      setIgnoredBusy(false);
    }
  }

  /** A folha do cliente fecha enquanto o diálogo pergunta e volta depois. */
  function openIgnore(
    fromContext = false,
    exitTo: TreatmentPosition | null = null,
  ) {
    setActionsOpen(false);
    setContextOpen(false);
    setIgnoredError(null);
    setIgnoreFromContext(fromContext);
    setIgnoreExit(exitTo);
    setIgnoreOpen(true);
  }

  function closeIgnore() {
    setIgnoreOpen(false);
    setIgnoreExit(null);
    if (ignoreFromContext) {
      setIgnoreFromContext(false);
      setContextOpen(true);
    }
  }

  function openContext() {
    setTreatmentError(null);
    setContextOpen(true);
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
    // Na casca dividida, a moldura é a mesma desde a caixa de entrada.
    mainClassName: ready || hosted ? "conversation-detail-main" : undefined,
    module: "conversations",
    pushed: ready,
    title: conversation ? conversationLabel(conversation) : "Conversas",
  });
  // O chat em tela cheia volta para a lista arrastando da borda (D-198),
  // como o voltar do cabeçalho.
  useSwipeBack({ enabled: ready, href: "/conversas" });

  const businessName =
    session?.businessProfile?.businessName ??
    session?.tenant.name ??
    "Seu negócio";
  const businessTimezone =
    session?.businessProfile?.timezone ?? "America/Sao_Paulo";
  const person = conversation ? conversationLabel(conversation) : "";

  let chat: ReactNode;
  if (loading || error || !conversation) {
    chat = (
      <section
        aria-busy={loading || undefined}
        className="conversation-chat conversation-chat-state"
      >
        {loading ? (
          <ConversationLoading />
        ) : (
          <>
            <StatePanel
              actionLabel="Tentar novamente"
              description={
                error ?? "A conversa solicitada não está disponível."
              }
              icon="alert"
              onAction={retry}
              title="Não foi possível abrir a conversa"
              tone="error"
            />
            <Link className="btn btn-secondary" href="/conversas">
              Voltar para conversas
            </Link>
          </>
        )}
      </section>
    );
  } else {
    const state = conversationState(conversation);
    const closed = conversation.status === "CLOSED";
    const personal =
      state === "ai-paused" && conversation.category === "PERSONAL";
    const youHandling = state === "you-handling";
    // Enviar assume: o takeover prévio deixou de ser pré-condição
    // (internal/routes.ts:474-492), então o campo aceita digitação em
    // qualquer estado aberto — só a conversa resolvida bloqueia.
    const canReply = !closed;
    const aiAnswering =
      state === "ai-handling" ||
      state === "ai-active" ||
      state === "ai-unstable";
    const assumesOnSend = !closed && !youHandling;
    const composerNotice = closed
      ? "Esta conversa foi marcada como resolvida."
      : aiAnswering
        ? "Ao enviar uma mensagem, você assume a conversa e a IA pausa aqui."
        : null;
    const placeholder =
      assumesOnSend && !aiAnswering && !personal
        ? "Sua primeira mensagem assume a conversa"
        : "Mensagem";
    const noticeText =
      state === "waiting-you" || state === "ai-unstable"
        ? waitingNoticeCopy(conversation.handoffReason)
        : null;
    const offerSuggestions =
      !closed && (youHandling || state === "waiting-you");

    chat = (
      <section
        aria-labelledby="conversation-person-name"
        className="conversation-chat"
      >
        <header className="chat-header">
          <Link
            aria-label="Voltar para conversas"
            className="chat-header-icon chat-header-back"
            href="/conversas"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
              width="24"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <span
            aria-hidden="true"
            className={clsx("chat-avatar", avatarTone(state))}
          >
            {initials(person)}
            <ContactPhoto
              src={conversation && conversationPhotoUrl(conversation)}
            />
          </span>
          <div className="chat-header-copy">
            <button
              aria-label={`Abrir contexto de ${person}`}
              className="chat-header-name"
              onClick={openContext}
              type="button"
            >
              <span id="conversation-person-name">{person}</span>
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                style={{ stroke: "var(--at-color-ink-muted)" }}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="14"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <HeaderState
              closed={closed}
              conversation={conversation}
              personal={personal}
              state={state}
            />
          </div>
          {youHandling ? (
            <button
              className="chat-header-resume"
              disabled={busy || closed}
              onClick={() => setReleaseOpen(true)}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="currentColor"
                height="12"
                viewBox="0 0 24 24"
                width="12"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Retomar IA
            </button>
          ) : (
            <div className="dropdown chat-header-more">
              <button
                aria-expanded={actionsOpen}
                aria-haspopup="dialog"
                aria-label="Mais ações"
                className="chat-header-icon"
                onClick={toggleActions}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="currentColor"
                  height="22"
                  viewBox="0 0 24 24"
                  width="22"
                >
                  <circle cx="5" cy="12" r="1.9" />
                  <circle cx="12" cy="12" r="1.9" />
                  <circle cx="19" cy="12" r="1.9" />
                </svg>
              </button>
            </div>
          )}
        </header>

        <MessageTimeline
          businessTimezone={businessTimezone}
          contentExpiredThrough={conversation.contentExpiredThrough ?? null}
          conversationId={conversation.id}
          events={events}
          footer={
            conversation.ignored ? (
              <p className="chat-ignored-note">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="13"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                  width="13"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path d="M6.5 6.5l11 11" />
                </svg>
                <span>A IA nunca responde este contato ·</span>
                <button onClick={() => openIgnore()} type="button">
                  alterar
                </button>
              </p>
            ) : null
          }
          humanHandlingSince={conversation.session?.humanHandlingSince ?? null}
          messages={messages}
          notice={
            noticeText
              ? {
                  anchorImage: isImageReason(conversation.handoffReason),
                  text: noticeText,
                }
              : null
          }
          onResend={(message) => void resend(message)}
          person={person}
          resendingId={resendingId}
        />

        <footer
          className={clsx("chat-composer", composerNotice && "has-notice")}
        >
          {actionError && (
            <div className="composer-error" role="alert">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} type="button">
                Fechar
              </button>
            </div>
          )}
          {composerNotice ? (
            <span className="chat-composer-notice" id="composer-status-text">
              {composerNotice}
            </span>
          ) : (
            assumesOnSend && (
              <span className="sr-only" id="composer-status-text">
                Sua primeira mensagem assume a conversa.
              </span>
            )
          )}
          {sendConfirmation && (
            <p className="composer-confirmation" role="status">
              {sendConfirmation}
            </p>
          )}
          {offerSuggestions && (
            <ConversationSuggestions
              conversationId={conversation.id}
              onEdit={(text) => {
                setDraft(text);
                composerRef.current?.focus();
              }}
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
              aria-describedby={
                composerNotice || assumesOnSend
                  ? "composer-status-text"
                  : undefined
              }
              className={clsx(
                "composer-input",
                !draft && placeholder !== "Mensagem" && "is-long-placeholder",
              )}
              disabled={!canReply || busy}
              id="message-composer"
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              ref={composerRef}
              rows={1}
              value={draft}
            />
            <button
              aria-label="Enviar mensagem"
              className="composer-send"
              disabled={!canReply || busy || !draft.trim()}
              type="submit"
            >
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
                <path d="M4 12 20 4l-4 16-4-7z" />
              </svg>
            </button>
          </form>
        </footer>
      </section>
    );
  }

  // Na casca, a lista e o painel são dela: os mesmos nós viram invólucros sem
  // caixa, e cruzar 1024 px continua sem remontar o chat.
  return (
    <>
      <div
        className={
          hosted
            ? "conversation-hosted"
            : wide
              ? "list-detail conversation-list-detail"
              : "list-detail-flat"
        }
      >
        <div
          aria-label={!hosted && wide ? "Conversas" : undefined}
          className={
            hosted
              ? "conversation-hosted-list"
              : "list-detail-list conversation-list-column"
          }
          hidden={hosted || undefined}
          role={!hosted && wide ? "complementary" : undefined}
        >
          {!workspace && wide && conversation && (
            <ThreadListColumn
              initialLens={lensForConversation(conversation)}
              selectedId={conversationId}
            />
          )}
        </div>
        <div
          className={
            hosted
              ? "conversation-hosted-panel"
              : "list-detail-panel conversation-detail-panel"
          }
        >
          {chat}
        </div>
      </div>

      {conversation && (
        <>
          {contextOpen && (
            <ConversationCustomerSheet
              conversation={conversation}
              onChooseTreatment={(position) => void chooseTreatment(position)}
              onClose={() => setContextOpen(false)}
              onResolve={() => {
                setContextOpen(false);
                void mutate("resolve");
              }}
              onTakeover={() => {
                setContextOpen(false);
                void mutate("takeover");
              }}
              person={person}
              takeoverBusy={busy}
              treatmentBusy={treatmentBusy}
              treatmentError={treatmentError}
            />
          )}
          <ConversationActionsSheet
            busy={sheetBusy}
            category={conversation.category ?? "UNCLASSIFIED"}
            error={sheetError}
            ignored={Boolean(conversation.ignored)}
            onClose={() => setActionsOpen(false)}
            onIgnore={() => openIgnore()}
            onMarkPersonal={(scope) =>
              void setCategoryFromSheet("PERSONAL", scope)
            }
            onMoveToCommercial={() =>
              void setCategoryFromSheet("COMMERCIAL", "CONTACT")
            }
            onViewContact={() => {
              setActionsOpen(false);
              openContext();
            }}
            open={actionsOpen}
            person={person}
          />
          <Dialog
            eyebrow={
              conversation.ignored ? "Voltar a usar na IA" : "Ignorar na IA"
            }
            open={ignoreOpen}
            onClose={closeIgnore}
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
                onClick={closeIgnore}
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
      )}
    </>
  );
}

/**
 * A coluna da lista ao lado do chat fora da casca de `/conversas` (o chat
 * montado sozinho): o mesmo estado e o mesmo componente de `/conversas`, sem
 * declarar casca. Só é montada de 1024 px em diante, então abaixo disso o chat
 * não lê a lista.
 */
function ThreadListColumn({
  initialLens,
  selectedId,
}: {
  initialLens: InboxLens;
  selectedId: string;
}) {
  const list = useConversationList(initialLens);
  return <ConversationListColumn list={list} selectedId={selectedId} />;
}

/** Cor do avatar do cabeçalho, a mesma da linha da lista (quadros C1 e K1–K4). */
function avatarTone(state: ConversationState): string | undefined {
  if (state === "waiting-you") return "is-waiting";
  if (state === "ai-handling") return "is-ai";
  return undefined;
}

/**
 * A linha do estado no cabeçalho, uma por estado, no estilo do quadro: "IA
 * atendendo" com o ponto que pulsa (K1), "Aguardando você · há 12 min" (K2),
 * "Você atendendo" (K3) e "Pessoal · IA desativada" (K4). Os estados sem
 * quadro usam o mesmo desenho e o rótulo de hoje. O texto diz o estado; a cor
 * só acompanha.
 */
function HeaderState({
  closed,
  conversation,
  personal,
  state,
}: {
  closed: boolean;
  conversation: Conversation;
  personal: boolean;
  state: ConversationState;
}) {
  const view = conversationStateView(state);
  if (closed) {
    return (
      <span className="chat-header-state is-resolved">
        <Icon name="check" />
        Resolvida
      </span>
    );
  }
  if (state === "ai-handling" || state === "ai-active") {
    return (
      <span className="chat-header-state is-ai">
        <span
          aria-hidden="true"
          className={clsx(
            "chat-header-pulse",
            state === "ai-handling" && "is-live",
          )}
        />
        {view.label}
      </span>
    );
  }
  if (state === "waiting-you") {
    return (
      <span className="chat-header-state is-waiting">
        <span aria-hidden="true" className="chat-header-dot" />
        {view.label} · {formatWaitingTime(conversation.updatedAt)}
      </span>
    );
  }
  if (state === "ai-unstable") {
    return (
      <span className="chat-header-state is-error">
        <span aria-hidden="true" className="chat-header-dot" />
        {view.label}
      </span>
    );
  }
  if (state === "you-handling") {
    return (
      <span className="chat-header-state is-human">
        <svg
          aria-hidden="true"
          fill="none"
          height="12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          width="12"
        >
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
        {view.label}
      </span>
    );
  }
  return (
    <span className="chat-header-state is-paused">
      <svg
        aria-hidden="true"
        fill="none"
        height="12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
        width="12"
      >
        <path d="M9 6v12M15 6v12" />
      </svg>
      {personal ? "Pessoal · IA desativada" : view.label}
    </span>
  );
}
