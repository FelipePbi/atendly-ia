// @vitest-environment jsdom
/**
 * Goal071 (WU-03) — onboarding, Configurações › WhatsApp e gate autenticado.
 *
 * O painel de conexão aqui é o real (`WhatsAppConnectionPanel`), não um
 * dublê: o mesmo consentimento precisa aparecer nos dois caminhos que o
 * montam, `whatsapp-conectar` no onboarding e Configurações › WhatsApp.
 *
 * 1. Os dois caminhos abrem no consentimento, com o checkbox desmarcado e
 *    nenhuma das duas respostas marcada, e só chamam `connect` depois dele.
 * 2. Em `whatsapp-conectar`, "Continuar" não compete com o CTA primário do
 *    painel enquanto o número não está conectado; quando o painel lê o
 *    número conectado (`onStatusChange`), "Continuar" vira a ação principal.
 * 3. Em `whatsapp-concluido`, "Conectar agora" aponta para a etapa do
 *    onboarding (`/onboarding/whatsapp`), não para Configurações — a
 *    conclusão sem WhatsApp continua só em "Ir para o início".
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const connectWhatsapp = vi.fn();
const reconnectWhatsapp = vi.fn();
const qrWhatsapp = vi.fn();
const disconnectWhatsapp = vi.fn();
const logout = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    whatsapp: {
      connect: connectWhatsapp,
      disconnect: disconnectWhatsapp,
      get: getWhatsapp,
      qr: qrWhatsapp,
      reconnect: reconnectWhatsapp,
    },
  }),
  useProductRuntime: () => ({ refreshSession, setUnauthenticated }),
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { WhatsAppSettings } from "@/features/settings/WhatsAppSettings";

const CONSENT_TEXT =
  "Entendo que as conversas deste número poderão ser processadas e armazenadas para oferecer os recursos da Atendly.";

function emptyState(): OnboardingState {
  return {
    ai: { tone: "PROFESSIONAL" },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      modalities: ["ONLINE"],
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    completed: false,
    completedAt: null,
    service: {
      active: true,
      bufferAfterMinutes: 0,
      bufferBeforeMinutes: 0,
      durationMinutes: 60,
      id: "svc-1",
      name: "Corte",
      needsReview: false,
      price: 100,
      priceType: "FIXED",
    },
    whatsapp: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWhatsapp.mockResolvedValue(null);
  updateOnboarding.mockResolvedValue(emptyState());
  completeOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      }) as MediaQueryList;
  }
});

function renderScreen(scenario: string, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
}

/**
 * O mesmo consentimento, conferido do mesmo jeito nos dois caminhos: frase
 * exigida no checkbox desmarcado, as duas respostas sem marcação, "Saiba
 * mais" para a política, e `connect` só depois de checkbox e resposta, com
 * `consentAccepted: true`.
 */
async function expectConsentGate(user: ReturnType<typeof userEvent.setup>) {
  const cta = await screen.findByRole("button", { name: "Conectar WhatsApp" });
  const checkbox = screen.getByRole("checkbox", { name: CONSENT_TEXT });
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Sim, também" })).not.toBeChecked();
  expect(
    screen.getByRole("radio", { name: "Não, só trabalho" }),
  ).not.toBeChecked();
  expect(screen.getByRole("link", { name: "Saiba mais" })).toHaveAttribute(
    "href",
    "/politica-de-privacidade",
  );
  expect(cta).toBeDisabled();

  await user.click(checkbox);
  expect(cta).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: "Sim, também" }));
  expect(screen.getByText(/você continua no controle/i)).toBeVisible();
  expect(connectWhatsapp).not.toHaveBeenCalled();

  connectWhatsapp.mockResolvedValue({
    connection: {
      connectedAt: null,
      id: "wa-1",
      phoneNumber: null,
      status: "WAITING_QR",
      updatedAt: "2026-09-27T12:00:00.000Z",
    },
    expiresAt: null,
    pairingCode: null,
    qrcode: "qr-1",
  });
  await user.click(cta);
  expect(connectWhatsapp).toHaveBeenCalledWith({
    consentAccepted: true,
    mode: "QR",
  });
}

describe("o mesmo consentimento nos dois caminhos do painel", () => {
  test("onboarding (whatsapp-conectar) abre no consentimento, com o painel real", async () => {
    const user = userEvent.setup();
    renderScreen("whatsapp-conectar", emptyState());
    await expectConsentGate(user);
  });

  test("Configurações › WhatsApp abre no mesmo consentimento, com o painel real", async () => {
    const user = userEvent.setup();
    render(<WhatsAppSettings onStatusChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
    await expectConsentGate(user);
  });
});

describe("whatsapp-conectar: 'Continuar' não compete com o CTA do painel", () => {
  test("desconectado, 'Continuar' é a ação secundária e o único CTA primário é o do painel", async () => {
    renderScreen("whatsapp-conectar", emptyState());
    const continuar = await screen.findByRole("button", { name: "Continuar" });
    await screen.findByRole("button", { name: "Conectar WhatsApp" });
    expect(continuar.className).toContain("btn-secondary");
    expect(continuar.className).not.toContain("btn-primary");
    const primaries = document.body.querySelectorAll(".btn-primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent("Conectar WhatsApp");
  });

  test("o painel lê o número conectado e 'Continuar' vira a ação principal", async () => {
    getWhatsapp.mockResolvedValue({
      connectedAt: "2026-09-27T12:00:00.000Z",
      id: "wa-1",
      phoneNumber: "5511987654321",
      status: "CONNECTED",
      updatedAt: "2026-09-27T12:00:00.000Z",
    });
    renderScreen("whatsapp-conectar", emptyState());

    expect(await screen.findByText("WhatsApp conectado")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Continuar" }),
    ).toHaveClass("btn-primary");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(document.body.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  test("conectado, avança para contatos-ignorados ao confirmar", async () => {
    getWhatsapp.mockResolvedValue({
      connectedAt: "2026-09-27T12:00:00.000Z",
      id: "wa-1",
      phoneNumber: "5511987654321",
      status: "CONNECTED",
      updatedAt: "2026-09-27T12:00:00.000Z",
    });
    const user = userEvent.setup();
    renderScreen(
      "whatsapp-conectar",
      { ...emptyState(), whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" } },
    );
    await screen.findByText("WhatsApp conectado");
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/contatos-ignorados");
  });

  test("o botão 'Já conectei' não existe", async () => {
    renderScreen("whatsapp-conectar", emptyState());
    await screen.findByRole("button", { name: "Continuar" });
    expect(
      screen.queryByRole("button", { name: /já conectei/i }),
    ).not.toBeInTheDocument();
  });
});

describe("whatsapp-concluido: 'Conectar agora' volta para a etapa do onboarding", () => {
  test("aponta para /onboarding/whatsapp, não para Configurações", async () => {
    renderScreen("whatsapp-concluido", emptyState());
    expect(
      await screen.findByRole("link", { name: "Conectar agora" }),
    ).toHaveAttribute("href", "/onboarding/whatsapp");
  });

  test("'Ir para o início' continua sendo a única ação que conclui o onboarding", async () => {
    const user = userEvent.setup();
    renderScreen("whatsapp-concluido", emptyState());
    const main = await screen.findByRole("button", { name: "Ir para o início" });
    expect(within(main.parentElement ?? document.body).queryAllByRole("button")).toHaveLength(1);
    await user.click(main);
    expect(completeOnboarding).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });
});
