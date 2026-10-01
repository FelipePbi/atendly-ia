import type { IconName } from "@/shared/icons/Icon";

export type PlatformSection =
  | "agenda"
  | "clientes"
  | "config-agenda"
  | "config-conversas"
  | "configuracoes"
  | "conta"
  | "conversas"
  | "disponibilidade"
  | "ia"
  | "importacao"
  | "inicio"
  | "negocio"
  | "notificacoes"
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

/** Todo valor de `ShellModule`, em runtime — para quem precisa iterar (Goal058/WU-01). */
export const SHELL_MODULES: readonly ShellModule[] = [
  "agenda",
  "conversations",
  "dashboard",
  "directory",
  "migration",
  "settings",
  "system",
];

export type NavDestination = {
  href: string;
  icon: IconName;
  label: string;
  section: PlatformSection;
};

/** Ordem e conteúdo da sidebar (tablet/notebook/desktop): cinco destinos + Configurações. */
export const SIDEBAR_DESTINATIONS: NavDestination[] = [
  { href: "/inicio", icon: "nav-home", label: "Início", section: "inicio" },
  {
    href: "/conversas",
    icon: "nav-chat",
    label: "Conversas",
    section: "conversas",
  },
  {
    href: "/agenda",
    icon: "nav-calendar",
    label: "Agenda",
    section: "agenda",
  },
  {
    href: "/clientes",
    icon: "nav-user",
    label: "Clientes",
    section: "clientes",
  },
  {
    href: "/servicos",
    icon: "nav-list",
    label: "Serviços",
    section: "servicos",
  },
];

export const SETTINGS_DESTINATION: NavDestination = {
  href: "/configuracoes",
  icon: "nav-sliders",
  label: "Configurações",
  section: "configuracoes",
};

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
 * Notificações (Goal022/WU-08): entrada de chrome, não um sexto destino
 * primário — vive na sidebar (tablet/notebook/desktop) e dentro de "Mais" no
 * mobile, nunca como quinta aba do bottom nav.
 */
export const NOTIFICATIONS_DESTINATION: NavDestination = {
  href: "/notificacoes",
  icon: "inbox",
  label: "Notificações",
  section: "notificacoes",
};

/**
 * Destinos que só aparecem dentro do "Mais" no mobile: Notificações,
 * Serviços e o que a Especificação das Telas lista sob "Mais / Configurações".
 */
export const MORE_DESTINATIONS: NavDestination[] = [
  NOTIFICATIONS_DESTINATION,
  { href: "/servicos", icon: "briefcase", label: "Serviços", section: "servicos" },
  { href: "/configuracoes/negocio", icon: "info", label: "Negócio", section: "negocio" },
  {
    href: "/configuracoes/agenda",
    icon: "calendar",
    label: "Agenda",
    section: "config-agenda",
  },
  {
    href: "/configuracoes/disponibilidade",
    icon: "clock",
    label: "Disponibilidade",
    section: "disponibilidade",
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
  {
    href: "/configuracoes/conversas",
    icon: "chat",
    label: "Conversas",
    section: "config-conversas",
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

const NOTIFICATIONS_BADGE_CAP = 9;

/**
 * Teto de exibição do contador de não lidas do chrome: acima do teto, mostra
 * `"9+"` em vez do número exato — o contador é um sinal de atenção, não um
 * substituto da central. `null` quando não há nada para destacar.
 */
export function notificationsBadgeLabel(unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  if (unreadCount > NOTIFICATIONS_BADGE_CAP) return `${NOTIFICATIONS_BADGE_CAP}+`;
  return String(unreadCount);
}
