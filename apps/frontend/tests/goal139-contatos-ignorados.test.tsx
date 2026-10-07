// @vitest-environment jsdom
/**
 * Goal139 — os consumidores do frontend mandam a origem de cada marcação e o
 * serviço de conversas lê a lista dos contatos ignorados.
 *
 * O que esta suíte prova:
 *
 * 1. `listIgnoredContacts` monta a consulta (`limit`, `offset`, só o que vem) e
 *    valida a resposta pelo schema da rota; `setIgnored` e `ignoreByPhone`
 *    só levam `origin` no corpo quando informado.
 * 2. `OnboardingIgnoredContacts` manda `ONBOARDING` nas duas marcações.
 * 3. `IgnoredContactsPanel` (a folha de Configurações) manda `SETTINGS` no
 *    telefone e `CONVERSATION` na conversa.
 * 4. O chat segue sem `origin`.
 *
 * Nenhum texto, layout ou estado de tela muda: só o argumento das chamadas.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation } from "@/data";
import { BffHttpClient } from "@/data/http/BffHttpClient";
import { BffConversationService } from "@/data/services/BffConversationService";
import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";
import {
  IgnoredContactsPanel,
  OnboardingIgnoredContacts,
} from "@/features/whatsapp/IgnoredContactsPanel";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const listConversations = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();
const setIgnored = vi.fn();
const ignoreByPhone = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { listAppointments: vi.fn().mockResolvedValue([]) },
    customers: { generateSummary: vi.fn(), get: vi.fn() },
    conversations: {
      get: getConversation,
      ignoreByPhone,
      list: listConversations,
      listMessages,
      setIgnored,
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
    },
  }),
}));

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
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

const PHONE_CONTACT = {
  contactId: "contact-1",
  externalContactId: "5511977770000",
  ignored: true,
  ignoredAt: "2026-09-27T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  listConversations.mockResolvedValue([conversationFixture()]);
  setIgnored.mockResolvedValue(conversationFixture({ ignored: true }));
  ignoreByPhone.mockResolvedValue(PHONE_CONTACT);
});

describe("Goal139 serviço de conversas", () => {
  const BASE_URL = "https://bff.example.invalid";

  function serviceWith(data: unknown) {
    const seen: Array<{ body: string; method: string; url: string }> = [];
    const http = new BffHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: async (input, init) => {
        const request = new Request(input, init);
        seen.push({
          body: await request.text(),
          method: request.method,
          url: request.url,
        });
        return new Response(JSON.stringify({ data, requestId: "request-1" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });
    return { seen, service: new BffConversationService(http) };
  }

  const LIST = {
    items: [
      {
        contactId: "contact-1",
        displayName: null,
        externalContactId: "5511977770000",
        ignoredAt: null,
        origin: null,
      },
      {
        contactId: "contact-2",
        displayName: "Maria",
        externalContactId: "5511988880000",
        ignoredAt: "2026-09-27T12:00:00.000Z",
        origin: "SETTINGS",
      },
    ],
    total: 2,
  };

  test("listIgnoredContacts monta a consulta e devolve a resposta validada", async () => {
    const { seen, service } = serviceWith(LIST);

    const result = await service.listIgnoredContacts({ limit: 50, offset: 10 });

    expect(result).toEqual(LIST);
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("GET");
    expect(url.pathname).toBe("/v1/conversations/ignored-contacts");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("10");
  });

  test("listIgnoredContacts sem parâmetros não manda consulta", async () => {
    const { seen, service } = serviceWith(LIST);

    await service.listIgnoredContacts();

    expect(new URL(seen[0].url).search).toBe("");
  });

  test("listIgnoredContacts recusa origem fora do contrato", async () => {
    const { service } = serviceWith({
      items: [{ ...LIST.items[0], origin: "PANEL" }],
      total: 1,
    });

    await expect(service.listIgnoredContacts()).rejects.toThrow();
  });

  test("setIgnored e ignoreByPhone levam origin só quando informado", async () => {
    const withOrigin = serviceWith(conversationFixture());
    await withOrigin.service.setIgnored("conv-1", true, "ONBOARDING");
    expect(JSON.parse(withOrigin.seen[0].body)).toEqual({
      ignored: true,
      origin: "ONBOARDING",
    });

    const withoutOrigin = serviceWith(conversationFixture());
    await withoutOrigin.service.setIgnored("conv-1", true);
    expect(JSON.parse(withoutOrigin.seen[0].body)).toEqual({ ignored: true });

    const phoneWithOrigin = serviceWith(PHONE_CONTACT);
    await phoneWithOrigin.service.ignoreByPhone(
      "+55 11 97777-0000",
      true,
      "SETTINGS",
    );
    expect(JSON.parse(phoneWithOrigin.seen[0].body)).toEqual({
      ignored: true,
      origin: "SETTINGS",
      phone: "+55 11 97777-0000",
    });

    const phoneWithout = serviceWith(PHONE_CONTACT);
    await phoneWithout.service.ignoreByPhone("+55 11 97777-0000", true);
    expect(JSON.parse(phoneWithout.seen[0].body)).toEqual({
      ignored: true,
      phone: "+55 11 97777-0000",
    });
  });
});

describe("Goal139 onboarding", () => {
  test("marcar uma conversa manda origin ONBOARDING", async () => {
    const user = userEvent.setup();
    render(<OnboardingIgnoredContacts />);

    await user.click(await screen.findByRole("checkbox", { name: "Maria" }));

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true, "ONBOARDING");
  });

  test("marcar por telefone manda origin ONBOARDING", async () => {
    const user = userEvent.setup();
    render(<OnboardingIgnoredContacts />);

    await user.click(
      await screen.findByRole("button", { name: "Adicionar por telefone" }),
    );
    await user.type(
      screen.getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith(
      "+55 11 97777-0000",
      true,
      "ONBOARDING",
    );
  });
});

describe("Goal139 folha de Configurações", () => {
  test("marcar uma conversa manda origin CONVERSATION", async () => {
    const user = userEvent.setup();
    render(<IgnoredContactsPanel />);

    await user.click(await screen.findByRole("button", { name: "Ignorar" }));

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true, "CONVERSATION");
  });

  test("marcar por telefone manda origin SETTINGS", async () => {
    const user = userEvent.setup();
    render(<IgnoredContactsPanel />);

    await user.type(
      screen.getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith(
      "+55 11 97777-0000",
      true,
      "SETTINGS",
    );
  });
});

describe("Goal139 chat", () => {
  test("ignorar pelo chat continua sem origin", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ customerName: "Marina Duarte" }),
    );
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductConversationsScreen conversationId="conv-1" />
      </ShellConfigProvider>,
    );
    await screen.findByLabelText("Histórico da conversa com Marina Duarte");

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(
      screen.getByRole("button", { name: "Ignorar IA para este contato" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Ignorar contato" }),
    );

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true);
  });
});
