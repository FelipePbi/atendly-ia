import Link from "next/link";
import { notFound } from "next/navigation";
import { AgendaScreen } from "@/features/calendar/AgendaScreen";
import type { AgendaScenario } from "@/features/calendar/types";
import { AuthScreen, type AuthScenario } from "@/features/auth/AuthScreen";
import { ConversationsScreen } from "@/features/conversations/ConversationsScreen";
import type { ConversationsScenario } from "@/features/conversations/types";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import type { DashboardScenario } from "@/features/dashboard/types";
import { DirectoryScreen } from "@/features/directory/DirectoryScreen";
import type { CustomerScenario } from "@/features/customers/types";
import type { ServiceScenario } from "@/features/services/types";
import { MigrationScreen } from "@/features/migration/MigrationScreen";
import type { MigrationScenario } from "@/features/migration/types";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import {
  isOnboardingScenario,
  onboardingOrder,
} from "@/features/onboarding/scenarios";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import type { SettingsScenario } from "@/features/settings/types";
import {
  SystemScreen,
  type SystemScenario,
} from "@/features/system/SystemScreen";
import { Brand } from "@/shared/ui/Brand";
import { Icon } from "@/shared/icons/Icon";

const authPreview: Record<string, AuthScenario> = {
  "auth-login": "login",
  "auth-signup": "signup",
  "auth-signup-errors": "signup-errors",
  "auth-forgot-password": "forgot-password",
  "auth-request-sent": "request-sent",
  "auth-new-password": "new-password",
  "auth-link-expired": "link-expired",
};
const dashboardPreview: Record<string, DashboardScenario> = {
  "dashboard-atendly": "atendly",
  "dashboard-external": "external",
  "dashboard-empty": "empty",
  "dashboard-loading": "loading",
  "dashboard-integration-error": "integration-error",
  "dashboard-whatsapp-disconnected": "whatsapp-disconnected",
};
const conversationsPreview: Record<string, ConversationsScenario> = {
  conversations: "list",
  "conversations-empty": "empty",
  "conversations-loading": "loading",
  "conversations-error": "error",
  "conversation-ai-active": "ai",
  "conversation-human": "human",
  "conversation-paused": "paused",
  "conversation-waiting": "waiting",
  "conversation-resolved": "resolved",
  "conversation-error": "detail-error",
};
const agendaPreview: Record<string, AgendaScenario> = {
  "agenda-atendly": "atendly",
  "agenda-external": "external",
  "agenda-empty": "empty",
  "agenda-loading": "loading",
  "agenda-integration-error": "integration-error",
  "agenda-sync-conflict": "sync-conflict",
  "appointment-new": "new",
  "appointment-detail": "detail",
  "appointment-reschedule": "reschedule",
  "appointment-cancel": "cancel",
  "agenda-block-time": "block-time",
};
const customerPreview: Record<string, CustomerScenario> = {
  customers: "list",
  "customers-external": "external",
  "customers-empty": "empty",
  "customers-loading": "loading",
  "customers-error": "error",
  "customer-detail": "detail",
  "customer-detail-external": "detail-external",
  "customer-new": "new",
};
const servicesPreview: Record<string, ServiceScenario> = {
  services: "list",
  "services-external": "external",
  "services-external-empty": "external-empty",
  "services-empty": "empty",
  "services-loading": "loading",
  "services-error": "error",
  "service-new": "new",
  "service-edit": "edit",
};
const settingsPreview: Record<string, SettingsScenario> = {
  settings: "hub",
  "settings-external": "hub-external",
  "settings-business": "business",
  "settings-ai": "ai",
  "settings-whatsapp": "whatsapp-connected",
  "settings-whatsapp-disconnected": "whatsapp-disconnected",
  "settings-whatsapp-reconnecting": "whatsapp-reconnecting",
  "settings-whatsapp-expired": "whatsapp-expired",
  "settings-whatsapp-error": "whatsapp-error",
  "settings-calendar": "calendar",
  "settings-calendar-external": "calendar-external",
  "settings-availability": "availability",
  "settings-account": "account",
  "settings-loading": "loading",
  "settings-error": "error",
};
const migrationPreview: Record<string, MigrationScenario> = {
  "migration-to-atendly-intro": "to-atendly-intro",
  "migration-to-external-intro": "to-external-intro",
  "migration-diagnosis": "diagnosis",
  "migration-diagnosis-external": "diagnosis-external",
  "migration-diagnosis-external-available": "diagnosis-external-available",
  "migration-conflicts": "conflicts",
  "migration-review": "review",
  "migration-progress": "progress",
  "migration-success": "success",
  "migration-partial": "partial",
  "migration-error": "error",
};
const systemPreview: Record<string, SystemScenario> = {
  "system-offline": "offline",
  "system-external-unavailable": "external-unavailable",
  "system-error": "error",
  "system-session-expired": "session-expired",
};
const onboardingPreviewMap: Record<string, (typeof onboardingOrder)[number]> = {
  "onboarding-business": "dados-do-negocio",
  "onboarding-calendar-source": "fonte-da-agenda",
  "onboarding-atendly-method": "agenda-atendly-metodo",
  "onboarding-atendly-confirm": "agenda-atendly-confirmar",
  "onboarding-atendly-ready": "agenda-atendly-pronta",
  "onboarding-service-name": "servico-nome",
  "onboarding-service-duration": "servico-duracao",
  "onboarding-service-price": "servico-preco",
  "onboarding-working-days": "dias-de-atendimento",
  "onboarding-hours": "horarios",
  "onboarding-import-connect": "importar-conectar",
  "onboarding-import-analysis": "importar-analisar",
  "onboarding-import-preview": "importar-previa",
  "onboarding-import-confirm": "importar-confirmar",
  "onboarding-import-progress": "importar-progresso",
  "onboarding-import-result": "importar-sucesso",
  "onboarding-import-partial": "importar-parcial",
  "onboarding-import-error": "importar-erro",
  "onboarding-external-intro": "minha-agenda-introducao",
  "onboarding-external-connect": "minha-agenda-conectar",
  "onboarding-external-authenticating": "minha-agenda-autenticando",
  "onboarding-external-connected": "minha-agenda-conectada",
  "onboarding-external-verify": "minha-agenda-verificar",
  "onboarding-external-services": "minha-agenda-servicos",
  "onboarding-external-clients": "minha-agenda-clientes",
  "onboarding-external-appointments": "minha-agenda-agendamentos",
  "onboarding-external-availability": "minha-agenda-disponibilidade",
  "onboarding-external-valid": "minha-agenda-valida",
  "onboarding-external-incomplete": "minha-agenda-incompleta",
  "onboarding-external-failure": "minha-agenda-falha",
  "onboarding-external-unavailable": "minha-agenda-indisponivel",
};
const referenceSlugs = [
  "atendly-design-system",
  "atendly-shell-desktop",
  "atendly-shell-mobile",
  "index",
];
const legalSlugs = ["auth-terms", "auth-privacy"];

export const previewSlugs = [
  ...Object.keys(authPreview),
  ...legalSlugs,
  ...Object.keys(onboardingPreviewMap),
  ...Object.keys(dashboardPreview),
  ...Object.keys(conversationsPreview),
  ...Object.keys(agendaPreview),
  ...Object.keys(customerPreview),
  ...Object.keys(servicesPreview),
  ...Object.keys(settingsPreview),
  ...Object.keys(migrationPreview),
  ...Object.keys(systemPreview),
  ...referenceSlugs,
];

const shellNavigation = [
  ["home", "Início", "/inicio"],
  ["chat", "Conversas", "/conversas"],
  ["calendar", "Agenda", "/agenda"],
  ["users", "Clientes", "/clientes"],
  ["briefcase", "Serviços", "/servicos"],
] as const;

function ReferenceSidebar() {
  return (
    <aside className="sidebar" aria-label="Navegação da aplicação">
      <div className="sidebar-brand">
        <Brand href="/_preview" />
      </div>
      <div className="business-context">
        <span className="avatar" aria-hidden="true">
          SA
        </span>
        <span className="business-name">
          <strong>Studio Aurora</strong>
          <span>Agenda Atendly oficial</span>
        </span>
      </div>
      <div className="wa-status status-line">
        <span className="status-dot" aria-hidden="true" />
        <span>WhatsApp conectado</span>
      </div>
      <nav className="nav" aria-label="Navegação principal">
        {shellNavigation.map(([icon, label, href], index) => (
          <Link
            className={`nav-item${index === 0 ? " is-active" : ""}`}
            href={href}
            key={label}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <nav className="nav" aria-label="Configurações">
          <Link className="nav-item" href="/configuracoes">
            <Icon name="settings" />
            <span>Configurações</span>
          </Link>
        </nav>
        <button className="account-button" type="button">
          <span className="avatar" aria-hidden="true">
            FM
          </span>
          <span className="business-name">
            <strong>Felipe Martins</strong>
            <span>Conta principal</span>
          </span>
          <Icon name="more" />
        </button>
      </div>
    </aside>
  );
}

function ShellBottomNavigation({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Navegação principal">
      {shellNavigation.slice(0, 3).map(([icon, label, href], index) => (
        <Link
          className={`bottom-nav-item${index === 0 ? " is-active" : ""}`}
          href={href}
          key={label}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </Link>
      ))}
      <button className="bottom-nav-item" type="button">
        <Icon name="more" />
        <span>Mais</span>
      </button>
    </nav>
  );
}

function DesktopShellPreview() {
  return (
    <div className="app-frame desktop-shell shell-reference">
      <ReferenceSidebar />
      <main className="desktop-main" id="main-content">
        <header className="shell-mobile-header">
          <Brand href="/_preview" />
          <span className="badge">Studio Aurora</span>
        </header>
        <div className="page shell-page">
          <header className="page-header shell-page-header">
            <div>
              <p className="eyebrow">Operação do negócio</p>
              <h1>Seu espaço de trabalho</h1>
              <p>
                Acesse agenda, conversas e cadastros sem perder o contexto
                operacional.
              </p>
            </div>
            <span className="badge">Dados demonstrativos</span>
          </header>
          <section className="operational-strip shell-operational">
            <span className="operational-icon" aria-hidden="true">
              <Icon name="shield" />
            </span>
            <div className="operational-copy">
              <strong>Operação disponível</strong>
              <span>
                WhatsApp conectado e Agenda Atendly definida como fonte oficial
                neste exemplo.
              </span>
            </div>
            <div className="operational-points">
              <span className="status-line">
                <span className="status-dot" aria-hidden="true" />
                WhatsApp
              </span>
              <span className="status-line">
                <span className="status-dot" aria-hidden="true" />
                Agenda
              </span>
            </div>
          </section>
          <section className="neutral-canvas shell-reference-canvas">
            <article className="neutral-panel shell-start-panel">
              <span className="badge">
                <Icon name="home" />
                Próxima ação
              </span>
              <h2>Organize o que precisa de atenção hoje</h2>
              <p className="muted shell-start-copy">
                Consulte horários na agenda ou abra conversas para atender
                clientes que precisam de uma pessoa.
              </p>
              <div className="shell-start-actions">
                <Link className="btn btn-primary" href="/agenda">
                  <Icon name="calendar" />
                  Abrir agenda
                </Link>
                <Link className="btn btn-secondary" href="/conversas">
                  Ver conversas
                </Link>
              </div>
            </article>
            <aside className="neutral-aside shell-context">
              <section className="card shell-context-card">
                <span className="shell-context-icon" aria-hidden="true">
                  <Icon name="calendar" />
                </span>
                <div>
                  <p className="caption muted">Fonte oficial</p>
                  <h3>Agenda Atendly</h3>
                  <p className="small muted">
                    Agendamentos e disponibilidade são controlados aqui.
                  </p>
                </div>
              </section>
              <nav
                className="list shell-shortcuts"
                aria-label="Atalhos do negócio"
              >
                {[
                  [
                    "users",
                    "Clientes",
                    "Cadastros, observações e histórico",
                    "/clientes",
                  ],
                  [
                    "briefcase",
                    "Serviços",
                    "Duração, preço e estado",
                    "/servicos",
                  ],
                ].map(([icon, title, copy, href]) => (
                  <Link className="list-item" href={href} key={title}>
                    <Icon name={icon as "users"} />
                    <span className="list-item-main">
                      <span className="list-item-title">{title}</span>
                      <span className="list-item-copy">{copy}</span>
                    </span>
                    <Icon name="chevron-right" className="shell-chevron" />
                  </Link>
                ))}
              </nav>
            </aside>
          </section>
        </div>
      </main>
      <ShellBottomNavigation className="shell-bottom-nav" />
    </div>
  );
}

function MobileShellPreview() {
  return (
    <div className="app-frame mobile-shell">
      <header className="mobile-header">
        <Brand href="/_preview" />
        <button
          className="icon-btn"
          type="button"
          aria-label="Abrir menu da conta"
        >
          <Icon name="user" />
        </button>
      </header>
      <div className="mobile-global-slot" aria-live="polite">
        <div className="alert shell-health" role="status">
          <Icon name="shield" />
          <div>
            <p className="alert-title">Tudo funcionando</p>
            <p className="alert-text">
              WhatsApp e Agenda Atendly estão conectados.
            </p>
          </div>
        </div>
      </div>
      <main className="mobile-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Studio Aurora</p>
            <h1>Base da aplicação</h1>
          </div>
        </header>
        <section className="mobile-neutral">
          <article className="card">
            <span className="badge">Shell responsivo</span>
            <div className="flow-motif mobile-flow" aria-hidden="true">
              <i />
              <span />
              <i />
              <span />
              <i />
            </div>
            <h2>Mobile com lógica própria</h2>
            <p className="small muted" style={{ marginTop: 8 }}>
              Header compacto, uma coluna e navegação fixa respeitando a safe
              area.
            </p>
          </article>
          <article className="list" aria-label="Referências do shell mobile">
            <div className="list-item is-static">
              <span className="avatar">
                <Icon name="shield" />
              </span>
              <div className="list-item-main">
                <p className="list-item-title">WhatsApp conectado</p>
                <p className="list-item-copy">
                  Atendimento automático disponível
                </p>
              </div>
              <span className="status-dot" aria-hidden="true" />
            </div>
            <div className="list-item is-static">
              <span className="avatar">
                <Icon name="calendar" />
              </span>
              <div className="list-item-main">
                <p className="list-item-title">Agenda Atendly</p>
                <p className="list-item-copy">Fonte oficial dos agendamentos</p>
              </div>
              <span className="badge">Oficial</span>
            </div>
          </article>
        </section>
      </main>
      <ShellBottomNavigation className="bottom-nav" />
    </div>
  );
}

function DesignSystemPreview() {
  const sectionHeading = (number: string, title: string, copy: string) => (
    <div className="ds-section-head">
      <div>
        <p className="eyebrow">{number}</p>
        <h2>{title}</h2>
      </div>
      <p>{copy}</p>
    </div>
  );
  return (
    <div className="ds-page">
      <header className="ds-topbar">
        <Brand href="/_preview/index" />
        <nav className="state-strip" aria-label="Pré-visualizações">
          <Link
            className="btn btn-tertiary"
            href="/_preview/atendly-shell-desktop"
          >
            Shell desktop
          </Link>
          <Link
            className="btn btn-secondary"
            href="/_preview/atendly-shell-mobile"
          >
            Shell mobile
          </Link>
        </nav>
      </header>
      <main className="ds-content">
        <section className="ds-intro">
          <div>
            <p className="eyebrow">Fundação visual · passo 1</p>
            <h1>Clareza operacional, sem ruído.</h1>
            <p>
              Kit de interface do Atendly para decisões rápidas, estados
              confiáveis e uso confortável no celular. Componentes compartilham
              tokens, medidas e feedback.
            </p>
          </div>
          <div className="flow-motif" aria-hidden="true">
            <i />
            <span />
            <i />
            <span />
            <i />
            <span />
            <i />
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "01 · Fundações",
            "Cores e superfícies",
            "Neutros dominam. Verde indica ação e operação saudável; violeta fica reservado à IA.",
          )}
          <div className="token-grid">
            {[
              ["App", "--bg"],
              ["Superfície", "--surface"],
              ["Texto", "--fg"],
              ["Texto secundário", "--muted"],
              ["Borda", "--border"],
              ["Ação", "--accent"],
            ].map(([name, color]) => (
              <article className="token" key={name}>
                <div
                  className="swatch"
                  style={
                    {
                      "--swatch": `var(${color})`,
                    } as React.CSSProperties
                  }
                />
                <strong>{name}</strong>
                <code>{color}</code>
              </article>
            ))}
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "02 · Tipografia",
            "Escala editorial compacta",
            "Inter mantém leitura direta em telas operacionais; mono aparece apenas em códigos e dados técnicos.",
          )}
          <div className="sample-grid">
            <div className="sample-col-6 sample-stack">
              <p className="type-sample-h1">Heading principal, 30/38</p>
              <h2>Seção clara, 24/32</h2>
              <h3>Título de componente, 18/26</h3>
            </div>
            <div className="sample-col-6 sample-stack">
              <p>
                Texto principal com 16 px e entrelinha confortável. Ideal para
                orientações curtas e conteúdo operacional.
              </p>
              <p className="small muted">
                Texto secundário, 14/20. Contexto sem competir com tarefa.
              </p>
              <p className="caption muted">LEGENDA DE SISTEMA · 12/16</p>
              <p className="mono small">8JQ2-KL9P</p>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "03 · Estrutura",
            "Espaço, forma e profundidade",
            "Grade de 8 px, raios contidos, bordas como padrão e ícones outline com traço único.",
          )}
          <div className="sample-grid foundation-specs">
            <article className="card sample-col-4">
              <p className="sample-label">Espaçamento</p>
              <div className="spacing-scale" aria-label="Escala de espaçamento">
                {[4, 8, 16, 24, 32, 48].map((space) => (
                  <span key={space}>
                    <i
                      style={{ "--space": `${space}px` } as React.CSSProperties}
                    />
                    <code>{space}</code>
                  </span>
                ))}
              </div>
            </article>
            <article className="card sample-col-4">
              <p className="sample-label">Raio e borda</p>
              <div className="radius-scale">
                <span className="radius-sample radius-input">12</span>
                <span className="radius-sample radius-card">16</span>
                <span className="radius-sample radius-panel">24</span>
              </div>
              <p className="caption muted">
                Borda neutra de 1 px organiza superfícies sem peso visual.
              </p>
            </article>
            <article className="card sample-col-4">
              <p className="sample-label">Elevação</p>
              <div className="elevation-scale">
                <span className="elevation-sample shadow-none">Base</span>
                <span className="elevation-sample shadow-medium">Menu</span>
                <span className="elevation-sample shadow-large">Modal</span>
              </div>
            </article>
            <article className="card sample-col-12 iconography-rule">
              <div>
                <p className="sample-label">Iconografia</p>
                <h3>Outline simples, 1,8 px</h3>
                <p className="small muted">
                  16 px em controles compactos; 20 px em navegação; 24 px em
                  ações principais. Sem emoji ou mistura com ícones preenchidos.
                </p>
              </div>
              <div
                className="state-strip"
                aria-label="Exemplos de ícones"
                role="img"
              >
                <Icon className="icon-16" name="check" />
                <Icon name="calendar" />
                <Icon className="icon-24" name="chat" />
              </div>
            </article>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "04 · Ações",
            "Botões e controles",
            "Uma ação primária por decisão. Todos possuem hover, foco, pressed e disabled.",
          )}
          <div className="sample-grid">
            <div className="sample-col-8">
              <p className="sample-label">Estados</p>
              <div className="state-strip">
                <button className="btn btn-primary" type="button">
                  Salvar alterações
                </button>
                <button className="btn btn-secondary" type="button">
                  Ver detalhes
                </button>
                <button className="btn btn-tertiary" type="button">
                  Cancelar
                </button>
                <button className="btn btn-danger" type="button">
                  Excluir
                </button>
                <button className="btn" disabled type="button">
                  Indisponível
                </button>
                <button className="btn btn-primary" type="button">
                  Testar loading
                </button>
              </div>
            </div>
            <div className="sample-col-4">
              <p className="sample-label">Ícone e tooltip</p>
              <div className="state-strip">
                <button
                  className="icon-btn"
                  aria-label="Adicionar"
                  type="button"
                >
                  <Icon name="plus" />
                </button>
                <button
                  className="icon-btn tooltip-trigger"
                  aria-label="Mais informações"
                  type="button"
                >
                  <Icon name="info" />
                  <span className="tooltip" role="tooltip">
                    Explicação curta e contextual
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label="Ação indisponível"
                  disabled
                  type="button"
                >
                  <Icon name="x" />
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "05 · Formulários",
            "Campos e seleção",
            "Rótulos persistentes, erros próximos ao campo e 48–52 px de altura.",
          )}
          <div className="sample-grid">
            <div className="sample-col-4 sample-stack">
              <label className="field">
                <span className="label">Nome do negócio</span>
                <input className="input" defaultValue="Studio Aurora" />
                <span className="field-help">
                  Como seus clientes reconhecem seu negócio.
                </span>
              </label>
              <label className="field field-error">
                <span className="label">Telefone</span>
                <input
                  className="input"
                  defaultValue="(11) 9987"
                  aria-invalid="true"
                />
                <span className="field-help" role="alert">
                  Informe um número com DDD.
                </span>
              </label>
            </div>
            <div className="sample-col-4 sample-stack">
              <label className="field">
                <span className="label">Senha</span>
                <span className="input-wrap">
                  <input
                    className="input input-with-action"
                    type="password"
                    defaultValue="atendly123"
                  />
                  <button
                    className="field-action"
                    type="button"
                    aria-label="Mostrar senha"
                  >
                    <Icon name="eye" />
                  </button>
                </span>
              </label>
              <label className="field field-success">
                <span className="label">E-mail</span>
                <span className="input-wrap">
                  <input
                    className="input"
                    type="email"
                    defaultValue="contato@studio.com"
                  />
                  <span className="field-action" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                </span>
                <span className="field-help">E-mail verificado.</span>
              </label>
            </div>
            <div className="sample-col-4 sample-stack">
              <label className="field">
                <span className="label">Segmento</span>
                <span className="input-wrap">
                  <select className="select" defaultValue="Beleza e estética">
                    <option>Beleza e estética</option>
                    <option>Saúde e bem-estar</option>
                    <option>Serviços profissionais</option>
                  </select>
                  <Icon className="select-icon" name="chevron-down" />
                </span>
              </label>
              <label className="field">
                <span className="label">Buscar</span>
                <span className="input-wrap">
                  <Icon className="field-icon" name="search" />
                  <input
                    className="input input-with-icon"
                    type="search"
                    placeholder="Nome ou telefone"
                  />
                </span>
              </label>
              <label className="field">
                <span className="label">Campo indisponível</span>
                <input
                  className="input"
                  defaultValue="Definido pela integração"
                  disabled
                />
              </label>
            </div>
            <div className="sample-col-6 state-strip">
              <label className="check">
                <input type="checkbox" defaultChecked />
                <span className="check-box" />
                <span>
                  <strong className="small">Receber avisos operacionais</strong>
                  <br />
                  <span className="caption muted">
                    Somente quando uma ação for necessária.
                  </span>
                </span>
              </label>
              <label className="radio">
                <input type="radio" name="tone" defaultChecked />
                <span className="radio-dot" />
                <span className="small">Profissional e objetiva</span>
              </label>
            </div>
            <div className="sample-col-6">
              <div
                className="choice-grid"
                role="radiogroup"
                aria-label="Fonte da agenda"
              >
                <article
                  className="choice-card is-selected"
                  role="radio"
                  aria-checked="true"
                  tabIndex={0}
                >
                  <span className="choice-check">
                    <Icon name="check" />
                  </span>
                  <h3>Agenda Atendly</h3>
                  <p className="small muted">
                    Configuração e controle no Atendly.
                  </p>
                </article>
                <article
                  className="choice-card"
                  role="radio"
                  aria-checked="false"
                  tabIndex={0}
                >
                  <span className="choice-check">
                    <Icon name="check" />
                  </span>
                  <h3>Minha Agenda</h3>
                  <p className="small muted">Continua como fonte oficial.</p>
                </article>
              </div>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "06 · Navegação",
            "Chips, abas e menu",
            "Seleção evidente por forma e peso, nunca apenas por cor.",
          )}
          <div className="sample-grid">
            <div className="sample-col-6 sample-stack">
              <div className="chip-row">
                <button className="chip is-active" type="button">
                  Todas
                </button>
                <button className="chip" type="button">
                  Não lidas
                </button>
                <button className="chip" type="button">
                  Aguardando você
                </button>
              </div>
              <div className="tab-list" role="tablist">
                <button
                  className="tab is-active"
                  role="tab"
                  aria-selected="true"
                >
                  Resumo
                </button>
                <button className="tab" role="tab" aria-selected="false">
                  Histórico
                </button>
                <button className="tab" role="tab" aria-selected="false">
                  Observações
                </button>
              </div>
            </div>
            <div className="sample-col-6">
              <div className="dropdown">
                <button className="btn btn-secondary" type="button">
                  Abrir menu <Icon name="chevron-down" />
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "07 · Status",
            "Badges, banners e alertas",
            "Ícone, texto e semântica trabalham juntos. Bloqueios nunca dependem de toast.",
          )}
          <div className="sample-stack">
            <div className="state-strip">
              <span className="badge badge-success">
                <span className="badge-dot" />
                Conectado
              </span>
              <span className="badge badge-ai">
                <Icon name="spark" />
                IA atendendo
              </span>
              <span className="badge badge-attention">
                <span className="badge-dot" />
                Aguardando você
              </span>
              <span className="badge badge-danger">
                <span className="badge-dot" />
                Desconectado
              </span>
              <span className="status-line">
                <span className="status-dot" />
                Operação normal
              </span>
            </div>
            <div className="banner banner-warning">
              <Icon name="alert" />
              <div>
                <p className="banner-title">WhatsApp desconectado</p>
                <p className="banner-text">
                  O atendimento automático está pausado até a reconexão.
                </p>
              </div>
              <button className="btn btn-secondary" type="button">
                Reconectar WhatsApp
              </button>
            </div>
            <div className="sample-grid">
              <div className="sample-col-4 alert alert-success">
                <Icon name="check" />
                <div>
                  <p className="alert-title">Alteração salva</p>
                  <p className="alert-text">Nova configuração já está ativa.</p>
                </div>
              </div>
              <div className="sample-col-4 alert alert-info">
                <Icon name="info" />
                <div>
                  <p className="alert-title">Fonte oficial</p>
                  <p className="alert-text">
                    Agenda Atendly gerencia os horários.
                  </p>
                </div>
              </div>
              <div className="sample-col-4 alert alert-error">
                <Icon name="alert" />
                <div>
                  <p className="alert-title">Não foi possível salvar</p>
                  <p className="alert-text">
                    Revise os campos e tente novamente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "08 · Conteúdo",
            "Cards e listas",
            "Cards agrupam contexto; linhas compactas preservam leitura repetida.",
          )}
          <div className="sample-grid">
            <article className="card metric-card sample-col-4">
              <div>
                <span className="badge badge-ai">Automação</span>
                <p className="metric-value">—</p>
              </div>
              <div>
                <strong className="small">Agendamentos feitos pela IA</strong>
                <p className="metric-context">
                  Dados aparecem quando disponíveis.
                </p>
              </div>
            </article>
            <article className="card hoverable sample-col-4">
              <h3>Superfície principal</h3>
              <p className="small muted" style={{ marginTop: 8 }}>
                Borda suave, raio de 16 px e sombra apenas no hover.
              </p>
            </article>
            <div className="sample-col-4 list">
              <div className="list-item">
                <span className="avatar">MA</span>
                <div className="list-item-main">
                  <p className="list-item-title">Marina Alves</p>
                  <p className="list-item-copy">
                    Última mensagem aparece nesta linha
                  </p>
                </div>
                <span className="badge badge-attention">Atenção</span>
              </div>
              <div className="list-item">
                <span className="avatar">RL</span>
                <div className="list-item-main">
                  <p className="list-item-title">Rafael Lima</p>
                  <p className="list-item-copy">Informação secundária curta</p>
                </div>
                <Icon className="muted" name="chevron-right" />
              </div>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "09 · Feedback",
            "Carregamento e estados",
            "Skeleton acompanha a forma final. Erro explica impacto e recuperação.",
          )}
          <div className="sample-grid">
            <div
              className="card sample-col-4 sample-stack"
              aria-label="Skeleton de carregamento"
            >
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div
                className="skeleton skeleton-line"
                style={{ width: "76%" }}
              />
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Progresso"
                aria-valuenow={64}
              >
                <div className="progress-bar" style={{ width: "64%" }} />
              </div>
              <div className="status-line">
                <span className="spinner spinner-accent" aria-hidden="true" />
                <span>Verificando conexão</span>
              </div>
            </div>
            <div className="card sample-col-4">
              <div className="empty-state">
                <div className="state-icon">
                  <Icon name="inbox" />
                </div>
                <h3>Nada por aqui ainda</h3>
                <p>O conteúdo será exibido quando houver atividade.</p>
                <button className="btn btn-secondary" type="button">
                  Voltar
                </button>
              </div>
            </div>
            <div className="card sample-col-4">
              <div className="error-state">
                <div className="state-icon">
                  <Icon name="alert" />
                </div>
                <h3>Não foi possível carregar</h3>
                <p>
                  Os dados podem estar desatualizados. Tente novamente antes de
                  seguir.
                </p>
                <button className="btn btn-secondary" type="button">
                  <Icon name="refresh" />
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="ds-section">
          {sectionHeading(
            "10 · Sobreposições",
            "Modal, confirmação e bottom sheet",
            "Confirmações deixam consequência explícita; fluxos complexos viram página no mobile.",
          )}
          <div className="state-strip">
            <button className="btn btn-secondary" type="button">
              Abrir modal
            </button>
            <button className="btn btn-danger" type="button">
              Abrir confirmação
            </button>
            <button className="btn btn-secondary" type="button">
              Abrir bottom sheet
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function PrototypeLegalScreen({ privacy = false }: { privacy?: boolean }) {
  const sections = privacy
    ? [
        [
          "1. Dados tratados",
          "A versão oficial deverá listar somente os dados realmente necessários para conta, atendimento e agendamento, com finalidade clara para cada categoria.",
        ],
        [
          "2. Como os dados são usados",
          "O texto definitivo deve explicar operação do produto, segurança, suporte e obrigações legais sem sugerir usos ainda não definidos.",
        ],
        [
          "3. Compartilhamento e integrações",
          "A política final deverá identificar serviços envolvidos e limites das integrações confirmadas, inclusive WhatsApp e fonte de agenda escolhida.",
        ],
        [
          "4. Direitos e contato",
          "Após validação jurídica, esta seção apresentará direitos aplicáveis, canais de solicitação e prazos de atendimento.",
        ],
      ]
    : [
        [
          "1. Sobre o serviço",
          "A Atendly é uma plataforma de atendimento e agendamento por WhatsApp. A descrição jurídica definitiva do serviço será incluída após revisão especializada.",
        ],
        [
          "2. Uso da conta",
          "A estrutura final deve explicar responsabilidades de acesso, proteção da senha e uso adequado da conta, sem linguagem técnica desnecessária.",
        ],
        [
          "3. Agendamentos e integrações",
          "O documento oficial deverá refletir a fonte de agenda escolhida e os limites reais de cada integração. Nenhuma capacidade ainda não confirmada é assumida neste protótipo.",
        ],
        [
          "4. Alterações e contato",
          "Versões futuras devem indicar data de vigência, processo de atualização e canal oficial de contato.",
        ],
      ];
  return (
    <main className="auth-layout">
      <aside className="auth-brand-panel">
        <Brand href="/_preview" />
        <div className="auth-story">
          <p className="eyebrow">
            {privacy ? "Privacidade compreensível" : "Informação clara"}
          </p>
          <h2>
            {privacy
              ? "Transparência sem jargão."
              : "Condições de uso em linguagem direta."}
          </h2>
          <p>
            {privacy
              ? "Estrutura preparada para explicar dados e escolhas com clareza."
              : "Esta tela demonstra a estrutura do documento dentro do fluxo de autenticação."}
          </p>
        </div>
        <div className="auth-flow" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </aside>
      <section className="auth-main legal-main">
        <article className="legal-document">
          <Link className="auth-back" href="/cadastro">
            ← Voltar ao cadastro
          </Link>
          <header>
            <h1>{privacy ? "Política de Privacidade" : "Termos de Uso"}</h1>
            <p>Versão de protótipo · conteúdo jurídico pendente de validação</p>
          </header>
          <div className="legal-note" role="note">
            <strong>Aviso do protótipo:</strong>{" "}
            {privacy
              ? "esta página define experiência e organização do conteúdo. Não substitui a política oficial."
              : "esta página valida hierarquia, leitura e navegação. Não substitui os Termos de Uso oficiais."}
          </div>
          {sections.map(([title, copy]) => (
            <section className="legal-section" key={title}>
              <h2>{title}</h2>
              <p>{copy}</p>
            </section>
          ))}
        </article>
      </section>
    </main>
  );
}

export function PreviewScreen({ slug }: { slug: string }) {
  if (slug in authPreview) return <AuthScreen scenario={authPreview[slug]} />;
  if (slug === "auth-terms") return <PrototypeLegalScreen />;
  if (slug === "auth-privacy") return <PrototypeLegalScreen privacy />;
  if (slug in dashboardPreview)
    return <DashboardScreen scenario={dashboardPreview[slug]} />;
  if (slug in conversationsPreview)
    return <ConversationsScreen scenario={conversationsPreview[slug]} />;
  if (slug in agendaPreview)
    return <AgendaScreen scenario={agendaPreview[slug]} />;
  if (slug in customerPreview)
    return (
      <DirectoryScreen area="customers" scenario={customerPreview[slug]} />
    );
  if (slug in servicesPreview)
    return <DirectoryScreen area="services" scenario={servicesPreview[slug]} />;
  if (slug in settingsPreview)
    return <SettingsScreen scenario={settingsPreview[slug]} />;
  if (slug in migrationPreview)
    return <MigrationScreen scenario={migrationPreview[slug]} />;
  if (slug in systemPreview)
    return <SystemScreen scenario={systemPreview[slug]} />;
  const onboarding = onboardingPreviewMap[slug];
  if (onboarding && isOnboardingScenario(onboarding))
    return <OnboardingScreen scenario={onboarding} />;
  if (slug === "atendly-design-system") return <DesignSystemPreview />;
  if (slug === "atendly-shell-desktop") return <DesktopShellPreview />;
  if (slug === "atendly-shell-mobile") return <MobileShellPreview />;
  if (slug === "index") return <PreviewIndex />;
  notFound();
}

export function PreviewIndex() {
  const stages = [
    {
      id: "acesso",
      step: "Passo 2",
      title: "Login e cadastro",
      copy: "Acesso seguro, conta nova, validação e recuperação de senha.",
      entries: [
        ["auth-login", "Login", "Entrada e recuperação"],
        ["auth-signup", "Cadastro", "Conta nova"],
        ["auth-forgot-password", "Recuperar senha", "Redefinição de acesso"],
      ],
      states: [
        ["auth-signup-errors", "Erros no cadastro"],
        ["auth-request-sent", "Solicitação enviada"],
        ["auth-new-password", "Nova senha"],
        ["auth-link-expired", "Link expirado"],
        ["auth-terms", "Termos de Uso"],
        ["auth-privacy", "Privacidade"],
      ],
    },
    {
      id: "onboarding-atendly",
      step: "Passo 3",
      title: "Onboarding · Agenda Atendly",
      copy: "Cadastro mobile-first para começar do zero ou copiar dados uma única vez.",
      entries: [
        ["onboarding-business", "Começar onboarding", "Negócio e agenda"],
        [
          "onboarding-atendly-method",
          "Do zero ou importar",
          "Escolha do método",
        ],
        [
          "onboarding-import-preview",
          "Prévia da importação",
          "Revisão dos dados",
        ],
      ],
      states: [
        ["onboarding-import-analysis", "Analisando"],
        ["onboarding-import-progress", "Em andamento"],
        ["onboarding-import-result", "Sucesso"],
        ["onboarding-import-partial", "Sucesso parcial"],
        ["onboarding-import-error", "Falha"],
      ],
    },
    {
      id: "onboarding-minha-agenda",
      step: "Passo 4",
      title: "Onboarding · Minha Agenda",
      copy: "Integração contínua mantendo Minha Agenda como fonte oficial dos agendamentos.",
      entries: [
        [
          "onboarding-external-intro",
          "Manter Minha Agenda",
          "Introdução e conexão",
        ],
        [
          "onboarding-external-verify",
          "Verificar categorias",
          "Dados encontrados",
        ],
        [
          "onboarding-external-valid",
          "Integração válida",
          "Fonte e limites claros",
        ],
      ],
      states: [
        ["onboarding-external-authenticating", "Autenticando"],
        ["onboarding-external-connected", "Conectada"],
        ["onboarding-external-incomplete", "Dados incompletos"],
        ["onboarding-external-failure", "Falha"],
        ["onboarding-external-unavailable", "Indisponível"],
      ],
    },
    {
      id: "inicio",
      step: "Passo 5",
      title: "Dashboard / Início",
      copy: "Agenda do dia, próximo atendimento, automação e atenção operacional.",
      entries: [
        ["dashboard-atendly", "Agenda Atendly", "Operação saudável"],
        ["dashboard-external", "Minha Agenda", "Fonte oficial"],
        [
          "dashboard-integration-error",
          "Problema na integração",
          "Bloqueio e recuperação",
        ],
      ],
      states: [
        ["dashboard-whatsapp-disconnected", "WhatsApp desconectado"],
        ["dashboard-empty", "Sem agendamentos"],
        ["dashboard-loading", "Carregando"],
      ],
    },
    {
      id: "conversas",
      step: "Passo 6",
      title: "Conversas",
      copy: "Busca, prioridade humana, histórico, contexto e controle explícito da IA.",
      entries: [
        ["conversations", "Lista de conversas", "Busca, filtros e pendências"],
        [
          "conversation-ai-active",
          "IA atendendo",
          "Histórico e assumir conversa",
        ],
        [
          "conversation-human",
          "Atendimento humano",
          "Composer e retorno para IA",
        ],
      ],
      states: [
        ["conversations-empty", "Lista vazia"],
        ["conversations-loading", "Carregando"],
        ["conversations-error", "Erro na lista"],
        ["conversation-waiting", "Aguardando você"],
        ["conversation-paused", "IA pausada"],
        ["conversation-error", "Erro operacional"],
      ],
    },
    {
      id: "agenda",
      step: "Passo 7",
      title: "Agenda",
      copy: "Visões Dia/Semana/Lista, origem explícita e alterações com confirmação segura.",
      entries: [
        [
          "agenda-atendly",
          "Agenda Atendly",
          "Controle completo e disponibilidade",
        ],
        [
          "agenda-external",
          "Minha Agenda",
          "Consulta e edição na fonte oficial",
        ],
        [
          "appointment-new",
          "Novo agendamento",
          "Validação antes da confirmação",
        ],
        ["appointment-detail", "Detalhe", "Origem, preço e histórico"],
        ["appointment-reschedule", "Reagendar", "Horário anterior protegido"],
        ["agenda-block-time", "Bloquear horário", "Verificação de conflitos"],
      ],
      states: [
        ["agenda-empty", "Dia vazio"],
        ["agenda-loading", "Carregando"],
        ["agenda-integration-error", "Integração offline"],
        ["agenda-sync-conflict", "Conflito de sincronização"],
        ["appointment-cancel", "Cancelamento"],
      ],
    },
    {
      id: "cadastros",
      step: "Passo 8",
      title: "Clientes e serviços",
      copy: "Informação útil para atendimento, gestão simples e permissões coerentes com a fonte oficial.",
      entries: [
        ["customers", "Clientes", "Busca, próximos horários e histórico"],
        [
          "customer-detail",
          "Detalhe do cliente",
          "Conversas, agendamentos e notas locais",
        ],
        ["services", "Serviços", "Agenda Atendly com controle completo"],
        [
          "services-external",
          "Serviços sincronizados",
          "Consulta e edição direcionada à origem",
        ],
        [
          "service-new",
          "Novo serviço",
          "Duração, preço e disponibilidade para a IA",
        ],
        [
          "customer-detail-external",
          "Cliente sincronizado",
          "Campos externos somente leitura, notas locais",
        ],
      ],
      states: [
        ["customers-empty", "Clientes vazios"],
        ["customers-loading", "Carregando clientes"],
        ["customers-error", "Erro de sincronização"],
        ["services-empty", "Serviços vazios"],
        ["services-external-empty", "Sem sincronização"],
        ["services-loading", "Carregando serviços"],
      ],
    },
    {
      id: "configuracoes",
      step: "Passo 9",
      title: "Configurações",
      copy: "Preferências essenciais, estados operacionais e mudanças críticas com revisão explícita.",
      entries: [
        ["settings", "Configurações", "Hub para Agenda Atendly"],
        [
          "settings-external",
          "Configurações · Minha Agenda",
          "Integração, sincronização e migração assistida",
        ],
        [
          "settings-business",
          "Negócio",
          "Nome, segmento, idioma, moeda e fuso",
        ],
        [
          "settings-ai",
          "Atendente virtual",
          "Dois tons e pausa com confirmação",
        ],
        ["settings-whatsapp", "WhatsApp", "Conexão, reconexão e diagnóstico"],
        [
          "settings-calendar",
          "Agenda e disponibilidade",
          "Fonte oficial e controle local",
        ],
        [
          "settings-availability",
          "Disponibilidade",
          "Semana habitual e validação de períodos",
        ],
        [
          "settings-account",
          "Conta e segurança",
          "Acesso, sessão e ações críticas",
        ],
      ],
      states: [
        ["settings-whatsapp-disconnected", "WhatsApp desconectado"],
        ["settings-whatsapp-reconnecting", "Reconectando"],
        ["settings-whatsapp-expired", "Sessão expirada"],
        ["settings-whatsapp-error", "Erro de conexão"],
        ["settings-loading", "Carregando"],
        ["settings-error", "Erro geral"],
      ],
    },
    {
      id: "estados-sistemicos",
      step: "Passo 10",
      title: "Migração e estados sistêmicos",
      copy: "Recuperação segura, fonte oficial preservada e mudança de agenda somente após validação explícita.",
      entries: [
        [
          "migration-to-atendly-intro",
          "Minha Agenda → Atendly",
          "Importação única e corte assistido",
        ],
        [
          "migration-to-external-intro",
          "Atendly → Minha Agenda",
          "Capacidade verificada antes de prometer transferência",
        ],
        [
          "migration-conflicts",
          "Conflitos",
          "Decisões agrupadas por categoria",
        ],
        [
          "migration-review",
          "Revisão final",
          "Confirmação consciente antes do corte",
        ],
        [
          "migration-progress",
          "Migração em andamento",
          "Fonte atual e limites operacionais visíveis",
        ],
        [
          "system-offline",
          "Operação offline",
          "Ações remotas bloqueadas sem falso sucesso",
        ],
      ],
      states: [
        ["migration-diagnosis-external-available", "Transferência disponível"],
        ["migration-diagnosis-external", "Sem transferência automática"],
        ["migration-success", "Migração concluída"],
        ["migration-partial", "Sucesso parcial"],
        ["migration-error", "Falha na migração"],
        ["system-session-expired", "Sessão expirada"],
        ["system-external-unavailable", "Minha Agenda indisponível"],
        ["system-error", "Erro inesperado"],
        ["conversation-waiting", "Ação humana necessária"],
        ["dashboard-whatsapp-disconnected", "WhatsApp desconectado"],
        ["dashboard-loading", "Skeleton / loading"],
        ["dashboard-empty", "Estado vazio"],
      ],
      disclosure: true,
    },
  ] as const;
  const modules = [
    ["acesso", "Acesso"],
    ["onboarding-atendly", "Agenda Atendly"],
    ["onboarding-minha-agenda", "Minha Agenda"],
    ["inicio", "Início"],
    ["conversas", "Conversas"],
    ["agenda", "Agenda"],
    ["cadastros", "Cadastros"],
    ["configuracoes", "Configurações"],
    ["estados-sistemicos", "Estados sistêmicos"],
  ] as const;
  const scope = [
    ["Fundação e acesso", "Design system, shells, autenticação e recuperação"],
    ["Configuração assistida", "Onboarding para Agenda Atendly e Minha Agenda"],
    ["Operação diária", "Início, conversas, agenda, clientes e serviços"],
    ["Controle e recuperação", "Configurações, migração e estados sistêmicos"],
  ] as const;
  return (
    <div className="project-index">
      <a className="index-skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <main className="index-shell" id="conteudo">
        <header className="index-hero">
          <div className="index-hero-copy">
            <Brand href="/_preview/index" />
            <div className="index-hero-heading">
              <p className="eyebrow">Protótipo completo · Passos 1–10</p>
              <h1>Do primeiro acesso à operação diária</h1>
              <p className="index-lede">
                Uma jornada responsiva para configurar a agenda, conectar o
                WhatsApp, atender conversas e manter o negócio em operação.
              </p>
            </div>
            <div className="index-hero-actions">
              <Link className="btn btn-primary" href="/_preview/auth-login">
                Começar pelo login
              </Link>
              <a className="index-text-link" href="#jornada">
                Ver todas as telas
                <Icon name="chevron-right" />
              </a>
            </div>
          </div>
          <aside className="index-scope" aria-labelledby="scope-title">
            <div className="index-scope-meta">
              <span className="index-status">
                <span aria-hidden="true" />
                Protótipo navegável
              </span>
              <span>10 passos · 9 módulos</span>
            </div>
            <h2 id="scope-title">O que já está disponível</h2>
            <ul>
              {scope.map(([title, copy]) => (
                <li key={title}>
                  <Icon name="check" />
                  <span>
                    <strong>{title}</strong>
                    <small>{copy}</small>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </header>
        <nav
          className="index-module-nav"
          aria-label="Ir para um módulo do protótipo"
        >
          <span className="index-module-label">Módulos</span>
          {modules.map(([id, label], index) => (
            <a href={`#${id}`} key={id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {label}
            </a>
          ))}
        </nav>
        <section
          className="index-foundations"
          aria-labelledby="foundations-title"
        >
          <div className="index-section-heading">
            <div>
              <p className="eyebrow">Passo 1</p>
              <h2 id="foundations-title">Fundação reutilizável</h2>
            </div>
            <p>
              Componentes e estruturas que mantêm a experiência consistente no
              desktop e no mobile.
            </p>
          </div>
          <nav
            className="index-utility-grid"
            aria-label="Artefatos de fundação"
          >
            {[
              [
                "atendly-design-system",
                "Componentes",
                "Tokens, formulários e estados",
              ],
              [
                "atendly-shell-desktop",
                "Shell desktop",
                "Sidebar e área de conteúdo",
              ],
              [
                "atendly-shell-mobile",
                "Shell mobile",
                "Header, navegação e menu Mais",
              ],
            ].map(([slug, title, copy]) => (
              <Link
                className="index-utility-link"
                href={`/_preview/${slug}`}
                key={slug}
              >
                <span>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                </span>
                <Icon name="chevron-right" />
              </Link>
            ))}
          </nav>
        </section>
        <section
          className="index-journey"
          id="jornada"
          aria-labelledby="journey-title"
        >
          <div className="index-section-heading index-journey-heading">
            <div>
              <p className="eyebrow">Jornada principal</p>
              <h2 id="journey-title">Percorra o produto por etapa</h2>
            </div>
            <p>
              Cada grupo começa pelo cenário principal e mantém variações e
              falhas como estados secundários.
            </p>
          </div>
          <ol className="index-stage-list">
            {stages.map((stage, index) => {
              const stateLinks = (
                <nav
                  className="index-state-links"
                  aria-label={`Estados de ${stage.title}`}
                >
                  <span>Estados</span>
                  {stage.states.map(([slug, label]) => (
                    <Link href={`/_preview/${slug}`} key={slug}>
                      {label}
                    </Link>
                  ))}
                </nav>
              );
              return (
                <li className="index-stage" id={stage.id} key={stage.id}>
                  <div className="index-stage-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="index-stage-content">
                    <div className="index-stage-heading">
                      <div>
                        <p className="eyebrow">{stage.step}</p>
                        <h3>{stage.title}</h3>
                      </div>
                      <p>{stage.copy}</p>
                    </div>
                    <nav
                      className="index-entry-grid"
                      aria-label={`Telas principais de ${stage.title}`}
                    >
                      {stage.entries.map(([slug, title, copy]) => (
                        <Link href={`/_preview/${slug}`} key={slug}>
                          <span>
                            <strong>{title}</strong>
                            <small>{copy}</small>
                          </span>
                          <Icon name="chevron-right" />
                        </Link>
                      ))}
                    </nav>
                    {"disclosure" in stage && stage.disclosure ? (
                      <details className="index-state-disclosure">
                        <summary>Ver 12 estados e resultados</summary>
                        {stateLinks}
                      </details>
                    ) : (
                      stateLinks
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <footer className="index-footer">
          <span>Atendly · Protótipo de produto</span>
          <span>Escopo atual: passos 1–10</span>
        </footer>
      </main>
    </div>
  );
}
