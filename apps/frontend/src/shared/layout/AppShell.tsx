"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { useSystemStatus } from "@/shared/runtime/systemStatus";
import { Brand } from "@/shared/ui/Brand";
import { Dialog } from "@/shared/ui/Dialog";

import {
  isDestinationActive,
  isMobileTab,
  isMoreActive,
  MORE_DESTINATIONS,
  SIDEBAR_DESTINATIONS,
} from "./navigation";
import type { ShellConfig } from "./ShellConfig";

export type { PlatformSection, ShellContextualAction, ShellModule } from "./navigation";

export type AppShellProps = ShellConfig & {
  children: ReactNode;
};

export function AppShell({
  action,
  active,
  attention = false,
  children,
  loading = false,
  mainClassName,
  module,
  showBottomNav = true,
  showMobileHeader = true,
  source = "atendly",
  title,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, setUnauthenticated } = useProductRuntime();
  const status = useSystemStatus();
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const styleModule =
    module === "system" || module === "migration" ? "settings" : module;
  const shellClass = styleModule ? `${styleModule}-shell` : "platform-shell";
  const mobileHeaderClass =
    module === "dashboard"
      ? "dashboard-mobile-header"
      : `${styleModule ?? "platform"}-mobile-header`;
  const bottomNavClass =
    module === "dashboard"
      ? "dashboard-bottom-nav"
      : `${styleModule ?? "platform"}-bottom-nav`;
  const mainClass = mainClassName ?? `${styleModule ?? "platform"}-main`;
  const officialSource =
    source === "external" ? "Minha Agenda" : "Agenda Atendly";
  const systemAttention = module === "system";
  const mobileAttention = systemAttention || attention;
  const compactAccount = ["settings", "migration", "system"].includes(
    module ?? "",
  );
  const businessName =
    session?.businessProfile?.businessName ??
    session?.tenant.name ??
    "Seu negócio";
  const userLabel = session?.user.email ?? "Conta principal";

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
            <Brand />
          </div>
          <div className="business-context">
            <span className="avatar" aria-hidden="true">
              {initials(businessName)}
            </span>
            <span className="business-name">
              <strong>{businessName}</strong>
              <span>{officialSource} oficial</span>
            </span>
          </div>
          <StatusLine
            label="WhatsApp"
            view={status.whatsappView}
            activeCopy="WhatsApp conectado"
            offCopy="WhatsApp desconectado"
          />
          <StatusLine
            label="IA"
            view={status.aiView}
            activeCopy="IA ativa"
            offCopy="IA desligada"
          />
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
          </nav>
          <div className="sidebar-bottom">
            <nav className="nav">
              <Link
                className={clsx(
                  "nav-item",
                  active === "configuracoes" && "is-active",
                )}
                href="/configuracoes"
                aria-current={active === "configuracoes" ? "page" : undefined}
              >
                <Icon name="settings" />
                <span>Configurações</span>
              </Link>
            </nav>
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
                className="account-button"
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                aria-expanded={accountOpen}
                aria-controls="account-menu"
              >
                <span className="avatar" aria-hidden="true">
                  {initials(userLabel)}
                </span>
                <span className="business-name">
                  <strong>{userLabel}</strong>
                  <span>Conta proprietária</span>
                </span>
                <Icon name={compactAccount ? "chevron-right" : "more"} />
              </button>
              {accountOpen && (
                <div className="menu" id="account-menu">
                  <Link className="menu-item" href="/configuracoes/conta">
                    Minha conta
                  </Link>
                  <span className="menu-item" aria-disabled="true">
                    Ajuda
                  </span>
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
          {showMobileHeader && (
            <header className={mobileHeaderClass}>
              <Brand />
              <span
                className={clsx(
                  "badge",
                  attention && "badge-danger",
                  systemAttention && "badge-attention",
                )}
              >
                {loading
                  ? "Carregando"
                  : module === "migration"
                    ? officialSource
                    : mobileAttention
                      ? "Atenção"
                      : businessName}
              </span>
            </header>
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
              <Icon name="more" />
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
            </Link>
          ))}
          <span className="menu-item" aria-disabled="true">
            <Icon name="help" />
            Ajuda
          </span>
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

function StatusLine({
  activeCopy,
  label,
  offCopy,
  view,
}: {
  activeCopy: string;
  label: string;
  offCopy: string;
  view: "active" | "loading" | "off" | "unknown";
}) {
  const copy =
    view === "loading"
      ? `Verificando ${label}`
      : view === "unknown"
        ? `${label} não confirmado`
        : view === "active"
          ? activeCopy
          : offCopy;
  return (
    <div className="wa-status status-line" role="status">
      <span
        className={clsx(
          "status-dot",
          view === "off" && "danger",
          (view === "loading" || view === "unknown") && "neutral",
        )}
        aria-hidden="true"
      />
      <span>{copy}</span>
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
