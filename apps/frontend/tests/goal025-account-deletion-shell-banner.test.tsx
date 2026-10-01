// @vitest-environment jsdom
/**
 * Goal025 §7: o aviso persistente enquanto o prazo da exclusão corre.
 *
 * §7 pede o aviso como item separado de "Acompanhar": acompanhar é o estado
 * dentro da seção Conta; o aviso é o que segue a usuária pelo produto inteiro
 * enquanto os sete dias correm. O mecanismo é o que o shell já tinha desde o
 * Goal022 — `PersistentStatusBanner`, derivado de `GET /v1/status`.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - com exclusão `SCHEDULED`, o banner aparece em qualquer tela do shell, com
 *   os dias contados a partir do `dueAt` que o servidor devolveu — nunca de um
 *   segundo estado inventado no cliente;
 * - o banner leva para onde se cancela;
 * - sem exclusão, com exclusão cancelada e enquanto `GET /v1/status` ainda não
 *   respondeu, não há banner nenhum: anunciar exclusão por suposição seria
 *   pior que não anunciar;
 * - enquanto a exclusão vigora, o aviso precede e suprime os banners do
 *   Goal022 (WhatsApp desconectado, IA indisponível): mandar reconectar o
 *   WhatsApp ou revisar a IA seria orientação errada quando a própria conta
 *   está sendo apagada.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SystemStatus } from "@/data";
import { AppShell } from "@/shared/layout/AppShell";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const logout = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

// Relógio fixo: os dias restantes são uma subtração entre `dueAt` e "agora",
// e um teste que dependesse do relógio real mudaria de resposta à meia-noite.
const NOW = new Date("2026-09-16T12:00:00.000Z");

function statusFixture(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: { desiredEnabled: true, effectiveEnabled: true, reconciled: "CONVERGED", state: "ACTIVE" },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-16T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
    ...overrides,
  };
}

function renderShell() {
  return render(
    <AppShell active="inicio" title="Início">
      <p>Conteúdo</p>
    </AppShell>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  statusGet.mockReset();
  notificationsSummary.mockReset();
  logout.mockReset();
  statusGet.mockResolvedValue(statusFixture());
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("aviso persistente de exclusão agendada", () => {
  test("aparece com os dias contados a partir do dueAt do servidor", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          // Sete dias a partir de NOW: o vencimento é do servidor, e é ele
          // que a frase conta. Nada aqui parte do instante do pedido.
          dueAt: "2026-09-23T12:00:00.000Z",
        },
      }),
    );
    renderShell();

    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Exclusão de conta agendada"),
    ).toBeVisible();
    expect(banner).toHaveTextContent(
      "Faltam 7 dias para os dados serem apagados.",
    );
    expect(
      within(banner).getByRole("link", { name: "Ver exclusão da conta" }),
    ).toHaveAttribute("href", "/configuracoes/conta");
  });

  test("o número de dias segue o vencimento, não uma contagem fixa de sete", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          dueAt: "2026-09-18T12:00:00.000Z",
        },
      }),
    );
    renderShell();

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(
      "Faltam 2 dias para os dados serem apagados.",
    );
  });

  test("no último dia a frase não promete dias que não existem", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          dueAt: "2026-09-16T18:00:00.000Z",
        },
      }),
    );
    renderShell();

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(
      "Falta 1 dia para os dados serem apagados.",
    );
  });

  test("não aparece sem exclusão nem com exclusão cancelada", async () => {
    renderShell();
    await screen.findByText("IA ativa");
    expect(screen.queryByRole("alert")).toBeNull();

    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "CANCELLED",
          dueAt: "2026-09-23T12:00:00.000Z",
        },
      }),
    );
    renderShell();
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  test("enquanto GET /v1/status não responde, não há aviso nenhum", async () => {
    let resolve: ((value: SystemStatus) => void) | undefined;
    statusGet.mockReturnValue(
      new Promise<SystemStatus>((done) => {
        resolve = done;
      }),
    );
    renderShell();

    expect(screen.queryByRole("alert")).toBeNull();

    resolve?.(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          dueAt: "2026-09-23T12:00:00.000Z",
        },
      }),
    );
    const banner = await screen.findByRole("alert");
    expect(within(banner).getByText("Exclusão de conta agendada")).toBeVisible();
  });

  test("precede e suprime o banner de WhatsApp desconectado do Goal022 enquanto a exclusão vigora", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          dueAt: "2026-09-23T12:00:00.000Z",
        },
        whatsapp: {
          checkedAt: "2026-09-16T12:00:00.000Z",
          phoneNumber: null,
          status: "DISCONNECTED",
        },
      }),
    );
    const { container } = renderShell();

    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Exclusão de conta agendada"),
    ).toBeVisible();
    expect(
      screen.queryByText("Atendimento automático parado"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  test("precede e suprime o banner de IA indisponível do Goal022 enquanto a exclusão vigora", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          dueAt: "2026-09-23T12:00:00.000Z",
        },
        ai: {
          desiredEnabled: false,
          effectiveEnabled: false,
          reconciled: "NOOP",
          state: "PENDING",
        },
      }),
    );
    const { container } = renderShell();

    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Exclusão de conta agendada"),
    ).toBeVisible();
    expect(screen.queryByText("IA indisponível")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
