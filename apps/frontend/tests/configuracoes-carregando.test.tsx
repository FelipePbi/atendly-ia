// @vitest-environment jsdom
/**
 * Configurações carregando (pedido de 2026-10-16): no lugar do cartão
 * "Carregando configurações / Buscando o estado atual do seu negócio", o
 * carregamento padrão — o "A" animado da Avenly no centro do conteúdo, com a
 * casca à vista. Só se a leitura passar de ~150 ms (D-168): carga rápida
 * entra direto, sem piscar.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  usePathname: () => "/configuracoes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const getSettings = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    settings: { get: getSettings },
    whatsapp: { get: () => new Promise(() => undefined) },
  }),
  useProductRuntime: () => ({ session: null }),
}));

beforeEach(() => {
  getSettings
    .mockReset()
    .mockImplementation(() => new Promise(() => undefined));
});

describe("Configurações carregando", () => {
  test("sem o cartão antigo: nada no primeiro quadro, depois o A animado no conteúdo", async () => {
    const { container } = render(
      <ShellConfigProvider>
        <ProductSettingsScreen scenario="hub" />
      </ShellConfigProvider>,
    );

    expect(
      screen.queryByText("Buscando o estado atual do seu negócio."),
    ).toBeNull();
    expect(container.querySelector(".brand-loader-screen")).toBeNull();

    await waitFor(() =>
      expect(container.querySelector(".brand-loader-screen")).not.toBeNull(),
    );
    const loader = container.querySelector(".brand-loader-screen");
    // Dentro do conteúdo, não a camada que cobre a página inteira.
    expect(loader).toHaveClass("is-inline");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando configurações",
    );
    expect(
      screen.queryByRole("heading", { name: "Carregando configurações" }),
    ).toBeNull();
  });
});
