// @vitest-environment jsdom
/**
 * Goal151 (WU-02): S9 — sair do serviço com alterações não salvas. A guarda
 * intercepta o "x"/"‹" e os links de mesma origem só quando há mudança real, e
 * a folha oferece Salvar alterações, Descartar e Continuar editando.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Service } from "@/data";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const serviceCatalogList = vi.fn();
const serviceCatalogCreate = vi.fn();
const serviceCatalogUpdate = vi.fn();
const serviceCatalogGetAiInstruction = vi.fn();
const serviceCatalogUpdateAiInstruction = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: {
      create: serviceCatalogCreate,
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
      update: serviceCatalogUpdate,
      updateAiInstruction: serviceCatalogUpdateAiInstruction,
    },
  }),
}));

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: "SKY",
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

const OTHER = makeService({ id: "s2", name: "Escova", price: 60 });

function renderScreen(
  service: Service,
  scenario: "edit" | "new" = "edit",
  extra: Service[] = [OTHER],
) {
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [service, ...extra],
    source: "AVENLY",
  });
  serviceCatalogUpdate.mockResolvedValue(service);
  return render(
    <ShellConfigProvider>
      <ProductServicesScreen
        scenario={scenario}
        serviceId={scenario === "edit" ? service.id : undefined}
      />
    </ShellConfigProvider>,
  );
}

async function openForm(service = makeService()) {
  const view = renderScreen(service);
  const duration = await screen.findByRole("spinbutton", {
    name: "Duração (minutos)",
  });
  await waitFor(() => expect(duration).toHaveValue(service.durationMinutes));
  return { ...view, duration };
}

async function setDuration(user: ReturnType<typeof userEvent.setup>, value: string) {
  const duration = screen.getByRole("spinbutton", { name: "Duração (minutos)" });
  await user.clear(duration);
  await user.type(duration, value);
}

const closeLink = () =>
  screen.getByRole("link", { name: "Voltar para serviços" });
async function findSheetButton(name: string) {
  const dialog = await screen.findByRole("dialog", {
    name: "Salvar antes de sair?",
  });
  return within(dialog).getByRole("button", { name });
}
const guard = () => screen.queryByRole("dialog", { name: "Salvar antes de sair?" });

beforeEach(() => {
  // Largura de 1024 px: a lista de serviços fica ao lado do formulário.
  window.matchMedia = ((query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => false,
    matches: true,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  }));
  push.mockReset();
  replace.mockReset();
  serviceCatalogList.mockReset();
  serviceCatalogCreate.mockReset();
  serviceCatalogUpdate.mockReset();
  serviceCatalogGetAiInstruction
    .mockReset()
    .mockResolvedValue({ content: "" });
  serviceCatalogUpdateAiInstruction.mockReset().mockResolvedValue(undefined);
});

describe("S9 — quando a guarda abre", () => {
  test("sem mudança o x navega como hoje e nada abre", async () => {
    await openForm();
    const link = closeLink();
    const prevented = !fireEvent.click(link);
    expect(prevented).toBe(false);
    expect(guard()).toBeNull();
    expect(screen.queryByText("alterações não salvas")).toBeNull();
  });

  test("um campo que volta ao valor original deixa de contar", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    expect(screen.getByText("alterações não salvas")).toBeInTheDocument();
    await setDuration(user, "45");
    expect(screen.queryByText("alterações não salvas")).toBeNull();
    fireEvent.click(closeLink());
    expect(guard()).toBeNull();
  });

  test("com mudança o x abre a guarda e não navega", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    expect(screen.getByText("alterações não salvas")).toBeInTheDocument();

    const notPrevented = fireEvent.click(closeLink());
    expect(notPrevented).toBe(false);
    const dialog = await screen.findByRole("dialog", {
      name: "Salvar antes de sair?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent(
      "Você mudou a duração (45 → 50 min) de Corte feminino.",
    );
    expect(dialog).toHaveTextContent(
      "Agendamentos já marcados continuam com os valores combinados na época.",
    );
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test("uma linha da lista ao lado e um link da casca abrem a guarda", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");

    fireEvent.click(screen.getByRole("link", { name: "Editar Escova" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(guard()).toBeNull();

    const shellLink = document.createElement("a");
    shellLink.href = "/inicio";
    shellLink.textContent = "Início";
    document.body.append(shellLink);
    fireEvent.click(shellLink);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    shellLink.remove();
    expect(push).not.toHaveBeenCalled();
  });

  test("Ctrl/Meta-clique, target=_blank, download e outra origem não são interceptados", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");

    const link = screen.getByRole("link", { name: "Editar Escova" });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });
    expect(guard()).toBeNull();

    const outsiders: Array<Record<string, string>> = [
      { href: "/outra", target: "_blank" },
      { download: "arquivo.csv", href: "/arquivo.csv" },
      { href: "https://exemplo.com/fora" },
    ];
    for (const attributes of outsiders) {
      const anchor = document.createElement("a");
      for (const [name, value] of Object.entries(attributes)) {
        anchor.setAttribute(name, value);
      }
      document.body.append(anchor);
      // O jsdom não navega; o que importa é a guarda não ter aberto.
      anchor.addEventListener("click", (event) => event.preventDefault());
      fireEvent.click(anchor);
      expect(guard()).toBeNull();
      anchor.remove();
    }
  });

  test("novo serviço não tem guarda", async () => {
    const user = userEvent.setup();
    renderScreen(makeService(), "new");
    const name = await screen.findByRole("textbox", { name: "Nome" });
    await user.type(name, "Manicure");

    const prevented = !fireEvent.click(closeLink());
    expect(prevented).toBe(false);
    expect(guard()).toBeNull();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("S9 — beforeunload", () => {
  test("liga só com mudança", async () => {
    const user = userEvent.setup();
    await openForm();

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await setDuration(user, "50");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    await setDuration(user, "45");
    const reverted = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(reverted);
    expect(reverted.defaultPrevented).toBe(false);
  });
});

describe("S9 — as três saídas", () => {
  test("foco inicial em Salvar e a folha passa no axe", async () => {
    const user = userEvent.setup();
    const { container } = await openForm();
    await setDuration(user, "50");
    fireEvent.click(closeLink());

    const save = await findSheetButton("Salvar alterações");
    expect(save).toHaveFocus();
    await expectNoA11yViolations(document.body);
    expect(container).toBeTruthy();
  });

  test("Tab fica preso na folha", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    fireEvent.click(closeLink());
    await screen.findByRole("dialog");

    await user.tab();
    expect(screen.getByRole("button", { name: "Descartar" })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Continuar editando" }),
    ).toHaveFocus();
    await user.tab();
    expect(await findSheetButton("Salvar alterações")).toHaveFocus();
    await user.tab({ shift: true });
    expect(
      screen.getByRole("button", { name: "Continuar editando" }),
    ).toHaveFocus();
  });

  test("Continuar editando e Esc fecham, mantêm valores e devolvem o foco", async () => {
    const user = userEvent.setup();
    const { duration } = await openForm();
    await setDuration(user, "50");
    const link = closeLink();
    link.focus();
    fireEvent.click(link);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(guard()).toBeNull();
    expect(duration).toHaveValue(50);
    expect(link).toHaveFocus();

    fireEvent.click(link);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(guard()).toBeNull();
    expect(duration).toHaveValue(50);
    expect(link).toHaveFocus();
    expect(serviceCatalogUpdate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test("Descartar não envia nada e navega pelo destino guardado", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    fireEvent.click(closeLink());
    await user.click(await screen.findByRole("button", { name: "Descartar" }));

    expect(serviceCatalogUpdate).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/servicos");
    expect(push).not.toHaveBeenCalled();
  });

  test("Descartar numa linha da lista empilha o destino", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    fireEvent.click(screen.getByRole("link", { name: "Editar Escova" }));
    await user.click(await screen.findByRole("button", { name: "Descartar" }));

    expect(push).toHaveBeenCalledWith("/servicos/editar?id=s2");
    expect(replace).not.toHaveBeenCalled();
    expect(serviceCatalogUpdate).not.toHaveBeenCalled();
  });

  test("Salvar alterações usa o mesmo envio e vai ao destino guardado", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    fireEvent.click(closeLink());
    await user.click(
      await findSheetButton("Salvar alterações"),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/servicos"));
    expect(serviceCatalogUpdate).toHaveBeenCalledTimes(1);
    expect(serviceCatalogUpdate).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ durationMinutes: 50, name: "Corte feminino" }),
    );
    expect(guard()).toBeNull();
  });

  test("Salvar alterações a partir de uma linha da lista empilha o destino", async () => {
    const user = userEvent.setup();
    await openForm();
    await setDuration(user, "50");
    fireEvent.click(screen.getByRole("link", { name: "Editar Escova" }));
    await user.click(
      await findSheetButton("Salvar alterações"),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/servicos/editar?id=s2"),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  test("erro de rede ao salvar fecha a folha e não navega", async () => {
    const user = userEvent.setup();
    await openForm();
    serviceCatalogUpdate.mockRejectedValue(new Error("falhou"));
    await setDuration(user, "50");
    fireEvent.click(closeLink());
    await user.click(
      await findSheetButton("Salvar alterações"),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(guard()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    // Um novo envio pelo botão do formulário volta ao destino padrão.
    serviceCatalogUpdate.mockResolvedValue(makeService({ durationMinutes: 50 }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/servicos"));
  });

  test("erro de validação ao salvar fecha a folha e não navega", async () => {
    const user = userEvent.setup();
    await openForm();
    const name = screen.getByRole("textbox", { name: "Nome" });
    await user.clear(name);
    await user.type(name, "Corte");
    // Preço obrigatório vazio: o mesmo bloqueio do envio normal.
    const price = screen.getByRole("textbox", { name: "Preço" });
    await user.clear(price);
    fireEvent.click(closeLink());
    await user.click(
      await findSheetButton("Salvar alterações"),
    );

    expect(guard()).toBeNull();
    expect(serviceCatalogUpdate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Informe o valor ou escolha sob consulta / sem preço."),
    ).toBeInTheDocument();
  });
});

describe("S9 — modo de revisão", () => {
  test("o ‹ abre a guarda e Salvar fica desabilitado com a duração vazia", async () => {
    const user = userEvent.setup();
    renderScreen(
      makeService({ durationMinutes: null, needsReview: true, reviewOrigin: "IMPORT" }),
    );
    const name = await screen.findByRole("textbox", { name: "Nome" });
    await waitFor(() => expect(name).toHaveValue("Corte feminino"));
    await user.type(name, " 2");

    fireEvent.click(closeLink());
    const dialog = await screen.findByRole("dialog", {
      name: "Salvar antes de sair?",
    });
    expect(dialog).toBeInTheDocument();
    expect(await findSheetButton("Salvar alterações")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continuar editando" }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(replace).toHaveBeenCalledWith("/servicos");
    expect(serviceCatalogUpdate).not.toHaveBeenCalled();
  });
});

describe("S9 — CSS escopado", () => {
  const css = readFileSync(
    join(process.cwd(), "src/shared/styles/avenly-services.css"),
    "utf8",
  );
  const block = css.slice(css.indexOf("Salvar antes de sair (S9"));

  test("a animação só existe com prefers-reduced-motion: no-preference", () => {
    const [still] = block.split("@media (prefers-reduced-motion: no-preference)");
    expect(still).not.toMatch(/animation\s*:/);
    expect(block).toMatch(/prefers-reduced-motion: no-preference\)\s*\{[^@]*animation/);
  });

  test("todo seletor novo leva o prefixo service-leave ou service-form-screen", () => {
    const selectors = [...block.matchAll(/^([^{}@/*\s][^{}]*)\{/gm)].map((m) =>
      m[1].trim(),
    );
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) {
      expect(selector).toMatch(/service-leave|service-form-screen/);
    }
  });
});
