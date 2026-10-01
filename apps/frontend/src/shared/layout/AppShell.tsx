"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  NotificationsDrawerProvider,
  useNotificationsDrawer,
} from "@/features/notifications/NotificationsDrawer";
import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import {
  accountDeletionDaysRemaining,
  aiCardView,
  type StatusView,
  SystemStatusProvider,
  useSystemStatus,
} from "@/shared/runtime/systemStatus";
import { Brand } from "@/shared/ui/Brand";
import { Dialog } from "@/shared/ui/Dialog";

import {
  isDestinationActive,
  isMobileTab,
  isMoreActive,
  MORE_DESTINATIONS,
  NOTIFICATIONS_DESTINATION,
  notificationsBadgeLabel,
  SETTINGS_DESTINATION,
  SIDEBAR_DESTINATIONS,
} from "./navigation";
import type { ShellConfig } from "./ShellConfig";

export type { PlatformSection, ShellContextualAction, ShellModule } from "./navigation";
export { SHELL_MODULES } from "./navigation";

export type AppShellProps = ShellConfig & {
  children: ReactNode;
};

/**
 * `SystemStatusProvider` monta o único poller de `GET /v1/status` da árvore
 * (Goal018/WU-10): o chrome do shell e a tela filha (ex.: `DashboardScreen`)
 * leem o mesmo resultado via `useSystemStatus`, em vez de cada um abrir seu
 * próprio `setInterval`/listener de `focus`.
 *
 * `NotificationsDrawerProvider` monta a gaveta da central (Goal077 §3): o
 * item "Notificações" da sidebar e o sino da Home abrem a mesma gaveta.
 */
export function AppShell(props: AppShellProps) {
  return (
    <SystemStatusProvider>
      <NotificationsDrawerProvider>
        <AppShellChrome {...props} />
      </NotificationsDrawerProvider>
    </SystemStatusProvider>
  );
}

function AppShellChrome({
  action,
  active,
  children,
  mainClassName,
  module,
  showBottomNav = true,
  title,
  whatsappInBand = false,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, setUnauthenticated } = useProductRuntime();
  const status = useSystemStatus();
  const notificationsDrawer = useNotificationsDrawer();
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const styleModule =
    module === "system" || module === "migration" ? "settings" : module;
  const shellClass = styleModule ? `${styleModule}-shell` : "platform-shell";
  const bottomNavClass =
    module === "dashboard"
      ? "dashboard-bottom-nav"
      : `${styleModule ?? "platform"}-bottom-nav`;
  const mainClass = mainClassName ?? `${styleModule ?? "platform"}-main`;
  const businessName =
    session?.businessProfile?.businessName ??
    session?.tenant.name ??
    "Seu negócio";
  const accountLabel =
    session?.user.name?.trim() || session?.user.email || "Conta principal";
  const notificationsBadge = notificationsBadgeLabel(
    status.notificationsSummary?.unreadCount ?? 0,
  );
  const whatsappDisconnected = status.whatsappView === "off";
  const aiUnavailable =
    status.aiView === "pending" || status.aiView === "unknown";
  // Goal025 §7: o aviso persistente do prazo de exclusão. Vem do mesmo
  // `GET /v1/status` que os outros dois banners, e não de um segundo estado
  // inventado no cliente — `dueAt` é o vencimento que o servidor devolve.
  // Enquanto a resposta não chega, `accountDeletion` é `null` e não há banner:
  // anunciar exclusão por suposição seria pior que não anunciar.
  const deletionDueAt =
    status.accountDeletion?.status === "SCHEDULED"
      ? status.accountDeletion.dueAt
      : null;

  useEffect(() => {
    document.title = title ? `${title} — Atendly` : "Atendly";
  }, [title]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  async function logout() {
    await getProductServices()
      .auth.logout()
      .catch(() => undefined);
    setUnauthenticated();
    router.replace("/login");
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <div
        className={clsx(
          shellClass,
          "app-frame",
          mainClassName === "conversation-detail-main" &&
            "conversation-detail-shell",
        )}
      >
        <aside className="sidebar" aria-label="Navegação da aplicação">
          <div className="sidebar-brand">
            <Brand signature="check" />
          </div>
          <nav className="nav" aria-label="Navegação principal">
            {SIDEBAR_DESTINATIONS.map((item) => (
              <Link
                className={clsx(
                  "nav-item",
                  isDestinationActive(item.section, active) && "is-active",
                )}
                href={item.href}
                key={item.section}
                aria-current={
                  isDestinationActive(item.section, active) ? "page" : undefined
                }
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
            <Link
              className={clsx(
                "nav-item",
                active === SETTINGS_DESTINATION.section && "is-active",
              )}
              href={SETTINGS_DESTINATION.href}
              aria-current={
                active === SETTINGS_DESTINATION.section ? "page" : undefined
              }
            >
              <Icon name={SETTINGS_DESTINATION.icon} />
              <span>{SETTINGS_DESTINATION.label}</span>
            </Link>
            {/*
              A sidebar só aparece a partir de 1100 px, e o clique no item abre
              a central sobre a tela em vez de navegar (Goal077 §3). Continua
              link para /notificacoes — abrir em nova aba e o destino atual
              seguem funcionando. Divergência declarada frente ao protótipo,
              que não tem o item: sem ele a central ficaria inalcançável fora
              da Home.
            */}
            <Link
              className={clsx(
                "nav-item",
                active === "notificacoes" && "is-active",
              )}
              href={NOTIFICATIONS_DESTINATION.href}
              onClick={(event) => {
                if (
                  !notificationsDrawer ||
                  active === "notificacoes" ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                notificationsDrawer.open();
              }}
              aria-haspopup={active === "notificacoes" ? undefined : "dialog"}
              aria-current={active === "notificacoes" ? "page" : undefined}
            >
              <Icon name={NOTIFICATIONS_DESTINATION.icon} />
              <span>{NOTIFICATIONS_DESTINATION.label}</span>
              {notificationsBadge && (
                <span className="badge-count">{notificationsBadge}</span>
              )}
            </Link>
          </nav>
          <div className="sidebar-bottom">
            <IaCard aiView={status.aiView} whatsappView={status.whatsappView} />
            <div
              className="dropdown sidebar-account-menu"
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !accountOpen) return;
                event.preventDefault();
                setAccountOpen(false);
                event.currentTarget
                  .querySelector<HTMLButtonElement>(".account-button")
                  ?.focus();
              }}
            >
              <button
                className="account-button business-context"
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                aria-expanded={accountOpen}
                aria-controls="account-menu"
              >
                <span className="avatar" aria-hidden="true">
                  {initials(accountLabel)}
                </span>
                <span className="account-names">
                  <span className="account-person">{accountLabel}</span>
                  <span className="business-name">
                    <strong>{businessName}</strong>
                  </span>
                </span>
              </button>
              {accountOpen && (
                <div className="menu" id="account-menu">
                  <Link className="menu-item" href="/configuracoes/conta">
                    Minha conta
                  </Link>
                  <div className="menu-divider" />
                  <button
                    className="menu-item danger"
                    type="button"
                    onClick={() => void logout()}
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
        <main className={mainClass} id="main-content" ref={mainRef} tabIndex={-1}>
          {deletionDueAt && (
            <PersistentStatusBanner
              text={accountDeletionBannerCopy(
                accountDeletionDaysRemaining(deletionDueAt),
              )}
              title="Exclusão de conta agendada"
              href="/configuracoes/conta"
              linkLabel="Ver exclusão da conta"
            />
          )}
          {!deletionDueAt && whatsappDisconnected && !whatsappInBand && (
            <PersistentStatusBanner
              text="Reconecte o WhatsApp para a IA voltar a responder."
              title="Atendimento automático parado"
              href="/configuracoes/whatsapp"
              linkLabel="Reconectar WhatsApp"
            />
          )}
          {!deletionDueAt && aiUnavailable && (
            <PersistentStatusBanner
              text="A IA não está respondendo. As conversas seguem para atendimento humano."
              title="IA indisponível"
              href="/configuracoes/ia"
              linkLabel="Ver configurações da IA"
            />
          )}
          {children}
        </main>
        {showBottomNav && action && (
          <Link className="fab" href={action.href} aria-label={action.label}>
            <Icon name={action.icon} />
          </Link>
        )}
        {showBottomNav && (
          <nav className={bottomNavClass} aria-label="Navegação principal">
            {SIDEBAR_DESTINATIONS.filter((item) => isMobileTab(item.section)).map(
              (item) => (
                <Link
                  className={clsx(
                    "bottom-nav-item",
                    isDestinationActive(item.section, active) && "is-active",
                  )}
                  href={item.href}
                  key={item.section}
                  aria-current={
                    isDestinationActive(item.section, active)
                      ? "page"
                      : undefined
                  }
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ),
            )}
            <button
              className={clsx(
                "bottom-nav-item",
                isMoreActive(active) && "is-active",
              )}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={isMoreActive(active) ? "page" : undefined}
            >
              <Icon name="nav-more" />
              <span>Mais</span>
            </button>
          </nav>
        )}
      </div>
      <Dialog
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Mais"
        eyebrow="Navegação"
        variant="sheet"
      >
        <div className="list">
          {MORE_DESTINATIONS.map((item) => (
            <Link className="menu-item" href={item.href} key={item.section}>
              <Icon name={item.icon} />
              {item.label}
              {item.section === "notificacoes" && notificationsBadge && (
                <span className="badge-count">{notificationsBadge}</span>
              )}
            </Link>
          ))}
          <div className="menu-divider" />
          <button
            className="menu-item danger"
            type="button"
            onClick={() => void logout()}
          >
            <Icon name="logout" />
            Sair
          </button>
        </div>
      </Dialog>
    </>
  );
}

/**
 * A frase do aviso de exclusão, separada porque o singular importa: "1 dia" e
 * "2 dias" não podem virar "1 dias". O dia zero não é "faltam 0 dias" — é o
 * último dia em que ainda dá para cancelar.
 */
function accountDeletionBannerCopy(days: number): string {
  if (days <= 0) {
    return "Hoje é o último dia para cancelar. Depois disso os dados são apagados sem volta.";
  }
  if (days === 1) {
    return "Falta 1 dia para os dados serem apagados. Cancele em Configurações → Conta enquanto o prazo corre.";
  }
  return `Faltam ${days} dias para os dados serem apagados. Cancele em Configurações → Conta enquanto o prazo corre.`;
}

/**
 * Deriva de `/v1/status` (via `useSystemStatus`, mesmo tick do shell), não da
 * central de notificações: o banner afirma a condição agora, a central guarda
 * desde quando e até quando (Goal022/WU-08). A frase nunca repete a dos chips
 * de estado da sidebar (`IaCard`), que são "IA desligada" / "IA em ativação"
 * / etc.
 */
function PersistentStatusBanner({
  href,
  linkLabel,
  text,
  title,
}: {
  href: string;
  linkLabel: string;
  text: string;
  title: string;
}) {
  return (
    <div className="alert alert-error shell-status-banner" role="alert">
      <Icon name="alert" />
      <div>
        <p className="alert-title">{title}</p>
        <p className="alert-text">{text}</p>
      </div>
      <Link className="btn btn-secondary" href={href}>
        {linkLabel}
      </Link>
    </div>
  );
}

function IaCard({
  aiView,
  whatsappView,
}: {
  aiView: StatusView;
  whatsappView: StatusView;
}) {
  const card = aiCardView(aiView, whatsappView);
  const disconnected = whatsappView === "off";
  const action = card.action && (
    <Link className="ia-card-action" href={card.action.href}>
      {card.action.label}
    </Link>
  );
  return (
    <div className={clsx("ia-card", disconnected && "is-disconnected")}>
      {disconnected ? (
        <Icon className="ia-card-ban" name="ban" />
      ) : (
        <span
          className={clsx(
            "ia-dot",
            card.tone === "active" ? "is-active" : card.tone,
          )}
          aria-hidden="true"
        />
      )}
      <div className="ia-card-text" role="status">
        <span className="ia-card-title">{card.title}</span>
        {card.support && <span className="ia-card-sub">{card.support}</span>}
        {disconnected && action}
      </div>
      {!disconnected && action}
    </div>
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
