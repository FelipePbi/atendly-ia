// @vitest-environment jsdom
/**
 * Goal067/WU-04: IA, Conta, Mais e texto de produto no frontend.
 *
 * O que esta suíte prova, contra a baseline `a069d77` (onde nenhuma destas
 * coisas existia: `OtherInfoSection` não lia nada, `ToneChoice` citava "V1",
 * `AccountSettings` não mostrava nem editava o nome, "Mais" não tinha
 * Disponibilidade nem Conversas e tinha "Ajuda" em dois lugares, e os
 * `switch-row` de liga/desliga misturavam título e descrição no nome
 * acessível):
 *
 * - `OtherInfoSection` abre com o texto lido por `knowledge.getOtherInfo`,
 *   sem o aviso "conteúdo salvo não é reexibido"; falha de leitura mostra
 *   erro de tela e não apaga o que a pessoa já digitou;
 * - `ToneChoice` (Estilo da IA) não cita mais "V1";
 * - `AccountSettings` mostra o nome salvo ou um convite quando é nulo, e
 *   grava pelo `account.updateProfile` (PATCH /v1/account/profile);
 * - o "Mais" do AppShell lista Disponibilidade e Conversas, e nenhum menu
 *   (conta ou "Mais") mostra "Ajuda";
 * - os `switch-row` de Notificações e Lembretes separam título e descrição:
 *   o nome acessível do checkbox é só o título.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { OtherInfoSection } from "@/features/knowledge/OtherInfoSection";
import { NotificationPreferenceSection } from "@/features/notifications/NotificationPreferenceSection";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { AccountSettings } from "@/features/settings/AccountSettings";
import { ToneChoice } from "@/features/settings/shared/fields";
import { AppShell } from "@/shared/layout/AppShell";
import type * as systemStatusModule from "@/shared/runtime/systemStatus";

const knowledgeGetOtherInfo = vi.fn();
const knowledgeSaveOtherInfo = vi.fn();
const accountUpdateProfile = vi.fn();
const refreshSession = vi.fn();
const authLogout = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const notificationsGetPreferences = vi.fn();
const notificationsUpdatePreferences = vi.fn();
const remindersGet = vi.fn();
const remindersUpdate = vi.fn();

let sessionUser: { email: string; name?: string | null } = {
  email: "dona@studiomarina.com.br",
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { updateProfile: accountUpdateProfile },
    auth: { changePassword: vi.fn(), logout: authLogout, logoutAllDevices: vi.fn() },
    knowledge: {
      getOtherInfo: knowledgeGetOtherInfo,
      saveOtherInfo: knowledgeSaveOtherInfo,
    },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
      updatePreferences: notificationsUpdatePreferences,
    },
    settings: { getReminders: remindersGet, updateReminders: remindersUpdate },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: sessionUser,
    },
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/shared/runtime/systemStatus", async () => {
  const actual = await vi.importActual<typeof systemStatusModule>(
    "@/shared/runtime/systemStatus",
  );
  return {
    ...actual,
    useSystemStatus: () => ({
      accountDeletion: { status: "NONE", dueAt: null },
      phase: "loaded",
      refresh: vi.fn(),
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { email: "dona@studiomarina.com.br" };
  statusGet.mockResolvedValue({
    accountDeletion: { status: "NONE", dueAt: null },
    ai: { desiredEnabled: true, effectiveEnabled: true, reconciled: "CONVERGED", state: "ACTIVE" },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-15T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
});

describe("Outras informações importantes: leitura (Goal067)", () => {
  test("abre com o texto lido, sem o aviso antigo de não reexibição", async () => {
    knowledgeGetOtherInfo.mockResolvedValue({
      content: "Aceitamos cartão e pix.",
    });
    render(<OtherInfoSection />);

    const contentField = await screen.findByLabelText("Conteúdo");
    await waitFor(() =>
      expect(contentField).toHaveValue("Aceitamos cartão e pix."),
    );
    expect(
      screen.queryByText(/O conteúdo salvo não é reexibido/),
    ).not.toBeInTheDocument();
  });

  // Observação 2 do review067, fechada no Goal073: a caixa fica somente
  // leitura depois de uma leitura falhada, não só o botão de salvar.
  test("falha de leitura mostra erro de tela e não aceita digitação", async () => {
    knowledgeGetOtherInfo.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(<OtherInfoSection />);

    expect(
      await screen.findByText(/Não foi possível carregar o texto salvo/),
    ).toBeVisible();

    const contentField = screen.getByLabelText("Conteúdo");
    await user.type(contentField, "Texto digitado agora.");
    expect(contentField).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Salvar informações" }),
    ).toBeDisabled();
  });

  test("enquanto a leitura está pendente, 'Salvar informações' fica desabilitado", async () => {
    let resolveRead: (value: { content: string }) => void = () => {};
    knowledgeGetOtherInfo.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    render(<OtherInfoSection />);

    expect(
      screen.getByRole("button", { name: "Salvar informações" }),
    ).toBeDisabled();

    resolveRead({ content: "Aceitamos cartão e pix." });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar informações" }),
      ).not.toBeDisabled(),
    );
  });

  test("falha de leitura recusa salvar por cima do texto nunca carregado", async () => {
    knowledgeGetOtherInfo.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(<OtherInfoSection />);

    await screen.findByText(/Não foi possível carregar o texto salvo/);
    await user.type(screen.getByLabelText("Conteúdo"), "Trecho digitado.");
    await user.click(
      screen.getByRole("button", { name: "Salvar informações" }),
    );

    expect(knowledgeSaveOtherInfo).not.toHaveBeenCalled();
  });
});

describe("Estilo da IA sem termos internos (Goal067)", () => {
  test("ToneChoice não cita 'V1'", () => {
    render(
      <ToneChoice checked={false} label="Profissional" onChange={() => {}} />,
    );

    expect(screen.getByText("Profissional")).toBeVisible();
    expect(screen.queryByText(/V1/)).not.toBeInTheDocument();
  });
});

describe("Conta mostra e edita o nome (Goal067)", () => {
  test("com nome salvo, mostra o nome e não o convite", async () => {
    sessionUser = { email: "dona@studiomarina.com.br", name: "Maria Clara" };
    const user = userEvent.setup();
    render(<AccountSettings />);

    const row = await screen.findByRole("button", { name: /^Nome/ });
    expect(row).toHaveTextContent("Maria Clara");
    await user.click(row);
    const nameField = await screen.findByRole("textbox", { name: "Nome" });
    expect(nameField).toHaveValue("Maria Clara");
    expect(screen.getByText("Como a Avenly chama você.")).toBeVisible();
  });

  test("com nome nulo, mostra o convite a informá-lo", async () => {
    sessionUser = { email: "dona@studiomarina.com.br", name: null };
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByRole("button", { name: /^Nome/ }));
    const nameField = await screen.findByRole("textbox", { name: "Nome" });
    expect(nameField).toHaveValue("");
    expect(
      screen.getByText(
        "Adicione seu nome para a Avenly usar no cumprimento.",
      ),
    ).toBeVisible();
  });

  test("salvar grava pelo PATCH /v1/account/profile e relê a sessão", async () => {
    sessionUser = { email: "dona@studiomarina.com.br", name: null };
    accountUpdateProfile.mockResolvedValue({
      user: {
        id: "u1",
        email: "dona@studiomarina.com.br",
        name: "Maria Clara",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByRole("button", { name: /^Nome/ }));
    const nameField = await screen.findByRole("textbox", { name: "Nome" });
    await user.type(nameField, "Maria Clara");
    await user.click(screen.getByRole("button", { name: "Salvar nome" }));

    await waitFor(() =>
      expect(accountUpdateProfile).toHaveBeenCalledWith("Maria Clara"),
    );
    await waitFor(() => expect(refreshSession).toHaveBeenCalled());
    expect(await screen.findByText("Nome salvo.")).toBeVisible();
  });
});

describe("'Mais' tem Disponibilidade e Conversas, sem 'Ajuda' em menu nenhum (Goal067)", () => {
  test("o diálogo 'Mais' lista Disponibilidade e Conversas, sem 'Ajuda'", async () => {
    const user = userEvent.setup();
    render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );

    await user.click(await screen.findByRole("button", { name: "Mais" }));
    const dialog = await screen.findByRole("dialog", { name: "Mais" });
    expect(
      within(dialog).getByRole("link", { name: /Disponibilidade/ }),
    ).toHaveAttribute("href", "/configuracoes/disponibilidade");
    expect(
      within(dialog).getByRole("link", { name: /Conversas/ }),
    ).toHaveAttribute("href", "/configuracoes/conversas");
    expect(within(dialog).queryByText("Ajuda")).not.toBeInTheDocument();
  });

  test("o menu da conta (sidebar) não mostra 'Ajuda'", async () => {
    const user = userEvent.setup();
    render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );

    const accountButton = await screen.findByRole("button", {
      name: /dona@studiomarina\.com\.br/,
    });
    await user.click(accountButton);

    expect(
      screen.getByRole("link", { name: "Minha conta" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ajuda")).not.toBeInTheDocument();
  });
});

describe("liga/desliga com título e descrição separados no nome acessível (Goal067)", () => {
  test("preferência de notificação: o nome acessível do checkbox é só o título", async () => {
    notificationsGetPreferences.mockResolvedValue({
      aiAppointmentCreated: false,
    });
    render(<NotificationPreferenceSection />);

    const checkbox = await screen.findByRole("checkbox", {
      name: "Agendamento criado pela IA",
    });
    expect(checkbox).toBeVisible();
    expect(
      screen.getByText(/Desligada por padrão: avise quando a IA confirmar/),
    ).toBeVisible();
  });

  test("lembretes: o nome acessível do checkbox de confirmação é só o título", async () => {
    remindersGet.mockResolvedValue({
      configured: true,
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    });
    render(<ReminderSettingsSection />);

    const checkbox = await screen.findByRole("checkbox", {
      name: "Pedir confirmação de presença",
    });
    expect(checkbox).toBeVisible();
    expect(
      screen.getByText(/Se a cliente disser que não vem/),
    ).toBeVisible();
  });
});
