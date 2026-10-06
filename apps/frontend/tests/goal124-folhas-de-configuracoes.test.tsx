// @vitest-environment jsdom
/**
 * Goal124 — as confirmações de ação com consequência de Configurações, iguais
 * ao protótipo (W2 e R2).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. W2 (desconectar o WhatsApp): título "Desconectar o WhatsApp?", texto com o
 *    telefone formatado (ou "Seu número…" sem telefone), as três linhas do
 *    quadro (a terceira sem "de 3 minutos"), "Desconectar" e "Manter conectado"
 *    na ordem do quadro. Confirmar chama `whatsapp.disconnect` uma vez; "Manter
 *    conectado" fecha sem chamar; a falha mostra a mensagem de hoje em
 *    `role="alert"`. O diálogo do onboarding é o mesmo.
 * 2. R2 (reduzir a retenção): título com o novo prazo, texto sem contagem, a
 *    frase das Não classificadas só com Comercial reduzida, a nota, "Reduzir
 *    para {novo}" em tinta (sem `btn-danger`) e "Manter {atual}". As duas
 *    categorias têm texto próprio. O PATCH sai com `confirmReduction: true` só
 *    depois de confirmar, uma vez; "Manter…" não envia nada; sem redução a
 *    folha nem abre.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo (`visual:compare`).
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { RetentionSettings, WhatsAppConnection } from "@/data";
import { RetentionSection } from "@/features/settings/RetentionSection";
import {
  type WhatsAppConnectedContext,
  WhatsAppConnectionPanel,
} from "@/features/whatsapp/WhatsAppConnectionPanel";

const whatsappGet = vi.fn();
const whatsappDisconnect = vi.fn();
const retentionGet = vi.fn();
const retentionUpdate = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    retention: { get: retentionGet, update: retentionUpdate },
    whatsapp: {
      connect: vi.fn(),
      disconnect: whatsappDisconnect,
      get: whatsappGet,
      qr: vi.fn(),
      reconnect: vi.fn(),
    },
  }),
}));

const DISCONNECT_FAILURE = "Não foi possível desconectar o número.";

function connectionFixture(
  overrides: Partial<WhatsAppConnection> = {},
): WhatsAppConnection {
  return {
    connectedAt: "2026-09-18T15:00:00.000Z",
    id: "connection-1",
    phoneNumber: "5511987654321",
    status: "CONNECTED",
    updatedAt: "2026-10-01T15:00:00.000Z",
    ...overrides,
  };
}

function retentionFixture(
  overrides: Partial<RetentionSettings> = {},
): RetentionSettings {
  return {
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays: 90,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  whatsappGet.mockResolvedValue(connectionFixture());
  whatsappDisconnect.mockResolvedValue(undefined);
  retentionGet.mockResolvedValue(retentionFixture());
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: "",
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

function ConnectedRow({ context }: { context: WhatsAppConnectedContext }) {
  return (
    <div>
      <button type="button" onClick={context.openDisconnectDialog}>
        Desconectar WhatsApp
      </button>
      {context.error && <p role="alert">{context.error}</p>}
    </div>
  );
}

async function openSettingsSheet(user: ReturnType<typeof userEvent.setup>) {
  render(
    <WhatsAppConnectionPanel
      renderConnected={(context) => <ConnectedRow context={context} />}
    />,
  );
  await user.click(
    await screen.findByRole("button", { name: "Desconectar WhatsApp" }),
  );
  return screen.getByRole("dialog", { name: "Desconectar o WhatsApp?" });
}

describe("Goal124 W2: desconectar o WhatsApp", () => {
  test("título, texto com o telefone formatado, três linhas e dois botões na ordem do quadro", async () => {
    const user = userEvent.setup();
    const dialog = await openSettingsSheet(user);

    expect(
      within(dialog).getByRole("heading", { name: "Desconectar o WhatsApp?" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "O número +55 11 98765-4321 deixa de estar ligado à Avenly.",
      ),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Sua IA para de atender na hora. Ninguém recebe resposta automática.",
    );
    expect(dialog).toHaveTextContent(
      "Clientes, agenda e histórico de conversas continuam na Avenly.",
    );
    expect(dialog).toHaveTextContent(
      "Para voltar, basta conectar de novo e refazer o teste.",
    );
    expect(dialog).not.toHaveTextContent(/3 minutos/);
    expect(dialog).not.toHaveTextContent(/Interrupção do serviço/);

    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Desconectar",
      "Manter conectado",
    ]);
    expect(buttons[0]).toHaveClass("is-danger");
  });

  test("sem phoneNumber o texto começa por 'Seu número'", async () => {
    whatsappGet.mockResolvedValue(connectionFixture({ phoneNumber: null }));
    const user = userEvent.setup();
    const dialog = await openSettingsSheet(user);

    expect(
      within(dialog).getByText("Seu número deixa de estar ligado à Avenly."),
    ).toBeVisible();
    expect(dialog).not.toHaveTextContent(/\+55/);
  });

  test("'Desconectar' chama whatsapp.disconnect uma vez", async () => {
    const user = userEvent.setup();
    const dialog = await openSettingsSheet(user);

    await user.click(within(dialog).getByRole("button", { name: "Desconectar" }));

    await waitFor(() => expect(whatsappDisconnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("ao abrir, o foco cai em 'Manter conectado' e Enter não desconecta", async () => {
    const user = userEvent.setup();
    const dialog = await openSettingsSheet(user);

    expect(
      within(dialog).getByRole("button", { name: "Manter conectado" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(whatsappDisconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("'Manter conectado' fecha a folha e não chama whatsapp.disconnect", async () => {
    const user = userEvent.setup();
    const dialog = await openSettingsSheet(user);

    await user.click(
      within(dialog).getByRole("button", { name: "Manter conectado" }),
    );

    expect(whatsappDisconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a falha mostra a mensagem de hoje em role=alert e mantém a conexão", async () => {
    whatsappDisconnect.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    const dialog = await openSettingsSheet(user);

    await user.click(within(dialog).getByRole("button", { name: "Desconectar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(DISCONNECT_FAILURE);
    expect(whatsappDisconnect).toHaveBeenCalledTimes(1);
  });

  test("o diálogo do onboarding é o mesmo: 'Desconectar número' abre a mesma folha", async () => {
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    await user.click(
      await screen.findByRole("button", { name: "Desconectar número" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Desconectar o WhatsApp?" });
    expect(dialog).toHaveTextContent(
      "O número +55 11 98765-4321 deixa de estar ligado à Avenly.",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Desconectar", "Manter conectado"]);

    await user.click(within(dialog).getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(whatsappDisconnect).toHaveBeenCalledTimes(1));
  });

  test("no onboarding a falha aparece dentro da folha, em role=alert", async () => {
    whatsappDisconnect.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    await user.click(
      await screen.findByRole("button", { name: "Desconectar número" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Desconectar o WhatsApp?" });
    await user.click(within(dialog).getByRole("button", { name: "Desconectar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      DISCONNECT_FAILURE,
    );
    expect(whatsappDisconnect).toHaveBeenCalledTimes(1);
  });
});

const COMMERCIAL = "Conversas comerciais";
const PERSONAL = "Conversas pessoais";
const NOTE = "Clientes, agendamentos e histórico de atendimentos não mudam.";
const EXPIRED = "Elas continuam na lista, com a indicação de que as mensagens antigas expiraram.";
const UNCLASSIFIED = "As Não classificadas seguem o mesmo prazo.";

function radio(groupName: string, days: string): HTMLElement {
  return within(screen.getByRole("radiogroup", { name: groupName })).getByRole(
    "radio",
    { name: days },
  );
}

async function renderRetention() {
  render(<RetentionSection />);
  await screen.findByRole("heading", {
    name: "Por quanto tempo guardar as mensagens",
  });
}

async function chooseAndSave(
  user: ReturnType<typeof userEvent.setup>,
  choices: Array<[string, string]>,
) {
  for (const [group, days] of choices) {
    await user.click(radio(group, days));
  }
  await user.click(screen.getByRole("button", { name: "Salvar" }));
}

describe("Goal124 R2: reduzir a retenção", () => {
  test("só Comercial: título, texto sem contagem, frase das Não classificadas, nota e botões", async () => {
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "30 dias"]]);

    const dialog = await screen.findByRole("dialog", {
      name: "Guardar conversas comerciais por 30 dias?",
    });
    expect(
      within(dialog).getByRole("heading", {
        name: "Guardar conversas comerciais por 30 dias?",
      }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      `Mensagens com mais de 30 dias serão removidas. ${EXPIRED} ${UNCLASSIFIED}`,
    );
    expect(dialog).not.toHaveTextContent(/\d+ conversas/);
    expect(within(dialog).getByText(NOTE)).toBeVisible();

    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Reduzir para 30 dias",
      "Manter 90 dias",
    ]);
    expect(retentionUpdate).not.toHaveBeenCalled();
  });

  test("só Pessoal: título pessoal e sem a frase das Não classificadas", async () => {
    retentionGet.mockResolvedValue(retentionFixture({ personalRetentionDays: 90 }));
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[PERSONAL, "30 dias"]]);

    const dialog = await screen.findByRole("dialog", {
      name: "Guardar conversas pessoais por 30 dias?",
    });
    expect(dialog).toHaveTextContent(
      `Mensagens com mais de 30 dias serão removidas. ${EXPIRED}`,
    );
    expect(dialog).not.toHaveTextContent(/Não classificadas/);
    expect(
      within(dialog).getByRole("button", { name: "Reduzir para 30 dias" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Manter 90 dias" }),
    ).toBeVisible();
  });

  test("365 usa o rótulo '1 ano' no título e nos botões", async () => {
    retentionGet.mockResolvedValue(
      retentionFixture({ commercialRetentionDays: 365 }),
    );
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "180 dias"]]);

    const dialog = await screen.findByRole("dialog", {
      name: "Guardar conversas comerciais por 180 dias?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Manter 1 ano" }),
    ).toBeVisible();
  });

  test("as duas categorias reduzidas têm título, texto e botões próprios", async () => {
    retentionGet.mockResolvedValue(
      retentionFixture({ commercialRetentionDays: 180, personalRetentionDays: 90 }),
    );
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [
      [COMMERCIAL, "90 dias"],
      [PERSONAL, "30 dias"],
    ]);

    const dialog = await screen.findByRole("dialog", {
      name: "Reduzir os dois prazos?",
    });
    expect(dialog).toHaveTextContent(
      `Mensagens comerciais com mais de 90 dias e pessoais com mais de 30 dias serão removidas. ${EXPIRED} As Não classificadas seguem o prazo das comerciais.`,
    );
    expect(within(dialog).getByText(NOTE)).toBeVisible();
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Reduzir os dois prazos", "Manter os prazos atuais"]);
  });

  test("'Reduzir para…' envia o PATCH com confirmReduction true, uma vez, só depois de confirmar", async () => {
    retentionUpdate.mockResolvedValue(
      retentionFixture({ commercialRetentionDays: 30 }),
    );
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "30 dias"]]);
    const dialog = await screen.findByRole("dialog");
    expect(retentionUpdate).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Reduzir para 30 dias" }),
    );

    await waitFor(() =>
      expect(retentionUpdate).toHaveBeenCalledWith({
        commercialRetentionDays: 30,
        confirmReduction: true,
        personalRetentionDays: 30,
      }),
    );
    expect(retentionUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("ao abrir, o foco cai em 'Manter…' e Enter não grava a redução", async () => {
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "30 dias"]]);
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByRole("button", { name: "Manter 90 dias" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(retentionUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("'Manter…' fecha a folha, não envia nada e mantém a escolha na tela", async () => {
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "30 dias"]]);
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Manter 90 dias" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(retentionUpdate).not.toHaveBeenCalled();
    expect(radio(COMMERCIAL, "30 dias")).toBeChecked();
  });

  test("sem redução a folha não abre: aumentar grava direto, sem confirmReduction", async () => {
    retentionUpdate.mockResolvedValue(
      retentionFixture({ commercialRetentionDays: 180 }),
    );
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "180 dias"]]);

    await waitFor(() => expect(retentionUpdate).toHaveBeenCalledTimes(1));
    expect(retentionUpdate).toHaveBeenCalledWith({
      commercialRetentionDays: 180,
      personalRetentionDays: 30,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("o botão que confirma é de tinta, sem a classe de perigo", async () => {
    const user = userEvent.setup();
    await renderRetention();
    await chooseAndSave(user, [[COMMERCIAL, "30 dias"]]);
    const dialog = await screen.findByRole("dialog");

    const confirm = within(dialog).getByRole("button", {
      name: "Reduzir para 30 dias",
    });
    expect(confirm).toHaveClass("is-ink");
    expect(confirm).not.toHaveClass("btn-danger");
    expect(confirm).not.toHaveClass("is-danger");
  });
});
