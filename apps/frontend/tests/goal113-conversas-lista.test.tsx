// @vitest-environment jsdom
/**
 * Goal113 (WU-02) — a lista de conversas igual aos quadros C1, C2 e C3.
 *
 * Prova o que a pessoa encontra na tela e o que o cliente HTTP recebe: o
 * cabeçalho com a lupa, a busca que abre por ela (mesma query, mesmo debounce),
 * a lente Ignorados só no modo de busca, as abas sublinhadas com o contador de
 * atenção da Comercial, os grupos da aba Comercial, a linha com tempo e motivo
 * e a marca de contato ignorado.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, ConversationQuery } from "@/data";
import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const listConversations = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: vi.fn(),
      list: listConversations,
      listMessages: vi.fn(),
    },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
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
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-09-14T16:42:00.000Z",
    ...overrides,
  };
}

const waitingFernanda = conversationFixture({
  customerName: "Fernanda Lima",
  humanHandoff: true,
  id: "conv-fernanda",
  status: "HUMAN_HANDOFF",
  updatedAt: "2026-09-14T16:33:00.000Z",
});
const waitingMarcos = conversationFixture({
  customerName: "Marcos Vieira",
  handoffReason: "pediu desconto",
  humanHandoff: true,
  id: "conv-marcos",
  status: "HUMAN_HANDOFF",
  updatedAt: "2026-09-14T16:11:00.000Z",
});
const todayAna = conversationFixture({
  customerName: "Ana Paula",
  id: "conv-ana",
  lastMessage: {
    body: "Confirmado!",
    createdAt: "2026-09-14T16:42:00.000Z",
    direction: "INBOUND",
    id: "m1",
    source: "CUSTOMER",
  },
});
const yesterdayBia = conversationFixture({
  customerName: "Bia Castro",
  id: "conv-bia",
  updatedAt: "2026-09-13T20:00:00.000Z",
});

function serve(byCategory: Record<string, Conversation[]>) {
  listConversations.mockImplementation(async (query: ConversationQuery) => {
    if (query.ignored) return byCategory.IGNORED ?? [];
    return byCategory[query.category ?? ""] ?? [];
  });
}

function renderInbox() {
  return render(
    <SystemStatusProvider>
      <ShellConfigProvider>
        <ProductConversationsScreen />
      </ShellConfigProvider>
    </SystemStatusProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T16:45:00.000Z"));
  listConversations.mockReset();
  statusGet.mockReset();
  notificationsSummary.mockReset();
  listConversations.mockResolvedValue([]);
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
      checkedAt: "2026-09-14T16:45:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cabeçalho e busca pela lupa", () => {
  test("o título é um h1 e a busca só aparece depois da lupa", async () => {
    serve({ COMMERCIAL: [todayAna] });
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Ana Paula");

    expect(
      screen.getByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Buscar por nome ou telefone")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ignorados" })).toBeNull();

    const lupa = screen.getByRole("button", { name: "Buscar conversas" });
    expect(lupa).toHaveAttribute("aria-expanded", "false");
    await user.click(lupa);

    expect(lupa).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Buscar por nome ou telefone")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Ignorados" })).toBeVisible();
  });

  test("a busca usa a mesma query com category e search depois do debounce", async () => {
    serve({ COMMERCIAL: [todayAna] });
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Ana Paula");

    await user.click(screen.getByRole("button", { name: "Buscar conversas" }));
    await user.type(
      screen.getByLabelText("Buscar por nome ou telefone"),
      "Ana",
    );

    await waitFor(
      () =>
        expect(listConversations).toHaveBeenCalledWith(
          { category: "COMMERCIAL", limit: 50, search: "Ana" },
          expect.anything(),
        ),
      { timeout: 3000 },
    );
  });

  test("fechar a busca limpa o termo, volta à aba Comercial e devolve o foco à lupa", async () => {
    serve({ COMMERCIAL: [todayAna], IGNORED: [] });
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Ana Paula");

    const lupa = screen.getByRole("button", { name: "Buscar conversas" });
    await user.click(lupa);
    await user.click(screen.getByRole("button", { name: "Ignorados" }));
    await user.click(lupa);

    expect(screen.queryByLabelText("Buscar por nome ou telefone")).toBeNull();
    expect(lupa).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Comercial" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("a lente Ignorados no modo de busca", () => {
  test("consulta por ignored e a linha abre a conversa ignorada", async () => {
    const ignored = conversationFixture({
      category: "PERSONAL",
      customerName: "Mãe",
      id: "conv-mae",
      ignored: true,
    });
    serve({ COMMERCIAL: [todayAna], IGNORED: [ignored] });
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Ana Paula");

    await user.click(screen.getByRole("button", { name: "Buscar conversas" }));
    await user.click(screen.getByRole("button", { name: "Ignorados" }));

    expect(await screen.findByText("Mãe")).toBeVisible();
    expect(listConversations).toHaveBeenCalledWith(
      { ignored: true, limit: 50 },
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Ignorados" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const row = screen.getByText("Mãe").closest("a");
    expect(row).toHaveClass("conversation-row");
    expect(row).toHaveAttribute("href", "/conversas/conv-mae");
    expect(
      within(row as HTMLElement).getByText("A IA nunca responde este contato"),
    ).toBeVisible();
  });
});

describe("abas e contador de atenção", () => {
  test("o contador da Comercial conta só quem exige atenção", async () => {
    serve({ COMMERCIAL: [waitingFernanda, waitingMarcos, todayAna] });
    renderInbox();
    await screen.findByText("Ana Paula");

    const tab = screen.getByRole("tab", { name: "Comercial" });
    expect(within(tab).getByText("2")).toBeVisible();
    expect(tab).toHaveAccessibleDescription("2 aguardando você");
  });

  test("em zero o contador some", async () => {
    serve({ COMMERCIAL: [todayAna, yesterdayBia] });
    renderInbox();
    await screen.findByText("Ana Paula");

    const tab = screen.getByRole("tab", { name: "Comercial" });
    expect(tab.textContent).toBe("Comercial");
    expect(tab).not.toHaveAttribute("aria-describedby");
  });

  test("nas outras abas o contador vem da leitura de category=COMMERCIAL", async () => {
    serve({
      COMMERCIAL: [waitingFernanda, todayAna],
      PERSONAL: [conversationFixture({ category: "PERSONAL", id: "conv-p" })],
    });
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Ana Paula");

    await user.click(screen.getByRole("tab", { name: "Pessoal" }));
    await screen.findByText("Marina Duarte");

    expect(
      within(screen.getByRole("tab", { name: "Comercial" })).getByText("1"),
    ).toBeVisible();
    expect(listConversations).toHaveBeenCalledWith(
      { category: "COMMERCIAL", limit: 50 },
      expect.anything(),
    );
  });

  test("Não classificadas e Pessoal trazem a frase do topo do quadro", async () => {
    serve({
      PERSONAL: [conversationFixture({ category: "PERSONAL", id: "conv-p" })],
      UNCLASSIFIED: [
        conversationFixture({ category: "UNCLASSIFIED", id: "conv-u" }),
      ],
    });
    const user = userEvent.setup();
    renderInbox();

    await user.click(
      await screen.findByRole("tab", { name: "Não classificadas" }),
    );
    expect(
      await screen.findByText(
        "Ainda não dá para saber se são clientes ou pessoais. A IA só responde quando a intenção fica clara ou quando você move a conversa.",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Pessoal" }));
    expect(await screen.findByText("IA desativada.")).toBeVisible();
    expect(
      screen.getByText(/Elas ficam fora dos seus números\./),
    ).toBeVisible();
  });
});

describe("grupos e linha da aba Comercial", () => {
  test("Aguardando você, Hoje e as anteriores, com tempo e motivo", async () => {
    serve({
      COMMERCIAL: [waitingFernanda, waitingMarcos, todayAna, yesterdayBia],
    });
    renderInbox();
    await screen.findByText("Ana Paula");

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Aguardando você", "Hoje", "Anteriores"]);
    expect(screen.getByText("Anteriores")).toHaveClass("sr-only");

    const fernanda = screen.getByText("Fernanda Lima").closest("a");
    expect(
      within(fernanda as HTMLElement).getByText("há 12 min"),
    ).toBeVisible();
    const marcos = screen.getByText("Marcos Vieira").closest("a");
    expect(within(marcos as HTMLElement).getByText("há 34 min")).toBeVisible();
    expect(
      within(marcos as HTMLElement).getByText("Aguardando você"),
    ).toBeVisible();
    expect(
      within(marcos as HTMLElement).getByText(/pediu desconto/),
    ).toBeVisible();

    const ana = screen.getByText("Ana Paula").closest("a");
    expect(within(ana as HTMLElement).getByText("13:42")).toBeVisible();
    const bia = screen.getByText("Bia Castro").closest("a");
    expect(within(bia as HTMLElement).getByText("ontem")).toBeVisible();
  });

  test("toda linha continua sendo a.conversation-row com link para /conversas/{id}", async () => {
    serve({ COMMERCIAL: [waitingFernanda, todayAna] });
    renderInbox();
    await screen.findByText("Ana Paula");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.tagName).toBe("A");
      expect(link).toHaveClass("conversation-row");
    }
    expect(links[0]).toHaveAttribute("href", "/conversas/conv-fernanda");
    expect(links[1]).toHaveAttribute("href", "/conversas/conv-ana");
  });

  test("contato sem nome mostra o telefone formatado", async () => {
    serve({
      UNCLASSIFIED: [
        conversationFixture({
          category: "UNCLASSIFIED",
          customerName: null,
          externalContactId: "5511976543210@c.us",
          id: "conv-u",
        }),
      ],
    });
    const user = userEvent.setup();
    renderInbox();
    await user.click(
      await screen.findByRole("tab", { name: "Não classificadas" }),
    );

    expect(await screen.findByText("+55 11 97654-3210")).toBeVisible();
  });

  test("o avatar usa só letras: um emoji no nome não vira inicial", async () => {
    serve({
      COMMERCIAL: [
        conversationFixture({
          customerName: "Dudu ❤️",
          id: "conv-dudu",
          updatedAt: new Date().toISOString(),
        }),
      ],
    });
    renderInbox();

    const row = (await screen.findByText("Dudu ❤️")).closest("a");
    expect(row?.querySelector(".conversation-row-avatar")).toHaveTextContent(
      /^D$/,
    );
  });
});
