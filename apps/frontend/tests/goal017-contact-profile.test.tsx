// @vitest-environment jsdom
/**
 * Goal017 (WU-06) — o painel de contexto do contato.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - com vínculo (`customerId`), o painel liga para a pessoa certa por id,
 *   nunca por telefone;
 * - sem vínculo, a tela diz que o contato ainda não é cliente cadastrado;
 * - o contexto não é mais coluna (Goal114): em todas as larguras ele abre
 *   numa folha, pelo nome no cabeçalho;
 * - nenhuma memória, nota ou tag aparece aqui — isso é Clientes;
 * - marcar e desmarcar "ignorar na IA" existem na tela, são reversíveis pela
 *   mesma operação (`setIgnored`) e dizem o que fazem antes de confirmar.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation } from "@/data";
import { ConversationContextPanel } from "@/features/conversations/ConversationContextPanel";
import { ConversationCustomerSheet } from "@/features/conversations/ConversationCustomerSheet";
import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const listConversations = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();
const setIgnored = vi.fn();
const getCustomer = vi.fn();
const listAppointments = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { listAppointments },
    customers: { generateSummary: vi.fn(), get: getCustomer },
    conversations: {
      get: getConversation,
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
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  listConversations.mockReset();
  getConversation.mockReset();
  listMessages.mockReset();
  setIgnored.mockReset();
  getCustomer.mockReset();
  listAppointments.mockReset();
  getCustomer.mockResolvedValue({
    id: "cust-42",
    name: "Marina Duarte",
    phone: "5511999990000",
  });
  listAppointments.mockResolvedValue([]);
  listConversations.mockResolvedValue([]);
});

function renderPanel(
  conversation: Conversation,
  props: Partial<{
    onChooseTreatment: () => void;
    treatmentError: string | null;
  }> = {},
) {
  return render(
    <ConversationContextPanel
      conversation={conversation}
      onChooseTreatment={props.onChooseTreatment ?? vi.fn()}
      onResolve={vi.fn()}
      person="Marina Duarte"
      treatmentBusy={false}
      treatmentError={props.treatmentError ?? null}
    />,
  );
}

function renderSheet(conversation: Conversation) {
  return render(
    <ConversationCustomerSheet
      conversation={conversation}
      onChooseTreatment={vi.fn()}
      onClose={vi.fn()}
      onResolve={vi.fn()}
      onTakeover={vi.fn()}
      person="Marina Duarte"
      takeoverBusy={false}
      treatmentBusy={false}
      treatmentError={null}
    />,
  );
}

describe("vínculo por customerId", () => {
  test("com vínculo, liga para a pessoa certa por id", async () => {
    renderSheet(conversationFixture({ customerId: "cust-42" }));

    const link = await screen.findByRole("link", { name: "Ver perfil" });
    expect(link).toHaveAttribute("href", "/clientes/detalhes?id=cust-42");
    expect(getCustomer).toHaveBeenCalledWith("cust-42", expect.anything());
  });

  test("sem vínculo, diz que o contato ainda não é cliente cadastrado, sem casar por telefone", () => {
    renderSheet(conversationFixture({ customerId: null }));

    expect(
      screen.getByText("Este contato ainda não é um cliente cadastrado."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Ver perfil" })).toBeNull();
    expect(getCustomer).not.toHaveBeenCalled();
    expect(screen.queryByText(/telefone/i)).toBeNull();
  });

  test("campo ausente no estoque anterior também é tratado como sem vínculo", () => {
    const conversation = conversationFixture();
    delete (conversation as { customerId?: string | null }).customerId;
    renderSheet(conversation);

    expect(
      screen.getByText("Este contato ainda não é um cliente cadastrado."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Ver perfil" })).toBeNull();
  });
});

describe("nada de memória, nota ou tag aqui", () => {
  test("o painel não cria nem edita memória, nota ou tag", () => {
    const { container } = renderPanel(
      conversationFixture({ customerId: "cust-42" }),
    );

    expect(screen.queryByText(/memória/i)).toBeNull();
    expect(screen.queryByText(/\btag\b/i)).toBeNull();
    expect(screen.queryByText(/\bnota\b/i)).toBeNull();
    expect(container.querySelectorAll("textarea, input")).toHaveLength(0);
  });
});

describe("o contexto abre em folha pelo nome no cabeçalho (Goal114)", () => {
  test("não há coluna de contexto na árvore antes de abrir a folha", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ customerId: "cust-42" }),
    );
    listMessages.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductConversationsScreen conversationId="conv-1" />
      </ShellConfigProvider>,
    );

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    expect(screen.queryByLabelText("Contexto da conversa")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver perfil" })).toBeNull();
    expect(document.querySelector(".conversation-context")).toBeNull();
  });

  test("o nome no cabeçalho abre o contexto numa folha", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ customerId: "cust-42" }),
    );
    listMessages.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductConversationsScreen conversationId="conv-1" />
      </ShellConfigProvider>,
    );

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Abrir contexto de Marina Duarte" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(
      await within(dialog).findByRole("link", { name: "Ver perfil" }),
    ).toHaveAttribute("href", "/clientes/detalhes?id=cust-42");
  });
});

describe("ignorar na IA: marcar e desmarcar existem e são reversíveis", () => {
  test("contato não ignorado oferece marcar, dizendo o que a marca faz", async () => {
    const onChooseTreatment = vi.fn();
    renderPanel(conversationFixture({ ignored: false }), {
      onChooseTreatment,
    });
    const user = userEvent.setup();

    const radio = screen.getByRole("radio", { name: "Nunca responde" });
    expect(radio).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/é o mesmo que Ignorar IA/)).toBeVisible();

    await user.click(radio);
    expect(onChooseTreatment).toHaveBeenCalledTimes(1);
    expect(onChooseTreatment).toHaveBeenCalledWith("NEVER");
  });

  test("contato ignorado oferece desmarcar, sem dizer que a conversa sumiu", () => {
    renderPanel(conversationFixture({ ignored: true }));

    expect(screen.getByRole("radio", { name: "Nunca responde" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Automático" })).not.toBeChecked();
    expect(screen.getByText(/As mensagens continuam aqui/)).toBeVisible();
    expect(screen.queryByText(/apagad|bloquead/i)).toBeNull();
  });

  test("falha da operação aparece junto do controle, não como tela de erro", () => {
    renderPanel(conversationFixture({ ignored: false }), {
      treatmentError: "Não foi possível alterar o contato ignorado. (ID r-1)",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível alterar o contato ignorado.",
    );
    expect(screen.getByRole("radio", { name: "Nunca responde" })).toBeEnabled();
  });
});

describe("ignorar na IA pela tela real, com confirmação antes do efeito", () => {
  async function openIgnoreDialog(conversation: Conversation) {
    getConversation.mockResolvedValue(conversation);
    listMessages.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductConversationsScreen conversationId="conv-1" />
      </ShellConfigProvider>,
    );
    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    // Goal114: sem coluna de contexto, ignorar fica no menu "Mais ações".
    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(
      screen.getByRole("button", {
        name: conversation.ignored
          ? "Voltar a usar na IA"
          : "Ignorar IA para este contato",
      }),
    );
    return { dialog: await screen.findByRole("dialog"), user };
  }

  test("marcar pede confirmação e chama setIgnored(true)", async () => {
    setIgnored.mockResolvedValue(conversationFixture({ ignored: true }));
    const { dialog, user } = await openIgnoreDialog(
      conversationFixture({ ignored: false }),
    );

    expect(
      within(dialog).getByText(/o histórico anterior deixa de ser contexto/),
    ).toBeVisible();
    expect(setIgnored).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Ignorar contato" }),
    );

    expect(setIgnored).toHaveBeenCalledWith("conv-1", true);
    expect(
      await screen.findByText(/A IA nunca responde este contato/),
    ).toBeVisible();
  });

  test("desmarcar usa a mesma operação, com false", async () => {
    setIgnored.mockResolvedValue(conversationFixture({ ignored: false }));
    const { dialog, user } = await openIgnoreDialog(
      conversationFixture({ ignored: true }),
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Voltar a usar na IA" }),
    );

    expect(setIgnored).toHaveBeenCalledWith("conv-1", false);
  });

  test("cancelar fecha sem efeito nenhum", async () => {
    const { dialog, user } = await openIgnoreDialog(
      conversationFixture({ ignored: false }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(setIgnored).not.toHaveBeenCalled();
  });
});
