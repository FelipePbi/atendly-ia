// @vitest-environment jsdom
/**
 * Configuração do retorno de clientes (D-206): ritmo (mensagens por dia,
 * dias e horário), prazo da Renovação, dias do Resgate, incentivo e o
 * texto-base de cada rotina. Salvar confirma com toast; texto-base com campo
 * desconhecido é recusado antes de chegar ao servidor.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ReturnSettings } from "@/data";
import { ReturnSettingsSection } from "@/features/customer-return/ReturnSettingsSection";

import { expectNoA11yViolations } from "./support/a11y";

const settingsRead = vi.fn();
const updateSettings = vi.fn();
const showToast = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/configuracoes/retorno",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    customerReturn: { settings: settingsRead, updateSettings },
  }),
}));
vi.mock("@/shared/ui/toastBus", () => ({
  showToast: (...args: unknown[]) => {
    showToast(...args);
  },
}));

const SETTINGS: ReturnSettings = {
  configured: false,
  dailyLimit: 10,
  windowDays: [1, 2, 3, 4, 5, 6],
  windowStart: "09:00",
  windowEnd: "19:00",
  leadDays: 2,
  winbackDays: 60,
  winbackIncentive: null,
  renewalMessage: null,
  winbackMessage: null,
};

beforeEach(() => {
  settingsRead.mockReset();
  updateSettings.mockReset();
  showToast.mockReset();
  settingsRead.mockResolvedValue(SETTINGS);
  updateSettings.mockImplementation(async (input: Partial<ReturnSettings>) => ({
    ...SETTINGS,
    ...input,
    configured: true,
  }));
});

describe("Configurações › Retorno de clientes", () => {
  test("mostra o padrão do produto e salva o ritmo com toast", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReturnSettingsSection tone="BALANCED" />);
    const limit = await screen.findByLabelText("Mensagens por dia");
    expect(limit).toHaveValue(10);
    expect(
      screen.getByText(
        "Saem seg a sáb, das 9h às 19h, no fuso do seu negócio.",
      ),
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole("button", { name: "Uma mensagem a mais por dia" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "sábado" }));
    await user.click(screen.getByRole("button", { name: "3 dias" }));
    await user.click(screen.getByRole("button", { name: "90 dias" }));
    await user.type(
      screen.getByLabelText("Incentivo do Resgate"),
      "hidratação de brinde",
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        dailyLimit: 11,
        windowDays: [1, 2, 3, 4, 5],
        windowStart: "09:00",
        windowEnd: "19:00",
        leadDays: 3,
        winbackDays: 90,
        winbackIncentive: "hidratação de brinde",
      }),
    );
    expect(showToast).toHaveBeenCalledWith("Retorno de clientes salvo.");
  });

  test("sem dia de envio, não salva e diz o porquê", async () => {
    const user = userEvent.setup();
    settingsRead.mockResolvedValue({ ...SETTINGS, windowDays: [1] });
    render(<ReturnSettingsSection tone="BALANCED" />);
    await screen.findByLabelText("Mensagens por dia");
    await user.click(screen.getByRole("checkbox", { name: "segunda" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(
      screen.getByText(
        "Escolha ao menos um dia e um horário que termina depois de começar.",
      ),
    ).toBeVisible();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  test("texto-base com campo desconhecido é recusado; o válido salva com toast", async () => {
    const user = userEvent.setup();
    render(<ReturnSettingsSection delivery="SINGLE" tone="BALANCED" />);
    await screen.findByLabelText("Mensagens por dia");
    await user.click(
      screen.getByRole("button", { name: "Mensagem da Renovação" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Mensagem da Renovação",
    });
    const field = within(dialog).getByLabelText("Texto-base");
    expect((field as HTMLTextAreaElement).value).toContain(
      "Oi, {nome}! Tudo bem?",
    );
    await user.clear(field);
    await user.type(field, "Oi {{apelido}");
    expect((field as HTMLTextAreaElement).value).toBe("Oi {apelido}");
    expect(
      within(dialog).getByText(/\{apelido\} não é um campo conhecido/u),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Salvar" }),
    ).toBeDisabled();

    await user.clear(field);
    await user.type(field, "Oiee, {{nome}! Bora renovar {{servico}?");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        renewalMessage: "Oiee, {nome}! Bora renovar {servico}?",
      }),
    );
    expect(showToast).toHaveBeenCalledWith("Mensagem salva.");
  });

  // D-208: em várias mensagens, o texto-base tem uma ideia por linha e o
  // editor avisa que cada linha vira uma mensagem.
  test("em várias mensagens, o texto-base inicial tem uma mensagem por linha", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReturnSettingsSection tone="BALANCED" />);
    await screen.findByLabelText("Mensagens por dia");
    await user.click(
      screen.getByRole("button", { name: "Mensagem da Renovação" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Mensagem da Renovação",
    });
    const field = within(dialog).getByLabelText("Texto-base");
    expect((field as HTMLTextAreaElement).value.split("\n")).toEqual([
      "Oi, {nome}!",
      "Tudo bem?",
      "Está chegando a hora do seu atendimento de {servico}, {quando}.",
      "Quer que eu já reserve um horário?",
      "Tenho {horarios}.",
    ]);
    expect(field).toHaveAccessibleDescription(/Cada linha vira uma mensagem\./u);
    await expectNoA11yViolations(container);
  });
});
