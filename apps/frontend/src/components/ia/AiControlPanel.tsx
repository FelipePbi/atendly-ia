"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Clock,
  FileText,
  Globe2,
  Loader2,
  MessageCircle,
  PauseCircle,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import { clsx } from "clsx";
import { LoadingState } from "@/components/ui/LoadingState";
import { useDashboard } from "@/components/layout/DashboardContext";
import { PersonaChoiceCard } from "@/components/ia/PersonaChoiceCard";
import {
  ACTIVATION_MODE_LABELS,
  ASSISTANT_SEX_LABELS,
  AWAY_SCOPE_LABELS,
  IDENTITY_MODE_LABELS,
  PERSONA_DEFINITIONS,
  type ApiVirtualAttendantSettings,
  type PromptPreview,
  type VirtualAttendantAssistantSex,
  type VirtualAttendantActivationMode,
  type VirtualAttendantAwayScope,
  type VirtualAttendantIdentityMode,
  type VirtualAttendantPersonaType,
} from "@/lib/virtual-attendant";
import { formatDateTime } from "@/lib/format";
import { aiStatusMeta, statusToneClasses } from "@/lib/status-labels";

type TabKey = "general" | "personas" | "instructions";

type SettingsResponse = {
  ok: boolean;
  settings?: ApiVirtualAttendantSettings;
  error?: string;
  details?: {
    readinessIssues?: string[];
  };
};

type PromptPreviewResponse = {
  ok: boolean;
  preview?: PromptPreview;
  error?: string;
};

type PersonaImportDto = {
  id: string;
  fileName: string;
  status: string;
  extractedCount: number | null;
  errorMessage: string | null;
  createdAt: string;
};

type ImportsResponse = {
  ok: boolean;
  imports?: PersonaImportDto[];
  settings?: ApiVirtualAttendantSettings;
  importedCount?: number;
  requiredCount?: number;
  participantSelectionRequired?: boolean;
  participants?: string[];
  error?: string;
};

type FormState = {
  aiEnabled: boolean;
  identityMode: VirtualAttendantIdentityMode;
  assistantName: string;
  assistantSex: VirtualAttendantAssistantSex | "";
  professionalSex: VirtualAttendantAssistantSex;
  personaType: VirtualAttendantPersonaType | "";
  activationMode: VirtualAttendantActivationMode;
  awayTimeoutMinutes: string;
  awayScope: VirtualAttendantAwayScope | "";
  customInstructions: string;
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof SlidersHorizontal }> = [
  { key: "general", label: "Geral", icon: SlidersHorizontal },
  { key: "personas", label: "Personas", icon: Sparkles },
  { key: "instructions", label: "Instruções", icon: FileText },
];

export function AiControlPanel() {
  const { refreshDashboard } = useDashboard();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<ApiVirtualAttendantSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [imports, setImports] = useState<PersonaImportDto[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantName, setParticipantName] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setError("");

    const [settingsResponse, previewResponse, importsResponse] = await Promise.all([
      fetch("/api/virtual-attendant/settings", { cache: "no-store" }),
      fetch("/api/virtual-attendant/prompt-preview", { cache: "no-store" }),
      fetch("/api/virtual-attendant/persona/imports", { cache: "no-store" }),
    ]);

    const settingsData = (await settingsResponse.json().catch(() => null)) as SettingsResponse | null;
    const previewData = (await previewResponse.json().catch(() => null)) as PromptPreviewResponse | null;
    const importsData = (await importsResponse.json().catch(() => null)) as ImportsResponse | null;

    if (!settingsResponse.ok || !settingsData?.settings) {
      setError(settingsData?.error ?? "Não foi possível carregar a Atendente Virtual.");
      setLoading(false);
      return;
    }

    const nextForm = toFormState(settingsData.settings);
    setSettings(settingsData.settings);
    setForm(nextForm);
    setSavedForm(nextForm);
    setPreview(previewData?.preview ?? null);
    setImports(importsData?.imports ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPanel();
    });
  }, [loadPanel]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const readyImports = imports.filter((item) => item.status === "READY").length;
  const importedCounter = settings?.customPersonaStatus === "READY" ? 3 : Math.min(readyImports, 3);

  async function saveForm(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!form) return;

    setSaving(true);
    setSuccess("");
    setError("");

    const response = await fetch("/api/virtual-attendant/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aiEnabled: form.aiEnabled,
        identityMode: form.identityMode,
        assistantName: form.assistantName,
        assistantSex: form.assistantSex || null,
        professionalSex: form.professionalSex,
        personaType: form.personaType || null,
        customInstructions: form.customInstructions,
        activationMode: form.activationMode,
        awayTimeoutMinutes:
          form.activationMode === "AWAY_FROM_WHATSAPP" && form.awayTimeoutMinutes
            ? Number(form.awayTimeoutMinutes)
            : null,
        awayScope: form.activationMode === "AWAY_FROM_WHATSAPP" ? form.awayScope || null : null,
      }),
    });
    const data = (await response.json().catch(() => null)) as SettingsResponse | null;
    setSaving(false);

    if (!response.ok || !data?.settings) {
      setError(readSettingsError(data));
      return;
    }

    const nextForm = toFormState(data.settings);
    setSettings(data.settings);
    setForm(nextForm);
    setSavedForm(nextForm);
    setSuccess("Configurações da Atendente Virtual salvas.");
    await refreshDashboard();
    await refreshPreview();
  }

  async function refreshPreview() {
    const response = await fetch("/api/virtual-attendant/prompt-preview", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as PromptPreviewResponse | null;
    if (response.ok && data?.preview) {
      setPreview(data.preview);
    }
  }

  async function uploadPersonaFiles() {
    if (selectedFiles.length === 0) {
      setError("Selecione pelo menos 3 arquivos .txt exportados do WhatsApp.");
      return;
    }

    setUploading(true);
    setSuccess("");
    setError("");

    const body = new FormData();
    selectedFiles.forEach((file) => body.append("files", file));
    if (participantName) {
      body.append("participantName", participantName);
    }

    const response = await fetch("/api/virtual-attendant/persona/import", {
      method: "POST",
      body,
    });
    const data = (await response.json().catch(() => null)) as ImportsResponse | null;
    setUploading(false);

    if (!response.ok || !data) {
      setError(data?.error ?? "Não foi possível processar os arquivos.");
      return;
    }

    setImports(data.imports ?? []);
    setParticipants(data.participants ?? []);

    if (data.settings) {
      const nextForm = toFormState(data.settings);
      setSettings(data.settings);
      setForm(nextForm);
      setSavedForm(nextForm);
      await refreshDashboard();
      await refreshPreview();
    }

    if (data.participantSelectionRequired) {
      setError("Selecione qual participante representa você e envie os mesmos arquivos novamente.");
      return;
    }

    if (data.error) {
      setError(data.error);
      return;
    }

    setSelectedFiles([]);
    setParticipantName("");
    setSuccess("Persona personalizada gerada com segurança.");
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSuccess("");
    setError("");
  }

  function updateFiles(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFiles(Array.from(event.target.files ?? []));
    setSuccess("");
    setError("");
  }

  if (loading || !settings || !form) {
    return <LoadingState label="Carregando Atendente Virtual..." />;
  }

  const meta = aiStatusMeta(settings.aiEnabled);
  const StatusIcon = settings.aiEnabled ? Bot : PauseCircle;
  const assistantExampleName = form.assistantName.trim() || "Bea";
  const businessRulesPreview = preview?.blocks.find((block) => block.label === "Regras do negócio")?.value;
  const assistantExampleBusiness = businessRulesPreview?.startsWith("Usar ")
    ? businessRulesPreview.replace(/^Usar\s+/, "").split(",")[0]
    : "nome da empresa";
  const assistantArticle = form.assistantSex === "MALE" ? "o" : "a";
  const assistantGreeting = form.personaType === "CORPORATE" ? "Olá" : "Oii";
  const assistantIntroExample = `${assistantGreeting}, sou ${assistantArticle} ${assistantExampleName}, atendente pessoal da ${assistantExampleBusiness}.`;
  const personaVisualSex: VirtualAttendantAssistantSex =
    form.identityMode === "SEPARATE_ASSISTANT" ? form.assistantSex || "FEMALE" : form.professionalSex;

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={saveForm}>
      <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-foreground">Status da atendente</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {settings.aiEnabled
                ? "A atendente virtual pode responder clientes conforme as regras configuradas."
                : "Nenhuma resposta automática será enviada."}
            </p>
          </div>
          <span className={`inline-flex h-10 w-fit items-center gap-2 rounded-md border px-3 text-sm font-black ${statusToneClasses(meta.tone)}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {meta.label}
          </span>
        </div>

        {settings.updatedAt ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-muted">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Última atualização: {formatDateTime(settings.updatedAt)}
          </p>
        ) : null}

        {settings.readinessIssues.length > 0 ? (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-3 text-sm leading-6 text-warning">
            <div className="flex items-start gap-2 font-bold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Configuração incompleta
            </div>
            <ul className="mt-2 space-y-1">
              {settings.readinessIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-brand/25 bg-brand/10 px-3 py-3 text-sm leading-6 text-brand-strong">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Atendente pronta para ativação.
          </div>
        )}
      </section>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                className={clsx(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-black transition",
                  active
                    ? "border-brand/20 bg-brand/10 text-brand-strong"
                    : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground"
                )}
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "general" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PanelCard icon={<Bot className="h-5 w-5" />} title="Ativar ou pausar IA">
            <p className="text-sm leading-6 text-muted">
              {form.aiEnabled
                ? "IA ativa: respostas automáticas liberadas conforme as regras."
                : "IA pausada: nenhuma resposta automática será enviada."}
            </p>
            <button
              className={clsx(
                "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-black text-white transition disabled:opacity-60 sm:w-fit",
                form.aiEnabled ? "bg-brand hover:bg-brand-strong" : "bg-warning hover:bg-warning/90"
              )}
              type="button"
              disabled={saving}
              onClick={() => update("aiEnabled", !form.aiEnabled)}
              aria-pressed={form.aiEnabled}
            >
              {form.aiEnabled ? <PauseCircle className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
              {form.aiEnabled ? "Pausar IA" : "Ativar IA"}
            </button>
          </PanelCard>

          <PanelCard icon={<Clock className="h-5 w-5" />} title="Quando a IA entra em ação">
            <SegmentedOptions
              value={form.activationMode}
              options={[
                {
                  value: "ALWAYS",
                  label: ACTIVATION_MODE_LABELS.ALWAYS,
                  description: "A IA pode responder sempre que as regras de segurança permitirem.",
                },
                {
                  value: "AWAY_FROM_WHATSAPP",
                  label: ACTIVATION_MODE_LABELS.AWAY_FROM_WHATSAPP,
                  description: "A IA só responde depois de um período sem atividade manual.",
                },
              ]}
              onChange={(value) => update("activationMode", value)}
            />
          </PanelCard>

          {form.activationMode === "AWAY_FROM_WHATSAPP" ? (
            <>
              <PanelCard icon={<Clock className="h-5 w-5" />} title="Tempo de inatividade">
                <label className="block">
                  <span className="text-sm font-bold text-foreground">Responder após quantos minutos sem atividade?</span>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={form.awayTimeoutMinutes}
                      onChange={(event) => update("awayTimeoutMinutes", event.target.value)}
                      required
                    />
                    <span className="shrink-0 text-sm font-bold text-muted">min</span>
                  </div>
                </label>
                <p className="text-sm leading-6 text-muted">
                  A IA só entra em ação depois desse período sem atividade manual no WhatsApp.
                </p>
              </PanelCard>

              <PanelCard icon={<Globe2 className="h-5 w-5" />} title="Escopo da ausência">
                <SegmentedOptions
                  value={form.awayScope}
                  options={[
                    {
                      value: "GLOBAL",
                      label: AWAY_SCOPE_LABELS.GLOBAL,
                      description: "Qualquer mensagem manual recente impede a IA de responder todas as conversas.",
                    },
                    {
                      value: "CONVERSATION",
                      label: AWAY_SCOPE_LABELS.CONVERSATION,
                      description: "A atividade manual recente bloqueia apenas a conversa específica.",
                    },
                  ]}
                  onChange={(value) => update("awayScope", value)}
                />
              </PanelCard>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "personas" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PanelCard icon={<UserRound className="h-5 w-5" />} title="Como a IA se identifica">
            <SegmentedOptions
              value={form.identityMode}
              options={[
                {
                  value: "PROFESSIONAL",
                  label: IDENTITY_MODE_LABELS.PROFESSIONAL,
                  description:
                    "A IA fala em nome da profissional ou do negócio. Não precisa de nome próprio e não se apresenta como uma atendente separada.",
                },
                {
                  value: "SEPARATE_ASSISTANT",
                  label: IDENTITY_MODE_LABELS.SEPARATE_ASSISTANT,
                  description:
                    "A IA usa uma identidade própria, com nome e sexo definidos por você, e se apresenta ao iniciar ou retomar o atendimento.",
                },
              ]}
              onChange={(value) => update("identityMode", value)}
            />

            {form.identityMode === "SEPARATE_ASSISTANT" ? (
              <>
                <label className="block">
                  <span className="text-sm font-bold text-foreground">Nome da atendente</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                    value={form.assistantName}
                    onChange={(event) => update("assistantName", event.target.value)}
                    placeholder="Ex: Bea, Sofia, Clara"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-foreground">Sexo da atendente</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                    value={form.assistantSex}
                    onChange={(event) => update("assistantSex", event.target.value as VirtualAttendantAssistantSex | "")}
                    required
                  >
                    <option value="">Selecione</option>
                    <option value="FEMALE">{ASSISTANT_SEX_LABELS.FEMALE}</option>
                    <option value="MALE">{ASSISTANT_SEX_LABELS.MALE}</option>
                  </select>
                </label>
                <p className="rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
                  Exemplo: {assistantIntroExample}
                </p>
              </>
            ) : (
              <>
                <p className="rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-muted">
                  Neste modo, a IA responde como extensão da profissional. O cliente não verá uma apresentação com nome de atendente.
                </p>
                <div>
                  <p className="mb-2 text-sm font-bold text-foreground">Imagem da profissional</p>
                  <SegmentedOptions
                    value={form.professionalSex}
                    options={[
                      {
                        value: "FEMALE",
                        label: ASSISTANT_SEX_LABELS.FEMALE,
                        description: "Usa as imagens femininas nos cards de persona.",
                      },
                      {
                        value: "MALE",
                        label: ASSISTANT_SEX_LABELS.MALE,
                        description: "Usa as imagens masculinas nos cards de persona.",
                      },
                    ]}
                    onChange={(value) => update("professionalSex", value)}
                  />
                </div>
              </>
            )}
          </PanelCard>

          <PanelCard icon={<Sparkles className="h-5 w-5" />} title="Personas disponíveis">
            <div className="grid gap-3">
              {(Object.keys(PERSONA_DEFINITIONS) as VirtualAttendantPersonaType[]).map((persona) => (
                <PersonaChoiceCard
                  key={persona}
                  persona={persona}
                  selected={form.personaType === persona}
                  visualSex={personaVisualSex}
                  onSelect={() => update("personaType", persona)}
                />
              ))}
            </div>
          </PanelCard>

          {form.personaType === "CUSTOM" ? (
            <PanelCard icon={<Upload className="h-5 w-5" />} title="Persona personalizada">
              <div className="rounded-md border border-border bg-surface-muted px-3 py-3 text-sm font-black text-foreground">
                {importedCounter} de 3 conversas importadas
              </div>
              <p className="text-sm leading-6 text-muted">
                Os arquivos são usados apenas para gerar o estilo da atendente virtual. O conteúdo original não será armazenado após o processamento.
              </p>
              <label className="block">
                <span className="text-sm font-bold text-foreground">Arquivos TXT do WhatsApp</span>
                <input
                  className="mt-2 block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-black file:text-white"
                  type="file"
                  accept=".txt,text/plain"
                  multiple
                  onChange={updateFiles}
                />
              </label>

              {participants.length > 0 ? (
                <label className="block">
                  <span className="text-sm font-bold text-foreground">Qual participante representa você?</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                  >
                    <option value="">Selecionar participante</option>
                    {participants.map((participant) => (
                      <option key={participant} value={participant}>
                        {participant}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-black text-white transition hover:bg-brand-strong disabled:opacity-60 sm:w-fit"
                type="button"
                disabled={uploading}
                onClick={uploadPersonaFiles}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Processando..." : "Importar TXT"}
              </button>

              {imports.length > 0 ? (
                <div className="grid gap-2">
                  {imports.slice(0, 5).map((item) => (
                    <div className="flex items-start gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm" key={item.id}>
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-foreground">{item.fileName}</span>
                        <span className="block text-xs text-muted">
                          {item.status} · {item.extractedCount ?? 0} mensagens
                        </span>
                        {item.errorMessage ? <span className="block text-xs text-danger">{item.errorMessage}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </PanelCard>
          ) : null}
        </div>
      ) : null}

      {activeTab === "instructions" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <PanelCard icon={<ShieldCheck className="h-5 w-5" />} title="Comportamento atual">
            <div className="grid gap-3">
              {(preview?.blocks ?? []).map((block) => (
                <div className="rounded-md border border-border bg-white px-3 py-3" key={block.label}>
                  <p className="text-xs font-black uppercase tracking-normal text-muted">{block.label}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground">{block.value}</p>
                </div>
              ))}
            </div>
          </PanelCard>

          <PanelCard icon={<MessageCircle className="h-5 w-5" />} title="Instruções adicionais">
            <label className="block">
              <span className="text-sm font-bold text-foreground">Instruções adicionais para a IA</span>
              <textarea
                className="mt-2 min-h-40 w-full resize-y rounded-md border border-border bg-white px-3 py-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                value={form.customInstructions}
                onChange={(event) => update("customInstructions", event.target.value)}
                placeholder="Ex: Não usar muitos emojis. Chamar clientes pelo primeiro nome. Sempre avisar sobre a tolerância de atraso quando confirmar o horário."
              />
            </label>
            <p className="text-sm leading-6 text-muted">
              Essas instruções serão combinadas com a persona e as regras do negócio. Elas não substituem regras obrigatórias do sistema.
            </p>
          </PanelCard>
        </div>
      ) : null}

      {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {success ? <p className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-strong">{success}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-black text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            setForm(savedForm);
            setError("");
            setSuccess("");
          }}
        >
          Cancelar
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-black text-white transition hover:bg-brand-strong disabled:opacity-60"
          type="submit"
          disabled={saving || !dirty}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

function PanelCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">{icon}</span>
        <h3 className="text-base font-black text-foreground">{title}</h3>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function SegmentedOptions<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | "";
  options: Array<{ value: T; label: string; description: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((option) => (
        <button
          className={clsx(
            "rounded-md border px-3 py-3 text-left transition",
            value === option.value
              ? "border-brand bg-brand/10 text-foreground"
              : "border-border bg-white text-foreground hover:bg-surface-muted"
          )}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-black">{option.label}</span>
            {value === option.value ? <Check className="h-4 w-4 text-brand" aria-hidden="true" /> : null}
          </span>
          <span className="mt-1 block text-sm leading-6 text-muted">{option.description}</span>
        </button>
      ))}
    </div>
  );
}

function toFormState(settings: ApiVirtualAttendantSettings): FormState {
  return {
    aiEnabled: settings.aiEnabled,
    identityMode: settings.identityMode,
    assistantName: settings.assistantName,
    assistantSex: settings.assistantSex ?? "",
    professionalSex: settings.professionalSex,
    personaType: settings.personaType ?? "",
    activationMode: settings.activationMode,
    awayTimeoutMinutes: settings.awayTimeoutMinutes ? String(settings.awayTimeoutMinutes) : "",
    awayScope: settings.awayScope ?? "",
    customInstructions: settings.customInstructions,
  };
}

function readSettingsError(data: SettingsResponse | null): string {
  const firstIssue = data?.details?.readinessIssues?.[0];
  return firstIssue ?? data?.error ?? "Não foi possível salvar as configurações.";
}
