// @vitest-environment jsdom
/**
 * Goal140 (Mais-WhatsApp:W3) — "A IA nunca responde" em rota própria.
 *
 * O que esta suíte prova, pelo que a usuária encontra em
 * `/configuracoes/whatsapp/contatos-ignorados`:
 *
 * 1. A lista: uma leitura `limit 100, offset 0`, na ordem da resposta;
 *    "Carregar mais" lê a página seguinte e some quando tudo foi lido;
 *    carregando, vazio, sem canal e erro, cada um com o seu papel; um só
 *    cabeçalho de página e o voltar para o WhatsApp.
 * 2. A legenda por origem, a data no fuso do negócio e o avatar.
 * 3. "Remover": `ignoreByPhone(externalContactId, false)` sem `origin`, uma
 *    vez; a linha só sai depois da resposta; a falha mantém a linha.
 * 4. A busca: nada lido com o campo vazio; `ignored: false` e `search` depois
 *    de 250 ms; "Ignorar" grava `CONVERSATION`; "Adicionar" só com 10 dígitos
 *    ou mais e grava `SETTINGS`; depois do sucesso o campo esvazia e a lista
 *    relê do começo.
 * 5. A linha do W1: um link para a rota, com a segunda linha dos nomes
 *    (`limit 2`, " e mais N"), ausente sem lista, em leitura ou com falha, e
 *    nenhuma folha de contatos ignorados.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo (`visual:compare`).
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type Conversation,
  type IgnoredContactEntry,
  type SettingsState,
} from "@/data";
import { IgnoredContactsScreen } from "@/features/settings/IgnoredContactsScreen";
import { WhatsAppConnectedSettings } from "@/features/settings/WhatsAppConnectedSettings";
import type { WhatsAppConnectedContext } from "@/features/whatsapp/WhatsAppConnectionPanel";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const listIgnoredContacts = vi.fn();
const listConversations = vi.fn();
const ignoreByPhone = vi.fn();
const setIgnored = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      ignoreByPhone,
      list: listConversations,
      listIgnoredContacts,
      setIgnored,
    },
  }),
}));

function settingsFor(timezone: string | null): SettingsState {
  return {
    business: timezone ? { timezone } : null,
  } as unknown as SettingsState;
}

function entry(
  overrides: Partial<IgnoredContactEntry> = {},
): IgnoredContactEntry {
  return {
    contactId: "contact-1",
    displayName: "Mãe",
    externalContactId: "5511999001122",
    ignoredAt: "2026-09-10T15:00:00.000Z",
    origin: "ONBOARDING",
    ...overrides,
  };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerId: null,
    customerName: "Maria",
    externalContactId: "5511988880000",
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

const MAE = entry();
const DUDU = entry({
  contactId: "contact-2",
  displayName: "Dudu ❤️",
  externalContactId: "5511988776655",
});
const RENATA = entry({
  contactId: "contact-3",
  displayName: "Renata",
  externalContactId: "5511977770000",
  ignoredAt: "2026-09-18T15:00:00.000Z",
  origin: "CONVERSATION",
});

function list(items: IgnoredContactEntry[], total = items.length) {
  return { items, total };
}

function renderScreen(timezone: string | null = "America/Sao_Paulo") {
  return render(<IgnoredContactsScreen settings={settingsFor(timezone)} />);
}

async function rowOf(name: string): Promise<HTMLElement> {
  const row = (await screen.findByText(name)).closest("li");
  if (!row) throw new Error(`sem linha para ${name}`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  listIgnoredContacts.mockResolvedValue(list([MAE, DUDU, RENATA]));
  listConversations.mockResolvedValue([]);
  ignoreByPhone.mockResolvedValue({
    contactId: "contact-9",
    externalContactId: "5511966665555",
    ignored: true,
    ignoredAt: null,
  });
  setIgnored.mockResolvedValue(conversation({ ignored: true }));
});

afterEach(() => {
  cleanup();
});

describe("Goal140 a lista", () => {
  test("lê uma vez com limit 100 e offset 0, na ordem da resposta", async () => {
    renderScreen();

    await screen.findByText("Mãe");
    expect(listIgnoredContacts).toHaveBeenCalledTimes(1);
    expect(listIgnoredContacts.mock.calls[0]?.[0]).toEqual({
      limit: 100,
      offset: 0,
    });
    const names = screen
      .getAllByRole("button", { name: /^Remover / })
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Remover Mãe", "Remover Dudu ❤️", "Remover Renata"]);
    expect(
      screen.getByText(
        "Remover não apaga nada: a IA só volta a poder responder esse contato em uma nova conversa comercial.",
      ),
    ).toBeVisible();
  });

  test("um só cabeçalho de página e o voltar para o WhatsApp", async () => {
    renderScreen();

    await screen.findByText("Mãe");
    const headings = screen.getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("A IA nunca responde");
    expect(
      screen.getByRole("link", { name: "Voltar para WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
  });

  test("sem violação de acessibilidade com a lista, a busca e o aviso", async () => {
    const { container } = renderScreen();

    await screen.findByText("Mãe");
    await expectNoA11yViolations(container);
  });

  test("carregando: aria-busy e o texto; some com a resposta", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    listIgnoredContacts.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderScreen();

    const text = screen.getByText("Carregando contatos…");
    expect(text.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    resolve(list([MAE]));
    await screen.findByText("Mãe");
    expect(screen.queryByText("Carregando contatos…")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-busy]")).toBeNull();
  });

  test("Carregar mais lê o offset seguinte e some quando tudo foi lido", async () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      entry({
        contactId: `contact-${index}`,
        displayName: `Pessoa ${index}`,
        externalContactId: `55119${String(index).padStart(8, "0")}`,
      }),
    );
    const second = entry({
      contactId: "contact-100",
      displayName: "Pessoa 100",
      externalContactId: "5511900000100",
    });
    listIgnoredContacts
      .mockResolvedValueOnce(list(first, 101))
      .mockResolvedValueOnce(list([second], 101));
    renderScreen();

    await userEvent.click(
      await screen.findByRole("button", { name: "Carregar mais" }),
    );

    await screen.findByText("Pessoa 100");
    expect(listIgnoredContacts).toHaveBeenCalledTimes(2);
    expect(listIgnoredContacts.mock.calls[1]?.[0]).toEqual({
      limit: 100,
      offset: 100,
    });
    expect(
      screen.queryByRole("button", { name: "Carregar mais" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remover / })).toHaveLength(
      101,
    );
  });

  test("sem Carregar mais quando o total é o número de itens", async () => {
    renderScreen();

    await screen.findByText("Mãe");
    expect(
      screen.queryByRole("button", { name: "Carregar mais" }),
    ).not.toBeInTheDocument();
  });

  test("vazia: o texto e nenhuma nota", async () => {
    listIgnoredContacts.mockResolvedValue(list([]));
    renderScreen();

    expect(await screen.findByText("Nenhum contato nesta lista.")).toBeVisible();
    expect(screen.queryByText(/Remover não apaga nada/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", {
        name: "Buscar nas suas conversas ou digitar um número",
      }),
    ).toBeVisible();
  });

  test("sem canal (upstreamCode): convite e link, sem busca nem lista", async () => {
    listIgnoredContacts.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "CHANNEL_CONNECTION_NOT_FOUND" },
        message: "sem canal",
        requestId: "req-1",
        status: 404,
      }),
    );
    renderScreen();

    expect(
      await screen.findByText(
        "Conecte o WhatsApp para escolher quem a IA nunca responde.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Conectar WhatsApp" })).toHaveAttribute(
      "href",
      "/configuracoes/whatsapp",
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Estes contatos continuam aparecendo/),
    ).toBeVisible();
  });

  test("outra falha: alerta e Tentar de novo relê", async () => {
    listIgnoredContacts.mockRejectedValueOnce(new Error("falhou"));
    renderScreen();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Não foi possível carregar a lista agora.");
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await screen.findByText("Mãe");
    expect(listIgnoredContacts).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Goal140 a legenda e o avatar", () => {
  async function captionOf(
    contact: IgnoredContactEntry,
    timezone = "America/Sao_Paulo",
  ) {
    listIgnoredContacts.mockResolvedValue(list([contact]));
    renderScreen(timezone);
    return rowOf(contact.displayName ?? "");
  }

  test("ONBOARDING: telefone e desde o início", async () => {
    const row = await captionOf(MAE);
    expect(within(row).getByText("+55 11 99900-1122 · desde o início")).toBeVisible();
  });

  test("CONVERSATION: marcada na conversa e a data, sem telefone", async () => {
    const row = await captionOf(RENATA);
    expect(within(row).getByText("marcada na conversa · 18/09")).toBeVisible();
    expect(row).not.toHaveTextContent("+55");
  });

  test("CONVERSATION sem ignoredAt: sem data", async () => {
    const row = await captionOf(entry({ ignoredAt: null, origin: "CONVERSATION" }));
    expect(within(row).getByText("marcada na conversa")).toBeVisible();
  });

  test.each([["SETTINGS" as const], [null]])(
    "origem %s: telefone e desde a data",
    async (origin) => {
      const row = await captionOf(entry({ origin }));
      expect(within(row).getByText("+55 11 99900-1122 · desde 10/09")).toBeVisible();
    },
  );

  test("SETTINGS sem ignoredAt: só o telefone", async () => {
    const row = await captionOf(entry({ ignoredAt: null, origin: "SETTINGS" }));
    expect(within(row).getByText("+55 11 99900-1122")).toBeVisible();
  });

  test("sem displayName o nome é o telefone e a legenda não o repete", async () => {
    listIgnoredContacts.mockResolvedValue(
      list([
        entry({ contactId: "a", displayName: null, origin: "ONBOARDING" }),
        entry({
          contactId: "b",
          displayName: null,
          externalContactId: "5511988776655",
          origin: "SETTINGS",
        }),
        entry({
          contactId: "c",
          displayName: null,
          externalContactId: "5511977770000",
          ignoredAt: null,
          origin: "SETTINGS",
        }),
      ]),
    );
    renderScreen();

    const first = await rowOf("+55 11 99900-1122");
    expect(first).toHaveTextContent("+55 11 99900-1122desde o início");
    const second = await rowOf("+55 11 98877-6655");
    expect(second).toHaveTextContent("+55 11 98877-6655desde 10/09");
    const third = await rowOf("+55 11 97777-0000");
    expect(third).toHaveTextContent(/^\+55 11 97777-0000Remover$/);
  });

  test("a data segue o fuso do negócio, não o UTC", async () => {
    const instant = entry({
      ignoredAt: "2026-09-18T02:30:00.000Z",
      origin: "CONVERSATION",
    });
    const saoPaulo = await captionOf(instant, "America/Sao_Paulo");
    expect(within(saoPaulo).getByText("marcada na conversa · 17/09")).toBeVisible();
    cleanup();
    const auckland = await captionOf(instant, "Pacific/Auckland");
    expect(within(auckland).getByText("marcada na conversa · 18/09")).toBeVisible();
  });

  test("sem fuso lido, usa o de São Paulo", async () => {
    listIgnoredContacts.mockResolvedValue(
      list([entry({ ignoredAt: "2026-09-18T02:30:00.000Z", origin: "SETTINGS" })]),
    );
    renderScreen(null);

    expect(await screen.findByText(/desde 17\/09/)).toBeVisible();
  });

  test("avatar: a inicial do nome; sem nome, o ícone de pessoa", async () => {
    listIgnoredContacts.mockResolvedValue(
      list([
        entry({ contactId: "a", displayName: "dudu ❤️" }),
        entry({ contactId: "b", displayName: "❤️" }),
        entry({ contactId: "c", displayName: null }),
      ]),
    );
    renderScreen();

    const dudu = await rowOf("dudu ❤️");
    expect(dudu.querySelector(".wa-ignored-avatar")).toHaveTextContent("D");
    const heart = await rowOf("❤️");
    expect(heart.querySelector(".wa-ignored-avatar .icon")).not.toBeNull();
    const phone = await rowOf("+55 11 99900-1122");
    expect(phone.querySelector(".wa-ignored-avatar .icon")).not.toBeNull();
  });
});

describe("Goal140 Remover", () => {
  test("chama ignoreByPhone(externalContactId, false) sem origin, uma vez, e a linha sai depois da resposta", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    ignoreByPhone.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderScreen();

    await userEvent.click(
      await screen.findByRole("button", { name: "Remover Dudu ❤️" }),
    );

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith("5511988776655", false);
    expect(ignoreByPhone.mock.calls[0]).toHaveLength(2);
    // Antes da resposta: a linha continua, o botão diz o que faz e nada mais
    // pode ser removido ao mesmo tempo.
    expect(screen.getByText("Dudu ❤️")).toBeVisible();
    const pending = screen.getByRole("button", { name: "Remover Dudu ❤️" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveTextContent("Removendo...");
    expect(screen.getByRole("button", { name: "Remover Mãe" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Remover Mãe" }));
    expect(ignoreByPhone).toHaveBeenCalledTimes(1);

    resolve({
      contactId: "contact-2",
      externalContactId: "5511988776655",
      ignored: false,
      ignoredAt: null,
    });
    await waitFor(() =>
      expect(screen.queryByText("Dudu ❤️")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Dudu ❤️ saiu da lista.");
    expect(screen.getByText("Mãe")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remover Mãe" })).toBeEnabled();
  });

  test("a falha mantém a linha e mostra o alerta", async () => {
    ignoreByPhone.mockRejectedValue(new Error("falhou"));
    renderScreen();

    await userEvent.click(
      await screen.findByRole("button", { name: "Remover Mãe" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível remover agora. Tente novamente.",
    );
    expect(screen.getByText("Mãe")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remover Mãe" })).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  test("a remoção da última linha leva ao vazio, sem a nota", async () => {
    listIgnoredContacts.mockResolvedValue(list([MAE]));
    renderScreen();

    await userEvent.click(
      await screen.findByRole("button", { name: "Remover Mãe" }),
    );

    expect(await screen.findByText("Nenhum contato nesta lista.")).toBeVisible();
    expect(screen.queryByText(/Remover não apaga nada/)).not.toBeInTheDocument();
  });
});

describe("Goal140 a busca", () => {
  async function typeSearch(text: string) {
    await userEvent.type(
      await screen.findByRole("searchbox", {
        name: "Buscar nas suas conversas ou digitar um número",
      }),
      text,
    );
  }

  test("campo vazio não lê conversa nenhuma", async () => {
    renderScreen();

    await screen.findByText("Mãe");
    await new Promise((done) => setTimeout(done, 400));
    expect(listConversations).not.toHaveBeenCalled();
  });

  test("lê depois de 250 ms com ignored false e search, uma vez", async () => {
    listConversations.mockResolvedValue([conversation()]);
    renderScreen();

    await typeSearch("mar");
    expect(listConversations).not.toHaveBeenCalled();

    await screen.findByText("Maria");
    expect(listConversations).toHaveBeenCalledTimes(1);
    expect(listConversations.mock.calls[0]?.[0]).toEqual({
      ignored: false,
      limit: 20,
      search: "mar",
    });
  });

  test("a leitura anterior é cancelada quando o texto muda", async () => {
    let first: AbortSignal | undefined;
    listConversations
      .mockImplementationOnce((_query: unknown, signal?: AbortSignal) => {
        first = signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValue([conversation({ customerName: "Marina" })]);
    renderScreen();

    await typeSearch("mar");
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    expect(first?.aborted).toBe(false);
    await typeSearch("i");

    await screen.findByText("Marina");
    expect(first?.aborted).toBe(true);
    expect(listConversations.mock.calls[1]?.[0]).toMatchObject({ search: "mari" });
  });

  test("sem resultado: Nenhuma conversa encontrada, sem Adicionar", async () => {
    renderScreen();

    await typeSearch("zzz");

    expect(await screen.findByText("Nenhuma conversa encontrada.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Adicionar" }),
    ).not.toBeInTheDocument();
  });

  test("Ignorar grava CONVERSATION, esvazia o campo e relê a lista do começo", async () => {
    listConversations.mockResolvedValue([conversation()]);
    renderScreen();
    await screen.findByText("Mãe");
    await typeSearch("mar");

    await userEvent.click(
      await screen.findByRole("button", { name: "Ignorar Maria" }),
    );

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true, "CONVERSATION");
    await waitFor(() => expect(listIgnoredContacts).toHaveBeenCalledTimes(2));
    expect(listIgnoredContacts.mock.calls[1]?.[0]).toEqual({
      limit: 100,
      offset: 0,
    });
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.queryByText("Maria")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Maria entrou na lista.");
  });

  test("Ignorar com falha mantém o campo e mostra o alerta", async () => {
    listConversations.mockResolvedValue([conversation()]);
    setIgnored.mockRejectedValue(new Error("falhou"));
    renderScreen();
    await screen.findByText("Mãe");
    await typeSearch("mar");

    await userEvent.click(
      await screen.findByRole("button", { name: "Ignorar Maria" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar este contato. Tente novamente.",
    );
    expect(screen.getByRole("searchbox")).toHaveValue("mar");
    expect(listIgnoredContacts).toHaveBeenCalledTimes(1);
  });

  test("Adicionar só aparece com 10 dígitos ou mais", async () => {
    renderScreen();
    await screen.findByText("Mãe");

    await typeSearch("11 9999-000");
    await screen.findByText("Nenhuma conversa encontrada.");
    expect(
      screen.queryByRole("button", { name: "Adicionar" }),
    ).not.toBeInTheDocument();

    await typeSearch("0");
    expect(
      await screen.findByRole("button", { name: "Adicionar" }),
    ).toBeVisible();
    expect(screen.getByText("Adicionar 11 9999-0000")).toBeVisible();
  });

  test("Adicionar grava SETTINGS com o texto, esvazia o campo e relê a lista", async () => {
    renderScreen();
    await screen.findByText("Mãe");
    await typeSearch("+55 11 96666-5555");

    await userEvent.click(
      await screen.findByRole("button", { name: "Adicionar" }),
    );

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith(
      "+55 11 96666-5555",
      true,
      "SETTINGS",
    );
    await waitFor(() => expect(listIgnoredContacts).toHaveBeenCalledTimes(2));
    expect(listIgnoredContacts.mock.calls[1]?.[0]).toEqual({
      limit: 100,
      offset: 0,
    });
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Adicionar" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "+55 11 96666-5555 entrou na lista.",
    );
  });

  test("Adicionar com VALIDATION_ERROR pede o formato", async () => {
    ignoreByPhone.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        message: "inválido",
        requestId: "req-2",
        status: 400,
      }),
    );
    renderScreen();
    await screen.findByText("Mãe");
    await typeSearch("11 96666-5555");

    await userEvent.click(
      await screen.findByRole("button", { name: "Adicionar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use o formato +55 11 99999-0000, com DDD.",
    );
    expect(screen.getByRole("searchbox")).toHaveValue("11 96666-5555");
  });

  test("Adicionar com outra falha mostra a mensagem geral", async () => {
    ignoreByPhone.mockRejectedValue(new Error("falhou"));
    renderScreen();
    await screen.findByText("Mãe");
    await typeSearch("11 96666-5555");

    await userEvent.click(
      await screen.findByRole("button", { name: "Adicionar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar este número. Tente novamente.",
    );
  });

  test("com um pedido em curso, os botões do bloco ficam desabilitados", async () => {
    listConversations.mockResolvedValue([conversation()]);
    ignoreByPhone.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    await screen.findByText("Mãe");
    await typeSearch("11 96666-5555");
    await screen.findByText("Maria");

    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(screen.getByRole("button", { name: "Adicionando..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ignorar Maria" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover Mãe" })).toBeDisabled();
  });
});

describe("Goal140 a linha do W1", () => {
  const ROUTE = "/configuracoes/whatsapp/contatos-ignorados";

  function renderRow() {
    const context = {
      busy: false,
      connection: {
        connectedAt: "2026-09-18T15:00:00.000Z",
        id: "wa-1",
        phoneNumber: "5511987654321",
        status: "CONNECTED",
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
      disconnect: vi.fn(),
      error: null,
      openDisconnectDialog: vi.fn(),
    } as unknown as WhatsAppConnectedContext;
    const settings = {
      ai: { enabled: true, tone: "BALANCED" },
      business: { name: "Studio Marina", timezone: "America/Sao_Paulo" },
    } as unknown as SettingsState;
    return render(
      <WhatsAppConnectedSettings context={context} settings={settings} />,
    );
  }

  function row(): HTMLElement {
    return screen.getByRole("link", {
      name: /^Contatos que a IA nunca responde/,
    });
  }

  test("é um link para a rota nova e não abre folha nenhuma", async () => {
    listIgnoredContacts.mockResolvedValue(list([MAE, DUDU], 2));
    renderRow();
    await screen.findByText("Mãe, Dudu ❤️");

    expect(row()).toHaveAttribute("href", ROUTE);
    expect(
      screen.queryByRole("button", { name: /^Contatos que a IA nunca responde/ }),
    ).toBeNull();
    await userEvent.click(row());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a segunda linha traz os dois nomes separados por vírgula, com uma leitura de limit 2", async () => {
    listIgnoredContacts.mockResolvedValue(list([MAE, DUDU], 2));
    renderRow();

    expect(await screen.findByText("Mãe, Dudu ❤️")).toBeVisible();
    expect(row()).toHaveTextContent("Contatos que a IA nunca responde");
    expect(row()).toHaveTextContent("Mãe, Dudu ❤️");
    expect(screen.queryByText(/ e mais /)).toBeNull();
    expect(listIgnoredContacts).toHaveBeenCalledTimes(1);
    expect(listIgnoredContacts.mock.calls[0]?.[0]).toEqual({ limit: 2 });
  });

  test("com total maior que os itens, termina com ' e mais N'", async () => {
    listIgnoredContacts.mockResolvedValue(list([MAE, DUDU], 5));
    renderRow();

    expect(await screen.findByText("Mãe, Dudu ❤️ e mais 3")).toBeVisible();
  });

  test("com um só item e total maior, mostra o nome e ' e mais N'", async () => {
    listIgnoredContacts.mockResolvedValue(list([MAE], 2));
    renderRow();

    expect(await screen.findByText("Mãe e mais 1")).toBeVisible();
  });

  test("sem displayName, o nome é o telefone formatado", async () => {
    listIgnoredContacts.mockResolvedValue(
      list([entry({ displayName: null }), DUDU], 2),
    );
    renderRow();

    expect(
      await screen.findByText("+55 11 99900-1122, Dudu ❤️"),
    ).toBeVisible();
  });

  test("lista vazia: sem segunda linha, e a linha continua levando à rota", async () => {
    listIgnoredContacts.mockResolvedValue(list([]));
    renderRow();
    await waitFor(() => expect(listIgnoredContacts).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(row()).toHaveAttribute("href", ROUTE);
    expect(row().querySelector(".wa-row-detail")).toBeNull();
  });

  test("leitura em curso: sem segunda linha, e a linha leva à rota", () => {
    listIgnoredContacts.mockReturnValue(new Promise(() => undefined));
    renderRow();

    expect(row()).toHaveAttribute("href", ROUTE);
    expect(row().querySelector(".wa-row-detail")).toBeNull();
  });

  test("falha da leitura: sem segunda linha, e a linha leva à rota", async () => {
    listIgnoredContacts.mockRejectedValue(new Error("falhou"));
    renderRow();
    await waitFor(() => expect(listIgnoredContacts).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(row()).toHaveAttribute("href", ROUTE);
    expect(row().querySelector(".wa-row-detail")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a leitura é cancelada quando a tela desmonta", async () => {
    listIgnoredContacts.mockReturnValue(new Promise(() => undefined));
    const view = renderRow();
    const signal = listIgnoredContacts.mock.calls[0]?.[1] as AbortSignal;

    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
