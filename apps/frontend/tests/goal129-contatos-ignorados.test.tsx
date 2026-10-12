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
 * 5. (Goal140) a folha de Configurações saiu: a lista, "Ignorar" (`CONVERSATION`)
 *    e "Adicionar" (`SETTINGS`) passam a ser provados na tela da rota nova, em
 *    `goal140-contatos-ignorados.test.tsx`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";

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
const listWhatsappContacts = vi.fn();
const listIgnoredContacts = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    conversations: {
      ignoreByPhone,
      list: listConversations,
      listIgnoredContacts,
      setIgnored,
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    whatsapp: {
      connect: vi.fn(),
      contacts: listWhatsappContacts,
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
  listWhatsappContacts.mockResolvedValue({ available: true, items: [] });
  listIgnoredContacts.mockResolvedValue({ items: [], total: 0 });
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
      screen.getByRole("searchbox", { name: "Buscar contatos e conversas" }),
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
      await screen.findByText("Nenhum contato disponível ainda. Adicione pelo telefone."),
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
      screen.getByRole("searchbox", { name: "Buscar contatos e conversas" }),
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
      screen.getByRole("searchbox", { name: "Buscar contatos e conversas" }),
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
      screen.getByRole("searchbox", { name: "Buscar contatos e conversas" }),
      "zzz",
    );

    expect(await screen.findByText("Ninguém encontrado. Confira o nome ou adicione pelo telefone.")).toBeVisible();
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

/**
 * Contatos do WhatsApp do número conectado (validação de 2026-10-11): na
 * primeira vez ainda não há conversas na Avenly, e a pessoa escolhe entre os
 * contatos do aparelho, lidos na hora.
 */
describe("4.5: contatos do WhatsApp", () => {
  const PHONE_CONTACTS = [
    { name: "Mãe", phone: "5511900000001" },
    { name: null, phone: "5511900000002" },
    // Já aparece como conversa: não se repete.
    { name: "Tia Lú", phone: "5511933330000" },
  ];

  test("sem conversas, os contatos do WhatsApp aparecem com nome e telefone", async () => {
    listConversations.mockResolvedValue([]);
    listWhatsappContacts.mockResolvedValue({
      available: true,
      items: PHONE_CONTACTS,
    });
    renderStep();

    expect(await screen.findByText("Contatos do WhatsApp")).toBeVisible();
    const mae = screen.getByRole("checkbox", { name: "Mãe" });
    expect(mae).toHaveAttribute("aria-checked", "false");
    expect(mae).toHaveAccessibleDescription("+55 11 90000-0001");
    expect(screen.getByRole("checkbox", { name: "+55 11 90000-0002" })).toBeVisible();
    expect(
      screen.queryByText("Nenhum contato disponível ainda. Adicione pelo telefone."),
    ).not.toBeInTheDocument();
  });

  test("um contato que já é conversa aparece uma vez só", async () => {
    listWhatsappContacts.mockResolvedValue({
      available: true,
      items: PHONE_CONTACTS,
    });
    renderStep();

    await screen.findByText("Contatos do WhatsApp");
    expect(screen.getAllByRole("checkbox", { name: "Tia Lú" })).toHaveLength(1);
  });

  test("a busca também lê os contatos com `search`", async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByText("Dudu ❤️");

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar contatos e conversas" }),
      "mãe",
    );

    await waitFor(() =>
      expect(listWhatsappContacts).toHaveBeenLastCalledWith({
        limit: 30,
        search: "mãe",
      }),
    );
  });

  test("marcar um contato grava por telefone e a caixa só marca depois da resposta; tocar de novo desmarca", async () => {
    const user = userEvent.setup();
    listConversations.mockResolvedValue([]);
    listWhatsappContacts.mockResolvedValue({
      available: true,
      items: PHONE_CONTACTS,
    });
    const pending = deferred<unknown>();
    ignoreByPhone.mockReturnValueOnce(pending.promise);
    renderStep();

    const mae = await screen.findByRole("checkbox", { name: "Mãe" });
    await user.click(mae);
    expect(ignoreByPhone).toHaveBeenCalledWith("5511900000001", true, "ONBOARDING");
    expect(mae).toHaveAttribute("aria-checked", "false");

    pending.resolve({
      contactId: "contact-mae",
      externalContactId: "5511900000001",
      ignored: true,
      ignoredAt: null,
    });
    await waitFor(() => expect(mae).toHaveAttribute("aria-checked", "true"));

    ignoreByPhone.mockResolvedValueOnce({
      contactId: "contact-mae",
      externalContactId: "5511900000001",
      ignored: false,
      ignoredAt: null,
    });
    await user.click(mae);
    expect(ignoreByPhone).toHaveBeenLastCalledWith(
      "5511900000001",
      false,
      "ONBOARDING",
    );
    await waitFor(() => expect(mae).toHaveAttribute("aria-checked", "false"));
  });

  test("quem já está ignorado aparece marcado", async () => {
    listConversations.mockResolvedValue([]);
    listWhatsappContacts.mockResolvedValue({
      available: true,
      items: PHONE_CONTACTS,
    });
    listIgnoredContacts.mockResolvedValue({
      items: [
        {
          contactId: "contact-mae",
          displayName: null,
          externalContactId: "5511900000001",
          ignoredAt: null,
          origin: "SETTINGS",
        },
      ],
      total: 1,
    });
    renderStep();

    const mae = await screen.findByRole("checkbox", { name: "Mãe" });
    await waitFor(() => expect(mae).toHaveAttribute("aria-checked", "true"));
  });

  test("sem a lista do aparelho, ficam as conversas e o número manual", async () => {
    listWhatsappContacts.mockRejectedValue(new Error("rede"));
    renderStep();

    expect(await screen.findByText("Dudu ❤️")).toBeVisible();
    expect(screen.queryByText("Contatos do WhatsApp")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar por telefone" }),
    ).toBeVisible();
  });
});
