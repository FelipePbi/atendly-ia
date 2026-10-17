import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

// Ritmo da conversa (validação de 2026-10-11, depois 1,5x mais rápida): cada
// mensagem é precedida pelo "digitando…" de quem fala; o evento entra
// sozinho, mais rápido.
const DEMO_TYPING_MS = { ai: 730, client: 530 } as const;
const DEMO_PAUSE_AFTER_MS = { ai: 330, client: 300, event: 300 } as const;
const DEMO_EVENT_DELAY_MS = 230;
const DEMO_DONE_DELAY_MS = 1000;
// Abertura: o título aparece sozinho no centro e some; a descrição aparece
// no centro e some; os dois aparecem juntos no lugar deles, e só então a
// conversa começa.
const DEMO_INTRO = {
  fadeIn: 800,
  fadeOut: 600,
  holdTitle: 1300,
  holdDescription: 1900,
  settle: 700,
} as const;

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

function wait(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (!signal.cancelled) resolve();
    }, ms);
  });
}

/**
 * Abertura da demonstração com a Web Animations API: título e descrição
 * aparecem um de cada vez, centralizados no corpo da etapa, e somem; depois
 * os dois aparecem juntos no topo, onde ficam. Via WAAPI, e não CSS, porque a
 * regra global de movimento reduzido zeraria as transições. Sem `animate`
 * (jsdom), resolve na hora.
 */
let demoIntroRuns = 0;

async function playDemoIntro(
  anchor: HTMLElement | null,
  signal: { cancelled: boolean },
): Promise<void> {
  const heading = anchor
    ?.closest("form")
    ?.querySelector<HTMLElement>(".onboarding-heading");
  const content = heading?.parentElement;
  const title = heading?.querySelector<HTMLElement>("h1");
  const description = heading?.querySelector<HTMLElement>(":scope > p");
  if (!heading || !content || !title || typeof title.animate !== "function") {
    return;
  }
  // Só a execução mais recente mexe no cabeçalho: com o efeito montado duas
  // vezes (StrictMode) ou a etapa remontada, uma execução cancelada nunca
  // desfaz o que a seguinte acabou de esconder.
  const run = String((demoIntroRuns += 1));
  heading.dataset.introRun = run;
  const mine = () => !signal.cancelled && heading.dataset.introRun === run;
  const parts = description ? [title, description] : [title];
  // Invisíveis desde o primeiro quadro; mede só com a fonte final carregada
  // (a largura do título muda com ela).
  parts.forEach((element) => (element.style.opacity = "0"));
  heading.style.borderBottomColor = "transparent";
  await document.fonts?.ready;
  const { fadeIn, fadeOut, holdDescription, holdTitle, settle } = DEMO_INTRO;
  const easing = "cubic-bezier(0.2, 0.7, 0.2, 1)";

  // Cada parte no centro do corpo da etapa, com o texto centralizado.
  async function showCentered(element: HTMLElement, hold: number) {
    if (!mine()) return;
    element.style.textAlign = "center";
    const area = content!.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const dx = area.left + (area.width - rect.width) / 2 - rect.left;
    const dy = area.top + (area.height - rect.height) / 2 - rect.top;
    element.style.transform = `translate(${dx}px, ${dy}px)`;
    await element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: fadeIn,
      easing,
    }).finished;
    if (!mine()) return;
    element.style.opacity = "1";
    await wait(hold, signal);
    if (!mine()) return;
    await element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: fadeOut,
      easing,
    }).finished;
    if (!mine()) return;
    element.style.opacity = "0";
    element.style.transform = "";
    element.style.textAlign = "";
  }

  try {
    await showCentered(title, holdTitle);
    if (description) await showCentered(description, holdDescription);
    if (!mine()) return;
    await Promise.all(
      parts.map(
        (element) =>
          element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: settle,
            easing,
          }).finished,
      ),
    );
  } catch {
    // Animação cancelada (etapa desmontada): nada a esperar.
  } finally {
    if (mine()) {
      parts.forEach((element) => {
        element.style.opacity = "";
        element.style.transform = "";
        element.style.textAlign = "";
      });
      heading.style.borderBottomColor = "";
      delete heading.dataset.introRun;
    }
  }
}

/**
 * Demonstração automática do bloco Sua IA, antes do estilo (vault
 * `01-Onboarding.md` §7): simulação local, sem porta de envio, sem leitura da
 * agenda real e sem escrita em Appointment/Customer/Conversation/Message — só
 * o serviço, o preço, a duração e os horários do rascunho carregado do
 * onboarding. Depois da abertura (título e descrição no centro, um de cada
 * vez, e os dois fixos no topo), as mensagens
 * entram uma a uma, cada uma depois do "digitando…" de quem fala, e
 * `onDemoDone(true)` avisa a tela quando o último item entra, para o
 * "Continuar" aparecer só então. A sequência roda também com movimento
 * reduzido: ela é o conteúdo da etapa, não enfeite.
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
    <DemoConversationView items={conversation.items} onDemoDone={onDemoDone} />
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
      <span>
        Configure {missing.join(" e ")} para ver a demonstração da IA.
      </span>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      style={{ stroke: "var(--at-color-success)" }}
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
      style={{ stroke: "var(--at-color-ink-muted)" }}
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
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState<"ai" | "client" | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const signal = { cancelled: false };
    async function run() {
      await playDemoIntro(chatRef.current, signal);
      for (let index = 0; index < items.length; index += 1) {
        if (signal.cancelled) return;
        const item = items[index];
        if (item.kind === "event") {
          await wait(DEMO_EVENT_DELAY_MS, signal);
        } else {
          setTyping(item.kind);
          await wait(DEMO_TYPING_MS[item.kind], signal);
          setTyping(null);
        }
        setShown(index + 1);
        if (index < items.length - 1) {
          await wait(DEMO_PAUSE_AFTER_MS[item.kind], signal);
        }
      }
    }
    void run();
    return () => {
      signal.cancelled = true;
    };
    // A sequência roda uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A conversa cresce para baixo: o último balão (ou o "digitando…") fica
  // sempre à vista.
  useEffect(() => {
    if (shown === 0 && typing === null) return;
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [shown, typing]);

  // O "Continuar" espera a última mensagem assentar antes de entrar, para o
  // fim da conversa não atropelar a chegada do botão.
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (shown < items.length) return;
    const timer = window.setTimeout(() => setDone(true), DEMO_DONE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [shown, items.length]);
  useEffect(() => {
    onDemoDone?.(done);
    return () => onDemoDone?.(false);
  }, [done, onDemoDone]);
  // O "Continuar" entra embaixo e encurta a área da conversa: depois que ele
  // aparece, a última mensagem volta para a vista.
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => {
      endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <div
      aria-label="Conversa de exemplo da IA"
      className="onboarding-demo-chat"
      ref={chatRef}
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
      {typing && (
        <div aria-hidden="true" className={`demo-typing is-${typing}`}>
          <span />
          <span />
          <span />
        </div>
      )}
      <span aria-hidden="true" className="demo-chat-end" ref={endRef} />
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
