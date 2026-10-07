// @vitest-environment jsdom
/**
 * Goal131 (WU-01): as credenciais do Minha Agenda são o quadro 2.I2, nas duas
 * molduras.
 *
 * O que esta suíte prova:
 *
 * - depois de "Continuar" na origem, o título é "Entre no Minha Agenda" (h1
 *   no onboarding, h2 em Configurações), com a descrição da escolha 3, os
 *   rótulos "E-mail do Minha Agenda" e "Senha" e o botão "Analisar meus dados";
 * - sem eyebrow "Importação", sem subtítulo interno e sem "Copie seus dados…";
 * - ao trocar de conta o título é "Conectar outra conta do Minha Agenda", com
 *   "Cancelar";
 * - "Mostrar senha" troca o `type` entre `password` e `text`, com
 *   `aria-pressed`, nome "Ocultar senha" e o valor preservado;
 * - o envio chama `connectIntegration` e `startImport` uma vez cada, nessa
 *   ordem, mostra "Conectando…" e não muda a validação nem as mensagens.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";
import { ConnectSourceScreen } from "@/features/imports/ConnectSourceScreen";
import {
  type ImportsFrame,
  ImportsFrameProvider,
} from "@/features/imports/ImportsLayout";

const connectIntegration = vi.fn();
const startImport = vi.fn();
const getImportState = vi.fn();
const calls: string[] = [];

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    migration: { getImportState, startImport },
  }),
}));

const DESCRIPTION =
  "Usamos seu acesso só para ler seus dados durante a importação. Ele é apagado assim que você concluir a importação.";

function renderScreen(
  frame: ImportsFrame,
  props: { onCancel?: () => void; replace?: boolean } = {},
) {
  return render(
    <ImportsFrameProvider frame={frame}>
      <ConnectSourceScreen onConnected={vi.fn()} {...props} />
    </ImportsFrameProvider>,
  );
}

async function openCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Continuar" }));
  await screen.findByLabelText("Senha");
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  connectIntegration.mockImplementation(async () => {
    calls.push("connectIntegration");
  });
  startImport.mockImplementation(async () => {
    calls.push("startImport");
  });
  getImportState.mockResolvedValue({ session: null });
});

describe.each([
  { frame: "onboarding", level: 1 },
  { frame: "platform", level: 2 },
] as const)("moldura $frame", ({ frame, level }) => {
  test("título, descrição, rótulos e ação do quadro 2.I2", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen(frame);
    await openCredentials(user);

    expect(
      screen.getByRole("heading", { level, name: "Entre no Minha Agenda" }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Entre no Minha Agenda" })).toHaveLength(1);
    expect(screen.getByText(DESCRIPTION)).toBeVisible();
    expect(screen.getByLabelText("E-mail do Minha Agenda")).toBeVisible();
    expect(screen.getByLabelText("Senha")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Analisar meus dados" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.queryByText(/Copie seus dados/)).toBeNull();
    expect(screen.queryByText("Importação", { selector: "p" })).toBeNull();
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(screen.queryByText("Senha do Minha Agenda")).toBeNull();
    expect(screen.queryByText("Conectar Minha Agenda")).toBeNull();
  });

  test("ao trocar de conta o título é o de hoje, com Cancelar", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderScreen(frame, { onCancel, replace: true });
    await openCredentials(user);

    expect(
      screen.getByRole("heading", {
        level,
        name: "Conectar outra conta do Minha Agenda",
      }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("mostrar a senha", () => {
  test("troca o type, o nome e o aria-pressed sem perder o valor", async () => {
    const user = userEvent.setup();
    renderScreen("onboarding");
    await openCredentials(user);

    const password = screen.getByLabelText("Senha");
    await user.type(password, "super-secret");
    expect(password).toHaveAttribute("type", "password");

    const show = screen.getByRole("button", { name: "Mostrar senha" });
    expect(show).toHaveAttribute("aria-pressed", "false");
    await user.click(show);

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("super-secret");
    expect(password).toHaveFocus();
    const hide = screen.getByRole("button", { name: "Ocultar senha" });
    expect(hide).toHaveAttribute("aria-pressed", "true");

    await user.click(hide);
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("super-secret");
    expect(
      screen.getByRole("button", { name: "Mostrar senha" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("é alcançável pelo teclado e não envia o formulário", async () => {
    const user = userEvent.setup();
    renderScreen("platform");
    await openCredentials(user);

    await user.click(screen.getByLabelText("Senha"));
    await user.tab();
    const show = screen.getByRole("button", { name: "Mostrar senha" });
    expect(show).toHaveFocus();
    expect(show).toHaveAttribute("type", "button");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
    expect(connectIntegration).not.toHaveBeenCalled();
  });
});

describe("envio", () => {
  test("chama connectIntegration e startImport uma vez cada, nessa ordem", async () => {
    const user = userEvent.setup();
    renderScreen("onboarding");
    await openCredentials(user);
    await user.type(
      screen.getByLabelText("E-mail do Minha Agenda"),
      "camila@example.com",
    );
    await user.type(screen.getByLabelText("Senha"), "super-secret");
    await user.click(
      screen.getByRole("button", { name: "Analisar meus dados" }),
    );

    await vi.waitFor(() => expect(getImportState).toHaveBeenCalledTimes(1));
    expect(connectIntegration).toHaveBeenCalledTimes(1);
    expect(connectIntegration).toHaveBeenCalledWith({
      email: "camila@example.com",
      password: "super-secret",
    });
    expect(startImport).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["connectIntegration", "startImport"]);
  });

  test("mostra 'Conectando…' e desabilita o envio enquanto espera", async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    connectIntegration.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    renderScreen("onboarding");
    await openCredentials(user);
    await user.type(
      screen.getByLabelText("E-mail do Minha Agenda"),
      "camila@example.com",
    );
    await user.type(screen.getByLabelText("Senha"), "super-secret");
    await user.click(
      screen.getByRole("button", { name: "Analisar meus dados" }),
    );

    const busy = await screen.findByRole("button", { name: "Conectando…" });
    expect(busy).toBeDisabled();
    release();
    await vi.waitFor(() => expect(getImportState).toHaveBeenCalledTimes(1));
  });

  test("campos vazios mostram a validação de hoje e não enviam nada", async () => {
    const user = userEvent.setup();
    renderScreen("platform");
    await openCredentials(user);
    await user.click(
      screen.getByRole("button", { name: "Analisar meus dados" }),
    );

    expect(
      await screen.findByText("Informe o e-mail do Minha Agenda."),
    ).toBeVisible();
    expect(screen.getByText("Informe a senha do Minha Agenda.")).toBeVisible();
    expect(connectIntegration).not.toHaveBeenCalled();
    expect(startImport).not.toHaveBeenCalled();
  });

  test("a recusa MINHA_AGENDA_AUTH_FAILED mantém a mensagem de hoje", async () => {
    const user = userEvent.setup();
    connectIntegration.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "MINHA_AGENDA_AUTH_FAILED" },
        message: "raw",
        requestId: "req-1",
        status: 502,
      }),
    );
    renderScreen("onboarding");
    await openCredentials(user);
    await user.type(
      screen.getByLabelText("E-mail do Minha Agenda"),
      "camila@example.com",
    );
    await user.type(screen.getByLabelText("Senha"), "super-secret");
    await user.click(
      screen.getByRole("button", { name: "Analisar meus dados" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível entrar no Minha Agenda com esses dados. Confira o e-mail e a senha.",
    );
    expect(startImport).not.toHaveBeenCalled();
  });
});
