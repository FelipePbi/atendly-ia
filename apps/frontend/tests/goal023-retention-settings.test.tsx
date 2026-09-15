// @vitest-environment jsdom
/**
 * Goal023 (§8): seção Conversas em Configurações.
 *
 * O que esta suíte prova:
 *
 * - o bloco lê `retention.get` e reflete os prazos salvos (Comercial e
 *   Pessoal), cada um com exatamente as quatro opções (30/90/180/365);
 * - aumentar o prazo grava direto, sem confirmação;
 * - reduzir abre um diálogo que avisa que mensagens antigas poderão ser
 *   removidas e que não há volta, e só depois de confirmado o PATCH sai com
 *   `confirmReduction: true`;
 * - cancelar a confirmação não altera nada: nenhum PATCH sai e o seletor
 *   continua mostrando o valor salvo;
 * - Não classificadas é só texto explicativo, sem seletor e sem promessa de
 *   exclusão;
 * - erro ao carregar não inventa estado próprio;
 * - as opções vêm da resposta do servidor, não de uma lista local: o seletor
 *   mostra exatamente a allowlist que o `GET` declarou.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RetentionSettings } from "@/data";
import { RetentionSection } from "@/features/settings/RetentionSection";

import { expectNoA11yViolations } from "./support/a11y";

const get = vi.fn();
const update = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    retention: { get, update },
  }),
}));

function retentionFixture(
  overrides: Partial<RetentionSettings> = {},
): RetentionSettings {
  return {
    commercialRetentionDays: 90,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedPurged: false,
    lastSweepCompletedAt: null,
    appliesFrom: "NEXT_SWEEP",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("reflete os prazos salvos, com Comercial 90 e Pessoal 30 marcados", async () => {
  get.mockResolvedValue(retentionFixture());
  const { container } = render(<RetentionSection />);

  expect(
    await screen.findByRole("heading", { name: "Conversas" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Comercial: 90 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("button", { name: "Pessoal: 30 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("button", { name: "Comercial: 30 dias" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.getByRole("button", { name: "Pessoal: 90 dias" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expectNoA11yViolations(container);
});

test("cada seletor mostra exatamente as quatro opções de prazo", async () => {
  get.mockResolvedValue(retentionFixture());
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  for (const days of [30, 90, 180, 365]) {
    expect(
      screen.getByRole("button", { name: `Comercial: ${days} dias` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Pessoal: ${days} dias` }),
    ).toBeInTheDocument();
  }
  // Quatro por categoria, e nada além: a lista é a allowlist do servidor.
  expect(screen.getAllByRole("button", { name: /dias$/ })).toHaveLength(8);
});

test("o seletor lê a allowlist do servidor em vez de declarar a própria", async () => {
  // Resposta deliberadamente mais curta que a lista do produto: se o
  // componente mantivesse uma constante local, ele ofereceria opções que este
  // servidor não aceita.
  get.mockResolvedValue(retentionFixture({ retentionDaysOptions: [30, 90] }));
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  expect(screen.getAllByRole("button", { name: /dias$/ })).toHaveLength(4);
  expect(
    screen.queryByRole("button", { name: "Comercial: 365 dias" }),
  ).not.toBeInTheDocument();
});

test("aumentar o prazo grava direto, sem diálogo de confirmação", async () => {
  get.mockResolvedValue(retentionFixture());
  update.mockResolvedValue(retentionFixture({ commercialRetentionDays: 180 }));
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  await user.click(screen.getByRole("button", { name: "Comercial: 180 dias" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ commercialRetentionDays: 180 }),
  );
  expect(
    screen.getByRole("button", { name: "Comercial: 180 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("reduzir abre confirmação que avisa remoção de mensagens antigas e ausência de volta, sem alterar nada antes", async () => {
  get.mockResolvedValue(retentionFixture());
  const user = userEvent.setup();
  const { container } = render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  await user.click(screen.getByRole("button", { name: "Comercial: 30 dias" }));

  expect(update).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/mensagens.*antigas.*removidas/i);
  expect(dialog).toHaveTextContent(/não há como recuperá-las/i);
  expect(
    screen.getByRole("button", { name: "Comercial: 90 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectNoA11yViolations(container);
});

test("cancelar a redução não faz PATCH nenhum e mantém o seletor no valor salvo", async () => {
  get.mockResolvedValue(retentionFixture());
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  await user.click(screen.getByRole("button", { name: "Comercial: 30 dias" }));
  await screen.findByRole("dialog");

  await user.click(screen.getByRole("button", { name: "Manter prazo atual" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Comercial: 90 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("confirmar a redução só então envia o PATCH com confirmReduction", async () => {
  get.mockResolvedValue(retentionFixture());
  update.mockResolvedValue(retentionFixture({ commercialRetentionDays: 30 }));
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  await user.click(screen.getByRole("button", { name: "Comercial: 30 dias" }));
  await screen.findByRole("dialog");
  expect(update).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Reduzir prazo" }));

  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      commercialRetentionDays: 30,
      confirmReduction: true,
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Comercial: 30 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Não classificadas é só texto explicativo, sem seletor e sem promessa de exclusão", async () => {
  get.mockResolvedValue(retentionFixture());
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: "Conversas" });
  const note = screen.getByText(/Não classificadas/);
  expect(note).toBeVisible();
  expect(note.textContent).not.toMatch(/exclu[íi]|remov|apaga|delet/i);
  // U-01 tem duas metades, e a nota precisa das duas: o conteúdo fica
  // enquanto a categoria não for definida, e classificar passa a aplicar o
  // prazo da categoria escolhida dali em diante. Dizer só a primeira deixa a
  // pessoa sem saber o que acontece depois de classificar.
  expect(note.textContent).toMatch(
    /guardado enquanto a categoria não for definida/i,
  );
  expect(note.textContent).toMatch(
    /Comercial ou Pessoal, o prazo dessa categoria passa\s+a valer/i,
  );
  expect(
    screen.queryByRole("button", { name: /Não classificadas/ }),
  ).not.toBeInTheDocument();
});

describe("nunca inventa estado próprio", () => {
  test("erro ao carregar: mostra mensagem de indisponibilidade, sem inventar valores", async () => {
    get.mockRejectedValue(new Error("falhou"));
    render(<RetentionSection />);

    await waitFor(() =>
      expect(
        screen.getByText("Não foi possível carregar o prazo de retenção agora."),
      ).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: /dias/ })).not.toBeInTheDocument();
  });
});
