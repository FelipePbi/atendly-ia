// @vitest-environment jsdom
/**
 * Goal077 §2 (NT-02) — a central de notificações: a espécie nova
 * `AI_ACTIVATED`, o desfecho da condição resolvida, o histórico agrupado por
 * dia e o nível legível sem cor.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - "Sua IA está ativa" aparece com a descrição do teste real, sem telefone,
 *   mesmo que um `payload` fora do contrato traga um (§6.6);
 * - a condição resolvida diz "Resolvido às HH:MM · <desfecho>" na hora do
 *   navegador e não repete a instrução do problema aberto; aberta, a
 *   instrução continua (§6.7), nas quatro condições;
 * - o histórico se agrupa em "Hoje", "Ontem" e data curta, e cada linha tem
 *   nome acessível com o nível (§6.8).
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Notification, NotificationList } from "@/data";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const list = vi.fn();
const markRead = vi.fn();
const getPreferences = vi.fn();
const updatePreferences = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    notifications: { getPreferences, list, markRead, updatePreferences },
  }),
}));

/** Um instante no fuso do navegador, para a hora esperada não depender do TZ. */
function localIso(day: number, hour: number, minute: number): string {
  return new Date(2026, 8, day, hour, minute).toISOString();
}

function notificationFixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    kind: "CUSTOMER_WAITING_HUMAN",
    level: "ATTENTION",
    occurredAt: localIso(29, 9, 0),
    payload: { contactName: "Marina", reason: "EXPLICIT_REQUEST" },
    readAt: null,
    resolvedAt: null,
    shape: "CONDITION",
    subjectId: "conversation-1",
    ...overrides,
  };
}

function listResult(items: Notification[]): NotificationList {
  return { items, limit: 20, offset: 0, total: items.length };
}

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <NotificationsScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  list.mockReset();
  markRead.mockReset();
  getPreferences.mockReset();
  updatePreferences.mockReset();
  getPreferences.mockResolvedValue({ aiAppointmentCreated: false });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("§6.6 AI_ACTIVATED", () => {
  test("mostra 'Sua IA está ativa' e o teste real, sem telefone", async () => {
    list.mockResolvedValue(
      listResult([
        notificationFixture({
          id: "activated-1",
          kind: "AI_ACTIVATED",
          level: "INFO",
          // Fora do contrato (payload é sempre {}): a tela não pode ecoar.
          payload: { phoneNumber: "+55 11 98765-4321" },
          shape: "EVENT",
          subjectId: null,
        }),
      ]),
    );
    const { container } = renderScreen();

    expect(await screen.findByText("Sua IA está ativa")).toBeVisible();
    expect(
      screen.getByText("Teste real concluído. A IA passou a atender pelo WhatsApp."),
    ).toBeVisible();
    expect(container.textContent).not.toMatch(/\d{4,}|98765|\+55/);
    expect(
      screen.getByRole("link", { name: /Sua IA está ativa/ }),
    ).toHaveAttribute("href", "/configuracoes/ia");

    await expectNoA11yViolations(container);
  });
});

describe("§6.7 condição resolvida diz como foi resolvida", () => {
  const CASES = [
    {
      kind: "WHATSAPP_DISCONNECTED",
      level: "CRITICAL",
      payload: {},
      open: /Reconecte o WhatsApp/,
      outcome: "reconectado. A IA voltou a atender.",
    },
    {
      kind: "AI_UNAVAILABLE",
      level: "CRITICAL",
      payload: {},
      open: /A IA não está respondendo/,
      outcome: "a IA voltou a responder.",
    },
    {
      kind: "CUSTOMER_WAITING_HUMAN",
      level: "ATTENTION",
      payload: { contactName: "Marina" },
      open: /Marina está esperando atendimento humano/,
      outcome: "a conversa foi atendida.",
    },
    {
      kind: "SETUP_INCOMPLETE",
      level: "ATTENTION",
      payload: { issues: ["AVAILABILITY_REQUIRED"] },
      open: /Pendente: disponibilidade não configurada/,
      outcome: "a configuração foi concluída.",
    },
  ] as const;

  for (const item of CASES) {
    test(`${item.kind} resolvida mostra o desfecho; aberta, a instrução`, async () => {
      list.mockResolvedValue(
        listResult([
          notificationFixture({
            id: "resolved",
            kind: item.kind,
            level: item.level,
            payload: item.payload,
            readAt: localIso(29, 9, 30),
            resolvedAt: localIso(29, 9, 14),
            subjectId: item.kind === "CUSTOMER_WAITING_HUMAN" ? "conversation-1" : null,
          }),
          notificationFixture({
            id: "open",
            kind: item.kind,
            level: item.level,
            occurredAt: localIso(29, 8, 0),
            payload: item.payload,
            readAt: localIso(29, 9, 30),
            subjectId: item.kind === "CUSTOMER_WAITING_HUMAN" ? "conversation-2" : null,
          }),
        ]),
      );
      renderScreen();

      const resolvedRow = await screen.findByRole("listitem", {
        name: /\(resolvido\)$/,
      });
      expect(
        within(resolvedRow).getByText(`Resolvido às 09:14 · ${item.outcome}`),
      ).toBeVisible();
      expect(within(resolvedRow).queryByText(item.open)).toBeNull();
      expect(within(resolvedRow).getByText("Resolvido")).toBeVisible();

      const openRow = screen
        .getAllByRole("listitem")
        .find((row) => !/\(resolvido\)$/.test(row.getAttribute("aria-label") ?? ""));
      expect(openRow).toBeDefined();
      expect(within(openRow as HTMLElement).getByText(item.open)).toBeVisible();
      expect(within(openRow as HTMLElement).queryByText(/Resolvido às/)).toBeNull();
    });
  }
});

describe("§6.8 histórico por dia e nível sem cor", () => {
  test("agrupa em 'Hoje', 'Ontem' e data curta; cada linha nomeia o nível", async () => {
    list.mockResolvedValue(
      listResult([
        notificationFixture({
          id: "today",
          kind: "WHATSAPP_DISCONNECTED",
          level: "CRITICAL",
          occurredAt: localIso(29, 10, 5),
          payload: {},
          subjectId: null,
        }),
        notificationFixture({
          id: "yesterday",
          kind: "CUSTOMER_WAITING_HUMAN",
          level: "ATTENTION",
          occurredAt: localIso(28, 18, 40),
        }),
        notificationFixture({
          id: "older",
          kind: "IMPORT_COMPLETED",
          level: "INFO",
          occurredAt: localIso(15, 8, 0),
          payload: { importedCount: 12 },
          shape: "EVENT",
          subjectId: "session-1",
        }),
      ]),
    );
    const { container } = renderScreen();

    const today = await screen.findByRole("heading", { level: 3, name: "Hoje" });
    const yesterday = screen.getByRole("heading", { level: 3, name: "Ontem" });
    const older = screen.getByRole("heading", { level: 3, name: "15/09" });

    const section = (heading: HTMLElement) => heading.closest("section") as HTMLElement;
    expect(
      within(section(today)).getByRole("listitem", { name: /^Crítica: WhatsApp desconectado/ }),
    ).toBeInTheDocument();
    expect(
      within(section(yesterday)).getByRole("listitem", {
        name: /^Atenção: Cliente aguardando você/,
      }),
    ).toBeInTheDocument();
    expect(
      within(section(older)).getByRole("listitem", { name: /^Informativa: Importação concluída/ }),
    ).toBeInTheDocument();

    // A ordem dos grupos é a ordem da rota: do mais novo para o mais antigo.
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent),
    ).toEqual(["Hoje", "Ontem", "15/09"]);

    await expectNoA11yViolations(container);
  });
});
