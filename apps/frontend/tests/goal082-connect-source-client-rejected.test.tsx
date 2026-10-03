// @vitest-environment jsdom
/**
 * Goal082 (WU-02): para a pessoa, a identificação do app recusada pelo portal
 * (`MINHA_AGENDA_CLIENT_REJECTED`) é a mesma coisa que a configuração ausente:
 * falha da Atendly, não dos dados informados. Nenhum dos dois textos pede e-mail,
 * senha nem conferência. `MINHA_AGENDA_AUTH_FAILED` continua pedindo para
 * conferir e-mail e senha.
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";
import { ConnectSourceScreen } from "@/features/imports/ConnectSourceScreen";

const connectIntegration = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration },
    migration: { getImportState: vi.fn(), startImport: vi.fn() },
  }),
}));

const UNAVAILABLE_TEXT =
  "A importação está indisponível agora por uma falha da Atendly, não por causa dos dados informados. Tente novamente mais tarde.";

async function connectRejectedWith(code: string, status: number) {
  const user = userEvent.setup();
  connectIntegration.mockRejectedValue(
    new BffHttpError({
      code: "UPSTREAM_ERROR",
      details: { upstreamCode: code },
      message: `raw upstream message for ${code}`,
      requestId: "req-1",
      status,
    }),
  );
  render(<ConnectSourceScreen onConnected={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Continuar" }));
  await user.type(
    await screen.findByLabelText("E-mail do Minha Agenda"),
    "camila@example.com",
  );
  await user.type(screen.getByLabelText("Senha do Minha Agenda"), "super-secret");
  await user.click(screen.getByRole("button", { name: "Conectar Minha Agenda" }));
  return (await screen.findByRole("alert")).textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("MINHA_AGENDA_CLIENT_REJECTED mostra o mesmo texto de MINHA_AGENDA_NOT_CONFIGURED", async () => {
  const rejected = await connectRejectedWith("MINHA_AGENDA_CLIENT_REJECTED", 503);
  expect(rejected).toBe(UNAVAILABLE_TEXT);

  cleanup();
  const notConfigured = await connectRejectedWith(
    "MINHA_AGENDA_NOT_CONFIGURED",
    503,
  );
  expect(notConfigured).toBe(rejected);
});

test("nenhum dos dois textos de falha da Atendly cita senha, e-mail nem pede conferência", async () => {
  const rejected = await connectRejectedWith("MINHA_AGENDA_CLIENT_REJECTED", 503);
  expect(rejected).not.toMatch(/senha|e-mail|Confira/i);
  expect(rejected).not.toMatch(/MINHA_AGENDA_|UPSTREAM_ERROR|\b\d{3}\b/);
});

test("MINHA_AGENDA_AUTH_FAILED continua pedindo para conferir e-mail e senha", async () => {
  const text = await connectRejectedWith("MINHA_AGENDA_AUTH_FAILED", 422);
  expect(text).toBe(
    "Não foi possível entrar no Minha Agenda com esses dados. Confira o e-mail e a senha.",
  );
});
