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
  formatOccurredAt,
  notificationCopy,
  notificationLevelView,
} from "./notificationViews";

const PAGE_SIZE = 20;

/**
 * Central de notificações (Goal022/WU-07): três níveis distintos, não lida
 * destacada, marcar uma/todas como lidas, condição resolvida identificada
 * como resolvida (nunca some da lista), histórico recente e a preferência de
 * agendamento criado pela IA. Toda mutação recarrega a lista do zero — nunca
 * soma contagem local — para que o que a tela mostra seja sempre o que a
 * rota devolveu.
 */
export function NotificationsScreen() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

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

  useShellConfig({
    active: "notificacoes",
    loading: !items && !error,
    module: "settings",
    title: "Notificações",
  });

  async function markOne(id: string) {
    setBusyId(id);
    try {
      await getProductServices().notifications.markRead({ id });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    setMarkingAll(true);
    try {
      await getProductServices().notifications.markRead({ all: true });
      await load();
    } finally {
      setMarkingAll(false);
    }
  }

  if (!items && !error) {
    return (
      <Page>
        <div aria-busy="true" className="notifications-panel">
          <Skeleton style={{ width: "60%", height: 20 }} />
          <Skeleton style={{ width: "100%", height: 72 }} />
          <Skeleton style={{ width: "100%", height: 72 }} />
        </div>
      </Page>
    );
  }

  if (error || !items) {
    return (
      <Page>
        <StatePanel
          actionLabel="Tentar de novo"
          description="Nada foi alterado. Tente carregar a página novamente."
          icon="alert"
          onAction={() => void load()}
          title="Notificações indisponíveis"
          tone="error"
        />
      </Page>
    );
  }

  const hasUnread = items.some((item) => item.readAt === null);

  return (
    <Page>
      <section className="notifications-panel">
        <div className="notifications-panel-header">
          <div>
            <h2>Histórico recente</h2>
            <p>
              {total > 0
                ? `${total} nos últimos 90 dias`
                : "Nenhuma nos últimos 90 dias"}
            </p>
          </div>
          {hasUnread && (
            <Button
              loading={markingAll}
              onClick={() => void markAll()}
              type="button"
              variant="secondary"
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <StatePanel
            description="Nada exige sua atenção agora."
            icon="check"
            title="Tudo em dia"
          />
        ) : (
          <ul className="notifications-list">
            {items.map((item) => (
              <NotificationRow
                busy={busyId === item.id}
                key={item.id}
                notification={item}
                onMarkRead={() => void markOne(item.id)}
              />
            ))}
          </ul>
        )}
      </section>
      <NotificationPreferenceSection />
    </Page>
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
  const resolved =
    notification.shape === "CONDITION" && notification.resolvedAt !== null;

  const body = (
    <div className="notifications-row-body">
      <div className="notifications-row-top">
        <span className={`badge ${levelBadgeClassName(level.className)}`}>
          {level.label}
        </span>
        {unread && <span className="badge badge-unread">Não lida</span>}
        {resolved && <span className="badge badge-success">Resolvido</span>}
        <span className="notifications-row-time">
          {formatOccurredAt(notification.occurredAt)}
        </span>
      </div>
      <strong>{copy.title}</strong>
      <p>{copy.description}</p>
    </div>
  );

  return (
    <li className={`notifications-row${unread ? " is-unread" : ""}`}>
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
