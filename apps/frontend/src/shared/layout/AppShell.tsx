"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  NotificationsDrawerProvider,
  useNotificationsDrawer,
} from "@/features/notifications/NotificationsDrawer";
import { Icon } from "@/shared/icons/Icon";
import {
  anchorOf,
  isPlainLeftClick,
  pushWithViewTransition,
  useSettleNavigation,
} from "@/shared/motion/PageTransition";
import { supportsViewTransition } from "@/shared/motion/viewTransition";
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
import { ToastHost } from "@/shared/ui/ToastHost";

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
import { useStatusBannerSnooze } from "./statusBannerSnooze";
import { useWideLayout } from "./useWideLayout";

export type {
  PlatformSection,
  ShellContextualAction,
  ShellModule,
} from "./navigation";
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
  pushed = false,
  showBottomNav: showBottomNavConfig = true,
  title,
  whatsappInBand = false,
}: AppShellProps) {
  const wide = useWideLayout();
  const hideTabBar = pushed && !wide;
  const showBottomNav = showBottomNavConfig && !hideTabBar;
  const router = useRouter();
  const pathname = usePathname();
  useSectionTransitions(pathname, router);
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const { session, setUnauthenticated } = useProductRuntime();
  const status = useSystemStatus();
  const notificationsDrawer = useNotificationsDrawer();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  // O menu da conta fecha ao clicar fora dele (pedido de 2026-10-16), como
  // fecha pelo próprio botão e pelo Esc.
  useEffect(() => {
    if (!accountOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [accountOpen]);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
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
  const [whatsappBannerHidden, hideWhatsappBanner] = useStatusBannerSnooze(
    "whatsapp-disconnected",
  );
  const [aiBannerHidden, hideAiBanner] =
    useStatusBannerSnooze("ai-unavailable");
  const showWhatsappBanner =
    !deletionDueAt &&
    whatsappDisconnected &&
    !whatsappInBand &&
    !whatsappBannerHidden;
  const showAiBanner = !deletionDueAt && aiUnavailable && !aiBannerHidden;
  const statusLayerRef = useRef<HTMLDivElement>(null);
  useShellStatusHeight(
    frameRef,
    statusLayerRef,
    Boolean(deletionDueAt || showWhatsappBanner || showAiBanner),
  );
  // O aviso ocultado sai da árvore: o foco não pode ficar num botão que sumiu.
  const hideBanner = (hide: () => void) => () => {
    hide();
    mainRef.current?.focus();
  };

  useEffect(() => {
    document.title = title ? `${title} · Avenly` : "Avenly";
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
          hideTabBar && "is-pushed",
        )}
        ref={frameRef}
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
              ref={accountMenuRef}
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
                  <Link
                    className="menu-item"
                    href="/configuracoes/conta"
                    onClick={() => setAccountOpen(false)}
                  >
                    Minha conta
                  </Link>
                  <div className="menu-divider" />
                  <button
                    className="menu-item danger"
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      void logout();
                    }}
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
        <main
          className={mainClass}
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
        >
          {/* Os avisos ocupam o topo da área de conteúdo e empurram a tela:
              flutuando por cima (2026-10-12), tapavam botões do topo das
              telas (bug de 2026-10-16). A altura da camada vai para
              `--shell-status-h`, que as telas de altura cheia descontam. */}
          {(deletionDueAt || showWhatsappBanner || showAiBanner) && (
            <div className="shell-status-layer" ref={statusLayerRef}>
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
              {showWhatsappBanner && (
                <PersistentStatusBanner
                  text="Reconecte o WhatsApp para a IA voltar a responder."
                  title="Atendimento automático parado"
                  href="/configuracoes/whatsapp"
                  linkLabel="Reconectar WhatsApp"
                  onHide={hideBanner(hideWhatsappBanner)}
                />
              )}
              {showAiBanner && (
                <PersistentStatusBanner
                  text="A IA não está respondendo. As conversas seguem para atendimento humano."
                  title="IA indisponível"
                  href="/configuracoes/ia"
                  linkLabel="Ver configurações da IA"
                  onHide={hideBanner(hideAiBanner)}
                />
              )}
            </div>
          )}
          {children}
        </main>
        <ToastHost />
        {showBottomNav && action && (
          <Link className="fab" href={action.href} aria-label={action.label}>
            <Icon name={action.icon} />
          </Link>
        )}
        {showBottomNav && (
          <nav className={bottomNavClass} aria-label="Navegação principal">
            {SIDEBAR_DESTINATIONS.filter((item) =>
              isMobileTab(item.section),
            ).map((item) => (
              <Link
                className={clsx(
                  "bottom-nav-item",
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
        {/* Folha "Mais" do celular (pedido de 2026-10-16): sem o cartão
            interno. Atalhos em destaque no topo, configurações numa lista
            com ícone e seta, e a conta com o "Sair" no fim — cada linha com
            alvo de toque de 48 px e a página aberta marcada. */}
        <div className="more-sheet">
          <div className="more-tiles">
            {MORE_DESTINATIONS.filter((item) =>
              MORE_SHORTCUTS.has(item.section),
            ).map((item) => (
              <Link
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className="more-tile"
                href={item.href}
                key={item.section}
              >
                <span aria-hidden="true" className="more-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="more-tile-label">{item.label}</span>
                {item.section === "notificacoes" && notificationsBadge && (
                  <span className="badge-count">{notificationsBadge}</span>
                )}
              </Link>
            ))}
          </div>
          <MoreGroup
            items={MORE_DESTINATIONS.filter(
              (item) =>
                !MORE_SHORTCUTS.has(item.section) && item.section !== "conta",
            )}
            isCurrent={isCurrent}
            title="Configurações"
          />
          <MoreGroup
            items={MORE_DESTINATIONS.filter((item) => item.section === "conta")}
            isCurrent={isCurrent}
            title="Sua conta"
          >
            <li>
              <button
                className="more-row is-danger"
                type="button"
                onClick={() => void logout()}
              >
                <span aria-hidden="true" className="more-icon">
                  <Icon name="logout" />
                </span>
                <span className="more-row-label">Sair</span>
              </button>
            </li>
          </MoreGroup>
        </div>
      </Dialog>
    </>
  );
}

/** A seção de uma rota: o primeiro trecho (`/clientes/detalhes` → `clientes`). */
function sectionOf(path: string): string {
  return path.split("/").filter(Boolean)[0] ?? "";
}

/**
 * Trocar de tela pelo menu principal (barra lateral, barra inferior e folha
 * "Mais") anima a área de conteúdo (pedido de 2026-10-16): a tela que sai
 * sobe um pouco e some, a nova entra subindo com fade; a casca fica parada.
 * Só entre seções diferentes — dentro de uma seção, quem anima é a própria
 * tela (troca de cliente, de conversa, de agendamento). Com movimento
 * reduzido, só o fade (D-173).
 */
function useSectionTransitions(
  pathname: string,
  router: ReturnType<typeof useRouter>,
): void {
  useSettleNavigation(pathname);
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!isPlainLeftClick(event)) return;
      const anchor = anchorOf(event.target);
      if (
        !anchor?.closest('nav[aria-label="Navegação principal"], .more-sheet')
      )
        return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const current = window.location.pathname;
      if (sectionOf(url.pathname) === sectionOf(current)) return;
      if (!supportsViewTransition()) return;
      event.preventDefault();
      void pushWithViewTransition(
        router,
        `${url.pathname}${url.search}${url.hash}`,
        {
          fadeOnReducedMotion: true,
          types: ["section"],
        },
      );
    }
    // Na captura, antes do `onClick` do `<Link>`: ele respeita `defaultPrevented`.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [router]);
}

/** Os atalhos em destaque no topo da folha "Mais" do celular. */
const MORE_SHORTCUTS = new Set(["notificacoes", "servicos", "faturamento"]);

function MoreGroup({
  children,
  isCurrent,
  items,
  title,
}: {
  children?: ReactNode;
  isCurrent: (href: string) => boolean;
  items: typeof MORE_DESTINATIONS;
  title: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="more-group">
      <h3 className="more-group-title" id={headingId}>
        {title}
      </h3>
      <ul className="more-list">
        {items.map((item) => (
          <li key={item.section}>
            <Link
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="more-row"
              href={item.href}
            >
              <span aria-hidden="true" className="more-icon">
                <Icon name={item.icon} />
              </span>
              <span className="more-row-label">{item.label}</span>
              <Icon name="chevron-right" />
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </section>
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
 * Publica a altura da camada de avisos em `--shell-status-h` na casca. As
 * telas de altura cheia (`100dvh`) descontam esse valor: o aviso empurra a
 * tela sem fazê-la rolar. Sem aviso, a variável sai e vale o `0px` do CSS.
 * Medida antes da pintura, para a tela não piscar com a altura cheia.
 */
function useShellStatusHeight(
  frameRef: RefObject<HTMLDivElement | null>,
  layerRef: RefObject<HTMLDivElement | null>,
  visible: boolean,
) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const layer = layerRef.current;
    if (!visible || !frame || !layer) return;
    const publish = () =>
      frame.style.setProperty(
        "--shell-status-h",
        `${layer.getBoundingClientRect().height}px`,
      );
    publish();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(layer);
    return () => {
      observer?.disconnect();
      frame.style.removeProperty("--shell-status-h");
    };
  }, [frameRef, layerRef, visible]);
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
  onHide,
  text,
  title,
}: {
  href: string;
  linkLabel: string;
  /** Sem `onHide`, o aviso não se oculta (exclusão de conta agendada). */
  onHide?: () => void;
  text: string;
  title: string;
}) {
  return (
    <div
      className={clsx(
        "alert alert-error shell-status-banner",
        onHide && "is-hideable",
      )}
      role="alert"
    >
      <Icon name="alert" />
      <div className="shell-status-copy">
        <p className="alert-title">{title}</p>
        <p className="alert-text">{text}</p>
      </div>
      <div className="shell-status-actions">
        <Link className="btn btn-secondary shell-status-link" href={href}>
          {linkLabel}
        </Link>
        {onHide && (
          <button className="shell-status-hide" onClick={onHide} type="button">
            Ocultar por 1h
          </button>
        )}
      </div>
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
