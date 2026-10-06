// @vitest-environment jsdom
/**
 * Goal022 (WU-07): tela /notificacoes — os três níveis distintos e a não
 * lida destacada, marcar uma/todas como lidas refletindo o que a rota
 * devolveu (sem contagem local somada), condição resolvida identificada em
 * vez de sumir da lista, estado vazio explicado e a preferência de
 * agendamento criado pela IA nesta tela (nunca em ProductSettingsScreen).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Notification, NotificationList, NotificationPreferences } from "@/data";
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

vi.mock("@/shared/runtime/systemStatus", () => ({
  useSystemStatus: () => ({ aiView: "unknown", whatsappView: "unknown" }),
}));

function notificationFixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    kind: "CUSTOMER_WAITING_HUMAN",
    level: "ATTENTION",
    occurredAt: "2026-09-15T12:30:00.000Z",
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

function preferencesFixture(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  return { aiAppointmentCreated: false, ...overrides };
}

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <NotificationsScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPreferences.mockResolvedValue(preferencesFixture());
});

describe("três níveis distintos e não lida destacada", () => {
  test("cada nível aparece pela forma, sem selo de texto, e só a notificação não lida traz o controle 'Marcar como lida'", async () => {
    list.mockResolvedValue(
      listResult([
        notificationFixture({
          id: "info-1",
          kind: "IMPORT_COMPLETED",
          level: "INFO",
          payload: { importedCount: 12, sessionId: "session-1" },
          readAt: "2026-09-15T13:00:00.000Z",
          shape: "EVENT",
          subjectId: "session-1",
        }),
        notificationFixture({
          id: "attention-1",
          kind: "CUSTOMER_WAITING_HUMAN",
          level: "ATTENTION",
          readAt: null,
        }),
        notificationFixture({
          id: "critical-1",
          kind: "WHATSAPP_DISCONNECTED",
          level: "CRITICAL",
          payload: {},
          readAt: "2026-09-15T13:00:00.000Z",
          shape: "CONDITION",
          subjectId: null,
        }),
      ]),
    );
    const { container } = renderScreen();

    await screen.findByText("Cliente aguardando você");
    // Goal096 (NT1): o nível é a forma do marcador, não um selo de texto; o
    // nome acessível da linha continua nomeando o nível.
    const levels = [
      ["Informativa", "is-info"],
      ["Atenção", "is-attention"],
      ["Crítica", "is-critical"],
    ] as const;
    for (const [label, shape] of levels) {
      const row = screen.getByRole("listitem", {
        name: new RegExp(`^${label}: `),
      });
      expect(row.querySelector(`.notifications-level-dot.${shape}`)).not.toBeNull();
      expect(within(row).queryByText(label)).toBeNull();
    }
    expect(screen.queryByText("Não lida")).toBeNull();

    // Só a notificação não lida traz o controle — as outras duas já foram lidas.
    expect(container.querySelectorAll(".notifications-row.is-unread")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Marcar como lida" })).toHaveLength(1);

    await expectNoA11yViolations(container);
  });
});

describe("marcar como lida reflete o que a rota devolveu", () => {
  test("marcar uma chama a rota com o id e recarrega a lista do zero", async () => {
    const user = userEvent.setup();
    const unread = notificationFixture({ id: "notif-1", readAt: null });
    const read = notificationFixture({
      id: "notif-1",
      readAt: "2026-09-15T13:05:00.000Z",
    });
    list.mockResolvedValueOnce(listResult([unread]));
    list.mockResolvedValueOnce(listResult([read]));
    markRead.mockResolvedValue({ updated: 1 });
    renderScreen();

    await screen.findByRole("button", { name: "Marcar como lida" });
    await user.click(screen.getByRole("button", { name: "Marcar como lida" }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith({ id: "notif-1" }));
    // Recarrega do zero — não soma contagem local: a tela reflete a segunda
    // resposta de `list`, que já não tem o controle "Marcar como lida".
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Marcar como lida" }),
      ).not.toBeInTheDocument(),
    );
  });

  test("marcar todas chama a rota com { all: true } e recarrega a lista", async () => {
    const user = userEvent.setup();
    const unreadOne = notificationFixture({ id: "notif-1", readAt: null });
    const unreadTwo = notificationFixture({
      id: "notif-2",
      kind: "IMPORT_COMPLETED",
      level: "INFO",
      payload: { importedCount: 3, sessionId: "session-1" },
      readAt: null,
      shape: "EVENT",
      subjectId: "session-1",
    });
    const bothRead = [
      { ...unreadOne, readAt: "2026-09-15T13:10:00.000Z" },
      { ...unreadTwo, readAt: "2026-09-15T13:10:00.000Z" },
    ];
    list.mockResolvedValueOnce(listResult([unreadOne, unreadTwo]));
    list.mockResolvedValueOnce(listResult(bothRead));
    markRead.mockResolvedValue({ updated: 2 });
    renderScreen();

    await screen.findByRole("button", { name: "Marcar lidas" });
    await user.click(
      screen.getByRole("button", { name: "Marcar lidas" }),
    );

    await waitFor(() => expect(markRead).toHaveBeenCalledWith({ all: true }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Marcar como lida" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Marcar lidas" }),
    ).not.toBeInTheDocument();
  });
});

describe("condição resolvida é identificada, não some da lista", () => {
  test("uma condição com resolvedAt continua na lista, marcada como resolvida e com o desfecho", async () => {
    list.mockResolvedValue(
      listResult([
        notificationFixture({
          id: "resolved-1",
          kind: "WHATSAPP_DISCONNECTED",
          level: "CRITICAL",
          payload: {},
          readAt: "2026-09-15T13:00:00.000Z",
          resolvedAt: "2026-09-15T13:20:00.000Z",
          shape: "CONDITION",
          subjectId: null,
        }),
      ]),
    );
    renderScreen();

    await screen.findByText("WhatsApp desconectado");
    // Goal096 (NT1): sem selo "Resolvido"; a linha é riscada (`is-resolved`),
    // o nome acessível diz "(resolvido)" e o desfecho aparece com a hora.
    const row = screen.getByRole("listitem", { name: /\(resolvido\)$/ });
    expect(row).toHaveClass("is-resolved");
    expect(within(row).getByText(/^Resolvido às \d{2}:\d{2} · /)).toBeInTheDocument();
    expect(screen.queryByText("Resolvido")).toBeNull();
  });
});

describe("estado vazio explica que nada exige atenção", () => {
  test("lista vazia mostra o texto explicando, não uma tela em branco", async () => {
    list.mockResolvedValue(listResult([]));
    renderScreen();

    expect(await screen.findByText("Nada por aqui")).toBeInTheDocument();
  });
});

describe("preferência de agendamento criado pela IA", () => {
  test("liga a preferência e envia { aiAppointmentCreated: true }", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(listResult([]));
    getPreferences.mockResolvedValue(preferencesFixture({ aiAppointmentCreated: false }));
    updatePreferences.mockResolvedValue({ aiAppointmentCreated: true });
    renderScreen();

    const toggle = await screen.findByRole("checkbox", {
      name: /Agendamento criado pela IA/,
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({
        aiAppointmentCreated: true,
      }),
    );
    await screen.findByText(
      "Você vai receber notificação quando a IA criar um agendamento.",
    );
  });
});

describe("indisponibilidade", () => {
  test("lista indisponível mostra estado de erro recuperável, não tela em branco", async () => {
    list.mockRejectedValue(new Error("INVALID_RESPONSE"));
    renderScreen();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Notificações indisponíveis")).toBeInTheDocument();
    expect(
      within(alert).getByRole("button", { name: "Tentar de novo" }),
    ).toBeInTheDocument();
  });
});
