"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, BriefcaseBusiness, CalendarClock, Check, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import {
  APPOINTMENT_LOOKUP_DAYS_OPTIONS,
  AVAILABILITY_DAYS_OPTIONS,
  BRAZIL_TIMEZONES,
  DEFAULT_BUSINESS_SETTINGS,
  MAX_SLOTS_TO_OFFER_OPTIONS,
  SLOT_STEP_MINUTES_OPTIONS,
  type ApiBusinessSettings,
  type BusinessSettingsInput,
} from "@/lib/business-settings";
import { LoadingState } from "@/components/ui/LoadingState";

type BusinessSettingsResponse = {
  ok: boolean;
  businessSettings?: ApiBusinessSettings;
  error?: string;
  details?: unknown;
};

const timezoneLabels: Record<(typeof BRAZIL_TIMEZONES)[number], string> = {
  "America/Sao_Paulo": "Brasília e Sul/Sudeste",
  "America/Manaus": "Manaus",
  "America/Cuiaba": "Cuiabá",
  "America/Porto_Velho": "Porto Velho",
  "America/Boa_Vista": "Boa Vista",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
};

export function BusinessSettingsForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<BusinessSettingsInput>(DEFAULT_BUSINESS_SETTINGS);
  const [savedForm, setSavedForm] = useState<BusinessSettingsInput>(DEFAULT_BUSINESS_SETTINGS);

  const loadSettings = useCallback(async () => {
    const response = await fetch("/api/automation/business-settings", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }

    const data = (await response.json().catch(() => null)) as BusinessSettingsResponse | null;
    if (!response.ok || !data?.businessSettings) {
      setError(data?.error ?? "Não conseguimos carregar as configurações do negócio.");
      setLoading(false);
      return;
    }

    const next = toFormState(data.businessSettings);
    setForm(next);
    setSavedForm(next);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSettings();
    });
  }, [loadSettings]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const previewName = form.businessName.trim() || "seu negócio";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    const response = await fetch("/api/automation/business-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await response.json().catch(() => null)) as BusinessSettingsResponse | null;
    setSaving(false);

    if (response.status === 401) {
      router.replace("/login");
      return;
    }

    if (!response.ok || !data?.businessSettings) {
      setError(readValidationError(data?.details) ?? data?.error ?? "Não conseguimos salvar agora. Confira os campos e tente novamente.");
      return;
    }

    const next = toFormState(data.businessSettings);
    setForm(next);
    setSavedForm(next);
    setSuccess("Configurações do negócio salvas com sucesso.");
  }

  function update<K extends keyof BusinessSettingsInput>(key: K, value: BusinessSettingsInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSuccess("");
  }

  if (loading) {
    return <LoadingState label="Carregando configurações do negócio..." />;
  }

  return (
    <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSubmit}>
      <SettingsCard
        icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />}
        title="Identidade do negócio"
        description="Essas informações ajudam a IA a responder de forma personalizada e passar confiança para a cliente."
      >
        <TextField label="Nome do negócio" value={form.businessName} onChange={(value) => update("businessName", value)} required />
        <TextField
          label="Profissional ou responsável"
          value={form.professionalName ?? ""}
          onChange={(value) => update("professionalName", value)}
        />
        <TextField
          label="Endereço do atendimento"
          value={form.businessAddress ?? ""}
          onChange={(value) => update("businessAddress", value)}
        />
      </SettingsCard>

      <SettingsCard
        icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
        title="Agenda e disponibilidade"
        description="Essas regras controlam como a IA procura e oferece horários disponíveis para suas clientes."
      >
        <SelectField label="Fuso horário" value={form.timezone} onChange={(value) => update("timezone", value)}>
          {BRAZIL_TIMEZONES.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezoneLabels[timezone]} ({timezone})
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Máximo de horários por resposta"
          value={String(form.maxSlotsToOffer)}
          onChange={(value) => update("maxSlotsToOffer", Number(value))}
        >
          {MAX_SLOTS_TO_OFFER_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value} horário{value > 1 ? "s" : ""}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Horizonte de busca de disponibilidade"
          value={String(form.availabilityDays)}
          onChange={(value) => update("availabilityDays", Number(value))}
        >
          {AVAILABILITY_DAYS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              Próximos {value} dias
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Intervalo entre horários gerados"
          value={String(form.slotStepMinutes)}
          onChange={(value) => update("slotStepMinutes", Number(value))}
        >
          {SLOT_STEP_MINUTES_OPTIONS.map((value) => (
            <option key={value} value={value}>
              A cada {value} minutos
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Período para localizar agendamentos futuros"
          value={String(form.appointmentLookupDays)}
          onChange={(value) => update("appointmentLookupDays", Number(value))}
        >
          {APPOINTMENT_LOOKUP_DAYS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              Próximos {value} dias
            </option>
          ))}
        </SelectField>
      </SettingsCard>

      <SettingsCard
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
        title="Políticas de atendimento"
        description="A IA usará essas políticas somente quando o assunto aparecer na conversa, sem deixar o atendimento engessado."
      >
        <TextAreaField label="Política de atraso" value={form.delayPolicy ?? ""} onChange={(value) => update("delayPolicy", value)} />
        <TextAreaField
          label="Política de cancelamento"
          value={form.cancellationPolicy ?? ""}
          onChange={(value) => update("cancellationPolicy", value)}
        />
        <TextAreaField label="Política de sinal" value={form.depositPolicy ?? ""} onChange={(value) => update("depositPolicy", value)} />
      </SettingsCard>

      <SettingsCard
        icon={<Bot className="h-5 w-5" aria-hidden="true" />}
        title="Prévia da IA"
        description="Resumo do contexto que será enviado para a IA antes de responder clientes."
      >
        <div className="rounded-md border border-border bg-surface-muted p-4 text-sm leading-6 text-foreground">
          A IA vai atender em nome de <strong>{previewName}</strong>, considerando o fuso <strong>{form.timezone}</strong>,
          oferecendo até <strong>{form.maxSlotsToOffer}</strong> horário{form.maxSlotsToOffer > 1 ? "s" : ""} por resposta e
          buscando disponibilidade nos próximos <strong>{form.availabilityDays}</strong> dias.
        </div>

        {!form.businessName.trim() ? (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-6 text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Complete o nome do negócio para ativar a IA com segurança.
          </p>
        ) : null}
      </SettingsCard>

      <div className="lg:col-span-2">
        {error ? <p className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        {success ? <p className="mb-3 rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-strong">{success}</p> : null}

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
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Cancelar
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-black text-white transition hover:bg-brand-strong disabled:opacity-60"
            type="submit"
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-black text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-foreground">{label}</span>
      <input
        className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-foreground">{label}</span>
      <select
        className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-foreground">{label}</span>
      <textarea
        className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-white px-3 py-2 text-base leading-6 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function toFormState(settings: ApiBusinessSettings): BusinessSettingsInput {
  return {
    businessName: settings.businessName,
    professionalName: settings.professionalName ?? "",
    businessAddress: settings.businessAddress ?? "",
    timezone: settings.timezone,
    maxSlotsToOffer: settings.maxSlotsToOffer,
    availabilityDays: settings.availabilityDays,
    slotStepMinutes: settings.slotStepMinutes,
    appointmentLookupDays: settings.appointmentLookupDays,
    delayPolicy: settings.delayPolicy ?? "",
    cancellationPolicy: settings.cancellationPolicy ?? "",
    depositPolicy: settings.depositPolicy ?? "",
  };
}

function readValidationError(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors) return null;

  for (const messages of Object.values(fieldErrors)) {
    const first = messages?.[0];
    if (first) return first;
  }

  return null;
}
