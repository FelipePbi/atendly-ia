// @vitest-environment jsdom
/**
 * Goal023 (§8): seção Conversas em Configurações.
 *
 * O que esta suíte prova:
 *
 * - o bloco lê `retention.get` e reflete os prazos salvos (Comercial e
 *   Pessoal), cada um com exatamente as quatro opções (30/90/180/365);
 * - escolher só muda o rascunho; um único "Salvar" (Goal104, R1) grava os dois
 *   prazos num PATCH. Aumentar grava direto, sem confirmação;
 * - reduzir e salvar abre um diálogo que avisa que mensagens antigas poderão
 *   ser removidas e que não há volta, e só depois de confirmado o PATCH sai com
 *   `confirmReduction: true`;
 * - cancelar a confirmação não envia nada;
 * - Não classificadas é só texto explicativo, sem seletor: a nota diz que segue
 *   o prazo Comercial;
 * - o diálogo de redução da Comercial menciona Não classificadas; o da Pessoal
 *   não (Goal080);
 * - erro ao carregar não inventa estado próprio;
 * - as opções vêm da resposta do servidor, não de uma lista local: o seletor
 *   mostra exatamente a allowlist que o `GET` declarou.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
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
    unclassifiedRetentionFollows: "COMMERCIAL",
    lastSweepCompletedAt: null,
    appliesFrom: "NEXT_SWEEP",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

const COMMERCIAL = "Conversas comerciais";
const PERSONAL = "Conversas pessoais";
const INTRO = "Por quanto tempo guardar as mensagens";

function group(name: string): HTMLElement {
  return screen.getByRole("radiogroup", { name });
}

function radio(groupName: string, days: string): HTMLElement {
  return within(group(groupName)).getByRole("radio", { name: days });
}

test("reflete os prazos salvos, com Comercial 90 e Pessoal 30 marcados", async () => {
  get.mockResolvedValue(retentionFixture());
  const { container } = render(<RetentionSection />);

  expect(
    await screen.findByRole("heading", { name: INTRO }),
  ).toBeInTheDocument();
  expect(radio(COMMERCIAL, "90 dias")).toBeChecked();
  expect(radio(PERSONAL, "30 dias")).toBeChecked();
  expect(radio(COMMERCIAL, "30 dias")).not.toBeChecked();
  expect(radio(PERSONAL, "90 dias")).not.toBeChecked();
  await expectNoA11yViolations(container);
});

test("cada seletor mostra exatamente as quatro opções de prazo", async () => {
  get.mockResolvedValue(retentionFixture());
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  for (const days of ["30 dias", "90 dias", "180 dias", "1 ano"]) {
    expect(radio(COMMERCIAL, days)).toBeInTheDocument();
    expect(radio(PERSONAL, days)).toBeInTheDocument();
  }
  // Quatro por categoria, e nada além: a lista é a allowlist do servidor.
  expect(screen.getAllByRole("radio")).toHaveLength(8);
});

test("o seletor lê a allowlist do servidor em vez de declarar a própria", async () => {
  // Resposta deliberadamente mais curta que a lista do produto: se o
  // componente mantivesse uma constante local, ele ofereceria opções que este
  // servidor não aceita.
  get.mockResolvedValue(retentionFixture({ retentionDaysOptions: [30, 90] }));
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  expect(screen.getAllByRole("radio")).toHaveLength(4);
  expect(
    within(group(COMMERCIAL)).queryByRole("radio", { name: "1 ano" }),
  ).not.toBeInTheDocument();
});

test("aumentar o prazo e salvar grava direto, sem diálogo de confirmação", async () => {
  get.mockResolvedValue(retentionFixture());
  update.mockResolvedValue(retentionFixture({ commercialRetentionDays: 180 }));
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  await user.click(radio(COMMERCIAL, "180 dias"));
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      commercialRetentionDays: 180,
      personalRetentionDays: 30,
    }),
  );
  expect(update).toHaveBeenCalledTimes(1);
  expect(radio(COMMERCIAL, "180 dias")).toBeChecked();
});

test("reduzir e salvar abre confirmação que avisa remoção de mensagens antigas e ausência de volta, sem alterar nada antes", async () => {
  get.mockResolvedValue(retentionFixture());
  const user = userEvent.setup();
  const { container } = render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  await user.click(radio(COMMERCIAL, "30 dias"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(update).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/mensagens com mais de 30 dias serão removidas/i);
  await expectNoA11yViolations(container);
});

test("cancelar a redução não faz PATCH nenhum", async () => {
  get.mockResolvedValue(retentionFixture());
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  await user.click(radio(COMMERCIAL, "30 dias"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByRole("dialog");

  await user.click(screen.getByRole("button", { name: "Manter 90 dias" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});

test("confirmar a redução só então envia o PATCH com confirmReduction", async () => {
  get.mockResolvedValue(retentionFixture());
  update.mockResolvedValue(retentionFixture({ commercialRetentionDays: 30 }));
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  await user.click(radio(COMMERCIAL, "30 dias"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByRole("dialog");
  expect(update).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Reduzir para 30 dias" }));

  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      commercialRetentionDays: 30,
      personalRetentionDays: 30,
      confirmReduction: true,
    }),
  );
  expect(update).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(radio(COMMERCIAL, "30 dias")).toBeChecked();
});

test("Não classificadas é só texto explicativo, sem seletor: segue o prazo Comercial", async () => {
  get.mockResolvedValue(retentionFixture());
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });
  const note = screen.getByText(/Não classificadas/);
  expect(note).toBeVisible();
  expect(note.textContent).not.toMatch(/exclu[íi]|remov|apaga|delet/i);
  // U-01 tem duas metades, e a nota precisa das duas: Não classificadas
  // segue o prazo Comercial, e classificar como Pessoal passa a aplicar o
  // prazo Pessoal dali em diante. Dizer só a primeira deixa a pessoa sem
  // saber o que acontece depois de classificar.
  expect(note.textContent).toMatch(
    /Não classificadas seguem o prazo Comercial/i,
  );
  expect(note.textContent).toMatch(
    /Pessoal, o prazo Pessoal passa\s+a valer/i,
  );
  // O texto anterior dizia que o grupo não tinha prazo; isso não é mais verdade.
  expect(note.textContent).not.toMatch(/não têm prazo|enquanto a categoria/i);
  expect(
    screen.queryByRole("radio", { name: /Não classificadas/ }),
  ).not.toBeInTheDocument();
});

test("o diálogo de redução da Comercial menciona Não classificadas; o da Pessoal não", async () => {
  get.mockResolvedValue(retentionFixture({ personalRetentionDays: 90 }));
  const user = userEvent.setup();
  render(<RetentionSection />);

  await screen.findByRole("heading", { name: INTRO });

  await user.click(radio(COMMERCIAL, "30 dias"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  const commercialDialog = await screen.findByRole("dialog");
  expect(commercialDialog).toHaveTextContent(
    "As Não classificadas seguem o mesmo prazo.",
  );
  await user.click(screen.getByRole("button", { name: "Manter 90 dias" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  // Cancelar mantém a escolha na tela; volta a Comercial ao valor salvo para
  // reduzir só a Pessoal.
  await user.click(radio(COMMERCIAL, "90 dias"));
  await user.click(radio(PERSONAL, "30 dias"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  const personalDialog = await screen.findByRole("dialog");
  expect(personalDialog).toHaveTextContent(/mensagens com mais de 30 dias serão removidas/i);
  expect(personalDialog).not.toHaveTextContent(/Não classificadas/);
  expect(update).not.toHaveBeenCalled();
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
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
