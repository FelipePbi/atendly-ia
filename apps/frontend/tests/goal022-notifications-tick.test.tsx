// @vitest-environment jsdom
/**
 * Goal022 (WU-06): o resumo da central de notificações entra no mesmo tick
 * de `SystemStatusProvider` — não abre um segundo `setInterval` nem um
 * segundo listener de `focus` — e uma falha nele tem fase própria, isolada
 * de WhatsApp/IA.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  SystemStatusProvider,
  useSystemStatus,
} from "@/shared/runtime/systemStatus";

const statusGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
  }),
}));

function Probe() {
  const state = useSystemStatus();
  return (
    <div>
      <span data-testid="phase">{state.phase}</span>
      <span data-testid="notifications-phase">{state.notificationsPhase}</span>
      <span data-testid="unread">
        {state.notificationsSummary?.unreadCount ?? "null"}
      </span>
    </div>
  );
}

const systemStatusFixture = {
  ai: { desiredEnabled: true, effectiveEnabled: true, state: "ACTIVE" as const },
  degraded: false,
  whatsapp: {
    checkedAt: "2026-09-15T12:00:00.000Z",
    phoneNumber: null,
    status: "DISCONNECTED" as const,
  },
};

const summaryFixture = {
  byLevel: { INFO: 0, ATTENTION: 1, CRITICAL: 0 },
  unreadCount: 1,
  openConditionsCount: 0,
};

beforeEach(() => {
  statusGet.mockReset();
  notificationsSummary.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resumo da central acoplado ao tick de SystemStatusProvider", () => {
  test("uma montagem chama status e resumo uma vez cada, sem poller próprio", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    statusGet.mockResolvedValue(systemStatusFixture);
    notificationsSummary.mockResolvedValue(summaryFixture);

    render(
      <SystemStatusProvider>
        <Probe />
      </SystemStatusProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unread").textContent).toBe("1");
    });
    expect(statusGet).toHaveBeenCalledTimes(1);
    expect(notificationsSummary).toHaveBeenCalledTimes(1);
    // Um único intervalo de revalidação (45s) e um único listener de foco
    // para os dois — não dois. Filtra por delay porque `waitFor` do
    // Testing Library também usa `setInterval`, com um intervalo bem menor.
    expect(
      setIntervalSpy.mock.calls.filter(([, delay]) => delay === 45_000),
    ).toHaveLength(1);
    expect(
      addEventListenerSpy.mock.calls.filter(([event]) => event === "focus"),
    ).toHaveLength(1);
  });

  test("resumo indisponível vira fase própria de erro, sem tocar o estado de WhatsApp/IA", async () => {
    statusGet.mockResolvedValue(systemStatusFixture);
    notificationsSummary.mockRejectedValue(new Error("INVALID_RESPONSE"));

    render(
      <SystemStatusProvider>
        <Probe />
      </SystemStatusProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("notifications-phase").textContent).toBe(
        "error",
      );
    });
    expect(screen.getByTestId("phase").textContent).toBe("loaded");
    expect(screen.getByTestId("unread").textContent).toBe("null");
  });
});
