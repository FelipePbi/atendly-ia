"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Circle, Clock, FileText, Loader2, ShieldCheck, Sparkles, Upload, UserRound } from "lucide-react";
import type { UserSex } from "@/generated/prisma/client";
import { LoadingState } from "@/components/ui/LoadingState";
import { PersonaChoiceCard } from "@/components/ia/PersonaChoiceCard";
import { QrCodePanel } from "@/components/whatsapp/QrCodePanel";
import { postAuthPath } from "@/lib/post-auth";
import {
  ACTIVATION_MODE_LABELS,
  ASSISTANT_SEX_LABELS,
  AWAY_SCOPE_LABELS,
  IDENTITY_MODE_LABELS,
  PERSONA_DEFINITIONS,
  type VirtualAttendantAssistantSex,
  type VirtualAttendantActivationMode,
  type VirtualAttendantAwayScope,
  type VirtualAttendantIdentityMode,
  type VirtualAttendantPersonaType,
} from "@/lib/virtual-attendant";
import type { ApiOnboarding, ApiOnboardingStep, ApiSettings, ApiUserProfile, ApiWhatsAppInstance } from "@/types/domain";

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

const stepLabels: Record<OnboardingScreenStep, string> = {
  PROFILE: "Dados",
  ATTENDANT_IDENTITY: "Identificação",
  ATTENDANT_PERSONA: "Persona",
  ATTENDANT_SETTINGS: "Configurações",
  WHATSAPP: "Conexão",
};

const sexOptions: Array<{ value: UserSex; label: string }> = [
  { value: "MALE", label: "Masculino" },
  { value: "FEMALE", label: "Feminino" },
  { value: "OTHER", label: "Outro" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefiro nao informar" },
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

  const assistantExampleName = assistantName.trim() || "Bea";
  const assistantExampleBusiness = businessName.trim() || "nome da empresa";
  const assistantArticle = assistantSex === "MALE" ? "o" : "a";
  const assistantGreeting = personaType === "CORPORATE" ? "Olá" : "Oii";
  const assistantIntroExample = `${assistantGreeting}, sou ${assistantArticle} ${assistantExampleName}, atendente pessoal da ${assistantExampleBusiness}.`;
  const personaVisualSex: VirtualAttendantAssistantSex =
    identityMode === "SEPARATE_ASSISTANT" ? assistantSex || "FEMALE" : professionalSex;

  return (
    <main className="min-h-dvh bg-background px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col rounded-lg border border-border bg-surface p-3 shadow-sm sm:min-h-[calc(100dvh-2rem)] sm:p-4 lg:min-h-0 lg:p-5">
        <header className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div>
              <h1 className="text-xl font-black text-foreground sm:text-2xl">Configuracao inicial</h1>
              <p className="mt-1 hidden max-w-xl text-sm leading-6 text-muted sm:block">
                Complete os dados do negocio, configure a atendente virtual e conecte o WhatsApp pelo QR Code.
              </p>
            </div>
          </div>
          <ol className="flex items-center gap-2 overflow-x-auto">
            {stepOrder.map((item, index) => {
              const active = step === item;
              const done = stepOrder.indexOf(step) > index || (item === "WHATSAPP" && instance?.status === "CONNECTED");
              return (
                <li
                  className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 text-sm ${
                    active
                      ? "border-brand/20 bg-brand/10 font-bold text-brand-strong"
                      : done
                        ? "border-border bg-white font-medium text-foreground"
                        : "border-border bg-white text-muted"
                  }`}
                  key={item}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-white">
                    {done ? <Check className="h-4 w-4 text-brand" /> : <Circle className="h-3 w-3" />}
                  </span>
                  {stepLabels[item]}
                </li>
              );
            })}
          </ol>
        </header>

        <section className="min-h-0 flex-1 pt-3 sm:pt-4">
          {step === "PROFILE" ? (
            <form className="space-y-3 sm:space-y-4" onSubmit={handleProfileSubmit}>
              <SectionTitle icon={<UserRound className="h-5 w-5" />} title="Dados basicos" />
              <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                <TextField label="Nome" value={fullName} onChange={setFullName} autoComplete="name" />
                <TextField label="Data de nascimento" value={birthDate} onChange={setBirthDate} type="date" />
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Sexo</span>
                  <select
                    className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
                    value={sex}
                    onChange={(event) => setSex(event.target.value as UserSex)}
                    required
                  >
                    <option value="">Selecione</option>
                    {sexOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField label="Nome do negocio" value={businessName} onChange={setBusinessName} />
              </div>
              <SubmitError error={error} />
              <SubmitButton loading={savingProfile} label="Continuar" loadingLabel="Salvando..." />
            </form>
          ) : null}

          {step === "ATTENDANT_IDENTITY" ? (
            <form className="space-y-3 sm:space-y-4" onSubmit={handleIdentitySubmit}>
              <SectionTitle icon={<Bot className="h-5 w-5" />} title="Como a IA se identifica" />
              <div className="rounded-md border border-border bg-white p-3 sm:p-4">
                <div className="flex items-center gap-2 text-brand">
                  <UserRound className="h-5 w-5" />
                  <h2 className="text-base font-black text-foreground">Identidade da atendente</h2>
                </div>
                <div className="mt-3 grid gap-2">
                  <button
                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                      identityMode === "PROFESSIONAL"
                        ? "border-brand bg-brand/10 text-foreground"
                        : "border-border bg-white text-muted hover:bg-surface-muted"
                    }`}
                    type="button"
                    onClick={() => setIdentityMode("PROFESSIONAL")}
                    aria-pressed={identityMode === "PROFESSIONAL"}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-black text-foreground">{IDENTITY_MODE_LABELS.PROFESSIONAL}</span>
                      {identityMode === "PROFESSIONAL" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-1 block leading-5">
                      A IA fala em nome da profissional ou do negócio. Não precisa de nome próprio e não se apresenta como uma atendente separada.
                    </span>
                  </button>
                  <button
                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                      identityMode === "SEPARATE_ASSISTANT"
                        ? "border-brand bg-brand/10 text-foreground"
                        : "border-border bg-white text-muted hover:bg-surface-muted"
                    }`}
                    type="button"
                    onClick={() => setIdentityMode("SEPARATE_ASSISTANT")}
                    aria-pressed={identityMode === "SEPARATE_ASSISTANT"}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-black text-foreground">{IDENTITY_MODE_LABELS.SEPARATE_ASSISTANT}</span>
                      {identityMode === "SEPARATE_ASSISTANT" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-1 block leading-5">
                      A IA usa uma identidade própria, com nome e sexo definidos por você, e se apresenta ao iniciar ou retomar o atendimento.
                    </span>
                  </button>
                </div>

                {identityMode === "SEPARATE_ASSISTANT" ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <label className="block">
                      <span className="text-sm font-medium text-foreground">Nome da atendente</span>
                      <input
                        className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
                        value={assistantName}
                        onChange={(event) => setAssistantName(event.target.value)}
                        placeholder="Ex: Bea, Sofia, Clara"
                        required
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="text-sm font-medium text-foreground">Sexo da atendente</span>
                      <select
                        className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
                        value={assistantSex}
                        onChange={(event) => setAssistantSex(event.target.value as VirtualAttendantAssistantSex | "")}
                        required
                      >
                        <option value="">Selecione</option>
                        <option value="FEMALE">{ASSISTANT_SEX_LABELS.FEMALE}</option>
                        <option value="MALE">{ASSISTANT_SEX_LABELS.MALE}</option>
                      </select>
                    </label>
                    <p className="mt-3 rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
                      Exemplo: {assistantIntroExample}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-muted">
                      Neste modo, a IA responde como extensão da profissional. O cliente não verá uma apresentação com nome de atendente.
                    </p>
                    <label className="mt-3 block">
                      <span className="text-sm font-medium text-foreground">Imagem da profissional</span>
                      <select
                        className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
                        value={professionalSex}
                        onChange={(event) => setProfessionalSex(event.target.value as VirtualAttendantAssistantSex)}
                      >
                        <option value="FEMALE">{ASSISTANT_SEX_LABELS.FEMALE}</option>
                        <option value="MALE">{ASSISTANT_SEX_LABELS.MALE}</option>
                      </select>
                    </label>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Essa escolha define as imagens usadas nos cards de persona quando a IA responde como a profissional.
                    </p>
                  </div>
                )}
              </div>
              <SubmitError error={error} />
              <SubmitButton loading={false} label="Continuar" loadingLabel="Continuando..." />
            </form>
          ) : null}

          {step === "ATTENDANT_PERSONA" ? (
            <form className="space-y-3 sm:space-y-4" onSubmit={handlePersonaSubmit}>
              <SectionTitle icon={<Sparkles className="h-5 w-5" />} title="Persona" />
              <div className="grid gap-3">
                {(Object.keys(PERSONA_DEFINITIONS) as VirtualAttendantPersonaType[]).map((persona) => (
                  <PersonaChoiceCard
                    key={persona}
                    persona={persona}
                    selected={personaType === persona}
                    visualSex={personaVisualSex}
                    onSelect={() => setPersonaType(persona)}
                  >
                    {persona === "CUSTOM" && personaType === "CUSTOM" ? (
                      <>
                        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm font-bold leading-5 text-foreground">
                          Envie pelo menos 3 conversas reais com clientes, exportadas do WhatsApp em .txt, para a IA aprender o jeito de atendimento do seu negócio.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          Use conversas de atendimento reais, não arquivos de teste. O conteúdo bruto é processado e descartado; salvamos apenas o perfil de estilo gerado.
                        </p>
                        <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm font-bold text-foreground">
                          Status: {customPersonaStatus}
                        </p>
                        <input
                          className="mt-3 block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-black file:text-white"
                          type="file"
                          accept=".txt,text/plain"
                          multiple
                          onChange={updatePersonaFiles}
                        />
                        {participants.length > 0 ? (
                          <label className="mt-3 block">
                            <span className="text-sm font-medium text-foreground">Participante profissional</span>
                            <select
                              className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
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
                        <button
                          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-black text-foreground transition hover:bg-surface-muted disabled:opacity-60"
                          type="button"
                          onClick={uploadCustomPersonaFiles}
                          disabled={uploadingPersona}
                        >
                          {uploadingPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {uploadingPersona ? "Processando..." : "Importar conversas"}
                        </button>
                        {personaImports?.slice(0, 3).map((item) => (
                          <p className="mt-2 flex items-center gap-2 text-xs text-muted" key={item.id}>
                            <FileText className="h-4 w-4" />
                            {item.fileName} · {item.status}
                          </p>
                        ))}
                      </>
                    ) : null}
                  </PersonaChoiceCard>
                ))}
              </div>
              <SubmitError error={error} />
              <SubmitButton loading={false} label="Continuar" loadingLabel="Continuando..." />
            </form>
          ) : null}

          {step === "ATTENDANT_SETTINGS" ? (
            <form className="space-y-3 sm:space-y-4" onSubmit={handleAssistantSubmit}>
              <SectionTitle icon={<Clock className="h-5 w-5" />} title="Configurações iniciais" />
              <div className="rounded-md border border-border bg-white p-3 sm:p-4">
                <p className="text-sm leading-6 text-muted">
                  Defina em quais situações a atendente virtual pode responder. Essa escolha evita respostas automáticas quando você preferir assumir o atendimento pelo WhatsApp.
                </p>
                <div className="mt-3 grid gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-foreground">Quando a IA entra em ação</span>
                    <select
                      className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
                      value={activationMode}
                      onChange={(event) => setActivationMode(event.target.value as VirtualAttendantActivationMode)}
                    >
                      <option value="ALWAYS">{ACTIVATION_MODE_LABELS.ALWAYS}</option>
                      <option value="AWAY_FROM_WHATSAPP">{ACTIVATION_MODE_LABELS.AWAY_FROM_WHATSAPP}</option>
                    </select>
                  </label>
                  <p className="rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-muted">
                    {activationMode === "ALWAYS"
                      ? "A IA pode responder a qualquer momento, mas ainda respeita WhatsApp conectado, lista de ignorados, conversas pausadas, debounce e as regras de segurança."
                      : "A IA só responde quando você ficar sem atividade manual no WhatsApp pelo tempo definido abaixo. Esse modo exige tempo mínimo de inatividade e escopo de ausência."}
                  </p>

                  {activationMode === "AWAY_FROM_WHATSAPP" ? (
                    <>
                      <TextField
                        label="Minutos sem atividade"
                        value={awayTimeoutMinutes}
                        onChange={setAwayTimeoutMinutes}
                        type="number"
                        min={1}
                      />
                      <label className="block">
                        <span className="text-sm font-medium text-foreground">Escopo da ausência</span>
                        <select
                          className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
                          value={awayScope}
                          onChange={(event) => setAwayScope(event.target.value as VirtualAttendantAwayScope)}
                          required
                        >
                          <option value="">Selecione</option>
                          <option value="GLOBAL">{AWAY_SCOPE_LABELS.GLOBAL}</option>
                          <option value="CONVERSATION">{AWAY_SCOPE_LABELS.CONVERSATION}</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
              <SubmitError error={error} />
              <SubmitButton loading={savingAssistant} label="Continuar" loadingLabel="Salvando..." />
            </form>
          ) : null}

          {step === "WHATSAPP" ? (
            <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(220px,0.75fr)_minmax(320px,1fr)] lg:items-start">
              <div className="rounded-md bg-surface-muted px-3 py-3 sm:px-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 text-sm leading-6 text-muted">
                    <h2 className="text-base font-black text-foreground">Pareamento seguro</h2>
                    <p className="mt-1">
                      Escaneie com o WhatsApp do celular para autorizar este painel a receber e responder conversas.
                    </p>
                    <p className="mt-1 text-xs leading-5 sm:text-sm">
                      O numero conectado sera identificado automaticamente apos a leitura.
                    </p>
                  </div>
                </div>
                <SubmitError error={error} />
                {whatsAppLoading ? (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-bold text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparando QR Code...
                  </div>
                ) : null}
              </div>
              <QrCodePanel
                qrcode={qrcode ?? instance?.qrcode ?? null}
                expired={instance?.status === "QR_EXPIRED"}
                loading={refreshingQr || whatsAppLoading || qrPending}
                onRefresh={refreshQr}
                compact
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-brand">
      {icon}
      <h2 className="text-base font-black text-foreground sm:text-lg">{title}</h2>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "onChange" | "type" | "value">) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 sm:mt-2 sm:h-12"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        {...inputProps}
      />
    </label>
  );
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-base font-bold text-white transition hover:bg-brand-strong disabled:opacity-60 sm:h-12"
      type="submit"
      disabled={loading}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
      {loading ? loadingLabel : label}
    </button>
  );
}

function SubmitError({ error }: { error: string }) {
  return error ? (
    <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
  ) : null;
}

function isMissingEvolutionInstance(error: string | undefined): boolean {
  return Boolean(error?.includes("instancia da Evolution nao foi encontrada"));
}
