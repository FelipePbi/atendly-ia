// @vitest-environment jsdom
/**
 * Goal060 (WU-04): `ConnectSourceScreen` só pede e-mail e senha do Minha
 * Agenda.
 *
 * O que esta suíte prova:
 *
 * - só os dois campos existem: chave de acesso, endereço, código do
 *   profissional e forma de pagamento sumiram;
 * - o envio manda `{ email, password }` a `connectIntegration`;
 * - cada classe de erro do §4 (`error.code: "UPSTREAM_ERROR"` +
 *   `error.details.upstreamCode`) vira um texto de produto distinto, sem
 *   token, OAuth, endereço, HTTP nem código cru, e nunca repete
 *   `error.message`;
 * - `IMPORT_ALREADY_COMPLETED` e `VALIDATION_ERROR` mantêm o tratamento
 *   direto por `error.code`, sem passar por `upstreamCode`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";
import { ConnectSourceScreen } from "@/features/imports/ConnectSourceScreen";

const connectIntegration = vi.fn();
const startImport = vi.fn();
const getImportState = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    migration: { getImportState, startImport },
  }),
}));

function renderScreen() {
  return render(<ConnectSourceScreen onConnected={vi.fn()} />);
}

async function fillCredentials(
  user: ReturnType<typeof userEvent.setup>,
  email = "camila@example.com",
  password = "super-secret",
) {
  await user.click(await screen.findByRole("button", { name: "Continuar" }));
  await user.type(await screen.findByLabelText("E-mail do Minha Agenda"), email);
  await user.type(screen.getByLabelText("Senha"), password);
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("só existem os campos de e-mail e senha", async () => {
  const user = userEvent.setup();
  renderScreen();
  await user.click(await screen.findByRole("button", { name: "Continuar" }));

  expect(
    await screen.findByLabelText("E-mail do Minha Agenda"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  expect(screen.queryByText(/Chave de acesso/)).not.toBeInTheDocument();
  expect(
    screen.queryByText("Endereço da sua conta no Minha Agenda"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Código do profissional")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Forma de pagamento padrão"),
  ).not.toBeInTheDocument();
});

test("o texto explica que os dados servem só a esta importação e são apagados ao concluir", async () => {
  const user = userEvent.setup();
  renderScreen();
  await user.click(await screen.findByRole("button", { name: "Continuar" }));

  expect(
    await screen.findByText(
      /Ele é apagado assim que você concluir a importação\./,
    ),
  ).toBeInTheDocument();
});

test("o envio manda { email, password }", async () => {
  const user = userEvent.setup();
  connectIntegration.mockResolvedValue({});
  startImport.mockResolvedValue({
    created: true,
    replacedSessionId: null,
    sessionId: "session-1",
    status: "DRAFT",
  });
  getImportState.mockResolvedValue({ history: null, right: {}, session: null });
  renderScreen();

  await fillCredentials(user);
  await user.click(screen.getByRole("button", { name: "Analisar meus dados" }));

  expect(connectIntegration).toHaveBeenCalledWith({
    email: "camila@example.com",
    password: "super-secret",
  });
});

describe("classes de erro do §4, por details.upstreamCode", () => {
  test.each([
    {
      code: "MINHA_AGENDA_AUTH_FAILED",
      expected:
        "Não foi possível entrar no Minha Agenda com esses dados. Confira o e-mail e a senha.",
      status: 422,
    },
    {
      code: "MINHA_AGENDA_PROFESSIONAL_NOT_FOUND",
      expected:
        "Não encontramos nenhum profissional cadastrado nessa conta do Minha Agenda.",
      status: 422,
    },
    {
      code: "MINHA_AGENDA_MULTIPLE_PROFESSIONALS",
      expected:
        "Encontramos mais de um profissional cadastrado nessa conta do Minha Agenda. Por enquanto, a Avenly importa a agenda de um profissional só.",
      status: 422,
    },
    {
      code: "MINHA_AGENDA_TIMEOUT",
      expected: "O Minha Agenda não respondeu agora. Nada foi salvo. Tente novamente em alguns minutos.",
      status: 504,
    },
    {
      code: "MINHA_AGENDA_UNREACHABLE",
      expected: "O Minha Agenda não respondeu agora. Nada foi salvo. Tente novamente em alguns minutos.",
      status: 502,
    },
    {
      code: "MINHA_AGENDA_HTTP_ERROR",
      expected: "O Minha Agenda não respondeu agora. Nada foi salvo. Tente novamente em alguns minutos.",
      status: 502,
    },
    {
      code: "MINHA_AGENDA_INVALID_RESPONSE",
      expected: "O Minha Agenda não respondeu agora. Nada foi salvo. Tente novamente em alguns minutos.",
      status: 502,
    },
    {
      code: "MINHA_AGENDA_NOT_CONFIGURED",
      expected:
        "A importação está indisponível agora por uma falha da Avenly, não por causa dos dados informados. Tente novamente mais tarde.",
      status: 503,
    },
    {
      code: "INTEGRATION_CONFIGURATION_INVALID",
      expected:
        "A importação está indisponível agora por uma falha da Avenly, não por causa dos dados informados. Tente novamente mais tarde.",
      status: 500,
    },
  ])(
    "$code (upstream $status) vira texto de produto próprio",
    async ({ code, expected, status }) => {
      const user = userEvent.setup();
      const rawMessage = `raw upstream message for ${code} with token=abc123 https://minhaagenda.example.invalid`;
      connectIntegration.mockRejectedValue(
        new BffHttpError({
          code: "UPSTREAM_ERROR",
          details: { upstreamCode: code },
          message: rawMessage,
          requestId: "req-1",
          status,
        }),
      );
      renderScreen();

      await fillCredentials(user);
      await user.click(
        screen.getByRole("button", { name: "Analisar meus dados" }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(expected);
      expect(alert.textContent).not.toBe(rawMessage);
      expect(alert.textContent ?? "").not.toMatch(
        /token|oauth|endereço|\bAPI\b|\bHTTP\b|https?:\/\/|\b\d{3}\b|MINHA_AGENDA_|INTEGRATION_CONFIGURATION_INVALID|UPSTREAM_ERROR/i,
      );
      expect(startImport).not.toHaveBeenCalled();
    },
  );
});

describe("IMPORT_ALREADY_COMPLETED e VALIDATION_ERROR mantêm o tratamento atual", () => {
  test("IMPORT_ALREADY_COMPLETED", async () => {
    const user = userEvent.setup();
    connectIntegration.mockRejectedValue(
      new BffHttpError({
        code: "IMPORT_ALREADY_COMPLETED",
        message: "This business already completed its single import.",
        requestId: "req-1",
        status: 409,
      }),
    );
    renderScreen();

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Analisar meus dados" }));

    expect(
      await screen.findByText(
        "Este negócio já concluiu sua única importação do Minha Agenda.",
      ),
    ).toBeInTheDocument();
  });

  test("VALIDATION_ERROR", async () => {
    const user = userEvent.setup();
    connectIntegration.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        message: "Invalid body.",
        requestId: "req-1",
        status: 400,
      }),
    );
    renderScreen();

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Analisar meus dados" }));

    expect(
      await screen.findByText("Confira os dados preenchidos e tente novamente."),
    ).toBeInTheDocument();
  });
});
