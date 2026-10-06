// @vitest-environment jsdom
/**
 * Goal126 (NT2): a central vazia — na página e na gaveta — mostra "Nada por
 * aqui" com o texto do quadro e, só quando a IA e o WhatsApp estão `active`
 * pela leitura compartilhada de `GET /v1/status`, a pílula "IA ativa · tudo em
 * ordem". Com notificações, nada do vazio aparece.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Notification, NotificationList, SystemStatus } from "@/data";
import {
  NotificationsDrawerContent,
  NotificationsScreen,
} from "@/features/notifications/NotificationsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

const list = vi.fn();
const markRead = vi.fn();
const getPreferences = vi.fn();
const updatePreferences = vi.fn();
const summary = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    notifications: { getPreferences, list, markRead, summary, updatePreferences },
    status: { get: statusGet },
  }),
}));

const PILL = "IA ativa · tudo em ordem";
const EMPTY_TEXT =
  "Avisamos quando algo precisar de você: uma cliente aguardando, o WhatsApp desconectado ou um lembrete que não foi enviado.";

type AiState = SystemStatus["ai"]["state"];
type WhatsappState = SystemStatus["whatsapp"]["status"];

function statusFixture(ai: AiState, whatsapp: WhatsappState): SystemStatus {
  return {
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: ai === "ACTIVE",
      reconciled: "NOOP",
      state: ai,
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-10-06T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: whatsapp,
    },
  };
}

function notificationFixture(): Notification {
  return {
    id: "notif-1",
    kind: "CUSTOMER_WAITING_HUMAN",
    level: "ATTENTION",
    occurredAt: "2026-10-06T12:30:00.000Z",
    payload: { contactName: "Marina", reason: "EXPLICIT_REQUEST" },
    readAt: null,
    resolvedAt: null,
    shape: "CONDITION",
    subjectId: "conversation-1",
  };
}

function listResult(items: Notification[]): NotificationList {
  return { items, limit: 20, offset: 0, total: items.length };
}

function renderPage() {
  return render(
    <ShellConfigProvider>
      <SystemStatusProvider>
        <NotificationsScreen />
      </SystemStatusProvider>
    </ShellConfigProvider>,
  );
}

function renderDrawer() {
  return render(
    <SystemStatusProvider>
      <NotificationsDrawerContent onNavigate={() => undefined} />
    </SystemStatusProvider>,
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue(listResult([]));
  getPreferences.mockResolvedValue({ aiAppointmentCreated: false });
  summary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  statusGet.mockResolvedValue(statusFixture("ACTIVE", "CONNECTED"));
});

describe("o vazio na página", () => {
  test("mostra 'Nada por aqui' e o texto do quadro, sem 'Tudo em dia' nem 'Marcar lidas', e mantém a preferência", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Nada por aqui" }),
    ).toBeVisible();
    expect(screen.getByText(EMPTY_TEXT)).toBeVisible();
    expect(screen.queryByText("Tudo em dia")).toBeNull();
    expect(screen.queryByText("Nada exige sua atenção agora.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar lidas" })).toBeNull();
    expect(
      await screen.findByRole("checkbox", { name: /Agendamento criado pela IA/ }),
    ).toBeInTheDocument();
  });

  test("anel, círculo e sino são aria-hidden", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Nada por aqui" });

    const halo = container.querySelector(".notifications-empty-halo");
    expect(halo).toHaveAttribute("aria-hidden", "true");
    expect(halo?.querySelector(".notifications-empty-ring")).not.toBeNull();
    expect(halo?.querySelector(".notifications-empty-disc svg")).not.toBeNull();
  });

  test("com uma notificação nada do NT2 aparece e a lista é a de hoje", async () => {
    list.mockResolvedValue(listResult([notificationFixture()]));
    const { container } = renderPage();

    await screen.findByText("Cliente aguardando você");
    expect(screen.queryByText("Nada por aqui")).toBeNull();
    expect(screen.queryByText(PILL)).toBeNull();
    expect(container.querySelector(".notifications-empty")).toBeNull();
    expect(screen.getByRole("button", { name: "Marcar lidas" })).toBeVisible();
  });
});

describe("o vazio na gaveta", () => {
  test("mostra o mesmo bloco, sem 'Marcar lidas', sem preferência e com o link no rodapé", async () => {
    renderDrawer();

    expect(
      await screen.findByRole("heading", { name: "Nada por aqui" }),
    ).toBeVisible();
    expect(screen.getByText(EMPTY_TEXT)).toBeVisible();
    expect(screen.queryByText("Tudo em dia")).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar lidas" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Preferências de notificação" }),
    ).toHaveAttribute("href", "/notificacoes");
  });

  test("com uma notificação, a gaveta mostra a lista e nada do NT2", async () => {
    list.mockResolvedValue(listResult([notificationFixture()]));
    renderDrawer();

    await screen.findByText("Cliente aguardando você");
    expect(screen.queryByText("Nada por aqui")).toBeNull();
    expect(screen.queryByText(PILL)).toBeNull();
  });
});

describe("a pílula diz a verdade", () => {
  test("aparece com a IA e o WhatsApp active", async () => {
    renderPage();
    expect(await screen.findByText(PILL)).toBeVisible();
    expect(document.querySelector(".notifications-empty-pill-dot")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("aparece também na gaveta", async () => {
    renderDrawer();
    expect(await screen.findByText(PILL)).toBeVisible();
  });

  const notActive: Array<[string, AiState, WhatsappState]> = [
    ["IA desligada (off)", "OFF", "CONNECTED"],
    ["IA em ativação (pending)", "PENDING", "CONNECTED"],
    ["IA não confirmada (unknown)", "UNKNOWN", "CONNECTED"],
    ["WhatsApp desconectado (off)", "ACTIVE", "DISCONNECTED"],
    ["WhatsApp não confirmado (unknown)", "ACTIVE", "UNKNOWN"],
  ];

  test.each(notActive)("ausente com %s", async (_name, ai, whatsapp) => {
    statusGet.mockResolvedValue(statusFixture(ai, whatsapp));
    renderPage();

    await screen.findByRole("heading", { name: "Nada por aqui" });
    await waitFor(() => expect(statusGet).toHaveBeenCalled());
    await settle();
    expect(screen.queryByText(PILL)).toBeNull();
  });

  test("ausente enquanto a leitura do status não chegou (loading)", async () => {
    statusGet.mockReturnValue(new Promise(() => undefined));
    renderPage();

    await screen.findByRole("heading", { name: "Nada por aqui" });
    await settle();
    expect(screen.queryByText(PILL)).toBeNull();
  });

  test("ausente com o status em erro, e o resto do bloco continua", async () => {
    statusGet.mockRejectedValue(new Error("INVALID_RESPONSE"));
    renderPage();

    await screen.findByRole("heading", { name: "Nada por aqui" });
    await waitFor(() => expect(statusGet).toHaveBeenCalled());
    await settle();
    expect(screen.queryByText(PILL)).toBeNull();
    expect(screen.getByText(EMPTY_TEXT)).toBeVisible();
  });

  test("não abre leitura nova de status: o vazio usa a mesma chamada do provider", async () => {
    renderPage();
    await screen.findByText(PILL);

    expect(statusGet).toHaveBeenCalledTimes(1);
  });
});
