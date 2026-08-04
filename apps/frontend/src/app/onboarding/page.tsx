"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  FileText,
  Loader2,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
} from "lucide-react";
import { PersonaChoiceCard } from "@/components/ia/PersonaChoiceCard";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { ChoiceCard, ChoiceGroup, RadioCard } from "@/components/ui/SelectionCard";
import { QrCodePanel } from "@/components/whatsapp/QrCodePanel";
import { postAuthPath } from "@/lib/post-auth";
import {
  PERSONA_DEFINITIONS,
  type VirtualAttendantAssistantSex,
  type VirtualAttendantActivationMode,
  type VirtualAttendantAwayScope,
  type VirtualAttendantIdentityMode,
  type VirtualAttendantPersonaType,
} from "@/lib/virtual-attendant";
import type { ApiOnboarding, ApiOnboardingStep, ApiSettings, ApiUserProfile, ApiWhatsAppInstance, UserSex } from "@/types/domain";

type OnboardingResponse = {
  ok: boolean;
  error?: string;
  profile: ApiUserProfile | null;
  onboarding: ApiOnboarding;
  whatsappInstance: ApiWhatsAppInstance | null;
  settings?: ApiSettings;
  details?: {
    whatsappInstance?: ApiWhatsAppInstance | null;
  };
};

type PersonaImportResponse = {
  ok: boolean;
  settings?: ApiSettings;
  imports?: Array<{
    id: string;
    fileName: string;
    status: string;
    extractedCount: number | null;
    errorMessage: string | null;
  }>;
  participantSelectionRequired?: boolean;
  participants?: string[];
  error?: string;
};

type OnboardingScreenStep =
  | "PROFILE"
  | "ATTENDANT_IDENTITY"
  | "ATTENDANT_PERSONA"
  | "ATTENDANT_SETTINGS"
  | "WHATSAPP";

const stepOrder: OnboardingScreenStep[] = [
  "PROFILE",
  "ATTENDANT_IDENTITY",
  "ATTENDANT_PERSONA",
  "ATTENDANT_SETTINGS",
  "WHATSAPP",
];

const sexOptions: Array<SegmentedOption<UserSex | "">> = [
  { value: "FEMALE", label: "Feminino" },
  { value: "MALE", label: "Masculino" },
  { value: "PREFER_NOT_TO_SAY", label: "Não informar" },
];

type VisualSexOption = VirtualAttendantAssistantSex | "NEUTRAL" | "";

const visualSexOptions: Array<SegmentedOption<VisualSexOption>> = [
  { value: "FEMALE", label: "Feminino", icon: <span className="onboarding-visual-dot" data-tone="brand" /> },
  { value: "MALE", label: "Masculino", icon: <span className="onboarding-visual-dot" /> },
  { value: "NEUTRAL", label: "Neutro", icon: <span className="onboarding-visual-dot" />, disabled: true },
];

function resolveScreenStep(step: ApiOnboardingStep): OnboardingScreenStep {
  if (step === "COMPLETE") return "WHATSAPP";
  if (step === "VIRTUAL_ATTENDANT") return "ATTENDANT_IDENTITY";
  return step;
}

export default function OnboardingPage() {
  const router = useRouter();
  const completeStarted = useRef(false);
  const whatsAppStarted = useRef(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<OnboardingScreenStep>("PROFILE");
  const [instance, setInstance] = useState<ApiWhatsAppInstance | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAssistant, setSavingAssistant] = useState(false);
  const [uploadingPersona, setUploadingPersona] = useState(false);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [refreshingQr, setRefreshingQr] = useState(false);
  const [qrPending, setQrPending] = useState(false);

  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<UserSex | "">("");
  const [businessName, setBusinessName] = useState("");
  const [identityMode, setIdentityMode] = useState<VirtualAttendantIdentityMode>("PROFESSIONAL");
  const [assistantName, setAssistantName] = useState("");
  const [assistantSex, setAssistantSex] = useState<VirtualAttendantAssistantSex | "">("");
  const [professionalSex, setProfessionalSex] = useState<VirtualAttendantAssistantSex>("FEMALE");
  const [personaType, setPersonaType] = useState<VirtualAttendantPersonaType | "WARM">("WARM");
  const [activationMode, setActivationMode] = useState<VirtualAttendantActivationMode>("ALWAYS");
  const [awayTimeoutMinutes, setAwayTimeoutMinutes] = useState("");
  const [awayScope, setAwayScope] = useState<VirtualAttendantAwayScope | "">("");
  const [customPersonaStatus, setCustomPersonaStatus] = useState<ApiSettings["customPersonaStatus"]>("NOT_STARTED");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantName, setParticipantName] = useState("");
  const [personaImports, setPersonaImports] = useState<PersonaImportResponse["imports"]>([]);

  const hydrate = useCallback((data: OnboardingResponse) => {
    setInstance(data.whatsappInstance ?? data.details?.whatsappInstance ?? null);
    setStep(resolveScreenStep(data.onboarding.currentStep));

    if (data.profile) {
      setFullName(data.profile.fullName);
      setBirthDate(data.profile.birthDate ?? "");
      setSex(data.profile.sex);
      setBusinessName(data.profile.businessName);
    }

    if (data.settings) {
      setIdentityMode(data.settings.identityMode);
      setAssistantName(data.settings.assistantName);
      setAssistantSex(data.settings.assistantSex ?? "");
      setProfessionalSex(data.settings.professionalSex ?? "FEMALE");
      setPersonaType(data.settings.personaType ?? "WARM");
      setActivationMode(data.settings.activationMode);
      setAwayTimeoutMinutes(data.settings.awayTimeoutMinutes ? String(data.settings.awayTimeoutMinutes) : "");
      setAwayScope(data.settings.awayScope ?? "");
      setCustomPersonaStatus(data.settings.customPersonaStatus);
    }
  }, []);

  const loadOnboarding = useCallback(async () => {
    const response = await fetch("/api/onboarding", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }

    const data = (await response.json()) as OnboardingResponse;
    if (!response.ok) {
      setError(data.error ?? "Nao foi possivel carregar o onboarding.");
      setLoading(false);
      return;
    }

    const redirectTo = postAuthPath({
      onboarding: data.onboarding,
      whatsappInstance: data.whatsappInstance,
    });

    if (redirectTo !== "/onboarding") {
      router.replace(redirectTo);
      return;
    }

    hydrate(data);
    setLoading(false);
  }, [hydrate, router]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadOnboarding();
    });
  }, [loadOnboarding]);

  const recoverWhatsAppInstance = useCallback(async () => {
    setError("Criando uma nova instancia na Evolution...");

    const createResponse = await fetch("/api/whatsapp/instance", { method: "POST" });
    const createData = await createResponse.json();
    if (!createResponse.ok) {
      setQrPending(false);
      setError(createData.error ?? "Nao foi possivel criar a instancia.");
      return false;
    }

    setInstance(createData.whatsappInstance);
    await fetch("/api/whatsapp/connect", { method: "POST" });
    setError("");
    return true;
  }, []);

  const completeOnboarding = useCallback(async () => {
    if (completeStarted.current) return;
    completeStarted.current = true;
    setError("");

    const response = await fetch("/api/onboarding/complete", { method: "POST" });
    const data = (await response.json()) as OnboardingResponse;

    if (!response.ok) {
      completeStarted.current = false;
      setInstance(data.whatsappInstance ?? data.details?.whatsappInstance ?? instance);
      setError(data.error ?? "Nao foi possivel finalizar o onboarding.");
      return;
    }

    router.replace("/chat");
  }, [instance, router]);

  const loadQrAndStatus = useCallback(async () => {
    try {
      const statusResponse = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const statusData = (await statusResponse.json()) as OnboardingResponse;

      if (!statusResponse.ok) {
        setInstance(statusData.whatsappInstance ?? statusData.details?.whatsappInstance ?? null);
        setQrPending(false);
        if (isMissingEvolutionInstance(statusData.error)) {
          await recoverWhatsAppInstance();
          return;
        }
        setError(statusData.error ?? "Nao foi possivel verificar a conexao.");
        return;
      }

      setInstance(statusData.whatsappInstance);
      if (statusData.whatsappInstance?.status === "CONNECTED") {
        setQrcode(null);
        await completeOnboarding();
        return;
      }

      const qrResponse = await fetch("/api/whatsapp/qr", { cache: "no-store" });
      const qrData = await qrResponse.json();
      if (qrResponse.ok) {
        setQrcode(qrData.qrcode || null);
        setInstance(qrData.whatsappInstance ?? statusData.whatsappInstance);
        setQrPending(Boolean(qrData.pending) && !qrData.qrcode);
      } else {
        setQrPending(false);
        if (isMissingEvolutionInstance(qrData.error)) {
          await recoverWhatsAppInstance();
          return;
        }
        setError(qrData.error ?? "Nao foi possivel gerar o QR Code.");
      }
    } catch {
      setQrPending(false);
      setError("Nao foi possivel verificar o QR Code agora.");
    }
  }, [completeOnboarding, recoverWhatsAppInstance]);

  const prepareWhatsApp = useCallback(async () => {
    setError("");
    setWhatsAppLoading(true);

    const createResponse = await fetch("/api/whatsapp/instance", { method: "POST" });
    const createData = await createResponse.json();
    if (!createResponse.ok) {
      setError(createData.error ?? "Nao foi possivel criar a instancia.");
      setWhatsAppLoading(false);
      return;
    }

    setInstance(createData.whatsappInstance);

    await fetch("/api/whatsapp/connect", { method: "POST" });

    await loadQrAndStatus();
    setWhatsAppLoading(false);
  }, [loadQrAndStatus]);

  useEffect(() => {
    if (step !== "WHATSAPP" || whatsAppStarted.current) return;
    whatsAppStarted.current = true;
    queueMicrotask(() => {
      void prepareWhatsApp();
    });
  }, [prepareWhatsApp, step]);

  useEffect(() => {
    if (step !== "WHATSAPP" || !instance || instance.status === "CONNECTED") return;

    const interval = window.setInterval(() => {
      void loadQrAndStatus();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [instance, loadQrAndStatus, step]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sex) return;

    setError("");
    setSavingProfile(true);
    const response = await fetch("/api/onboarding/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName,
        birthDate,
        sex,
        businessName,
      }),
    });
    const data = (await response.json()) as OnboardingResponse;
    setSavingProfile(false);

    if (!response.ok) {
      setError(data.error ?? "Nao foi possivel salvar os dados.");
      return;
    }

    hydrate({ ...data, whatsappInstance: instance, onboarding: data.onboarding });
    completeStarted.current = false;
    whatsAppStarted.current = false;
    setStep(resolveScreenStep(data.onboarding.currentStep));
  }

  function handleIdentitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (identityMode === "SEPARATE_ASSISTANT") {
      if (!assistantName.trim()) {
        setError("Defina o nome da atendente virtual.");
        return;
      }

      if (!assistantSex) {
        setError("Defina o sexo da atendente virtual.");
        return;
      }
    }

    setStep("ATTENDANT_PERSONA");
  }

  function handlePersonaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (personaType === "CUSTOM" && customPersonaStatus !== "READY") {
      setError("Gere a persona personalizada com pelo menos 3 conversas TXT válidas.");
      return;
    }

    setStep("ATTENDANT_SETTINGS");
  }

  async function handleAssistantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSavingAssistant(true);

    const response = await fetch("/api/virtual-attendant/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assistantName,
        assistantSex: assistantSex || null,
        professionalSex,
        identityMode,
        personaType,
        activationMode,
        awayTimeoutMinutes: activationMode === "AWAY_FROM_WHATSAPP" ? Number(awayTimeoutMinutes) : null,
        awayScope: activationMode === "AWAY_FROM_WHATSAPP" ? awayScope || null : null,
        aiEnabled: false,
        virtualAttendantOnboardingCompleted: true,
      }),
    });
    const data = (await response.json().catch(() => null)) as OnboardingResponse | null;
    setSavingAssistant(false);

    if (!response.ok) {
      setError(data?.error ?? "Nao foi possivel salvar a Atendente Virtual.");
      return;
    }

    completeStarted.current = false;
    whatsAppStarted.current = false;
    setStep("WHATSAPP");
  }

  async function uploadCustomPersonaFiles() {
    if (selectedFiles.length === 0) {
      setError("Selecione pelo menos 3 arquivos .txt exportados do WhatsApp.");
      return;
    }

    setUploadingPersona(true);
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
    const data = (await response.json().catch(() => null)) as PersonaImportResponse | null;
    setUploadingPersona(false);

    if (!response.ok || !data) {
      setError(data?.error ?? "Nao foi possivel processar os arquivos.");
      return;
    }

    setPersonaImports(data.imports ?? []);
    setParticipants(data.participants ?? []);

    if (data.settings) {
      setPersonaType(data.settings.personaType ?? "CUSTOM");
      setCustomPersonaStatus(data.settings.customPersonaStatus);
    }

    if (data.participantSelectionRequired) {
      setError("Selecione qual participante representa voce e envie os mesmos arquivos novamente.");
      return;
    }

    if (data.error) {
      setError(data.error);
      return;
    }

    setSelectedFiles([]);
    setParticipantName("");
  }

  function updatePersonaFiles(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFiles(Array.from(event.target.files ?? []));
    setError("");
  }

  async function refreshQr() {
    setRefreshingQr(true);
    setError("");
    const createResponse = await fetch("/api/whatsapp/instance", { method: "POST" });
    const createData = await createResponse.json();
    if (createResponse.ok) {
      setInstance(createData.whatsappInstance);
    } else {
      setError(createData.error ?? "Nao foi possivel criar a instancia.");
      setRefreshingQr(false);
      return;
    }
    await fetch("/api/whatsapp/connect", { method: "POST" });
    await loadQrAndStatus();
    setRefreshingQr(false);
  }

  if (loading) {
    return <LoadingState label="Abrindo onboarding..." />;
  }

  const personaVisualSex: VirtualAttendantAssistantSex =
    identityMode === "SEPARATE_ASSISTANT" ? assistantSex || "FEMALE" : professionalSex;
  const currentStep = stepOrder.indexOf(step);
  const screenMeta: Record<
    OnboardingScreenStep,
    { title: string; subtitle: string; mobileTitle?: string; mobileSubtitle?: string; tone?: "mint" | "violet" }
  > = {
    PROFILE: {
      title: "Dados básicos",
      subtitle: "Informe seus dados para personalizar o atendimento inicial.",
    },
    ATTENDANT_IDENTITY: {
      title: "Como a Atendly deve se apresentar?",
      mobileTitle: "Como a Atendly se apresenta?",
      subtitle: "Escolha como a Atendly se apresenta ao cliente.",
    },
    ATTENDANT_PERSONA: {
      title: "Como a Atendly deve conversar?",
      subtitle: "Escolha um estilo. Você poderá ajustar o tom depois.",
      tone: "violet",
    },
    ATTENDANT_SETTINGS: {
      title: "Configurações iniciais",
      subtitle: "Defina quando a Atendly pode assumir o atendimento.",
      mobileSubtitle: "Defina quando a Atendly pode responder.",
      tone: "violet",
    },
    WHATSAPP: {
      title: "Conecte seu WhatsApp.",
      subtitle: "Abra o WhatsApp e escaneie o código abaixo.",
    },
  };
  const meta = screenMeta[step];

  return (
    <OnboardingShell
      currentStep={currentStep}
      title={meta.title}
      subtitle={meta.subtitle}
      mobileTitle={meta.mobileTitle}
      mobileSubtitle={meta.mobileSubtitle}
      tone={meta.tone}
      headerAddon={
        step === "ATTENDANT_PERSONA" ? (
          <div className="onboarding-persona-toolbar">
            <span className="onboarding-persona-toolbar__label">Visual do avatar</span>
            <SegmentedControl<VisualSexOption>
              label="Visual do avatar"
              value={personaVisualSex}
              options={visualSexOptions}
              onChange={(value) => {
                if (value === "NEUTRAL" || value === "") return;
                if (identityMode === "SEPARATE_ASSISTANT") setAssistantSex(value);
                else setProfessionalSex(value);
              }}
            />
          </div>
        ) : undefined
      }
    >
      {step === "PROFILE" ? (
        <form className="onboarding-step-form" onSubmit={handleProfileSubmit}>
          <div className="onboarding-step-content">
            <div className="onboarding-fields-grid">
              <FormField
                id="full-name"
                label="Nome"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Digite seu nome"
                autoComplete="name"
                required
              />
              <FormField
                id="birth-date"
                label="Data de nascimento"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                type="date"
                required
              />
              <div className="onboarding-field-group">
                <span className="onboarding-field-label">Gênero</span>
                <SegmentedControl<UserSex | "">
                  label="Gênero"
                  value={sex}
                  options={sexOptions}
                  onChange={setSex}
                />
              </div>
              <FormField
                id="business-name"
                label="Nome do negócio"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Ex.: Studio Aurora"
                autoComplete="organization"
                required
              />
            </div>
            <p className="onboarding-inline-note onboarding-mobile-only">
              Você poderá atualizar esses dados depois.
            </p>
            <SubmitError error={error} />
          </div>
          <StepFooter loading={savingProfile} loadingLabel="Salvando..." />
        </form>
      ) : null}

      {step === "ATTENDANT_IDENTITY" ? (
        <form className="onboarding-step-form" onSubmit={handleIdentitySubmit}>
          <div className="onboarding-step-content">
            <div className="onboarding-selection-grid">
              <RadioCard
                title="Como a profissional"
                description="Fala em nome do negócio."
                selected={identityMode === "PROFESSIONAL"}
                onClick={() => setIdentityMode("PROFESSIONAL")}
              />
              <RadioCard
                title="Atendente à parte"
                description="Usa nome e identidade próprios."
                selected={identityMode === "SEPARATE_ASSISTANT"}
                onClick={() => setIdentityMode("SEPARATE_ASSISTANT")}
              />
            </div>

            <div className="onboarding-content-card">
              <h3 className="onboarding-content-card__title">
                {identityMode === "PROFESSIONAL" ? "Avatar da profissional" : "Identidade da atendente"}
              </h3>
              <p className="onboarding-content-card__description">
                {identityMode === "PROFESSIONAL"
                  ? "Escolha apenas a apresentação visual. O tom da conversa será definido na próxima etapa."
                  : "Escolha o nome e a apresentação visual usada nas conversas."}
              </p>

              {identityMode === "SEPARATE_ASSISTANT" ? (
                <FormField
                  id="assistant-name"
                  className="onboarding-content-card__field"
                  label="Nome da atendente"
                  value={assistantName}
                  onChange={(event) => setAssistantName(event.target.value)}
                  placeholder="Ex.: Bea"
                  required
                />
              ) : null}

              <span className="onboarding-content-card__label">Gênero visual</span>
              <SegmentedControl<VisualSexOption>
                label="Gênero visual"
                value={identityMode === "SEPARATE_ASSISTANT" ? assistantSex : professionalSex}
                options={visualSexOptions}
                onChange={(value) => {
                  if (value === "NEUTRAL" || value === "") return;
                  if (identityMode === "SEPARATE_ASSISTANT") setAssistantSex(value);
                  else setProfessionalSex(value);
                }}
              />
              {identityMode === "PROFESSIONAL" ? (
                <p className="onboarding-identity-note">
                  <span className="responsive-copy--desktop">
                    Ao selecionar “Atendente à parte”, serão exibidos também Nome, Gênero Visual e Avatar.
                  </span>
                  <span className="responsive-copy--mobile">
                    Na opção “Atendente à parte”, também pediremos o nome da atendente.
                  </span>
                </p>
              ) : null}
            </div>
            <SubmitError error={error} />
          </div>
          <StepFooter />
        </form>
      ) : null}

      {step === "ATTENDANT_PERSONA" ? (
        <form className="onboarding-step-form onboarding-step-form--persona" onSubmit={handlePersonaSubmit}>
          <div className="onboarding-step-content">
            <div className="onboarding-personas">
              {(Object.keys(PERSONA_DEFINITIONS) as VirtualAttendantPersonaType[]).map((persona) => (
                <PersonaChoiceCard
                  key={persona}
                  persona={persona}
                  selected={personaType === persona}
                  visualSex={personaVisualSex}
                  onSelect={() => setPersonaType(persona)}
                >
                  {persona === "CUSTOM" && personaType === "CUSTOM" ? (
                    <div className="onboarding-upload">
                      <p className="onboarding-inline-note">
                        Envie pelo menos 3 conversas reais do WhatsApp em formato .txt. O conteúdo bruto é
                        descartado após gerar o perfil de estilo.
                      </p>
                      <span className="onboarding-persona-toolbar__label">Status: {customPersonaStatus}</span>
                      <input type="file" accept=".txt,text/plain" multiple onChange={updatePersonaFiles} />
                      {participants.length > 0 ? (
                        <label className="ui-field-label">
                          <span>Participante profissional</span>
                          <select
                            className="ui-field"
                            value={participantName}
                            onChange={(event) => setParticipantName(event.target.value)}
                          >
                            <option value="">Selecione</option>
                            {participants.map((participant) => (
                              <option key={participant} value={participant}>
                                {participant}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth
                        onClick={uploadCustomPersonaFiles}
                        disabled={uploadingPersona}
                        icon={
                          uploadingPersona ? (
                            <Loader2 className="ui-spin" aria-hidden="true" />
                          ) : (
                            <Upload aria-hidden="true" />
                          )
                        }
                      >
                        {uploadingPersona ? "Processando..." : "Importar conversas"}
                      </Button>
                      {personaImports?.slice(0, 3).map((item) => (
                        <p className="onboarding-import-status" key={item.id}>
                          <FileText aria-hidden="true" />
                          {item.fileName} · {item.status}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </PersonaChoiceCard>
              ))}
            </div>
            <SubmitError error={error} />
          </div>
          <StepFooter />
        </form>
      ) : null}

      {step === "ATTENDANT_SETTINGS" ? (
        <form className="onboarding-step-form" onSubmit={handleAssistantSubmit}>
          <div className="onboarding-step-content">
            <div className="onboarding-choice-card">
              <p className="onboarding-choice-card__intro">
                <span className="responsive-copy--desktop">
                  Escolha quando a Atendly responde. Você poderá alterar essa configuração depois.
                </span>
                <span className="responsive-copy--mobile">
                  Escolha quando a Atendly responde. Você pode mudar isso depois.
                </span>
              </p>
              <span className="onboarding-choice-card__label">Quando a IA entra em ação</span>
              <ChoiceGroup label="Momento de ativação da atendente">
                <ChoiceCard
                  title="A qualquer momento"
                  description="Atende automaticamente, 24h por dia."
                  selected={activationMode === "ALWAYS"}
                  onClick={() => setActivationMode("ALWAYS")}
                  icon={<Sparkles aria-hidden="true" />}
                />
                <ChoiceCard
                  title="Fora do horário"
                  description="Assume quando sua equipe estiver ausente."
                  selected={activationMode === "AWAY_FROM_WHATSAPP"}
                  onClick={() => setActivationMode("AWAY_FROM_WHATSAPP")}
                  icon={<Moon aria-hidden="true" />}
                />
                <ChoiceCard
                  title="Após espera"
                  description="Entra se ninguém responder a conversa."
                  selected={false}
                  disabled
                  icon={<Clock3 aria-hidden="true" />}
                />
              </ChoiceGroup>

              {activationMode === "AWAY_FROM_WHATSAPP" ? (
                <div className="onboarding-away-fields">
                  <FormField
                    id="away-timeout"
                    label="Minutos sem atividade"
                    value={awayTimeoutMinutes}
                    onChange={(event) => setAwayTimeoutMinutes(event.target.value)}
                    type="number"
                    min={1}
                    required
                  />
                  <label className="ui-field-label">
                    <span>Escopo da ausência</span>
                    <select
                      className="ui-field"
                      value={awayScope}
                      onChange={(event) => setAwayScope(event.target.value as VirtualAttendantAwayScope)}
                      required
                    >
                      <option value="">Selecione</option>
                      <option value="GLOBAL">Todo o WhatsApp</option>
                      <option value="CONVERSATION">Somente a conversa</option>
                    </select>
                  </label>
                </div>
              ) : null}

              <p className="onboarding-choice-card__safety">
                <span className="responsive-copy--desktop">
                  Proteção ativa: conversas pausadas, contatos ignorados e regras de segurança continuam sendo
                  respeitados.
                </span>
                <span className="responsive-copy--mobile">
                  Proteção ativa: pausas, contatos ignorados e regras de segurança continuam sendo respeitados.
                </span>
              </p>
            </div>
            <SubmitError error={error} />
          </div>
          <StepFooter loading={savingAssistant} loadingLabel="Salvando..." />
        </form>
      ) : null}

      {step === "WHATSAPP" ? (
        <div className="onboarding-step-static">
          <div className="onboarding-step-content">
            <details className="onboarding-mobile-pairing">
              <summary>Como conectar</summary>
              <ol>
                <li>Abra o WhatsApp no celular.</li>
                <li>Acesse Aparelhos conectados.</li>
                <li>Escaneie o QR Code ao lado.</li>
              </ol>
            </details>
            <div className="onboarding-qr-grid">
              <div className="onboarding-pairing">
                <h3 className="onboarding-pairing__title">
                  <span className="onboarding-pairing__icon">
                    <ShieldCheck aria-hidden="true" />
                  </span>
                  Pareamento seguro
                </h3>
                <p className="onboarding-pairing__description">Siga os três passos no celular.</p>
                <ol className="onboarding-pairing__steps">
                  <li>
                    <span>1</span> Abra o WhatsApp no celular.
                  </li>
                  <li>
                    <span>2</span> Acesse Aparelhos conectados.
                  </li>
                  <li>
                    <span>3</span> Aponte a câmera para o QR Code.
                  </li>
                </ol>
                <Badge className="onboarding-qr-status onboarding-qr-status--desktop" tone="status" dot>
                  Aguardando leitura segura
                </Badge>
              </div>
              <QrCodePanel
                qrcode={qrcode ?? instance?.qrcode ?? null}
                expired={instance?.status === "QR_EXPIRED"}
                loading={refreshingQr || whatsAppLoading || qrPending}
                onRefresh={refreshQr}
                compact
              />
            </div>
            <Badge className="onboarding-qr-status onboarding-qr-status--mobile" tone="status" dot>
              Aguardando leitura segura
            </Badge>
            {whatsAppLoading ? (
              <p className="onboarding-connection-status">
                <Loader2 className="ui-spin" aria-hidden="true" /> Preparando QR Code...
              </p>
            ) : null}
            <SubmitError error={error} />
          </div>
          <footer className="onboarding-step-footer onboarding-step-footer--connect">
            <Button
              type="button"
              onClick={() => {
                if (instance?.status === "CONNECTED") void completeOnboarding();
                else void loadQrAndStatus();
              }}
              disabled={whatsAppLoading || refreshingQr}
              icon={<Smartphone aria-hidden="true" />}
            >
              <span className="onboarding-finish-copy onboarding-finish-copy--desktop">
                Finalizar configuração
              </span>
              <span className="onboarding-finish-copy onboarding-finish-copy--mobile">Finalizar</span>
            </Button>
          </footer>
        </div>
      ) : null}
    </OnboardingShell>
  );
}

function StepFooter({ loading = false, loadingLabel = "Continuando..." }: { loading?: boolean; loadingLabel?: string }) {
  return (
    <footer className="onboarding-step-footer">
      <Button
        type="submit"
        disabled={loading}
        icon={loading ? <Loader2 className="ui-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
      >
        {loading ? loadingLabel : "Continuar"}
      </Button>
    </footer>
  );
}

function SubmitError({ error }: { error: string }) {
  return error ? (
    <p className="onboarding-error" role="alert">
      {error}
    </p>
  ) : null;
}

function isMissingEvolutionInstance(error: string | undefined): boolean {
  return Boolean(error?.includes("instancia da Evolution nao foi encontrada"));
}
