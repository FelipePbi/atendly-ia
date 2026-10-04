// @vitest-environment jsdom
/**
 * Goal095 — Serviços iguais ao protótipo (Servicos:S1, S3, Servicos:S4 e
 * Agenda:S1).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. a lista (S1): resumo, "duração · preço", traço na cor, pendência com
 *    "Corrigir", inativos com "a IA não oferece" e nenhum botão de status;
 * 2. o novo serviço (S3): "Nome", "Duração" e "Preço", preço segmentado que
 *    grava o `priceType` certo, cinco linhas de opção fechadas, sem "Serviço
 *    ativo" e com o CTA "Salvar serviço";
 * 3. a edição (S4 e Agenda:S1): linhas que abrem ao toque sem perder valor,
 *    as seis cores com a paleta do protótipo, a prévia "Assim na agenda" e
 *    `active: false` no PATCH;
 * 4. a paleta: o hex de cada token em `avenly-services.css`;
 * 5. a casca: uma chamada de `useShellConfig` por árvore, nas duas faixas.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pelo `visual:compare` contra os quadros.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { Service, ServiceColorToken } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace }),
}));

const shellCallers = vi.hoisted(() => new Set<string>());

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (config: ShellConfig) => {
      shellCallers.add(useId());
      actual.useShellConfig(config);
    },
  };
});

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const calendarGetCalendar = vi.fn();
const conversationsList = vi.fn();
const serviceCatalogList = vi.fn();
const serviceCatalogCreate = vi.fn();
const serviceCatalogUpdate = vi.fn();
const serviceCatalogGetAiInstruction = vi.fn();
const serviceCatalogUpdateAiInstruction = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: { getCalendar: calendarGetCalendar },
    conversations: { list: conversationsList },
    notifications: { summary: notificationsSummary },
    serviceCatalog: {
      create: serviceCatalogCreate,
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
      update: serviceCatalogUpdate,
      updateAiInstruction: serviceCatalogUpdateAiInstruction,
    },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

const WIDE = 1280;
const NARROW = 390;

function setViewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: null,
    description: null,
    durationMinutes: 45,
    id: "s1",
    name: "Corte feminino",
    needsReview: false,
    price: 90,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
    ...overrides,
  };
}

beforeEach(() => {
  shellCallers.clear();
  push.mockReset();
  replace.mockReset();
  for (const mock of [
    statusGet,
    notificationsSummary,
    calendarGetCalendar,
    conversationsList,
    serviceCatalogList,
    serviceCatalogCreate,
    serviceCatalogUpdate,
    serviceCatalogGetAiInstruction,
    serviceCatalogUpdateAiInstruction,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue({
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  calendarGetCalendar.mockResolvedValue(null);
  conversationsList.mockResolvedValue([]);
  serviceCatalogGetAiInstruction.mockResolvedValue({ content: "" });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

function catalog(items: Service[], editable = true) {
  serviceCatalogList.mockResolvedValue({
    editable,
    items,
    managedExternally: false,
    source: "AVENLY",
  });
}

async function renderList(items: Service[], editable = true) {
  catalog(items, editable);
  const utils = render(
    <ShellConfigProvider>
      <ProductServicesScreen scenario="list" />
    </ShellConfigProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Serviços" });
  await waitFor(() =>
    expect(screen.queryByLabelText("Carregando dados")).toBeNull(),
  );
  return utils;
}

async function renderNewForm() {
  catalog([]);
  const utils = render(
    <ShellConfigProvider>
      <ProductServicesScreen scenario="new" />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Nome");
  return utils;
}

async function renderEditForm(
  service: Service,
  instruction = "",
): Promise<ReturnType<typeof render>> {
  catalog([service]);
  serviceCatalogGetAiInstruction.mockResolvedValue({ content: instruction });
  serviceCatalogUpdate.mockResolvedValue(service);
  serviceCatalogUpdateAiInstruction.mockResolvedValue({ content: "" });
  const utils = render(
    <ShellConfigProvider>
      <ProductServicesScreen scenario="edit" serviceId={service.id} />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Nome");
  return utils;
}

const OPTION_TITLES = [
  "Cor na agenda",
  "Descrição",
  "Recorrência",
  "Intervalo antes e depois",
  "Instruções para a IA",
] as const;

function optionRow(title: (typeof OPTION_TITLES)[number]): HTMLElement {
  return screen.getByRole("button", {
    name: new RegExp(`^${title}`),
  });
}

async function typePrice(
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
) {
  const price = await screen.findByPlaceholderText<HTMLInputElement>("R$ 0,00");
  for (const digit of digits) {
    await user.type(price, digit);
  }
}

function durationInput() {
  return screen.getByLabelText<HTMLInputElement>("Duração (minutos)", {
    exact: false,
  });
}

describe("Goal095 prova 1: a lista (S1)", () => {
  const items = [
    serviceFixture({
      colorToken: "ROSE",
      id: "s1",
      name: "Corte feminino",
      price: 90,
    }),
    serviceFixture({ id: "s2", name: "Escova", price: 60 }),
    serviceFixture({
      durationMinutes: null,
      id: "s3",
      name: "Pendente",
      needsReview: true,
      reviewOrigin: "MANUAL",
    }),
    serviceFixture({
      active: false,
      durationMinutes: 120,
      id: "s4",
      name: "Massagem",
      price: 250,
    }),
  ];

  test("o resumo fica no cabeçalho", async () => {
    await renderList(items);
    expect(
      screen.getByText("2 ativos · 1 precisa de revisão · 1 inativo"),
    ).toBeVisible();
  });

  test("a linha mostra o nome e 'duração · preço'", async () => {
    await renderList(items);
    expect(screen.getByText("Corte feminino")).toBeVisible();
    expect(screen.getByText("45 min · R$ 90")).toBeVisible();
    expect(screen.getByText("45 min · R$ 60")).toBeVisible();
  });

  test("o traço usa a cor do serviço", async () => {
    await renderList(items);
    const row = screen
      .getByRole("link", { name: "Editar Corte feminino" })
      .closest("li") as HTMLElement;
    expect(row.querySelector(".service-row-accent")).toHaveAttribute(
      "data-color",
      "ROSE",
    );
    const neutral = screen
      .getByRole("link", { name: "Editar Escova" })
      .closest("li") as HTMLElement;
    expect(neutral.querySelector(".service-row-accent")).not.toHaveAttribute(
      "data-color",
    );
  });

  test("a pendência fica em âmbar com o motivo e a ação 'Corrigir'", async () => {
    await renderList(items);
    expect(screen.getByText("Precisa de revisão · sem duração")).toBeVisible();
    const fix = screen.getByRole("link", { name: "Corrigir Pendente" });
    expect(fix).toHaveTextContent("Corrigir");
    expect(fix).toHaveAttribute("href", "/servicos/editar?id=s3");
  });

  test("os inativos ficam separados, com 'a IA não oferece'", async () => {
    await renderList(items);
    const group = screen.getByText("Inativos").closest("div") as HTMLElement;
    expect(within(group).getByText("Massagem")).toBeVisible();
    expect(within(group).getByText(/a IA não oferece/)).toBeVisible();
    const row = within(group)
      .getByRole("link", { name: "Editar Massagem" })
      .closest("li") as HTMLElement;
    expect(row).toHaveClass("is-inactive");
  });

  test("nenhuma linha tem botão 'Desativar' ou 'Ativar'", async () => {
    const { container } = await renderList(items);
    expect(
      screen.queryByRole("button", { name: /^(Desativar|Ativar)/ }),
    ).toBeNull();
    const rows = container.querySelectorAll("li.directory-row");
    expect(rows).toHaveLength(items.length);
    for (const row of rows) {
      expect(row.querySelector("button")).toBeNull();
    }
  });

  test("o link 'Editar <nome>' e a classe directory-row continuam", async () => {
    const { container } = await renderList(items);
    const link = screen.getByRole("link", { name: "Editar Corte feminino" });
    expect(link).toHaveAttribute("href", "/servicos/editar?id=s1");
    expect(link.closest("li")).toHaveClass("directory-row");
    expect(container.querySelectorAll("li.directory-row")).toHaveLength(4);
  });

  test("sem edição a lista é só leitura, sem link nem 'Corrigir'", async () => {
    await renderList(items, false);
    expect(screen.queryByRole("link", { name: /^Editar / })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Corrigir / })).toBeNull();
    expect(screen.getAllByText("Somente leitura").length).toBeGreaterThan(0);
  });
});

describe("Goal095 prova 2: novo serviço (S3)", () => {
  test("os campos são 'Nome', 'Duração' e 'Preço', sem 'Essencial'", async () => {
    await renderNewForm();
    expect(screen.getByLabelText("Nome")).toBeVisible();
    expect(durationInput()).toBeVisible();
    expect(screen.getByText("Preço")).toBeVisible();
    expect(screen.queryByText("Essencial")).toBeNull();
    expect(screen.queryByLabelText("Nome do serviço")).toBeNull();
  });

  test("o preço tem quatro opções com estado, 'Fixo' marcado", async () => {
    await renderNewForm();
    const radios = screen.getAllByRole("radio", {
      name: /^(Fixo|A partir de|Sob consulta|Sem preço)$/,
    });
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "FIXED",
      "STARTING_AT",
      "ON_REQUEST",
      "NOT_INFORMED",
    ]);
    expect(screen.getByRole("radio", { name: "Fixo" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "A partir de" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Sob consulta" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Sem preço" })).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "Preço fixo" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Não informado" })).toBeNull();
  });

  test.each([
    ["Fixo", "FIXED", 55],
    ["A partir de", "STARTING_AT", 55],
    ["Sob consulta", "ON_REQUEST", null],
    ["Sem preço", "NOT_INFORMED", null],
  ] as const)(
    "'%s' grava %s no pedido de criação, com active: true",
    async (label, priceType, price) => {
      const user = userEvent.setup();
      serviceCatalogCreate.mockResolvedValue(serviceFixture({ id: "new-id" }));
      await renderNewForm();

      await user.type(screen.getByLabelText("Nome"), "Manicure");
      await user.type(durationInput(), "40");
      await user.click(screen.getByRole("radio", { name: label }));
      expect(screen.getByRole("radio", { name: label })).toBeChecked();
      if (price !== null) await typePrice(user, "55");
      await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

      await waitFor(() =>
        expect(serviceCatalogCreate).toHaveBeenCalledTimes(1),
      );
      expect(serviceCatalogCreate).toHaveBeenCalledWith({
        active: true,
        bufferAfterMinutes: 0,
        bufferBeforeMinutes: 0,
        colorToken: null,
        description: null,
        durationMinutes: 40,
        name: "Manicure",
        price,
        priceType,
        recurrenceIntervalDays: null,
      });
      expect(replace).toHaveBeenCalledWith("/servicos");
    },
  );

  test("a regra de preço responde antes de qualquer pedido", async () => {
    const user = userEvent.setup();
    await renderNewForm();
    await user.type(screen.getByLabelText("Nome"), "Manicure");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));
    expect(
      await screen.findByText(/^Informe o valor/, { selector: "[role=alert]" }),
    ).toBeVisible();
    expect(serviceCatalogCreate).not.toHaveBeenCalled();
  });

  test("a frase 'A IA responde' acompanha o formulário", async () => {
    const user = userEvent.setup();
    await renderNewForm();
    await user.type(screen.getByLabelText("Nome"), "Manicure");
    await user.type(durationInput(), "40");
    await typePrice(user, "55");
    expect(
      screen.getByText("A IA responde: “Manicure custa R$ 55 e leva 40 min.”"),
    ).toBeVisible();
  });

  test("as cinco linhas de opção nascem fechadas e mostram o valor atual", async () => {
    await renderNewForm();
    const values: Record<(typeof OPTION_TITLES)[number], string> = {
      "Cor na agenda": "Sem cor",
      "Descrição": "Opcional",
      "Instruções para a IA": "Nenhuma",
      "Intervalo antes e depois": "Nenhum",
      "Recorrência": "Não",
    };
    for (const title of OPTION_TITLES) {
      const row = optionRow(title);
      expect(row, title).toHaveAttribute("aria-expanded", "false");
      expect(within(row).getByText(values[title]), title).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { expanded: false }).length).toBe(5);
  });

  test("tocar a linha abre o editor dela, sem fechar as outras", async () => {
    const user = userEvent.setup();
    await renderNewForm();

    expect(
      screen.getByLabelText("Descrição (opcional)", { selector: "textarea" }),
    ).not.toBeVisible();

    await user.click(optionRow("Descrição"));
    expect(optionRow("Descrição")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Descrição (opcional)")).toBeVisible();

    await user.click(optionRow("Recorrência"));
    expect(optionRow("Recorrência")).toHaveAttribute("aria-expanded", "true");
    expect(optionRow("Descrição")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Descrição (opcional)")).toBeVisible();

    await user.click(optionRow("Descrição"));
    expect(optionRow("Descrição")).toHaveAttribute("aria-expanded", "false");
    expect(optionRow("Recorrência")).toHaveAttribute("aria-expanded", "true");
  });

  test("'Serviço ativo' não aparece na criação", async () => {
    await renderNewForm();
    expect(screen.queryByRole("checkbox", { name: /Serviço ativo/ })).toBeNull();
    expect(screen.queryByText("Serviço ativo")).toBeNull();
  });

  test("o CTA é 'Salvar serviço', não 'Criar serviço'", async () => {
    await renderNewForm();
    expect(
      screen.getByRole("button", { name: "Salvar serviço" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Criar serviço" })).toBeNull();
  });
});

describe("Goal095 prova 3: edição (S4 e Agenda:S1)", () => {
  const edited = () =>
    serviceFixture({
      bufferAfterMinutes: 15,
      bufferBeforeMinutes: 0,
      recurrenceIntervalDays: 35,
    });

  test("as linhas nascem fechadas e mostram o valor atual do serviço", async () => {
    await renderEditForm(edited(), "Não faço henna.");
    const values: Record<(typeof OPTION_TITLES)[number], string> = {
      "Cor na agenda": "Sem cor",
      "Descrição": "Opcional",
      "Instruções para a IA": "Definidas",
      "Intervalo antes e depois": "Antes 0 · Depois 15",
      "Recorrência": "A cada 5 semanas",
    };
    for (const title of OPTION_TITLES) {
      const row = optionRow(title);
      expect(row, title).toHaveAttribute("aria-expanded", "false");
      await waitFor(() =>
        expect(within(row).getByText(values[title]), title).toBeInTheDocument(),
      );
    }
  });

  test("'Serviço ativo' fica abaixo das linhas e o CTA é 'Salvar alterações'", async () => {
    await renderEditForm(edited());
    const active = screen.getByRole("checkbox", { name: /Serviço ativo/ });
    expect(active).toBeChecked();
    const lastRow = optionRow("Instruções para a IA");
    expect(
      lastRow.compareDocumentPosition(active) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Salvar alterações" }),
    ).toBeVisible();
  });

  test("as linhas abrem ao toque e os campos mantêm nome e validação", async () => {
    const user = userEvent.setup();
    await renderEditForm(edited());

    await user.click(optionRow("Intervalo antes e depois"));
    const before = screen.getByLabelText<HTMLInputElement>(
      "Intervalo antes do atendimento (minutos)",
    );
    const after = screen.getByLabelText<HTMLInputElement>(
      "Intervalo depois do atendimento (minutos)",
    );
    expect(before).toBeVisible();
    for (const field of [before, after]) {
      expect(field).toHaveAttribute("min", "0");
      expect(field).toHaveAttribute("step", "5");
    }
    expect(after.value).toBe("15");
    fireEvent.change(before, { target: { value: "-5" } });
    expect(before.checkValidity()).toBe(false);
    fireEvent.change(before, { target: { value: "7" } });
    expect(before.checkValidity()).toBe(false);
    fireEvent.change(before, { target: { value: "10" } });
    expect(before.checkValidity()).toBe(true);

    await user.click(optionRow("Recorrência"));
    const recurrence = screen.getByLabelText<HTMLInputElement>(
      "Repetir automaticamente a cada (dias)",
    );
    expect(recurrence.value).toBe("35");
    fireEvent.change(recurrence, { target: { value: "0" } });
    expect(recurrence.checkValidity()).toBe(false);

    await user.click(optionRow("Instruções para a IA"));
    expect(screen.getByLabelText("Instruções para a IA")).toBeVisible();

    await user.click(optionRow("Descrição"));
    expect(screen.getByLabelText("Descrição (opcional)")).toBeVisible();

    const name = screen.getByLabelText<HTMLInputElement>("Nome");
    fireEvent.change(name, { target: { value: "" } });
    expect(name.checkValidity()).toBe(false);
  });

  test("fechar uma linha alterada não descarta o valor no pedido", async () => {
    const user = userEvent.setup();
    await renderEditForm(edited());

    await user.click(optionRow("Intervalo antes e depois"));
    fireEvent.change(
      screen.getByLabelText("Intervalo antes do atendimento (minutos)"),
      { target: { value: "10" } },
    );
    await user.click(optionRow("Intervalo antes e depois"));
    expect(optionRow("Intervalo antes e depois")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(optionRow("Descrição"));
    await user.type(
      screen.getByLabelText("Descrição (opcional)"),
      "Com lavagem",
    );
    await user.click(optionRow("Descrição"));

    await user.click(optionRow("Recorrência"));
    fireEvent.change(
      screen.getByLabelText("Repetir automaticamente a cada (dias)"),
      { target: { value: "14" } },
    );
    await user.click(optionRow("Recorrência"));

    await user.click(optionRow("Instruções para a IA"));
    await user.type(
      screen.getByLabelText("Instruções para a IA"),
      "Não faço henna.",
    );
    await user.click(optionRow("Instruções para a IA"));

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1));
    expect(serviceCatalogUpdate).toHaveBeenCalledWith("s1", {
      active: true,
      bufferAfterMinutes: 15,
      bufferBeforeMinutes: 10,
      colorToken: null,
      description: "Com lavagem",
      durationMinutes: 45,
      name: "Corte feminino",
      price: 90,
      priceType: "FIXED",
      recurrenceIntervalDays: 14,
    });
    await waitFor(() =>
      expect(serviceCatalogUpdateAiInstruction).toHaveBeenCalledWith(
        "s1",
        "Não faço henna.",
      ),
    );
  });

  test("'Cor na agenda' mostra 'sem cor' e as seis cores, na ordem e com os nomes do protótipo", async () => {
    const user = userEvent.setup();
    await renderEditForm(edited());
    await user.click(optionRow("Cor na agenda"));

    const group = screen.getByRole("radiogroup", { name: "Cor na agenda" });
    const radios = within(group).getAllByRole("radio");
    const names = [
      "Sem cor",
      "Ameixa",
      "Terracota",
      "Oliva",
      "Ardósia",
      "Rosa-antigo",
      "Lavanda",
    ];
    expect(radios).toHaveLength(names.length);
    names.forEach((name, index) => {
      expect(radios[index]).toHaveAccessibleName(name);
    });
    expect(radios[0]).toBeChecked();
    expect(screen.getByText("Seis cores sugeridas.")).toBeVisible();
  });

  test.each([
    ["Ameixa", "SKY"],
    ["Terracota", "AMBER"],
    ["Oliva", "EMERALD"],
    ["Ardósia", "SLATE"],
    ["Rosa-antigo", "ROSE"],
    ["Lavanda", "VIOLET"],
  ] as const satisfies ReadonlyArray<readonly [string, ServiceColorToken]>)(
    "escolher %s envia o token %s e a prévia usa a cor",
    async (label, token) => {
      const user = userEvent.setup();
      const { container } = await renderEditForm(edited());
      await user.click(optionRow("Cor na agenda"));
      await user.click(screen.getByRole("radio", { name: label }));

      expect(screen.getByRole("radio", { name: label })).toBeChecked();
      expect(within(optionRow("Cor na agenda")).getByText(label)).toBeVisible();
      expect(container.querySelector(".service-agenda-preview-bar")).toHaveAttribute(
        "data-color",
        token,
      );

      await user.click(
        screen.getByRole("button", { name: "Salvar alterações" }),
      );
      await waitFor(() =>
        expect(serviceCatalogUpdate).toHaveBeenCalledWith(
          "s1",
          expect.objectContaining({ colorToken: token }),
        ),
      );
    },
  );

  test("intervalo, instruções e recorrência abertos escondem o valor da linha por CSS", async () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/shared/styles/avenly-services.css"),
      "utf8",
    );
    const rule =
      /\.service-option\.is-open:is\(([^)]*)\)\s+\.service-option-value\s*\{\s*display:\s*none/.exec(
        css,
      );
    expect(rule).not.toBeNull();
    for (const option of ["buffers", "instruction", "recurrence"]) {
      expect(rule?.[1]).toContain(`[data-option="${option}"]`);
    }
  });

  test("a recorrência aberta mostra o valor como botão que revela o campo", async () => {
    const user = userEvent.setup();
    await renderEditForm(edited());
    await user.click(optionRow("Recorrência"));

    const field = screen.getByLabelText<HTMLInputElement>(
      "Repetir automaticamente a cada (dias)",
    );
    expect(field).not.toBeVisible();
    const action = screen.getByRole("button", { name: "A cada 5 semanas" });
    expect(action).toHaveAttribute("aria-expanded", "false");
    expect(action).toHaveAttribute("aria-controls", field.id);

    await user.click(action);
    expect(action).toHaveAttribute("aria-expanded", "true");
    expect(field).toBeVisible();
    expect(field.value).toBe("35");
  });

  test("na edição, Duração e Preço dividem a linha e não há atalhos de duração", async () => {
    const { container } = await renderEditForm(edited());
    const row = container.querySelector(".service-duration-price");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Duração")).toBeVisible();
    expect(within(row as HTMLElement).getByText("Preço")).toBeVisible();
    expect(durationInput().value).toBe("45");
    for (const minutes of ["30", "60", "90"]) {
      expect(
        screen.queryByRole("button", { name: new RegExp(`^${minutes}`) }),
      ).toBeNull();
    }
  });

  test("na edição, o rótulo do tipo de preço abre o controle segmentado e grava o tipo", async () => {
    const user = userEvent.setup();
    await renderEditForm(edited());
    const toggle = screen.getByRole("button", { name: /Tipo de preço: Fixo/ });
    const group = document.getElementById("service-price-types") as HTMLElement;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(group).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(group).toBeVisible();
    await user.click(within(group).getByRole("radio", { name: "Sob consulta" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(serviceCatalogUpdate).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ price: null, priceType: "ON_REQUEST" }),
      ),
    );
  });

  test("a prévia 'Assim na agenda' mostra a hora, o traço neutro e a linha do serviço", async () => {
    const user = userEvent.setup();
    const { container } = await renderEditForm(edited());
    await user.click(optionRow("Cor na agenda"));

    const label = screen.getByText("Assim na agenda");
    expect(label).toBeVisible();
    const preview = label.closest(".service-agenda-preview") as HTMLElement;
    expect(within(preview).getByText("15:30")).toBeVisible();
    expect(within(preview).getByText("Cliente")).toBeVisible();
    expect(
      within(preview).getByText("Corte feminino · 45 min · R$ 90"),
    ).toBeVisible();
    expect(
      container.querySelector(".service-agenda-preview-bar"),
    ).not.toHaveAttribute("data-color");
  });

  test("desmarcar 'Serviço ativo' e salvar envia active: false no PATCH", async () => {
    const user = userEvent.setup();
    await renderEditForm(edited());
    await user.click(screen.getByRole("checkbox", { name: /Serviço ativo/ }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(serviceCatalogUpdate).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ active: false }),
      ),
    );
  });

  test("um serviço inativo abre com 'Serviço ativo' desmarcado e reativa pela caixa", async () => {
    const user = userEvent.setup();
    await renderEditForm(serviceFixture({ active: false }));
    const active = screen.getByRole("checkbox", { name: /Serviço ativo/ });
    expect(active).not.toBeChecked();
    await user.click(active);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(serviceCatalogUpdate).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ active: true }),
      ),
    );
  });
});

describe("Goal095 prova 4: a paleta", () => {
  const css = readFileSync(
    path.join(process.cwd(), "src/shared/styles/avenly-services.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  function swatchOf(token: string): string | undefined {
    const rule = new RegExp(
      `\\[data-color="${token}"\\]\\s*\\{([^}]*)\\}`,
    ).exec(css);
    return /--swatch:\s*([^;]+);/.exec(rule?.[1] ?? "")?.[1]?.trim().toLowerCase();
  }

  test.each([
    ["SKY", "#8e5a86", "Ameixa"],
    ["AMBER", "#b8674a", "Terracota"],
    ["EMERALD", "#7c8a3e", "Oliva"],
    ["SLATE", "#5b6e9a", "Ardósia"],
    ["ROSE", "#c07a88", "Rosa-antigo"],
    ["VIOLET", "#8b7bb5", "Lavanda"],
  ] as const)("[data-color=%s] usa %s (%s)", (token, hex, _name) => {
    expect(swatchOf(token)).toBe(hex);
  });
});

describe("Goal095 prova 5: uma só chamada de useShellConfig por árvore", () => {
  type Route = { name: string; screen: () => ReactElement; loaded: () => void };

  const ROUTES: Route[] = [
    {
      loaded: () => screen.getByText("Corte feminino"),
      name: "/servicos",
      screen: () => <ProductServicesScreen scenario="list" />,
    },
    {
      loaded: () => expect(document.querySelector("form")).not.toBeNull(),
      name: "/servicos/novo",
      screen: () => <ProductServicesScreen scenario="new" />,
    },
    {
      loaded: () => expect(document.querySelector("form")).not.toBeNull(),
      name: "/servicos/editar",
      screen: () => <ProductServicesScreen scenario="edit" serviceId="s1" />,
    },
  ];

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)("nas três rotas, na faixa %s", async (_label, width) => {
    for (const route of ROUTES) {
      shellCallers.clear();
      catalog([serviceFixture()]);
      setViewport(width);
      const { unmount } = render(<PlatformLayout>{route.screen()}</PlatformLayout>);
      await waitFor(route.loaded);
      await waitFor(() => {
        expect(shellCallers.size, route.name).toBe(1);
      });
      unmount();
    }
  });
});
