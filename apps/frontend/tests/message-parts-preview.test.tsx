// @vitest-environment jsdom
/**
 * D-208 — mensagens em várias partes curtas, do lado da tela.
 *
 * - as prévias usam as mesmas partes que o envio: os textos abaixo são os de
 *   `apps/ai-orchestrator/tests/reminders/notification-message.test.ts` e
 *   `tests/customer-return/return-message.test.ts` (mude os dois lados);
 * - o teto de 5 junta o excedente na última; numa mensagem só, um balão;
 * - o celular toca as mensagens em ordem, cada uma depois do "digitando…",
 *   e "Repetir" começa de novo; com menos movimento, tudo de uma vez.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { MessageBubble } from "@/features/conversations/MessageTimeline";
import { composeReturnParts } from "@/features/customer-return/returnMessage";
import { composeReminderPreviewParts } from "@/features/reminders/reminderPreview";
import {
  capMessageParts,
  messageBubbles,
  resolveMessageDelivery,
} from "@/shared/messages/messageParts";
import { ChatPhone, previewTypingMs } from "@/shared/ui/ChatPhone";

import { expectNoA11yViolations } from "./support/a11y";

describe("mesmas partes do envio", () => {
  test("lembrete: saudação, tudo bem, fato, valor e pergunta", () => {
    expect(
      composeReminderPreviewParts({
        style: "BALANCED",
        delivery: "PARTS",
        facts: {
          customerName: "Ana",
          subject: "Corte",
          date: "2026-09-16",
          time: "15:30",
          price: 120,
          confirmationRequested: true,
        },
      }),
    ).toEqual([
      "Oi, Ana!",
      "Tudo bem?",
      "Passando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.",
      "Valor: R$ 120,00.",
      "Você confirma sua presença? É só responder sim ou não.",
    ]);
  });

  test("retorno: Renovação e Resgate com incentivo", () => {
    const renewal = {
      kind: "RENEWAL" as const,
      followUp: false,
      customerName: "Adriana Souza",
      serviceName: "Manutenção 5D",
      today: "2026-10-19",
      expectedDate: "2026-10-22",
      intervalDays: 15,
      daysSinceLastVisit: 12,
      offeredSlots: [
        { date: "2026-10-23", time: "17:30" },
        { date: "2026-10-24", time: "18:00" },
      ],
      incentive: null,
      messageTemplate: null,
    };
    expect(
      composeReturnParts({ style: "BALANCED", facts: renewal, delivery: "PARTS" }),
    ).toEqual([
      "Oi, Adriana!",
      "Tudo bem?",
      "Seu atendimento de Manutenção 5D completa 15 dias na quinta-feira.",
      "Quer que eu já reserve um horário?",
      "Tenho sexta às 17h30 ou sábado às 18h.",
    ]);
    expect(
      composeReturnParts({
        style: "BALANCED",
        delivery: "PARTS",
        facts: {
          ...renewal,
          kind: "WINBACK",
          customerName: "Joice",
          expectedDate: null,
          intervalDays: null,
          offeredSlots: [],
          incentive: "10% de desconto em qualquer serviço até o fim do mês.",
        },
      }),
    ).toEqual([
      "Oi, Joice!",
      "Tudo bem?",
      "Faz um tempinho que você não aparece por aqui.",
      "Pra sua volta, tenho uma condição especial: 10% de desconto em qualquer serviço até o fim do mês.",
      "Quer que eu veja um horário pra você?",
    ]);
  });

  test("teto de 5, uma mensagem só e o padrão", () => {
    expect(capMessageParts(["A", "B", "C", "D", "E", "F", "G"])).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E\n\nF\n\nG",
    ]);
    expect(messageBubbles(["Oi!", "Tudo bem?"], "SINGLE")).toEqual([
      "Oi!\n\nTudo bem?",
    ]);
    expect(messageBubbles(["Oi!", "Tudo bem?"], "PARTS")).toEqual([
      "Oi!",
      "Tudo bem?",
    ]);
    expect(resolveMessageDelivery(undefined)).toBe("PARTS");
    expect(resolveMessageDelivery(null)).toBe("PARTS");
    expect(resolveMessageDelivery("SINGLE")).toBe("SINGLE");
  });
});

const BUBBLES = ["Oi, Ana!", "Tudo bem?", "Quer que eu já reserve um horário?"];

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

function shownTexts(): string[] {
  return [...document.querySelectorAll(".chat-phone-text")].map(
    (node) => node.textContent ?? "",
  );
}

describe("o celular da prévia", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("toca em ordem: digitando, a mensagem, a próxima", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    render(<ChatPhone bubbles={BUBBLES} businessName="Studio Bela" time="09:00" />);

    const log = screen.getByRole("log", { name: "Mensagens de Studio Bela" });
    expect(shownTexts()).toEqual([]);
    expect(log).toHaveAttribute("aria-live", "polite");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("digitando…")).toBeVisible();
    expect(shownTexts()).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(previewTypingMs(BUBBLES[0]));
    });
    expect(shownTexts()).toEqual(["Oi, Ana!"]);
    expect(screen.queryByText("digitando…")).toBeNull();
    expect(screen.getAllByText("09:00")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(shownTexts()).toEqual(BUBBLES);
    expect(log).toHaveAttribute("aria-live", "off");
    expect(screen.getByText("online")).toBeVisible();
  });

  test("Repetir começa do zero", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    render(<ChatPhone bubbles={BUBBLES} businessName="Studio Bela" time="09:00" />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(shownTexts()).toEqual(BUBBLES);

    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    expect(shownTexts()).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(shownTexts()).toEqual(BUBBLES);
  });

  test("com menos movimento, todas de uma vez e sem digitando", async () => {
    stubReducedMotion(true);
    const { container } = render(
      <ChatPhone bubbles={BUBBLES} businessName="Studio Bela" time="09:00" />,
    );
    expect(shownTexts()).toEqual(BUBBLES);
    expect(screen.queryByText("digitando…")).toBeNull();
    expect(
      within(screen.getByRole("log")).getAllByText("09:00"),
    ).toHaveLength(3);
    await expectNoA11yViolations(container);
  });
});

describe("a conversa do app", () => {
  const base = {
    id: "m1",
    direction: "OUTBOUND" as const,
    source: "AI" as const,
    body: "Oi, Ana!\n\nTudo bem?\n\nSeu horário é amanhã às 10h.",
    createdAt: "2026-10-19T12:00:00.000Z",
    deliveryState: "SENT" as const,
  };

  test("mensagem enviada em partes vira um balão por parte, em ordem", () => {
    const { container } = render(
      <MessageBubble
        conversationId="c1"
        message={{
          ...base,
          parts: ["Oi, Ana!", "Tudo bem?", "Seu horário é amanhã às 10h."],
        }}
        onResend={() => undefined}
        resending={false}
      />,
    );
    expect(
      [...container.querySelectorAll(".message-bubble")].map(
        (bubble) => bubble.textContent,
      ),
    ).toEqual(["Oi, Ana!", "Tudo bem?", "Seu horário é amanhã às 10h."]);
    // A hora e a marca da IA aparecem uma vez, depois do último balão.
    expect(container.querySelectorAll(".message-meta")).toHaveLength(1);
  });

  test("sem partes, um balão com o texto inteiro, como antes", () => {
    const { container } = render(
      <MessageBubble
        conversationId="c1"
        message={base}
        onResend={() => undefined}
        resending={false}
      />,
    );
    expect(container.querySelectorAll(".message-bubble")).toHaveLength(1);
  });
});
