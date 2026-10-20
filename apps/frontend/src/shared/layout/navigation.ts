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
  | "faturamento"
  | "ia"
  | "importacao"
  | "inicio"
  | "negocio"
  | "notificacoes"
  | "retorno"
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

/**
 * Ordem e conteúdo da sidebar (tablet/notebook/desktop): sete destinos +
 * Configurações. Retorno (D-210) vem logo depois de Clientes; Faturamento
 * (D-177), depois de Serviços.
 */
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
    href: "/retorno",
    icon: "nav-return",
    label: "Retorno",
    section: "retorno",
  },
  {
    href: "/servicos",
    icon: "nav-list",
    label: "Serviços",
    section: "servicos",
  },
  {
    href: "/faturamento",
    icon: "nav-chart",
    label: "Faturamento",
    section: "faturamento",
  },
];

export const SETTINGS_DESTINATION: NavDestination = {
  href: "/configuracoes",
  icon: "nav-sliders",
  label: "Configurações",
  section: "configuracoes",
};

/**
 * Os quatro destinos com aba própria no bottom nav do celular. O quinto lugar
 * é "Mais" (sintético, sem `section` fixa): abre a lista com o resto dos
 * destinos do produto. Em janelas maiores cabem mais abas (D-194).
 */
export const MOBILE_TAB_SECTIONS: PlatformSection[] = [
  "inicio",
  "conversas",
  "agenda",
  "clientes",
];

/**
 * Notificações (Goal022/WU-08): entrada de chrome, não um sexto destino
 * primário — vive na sidebar (a partir de 1100 px) e, abaixo disso, dentro
 * de "Mais" no celular; na barra inferior só quando tudo cabe (D-194).
 */
export const NOTIFICATIONS_DESTINATION: NavDestination = {
  href: "/notificacoes",
  icon: "inbox",
  label: "Notificações",
  section: "notificacoes",
};

/**
 * Destinos que só aparecem dentro do "Mais" no mobile: Notificações,
 * Serviços, Faturamento (D-177) e o que a Especificação das Telas lista sob
 * "Mais / Configurações".
 */
export const MORE_DESTINATIONS: NavDestination[] = [
  NOTIFICATIONS_DESTINATION,
  { href: "/retorno", icon: "nav-return", label: "Retorno", section: "retorno" },
  { href: "/servicos", icon: "briefcase", label: "Serviços", section: "servicos" },
  {
    href: "/faturamento",
    icon: "nav-chart",
    label: "Faturamento",
    section: "faturamento",
  },
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

/**
 * Barra inferior (abaixo de 1100 px) dinâmica (D-194): os destinos em ordem
 * de prioridade. Entram na barra, da esquerda para a direita, quantos couberem
 * na largura da janela; o resto vai para o "Mais". As quatro primeiras são as
 * abas do celular (`MOBILE_TAB_SECTIONS`).
 */
export const BOTTOM_NAV_DESTINATIONS: NavDestination[] = [
  ...SIDEBAR_DESTINATIONS,
  NOTIFICATIONS_DESTINATION,
  SETTINGS_DESTINATION,
];

/**
 * Quantos destinos de `BOTTOM_NAV_DESTINATIONS` a barra mostra a partir de
 * cada largura de janela, com cada vaga de pelo menos ~85 px (rótulo inteiro,
 * alvo de toque folgado). Os mesmos degraus estão em `avenly.css`
 * (`data-bottom-from`), que decide o que aparece já na primeira pintura;
 * `tests/bottom-nav-fit.test.ts` confere que os dois não divergem.
 */
export const BOTTOM_NAV_TIERS: ReadonlyArray<{
  minWidth: number;
  tabs: number;
}> = [
  { minWidth: 0, tabs: MOBILE_TAB_SECTIONS.length },
  { minWidth: 600, tabs: 6 },
  { minWidth: 768, tabs: 8 },
  { minWidth: 900, tabs: BOTTOM_NAV_DESTINATIONS.length },
];

/** Quantos destinos cabem na barra numa janela de `width` px. */
export function bottomNavTabCount(width: number): number {
  let tabs = BOTTOM_NAV_TIERS[0]?.tabs ?? MOBILE_TAB_SECTIONS.length;
  for (const tier of BOTTOM_NAV_TIERS) {
    if (width >= tier.minWidth) tabs = tier.tabs;
  }
  return tabs;
}

/** A menor largura de janela em que o destino `section` entra na barra. */
export function bottomNavMinWidth(section: PlatformSection): number {
  const index = BOTTOM_NAV_DESTINATIONS.findIndex(
    (item) => item.section === section,
  );
  const tier = BOTTOM_NAV_TIERS.find((candidate) => index < candidate.tabs);
  return tier?.minWidth ?? Number.POSITIVE_INFINITY;
}

/** Os destinos que não couberam na barra: os atalhos do "Mais". */
export function bottomNavOverflow(tabCount: number): NavDestination[] {
  return BOTTOM_NAV_DESTINATIONS.slice(tabCount);
}

/** Tudo coube: no lugar do "Mais" a barra mostra "Conta" (conta e Sair). */
export function bottomNavFitsAll(tabCount: number): boolean {
  return tabCount >= BOTTOM_NAV_DESTINATIONS.length;
}

/**
 * O destino da barra que representa a seção ativa: as telas de dentro de
 * Configurações (Negócio, IA, Conta...) acendem "Configurações".
 */
export function bottomNavSectionOf(active: PlatformSection): PlatformSection {
  return BOTTOM_NAV_DESTINATIONS.some((item) => item.section === active)
    ? active
    : SETTINGS_DESTINATION.section;
}

/**
 * "Mais" fica marcado como ativo quando a seção ativa é um dos destinos que
 * não couberam na barra. Sem `tabCount`, vale a barra do celular (4 abas).
 */
export function isMoreActive(
  active: PlatformSection,
  tabCount: number = MOBILE_TAB_SECTIONS.length,
): boolean {
  const section = bottomNavSectionOf(active);
  return bottomNavOverflow(tabCount).some((item) => item.section === section);
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
  if (unreadCount > NOTIFICATIONS_BADGE_CAP)
    return `${NOTIFICATIONS_BADGE_CAP}+`;
  return String(unreadCount);
}

/**
 * O que o leitor de tela ouve junto do contador de "Conversas" (D-195): o
 * número sozinho, colado no nome do destino, não diz do que é.
 */
export function unreadConversationsLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 conversa com mensagem nova"
    : `${count} conversas com mensagem nova`;
}
