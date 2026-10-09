// @vitest-environment jsdom
/**
 * Goal149 (WU-03): a linha da lista e da busca de Clientes diz quem agenda por
 * quem (CL1 e CL3). O responsável mostra "agenda para <nome>"; quem não tem
 * telefone próprio mostra "<responsável> agenda por esta pessoa". Sem os
 * campos, a linha fica como era.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  CustomerList,
  CustomerListPanel,
} from "@/features/customers/CustomerList";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const customersList = vi.fn();
const calendarGetCalendar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { getCalendar: calendarGetCalendar },
    customers: { list: customersList },
  }),
}));

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

type Person = { id: string; name: string | null };
type Row = {
  id: string;
  name: string | null;
  phone: string | null;
  guardian?: Person | null;
  dependents?: Person[];
};

function listResult(items: Row[]) {
  return { items, managedExternally: false, source: "AVENLY" };
}

function renderList() {
  return render(
    <ShellConfigProvider>
      <CustomerList />
    </ShellConfigProvider>,
  );
}

function rowOf(name: RegExp) {
  return screen.findByRole("link", { name });
}

beforeEach(() => {
  customersList.mockReset();
  calendarGetCalendar.mockReset();
  calendarGetCalendar.mockResolvedValue({
    capabilities: { manageCustomers: true },
    timezone: "America/Sao_Paulo",
  });
  setViewport(390);
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("responsável: agenda para", () => {
  test.each([
    [
      "1 dependente",
      [{ id: "d1", name: "Pedro Souza" }],
      "agenda para Pedro Souza",
    ],
    [
      "2 dependentes",
      [
        { id: "d1", name: "Pedro Souza" },
        { id: "d2", name: "Lia Souza" },
      ],
      "agenda para Pedro Souza e mais 1",
    ],
    [
      "3 dependentes",
      [
        { id: "d1", name: "Pedro Souza" },
        { id: "d2", name: "Lia Souza" },
        { id: "d3", name: "Davi Souza" },
      ],
      "agenda para Pedro Souza e mais 2",
    ],
    [
      "dependente sem nome",
      [{ id: "d1", name: null }],
      "agenda para cliente sem nome",
    ],
    [
      "primeiro dependente sem nome com outro",
      [
        { id: "d1", name: null },
        { id: "d2", name: "Lia Souza" },
      ],
      "agenda para cliente sem nome e mais 1",
    ],
  ])("%s", async (_label, dependents, text) => {
    customersList.mockResolvedValue(
      listResult([
        { dependents, id: "m1", name: "Maria Souza", phone: "5511990012200" },
      ]),
    );
    const { container } = renderList();

    const link = await rowOf(/^Maria Souza/);
    expect(within(link).getByText(text)).toBeVisible();
    expect(within(link).queryByText(/\+55/)).not.toBeInTheDocument();
    expect(link).toHaveAccessibleName(expect.stringContaining(text));
    await expectNoA11yViolations(container);
  });

  test("responsável e dependente ao mesmo tempo mostra a de responsável", async () => {
    customersList.mockResolvedValue(
      listResult([
        {
          dependents: [{ id: "d1", name: "Pedro Souza" }],
          guardian: { id: "g1", name: "Ana Paula" },
          id: "m1",
          name: "Maria Souza",
          phone: null,
        },
      ]),
    );
    renderList();

    const link = await rowOf(/^Maria Souza/);
    expect(within(link).getByText("agenda para Pedro Souza")).toBeVisible();
    expect(within(link).queryByText(/agenda por esta pessoa/)).toBeNull();
  });
});

describe("dependente: agenda por esta pessoa", () => {
  test("sem telefone próprio, mostra o responsável no lugar de Telefone não informado", async () => {
    customersList.mockResolvedValue(
      listResult([
        {
          guardian: { id: "g1", name: "Maria Souza" },
          id: "p1",
          name: "Pedro Souza",
          phone: null,
        },
      ]),
    );
    const { container } = renderList();

    const link = await rowOf(/^Pedro Souza/);
    expect(
      within(link).getByText("Maria Souza agenda por esta pessoa"),
    ).toBeVisible();
    expect(within(link).queryByText("Telefone não informado")).toBeNull();
    expect(link).toHaveAccessibleName(
      expect.stringContaining("Maria Souza agenda por esta pessoa"),
    );
    await expectNoA11yViolations(container);
  });

  test("telefone só com espaços conta como sem telefone", async () => {
    customersList.mockResolvedValue(
      listResult([
        {
          guardian: { id: "g1", name: "Maria Souza" },
          id: "p1",
          name: "Pedro Souza",
          phone: "   ",
        },
      ]),
    );
    renderList();

    const link = await rowOf(/^Pedro Souza/);
    expect(
      within(link).getByText("Maria Souza agenda por esta pessoa"),
    ).toBeVisible();
  });

  test("responsável sem nome", async () => {
    customersList.mockResolvedValue(
      listResult([
        {
          guardian: { id: "g1", name: null },
          id: "p1",
          name: "Pedro Souza",
          phone: null,
        },
      ]),
    );
    renderList();

    const link = await rowOf(/^Pedro Souza/);
    expect(
      within(link).getByText("Responsável sem nome agenda por esta pessoa"),
    ).toBeVisible();
  });

  test("telefone próprio com responsável mostra o telefone", async () => {
    customersList.mockResolvedValue(
      listResult([
        {
          guardian: { id: "g1", name: "Maria Souza" },
          id: "p1",
          name: "Pedro Souza",
          phone: "5511990012200",
        },
      ]),
    );
    renderList();

    const link = await rowOf(/^Pedro Souza/);
    expect(within(link).getByText(/\+55 11 99001-2200/)).toBeVisible();
    expect(within(link).queryByText(/agenda por esta pessoa/)).toBeNull();
  });
});

describe("sem os campos a linha fica como hoje", () => {
  test("telefone, Telefone não informado e a linha sem nome", async () => {
    customersList.mockResolvedValue(
      listResult([
        { id: "a1", name: "Ana Paula", phone: "5511990012200" },
        { id: "b1", name: "Bia Castro", phone: null },
        {
          dependents: [],
          guardian: null,
          id: "c1",
          name: "Carla Nunes",
          phone: null,
        },
        { id: "z1", name: null, phone: "5511976543210" },
      ]),
    );
    renderList();

    expect(
      within(await rowOf(/Ana Paula/)).getByText(/\+55 11 99001-2200/),
    ).toBeVisible();
    expect(
      within(await rowOf(/Bia Castro/)).getByText("Telefone não informado"),
    ).toBeVisible();
    expect(
      within(await rowOf(/Carla Nunes/)).getByText("Telefone não informado"),
    ).toBeVisible();
    const unnamed = await rowOf(/\+55 11 97654-3210/);
    expect(
      within(unnamed).getByText("Cadastro sem nome · importado"),
    ).toBeVisible();
    expect(within(unnamed).getByText("Nomear")).toBeVisible();
    expect(screen.queryByText(/agenda (para|por)/)).toBeNull();
  });
});

describe("busca (CL3)", () => {
  const ITEMS: Row[] = [
    {
      dependents: [{ id: "p1", name: "Pedro Souza" }],
      id: "m1",
      name: "Maria Souza",
      phone: "5511990012200",
    },
    {
      guardian: { id: "m1", name: "Maria Souza" },
      id: "p1",
      name: "Pedro Souza",
      phone: null,
    },
    { id: "b1", name: "Beatriz Lima", phone: "5511955554321" },
  ];

  test("destaque só no nome e a segunda linha aparece", async () => {
    customersList.mockResolvedValue(listResult(ITEMS));
    renderList();
    const user = userEvent.setup();
    await user.type(await screen.findByRole("searchbox"), "mar");

    const link = await rowOf(/^Maria Souza/);
    expect(within(link).getByText("agenda para Pedro Souza")).toBeVisible();
    expect(link.querySelectorAll("mark")).toHaveLength(1);
    expect(link.querySelector(".customer-panel-name mark")).not.toBeNull();
    expect(link.querySelector(".customer-panel-relation mark")).toBeNull();
  });

  test("buscar o nome do dependente não acha o responsável", async () => {
    customersList.mockResolvedValue(listResult(ITEMS));
    renderList();
    const user = userEvent.setup();
    await user.type(await screen.findByRole("searchbox"), "pedro");

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /^Maria Souza/ })).toBeNull(),
    );
    const link = await rowOf(/^Pedro Souza/);
    expect(
      within(link).getByText("Maria Souza agenda por esta pessoa"),
    ).toBeVisible();
  });
});

describe("CustomerListPanel", () => {
  test("mostra a mesma segunda linha", async () => {
    setViewport(1366);
    customersList.mockResolvedValue(
      listResult([
        {
          guardian: { id: "m1", name: "Maria Souza" },
          id: "p1",
          name: "Pedro Souza",
          phone: null,
        },
        {
          dependents: [
            { id: "p1", name: "Pedro Souza" },
            { id: "p2", name: "Lia Souza" },
          ],
          id: "m1",
          name: "Maria Souza",
          phone: "5511990012200",
        },
      ]),
    );
    render(<CustomerListPanel openId="p1" />);

    const pedro = await rowOf(/^Pedro Souza/);
    expect(
      within(pedro).getByText("Maria Souza agenda por esta pessoa"),
    ).toBeVisible();
    const maria = await rowOf(/agenda para Pedro Souza e mais 1/);
    expect(within(maria).getByText("Maria Souza")).toBeVisible();
  });
});
