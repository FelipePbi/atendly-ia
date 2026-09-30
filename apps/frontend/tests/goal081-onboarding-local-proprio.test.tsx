// @vitest-environment jsdom
/**
 * Goal081/WU-01 — Local próprio não trava o onboarding. O dublê de
 * `onboarding.update` aplica a regra do BFF (`resolveBusinessProfileFields`):
 * `ON_SITE` sem endereço, enviado ou já gravado, é recusado com
 * `400 BUSINESS_ADDRESS_REQUIRED` e `details.field: "address"`. A etapa
 * `modalidade` com Local próprio não grava e segue para `endereco`; `endereco`
 * grava endereço e modalidades juntos e, sem Local próprio no rascunho, volta
 * para `modalidade` sem gravar.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type BusinessModality,
  type OnboardingState,
} from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

type StoredBusiness = {
  address: string | null;
  category: string;
  modalities: BusinessModality[];
  name: string;
  timezone: string;
};

let stored: StoredBusiness;

function stateFrom(business: StoredBusiness): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

function businessRefused() {
  return new BffHttpError({
    code: "BUSINESS_ADDRESS_REQUIRED",
    details: { field: "address" },
    message: "Address is required for ON_SITE.",
    requestId: "req-g081",
    status: 400,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshSession.mockResolvedValue(null);
  stored = {
    address: null,
    category: "Cabelo",
    modalities: [],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  };
  getOnboarding.mockImplementation(async () => stateFrom(stored));
  updateOnboarding.mockImplementation(
    async (patch: { business?: Partial<StoredBusiness> }) => {
      const next = { ...stored, ...patch.business };
      const address = (next.address ?? "").trim();
      if (next.modalities.includes("ON_SITE") && address === "") {
        throw businessRefused();
      }
      stored = next;
      return stateFrom(stored);
    },
  );
});

function screens(scenario: string) {
  return (
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>
  );
}

describe("Local próprio contra o dublê que aplica a regra do BFF", () => {
  test("modalidade não grava, endereco grava endereço e modalidades juntos e segue para sistema-atual", async () => {
    const user = userEvent.setup();
    const { rerender } = render(screens("modalidade"));

    await user.click(await screen.findByText("Local próprio"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/endereco"),
    );
    expect(updateOnboarding).not.toHaveBeenCalled();

    // `router.push` troca a página e o provedor, que guarda o rascunho, fica.
    rerender(screens("endereco"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Rua das Flores, 100",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/sistema-atual"),
    );
    expect(updateOnboarding).toHaveBeenCalledTimes(1);
    expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        address: "Rua das Flores, 100",
        category: "Cabelo",
        modalities: ["ON_SITE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    });
    await expect(
      updateOnboarding.mock.results[0]?.value,
    ).resolves.toBeDefined();
    expect(stored.modalities).toEqual(["ON_SITE"]);
    expect(stored.address).toBe("Rua das Flores, 100");
    expect(
      screen.queryByText("Informe o endereço do seu espaço."),
    ).toBeNull();
  });

  test("voltar de endereco para modalidade mantém Local próprio marcado", async () => {
    const user = userEvent.setup();
    const { rerender } = render(screens("modalidade"));

    await user.click(await screen.findByText("Local próprio"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/endereco"),
    );

    rerender(screens("endereco"));
    await screen.findByLabelText("Endereço do seu espaço");
    rerender(screens("modalidade"));

    expect(
      await screen.findByRole("checkbox", { name: /Local próprio/ }),
    ).toBeChecked();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("desmarcar Local próprio e marcar Online grava sem ON_SITE e vai para sistema-atual", async () => {
    const user = userEvent.setup();
    render(screens("modalidade"));

    await user.click(await screen.findByText("Online"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/sistema-atual"),
    );
    expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        category: "Cabelo",
        modalities: ["ONLINE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    });
  });
});

describe("endereco sem Local próprio no rascunho", () => {
  test("continuar não grava nada e leva para modalidade", async () => {
    const user = userEvent.setup();
    render(screens("endereco"));

    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Rua das Flores, 100",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/modalidade"),
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(stored.modalities).toEqual([]);
    expect(stored.address).toBeNull();
  });
});
