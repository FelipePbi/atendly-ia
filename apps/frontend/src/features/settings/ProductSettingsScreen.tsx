"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import type { AiTone, SettingsState } from "@/data";
import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { AppShell } from "@/shared/layout/AppShell";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import type { SettingsScenario } from "./types";

export function ProductSettingsScreen({
  scenario,
}: {
  scenario: SettingsScenario;
}) {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .settings.get(controller.signal)
      .then(setSettings)
      .catch(() => setError(true));
    getProductServices()
      .whatsapp.get(controller.signal)
      .then((connection) =>
        setWhatsappConnected(connection?.status === "CONNECTED"),
      )
      .catch(() => setWhatsappConnected(false));
    return () => controller.abort();
  }, []);

  const source =
    settings?.calendar.source === "EXTERNAL" ? "external" : "atendly";
  return (
    <AppShell
      active="configuracoes"
      module="settings"
      source={source}
      loading={!settings && !error}
      whatsapp={whatsappConnected ? "connected" : "disconnected"}
    >
      {!settings && !error ? (
        <SettingsMessage
          title="Carregando configurações"
          copy="Buscando o estado atual do seu negócio."
        />
      ) : error || !settings ? (
        <SettingsMessage
          title="Configurações indisponíveis"
          copy="Nada foi alterado. Tente carregar a página novamente."
          error
        />
      ) : (
        <SettingsContent
          scenario={scenario}
          settings={settings}
          setSettings={setSettings}
          setWhatsappConnected={setWhatsappConnected}
        />
      )}
    </AppShell>
  );
}

function SettingsContent({
  scenario,
  settings,
  setSettings,
  setWhatsappConnected,
}: {
  scenario: SettingsScenario;
  settings: SettingsState;
  setSettings: (state: SettingsState) => void;
  setWhatsappConnected: (connected: boolean) => void;
}) {
  if (scenario === "business")
    return <BusinessSettings settings={settings} onSaved={setSettings} />;
  if (scenario === "ai")
    return <AiSettings settings={settings} onSaved={setSettings} />;
  if (scenario.startsWith("whatsapp"))
    return <WhatsAppSettings onStatusChange={setWhatsappConnected} />;
  if (scenario === "calendar" || scenario === "calendar-external")
    return <CalendarSettings settings={settings} />;
  if (scenario === "availability")
    return <AvailabilitySettings settings={settings} onSaved={setSettings} />;
  if (scenario === "account") return <AccountSettings />;
  return <SettingsHub settings={settings} />;
}

function Page({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="settings-page">
      <Link className="settings-back" href="/configuracoes">
        <Icon name="chevron-right" />
        Configurações
      </Link>
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function SettingsHub({ settings }: { settings: SettingsState }) {
  const cards: Array<{
    copy: string;
    href: string;
    icon: IconName;
    title: string;
  }> = [
    {
      href: "/configuracoes/negocio",
      icon: "briefcase",
      title: "Negócio",
      copy: settings.business?.name ?? "Complete seus dados",
    },
    {
      href: "/configuracoes/ia",
      icon: "spark",
      title: "Atendente virtual",
      copy: toneLabel(settings.ai.tone),
    },
    {
      href: "/configuracoes/whatsapp",
      icon: "chat",
      title: "WhatsApp",
      copy: "Conexão e recuperação da sessão",
    },
    {
      href: "/configuracoes/agenda",
      icon: "calendar",
      title: "Agenda",
      copy: sourceLabel(settings.calendar.source),
    },
    {
      href: "/configuracoes/conta",
      icon: "user",
      title: "Conta",
      copy: "Senha e acesso",
    },
  ];
  if (settings.calendar.source === "ATENDLY")
    cards.splice(4, 0, {
      href: "/configuracoes/disponibilidade",
      icon: "clock",
      title: "Disponibilidade",
      copy: "Dias e horários habituais",
    });
  return (
    <Page
      title="Configurações"
      description="Gerencie os dados e conexões usados pela operação."
    >
      <div className="settings-hub-grid">
        {cards.map((card) => (
          <Link className="settings-hub-card" href={card.href} key={card.href}>
            <span className="settings-hub-icon">
              <Icon name={card.icon} />
            </span>
            <span className="settings-hub-copy">
              <strong>{card.title}</strong>
              <span>{card.copy}</span>
            </span>
            <Icon name="chevron-right" />
          </Link>
        ))}
      </div>
    </Page>
  );
}

function BusinessSettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const { refreshSession } = useProductRuntime();
  const [name, setName] = useState(settings.business?.name ?? "");
  const [category, setCategory] = useState(settings.business?.category ?? "");
  const [timezone, setTimezone] = useState(
    settings.business?.timezone ?? "America/Sao_Paulo",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timezoneConfirmationOpen, setTimezoneConfirmationOpen] =
    useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (timezone !== settings.business?.timezone) {
      setTimezoneConfirmationOpen(true);
      return;
    }
    await persist();
  }
  async function persist() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(
        await getProductServices().settings.updateBusiness({
          name,
          category,
          timezone,
        }),
      );
      await refreshSession();
      setTimezoneConfirmationOpen(false);
      setMessage("Dados do negócio salvos.");
    } catch {
      setMessage("Não foi possível salvar os dados.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Negócio"
      description="Dados usados para identificar sua operação."
    >
      <form className="settings-panel" onSubmit={(event) => void save(event)}>
        <div className="settings-form-grid">
          <label className="field">
            <span className="label">Nome do negócio</span>
            <input
              className="input"
              minLength={2}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Categoria</span>
            <input
              className="input"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Idioma</span>
            <span className="input-wrap">
              <select className="select" disabled value="pt-BR">
                <option value="pt-BR">Português (Brasil)</option>
              </select>
              <span className="select-icon">
                <Icon name="chevron-down" />
              </span>
            </span>
          </label>
          <label className="field">
            <span className="label">Moeda</span>
            <span className="input-wrap">
              <select className="select" disabled value="BRL">
                <option value="BRL">Real brasileiro (BRL)</option>
              </select>
              <span className="select-icon">
                <Icon name="chevron-down" />
              </span>
            </span>
          </label>
          <label className="field is-wide">
            <span className="label">Fuso horário</span>
            <span className="input-wrap">
              <select
                className="select"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                <option value="America/Sao_Paulo">Brasília (GMT−3)</option>
                <option value="America/Manaus">Manaus (GMT−4)</option>
                <option value="America/Rio_Branco">Rio Branco (GMT−5)</option>
              </select>
              <span className="select-icon">
                <Icon name="chevron-down" />
              </span>
            </span>
            <span className="field-help">
              A mudança exige revisão porque altera horários futuros.
            </span>
          </label>
        </div>
        <SaveActions busy={busy} message={message} />
      </form>
      <Dialog
        eyebrow="Revisão necessária"
        onClose={() => setTimezoneConfirmationOpen(false)}
        open={timezoneConfirmationOpen}
        title="Alterar fuso horário?"
      >
        <p className="settings-modal-copy">
          Horários futuros passarão a usar o novo fuso. Revise disponibilidade,
          bloqueios e próximos atendimentos depois da mudança.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setTimezoneConfirmationOpen(false)}
          >
            Manter fuso atual
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            type="button"
            onClick={() => void persist()}
          >
            {busy ? "Salvando..." : "Alterar fuso"}
          </button>
        </div>
      </Dialog>
    </Page>
  );
}

function AiSettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const [enabled, setEnabled] = useState(settings.ai.enabled);
  const [tone, setTone] = useState<AiTone>(
    settings.ai.tone ?? "PROFESSIONAL_OBJECTIVE",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pauseConfirmationOpen, setPauseConfirmationOpen] = useState(false);
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await getProductServices().settings.updateAi({ enabled, tone }));
      setMessage("Configuração da IA salva.");
    } catch {
      setMessage("Não foi possível salvar a configuração.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Atendente virtual"
      description="Ative o atendimento automático e escolha um dos dois tons disponíveis."
    >
      <section className="settings-panel">
        <label className="switch-row">
          <span>
            <strong>Atendimento automático</strong>
            <small>A IA atua somente com dados e tools autorizadas.</small>
          </span>
          <input
            checked={enabled}
            type="checkbox"
            onChange={(event) => {
              if (event.target.checked) setEnabled(true);
              else setPauseConfirmationOpen(true);
            }}
          />
        </label>
        <div className="settings-choice-grid">
          <ToneChoice
            checked={tone === "PROFESSIONAL_OBJECTIVE"}
            label="Profissional e objetiva"
            onChange={() => setTone("PROFESSIONAL_OBJECTIVE")}
          />
          <ToneChoice
            checked={tone === "LIGHT_CLOSE"}
            label="Leve e próxima"
            onChange={() => setTone("LIGHT_CLOSE")}
          />
        </div>
        <SaveActions
          busy={busy}
          message={message}
          onClick={() => void save()}
        />
      </section>
      <Dialog
        eyebrow="Impacto operacional"
        onClose={() => setPauseConfirmationOpen(false)}
        open={pauseConfirmationOpen}
        title="Pausar atendimento automático?"
      >
        <p className="settings-modal-copy">
          A Atendly deixará de responder novas mensagens. Conversas em
          atendimento humano continuam disponíveis.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setPauseConfirmationOpen(false)}
          >
            Manter atendimento ativo
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setEnabled(false);
              setPauseConfirmationOpen(false);
            }}
          >
            Pausar atendimento
          </button>
        </div>
      </Dialog>
    </Page>
  );
}

function WhatsAppSettings({
  onStatusChange,
}: {
  onStatusChange: (connected: boolean) => void;
}) {
  return (
    <Page
      title="WhatsApp"
      description="Acompanhe a sessão, conecte, reconecte ou desconecte o número real."
    >
      <WhatsAppConnectionPanel onStatusChange={onStatusChange} />
    </Page>
  );
}

function CalendarSettings({ settings }: { settings: SettingsState }) {
  return (
    <Page
      title="Agenda"
      description="Consulte a fonte oficial usada para disponibilidade e agendamentos."
    >
      <section className="settings-panel">
        <div className="settings-source-card">
          <span className="settings-source-icon">
            <Icon name="calendar" />
          </span>
          <div className="settings-source-copy">
            <strong>{sourceLabel(settings.calendar.source)}</strong>
            <span>
              {settings.calendar.source
                ? "Fonte oficial configurada"
                : "Fonte ainda não selecionada"}
            </span>
          </div>
        </div>
        <div className="onboarding-note">
          <Icon name="info" />
          <span>
            A troca de origem exige migração assistida e não é um toggle nesta
            tela.
          </span>
        </div>
      </section>
    </Page>
  );
}

function AvailabilitySettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const active =
    settings.availability?.rules.filter((rule) => rule.active) ?? [];
  const [days, setDays] = useState(active.map((rule) => rule.dayOfWeek));
  const [startTime, setStartTime] = useState(active[0]?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(active[0]?.endTime ?? "18:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    if (days.length === 0) {
      setMessage("Escolha pelo menos um dia de atendimento.");
      return;
    }
    if (startTime >= endTime) {
      setMessage("O horário final deve ser posterior ao horário inicial.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const availability =
        await getProductServices().settings.updateAvailability({
          timezone: settings.business?.timezone ?? "America/Sao_Paulo",
          rules: days.map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            startTime,
            endTime,
          })),
        });
      onSaved({ ...settings, availability });
      setMessage("Disponibilidade salva.");
    } catch {
      setMessage("Não foi possível salvar a disponibilidade.");
    } finally {
      setBusy(false);
    }
  }
  if (settings.calendar.source !== "ATENDLY")
    return (
      <Page
        title="Disponibilidade"
        description="A disponibilidade pertence à fonte oficial."
      >
        <div className="onboarding-note is-important">
          <Icon name="info" />
          <span>Edite os horários diretamente na Minha Agenda.</span>
        </div>
      </Page>
    );
  return (
    <Page
      title="Disponibilidade"
      description="Defina os dias e o intervalo habitual da Agenda Atendly."
    >
      <section className="settings-panel">
        <div className="choice-grid">
          {weekdayLabels.map((label, day) => (
            <label
              className={`choice-card${days.includes(day) ? " is-selected" : ""}`}
              key={label}
            >
              <input
                className="sr-only"
                checked={days.includes(day)}
                type="checkbox"
                onChange={(event) =>
                  setDays((value) =>
                    event.target.checked
                      ? [...value, day].sort()
                      : value.filter((item) => item !== day),
                  )
                }
              />
              <strong>{label}</strong>
            </label>
          ))}
        </div>
        <div className="settings-form-grid">
          <label className="field">
            <span className="label">Início</span>
            <input
              className="input"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Fim</span>
            <input
              className="input"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        <SaveActions
          busy={busy}
          message={message}
          onClick={() => void save()}
        />
      </section>
    </Page>
  );
}

function AccountSettings() {
  const router = useRouter();
  const { session, setUnauthenticated } = useProductRuntime();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    try {
      await getProductServices().auth.changePassword({
        currentPassword: formString(data, "currentPassword"),
        newPassword: formString(data, "newPassword"),
        confirmPassword: formString(data, "confirmPassword"),
      });
      form.reset();
      setMessage("Senha alterada.");
    } catch {
      setMessage("Não foi possível alterar a senha. Revise os dados.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await getProductServices()
      .auth.logout()
      .catch(() => undefined);
    setUnauthenticated();
    router.replace("/login");
  }
  return (
    <Page title="Conta" description="Gerencie credenciais e acesso.">
      <div className="settings-stack">
        <section className="settings-panel">
          <div className="settings-data-list">
            <div className="settings-data-row">
              <span>E-mail</span>
              <strong>{session?.user.email}</strong>
            </div>
          </div>
        </section>
        <form
          className="settings-panel"
          onSubmit={(event) => void changePassword(event)}
        >
          <div className="settings-form-grid">
            <Password name="currentPassword" label="Senha atual" />
            <Password name="newPassword" label="Nova senha" />
            <Password name="confirmPassword" label="Repita a nova senha" />
          </div>
          <SaveActions busy={busy} message={message} label="Alterar senha" />
        </form>
        <section className="settings-panel">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void logout()}
          >
            Sair da conta
          </button>
        </section>
        <section className="settings-panel settings-danger-zone">
          <div className="settings-panel-header">
            <div>
              <h2>Excluir conta</h2>
              <p>
                A exclusão ainda não possui um fluxo público seguro nesta
                versão.
              </p>
            </div>
          </div>
          <button className="btn btn-danger" disabled type="button">
            Exclusão indisponível
          </button>
        </section>
      </div>
    </Page>
  );
}

function ToneChoice({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="settings-tone-choice">
      <input checked={checked} name="tone" type="radio" onChange={onChange} />
      <span className="settings-tone-card">
        <strong>{label}</strong>
        <span>Tom permitido na V1.</span>
      </span>
    </label>
  );
}
function Password({ label, name }: { label: string; name: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input"
        minLength={8}
        name={name}
        required
        type="password"
      />
    </label>
  );
}
function SaveActions({
  busy,
  label = "Salvar alterações",
  message,
  onClick,
}: {
  busy: boolean;
  label?: string;
  message: string | null;
  onClick?: () => void;
}) {
  return (
    <div className="settings-form-actions">
      <span className="settings-save-note" role="status">
        {message}
      </span>
      <button
        className="btn btn-primary"
        disabled={busy}
        type={onClick ? "button" : "submit"}
        onClick={onClick}
      >
        {busy ? "Salvando..." : label}
      </button>
    </div>
  );
}
function SettingsMessage({
  copy,
  error = false,
  title,
}: {
  copy: string;
  error?: boolean;
  title: string;
}) {
  return (
    <section className="settings-page">
      <div className="settings-state-shell">
        <div className="settings-state-card">
          <span className={`settings-source-icon${error ? " is-danger" : ""}`}>
            <Icon name={error ? "alert" : "refresh"} />
          </span>
          <h1>{title}</h1>
          <p>{copy}</p>
        </div>
      </div>
    </section>
  );
}
function sourceLabel(source: SettingsState["calendar"]["source"]) {
  return source === "ATENDLY"
    ? "Agenda Atendly"
    : source === "EXTERNAL"
      ? "Minha Agenda"
      : "Não configurada";
}
function toneLabel(tone: AiTone | null) {
  return tone === "PROFESSIONAL_OBJECTIVE"
    ? "Profissional e objetiva"
    : tone === "LIGHT_CLOSE"
      ? "Leve e próxima"
      : "Não configurado";
}
const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
