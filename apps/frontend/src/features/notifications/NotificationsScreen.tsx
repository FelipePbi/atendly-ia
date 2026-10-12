"use client";

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Notification } from "@/data";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { useSystemStatus } from "@/shared/runtime/systemStatus";
import { Skeleton, StatePanel } from "@/shared/ui/States";

import { NotificationPreferenceSection } from "./NotificationPreferenceSection";
import {
  formatClock,
  groupNotificationsByDay,
  isResolvedCondition,
  notificationCopy,
  notificationLevelView,
} from "./notificationViews";

const PAGE_SIZE = 20;

type NotificationListState = {
  error: boolean;
  items: Notification[] | null;
  total: number;
  reload: () => Promise<void>;
};

/**
 * A leitura de `GET /v1/notifications` que a página e a gaveta compartilham
 * (Goal077 §3): a mesma lista, com a mesma página e o mesmo recarregamento.
 */
function useNotificationList(): NotificationListState {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return getProductServices()
      .notifications.list({ limit: PAGE_SIZE, offset: 0 }, signal)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setError(false);
      })
      .catch(() => {
        if (signal?.aborted) return;
        setError(true);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { error, items, reload: () => load(), total };
}

/**
 * Ver é ler (pedido de 2026-10-12): assim que a lista aparece, cada não lida
 * visível é marcada como lida pelo próprio `id` — nunca `{ all: true }`, que
 * levaria junto o que chegou depois da leitura ou ficou além da primeira
 * página. A lista não é recarregada: o destaque de não lida continua enquanto
 * a pessoa olha, para ela ver o que é novo.
 *
 * O contador da casca (badge da sidebar, ponto do sino da Home) muda quando a
 * gaveta fecha ou a página é deixada: depois que as marcações terminam, o
 * resumo é relido do BFF — nunca zerado por conta própria. Se a marcação
 * falhar, o resumo relido continua contando a não lida.
 */
function useMarkVisibleAsRead(items: Notification[] | null) {
  const { refresh } = useSystemStatus();
  const marking = useRef<{ pending: Promise<unknown>; requested: Set<string> }>(
    {
      pending: Promise.resolve(),
      requested: new Set(),
    },
  );

  useEffect(() => {
    if (!items) return;
    const state = marking.current;
    const ids = items
      .filter((item) => item.readAt === null && !state.requested.has(item.id))
      .map((item) => item.id);
    if (ids.length === 0) return;
    const notifications = getProductServices().notifications;
    for (const id of ids) state.requested.add(id);
    state.pending = Promise.allSettled([
      state.pending,
      ...ids.map((id) => notifications.markRead({ id })),
    ]);
  }, [items]);

  useEffect(() => {
    const state = marking.current;
    return () => {
      if (state.requested.size === 0) return;
      void state.pending.then(() => refresh());
    };
  }, [refresh]);
}

/**
 * Central de notificações (Goal022/WU-07, Goal077): três níveis distintos,
 * não lida destacada, marcar uma/todas como lidas, condição resolvida dizendo
 * como foi resolvida (nunca some da lista), histórico agrupado por dia e a
 * preferência de agendamento criado pela IA — esta última só aqui, nunca na
 * gaveta. Toda mutação pedida pela pessoa recarrega a lista do zero — nunca
 * soma contagem local — para que o que a tela mostra seja sempre o que a rota
 * devolveu. Abrir já marca as não lidas visíveis (`useMarkVisibleAsRead`).
 */
export function NotificationsScreen() {
  const list = useNotificationList();
  useMarkVisibleAsRead(list.items);
  const wide = useWideLayout();

  useShellConfig({
    active: "notificacoes",
    loading: !list.items && !list.error,
    module: "settings",
    pushed: !wide,
    title: "Notificações",
  });

  if (!list.items && !list.error) {
    return (
      <Page pushed={!wide}>
        <NotificationsLoading />
      </Page>
    );
  }

  if (list.error || !list.items) {
    return (
      <Page pushed={!wide}>
        <NotificationsUnavailable onRetry={() => void list.reload()} />
      </Page>
    );
  }

  return (
    <Page
      hasUnread={list.items.some((item) => item.readAt === null)}
      pushed={!wide}
    >
      <NotificationHistory items={list.items} reload={list.reload} />
      <NotificationPreferenceSection />
    </Page>
  );
}

/**
 * O conteúdo da gaveta (Goal077 §3): a mesma lista e as mesmas mutações da
 * página, sem a preferência — que fica só em `/notificacoes`, alcançável pelo
 * link do rodapé.
 */
export function NotificationsDrawerContent({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  const list = useNotificationList();
  useMarkVisibleAsRead(list.items);

  return (
    <div className="notifications-drawer-body">
      {!list.items && !list.error ? (
        <NotificationsLoading />
      ) : list.error || !list.items ? (
        <NotificationsUnavailable onRetry={() => void list.reload()} />
      ) : (
        <NotificationHistory items={list.items} reload={list.reload} />
      )}
      <footer className="notifications-drawer-footer">
        <Link href="/notificacoes" onClick={onNavigate}>
          Preferências de notificação
        </Link>
      </footer>
    </div>
  );
}

function NotificationsLoading() {
  return (
    <div aria-busy="true" className="notifications-panel">
      <Skeleton style={{ width: "60%", height: 20 }} />
      <Skeleton style={{ width: "100%", height: 72 }} />
      <Skeleton style={{ width: "100%", height: 72 }} />
    </div>
  );
}

function NotificationsUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <StatePanel
      actionLabel="Tentar de novo"
      description="Nada foi alterado. Tente carregar a página novamente."
      icon="alert"
      onAction={onRetry}
      title="Notificações indisponíveis"
      tone="error"
    />
  );
}

function NotificationHistory({
  items,
  reload,
}: {
  items: Notification[];
  reload: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  async function markOne(id: string) {
    setBusyId(id);
    try {
      await getProductServices().notifications.markRead({ id });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    setMarkingAll(true);
    try {
      await getProductServices().notifications.markRead({ all: true });
      await reload();
    } finally {
      setMarkingAll(false);
    }
  }

  const hasUnread = items.some((item) => item.readAt === null);

  return (
    <>
      {hasUnread && (
        <div className="notifications-panel-header">
          <button
            aria-busy={markingAll || undefined}
            className="notifications-mark-all"
            disabled={markingAll}
            onClick={() => void markAll()}
            type="button"
          >
            Marcar lidas
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <NotificationsEmpty />
      ) : (
        <div className="notifications-days">
          {groupNotificationsByDay(items).map((group) => (
            <section className="notifications-day" key={group.key}>
              <h3 className="notifications-day-title">{group.label}</h3>
              <ul className="notifications-list">
                {group.items.map((item) => (
                  <NotificationRow
                    busy={busyId === item.id}
                    key={item.id}
                    notification={item}
                    onMarkRead={() => void markOne(item.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * O vazio do quadro NT2, o mesmo na página e na gaveta. A pílula só confirma o
 * que o status compartilhado já provou: IA e WhatsApp `active`. Qualquer outro
 * estado, inclusive a leitura ainda em curso ou com erro, a deixa de fora.
 */
function NotificationsEmpty() {
  const { aiView, whatsappView } = useSystemStatus();
  const allClear = aiView === "active" && whatsappView === "active";

  return (
    <div className="notifications-empty">
      <div aria-hidden="true" className="notifications-empty-halo">
        <span className="notifications-empty-ring" />
        <span className="notifications-empty-disc">
          <svg
            fill="none"
            height="28"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="28"
          >
            <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
        </span>
      </div>
      <div className="notifications-empty-text">
        <h3>Nada por aqui</h3>
        <p>
          Avisamos quando algo precisar de você: uma cliente aguardando, o
          WhatsApp desconectado ou um lembrete que não foi enviado.
        </p>
      </div>
      {allClear && (
        <span className="notifications-empty-pill">
          <span aria-hidden="true" className="notifications-empty-pill-dot" />
          IA ativa · tudo em ordem
        </span>
      )}
    </div>
  );
}

function NotificationRow({
  busy,
  notification,
  onMarkRead,
}: {
  busy: boolean;
  notification: Notification;
  onMarkRead: () => void;
}) {
  const level = notificationLevelView(notification.level);
  const copy = notificationCopy(notification);
  const unread = notification.readAt === null;
  const resolved = isResolvedCondition(notification);

  const body = (
    <div className="notifications-row-body">
      <div className="notifications-row-top">
        <strong className="notifications-row-title">{copy.title}</strong>
        <span className="notifications-row-time">
          {formatClock(notification.occurredAt)}
        </span>
      </div>
      <p>{copy.description}</p>
    </div>
  );

  return (
    <li
      aria-label={`${level.label}: ${copy.title}${resolved ? " (resolvido)" : ""}`}
      className={`notifications-row ${level.className}${unread ? " is-unread" : ""}${resolved ? " is-resolved" : ""}`}
    >
      <NotificationMarker
        levelClassName={level.className}
        resolved={resolved}
      />
      {copy.href ? (
        <Link className="notifications-row-link" href={copy.href}>
          {body}
        </Link>
      ) : (
        body
      )}
      {unread && (
        <button
          aria-busy={busy || undefined}
          aria-label="Marcar como lida"
          className="notifications-unread-dot"
          disabled={busy}
          onClick={onMarkRead}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/**
 * O marcador do quadro NT1, sempre com forma própria além da cor: ponto para
 * informativa e atenção (a atenção não lida ganha também a faixa da linha),
 * triângulo para crítica e círculo com visto para a condição resolvida.
 */
function NotificationMarker({
  levelClassName,
  resolved,
}: {
  levelClassName: string;
  resolved: boolean;
}) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    viewBox: "0 0 24 24",
  } as const;
  let mark: ReactNode;
  if (resolved) {
    mark = (
      <span aria-hidden="true" className="notifications-level-dot is-resolved">
        <svg {...stroke} height="11" strokeWidth="3" width="11">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  } else if (levelClassName === "is-critical") {
    mark = (
      <svg
        {...stroke}
        aria-hidden="true"
        className="notifications-level-dot is-critical"
        height="18"
        strokeWidth="1.75"
        width="18"
      >
        <path d="M12 4 21 20H3z" />
        <path d="M12 10v4M12 17v.5" />
      </svg>
    );
  } else {
    mark = (
      <span
        aria-hidden="true"
        className={`notifications-level-dot ${levelClassName}`}
      />
    );
  }
  return <span className="notifications-marker">{mark}</span>;
}

function Page({
  children,
  hasUnread = false,
  pushed,
}: {
  children: ReactNode;
  hasUnread?: boolean;
  pushed: boolean;
}) {
  return (
    <section
      className={`notifications-page${pushed ? " is-pushed" : ""}${hasUnread ? " has-unread" : ""}`}
    >
      {pushed ? (
        <PushedBar
          backHref="/inicio"
          backLabel="Voltar para o início"
          title="Notificações"
        />
      ) : (
        <header className="notifications-header">
          <h1>Notificações</h1>
        </header>
      )}
      {children}
    </section>
  );
}
