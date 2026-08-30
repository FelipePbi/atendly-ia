"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { Icon, type IconName } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Brand } from "@/shared/ui/Brand";
import { Dialog } from "@/shared/ui/Dialog";

export type PlatformSection =
  "inicio" | "conversas" | "agenda" | "clientes" | "servicos" | "configuracoes";
export type ShellModule =
  | "dashboard"
  | "conversations"
  | "agenda"
  | "directory"
  | "settings"
  | "migration"
  | "system";

const navigation: {
  href: string;
  icon: IconName;
  label: string;
  section: PlatformSection;
}[] = [
  { href: "/inicio", icon: "home", label: "Início", section: "inicio" },
  {
    href: "/conversas",
    icon: "chat",
    label: "Conversas",
    section: "conversas",
  },
  { href: "/agenda", icon: "calendar", label: "Agenda", section: "agenda" },
  { href: "/clientes", icon: "users", label: "Clientes", section: "clientes" },
  {
    href: "/servicos",
    icon: "briefcase",
    label: "Serviços",
    section: "servicos",
  },
];

type AppShellProps = {
  active: PlatformSection;
  children: ReactNode;
  module: ShellModule;
  source?: "atendly" | "external";
  whatsapp?: "connected" | "disconnected";
  loading?: boolean;
  mainClassName?: string;
  showBottomNav?: boolean;
  showMobileHeader?: boolean;
  attention?: boolean;
};

export function AppShell({
  active,
  children,
  module,
  source = "atendly",
  whatsapp = "connected",
  loading = false,
  mainClassName,
  showBottomNav = true,
  showMobileHeader = true,
  attention = false,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, setUnauthenticated } = useProductRuntime();
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const styleModule =
    module === "system" || module === "migration" ? "settings" : module;
  const shellClass = `${styleModule}-shell`;
  const mobileHeaderClass =
    module === "dashboard"
      ? "dashboard-mobile-header"
      : `${styleModule}-mobile-header`;
  const bottomNavClass =
    module === "dashboard"
      ? "dashboard-bottom-nav"
      : `${styleModule}-bottom-nav`;
  const mainClass = mainClassName ?? `${styleModule}-main`;
  const officialSource =
    source === "external" ? "Minha Agenda" : "Agenda Atendly";
  const systemAttention = module === "system";
  const mobileAttention = systemAttention || attention;
  const compactAccount = ["settings", "migration", "system"].includes(module);
  const preview = pathname.startsWith("/_preview");
  const sourceContext = preview
    ? "Ambiente de demonstração"
    : `${officialSource} oficial`;
  const businessName = preview
    ? "Studio Aurora"
    : (session?.businessProfile?.businessName ??
      session?.tenant.name ??
      "Seu negócio");
  const userLabel = preview
    ? "Felipe Martins"
    : (session?.user.email ?? "Conta principal");

  async function logout() {
    if (preview) {
      router.push("/_preview/auth-login");
      return;
    }
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
              <span>{sourceContext}</span>
            </span>
          </div>
          <div className="wa-status status-line">
            <span
              className={clsx(
                "status-dot",
                whatsapp === "disconnected" && "danger",
                systemAttention && "warning",
              )}
              aria-hidden="true"
            />
            <span>
              {loading
                ? "Verificando conexões"
                : systemAttention
                  ? "Operação requer atenção"
                  : `WhatsApp ${whatsapp === "connected" ? "conectado" : "desconectado"}`}
            </span>
          </div>
          <nav className="nav" aria-label="Navegação principal">
            {navigation.map((item) => (
              <Link
                className={clsx(
                  "nav-item",
                  item.section === active && "is-active",
                )}
                href={item.href}
                key={item.section}
                aria-current={item.section === active ? "page" : undefined}
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
              >
                <Icon name="settings" />
                <span>Configurações</span>
              </Link>
            </nav>
            {!loading && (
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
            )}
          </div>
        </aside>
        <main className={mainClass} id="main-content" tabIndex={-1}>
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
        {showBottomNav && (
          <nav className={bottomNavClass} aria-label="Navegação principal">
            {navigation.slice(0, 3).map((item) => (
              <Link
                className={clsx(
                  "bottom-nav-item",
                  item.section === active && "is-active",
                )}
                href={item.href}
                key={item.section}
                aria-current={item.section === active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
            <button
              className={clsx(
                "bottom-nav-item",
                ["clientes", "servicos", "configuracoes"].includes(active) &&
                  "is-active",
              )}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
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
          <Link className="menu-item" href="/clientes">
            <Icon name="users" />
            Clientes
          </Link>
          <Link className="menu-item" href="/servicos">
            <Icon name="briefcase" />
            Serviços
          </Link>
          <Link className="menu-item" href="/configuracoes">
            <Icon name="settings" />
            Configurações
          </Link>
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
        <p className="sr-only">
          Fonte oficial:{" "}
          {source === "atendly" ? "Agenda Atendly" : "Minha Agenda"}
        </p>
      </Dialog>
    </>
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
