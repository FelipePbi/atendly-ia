"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { Icon, type IconName } from "@/shared/icons/Icon";
import { AppShell } from "@/shared/layout/AppShell";
import { Dialog } from "@/shared/ui/Dialog";

import { ProductSettingsScreen } from "./ProductSettingsScreen";
import type { SettingsScenario } from "./types";

function Page({
  title,
  description,
  children,
  badge,
  back = true,
}: {
  title: string;
  description: string;
  children: ReactNode;
  badge?: ReactNode;
  back?: boolean;
}) {
  return (
    <section className="settings-page">
      {back && (
        <Link className="settings-back" href="/configuracoes">
          <Icon name="chevron-right" />
          Configurações
        </Link>
      )}
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {badge}
      </header>
      {children}
    </section>
  );
}

function SettingsHub({ external }: { external: boolean }) {
  const sections: {
    href: string;
    icon: IconName;
    title: string;
    copy: string;
    meta: ReactNode;
    wide?: boolean;
  }[] = [
    {
      href: "/configuracoes/negocio",
      icon: "briefcase",
      title: "Negócio",
      copy: "Nome, segmento, idioma, moeda e fuso usados pela Atendly.",
      meta: <span className="badge">Studio Aurora</span>,
    },
    {
      href: "/configuracoes/ia",
      icon: "spark",
      title: "Atendente virtual",
      copy: "Tom das respostas e estado do atendimento automático.",
      meta: (
        <>
          <span className="badge badge-ai">Leve e próxima</span>
          <span className="badge badge-success">Ativo</span>
        </>
      ),
    },
    {
      href: "/configuracoes/whatsapp",
      icon: "chat",
      title: "WhatsApp",
      copy: "Número conectado, estado da sessão e opções de reconexão.",
      meta: <span className="badge badge-success">Conectado</span>,
    },
    {
      href: "/configuracoes/agenda",
      icon: "calendar",
      title: "Agenda e disponibilidade",
      copy: external
        ? "Integração, última atualização e entrada segura para migração."
        : "Fonte oficial, estado operacional e gestão da disponibilidade.",
      meta: external ? (
        <>
          <span className="badge">Minha Agenda</span>
          <span className="badge badge-success">Conectada</span>
        </>
      ) : (
        <>
          <span className="badge badge-success">Agenda Atendly</span>
          <span className="badge">Controle local</span>
        </>
      ),
    },
    {
      href: "/configuracoes/disponibilidade",
      icon: "clock",
      title: "Disponibilidade",
      copy: "Dias, períodos de atendimento e acesso aos bloqueios da agenda.",
      meta: <span className="badge">Fuso de Brasília</span>,
    },
    {
      href: "/configuracoes/conta",
      icon: "lock",
      title: "Conta e segurança",
      copy: "E-mail, senha, sessão atual e ações de segurança.",
      meta: <span className="badge">Conta principal</span>,
    },
    {
      href: "/termos-de-uso",
      icon: "info",
      title: "Termos e privacidade",
      copy: "Consulte os documentos aplicáveis ao uso do produto.",
      meta: <span className="badge">Documentos</span>,
      wide: true,
    },
  ];
  return (
    <Page
      title="Configurações"
      description="Ajuste os dados do negócio, o atendimento automático e as conexões."
      back={false}
    >
      <section className="settings-overview" aria-label="Resumo operacional">
        <div className="settings-overview-main">
          <span className="settings-overview-icon">
            <Icon name="shield" />
          </span>
          <span className="settings-overview-copy">
            <strong>Atendimento automático disponível</strong>
            <span>WhatsApp conectado e fonte oficial operacional.</span>
          </span>
        </div>
        <div className="settings-overview-points">
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
      <div className="settings-hub-grid">
        {sections
          .filter((item) => !external || item.title !== "Disponibilidade")
          .map((item) => (
            <Link
              className={clsx("settings-hub-card", item.wide && "is-wide")}
              href={item.href}
              key={item.title}
            >
              <span className="settings-hub-icon">
                <Icon name={item.icon} />
              </span>
              <span className="settings-hub-copy">
                <strong>{item.title}</strong>
                <span>{item.copy}</span>
                <span className="settings-hub-meta">{item.meta}</span>
              </span>
              <Icon name="chevron-right" />
            </Link>
          ))}
      </div>
    </Page>
  );
}

function BusinessSettings() {
  const [saved, setSaved] = useState(false);
  return (
    <Page
      title="Negócio"
      description="Informações usadas para identificar o negócio e apresentar horários corretamente."
    >
      <div className="settings-detail-grid">
        <div>
          <section className="settings-panel">
            <div className="settings-form-grid">
              <label className="field">
                <span className="label">Nome do negócio</span>
                <input className="input" defaultValue="Studio Aurora" />
                <span className="field-help">
                  Este nome será usado nas próximas respostas da Atendly.
                </span>
              </label>
              <label className="field">
                <span className="label">Segmento</span>
                <span className="input-wrap">
                  <select className="select" defaultValue="Salão de beleza">
                    <option>Salão de beleza</option>
                    <option>Barbearia</option>
                    <option>Estética</option>
                    <option>Manicure</option>
                    <option>Massagem</option>
                    <option>Personal trainer</option>
                    <option>Consultório</option>
                    <option>Outro</option>
                  </select>
                  <Icon name="chevron-down" className="select-icon" />
                </span>
              </label>
              <label className="field">
                <span className="label">Idioma</span>
                <span className="input-wrap">
                  <select className="select">
                    <option>Português (Brasil)</option>
                  </select>
                  <Icon name="chevron-down" className="select-icon" />
                </span>
              </label>
              <label className="field">
                <span className="label">Moeda</span>
                <span className="input-wrap">
                  <select className="select">
                    <option>Real brasileiro (BRL)</option>
                  </select>
                  <Icon name="chevron-down" className="select-icon" />
                </span>
              </label>
              <label className="field is-wide">
                <span className="label">Fuso horário</span>
                <span className="input-wrap">
                  <select className="select" defaultValue="America/Sao_Paulo">
                    <option value="America/Sao_Paulo">Brasília (GMT−3)</option>
                    <option value="America/Manaus">Manaus (GMT−4)</option>
                    <option value="America/Rio_Branco">
                      Rio Branco (GMT−5)
                    </option>
                  </select>
                  <Icon name="chevron-down" className="select-icon" />
                </span>
                <span className="field-help">
                  A mudança exige revisão porque altera como horários futuros
                  são exibidos.
                </span>
              </label>
            </div>
            <div className="settings-form-actions">
              <span className="settings-save-note">
                Alterações aplicadas somente ao negócio atual.
              </span>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setSaved(true)}
              >
                Salvar alterações
              </button>
            </div>
            {saved && (
              <div className="alert alert-success settings-inline-message">
                <Icon name="check" />
                <div>
                  <p className="alert-title">Alterações salvas</p>
                  <p className="alert-text">
                    As novas configurações já estão em uso.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        <aside className="settings-side-note">
          <article className="card">
            <h2>Antes de salvar</h2>
            <p>
              O nome passa a valer nas próximas respostas. O histórico permanece
              como foi registrado.
            </p>
            <div className="settings-side-list">
              <span>
                <Icon name="check" />
                Idioma padrão: Português do Brasil
              </span>
              <span>
                <Icon name="check" />
                Moeda padrão: Real brasileiro
              </span>
              <span>
                <Icon name="info" />
                Mudanças de fuso pedem confirmação
              </span>
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

function AISettings() {
  const [enabled, setEnabled] = useState(true);
  const [tone, setTone] = useState<"professional" | "light">("light");
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <Page
      title="Atendente virtual"
      description="Defina como a Atendly conversa, sem alterar fatos, preços ou disponibilidade."
    >
      <div className="settings-detail-grid">
        <div className="settings-stack">
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Atendimento automático</h2>
                <p>
                  A Atendly responde em nome do Studio Aurora quando o WhatsApp
                  está conectado.
                </p>
              </div>
              <span className={enabled ? "badge badge-success" : "badge"}>
                {enabled ? "Ativo" : "Pausado"}
              </span>
            </div>
            <div className="settings-switch-row">
              <span className="settings-switch-copy">
                <strong>Responder automaticamente</strong>
                <span>
                  {enabled
                    ? "Novas conversas podem ser atendidas pela IA."
                    : "Nenhuma nova resposta automática será enviada."}
                </span>
              </span>
              <label className="switch">
                <span className="sr-only">Ativar atendimento automático</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) =>
                    event.target.checked ? setEnabled(true) : setConfirm(true)
                  }
                />
                <span className="switch-track" />
              </label>
            </div>
          </section>
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Tom das respostas</h2>
                <p>Escolha uma das duas opções disponíveis.</p>
              </div>
            </div>
            <div
              className="settings-choice-grid"
              role="radiogroup"
              aria-label="Tom das respostas"
            >
              {[
                [
                  "professional",
                  "Profissional e objetiva",
                  "Direta, clara e cordial.",
                ],
                [
                  "light",
                  "Leve e próxima",
                  "Conversa acolhedora, simples e natural.",
                ],
              ].map(([value, title, copy]) => (
                <label className="settings-tone-choice" key={value}>
                  <input
                    type="radio"
                    name="ai-tone"
                    value={value}
                    checked={tone === value}
                    onChange={() => setTone(value as "professional" | "light")}
                  />
                  <span className="settings-tone-card">
                    <strong>{title}</strong>
                    <span>{copy}</span>
                  </span>
                  <span className="settings-tone-check">
                    <Icon name="check" />
                  </span>
                </label>
              ))}
            </div>
            <div className="settings-preview" aria-live="polite">
              <p className="settings-preview-label">Prévia da resposta</p>
              <p className="settings-preview-bubble">
                {tone === "professional"
                  ? "Olá. Posso verificar os horários disponíveis para o seu atendimento."
                  : "Claro! Vou verificar os horários disponíveis para você."}
              </p>
            </div>
            <div className="settings-form-actions">
              <span className="settings-save-note">
                {saved
                  ? "Tom salvo neste ambiente demonstrativo."
                  : "O tom não muda serviços, preços ou regras."}
              </span>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setSaved(true)}
              >
                Salvar tom
              </button>
            </div>
          </section>
        </div>
        <aside className="settings-side-note">
          <article className="card">
            <h2>Quando uma pessoa assume</h2>
            <p>
              A IA pausa naquela conversa e só volta depois que o atendimento
              for devolvido.
            </p>
          </article>
          <article className="card">
            <h2>Fora do horário</h2>
            <p>
              A mensagem segue a disponibilidade configurada. Nenhum lembrete
              adicional está ativo.
            </p>
          </article>
        </aside>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Pausar atendimento automático?"
        eyebrow="Impacto operacional"
      >
        <p className="small muted">
          A Atendly deixará de responder novas mensagens. Conversas em
          atendimento humano continuam disponíveis.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setConfirm(false)}
          >
            Manter atendimento ativo
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setEnabled(false);
              setConfirm(false);
            }}
          >
            Pausar atendimento
          </button>
        </div>
      </Dialog>
    </Page>
  );
}

function WhatsAppSettings({ state }: { state: string }) {
  const connected = state === "whatsapp-connected";
  const [showConnect, setShowConnect] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const states: Record<
    string,
    {
      action: string;
      badge: string;
      badgeClass: string;
      copy: string;
      icon: IconName;
      iconClass: string;
      status: string;
      title: string;
    }
  > = {
    "whatsapp-connected": {
      badge: "Conectado",
      badgeClass: "badge-success",
      icon: "chat",
      iconClass: "",
      title: "WhatsApp conectado",
      copy: "O atendimento automático pode operar neste número.",
      status: "Sessão ativa",
      action: "Reconectar WhatsApp",
    },
    "whatsapp-disconnected": {
      badge: "Desconectado",
      badgeClass: "badge-danger",
      icon: "alert",
      iconClass: "is-danger",
      title: "WhatsApp desconectado",
      copy: "A Atendly não pode responder automaticamente até uma nova conexão.",
      status: "Atendimento automático indisponível",
      action: "Conectar WhatsApp",
    },
    "whatsapp-reconnecting": {
      badge: "Reconectando",
      badgeClass: "",
      icon: "refresh",
      iconClass: "is-warning",
      title: "Reconexão em andamento",
      copy: "Conclua a vinculação no WhatsApp. Você pode sair desta tela com segurança.",
      status: "Aguardando vinculação",
      action: "Ver instruções",
    },
    "whatsapp-expired": {
      badge: "Sessão expirada",
      badgeClass: "badge-danger",
      icon: "lock",
      iconClass: "is-danger",
      title: "A sessão expirou",
      copy: "Por segurança, conecte o número novamente para retomar o atendimento.",
      status: "Atendimento automático interrompido",
      action: "Reconectar WhatsApp",
    },
    "whatsapp-error": {
      badge: "Erro de conexão",
      badgeClass: "badge-danger",
      icon: "alert",
      iconClass: "is-danger",
      title: "Não foi possível verificar a conexão",
      copy: "O estado atual do WhatsApp não pôde ser confirmado. Tente novamente antes de contar com respostas automáticas.",
      status: "Estado não confirmado",
      action: "Tentar novamente",
    },
  };
  const config = states[state] ?? states["whatsapp-connected"];
  return (
    <Page
      title="WhatsApp"
      description="Acompanhe a sessão usada pelo atendimento automático e recupere a conexão quando necessário."
    >
      <div className="settings-detail-grid">
        <div className="settings-stack">
          <section className="settings-status-hero">
            <span className={clsx("settings-source-icon", config.iconClass)}>
              <Icon name={config.icon} />
            </span>
            <div className="settings-status-copy">
              <span className={clsx("badge", config.badgeClass)}>
                {config.badge}
              </span>
              <h2>{config.title}</h2>
              <p>{config.copy}</p>
              <div className="settings-status-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setShowConnect(true)}
                >
                  {config.action}
                </button>
                {connected && (
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => setDisconnectOpen(true)}
                  >
                    Desconectar número
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Detalhes da conexão</h2>
                <p>Informações do ambiente demonstrativo.</p>
              </div>
            </div>
            <div className="settings-data-list">
              <div className="settings-data-row">
                <span>Número</span>
                <strong>(11) 99999-0000 · demonstrativo</strong>
              </div>
              <div className="settings-data-row">
                <span>Estado</span>
                <strong>{config.status}</strong>
              </div>
              <div className="settings-data-row">
                <span>Última atualização</span>
                <strong>
                  {connected ? "Agora · demonstração" : "Não confirmada"}
                </strong>
              </div>
            </div>
          </section>
          {showConnect && (
            <section className="settings-panel settings-connect-panel">
              <div className="settings-panel-header">
                <div>
                  <h2>Conectar WhatsApp</h2>
                  <p>Use o método adequado ao dispositivo atual.</p>
                </div>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => setShowConnect(false)}
                  aria-label="Fechar instruções"
                >
                  <Icon name="x" />
                </button>
              </div>
              <div className="settings-connect-layout">
                <div className="settings-desktop-only">
                  <div
                    className="settings-qr"
                    aria-label="QR Code demonstrativo"
                  >
                    {Array.from({ length: 49 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                  <p className="field-help">
                    No WhatsApp do celular, abra Aparelhos conectados e leia o
                    código desta tela.
                  </p>
                </div>
                <div className="settings-mobile-only">
                  <div className="settings-code">
                    <span className="small muted">
                      Código de vinculação demonstrativo
                    </span>
                    <strong>ABCD-EFGH</strong>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText("ABCD-EFGH");
                        setCopied(true);
                      }}
                    >
                      {copied ? "Código copiado" : "Copiar código"}
                    </button>
                  </div>
                  <ol className="settings-steps">
                    <li>Abra o WhatsApp no celular.</li>
                    <li>Acesse Aparelhos conectados.</li>
                    <li>
                      Escolha Vincular com número de telefone e cole o código.
                    </li>
                  </ol>
                </div>
                <div>
                  <h3>Antes de começar</h3>
                  <ul className="settings-steps">
                    <li>Mantenha o WhatsApp aberto durante a vinculação.</li>
                    <li>
                      O atendimento só volta após a conexão ser confirmada.
                    </li>
                    <li>Este protótipo não inicia uma conexão real.</li>
                  </ul>
                </div>
              </div>
            </section>
          )}
        </div>
        <aside className="settings-side-note">
          <article className="card">
            <h2>Diagnóstico básico</h2>
            <div className="settings-side-list">
              <span>
                <Icon name={connected ? "check" : "alert"} />
                Sessão: {config.status}
              </span>
              <span>
                <Icon name="info" />O atendimento depende desta conexão
              </span>
              <span>
                <Icon name="shield" />
                Nenhum agendamento é confirmado por esta tela
              </span>
            </div>
          </article>
        </aside>
      </div>
      <Dialog
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        eyebrow="Interrupção do serviço"
        title="Desconectar WhatsApp?"
      >
        <p className="settings-modal-copy">
          A Atendly deixará de responder automaticamente assim que a desconexão
          for concluída.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setDisconnectOpen(false)}
          >
            Manter conectado
          </button>
          <Link className="btn btn-danger" href="/configuracoes/whatsapp">
            Desconectar WhatsApp
          </Link>
        </div>
      </Dialog>
    </Page>
  );
}

function CalendarSettings({ external }: { external: boolean }) {
  const [dialog, setDialog] = useState(false);
  const sourceTitle = external ? "Minha Agenda" : "Agenda Atendly";
  const sourceBadge = external
    ? "Minha Agenda oficial"
    : "Gerenciado pela Atendly";
  const rows = external
    ? [
        ["Serviços", "Dados disponíveis pela conexão"],
        ["Clientes", "Dados disponíveis pela conexão"],
        ["Agendamentos", "Gerenciados na fonte oficial"],
      ]
    : [
        ["Serviços", "Gerenciados pela Atendly"],
        ["Clientes", "Gerenciados pela Atendly"],
        ["Agendamentos", "Gerenciados pela Atendly"],
      ];
  return (
    <Page
      title="Agenda e disponibilidade"
      description="Entenda qual sistema confirma os agendamentos antes de alterar qualquer configuração."
      badge={<span className="badge badge-success">{sourceBadge}</span>}
    >
      <div className="settings-detail-grid">
        <div className="settings-stack">
          <section className="settings-source-card">
            <span className="settings-source-icon">
              <Icon name={external ? "link" : "calendar"} />
            </span>
            <span className="settings-source-copy">
              <strong>{sourceTitle}</strong>
              <span>
                {external
                  ? "Minha Agenda continua controlando os agendamentos. A Atendly usa apenas as operações disponíveis pela conexão."
                  : "A Atendly é a fonte oficial e controla serviços, disponibilidade e agendamentos."}
              </span>
            </span>
            <span className="badge badge-success">{sourceBadge}</span>
          </section>
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Estado da fonte oficial</h2>
                <p>Resumo sem presumir capacidades ainda não confirmadas.</p>
              </div>
              <span className="status-line">
                <span className="status-dot" />
                Operacional
              </span>
            </div>
            <div className="settings-data-list">
              <div className="settings-data-row">
                <span>Fonte oficial</span>
                <strong>{sourceTitle}</strong>
              </div>
              <div className="settings-data-row">
                <span>Última atualização</span>
                <strong>
                  {external ? "Não informada" : "Agora · ambiente local"}
                </strong>
              </div>
              <div className="settings-data-row">
                <span>Sincronização</span>
                <strong>
                  {external
                    ? "Conexão ativa; frequência não informada"
                    : "Não se aplica à fonte local"}
                </strong>
              </div>
              {rows.map(([label, value]) => (
                <div className="settings-data-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="settings-form-actions">
              <span className="settings-save-note">
                Dados operacionais sem valores inventados.
              </span>
              {external ? (
                <span className="status-line">
                  <span className="status-dot" aria-hidden="true" />
                  Consulta conforme a integração
                </span>
              ) : (
                <Link
                  className="btn btn-secondary"
                  href="/configuracoes/disponibilidade"
                >
                  Revisar disponibilidade
                </Link>
              )}
            </div>
          </section>
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Mudar fonte oficial</h2>
                <p>
                  Essa decisão inicia uma migração assistida. Não existe troca
                  instantânea.
                </p>
              </div>
            </div>
            <div className="alert banner-warning">
              <Icon name="alert" />
              <div>
                <p className="alert-title">A agenda atual continua oficial</p>
                <p className="alert-text">
                  Nenhuma mudança ocorrerá antes da análise e da revisão final.
                </p>
              </div>
            </div>
            <div className="settings-form-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setDialog(true)}
              >
                {external
                  ? "Migrar para Agenda Atendly"
                  : "Conectar Minha Agenda"}
              </button>
            </div>
          </section>
        </div>
        <aside className="settings-side-note">
          <article className="card">
            <h2>Fonte oficial significa</h2>
            <p>
              Um agendamento só é confirmado depois de ser salvo com sucesso no
              sistema que controla a agenda.
            </p>
          </article>
          <article className="card">
            <h2>{external ? "Ações permitidas" : "Controle local"}</h2>
            <p>
              {external
                ? "A interface mostra apenas operações disponibilizadas pela conexão. Recursos não suportados devem ser concluídos na Minha Agenda."
                : "Serviços, disponibilidade, bloqueios e agendamentos são gerenciados pela Atendly."}
            </p>
          </article>
        </aside>
      </div>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title={`Revisar mudança para ${external ? "Agenda Atendly" : "Minha Agenda"}`}
        eyebrow="Fluxo assistido"
      >
        <p className="settings-modal-copy">
          A fonte oficial não muda agora. O próximo passo inicia uma análise
          guiada de dados, compatibilidade e conflitos.
        </p>
        <ul className="settings-impact-list">
          <li>A agenda atual permanece oficial durante a análise.</li>
          <li>Nenhum horário é liberado ou recriado nesta etapa.</li>
          <li>A migração só avança depois de uma revisão explícita.</li>
        </ul>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setDialog(false)}
          >
            Manter fonte atual
          </button>
          <Link
            className="btn btn-primary"
            href={
              external
                ? "/migracao/para-atendly"
                : "/migracao/para-minha-agenda"
            }
          >
            Iniciar análise assistida
          </Link>
        </div>
      </Dialog>
    </Page>
  );
}

function AvailabilitySettings() {
  const [saved, setSaved] = useState(false);
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const days = [
    ["Segunda-feira", true],
    ["Terça-feira", true],
    ["Quarta-feira", true],
    ["Quinta-feira", true],
    ["Sexta-feira", true],
    ["Sábado", true],
    ["Domingo", false],
  ] as const;
  return (
    <Page
      title="Disponibilidade"
      description="Defina quando novos horários podem ser oferecidos pela Agenda Atendly."
    >
      <div className="settings-detail-grid">
        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Semana habitual</h2>
              <p>
                Fuso usado: Brasília (GMT−3). Períodos do mesmo dia não podem se
                sobrepor.
              </p>
            </div>
          </div>
          <div className="availability-list">
            {days.map(([day, active], index) => (
              <div
                className={clsx("availability-row", !active && "is-off")}
                key={day}
              >
                <label className="availability-day">
                  <span className="check">
                    <input type="checkbox" defaultChecked={active} />
                    <span className="check-box" />
                  </span>
                  <span>{day}</span>
                </label>
                <div className="availability-periods">
                  {active ? (
                    <>
                      <span className="availability-period">
                        <input
                          aria-label={`Início em ${day}`}
                          type="time"
                          defaultValue="09:00"
                        />
                        <span>até</span>
                        <input
                          aria-label={`Fim em ${day}`}
                          type="time"
                          defaultValue={index === 5 ? "13:00" : "18:00"}
                        />
                      </span>
                      {addedDays.includes(index) && (
                        <span className="availability-period">
                          <input
                            aria-label={`Segundo início em ${day}`}
                            type="time"
                            defaultValue="19:00"
                          />
                          <span>até</span>
                          <input
                            aria-label={`Segundo fim em ${day}`}
                            type="time"
                            defaultValue="20:00"
                          />
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="small muted">Sem atendimento</span>
                  )}
                </div>
                <button
                  className="btn btn-tertiary"
                  type="button"
                  disabled={addedDays.includes(index)}
                  onClick={() => setAddedDays((current) => [...current, index])}
                >
                  {addedDays.includes(index)
                    ? "Período adicionado"
                    : "Adicionar período"}
                </button>
              </div>
            ))}
          </div>
          <div className="settings-form-actions">
            <span className="settings-save-note">
              Mudanças afetam novas opções de horário.
            </span>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setSaved(true)}
            >
              Salvar disponibilidade
            </button>
          </div>
          {saved && (
            <div
              className="alert alert-success settings-inline-message"
              role="status"
            >
              <Icon name="check" />
              <div>
                <p className="alert-title">Disponibilidade salva</p>
                <p className="alert-text">
                  Novos horários usarão esta semana habitual.
                </p>
              </div>
            </div>
          )}
        </section>
        <aside className="settings-side-note">
          <article className="card">
            <h2>Exceções e bloqueios</h2>
            <p>
              Ausências pontuais são registradas como bloqueios na agenda,
              preservando a rotina semanal.
            </p>
            <Link className="btn btn-secondary" href="/agenda/bloquear">
              Bloquear horário
            </Link>
          </article>
          <article className="card">
            <h2>Proteção contra conflitos</h2>
            <p>
              Períodos sobrepostos e horários invertidos impedem o salvamento.
            </p>
          </article>
        </aside>
      </div>
    </Page>
  );
}

function AccountSettings() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  return (
    <Page
      title="Conta e segurança"
      description="Proteja o acesso à conta principal e revise ações de encerramento com cuidado."
    >
      <div className="settings-detail-grid">
        <div className="settings-stack">
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Acesso</h2>
                <p>O e-mail identifica a conta usada neste protótipo.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <label className="field is-wide">
                <span className="label">E-mail</span>
                <input
                  className="input"
                  type="email"
                  defaultValue="felipe@exemplo.com"
                />
              </label>
              <label className="field">
                <span className="label">Senha atual</span>
                <input className="input" type="password" />
              </label>
              <label className="field">
                <span className="label">Nova senha</span>
                <input className="input" type="password" />
                <span className="field-help">
                  Use uma senha exclusiva e difícil de adivinhar.
                </span>
              </label>
            </div>
            <div className="settings-form-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  setAccountStatus(
                    "Senha atualizada somente neste ambiente demonstrativo.",
                  )
                }
              >
                Atualizar senha
              </button>
            </div>
            {accountStatus && (
              <p className="settings-save-note" role="status">
                {accountStatus}
              </p>
            )}
          </section>
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div>
                <h2>Sessão atual</h2>
                <p>
                  Outras sessões não são apresentadas sem suporte confirmado.
                </p>
              </div>
              <span className="badge badge-success">Atual</span>
            </div>
            <div className="settings-current-session">
              <span className="avatar">
                <Icon name="shield" />
              </span>
              <div>
                <strong>Este dispositivo</strong>
                <p className="small muted">
                  Sessão principal · ambiente demonstrativo
                </p>
              </div>
            </div>
            <div className="settings-form-actions">
              <Link className="btn btn-secondary" href="/login">
                Sair da conta
              </Link>
            </div>
          </section>
          <section className="settings-panel settings-danger-zone">
            <div className="settings-panel-header">
              <div>
                <h2>Excluir conta</h2>
                <p>
                  Inicia uma solicitação específica com confirmação de
                  identidade e revisão do impacto.
                </p>
              </div>
            </div>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => setDeleteOpen(true)}
            >
              Solicitar exclusão
            </button>
          </section>
        </div>
        <aside className="settings-side-note">
          <article className="card">
            <h2>Segurança</h2>
            <div className="settings-side-list">
              <span>
                <Icon name="check" />
                E-mail da conta principal
              </span>
              <span>
                <Icon name="check" />
                Confirmação antes de ações críticas
              </span>
              <span>
                <Icon name="info" />
                Política de retenção ainda não definida
              </span>
            </div>
          </article>
        </aside>
      </div>
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Solicitar exclusão da conta"
        eyebrow="Ação irreversível"
      >
        <p className="small muted">
          A exclusão não acontece com um clique. Confirme sua identidade e
          revise o impacto.
        </p>
        <label className="field settings-confirm-field">
          <span className="label">Digite EXCLUIR para continuar</span>
          <input
            className="input"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setDeleteOpen(false)}
          >
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={confirm !== "EXCLUIR"}
            onClick={() => {
              setDeleteOpen(false);
              setConfirm("");
              setAccountStatus(
                "Solicitação revisada no exemplo; nenhuma conta foi excluída.",
              );
            }}
          >
            Revisar solicitação
          </button>
        </div>
      </Dialog>
    </Page>
  );
}

export function SettingsScreen(props: {
  preview?: boolean;
  scenario?: SettingsScenario;
}) {
  return props.preview ? (
    <PrototypeSettingsScreen scenario={props.scenario} />
  ) : (
    <ProductSettingsScreen scenario={props.scenario ?? "hub"} />
  );
}

function PrototypeSettingsScreen({
  scenario = "hub",
}: {
  scenario?: SettingsScenario;
}) {
  const external =
    scenario === "hub-external" || scenario === "calendar-external";
  let content: ReactNode;
  if (scenario === "hub" || scenario === "hub-external")
    content = <SettingsHub external={external} />;
  else if (scenario === "business") content = <BusinessSettings />;
  else if (scenario === "ai") content = <AISettings />;
  else if (scenario.startsWith("whatsapp"))
    content = <WhatsAppSettings state={scenario} />;
  else if (scenario === "calendar" || scenario === "calendar-external")
    content = <CalendarSettings external={external} />;
  else if (scenario === "availability") content = <AvailabilitySettings />;
  else if (scenario === "account") content = <AccountSettings />;
  else if (scenario === "loading")
    content = (
      <Page
        title="Configurações"
        description="Carregando preferências e estados operacionais."
        back={false}
      >
        <section
          className="settings-state-shell"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="settings-loading-stack">
            <div className="skeleton skeleton-title" />
            {[0, 1].map((item) => (
              <div className="settings-loading-card" key={item}>
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line" />
              </div>
            ))}
            <span className="sr-only">Carregando configurações</span>
          </div>
        </section>
      </Page>
    );
  else
    content = (
      <Page
        title="Configurações"
        description="Não foi possível carregar as preferências agora."
        back={false}
      >
        <section className="settings-state-shell">
          <div className="settings-state-card">
            <span className="settings-source-icon is-danger">
              <Icon name="alert" />
            </span>
            <h2>Configurações indisponíveis</h2>
            <p>
              O estado atual não foi alterado. Tente carregar novamente antes de
              fazer mudanças operacionais.
            </p>
            <Link className="btn btn-primary" href="/configuracoes">
              <Icon name="refresh" />
              Tentar novamente
            </Link>
          </div>
        </section>
      </Page>
    );
  return (
    <AppShell
      active="configuracoes"
      module="settings"
      source={external ? "external" : "atendly"}
    >
      {content}
    </AppShell>
  );
}
