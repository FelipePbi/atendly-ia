import { useEffect, useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import {
  buildDemoConversation,
  type DemoItem,
  type DemoTone,
  demoToneSample,
} from "../demo";
import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import { Choice, type OnboardingStepContext } from "./shared";

// Intervalo (ms) antes de cada item seguinte: o primeiro já está na tela no
// primeiro quadro e o último entra em 11,2 s (limite: 12 s).
const DEMO_GAP_BY_KIND_MS = { ai: 1300, client: 1300, event: 700 } as const;

const TONE_OPTIONS: Array<{
  descriptor: string;
  label: string;
  recommended?: boolean;
  tone: DemoTone;
}> = [
  {
    descriptor: "Clara e educada, sem emojis",
    label: "Profissional",
    tone: "PROFESSIONAL",
  },
  {
    descriptor: "Simpática e direta, poucos emojis",
    label: "Equilibrada",
    recommended: true,
    tone: "BALANCED",
  },
  {
    descriptor: "Casual e próxima, com emojis",
    label: "Descontraída",
    tone: "CASUAL",
  },
];

/** O estilo gravado, ou Equilibrada (o padrão do vault) enquanto nada foi gravado. */
export function effectiveTone(draft: Pick<OnboardingDraft, "tone">): DemoTone {
  return draft.tone ?? "BALANCED";
}

export function toneLabel(tone: DemoTone): string {
  return TONE_OPTIONS.find((option) => option.tone === tone)?.label ?? "";
}

function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function demoEntryTimes(items: DemoItem[]): number[] {
  let at = 0;
  return items.slice(1).map((item) => {
    at += DEMO_GAP_BY_KIND_MS[item.kind];
    return at;
  });
}

/**
 * Demonstração automática do bloco Sua IA, antes do estilo (vault
 * `01-Onboarding.md` §7): simulação local, sem porta de envio, sem leitura da
 * agenda real e sem escrita em Appointment/Customer/Conversation/Message — só
 * o serviço, o preço, a duração e os horários do rascunho carregado do
 * onboarding. As mensagens entram uma a uma e `onDemoDone(true)` avisa a tela
 * quando o último item entra, para o "Continuar" aparecer só então.
 */
function AiDemoStepBody({
  draft,
  onDemoDone,
}: {
  draft: OnboardingDraft;
  onDemoDone?: (done: boolean) => void;
}) {
  const [conversation] = useState(() =>
    draft.serviceOperational && draft.hoursValid
      ? buildDemoConversation(draft, new Date())
      : null,
  );
  if (!conversation) {
    return <DemoUnavailable draft={draft} onDemoDone={onDemoDone} />;
  }
  return (
    <DemoConversationView
      items={conversation.items}
      onDemoDone={onDemoDone}
    />
  );
}

function DemoUnavailable({
  draft,
  onDemoDone,
}: {
  draft: OnboardingDraft;
  onDemoDone?: (done: boolean) => void;
}) {
  useEffect(() => {
    onDemoDone?.(true);
    return () => onDemoDone?.(false);
  }, [onDemoDone]);
  const missing: string[] = [];
  if (!draft.serviceOperational) {
    missing.push("um serviço ativo com duração definida");
  }
  if (!draft.hoursValid) {
    missing.push("um horário de atendimento configurado");
  } else if (draft.serviceOperational) {
    missing.push("um horário de atendimento em que o serviço caiba");
  }
  return (
    <div className="onboarding-note is-important">
      <Icon name="info" />
      <span>Configure {missing.join(" e ")} para ver a demonstração da IA.</span>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="#2E7D4F"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      viewBox="0 0 24 24"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="#716859"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.25"
      viewBox="0 0 24 24"
    >
      <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
    </svg>
  );
}

function DemoConversationView({
  items,
  onDemoDone,
}: {
  items: DemoItem[];
  onDemoDone?: (done: boolean) => void;
}) {
  const [shown, setShown] = useState(() =>
    prefersReducedMotion() ? items.length : 1,
  );
  useEffect(() => {
    if (shown >= items.length) return;
    const timers = demoEntryTimes(items).map((at, index) =>
      window.setTimeout(
        () => setShown((current) => Math.max(current, index + 2)),
        at,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // A sequência roda uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const done = shown >= items.length;
  useEffect(() => {
    onDemoDone?.(done);
    return () => onDemoDone?.(false);
  }, [done, onDemoDone]);

  return (
    <div
      aria-label="Conversa de exemplo da IA"
      className="onboarding-demo-chat"
      role="log"
    >
      {items.slice(0, shown).map((item, index) => {
        if (item.kind === "event") {
          return (
            <p className="onboarding-demo-event" key={index}>
              <span>
                {item.icon === "calendar" ? <CalendarGlyph /> : <CheckGlyph />}
                {item.text}
              </span>
            </p>
          );
        }
        if (item.kind === "ai") {
          return (
            <div className="demo-ai-message" key={index}>
              <div className="demo-ai-bubble">{item.text}</div>
              <span className="demo-ai-label">sua IA</span>
            </div>
          );
        }
        return (
          <div className="demo-client-bubble" key={index}>
            {item.text}
          </div>
        );
      })}
    </div>
  );
}

export function aiStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  _onWhatsappStatusChange?: (connected: boolean) => void,
  onDemoDone?: (done: boolean) => void,
) {
  if (scenario === "demonstracao-da-ia") {
    return <AiDemoStepBody draft={draft} onDemoDone={onDemoDone} />;
  }
  const selectedTone = effectiveTone(draft);
  return (
    <div className="choice-grid tone-grid">
      {TONE_OPTIONS.map((option) => (
        <Choice
          badge={option.recommended ? "recomendada" : undefined}
          copy={option.descriptor}
          key={option.tone}
          sample={demoToneSample(draft, option.tone)}
          selected={selectedTone === option.tone}
          title={option.label}
          onClick={() => setDraft((value) => ({ ...value, tone: option.tone }))}
        />
      ))}
    </div>
  );
}

export async function persistAiStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  // Só navegação: a demonstração é simulada em memória, sem porta de envio
  // nem escrita em Appointment/Customer/Conversation/Message.
  if (scenario === "demonstracao-da-ia") {
    ctx.go("tom-da-ia");
    return;
  }
  await getProductServices().onboarding.update({
    ai: { tone: effectiveTone(ctx.draft) },
  });
  await ctx.refresh();
  ctx.go("whatsapp");
}
