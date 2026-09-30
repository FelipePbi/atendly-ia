"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import type { Notification } from "@/data";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
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
 * Central de notificações (Goal022/WU-07, Goal077): três níveis distintos,
 * não lida destacada, marcar uma/todas como lidas, condição resolvida dizendo
 * como foi resolvida (nunca some da lista), histórico agrupado por dia e a
 * preferência de agendamento criado pela IA — esta última só aqui, nunca na
 * gaveta. Toda mutação recarrega a lista do zero — nunca soma contagem local —
 * para que o que a tela mostra seja sempre o que a rota devolveu.
 */
export function NotificationsScreen() {
  const list = useNotificationList();

  useShellConfig({
    active: "notificacoes",
    loading: !list.items && !list.error,
    module: "settings",
    title: "Notificações",
  });

  if (!list.items && !list.error) {
    return (
      <Page>
        <NotificationsLoading />
      </Page>
    );
  }

  if (list.error || !list.items) {
    return (
      <Page>
        <NotificationsUnavailable onRetry={() => void list.reload()} />
      </Page>
    );
  }

  return (
    <Page>
      <section className="notifications-panel">
        <NotificationHistory
          heading={
            <div>
              <h2>Histórico recente</h2>
              <p>
                {list.total > 0
                  ? `${list.total} nos últimos 90 dias`
                  : "Nenhuma nos últimos 90 dias"}
              </p>
            </div>
          }
          items={list.items}
          reload={list.reload}
        />
      </section>
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
  heading,
  items,
  reload,
}: {
  heading?: ReactNode;
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
      {(heading || hasUnread) && (
        <div className="notifications-panel-header">
          {heading}
          {hasUnread && (
            <Button
              loading={markingAll}
              onClick={() => void markAll()}
              type="button"
              variant="secondary"
            >
              Marcar lidas
            </Button>
          )}
        </div>
      )}
      {items.length === 0 ? (
        <StatePanel
          description="Nada exige sua atenção agora."
          icon="check"
          title="Tudo em dia"
        />
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
        <span className={`badge ${levelBadgeClassName(level.className)}`}>
          {level.label}
        </span>
        {unread && <span className="badge badge-unread">Não lida</span>}
        {resolved && <span className="badge badge-success">Resolvido</span>}
        <span className="notifications-row-time">
          {formatClock(notification.occurredAt)}
        </span>
      </div>
      <strong className="notifications-row-title">{copy.title}</strong>
      <p>{copy.description}</p>
    </div>
  );

  return (
    <li
      aria-label={`${level.label}: ${copy.title}${resolved ? " (resolvido)" : ""}`}
      className={`notifications-row${unread ? " is-unread" : ""}${resolved ? " is-resolved" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`notifications-level-dot ${level.className}`}
      />
      {copy.href ? (
        <Link className="notifications-row-link" href={copy.href}>
          {body}
        </Link>
      ) : (
        body
      )}
      {unread && (
        <Button
          loading={busy}
          onClick={onMarkRead}
          type="button"
          variant="tertiary"
        >
          Marcar como lida
        </Button>
      )}
    </li>
  );
}

/** As três cores do sistema de badge já existente (`atendly.css`). */
function levelBadgeClassName(levelClassName: string): string {
  if (levelClassName === "is-critical") return "badge-danger";
  if (levelClassName === "is-attention") return "badge-attention";
  return "badge-ai";
}

function Page({ children }: { children: ReactNode }) {
  return (
    <section className="notifications-page">
      <header className="notifications-header">
        <p className="eyebrow">Notificações</p>
        <h1>Central de notificações</h1>
        <p>
          Alertas e eventos relevantes da sua operação, com histórico
          recente.
        </p>
      </header>
      {children}
    </section>
  );
}
