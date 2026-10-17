// @vitest-environment jsdom
/**
 * D-181: Configurações › Aparência.
 *
 * O que esta suíte prova:
 *
 * - a tela oferece as seis cores e os três modos como grupos de rádio, com a
 *   escolha atual marcada, e sem violação de acessibilidade;
 * - escolher uma cor ou um modo põe `data-accent`/`data-theme` no <html> na
 *   hora, guarda a cópia local e grava na conta (`PATCH`), sem "Salvar";
 * - se a conta recusar, a aparência volta para a anterior (no <html>, na
 *   cópia local e no rádio) e a tela avisa — nunca mostra salvo o que não foi;
 * - ao entrar, a escolha da conta vence a cópia local (outro aparelho mudou);
 * - Automático segue o sistema;
 * - cada miniatura leva `data-accent` da própria cor: é a cascata real.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppearancePreference } from "@/data";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { APPEARANCE_STORAGE_KEY } from "@/shared/theme/appearance";
import { AppearanceProvider } from "@/shared/theme/AppearanceProvider";

import { expectNoA11yViolations } from "./support/a11y";

const getAppearance = vi.fn();
const updateAppearance = vi.fn();
let runtime = {
  phase: "authenticated",
  session: { user: { id: "u1" } },
};

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ settings: { getAppearance, updateAppearance } }),
  useProductRuntime: () => runtime,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/configuracoes/aparencia",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

let prefersDark = false;
const mediaListeners = new Set<(event: { matches: boolean }) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  const root = document.documentElement;
  for (const name of ["data-accent", "data-theme", "data-theme-mode"])
    root.removeAttribute(name);
  prefersDark = false;
  mediaListeners.clear();
  runtime = { phase: "authenticated", session: { user: { id: "u1" } } };
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark") ? prefersDark : false,
    media: query,
    addEventListener: (_: string, fn: (event: { matches: boolean }) => void) =>
      mediaListeners.add(fn),
    removeEventListener: (
      _: string,
      fn: (event: { matches: boolean }) => void,
    ) => mediaListeners.delete(fn),
  }));
  getAppearance.mockResolvedValue({ accent: "VERDE", mode: "LIGHT" });
  updateAppearance.mockImplementation(async (input: AppearancePreference) => ({
    ...input,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderScreen() {
  return render(
    <AppearanceProvider>
      <AppearanceSettings />
    </AppearanceProvider>,
  );
}

const html = () => document.documentElement;
const stored = (): unknown =>
  JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "null");

describe("a tela", () => {
  test("seis cores e três modos, com a escolha atual marcada", async () => {
    const { container } = renderScreen();
    await waitFor(() => expect(getAppearance).toHaveBeenCalled());

    const colors = screen.getByRole("group", { name: "Cor" });
    const modes = screen.getByRole("group", { name: "Modo" });
    expect(within(colors).getAllByRole("radio")).toHaveLength(6);
    expect(within(modes).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(colors).getByRole("radio", { name: /Verde-petróleo/ }),
    ).toBeChecked();
    expect(within(modes).getByRole("radio", { name: /Claro/ })).toBeChecked();
    for (const name of [
      "Rosé",
      "Champanhe",
      "Azul sereno",
      "Lavanda",
      "Terracota",
    ])
      expect(within(colors).getByRole("radio", { name })).not.toBeChecked();
    expect(
      within(modes).getByRole("radio", { name: /Automático/ }),
    ).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  test("cada miniatura é pintada pela própria cor", () => {
    const { container } = renderScreen();
    const previews = [
      ...container.querySelectorAll<HTMLElement>(".appearance-preview"),
    ].map((preview) => preview.dataset.accent);
    expect(previews).toEqual([
      "verde",
      "rose",
      "champanhe",
      "azul",
      "lavanda",
      "terracota",
    ]);
  });
});

describe("escolher", () => {
  test("a cor e o modo valem na hora, ficam no aparelho e vão para a conta", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(getAppearance).toHaveBeenCalled());

    await user.click(screen.getByRole("radio", { name: "Rosé" }));
    expect(html()).toHaveAttribute("data-accent", "rose");
    expect(html()).toHaveAttribute("data-theme", "light");
    expect(stored()).toEqual({ accent: "ROSE", mode: "LIGHT" });
    expect(updateAppearance).toHaveBeenLastCalledWith({
      accent: "ROSE",
      mode: "LIGHT",
    });

    await user.click(screen.getByRole("radio", { name: /Escuro/ }));
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-accent", "rose");
    expect(stored()).toEqual({ accent: "ROSE", mode: "DARK" });
    expect(updateAppearance).toHaveBeenLastCalledWith({
      accent: "ROSE",
      mode: "DARK",
    });
    expect(screen.getByRole("radio", { name: /Escuro/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: /Salvar/ })).toBeNull();
  });

  test("a troca marca a transição e a tira depois", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(getAppearance).toHaveBeenCalled());

    await user.click(screen.getByRole("radio", { name: "Lavanda" }));
    expect(html()).toHaveAttribute("data-theme-switching");
    await waitFor(
      () => expect(html()).not.toHaveAttribute("data-theme-switching"),
      {
        timeout: 1000,
      },
    );
  });

  test("se a conta recusar, volta para a anterior e avisa", async () => {
    const user = userEvent.setup();
    updateAppearance.mockRejectedValue(new Error("offline"));
    renderScreen();
    await waitFor(() => expect(getAppearance).toHaveBeenCalled());

    await user.click(screen.getByRole("radio", { name: "Terracota" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não deu para salvar na sua conta",
    );
    expect(html()).toHaveAttribute("data-accent", "verde");
    expect(stored()).toEqual({ accent: "VERDE", mode: "LIGHT" });
    expect(screen.getByRole("radio", { name: /Verde-petróleo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Terracota" })).not.toBeChecked();
  });
});

describe("a conta e o sistema", () => {
  test("ao entrar, a escolha da conta vence a cópia do aparelho", async () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent: "AZUL", mode: "LIGHT" }),
    );
    getAppearance.mockResolvedValue({ accent: "CHAMPANHE", mode: "DARK" });
    renderScreen();

    // Antes da resposta, a cópia local.
    expect(html()).toHaveAttribute("data-accent", "azul");
    await waitFor(() =>
      expect(html()).toHaveAttribute("data-accent", "champanhe"),
    );
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(stored()).toEqual({ accent: "CHAMPANHE", mode: "DARK" });
    expect(screen.getByRole("radio", { name: "Champanhe" })).toBeChecked();
    expect(updateAppearance).not.toHaveBeenCalled();
  });

  test("sem sessão, não lê a conta e usa a cópia do aparelho", () => {
    runtime = { phase: "unauthenticated", session: null as never };
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent: "LAVANDA", mode: "DARK" }),
    );
    renderScreen();
    expect(getAppearance).not.toHaveBeenCalled();
    expect(html()).toHaveAttribute("data-accent", "lavanda");
    expect(html()).toHaveAttribute("data-theme", "dark");
  });

  test("Automático segue o sistema, inclusive quando ele muda", async () => {
    prefersDark = true;
    getAppearance.mockResolvedValue({ accent: "VERDE", mode: "SYSTEM" });
    renderScreen();
    await waitFor(() =>
      expect(html()).toHaveAttribute("data-theme-mode", "system"),
    );
    expect(html()).toHaveAttribute("data-theme", "dark");

    act(() => {
      for (const listener of mediaListeners) listener({ matches: false });
    });
    expect(html()).toHaveAttribute("data-theme", "light");
  });
});
