import type { IconName } from "@/shared/icons/Icon";

export type PlatformSection =
  | "agenda"
  | "clientes"
  | "config-agenda"
  | "configuracoes"
  | "conta"
  | "conversas"
  | "ia"
  | "importacao"
  | "inicio"
  | "negocio"
  | "servicos"
  | "whatsapp";

export type ShellModule =
  | "agenda"
  | "conversations"
  | "dashboard"
  | "directory"
  | "migration"
  | "settings"
  | "system";

export type NavDestination = {
  href: string;
  icon: IconName;
  label: string;
  section: PlatformSection;
};

/** Ordem e conteúdo da sidebar (tablet/notebook/desktop): cinco destinos + Configurações. */
export const SIDEBAR_DESTINATIONS: NavDestination[] = [
  { href: "/inicio", icon: "home", label: "Início", section: "inicio" },
  { href: "/conversas", icon: "chat", label: "Conversas", section: "conversas" },
  { href: "/agenda", icon: "calendar", label: "Agenda", section: "agenda" },
  { href: "/clientes", icon: "users", label: "Clientes", section: "clientes" },
  {
    href: "/servicos",
    icon: "briefcase",
    label: "Serviços",
    section: "servicos",
  },
];

/**
 * Os quatro destinos com aba própria no bottom nav mobile. O quinto lugar é
 * "Mais" (sintético, sem `section` fixa): abre a lista com o resto dos
 * destinos do produto, em vez de disputar espaço com uma aba própria.
 */
export const MOBILE_TAB_SECTIONS: PlatformSection[] = [
  "inicio",
  "conversas",
  "agenda",
  "clientes",
];

/**
 * Destinos que só aparecem dentro do "Mais" no mobile: Serviços e o que a
 * Especificação das Telas lista sob "Mais / Configurações".
 */
export const MORE_DESTINATIONS: NavDestination[] = [
  { href: "/servicos", icon: "briefcase", label: "Serviços", section: "servicos" },
  { href: "/configuracoes/negocio", icon: "info", label: "Negócio", section: "negocio" },
  {
    href: "/configuracoes/agenda",
    icon: "calendar",
    label: "Agenda",
    section: "config-agenda",
  },
  { href: "/configuracoes/ia", icon: "spark", label: "IA", section: "ia" },
  {
    href: "/configuracoes/whatsapp",
    icon: "chat",
    label: "WhatsApp",
    section: "whatsapp",
  },
  {
    href: "/importacao",
    icon: "refresh",
    label: "Importação",
    section: "importacao",
  },
  { href: "/configuracoes/conta", icon: "user", label: "Conta", section: "conta" },
];

export function isMobileTab(section: PlatformSection): boolean {
  return MOBILE_TAB_SECTIONS.includes(section);
}

/** "Mais" fica marcado como ativo para qualquer destino fora das quatro abas. */
export function isMoreActive(active: PlatformSection): boolean {
  return !isMobileTab(active);
}

export function isDestinationActive(
  destination: PlatformSection,
  active: PlatformSection,
): boolean {
  return destination === active;
}

export type ShellContextualAction = {
  href: string;
  icon: IconName;
  label: string;
};
