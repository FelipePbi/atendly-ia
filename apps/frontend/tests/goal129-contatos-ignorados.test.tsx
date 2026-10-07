// @vitest-environment jsdom
/**
 * Goal129 (WU-02) — os contatos ignorados do onboarding iguais ao quadro 4.5.
 *
 * A tela do onboarding e o corpo da etapa são os reais; só o runtime de
 * serviços é trocado.
 *
 * 1. A lista é lida sem o filtro `ignored`, e a caixa de cada linha reflete o
 *    `ignored` lido; o avatar traz as iniciais (teal com `customerId`); o nome
 *    é o do cliente, ou o telefone sem nome.
 * 2. Tocar a linha grava na hora com `PUT .../ignore` e a caixa só muda depois
 *    da resposta, com o valor contrário; com erro, não muda e mostra o erro.
 * 3. A busca lê de novo com `search`; "Adicionar por telefone" abre o campo e o
 *    número marcado entra como linha marcada.
 * 4. O rodapé soma a escolha ("Continuar", "Continuar · 1 pessoa", "Continuar ·
 *    N pessoas") sem contar duas vezes; "Continuar" vem antes de "Pular por
 *    agora", e os dois vão para o teste real sem gravar nada nem concluir.
 * 5. A folha de Configurações segue com a forma e os pedidos de hoje.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, SettingsState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const listConversations = vi.fn();
const setIgnored = vi.fn();
const ignoreByPhone = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    conversations: {
      ignoreByPhone,
      list: listConversations,
      setIgnored,
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    whatsapp: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      get: getWhatsapp,
      qr: vi.fn(),
      reconnect: vi.fn(),
    },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { WhatsAppSettings } from "@/features/settings/WhatsAppSettings";

const CONNECTED = {
  connectedAt: "2026-09-18T15:00:00.000Z",
  id: "wa-1",
  phoneNumber: "5511987654321",
  status: "CONNECTED" as const,
  updatedAt: "2026-10-01T15:00:00.000Z",
};

function message(body: string) {
  return {
    body,
    createdAt: "2026-10-01T15:00:00.000Z",
    direction: "INBOUND",
    id: `message-${body}`,
    source: "CUSTOMER",
  };
}

function conversation(overrides: Record<string, unknown>) {
  return {
    customerName: null,
    externalContactId: "5511900000000",
    handoffReason: null,
    humanHandoff: false,
    id: "conv",
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-10-01T15:00:00.000Z",
    ...overrides,
  };
}

// As cinco conversas do quadro: "Mãe" e "Dudu ❤️" já ignoradas, "Ana Paula"
// com vínculo com um cliente.
const FRAME_CONVERSATIONS = [
  conversation({
    customerName: "Mãe",
    externalContactId: "5511911110000",
    id: "conv-mae",
    ignored: true,
    lastMessage: message("Filha, liga pra mim quando puder"),
  }),
  conversation({
    customerName: "Dudu ❤️",
    externalContactId: "5511922220000",
    id: "conv-dudu",
    ignored: true,
    lastMessage: message("Chego às 20h"),
  }),
  conversation({
    customerName: "Tia Lú",
    externalContactId: "5511933330000",
    id: "conv-tia",
    ignored: false,
    lastMessage: message("Bom dia, família! ☀️"),
  }),
  conversation({
    customerId: "customer-ana",
    customerName: "Ana Paula",
    externalContactId: "5511944440000",
    id: "conv-ana",
    ignored: false,
    lastMessage: message("Obrigada, Camila! Até sexta"),
  }),
  conversation({
    customerName: null,
    externalContactId: "5511955550000",
    id: "conv-sem-nome",
    ignored: false,
    lastMessage: message("Tem horário sábado?"),
  }),
];

function onboardingState(): OnboardingState {
  return {
    ai: { tone: "PROFESSIONAL" },
    availability: null,
    business: null,
    calendar: { integration: null, source: "AVENLY", timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: { phoneNumber: "5511987654321", status: "CONNECTED" },
  } as unknown as OnboardingState;
}

function settingsFixture(): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [],
      timezone: "America/Sao_Paulo",
    },
    business: null,
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

function deferred<T>() {
  let resolveValue!: (value: T) => void;
  let rejectValue!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveValue = resolvePromise;
    rejectValue = rejectPromise;
  });
  return { promise, reject: rejectValue, resolve: resolveValue };
}

beforeEach(() => {
  vi.clearAllMocks();
  getOnboarding.mockResolvedValue(onboardingState());
  getWhatsapp.mockResolvedValue(CONNECTED);
  listConversations.mockResolvedValue(FRAME_CONVERSATIONS);
  setIgnored.mockResolvedValue({});
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

function renderStep() {
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="contatos-ignorados" />
    </OnboardingRuntimeProvider>,
  );
}

async function openPhoneField(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Adicionar por telefone" }),
  );
  return screen.getByPlaceholderText("+55 11 99999-0000");
}

describe("4.5: a lista do onboarding", () => {
  test("o cabeçalho e o eyebrow são os do quadro", async () => {
    const { container } = renderStep();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Quer impedir que a IA responda algumas pessoas?",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Adicione familiares, amigos ou qualquer contato que você prefira atender sempre pessoalmente.",
      ),
    ).toBeVisible();
    expect(container.querySelector(".onboarding-eyebrow")).toHaveTextContent(
      /^WhatsApp$/,
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar nas suas conversas" }),
    ).toBeVisible();
  });

  test("lê as conversas sem o filtro `ignored` e a caixa de cada linha reflete o `ignored` lido", async () => {
    renderStep();

    expect(await screen.findByRole("checkbox", { name: "Mãe" })).toBeChecked();
    expect(listConversations).toHaveBeenCalledTimes(1);
    expect(listConversations).toHaveBeenCalledWith({ limit: 20 });
    expect(listConversations.mock.calls[0]?.[0]).not.toHaveProperty("ignored");

    expect(screen.getByRole("checkbox", { name: "Dudu ❤️" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tia Lú" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Ana Paula" }),
    ).not.toBeChecked();
  });

  test("a linha traz a última mensagem; sem nome, o telefone; as iniciais ficam no avatar", async () => {
    const { container } = renderStep();

    const mae = await screen.findByRole("checkbox", { name: "Mãe" });
    expect(mae).toHaveAccessibleDescription("Filha, liga pra mim quando puder");
    expect(
      screen.getByRole("checkbox", { name: "+55 11 95555-0000" }),
    ).toHaveAccessibleDescription("Tem horário sábado?");

    const avatars = Array.from(container.querySelectorAll(".ignored-avatar"));
    expect(avatars.map((avatar) => avatar.textContent?.trim())).toEqual([
      "M",
      "D",
      "TL",
      "AP",
      "",
    ]);
    // Teal só com `customerId`.
    expect(
      avatars.map((avatar) => avatar.classList.contains("is-linked")),
    ).toEqual([false, false, false, true, false]);
  });

  test("com a leitura vazia, diz que não há conversas e a linha de telefone continua", async () => {
    listConversations.mockResolvedValue([]);
    renderStep();

    expect(
      await screen.findByText("Nenhuma conversa disponível ainda para escolher."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Adicionar por telefone" }),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("com a leitura falhando, mostra o erro de hoje", async () => {
    listConversations.mockRejectedValue(new Error("falhou"));
    renderStep();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar suas conversas.",
    );
  });
});

describe("4.5: marcar grava na hora e a caixa só muda depois da resposta", () => {
  test("marcar chama o PUT com o valor contrário e a caixa muda só depois da resposta", async () => {
    const put = deferred<unknown>();
    setIgnored.mockReturnValue(put.promise);
    const user = userEvent.setup();
    renderStep();

    const tia = await screen.findByRole("checkbox", { name: "Tia Lú" });
    await user.click(tia);

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-tia", true, "ONBOARDING");
    expect(tia).not.toBeChecked();
    expect(await screen.findByRole("button", { name: "Continuar · 2 pessoas" })).toBeVisible();

    put.resolve({});
    await waitFor(() => expect(tia).toBeChecked());
    expect(await screen.findByRole("button", { name: "Continuar · 3 pessoas" })).toBeVisible();
  });

  test("desmarcar chama o PUT com `false` e a caixa muda só depois da resposta", async () => {
    const put = deferred<unknown>();
    setIgnored.mockReturnValue(put.promise);
    const user = userEvent.setup();
    renderStep();

    const mae = await screen.findByRole("checkbox", { name: "Mãe" });
    await user.click(mae);

    expect(setIgnored).toHaveBeenCalledWith("conv-mae", false, "ONBOARDING");
    expect(mae).toBeChecked();

    put.resolve({});
    await waitFor(() => expect(mae).not.toBeChecked());
    expect(await screen.findByRole("button", { name: "Continuar · 1 pessoa" })).toBeVisible();
  });

  test("com erro no PUT, a caixa não muda e mostra o erro de hoje", async () => {
    setIgnored.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderStep();

    const tia = await screen.findByRole("checkbox", { name: "Tia Lú" });
    await user.click(tia);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar este contato. Tente novamente.",
    );
    expect(tia).not.toBeChecked();
    expect(await screen.findByRole("button", { name: "Continuar · 2 pessoas" })).toBeVisible();
  });

  test("a linha se alcança e se marca pelo teclado", async () => {
    const user = userEvent.setup();
    renderStep();

    const tia = await screen.findByRole("checkbox", { name: "Tia Lú" });
    tia.focus();
    expect(tia).toHaveFocus();
    await user.keyboard(" ");

    expect(setIgnored).toHaveBeenCalledWith("conv-tia", true, "ONBOARDING");
    await waitFor(() => expect(tia).toBeChecked());
  });
});

describe("4.5: busca e telefone", () => {
  test("a busca lê de novo com `search`, sem o filtro `ignored`", async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByRole("checkbox", { name: "Mãe" });

    listConversations.mockResolvedValue([FRAME_CONVERSATIONS[3]]);
    await user.type(
      screen.getByRole("searchbox", { name: "Buscar nas suas conversas" }),
      "ana",
    );

    await waitFor(() =>
      expect(listConversations).toHaveBeenLastCalledWith({
        limit: 20,
        search: "ana",
      }),
    );
    expect(await screen.findByRole("checkbox", { name: "Ana Paula" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Mãe" })).not.toBeInTheDocument();
    // Quem foi lido como ignorado antes da busca continua contando no rodapé.
    expect(await screen.findByRole("button", { name: "Continuar · 2 pessoas" })).toBeVisible();
  });

  test("Enter na busca não avança a etapa", async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByRole("checkbox", { name: "Mãe" });

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar nas suas conversas" }),
      "ana{Enter}",
    );

    expect(push).not.toHaveBeenCalled();
  });

  test("a busca sem resultado diz que nada foi encontrado", async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByRole("checkbox", { name: "Mãe" });

    listConversations.mockResolvedValue([]);
    await user.type(
      screen.getByRole("searchbox", { name: "Buscar nas suas conversas" }),
      "zzz",
    );

    expect(await screen.findByText("Nenhuma conversa encontrada.")).toBeVisible();
  });

  test("'Adicionar por telefone' abre o campo e o número marcado entra como linha marcada", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-1",
      externalContactId: "5511977770000",
      ignored: true,
      ignoredAt: "2026-10-01T12:00:00.000Z",
    });
    const user = userEvent.setup();
    renderStep();
    await screen.findByRole("checkbox", { name: "Mãe" });

    expect(
      screen.queryByPlaceholderText("+55 11 99999-0000"),
    ).not.toBeInTheDocument();
    await user.type(await openPhoneField(user), "+55 11 97777-0000");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith("+55 11 97777-0000", true, "ONBOARDING");
    expect(
      await screen.findByRole("checkbox", { name: "+55 11 97777-0000" }),
    ).toBeChecked();
    expect(await screen.findByRole("button", { name: "Continuar · 3 pessoas" })).toBeVisible();
    expect(setIgnored).not.toHaveBeenCalled();
  });

  test("a falha de marcar o número mostra a mensagem de hoje e nada entra na lista", async () => {
    ignoreByPhone.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderStep();
    await screen.findByRole("checkbox", { name: "Mãe" });

    await user.type(await openPhoneField(user), "+55 11 97777-0000");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar este número. Tente novamente.",
    );
    expect(
      screen.queryByRole("checkbox", { name: "+55 11 97777-0000" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Continuar · 2 pessoas" })).toBeVisible();
  });

  test("um telefone vazio pede o número e não faz pedido", async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByRole("checkbox", { name: "Mãe" });

    await openPhoneField(user);
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe um número de telefone.",
    );
    expect(ignoreByPhone).not.toHaveBeenCalled();
  });
});

describe("4.5: o rodapé", () => {
  test("soma a escolha: Continuar, Continuar · 1 pessoa, Continuar · N pessoas", async () => {
    listConversations.mockResolvedValue([
      FRAME_CONVERSATIONS[2],
      FRAME_CONVERSATIONS[3],
    ]);
    const user = userEvent.setup();
    renderStep();

    await screen.findByRole("checkbox", { name: "Tia Lú" });
    expect(screen.getByRole("button", { name: "Continuar" })).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Tia Lú" }));
    expect(
      await screen.findByRole("button", { name: "Continuar · 1 pessoa" }),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Ana Paula" }));
    expect(
      await screen.findByRole("button", { name: "Continuar · 2 pessoas" }),
    ).toBeVisible();
  });

  test("não conta duas vezes o mesmo contato marcado pela lista e por telefone", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-tia",
      externalContactId: "5511933330000",
      ignored: true,
      ignoredAt: "2026-10-01T12:00:00.000Z",
    });
    listConversations.mockResolvedValue([FRAME_CONVERSATIONS[2]]);
    const user = userEvent.setup();
    renderStep();

    await user.click(await screen.findByRole("checkbox", { name: "Tia Lú" }));
    expect(
      await screen.findByRole("button", { name: "Continuar · 1 pessoa" }),
    ).toBeVisible();

    await user.type(await openPhoneField(user), "+55 11 93333-0000");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(ignoreByPhone).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: "Continuar · 1 pessoa" }),
    ).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  test("o número de uma conversa visível, adicionado por telefone, marca a caixa da linha e conta uma vez", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-tia",
      externalContactId: "5511933330000",
      ignored: true,
      ignoredAt: "2026-10-01T12:00:00.000Z",
    });
    listConversations.mockResolvedValue([FRAME_CONVERSATIONS[2]]);
    const user = userEvent.setup();
    renderStep();

    const tia = await screen.findByRole("checkbox", { name: "Tia Lú" });
    expect(tia).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeVisible();

    await user.type(await openPhoneField(user), "+55 11 93333-0000");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(ignoreByPhone).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tia).toBeChecked());
    expect(
      await screen.findByRole("button", { name: "Continuar · 1 pessoa" }),
    ).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  test("desmarcar a conversa tira o número adicionado por telefone e o rodapé volta a não contar", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-tia",
      externalContactId: "5511933330000",
      ignored: true,
      ignoredAt: "2026-10-01T12:00:00.000Z",
    });
    listConversations.mockResolvedValue([FRAME_CONVERSATIONS[2]]);
    const user = userEvent.setup();
    renderStep();

    const tia = await screen.findByRole("checkbox", { name: "Tia Lú" });
    await user.click(tia);
    await waitFor(() => expect(tia).toBeChecked());

    await user.type(await openPhoneField(user), "+55 11 93333-0000");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(ignoreByPhone).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: "Continuar · 1 pessoa" }),
    ).toBeVisible();

    await user.click(tia);
    expect(setIgnored).toHaveBeenLastCalledWith("conv-tia", false, "ONBOARDING");
    await waitFor(() => expect(tia).not.toBeChecked());
    expect(
      await screen.findByRole("button", { name: "Continuar" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Continuar · / }),
    ).not.toBeInTheDocument();
  });

  test("'Continuar' vem antes de 'Pular por agora' no DOM, e o principal é o primeiro", async () => {
    const { container } = renderStep();
    const next = await screen.findByRole("button", { name: /^Continuar/ });
    const skip = screen.getByRole("button", { name: "Pular por agora" });

    expect(next).toHaveClass("btn-primary");
    expect(next).toHaveAttribute("type", "submit");
    expect(skip).not.toHaveClass("btn-primary");
    expect(
      next.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(next.closest(".onboarding-actions")).toBe(
      skip.closest(".onboarding-actions"),
    );
    expect(container.querySelector(".onboarding-actions")).toHaveClass(
      "is-stacked",
    );
    expect(
      screen.queryByRole("button", { name: "Ir para o teste" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pular esta etapa" }),
    ).not.toBeInTheDocument();
  });

  test("'Continuar' vai para o teste real sem gravar nada nem concluir", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      await screen.findByRole("button", { name: "Continuar · 2 pessoas" }),
    );

    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
    expect(setIgnored).not.toHaveBeenCalled();
    expect(ignoreByPhone).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  test("'Pular por agora' vai para o teste real sem gravar nada nem concluir", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      await screen.findByRole("button", { name: "Pular por agora" }),
    );

    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
    expect(setIgnored).not.toHaveBeenCalled();
    expect(ignoreByPhone).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});

describe("4.5: alvo de toque", () => {
  test("a linha e a caixa têm pelo menos 24 px na folha de estilo", () => {
    const css = readFileSync(
      resolve(__dirname, "../src/shared/styles/avenly.css"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const rule = (selector: string) =>
      css.match(new RegExp(`\\n${selector.replace(".", "\\.")} \\{([^}]*)\\}`))?.[1];

    expect(rule(".ignored-row")).toMatch(/min-height:\s*24px/);
    expect(rule(".ignored-box")).toMatch(/width:\s*24px/);
    expect(rule(".ignored-box")).toMatch(/height:\s*24px/);
  });
});

describe("a folha de Configurações segue com a forma e os pedidos de hoje", () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    render(
      <WhatsAppSettings
        onStatusChange={() => {}}
        settings={settingsFixture()}
      />,
    );
    await user.click(
      await screen.findByRole("button", {
        name: /^Contatos que a IA nunca responde/,
      }),
    );
    return screen.getByRole("dialog", {
      name: "Contatos que a IA nunca responde",
    });
  }

  test("lê só as conversas não ignoradas e mostra as duas seções de sempre", async () => {
    listConversations.mockResolvedValue([
      conversation({
        customerName: "Maria",
        externalContactId: "5511988880000",
        id: "conv-1",
        ignored: false,
      }),
    ]);
    const user = userEvent.setup();
    const sheet = await openSheet(user);

    expect(await within(sheet).findByText("Conversas já existentes")).toBeVisible();
    expect(within(sheet).getByText("Informar um número manualmente")).toBeVisible();
    expect(within(sheet).getByPlaceholderText("+55 11 99999-0000")).toBeVisible();
    expect(listConversations).toHaveBeenCalledWith({ ignored: false, limit: 20 });

    // Sem a busca, sem caixa de marcar e sem o rodapé do onboarding.
    expect(within(sheet).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "Adicionar por telefone" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pular por agora" }),
    ).not.toBeInTheDocument();
  });

  test("'Ignorar' faz o mesmo PUT e vira 'Ignorado'; o telefone usa o mesmo pedido", async () => {
    listConversations.mockResolvedValue([
      conversation({
        customerName: "Maria",
        externalContactId: "5511988880000",
        id: "conv-1",
        ignored: false,
      }),
    ]);
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-1",
      externalContactId: "5511977770000",
      ignored: true,
      ignoredAt: "2026-10-01T12:00:00.000Z",
    });
    const user = userEvent.setup();
    const sheet = await openSheet(user);

    await user.click(await within(sheet).findByRole("button", { name: "Ignorar" }));
    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true, "CONVERSATION");
    expect(
      await within(sheet).findByRole("button", { name: "Ignorado" }),
    ).toBeDisabled();

    await user.type(
      within(sheet).getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(within(sheet).getByRole("button", { name: "Adicionar" }));
    expect(ignoreByPhone).toHaveBeenCalledWith("+55 11 97777-0000", true, "SETTINGS");
    expect(
      await within(sheet).findByText("5511977770000 ignorado"),
    ).toBeVisible();
  });
});
